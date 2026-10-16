import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiRequest } from "../api/http.js";
import { EventConfigurationPage } from "../pages/EventConfigurationPage.jsx";

vi.mock("../api/http.js", async (importOriginal) => ({ ...(await importOriginal()), apiRequest: vi.fn() }));

const event = { id: "e1", name: "Goya 2027", status: "CONFIGURING", active: true };
const competitionNight = { id: "n1", name: "Noche 1", displayOrder: 1, kind: "COMPETITION", eventDate: null };
const awardsNight = { id: "n2", name: "Premiación", displayOrder: 2, kind: "AWARDS", eventDate: null };
const readiness = {
  ready: false,
  missing: ["INCOMPLETE_SCHEDULES"],
  incompleteTroupes: [], incompleteRubrics: [],
  incompleteSchedules: [{ nightId: "n1", nightName: "Noche 1" }],
  incompleteNominations: [], nightsWithoutJury: [],
};
const deleteCalls = () => apiRequest.mock.calls.filter(([, options]) => options?.method === "DELETE");

function mockApi({ readinessResult = readiness, remove = async () => ({ id: "n1" }) } = {}) {
  apiRequest.mockImplementation(async (path, options) => {
    if (options?.method === "DELETE") return remove(path, options);
    if (path.endsWith("/readiness")) return readinessResult;
    return [];
  });
}

function renderPage({ targetEvent = event, nights = [competitionNight], readinessResult = readiness, remove } = {}) {
  mockApi({ readinessResult, remove });
  return render(<EventConfigurationPage event={targetEvent} nights={nights} />);
}

async function confirmDelete(name = "Noche 1") {
  fireEvent.click(await screen.findByRole("button", { name: `Eliminar jornada ${name}` }));
  const dialog = await screen.findByRole("dialog", { name: `Eliminar ${name}` });
  fireEvent.click(within(dialog).getByRole("button", { name: "Eliminar jornada" }));
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("ADMIN puede solicitar eliminar jornadas de competencia y premiación", async () => {
  renderPage({ nights: [competitionNight, awardsNight] });
  expect(await screen.findByRole("button", { name: "Eliminar jornada Noche 1" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Eliminar jornada Premiación" })).toBeInTheDocument();
});

it("confirmar ejecuta un DELETE; la jornada desaparece solo después de la respuesta", async () => {
  renderPage();
  await confirmDelete();
  expect(deleteCalls()).toHaveLength(1);
  expect(deleteCalls()[0][0]).toBe("/api/v1/nights/n1");
  await waitFor(() => expect(screen.queryByText("Noche 1", { selector: "strong" })).not.toBeInTheDocument());
});

it.each([
  ["NIGHT_HAS_HISTORY", "Solo se pueden eliminar jornadas sin programación ni historial operativo."],
  ["EVENT_LOCKED", "El evento esta abierto y su configuracion ya no puede modificarse."],
])("explica el rechazo %s", async (code, message) => {
  renderPage({ remove: async () => { throw new ApiError({ status: code === "EVENT_LOCKED" ? 409 : 422, code }); } });
  await confirmDelete();
  expect(await screen.findByText(message)).toBeInTheDocument();
  expect(screen.getByText("Noche 1", { selector: "strong" })).toBeInTheDocument();
});
