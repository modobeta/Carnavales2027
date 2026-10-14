import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../api/http.js";
import { loadAvailableEvents } from "../context/available-events.js";
import { AdminEventProvider } from "../context/AdminEventContext.jsx";
import { AppNavigation } from "../components/AppNavigation.jsx";
import { JudgeHomePage } from "../pages/JudgeHomePage.jsx";
import { VeedorMonitorPage } from "../pages/VeedorMonitorPage.jsx";

vi.mock("../api/http.js", () => ({ apiRequest: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); localStorage.clear(); window.location.hash = ""; });

describe("identidad y selección de evento", () => {
  it.each([
    ["ADMIN", "/api/v1/events", "Administrador"],
    ["COMISARIO", "/api/v1/penalties/events", "Comisario"],
    ["ESCRIBANO", "/api/v1/results/events", "Escribano"],
    ["SCRUTINEER", "/api/v1/results/events", "Escrutador"],
    ["VEEDOR", "/api/v1/monitor/events", "Veedor"],
  ])("conserva el acceso de %s y muestra rol y evento", async (role, endpoint, label) => {
    apiRequest.mockImplementation(async (path) => path === endpoint ? [{ id: "e1", name: "Carnaval Uno" }, { id: "e2", name: "Carnaval Dos" }] : { events: [] });
    const session = { user: { id: "u1", name: "Persona" }, roles: [role] };
    render(<AdminEventProvider session={session}><AppNavigation session={session} /></AdminEventProvider>);
    expect(screen.getByText(label)).toHaveClass("session-role");
    const selector = screen.getByRole("button", { name: "Evento actual" });
    await waitFor(() => expect(selector).toHaveTextContent("Carnaval Uno"));
    fireEvent.click(selector);
    fireEvent.click(screen.getByRole("option", { name: "Carnaval Dos" }));
    expect(document.querySelector(".session-event")).toHaveTextContent("Carnaval Dos");
    expect(localStorage.getItem("carnavales.event.u1.operational")).toBe("e2");
  });

  it("deduplica asignaciones activas sin listar eventos de otros jueces", async () => {
    apiRequest.mockResolvedValue({ assignments: [
      { eventId: "e1", eventName: "Uno", status: "ACTIVE" },
      { eventId: "e1", eventName: "Uno", status: "ACTIVE" },
      { eventId: "e2", eventName: "Revocado", status: "REVOKED" },
    ] });
    expect(await loadAvailableEvents(["JUDGE"])).toEqual([{ id: "e1", name: "Uno" }]);
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/judge/profile");
  });

  it("filtra las planillas del juez al cambiar evento sin mezclar progreso", async () => {
    apiRequest.mockImplementation(async (path) => {
      if (path === "/api/v1/judge/profile") return { assignments: [1, 2].map((n) => ({ eventId: `e${n}`, eventName: `Evento ${n}`, status: "ACTIVE" })) };
      if (path.includes("judge/ballots")) return [1, 2].map((n) => ({ id: `b${n}`, eventId: `e${n}`, eventName: `Evento ${n}`, nightName: "Noche", status: "OPEN", totalScores: 1, resolvedScores: 0, troupes: [{ troupeId: `t${n}`, troupeName: `Comparsa ${n}`, total: 1, resolved: 0 }] }));
      return { events: [] };
    });
    const session = { user: { id: "j1", name: "Juez Uno" }, roles: ["JUDGE"], judgeProfile: { registrationStatus: "REGISTERED" } };
    render(<AdminEventProvider session={session} judgeArea><AppNavigation session={session} /><JudgeHomePage session={session} /></AdminEventProvider>);
    await screen.findAllByText("Comparsa 1");
    expect(screen.queryByText("Comparsa 2")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Evento actual" }));
    fireEvent.click(screen.getByRole("option", { name: "Evento 2" }));
    await screen.findAllByText("Comparsa 2");
    expect(screen.queryByText("Comparsa 1")).not.toBeInTheDocument();
  });

  it("no ofrece crear evento ni copy de administración al jurado", async () => {
    apiRequest.mockImplementation(async (path) => {
      if (path === "/api/v1/judge/profile") return { assignments: [{ eventId: "e1", eventName: "Evento 1", status: "ACTIVE" }] };
      return { events: [] };
    });
    const session = { user: { id: "j1", name: "Juez Uno" }, roles: ["JUDGE"], judgeProfile: { registrationStatus: "REGISTERED" } };
    render(<AdminEventProvider session={session} judgeArea><AppNavigation session={session} /></AdminEventProvider>);
    const selector = await screen.findByRole("button", { name: "Evento actual" });
    await waitFor(() => expect(selector).toHaveTextContent("Evento 1"));
    fireEvent.click(selector);
    expect(screen.queryByRole("button", { name: /Crear nuevo evento/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/querés administrar/)).not.toBeInTheDocument();
    expect(screen.getByText(/sobre el que querés trabajar/)).toBeInTheDocument();
  });

  it("sincroniza supervisión con el selector global", async () => {
    apiRequest.mockImplementation(async (path) => path === "/api/v1/public/events" ? { events: [] } : [1, 2].map((n) => ({ id: `e${n}`, name: `Evento ${n}`, nights: [{ id: `n${n}`, name: `Jornada ${n}`, votingStatus: "OPEN", counts: {}, total: 0 }] })));
    const session = { user: { id: "v1", name: "Persona" }, roles: ["VEEDOR"] };
    render(<AdminEventProvider session={session}><AppNavigation session={session} /><VeedorMonitorPage /></AdminEventProvider>);
    await screen.findByRole("heading", { name: "Jornada 1" });
    fireEvent.click(screen.getByRole("button", { name: "Evento actual" }));
    fireEvent.click(screen.getByRole("option", { name: "Evento 2" }));
    expect(await screen.findByRole("heading", { name: "Jornada 2" })).toBeInTheDocument();
  });

  it("no reutiliza selección ajena y bloquea el selector si falla la API", async () => {
    localStorage.setItem("carnavales.event.otro.operational", "e2");
    apiRequest.mockRejectedValue(new Error("offline"));
    const session = { user: { id: "u1", name: "Persona" }, roles: ["COMISARIO"] };
    render(<AdminEventProvider session={session}><AppNavigation session={session} /></AdminEventProvider>);
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron cargar los eventos");
    expect(screen.getByRole("button", { name: "Evento actual" })).toBeDisabled();
    expect(document.querySelector(".session-event")).toHaveTextContent("Sin eventos disponibles");
  });
});
