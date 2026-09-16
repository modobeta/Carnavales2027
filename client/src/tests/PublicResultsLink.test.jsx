import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicResultsLink } from "../components/PublicResultsLink.jsx";
import { apiRequest } from "../api/http.js";

vi.mock("../api/http.js", () => ({ apiRequest: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.useRealTimers(); });

describe("enlace Resultados", () => {
  it("bloquea carga inicial y lista vacía sin destino navegable", async () => {
    apiRequest.mockResolvedValue({ events: [] });
    render(<PublicResultsLink currentRoute="#/judge" />);
    const link = screen.getByRole("link", { name: "Resultados" });
    expect(link).toHaveAttribute("aria-disabled", "true");
    expect(link).not.toHaveAttribute("href");
    fireEvent.click(link);
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));
    expect(link).toHaveClass("nav-link-disabled");
  });

  it("habilita dentro de la misma pestaña solamente con resultados publicados", async () => {
    apiRequest.mockResolvedValue({ events: [{ id: "event-1" }] });
    render(<PublicResultsLink currentRoute="#/judge" />);
    await waitFor(() => expect(screen.getByRole("link")).toHaveAttribute("href", "#/resultados"));
    expect(screen.getByRole("link")).not.toHaveAttribute("target");
    expect(screen.getByRole("link")).not.toHaveAttribute("aria-disabled");
  });

  it("detecta publicación posterior y deshabilita ante fallo, sin consultas tras desmontar", async () => {
    vi.useFakeTimers();
    apiRequest.mockResolvedValueOnce({ events: [] }).mockResolvedValueOnce({ events: [{ id: "event-1" }] }).mockRejectedValue(new Error("offline"));
    const { unmount } = render(<PublicResultsLink currentRoute="#/judge" />);
    await act(async () => {});
    expect(screen.getByRole("link")).toHaveAttribute("aria-disabled", "true");
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(screen.getByRole("link")).toHaveAttribute("href", "#/resultados");
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(screen.getByRole("link")).toHaveAttribute("aria-disabled", "true");
    unmount();
    await vi.advanceTimersByTimeAsync(60000);
    expect(apiRequest).toHaveBeenCalledTimes(3);
  });
});
