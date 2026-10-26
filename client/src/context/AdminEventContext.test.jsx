import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useRef, useState } from "react";
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

function GuardProbe() {
  const context = useAdminEvent();
  const pending = useRef(null);
  const unregister = useRef(null);
  const [prompts, setPrompts] = useState(0);
  useEffect(() => {
    if (!context.loading && !unregister.current) {
      unregister.current = context.registerEventChangeGuard((commit) => {
        pending.current = commit;
        setPrompts((value) => value + 1);
        return true;
      });
    }
  }, [context.loading]);
  useEffect(() => () => unregister.current?.(), []);
  return <div>
    <span>{`actual:${context.activeEventId || "-"} nombre:${context.activeEvent?.name || "-"} noche:${context.activeNightId || "-"} avisos:${prompts} carga:${context.loading}`}</span>
    <button onClick={() => context.setActiveNightId("n1")}>Elegir noche</button>
    <button onClick={() => void context.refreshEvents()}>Refrescar</button>
    <button onClick={() => context.setActiveEvent({ id: "e2", name: "Nuevo" })}>Seleccionar desde contexto</button>
    <button onClick={() => context.setActiveEvent({ id: "e1", name: "Renombrado" })}>Actualizar mismo evento</button>
    <button onClick={() => { pending.current = null; }}>Permanecer</button>
    <button onClick={() => { pending.current?.(); pending.current = null; }}>Descartar</button>
  </div>;
}

const contextSession = { status: "authenticated", user: { id: "u1" }, roles: ["ADMIN"] };
const storedKey = "carnavales.event.u1.operational";
const catalog = [{ id: "e1", name: "Original" }, { id: "e2", name: "Segundo" }];

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

  it("refreshEvents que pierde el evento actual espera la decisión sin borrar evento, noche ni storage", async () => {
    apiRequest.mockResolvedValueOnce(catalog).mockResolvedValueOnce([catalog[1]]);
    render(<AdminEventProvider session={contextSession}><GuardProbe /></AdminEventProvider>);
    await screen.findByText(/actual:e1.*carga:false/);
    fireEvent.click(screen.getByRole("button", { name: "Elegir noche" }));
    fireEvent.click(screen.getByRole("button", { name: "Refrescar" }));
    await screen.findByText(/actual:e1.*noche:n1.*avisos:1.*carga:false/);
    expect(window.localStorage.getItem(storedKey)).toBe("e1");
    fireEvent.click(screen.getByRole("button", { name: "Permanecer" }));
    expect(screen.getByText(/actual:e1.*noche:n1/)).toBeInTheDocument();
    expect(window.localStorage.getItem(storedKey)).toBe("e1");
    // New refresh uses the current context, not the discarded pending callback.
    apiRequest.mockResolvedValueOnce([catalog[1]]);
    fireEvent.click(screen.getByRole("button", { name: "Refrescar" }));
    await screen.findByText(/avisos:2.*carga:false/);
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
    expect(screen.getByText(/actual:e2.*noche:-/)).toBeInTheDocument();
    expect(window.localStorage.getItem(storedKey)).toBe("e2");
  });

  it("refreshEvents fallido no borra contexto antes de decidir, ni durante Permanecer", async () => {
    apiRequest.mockResolvedValueOnce(catalog).mockRejectedValueOnce(new Error("offline"));
    render(<AdminEventProvider session={contextSession}><GuardProbe /></AdminEventProvider>);
    await screen.findByText(/actual:e1.*carga:false/);
    fireEvent.click(screen.getByRole("button", { name: "Elegir noche" }));
    fireEvent.click(screen.getByRole("button", { name: "Refrescar" }));
    await screen.findByText(/actual:e1.*noche:n1.*avisos:1.*carga:false/);
    fireEvent.click(screen.getByRole("button", { name: "Permanecer" }));
    expect(window.localStorage.getItem(storedKey)).toBe("e1");
    expect(screen.getByText(/actual:e1.*noche:n1/)).toBeInTheDocument();
    apiRequest.mockRejectedValueOnce(new Error("offline"));
    fireEvent.click(screen.getByRole("button", { name: "Refrescar" }));
    await screen.findByText(/avisos:2.*carga:false/);
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
    expect(screen.getByText(/actual:-.*noche:-/)).toBeInTheDocument();
    expect(window.localStorage.getItem(storedKey)).toBeNull();
  });

  it("setActiveEvent cambia solo tras descartar; actualizar el mismo evento o refrescarlo no avisa", async () => {
    apiRequest.mockResolvedValueOnce(catalog).mockResolvedValueOnce([{ id: "e1", name: "Actualizado" }, catalog[1]]);
    render(<AdminEventProvider session={contextSession}><GuardProbe /></AdminEventProvider>);
    await screen.findByText(/actual:e1.*carga:false/);
    fireEvent.click(screen.getByRole("button", { name: "Elegir noche" }));
    fireEvent.click(screen.getByRole("button", { name: "Actualizar mismo evento" }));
    expect(screen.getByText(/actual:e1 nombre:Renombrado noche:n1 avisos:0/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refrescar" }));
    await screen.findByText(/actual:e1 nombre:Actualizado noche:n1 avisos:0.*carga:false/);
    fireEvent.click(screen.getByRole("button", { name: "Seleccionar desde contexto" }));
    expect(screen.getByText(/actual:e1.*noche:n1 avisos:1/)).toBeInTheDocument();
    expect(window.localStorage.getItem(storedKey)).toBe("e1");
    fireEvent.click(screen.getByRole("button", { name: "Permanecer" }));
    expect(screen.getByText(/actual:e1.*noche:n1/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Seleccionar desde contexto" }));
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
    expect(screen.getByText(/actual:e2 nombre:Nuevo noche:-/)).toBeInTheDocument();
    expect(window.localStorage.getItem(storedKey)).toBe("e2");
  });
});
