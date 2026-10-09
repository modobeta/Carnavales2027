import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../api/http.js";
import {
  createPendingEventOpenOperation,
  readPendingEventOpenOperation,
  reconcilePendingEventOpenOperation,
  resolvePendingEventOpenOperation,
  savePendingEventOpenOperation,
} from "./event-open-operation.js";

vi.mock("../api/http.js", () => ({ apiRequest: vi.fn() }));

const operation = (eventId, operationId) => ({
  eventId,
  intent: "OPEN_EVENT",
  operationId,
});

describe("event open operation persistence", () => {
  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("restores the original operation after reload and keeps separate event references", () => {
    savePendingEventOpenOperation(operation("event-a", "operation-a"));
    savePendingEventOpenOperation(operation("event-b", "operation-b"));

    expect(readPendingEventOpenOperation("event-a")).toEqual(operation("event-a", "operation-a"));
    expect(readPendingEventOpenOperation("event-b")).toEqual(operation("event-b", "operation-b"));
    expect(localStorage.getItem("event-open-operation:event-a")).not.toMatch(/token|cookie|secret/i);
  });

  it("does not replace an unresolved operation id for the same event", () => {
    const original = operation("event-a", "operation-a");
    savePendingEventOpenOperation(original);

    expect(savePendingEventOpenOperation(operation("event-a", "replacement-id"))).toEqual(original);
    expect(readPendingEventOpenOperation("event-a")).toEqual(original);
  });

  it("creates an operation id once and reuses it while the operation remains unresolved", () => {
    const first = createPendingEventOpenOperation("event-a");
    const second = createPendingEventOpenOperation("event-a");

    expect(first).toMatchObject({ eventId: "event-a", intent: "OPEN_EVENT" });
    expect(first.operationId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(second).toEqual(first);
  });

  it("does not manufacture a replacement id when the stored reference cannot be read", () => {
    localStorage.setItem("event-open-operation:event-a", "{invalid json");

    expect(() => savePendingEventOpenOperation(operation("event-a", "replacement-id"))).toThrow();
    expect(localStorage.getItem("event-open-operation:event-a")).toBe("{invalid json");
  });

  it.each([
    ["pending", { status: "pending" }],
    ["not-registered", { status: "not_registered" }],
  ])("retains the original key and blocks resolution for %s", async (_name, expected) => {
    const saved = operation("event-a", "operation-a");
    savePendingEventOpenOperation(saved);
    apiRequest.mockResolvedValue({
      operationId: saved.operationId,
      eventId: saved.eventId,
      intent: saved.intent,
      status: expected.status === "not_registered" ? undefined : "pending",
    });
    if (expected.status === "not_registered") {
      apiRequest.mockRejectedValueOnce({ code: "OPEN_OPERATION_NOT_FOUND", status: 404 });
    }

    await expect(reconcilePendingEventOpenOperation("event-a")).resolves.toMatchObject(expected);
    expect(readPendingEventOpenOperation("event-a")).toEqual(saved);
    expect(apiRequest).toHaveBeenCalledWith(
      "/api/v1/events/event-a/open-operations/operation-a",
    );
  });

  it.each(["applied", "rejected"])("clears the reference only after backend terminal %s", async (status) => {
    const saved = operation("event-a", "operation-a");
    savePendingEventOpenOperation(saved);
    apiRequest.mockResolvedValue({ ...saved, status });

    await expect(reconcilePendingEventOpenOperation("event-a")).resolves.toMatchObject({ status });
    expect(readPendingEventOpenOperation("event-a")).toBeNull();
  });

  it("clears only the matching operation after a terminal response from the opening request", () => {
    const saved = operation("event-a", "operation-a");
    savePendingEventOpenOperation(saved);

    expect(resolvePendingEventOpenOperation("event-a", { ...saved, status: "pending" })).toBe(false);
    expect(resolvePendingEventOpenOperation("event-a", { ...saved, operationId: "other-id", status: "applied" })).toBe(false);
    expect(readPendingEventOpenOperation("event-a")).toEqual(saved);

    expect(resolvePendingEventOpenOperation("event-a", { ...saved, status: "applied" })).toBe(true);
    expect(readPendingEventOpenOperation("event-a")).toBeNull();
  });

  it("keeps the operation and blocks on a conflicting or mismatched lookup", async () => {
    const saved = operation("event-a", "operation-a");
    savePendingEventOpenOperation(saved);
    apiRequest.mockRejectedValue({ code: "IDEMPOTENCY_CONFLICT", status: 409 });

    await expect(reconcilePendingEventOpenOperation("event-a")).resolves.toMatchObject({ status: "conflict" });
    expect(readPendingEventOpenOperation("event-a")).toEqual(saved);
  });

  it("does not clear an operation if the lookup response is for a different intention", async () => {
    const saved = operation("event-a", "operation-a");
    savePendingEventOpenOperation(saved);
    apiRequest.mockResolvedValue({ ...saved, eventId: "event-b", status: "applied" });

    await expect(reconcilePendingEventOpenOperation("event-a")).resolves.toMatchObject({ status: "conflict" });
    expect(readPendingEventOpenOperation("event-a")).toEqual(saved);
  });

  it("does not query an event snapshot or manufacture a replacement operation when no reference exists", async () => {
    await expect(reconcilePendingEventOpenOperation("event-a")).resolves.toEqual({ status: "none" });
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
