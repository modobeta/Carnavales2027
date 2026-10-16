import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminEventProvider, useAdminEvent } from "./AdminEventContext.jsx";
import { apiRequest } from "../api/http.js";

vi.mock("../api/http.js", () => ({ apiRequest: vi.fn() }));

function Probe() {
  const context = useAdminEvent();
  return <div><select aria-label="Evento activo" value={context.activeEventId} onChange={(event) => context.setActiveEventId(event.target.value)}>{context.events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}</select><span>{context.activeEvent?.name ?? "Sin evento"}</span></div>;
}

function StatusProbe() {
  const context = useAdminEvent();
  return <span>{`eventos:${context.events.length} error:${context.error || "-"}`}</span>;
}

describe("AdminEventContext", () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); window.localStorage.clear(); });

  it("ADMIN carga el catálogo global y permite cambiar el evento", async () => {
    apiRequest.mockResolvedValue([{ id: "e1", name: "Carnaval 2027" }, { id: "e2", name: "Prueba 2027" }]);
    render(<AdminEventProvider session={{ status: "authenticated", user: { id: "u1" }, roles: ["ADMIN"], adminEvents: [] }}><Probe /></AdminEventProvider>);
    const selector = await screen.findByRole("combobox", { name: "Evento activo" });
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/events");
    expect(selector).toHaveValue("e1");
    fireEvent.change(selector, { target: { value: "e2" } });
    expect(selector).toHaveValue("e2");
    expect(window.localStorage.getItem("carnavales.event.u1.operational")).toBe("e2");
  });

  it("adminEvents no concede catálogo a una sesión sin ADMIN", async () => {
    render(<AdminEventProvider session={{ status: "authenticated", user: { id: "u1" }, roles: [], adminEvents: [{ id: "e1" }] }}><StatusProbe /></AdminEventProvider>);
    await waitFor(() => expect(screen.getByText("eventos:0 error:-")).toBeInTheDocument());
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("mantiene el catálogo propio de los roles operativos", async () => {
    apiRequest.mockResolvedValue([{ id: "e9", name: "Propio del rol" }]);
    render(<AdminEventProvider session={{ status: "authenticated", user: { id: "u1" }, roles: ["COMISARIO"], adminEvents: [{ id: "e1" }] }}><StatusProbe /></AdminEventProvider>);
    expect(await screen.findByText("eventos:1 error:-")).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/penalties/events");
  });
});
