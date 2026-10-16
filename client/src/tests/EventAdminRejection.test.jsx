import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiRequest } from "../api/http.js";
import { SessionContext } from "../auth/session-context.jsx";
import { reactToEventAdminRejection } from "../auth/useEventAdminRejection.js";
import { AdminEventProvider } from "../context/AdminEventContext.jsx";
import { AdminEventsPage } from "../pages/AdminEventsPage.jsx";
import { AdminCompetenciaPage } from "../pages/AdminCompetenciaPage.jsx";

vi.mock("../api/http.js", async (importOriginal) => ({ ...(await importOriginal()), apiRequest: vi.fn() }));

// Spec 040 T5 (RF-7): ante 403 ADMIN_REQUIRED, una sola reconsulta de /me y salida si ya no está asignado.
const forbidden = () => new ApiError({ status: 403, code: "ADMIN_REQUIRED" });
const assigned = { id: "e1", name: "Asignado", status: "CONFIGURING", active: true };
const baseSession = { status: "authenticated", user: { id: "u1", name: "Admin evento" }, roles: [], adminEvents: [{ id: "e1" }] };

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  window.localStorage.clear();
  window.location.hash = "";
});

describe("reactToEventAdminRejection", () => {
  it.each([
    [new ApiError({ status: 401, code: "UNAUTHENTICATED" })],
    [new ApiError({ status: 403, code: "TWO_FACTOR_REQUIRED" })],
    [new ApiError({ status: 500, code: "INTERNAL_ERROR" })],
    [new Error("timeout")],
  ])("no aplica a otros errores (%s): siguen las guardias existentes", async (error) => {
    const refreshSession = vi.fn();
    const leaveEvent = vi.fn();
    expect(await reactToEventAdminRejection({ error, eventId: "e1", refreshSession, leaveEvent })).toBe("not-applicable");
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it("si el evento ya no figura en /me, sale del evento", async () => {
    const refreshSession = vi.fn(async () => ({ ...baseSession, adminEvents: [] }));
    const leaveEvent = vi.fn();
    expect(await reactToEventAdminRejection({ error: forbidden(), eventId: "e1", refreshSession, leaveEvent })).toBe("revoked");
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(leaveEvent).toHaveBeenCalledTimes(1);
  });

  it("si el evento sigue figurando (p. ej. desactivado), se queda", async () => {
    const refreshSession = vi.fn(async () => ({ ...baseSession, adminEvents: [{ id: "e1", active: false }] }));
    const leaveEvent = vi.fn();
    expect(await reactToEventAdminRejection({ error: forbidden(), eventId: "e1", refreshSession, leaveEvent })).toBe("still-assigned");
    expect(leaveEvent).not.toHaveBeenCalled();
  });

  it("si falla /me, no lo trata como revocación", async () => {
    const refreshSession = vi.fn(async () => ({ status: "error", roles: [], adminEvents: [] }));
    const leaveEvent = vi.fn();
    expect(await reactToEventAdminRejection({ error: forbidden(), eventId: "e1", refreshSession, leaveEvent })).toBe("refresh-failed");
    expect(leaveEvent).not.toHaveBeenCalled();
  });
});

function renderEventsPage(refresh) {
  const session = { ...baseSession, refresh };
  window.localStorage.setItem("carnavales.event.u1.event-admin", "e1");
  return render(
    <SessionContext.Provider value={session}>
      <AdminEventProvider session={session} eventAdminArea>
        <AdminEventsPage eventAdminMode />
      </AdminEventProvider>
    </SessionContext.Provider>,
  );
}

describe("AdminEventsPage: rechazo al cargar jornadas", () => {
  it("revocado: una reconsulta de /me, sale del contexto y vuelve a Inicio", async () => {
    apiRequest.mockImplementation(async (path) => {
      if (path === "/api/v1/events") return [assigned];
      if (path.endsWith("/nights")) throw forbidden();
      return [];
    });
    const refresh = vi.fn(async () => ({ ...baseSession, adminEvents: [] }));
    window.location.hash = "#/admin/events";
    renderEventsPage(refresh);
    await waitFor(() => expect(window.location.hash).toBe("#/admin/home"));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem("carnavales.event.u1.event-admin")).toBeNull();
  });

  it("sigue asignado: se queda, refresca el catálogo y ofrece reintentar sin repetir /me en bucle", async () => {
    apiRequest.mockImplementation(async (path) => {
      if (path === "/api/v1/events") return [assigned];
      if (path.endsWith("/nights")) throw forbidden();
      return [];
    });
    const refresh = vi.fn(async () => ({ ...baseSession, adminEvents: [{ id: "e1" }] }));
    window.location.hash = "#/admin/events";
    renderEventsPage(refresh);
    expect(await screen.findByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    await waitFor(() => expect(apiRequest.mock.calls.filter(([path]) => path === "/api/v1/events").length).toBeGreaterThanOrEqual(2));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe("#/admin/events");
  });

  it("ADMIN no reconsulta /me ante un rechazo", async () => {
    apiRequest.mockImplementation(async (path) => {
      if (path === "/api/v1/events") return [assigned];
      if (path.endsWith("/nights")) throw forbidden();
      return [];
    });
    const refresh = vi.fn();
    const session = { ...baseSession, roles: ["ADMIN"], refresh };
    render(
      <SessionContext.Provider value={session}>
        <AdminEventProvider session={session}><AdminEventsPage /></AdminEventProvider>
      </SessionContext.Provider>,
    );
    expect(await screen.findByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("AdminCompetenciaPage: rechazos simultáneos", () => {
  it("varias cargas rechazadas a la vez producen una sola reconsulta de /me", async () => {
    apiRequest.mockImplementation(async () => { throw forbidden(); });
    const refresh = vi.fn(async () => ({ ...baseSession, adminEvents: [] }));
    const session = { ...baseSession, refresh };
    window.location.hash = "#/admin/competencia";
    render(
      <SessionContext.Provider value={session}>
        <AdminCompetenciaPage event={assigned} eventAdminMode initialStep="revision" />
      </SessionContext.Provider>,
    );
    await waitFor(() => expect(window.location.hash).toBe("#/admin/home"));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
