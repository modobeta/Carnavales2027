import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminHomePage } from "./AdminHomePage.jsx";
import { apiRequest } from "../api/http.js";
import { AdminEventProvider } from "../context/AdminEventContext.jsx";

vi.mock("../api/http.js", () => ({ apiRequest: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const readinessIncomplete = {
  ready: false,
  missing: ["ACTIVE_TROUPE"],
  incompleteTroupes: [],
  incompleteRubrics: [{ id: "r1", name: "Coreografía" }],
  incompleteSchedules: [],
  incompleteNominations: [],
  nightsWithoutJury: [],
};

function mockAll({ readiness = readinessIncomplete, status = "CONFIGURING" } = {}) {
  apiRequest.mockImplementation((path) => {
    if (path === "/api/v1/events") return Promise.resolve([{ id: "e1", name: "Goya 2027", status }]);
    if (path === "/api/v1/events/e1/readiness") return Promise.resolve(readiness);
    if (path === "/api/v1/events/e1/nights") return Promise.resolve([{ id: "n1", kind: "COMPETITION" }]);
    if (path === "/api/v1/events/e1/troupes") return Promise.resolve([]);
    if (path === "/api/v1/events/e1/specialties") return Promise.resolve([{ id: "s1", active: true }]);
    if (path === "/api/v1/events/e1/rubrics") return Promise.resolve([]);
    if (path === "/api/v1/events/e1/judge-assignments") return Promise.resolve({ assignments: [] });
    if (path === "/api/v1/judges") return Promise.resolve([]);
    return Promise.reject(new Error(`unexpected ${path}`));
  });
}

function mockComplete({ status = "OPEN" } = {}) {
  apiRequest.mockImplementation((path) => {
    if (path === "/api/v1/events") return Promise.resolve([{ id: "e1", name: "Goya 2027", status }]);
    if (path === "/api/v1/events/e1/readiness") return Promise.resolve({ ready: true, missing: [], incompleteTroupes: [], incompleteRubrics: [], incompleteSchedules: [], incompleteNominations: [], nightsWithoutJury: [] });
    if (path === "/api/v1/events/e1/nights") return Promise.resolve([{ id: "n1", kind: "COMPETITION" }]);
    if (path === "/api/v1/events/e1/troupes") return Promise.resolve([{ id: "t1", name: "Ara Berá", active: true }]);
    if (path === "/api/v1/events/e1/specialties") return Promise.resolve([{ id: "s1", active: true }]);
    if (path === "/api/v1/events/e1/rubrics") return Promise.resolve([{ id: "r1", name: "Coreografía", active: true }]);
    if (path === "/api/v1/events/e1/judge-assignments") return Promise.resolve({ assignments: [{ id: "a1", status: "ACTIVE" }] });
    if (path === "/api/v1/judges") return Promise.resolve([{ id: "j1", registrationStatus: "REGISTERED" }]);
    return Promise.reject(new Error(`unexpected ${path}`));
  });
}

describe("AdminHomePage (Spec 027/B)", () => {
  it("deriva los cuatro pasos y alertas solo de readiness vigente, con faltantes por jornada", async () => {
    mockAll({ readiness: {
      ready: false,
      missing: ["INCOMPLETE_SCHEDULES", "NIGHTS_WITHOUT_JURY"],
      incompleteTroupes: [],
      incompleteRubrics: [],
      incompleteSchedules: [{ nightId: "n1", nightName: "Primera noche" }],
      incompleteNominations: [],
      nightsWithoutJury: [{ nightId: "n1", nightName: "Primera noche" }],
    } });
    render(<AdminHomePage />);

    expect(await screen.findByRole("heading", { name: "Goya 2027" })).toBeInTheDocument();
    expect((await screen.findAllByText("Incompleto", { selector: ".config-progress-state" })).length).toBeGreaterThan(0);
    expect(screen.getByText("Primera noche no tiene comparsas programadas")).toBeInTheDocument();
    expect(screen.getByText("Primera noche no tiene jurado asignado")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Configurar orden de pasada" })).toHaveAttribute("href", "#/admin/competencia");
    expect(screen.getByRole("link", { name: "Revisar asignaciones" })).toHaveAttribute("href", "#/admin/assignments");
    expect(screen.queryByRole("progressbar", { name: "Preparación del evento" })).not.toBeInTheDocument();
  });

  it("no declara pasos completos si readiness falla", async () => {
    mockAll();
    const request = apiRequest.getMockImplementation();
    apiRequest.mockImplementation((path) => path.endsWith("/readiness")
      ? Promise.reject(new Error("offline"))
      : request(path));
    render(<AdminHomePage />);

    expect((await screen.findAllByText("No disponible", { selector: ".config-progress-state" })).length).toBeGreaterThan(0);
    expect(screen.queryByText("Configuración completa")).not.toBeInTheDocument();
    expect(screen.getByText(/No se pudo consultar la preparación/)).toBeInTheDocument();
  });

  it("responde estado, progreso, próximo paso y problemas con deep-link", async () => {
    mockAll();
    render(<AdminHomePage />);
    expect(await screen.findByRole("heading", { name: "Goya 2027" })).toBeInTheDocument();
    expect(screen.getAllByText("En configuración").length).toBeGreaterThan(0);
    expect(await screen.findByRole("link", { name: "Participantes: Incompleto" })).toBeInTheDocument();
    expect(await screen.findByText("Próxima acción")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Corregir participantes" })).toHaveAttribute("href", "#/admin/competencia");
    expect(await screen.findByText("No hay comparsas activas")).toBeInTheDocument();
    const problemLinks = [...document.querySelectorAll(".admin-problem-list a")];
    expect(problemLinks[0]).toHaveAttribute("href", "#/admin/competencia");
    expect(problemLinks.length).toBe(2);
    // Solo lectura: 1 lista de eventos + readiness + 6 lecturas, cero escrituras.
    expect(apiRequest).toHaveBeenCalledTimes(8);
    expect(vi.mocked(apiRequest).mock.calls.every(([path, options]) => !options?.method || options.method === "GET")).toBe(true);
  });

  it("espera los datos del evento antes de mostrar el siguiente paso", async () => {
    mockAll();
    let finishNights;
    const nights = new Promise((resolve) => { finishNights = resolve; });
    const request = apiRequest.getMockImplementation();
    apiRequest.mockImplementation((path) => path === "/api/v1/events/e1/nights" ? nights : request(path));

    render(<AdminHomePage />);
    expect(await screen.findByRole("heading", { name: "Goya 2027" })).toBeInTheDocument();
    expect(screen.getByText("Cargando panel…")).toBeInTheDocument();
    expect(screen.queryByText("Próxima acción")).not.toBeInTheDocument();

    finishNights([{ id: "n1", kind: "COMPETITION" }]);
    expect(await screen.findByRole("link", { name: "Corregir participantes" })).toBeInTheDocument();
  });

  it("muestra resumen con contadores y accesos directos", async () => {
    mockAll();
    render(<AdminHomePage />);
    expect(await screen.findByRole("heading", { name: "Resumen" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Comparsas: 0\. Ver comparsas/ })).toHaveAttribute("href", "#/admin/competencia");
    expect(screen.getByRole("link", { name: /Jornadas: \d+\. Ver jornadas/ })).toHaveAttribute("href", "#/admin/events");
    expect(screen.getByRole("link", { name: /Jurados: 0\. Ver jurados/ })).toHaveAttribute("href", "#/admin/judges");
    expect(screen.getByRole("link", { name: /Rubros: 0\. Ver rubros/ })).toHaveAttribute("href", "#/admin/competencia");
    expect(screen.queryByRole("link", { name: "Agregar comparsa" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Registrar jurado" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Crear asignación" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Revisar configuración" })).not.toBeInTheDocument();
  });

  it("ordena el panel como resumen, preparación y bloqueos, sin acciones redundantes", async () => {
    mockAll();
    render(<AdminHomePage />);

    const summary = await screen.findByRole("heading", { name: "Resumen" });
    const preparation = screen.getByRole("heading", { name: "Preparación del evento" });
    const attention = screen.getByRole("heading", { name: "Requiere atención" });
    expect(summary.compareDocumentPosition(preparation) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(preparation.compareDocumentPosition(attention) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Acciones rápidas" })).not.toBeInTheDocument();
  });

  it("muestra estado completo cuando readiness está listo", async () => {
    mockComplete();
    render(<AdminHomePage />);
    const attention = await screen.findByRole("region", { name: "Requiere atención" });
    expect(within(attention).queryByText("La API no informa bloqueos oficiales de apertura.")).not.toBeInTheDocument();
    expect(screen.getByText("Próxima acción")).toBeInTheDocument();
    expect(screen.getAllByText("Competencia abierta").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Falta:/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Supervisar la votación" })).toHaveAttribute("href", "#/veedor");
  });

  it("consume el evento activo global del shell ADMIN", async () => {
    mockAll();
    render(<AdminEventProvider><AdminHomePage /></AdminEventProvider>);

    expect(await screen.findByRole("heading", { name: "Goya 2027" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Evento activo" })).not.toBeInTheDocument();
  });
});
