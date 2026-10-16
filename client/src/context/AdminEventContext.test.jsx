import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminEventProvider, useAdminEvent } from "./AdminEventContext.jsx";
import { apiRequest } from "../api/http.js";

vi.mock("../api/http.js", () => ({ apiRequest: vi.fn() }));

function Probe() {
  const context = useAdminEvent();
  return (
    <div>
      <select aria-label="Evento activo" value={context.activeEventId} onChange={(event) => context.setActiveEventId(event.target.value)}>
        {context.events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
      </select>
      <span>{context.activeEvent?.name ?? "Sin evento"}</span>
    </div>
  );
}

function JourneyProbe() {
  const context = useAdminEvent();
  return (
    <div>
      <span>{context.activeNightId || "Sin jornada"}</span>
      <button type="button" onClick={() => context.setActiveNightId("night-2")}>Elegir jornada</button>
      <button type="button" onClick={() => context.setActiveEventId("e2")}>Cambiar evento</button>
    </div>
  );
}

function StatusProbe() {
  const context = useAdminEvent();
  return (
    <div>
      <span>{`eventos:${context.events.length} error:${context.error || "-"}`}</span>
      <button type="button" onClick={() => void context.refreshEvents()}>Reintentar</button>
    </div>
  );
}

describe("AdminEventContext", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("carga un evento activo y permite cambiarlo sin otra fuente de selección", async () => {
    apiRequest.mockResolvedValue([
      { id: "e1", name: "Carnaval 2027", status: "CONFIGURING" },
      { id: "e2", name: "Prueba 2027", status: "OPEN" },
    ]);

    render(<AdminEventProvider><Probe /></AdminEventProvider>);

    const selector = await screen.findByRole("combobox", { name: "Evento activo" });
    expect(selector).toHaveValue("e1");
    expect(screen.getAllByText("Carnaval 2027").length).toBeGreaterThan(0);

    fireEvent.change(selector, { target: { value: "e2" } });

    expect(selector).toHaveValue("e2");
    expect(screen.getAllByText("Prueba 2027").length).toBeGreaterThan(0);
    expect(window.localStorage.getItem("carnavales.admin.activeEventId")).toBe("e2");
  });

  it("carga para ADMIN_EVENT solo el catálogo autorizado y oculta inactivos", async () => {
    apiRequest.mockResolvedValue([
      { id: "e1", name: "Asignado activo", active: true },
      { id: "e2", name: "Asignado inactivo", active: false },
    ]);
    const session = { status: "authenticated", user: { id: "u1" }, roles: [], adminEvents: [{ id: "e1" }, { id: "e2" }] };

    render(<AdminEventProvider session={session} eventAdminArea><Probe /></AdminEventProvider>);

    const selector = await screen.findByRole("combobox", { name: "Evento activo" });
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/events");
    await screen.findByRole("option", { name: "Asignado activo" });
    expect(selector).toHaveValue("e1");
    expect(screen.queryByRole("option", { name: "Asignado inactivo" })).not.toBeInTheDocument();
  });

  it("ADMIN_EVENT con único evento inactivo queda sin eventos visibles y sin error", async () => {
    apiRequest.mockResolvedValue([{ id: "e2", name: "Asignado inactivo", active: false }]);
    const session = { status: "authenticated", user: { id: "u1" }, roles: [], adminEvents: [{ id: "e2", active: false }] };

    render(<AdminEventProvider session={session} eventAdminArea><StatusProbe /></AdminEventProvider>);

    expect(await screen.findByText("eventos:0 error:-")).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/events");
  });

  it("un fallo del catálogo de ADMIN_EVENT se informa como error con reintento", async () => {
    apiRequest.mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce([{ id: "e1", name: "Asignado" }]);
    const session = { status: "authenticated", user: { id: "u1" }, roles: [], adminEvents: [{ id: "e1" }] };

    render(<AdminEventProvider session={session} eventAdminArea><StatusProbe /></AdminEventProvider>);

    expect(await screen.findByText("eventos:0 error:No se pudieron cargar los eventos.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("eventos:1 error:-")).toBeInTheDocument();
  });

  it("descarta la respuesta tardía de una carga anterior", async () => {
    let resolveFirst;
    apiRequest
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce([{ id: "e2", name: "Nuevo" }]);
    const session = { status: "authenticated", user: { id: "u1" }, roles: [], adminEvents: [{ id: "e2" }] };

    render(<AdminEventProvider session={session} eventAdminArea><StatusProbe /></AdminEventProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("eventos:1 error:-")).toBeInTheDocument();
    resolveFirst([{ id: "e1", name: "Viejo" }, { id: "e3", name: "Otro" }]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByText("eventos:1 error:-")).toBeInTheDocument();
  });

  it.each([
    [["COMISARIO"], "/api/v1/penalties/events"],
    [["SCRUTINEER"], "/api/v1/results/events"],
    [["ESCRIBANO"], "/api/v1/results/events"],
    [["VEEDOR"], "/api/v1/monitor/events"],
  ])("fuera de #/admin/home %j con ADMIN_EVENT conserva el catálogo de su rol", async (roles, endpoint) => {
    apiRequest.mockResolvedValue([{ id: "e9", name: "Propio del rol" }]);
    const session = { status: "authenticated", user: { id: "u1" }, roles, adminEvents: [{ id: "e1" }] };

    render(<AdminEventProvider session={session}><StatusProbe /></AdminEventProvider>);

    expect(await screen.findByText("eventos:1 error:-")).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith(endpoint);
    expect(apiRequest).not.toHaveBeenCalledWith("/api/v1/events");
  });

  it("en #/admin/home un rol operativo con ADMIN_EVENT usa el catálogo administrativo", async () => {
    apiRequest.mockResolvedValue([{ id: "e1", name: "Asignado" }]);
    const session = { status: "authenticated", user: { id: "u1" }, roles: ["COMISARIO"], adminEvents: [{ id: "e1" }] };

    render(<AdminEventProvider session={session} eventAdminArea><StatusProbe /></AdminEventProvider>);

    expect(await screen.findByText("eventos:1 error:-")).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/events");
    expect(apiRequest).not.toHaveBeenCalledWith("/api/v1/penalties/events");
  });

  it("conserva la jornada elegida en el contexto de sesión y la limpia al cambiar evento", async () => {
    apiRequest.mockResolvedValue([
      { id: "e1", name: "Carnaval 2027", status: "CONFIGURING" },
      { id: "e2", name: "Prueba 2027", status: "OPEN" },
    ]);

    render(<AdminEventProvider><JourneyProbe /></AdminEventProvider>);
    await screen.findByText("Sin jornada");
    fireEvent.click(screen.getByRole("button", { name: "Elegir jornada" }));
    expect(screen.getByText("night-2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cambiar evento" }));
    expect(screen.getByText("Sin jornada")).toBeInTheDocument();
  });
});
