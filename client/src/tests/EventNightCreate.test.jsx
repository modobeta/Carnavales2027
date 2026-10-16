import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiRequest } from "../api/http.js";
import { SessionContext } from "../auth/session-context.jsx";
import { EventConfigurationPage } from "../pages/EventConfigurationPage.jsx";

vi.mock("../api/http.js", async (importOriginal) => ({ ...(await importOriginal()), apiRequest: vi.fn() }));

// Spec 040 T7: alta de jornada con modal (O-9, E-1), una única operación HTTP.
const readiness = { ready: false, missing: [], incompleteTroupes: [], incompleteRubrics: [], incompleteSchedules: [], incompleteNominations: [], nightsWithoutJury: [] };
const event = { id: "e1", name: "Goya 2027", status: "CONFIGURING", active: true };
const created = { id: "n1", name: "Noche 1", displayOrder: 1, kind: "COMPETITION", eventDate: null };

function mockApi(post) {
  apiRequest.mockImplementation(async (path, options) => {
    if (options?.method === "POST") return post(path, options);
    if (path.endsWith("/readiness")) return readiness;
    return [];
  });
}
const postCalls = () => apiRequest.mock.calls.filter(([, options]) => options?.method === "POST");
const readinessCalls = () => apiRequest.mock.calls.filter(([path]) => path.endsWith("/readiness")).length;

function submitNight(name = "Noche 1") {
  fireEvent.click(screen.getByRole("button", { name: "+ Agregar jornada" }));
  fireEvent.change(screen.getByLabelText("Nombre de jornada"), { target: { value: name } });
  fireEvent.click(screen.getByRole("button", { name: "Agregar jornada" }));
}
const confirmDialog = () => screen.findByRole("dialog", { name: "Confirmar nueva jornada" });

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe.each([
  ["ADMIN_EVENT", true],
  ["ADMIN", false],
])("alta de jornada como %s", (_label, eventAdminMode) => {
  it("pide confirmación y cancelar no hace la solicitud", async () => {
    mockApi(async () => created);
    render(<EventConfigurationPage event={event} eventAdminMode={eventAdminMode} />);
    submitNight();
    const dialog = await confirmDialog();
    expect(dialog).toHaveTextContent("Noche 1");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(postCalls()).toHaveLength(0);
    expect(screen.queryByText("Noche 1", { selector: "strong" })).not.toBeInTheDocument();
  });

  it("confirmar hace un solo POST, muestra la jornada tras la respuesta y vuelve a consultar la preparación", async () => {
    mockApi(async () => created);
    render(<EventConfigurationPage event={event} eventAdminMode={eventAdminMode} />);
    await waitFor(() => expect(readinessCalls()).toBe(1));
    submitNight();
    fireEvent.click(within(await confirmDialog()).getByRole("button", { name: "Confirmar alta" }));
    expect(await screen.findByText("Noche 1", { selector: "strong" })).toBeInTheDocument();
    expect(postCalls()).toEqual([["/api/v1/events/e1/nights", expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "Noche 1", displayOrder: 1, kind: "COMPETITION", eventDate: null }) })]]);
    await waitFor(() => expect(readinessCalls()).toBe(2));
  });

  it.each([
    [new ApiError({ status: 409, code: "RESOURCE_CONFLICT" }), "Ese nombre u orden ya está en uso."],
    [new ApiError({ status: 409, code: "EVENT_LOCKED" }), "El evento esta abierto y su configuracion ya no puede modificarse."],
    [new TypeError("Failed to fetch"), "No se pudo guardar. Reintentá."],
  ])("un rechazo o fallo (%s) se informa sin crear la jornada", async (error, text) => {
    mockApi(async () => { throw error; });
    render(<EventConfigurationPage event={event} eventAdminMode={eventAdminMode} />);
    submitNight();
    fireEvent.click(within(await confirmDialog()).getByRole("button", { name: "Confirmar alta" }));
    expect((await screen.findAllByText(text)).length).toBeGreaterThan(0);
    expect(screen.queryByText("Noche 1", { selector: "strong" })).not.toBeInTheDocument();
    expect(screen.queryByText("Failed to fetch")).not.toBeInTheDocument();
  });
});

describe("alta de jornada: autorización y límites", () => {
  it("un 403 ADMIN_REQUIRED de ADMIN_EVENT reconsulta /me (T5)", async () => {
    mockApi(async () => { throw new ApiError({ status: 403, code: "ADMIN_REQUIRED" }); });
    const refresh = vi.fn(async () => ({ status: "authenticated", roles: [], adminEvents: [{ id: "e1" }] }));
    render(
      <SessionContext.Provider value={{ status: "authenticated", roles: [], adminEvents: [{ id: "e1" }], refresh }}>
        <EventConfigurationPage event={event} eventAdminMode />
      </SessionContext.Provider>,
    );
    submitNight();
    fireEvent.click(within(await confirmDialog()).getByRole("button", { name: "Confirmar alta" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it.each([
    [{ ...event, active: false }],
    [{ ...event, status: "OPEN" }],
  ])("ADMIN_EVENT no ofrece alta con evento inactivo o abierto (%o)", (target) => {
    mockApi(async () => created);
    render(<EventConfigurationPage event={target} eventAdminMode />);
    expect(screen.queryByRole("button", { name: "+ Agregar jornada" })).not.toBeInTheDocument();
  });

  it("ADMIN_EVENT todavía no ve editar ni eliminar jornada (T8–T9)", () => {
    mockApi(async () => created);
    render(<EventConfigurationPage event={event} nights={[created]} eventAdminMode />);
    expect(screen.getByRole("button", { name: "+ Agregar jornada" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Editar jornada/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Eliminar jornada/ })).not.toBeInTheDocument();
  });
});
