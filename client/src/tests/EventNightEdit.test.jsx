import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiRequest } from "../api/http.js";
import { EventConfigurationPage } from "../pages/EventConfigurationPage.jsx";

vi.mock("../api/http.js", async (importOriginal) => ({ ...(await importOriginal()), apiRequest: vi.fn() }));

const event = { id: "e1", name: "Goya 2027", status: "CONFIGURING", active: true };
const night = { id: "n1", name: "Noche 1", displayOrder: 1, kind: "COMPETITION", eventDate: null };
const readiness = { ready: false, missing: [], incompleteTroupes: [], incompleteRubrics: [], incompleteSchedules: [], incompleteNominations: [], nightsWithoutJury: [] };
const patchCalls = () => apiRequest.mock.calls.filter(([, options]) => options?.method === "PATCH");

function mockApi(patch) {
  apiRequest.mockImplementation(async (path, options) => {
    if (options?.method === "PATCH") return patch(path, options);
    if (path.endsWith("/readiness")) return readiness;
    return [];
  });
}

function openEdit(name = "Noche 1") {
  fireEvent.click(screen.getByRole("button", { name: `Editar jornada ${name}` }));
}

function submitEdit(name = "Noche 1 Editada") {
  openEdit();
  fireEvent.change(screen.getByLabelText("Nombre de jornada"), { target: { value: name } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar jornada" }));
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("edición de jornada como ADMIN", () => {
  it("pide confirmación antes de enviar PATCH y cancelar no envía nada", async () => {
    mockApi(async () => ({ ...night, name: "Noche 1 Editada" }));
    render(<EventConfigurationPage event={event} nights={[night]} />);
    submitEdit();

    const dialog = await screen.findByRole("dialog", { name: "Confirmar cambios de jornada" });
    expect(dialog).toHaveTextContent("Noche 1 Editada");
    expect(patchCalls()).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(patchCalls()).toHaveLength(0);
  });

  it("confirmar envía un solo PATCH sin estado de cierre y actualiza tras respuesta", async () => {
    mockApi(async () => ({ ...night, name: "Noche 1 Editada" }));
    render(<EventConfigurationPage event={event} nights={[night]} />);
    submitEdit();
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Confirmar cambios de jornada" }))
      .getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByText("Noche 1 Editada", { selector: "strong" })).toBeInTheDocument();
    expect(patchCalls()).toHaveLength(1);
    expect(patchCalls()[0][0]).toBe("/api/v1/nights/n1");
    expect(JSON.parse(patchCalls()[0][1].body)).not.toHaveProperty("status", "CLOSED");
  });

  it.each([
    [new ApiError({ status: 409, code: "EVENT_LOCKED" }), "El evento esta abierto y su configuracion ya no puede modificarse."],
    [new TypeError("Failed to fetch"), "No se pudo guardar. Reintentá."],
  ])("un rechazo se informa sin actualizar la jornada (%s)", async (error, message) => {
    mockApi(async () => { throw error; });
    render(<EventConfigurationPage event={event} nights={[night]} />);
    submitEdit();
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Confirmar cambios de jornada" }))
      .getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByText("Noche 1", { selector: "strong" })).toBeInTheDocument();
  });
});

it("ADMIN conserva la acción de edición en un evento inactivo mientras está en configuración", () => {
  mockApi(async () => night);
  render(<EventConfigurationPage event={{ ...event, active: false }} nights={[night]} />);
  expect(screen.getByRole("button", { name: "Editar jornada Noche 1" })).toBeInTheDocument();
});

it("ADMIN conserva Finalizar jornada y su modal existente", async () => {
  apiRequest.mockImplementation(async (path) => {
    if (path.endsWith("/voting/status")) return { votingStatus: "CLOSED" };
    if (path.endsWith("/readiness")) return readiness;
    return [];
  });
  render(<EventConfigurationPage event={{ ...event, status: "OPEN" }} nights={[{ ...night, status: "OPEN" }]} />);

  fireEvent.click(await screen.findByRole("button", { name: "Finalizar jornada Noche 1" }));
  expect(await screen.findByRole("dialog", { name: "Finalizar Noche 1" })).toBeInTheDocument();
  expect(patchCalls()).toHaveLength(0);
});
