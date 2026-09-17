import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../api/http.js";
import { AdminVotingPage } from "../pages/AdminVotingPage.jsx";

vi.mock("../api/http.js", () => ({ apiRequest: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

function setup({ eventStatus = "OPEN", nightStatus = "DRAFT", votingStatus = "NOT_OPEN", failure } = {}) {
  const night = { id: "n1", name: "Primera noche", kind: "COMPETITION", displayOrder: 1, eventDate: "2027-02-01", status: nightStatus };
  let windowStatus = votingStatus;
  apiRequest.mockImplementation(async (path, options) => {
    if (path === "/api/v1/events") return [{ id: "e1", name: "Carnaval", status: eventStatus }];
    if (path.endsWith("/nights")) return [{ ...night }];
    if (path.endsWith("/voting/status")) return { nightId: "n1", nightStatus: night.status, votingStatus: windowStatus, counts: {}, total: 0 };
    if (path.endsWith("/voting/ballots")) return [];
    if (options?.method === "PATCH") {
      if (failure) throw { code: failure };
      night.status = "OPEN";
      return { ...night };
    }
    if (path.endsWith("/voting/open")) {
      if (failure) throw { code: failure };
      windowStatus = "OPEN";
      return { ballotsCreated: 0 };
    }
    throw new Error(`Unexpected ${path}`);
  });
  render(<AdminVotingPage />);
}

describe("apertura de jornada y votación", () => {
  it("abre jornada y votación tras confirmar", async () => {
    setup();
    const openButton = await screen.findByRole("button", { name: "Abrir votación" });
    await waitFor(() => expect(openButton).toBeEnabled());
    fireEvent.click(openButton);
    expect(apiRequest.mock.calls.some(([, options]) => options?.method === "PATCH")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(apiRequest.mock.calls.some(([, options]) => options?.method === "PATCH")).toBe(false);
    fireEvent.click(openButton);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(await screen.findByText(/Votación abierta. 0 planilla/)).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/nights/n1", { method: "PATCH", body: JSON.stringify({ name: "Primera noche", displayOrder: 1, kind: "COMPETITION", eventDate: "2027-02-01", status: "OPEN" }) });
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/events/e1/nights/n1/voting/open", { method: "POST" });
    expect(await screen.findByRole("alert")).toHaveTextContent("no hay planillas");
    expect(screen.getByRole("button", { name: "Habilitar planillas pendientes" })).toBeInTheDocument();
  });

  it.each([
    { eventStatus: "CONFIGURING" },
    { nightStatus: "CLOSED" },
    { nightStatus: "OPEN", votingStatus: "CLOSED" },
  ])("impide aperturas inválidas %j", async (state) => {
    setup(state);
    expect(await screen.findByRole("button", { name: "Abrir votación" })).toBeDisabled();
  });

  it("no anuncia éxito si la API rechaza abrir jornada", async () => {
    setup({ failure: "EVENT_LOCKED" });
    const button = await screen.findByRole("button", { name: "Abrir votación" });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(await screen.findByText(/El estado del evento o la jornada cambió/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir votación" })).toBeEnabled();
  });

  it("muestra el bloqueo por cronograma vacío al intentar abrir votación", async () => {
    setup({ nightStatus: "OPEN", failure: "NIGHT_SCHEDULE_EMPTY" });
    const button = await screen.findByRole("button", { name: "Abrir votación" });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(await screen.findByText("Programá comparsas en la jornada antes de abrir la votación.")).toBeInTheDocument();
  });
});
