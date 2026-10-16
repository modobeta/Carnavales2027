import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiRequest } from "../api/http.js";
import { SessionContext } from "../auth/session-context.jsx";
import { EventConfigurationPage } from "../pages/EventConfigurationPage.jsx";

vi.mock("../api/http.js", async (importOriginal) => ({ ...(await importOriginal()), apiRequest: vi.fn() }));

// Spec 040 T6: renombrar el evento con modal (ADMIN_EVENT y ADMIN, E-1), una única operación HTTP.
const readiness = { ready: false, missing: [], incompleteTroupes: [], incompleteRubrics: [], incompleteSchedules: [], incompleteNominations: [], nightsWithoutJury: [] };
const event = { id: "e1", name: "Goya 2027", status: "CONFIGURING", active: true };

function mockApi(patch) {
  apiRequest.mockImplementation(async (path, options) => {
    if (options?.method === "PATCH") return patch(path, options);
    if (path.endsWith("/readiness")) return readiness;
    return [];
  });
}
const patchCalls = () => apiRequest.mock.calls.filter(([, options]) => options?.method === "PATCH");
const readinessCalls = () => apiRequest.mock.calls.filter(([path]) => path.endsWith("/readiness")).length;

function rename(value) {
  fireEvent.change(screen.getByLabelText("Nombre del evento"), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar evento" }));
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe.each([
  ["ADMIN_EVENT", true],
  ["ADMIN", false],
])("renombrar evento como %s", (_label, eventAdminMode) => {
  it("pide confirmación y cancelar no hace la solicitud", async () => {
    mockApi(async () => ({ ...event, name: "Nuevo" }));
    render(<EventConfigurationPage event={event} eventAdminMode={eventAdminMode} />);
    rename("Nuevo");
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Nuevo");
    expect(patchCalls()).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(patchCalls()).toHaveLength(0);
  });

  it("confirmar envía una sola solicitud con solo el nombre y vuelve a consultar la preparación", async () => {
    mockApi(async () => ({ ...event, name: "Nuevo" }));
    render(<EventConfigurationPage event={event} eventAdminMode={eventAdminMode} />);
    await waitFor(() => expect(readinessCalls()).toBe(1));
    rename("Nuevo");
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(screen.getAllByText("Cambios guardados.").length).toBeGreaterThan(0));
    expect(patchCalls()).toEqual([["/api/v1/events/e1", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ name: "Nuevo" }) })]]);
    await waitFor(() => expect(readinessCalls()).toBe(2));
  });

  it.each([
    [new ApiError({ status: 409, code: "EVENT_LOCKED" }), "El evento esta abierto y su configuracion ya no puede modificarse."],
    [new TypeError("Failed to fetch"), "No se pudo guardar. Reintentá."],
  ])("un rechazo o fallo (%s) se informa sin éxito simulado", async (error, text) => {
    mockApi(async () => { throw error; });
    render(<EventConfigurationPage event={event} eventAdminMode={eventAdminMode} />);
    rename("Nuevo");
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Guardar cambios" }));
    expect((await screen.findAllByText(text)).length).toBeGreaterThan(0);
    expect(screen.queryByText("Cambios guardados.")).not.toBeInTheDocument();
  });
});

describe("renombrar evento: rechazo de autorización y límites", () => {
  it("un 403 ADMIN_REQUIRED de ADMIN_EVENT reconsulta /me (T5)", async () => {
    mockApi(async () => { throw new ApiError({ status: 403, code: "ADMIN_REQUIRED" }); });
    const refresh = vi.fn(async () => ({ status: "authenticated", roles: [], adminEvents: [{ id: "e1" }] }));
    render(
      <SessionContext.Provider value={{ status: "authenticated", roles: [], adminEvents: [{ id: "e1" }], refresh }}>
        <EventConfigurationPage event={event} eventAdminMode />
      </SessionContext.Provider>,
    );
    rename("Nuevo");
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Cambios guardados.")).not.toBeInTheDocument();
  });

  it.each([
    [{ ...event, active: false }],
    [{ ...event, status: "OPEN" }],
  ])("ADMIN_EVENT no puede renombrar un evento inactivo o abierto (%o)", (target) => {
    mockApi(async () => target);
    render(<EventConfigurationPage event={target} eventAdminMode />);
    expect(screen.queryByRole("button", { name: "Guardar evento" })).not.toBeInTheDocument();
  });
});
