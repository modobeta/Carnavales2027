import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../api/http.js";
import { eventAdminReadinessItems } from "../features/readiness-presentation.js";
import { EventReadinessPanel } from "../features/EventReadinessPanel.jsx";
import { EventConfigurationPage } from "../pages/EventConfigurationPage.jsx";
import { AdminCompetenciaPage } from "../pages/AdminCompetenciaPage.jsx";

vi.mock("../api/http.js", () => ({ apiRequest: vi.fn() }));
vi.mock("../components/Notifications.jsx", () => ({ useNotify: () => ({ notify: vi.fn() }) }));

// Spec 040 T4: readiness clasificado por quién lo resuelve, sin apertura ni votación, y configuración en solo lectura.
const fullReadiness = {
  ready: false,
  missing: ["COMPETITION_NIGHT", "ACTIVE_TROUPE", "ACTIVE_SPECIALTY", "ACTIVE_RUBRIC", "INCOMPLETE_SCHEDULES", "INCOMPLETE_NOMINATIONS", "NIGHTS_WITHOUT_JURY"],
  incompleteTroupes: [{ id: "t1", name: "Estrella" }],
  incompleteRubrics: [{ id: "r1", name: "Coreografía" }],
  incompleteSchedules: [{ nightId: "n1", nightName: "Primera noche" }],
  incompleteNominations: [{ rubricId: "r1", rubricName: "Reina", troupeId: "t1", troupeName: "Estrella" }],
  nightsWithoutJury: [{ nightId: "n1", nightName: "Primera noche" }],
};
const readyReadiness = { ...fullReadiness, ready: true, missing: [], incompleteTroupes: [], incompleteRubrics: [], incompleteSchedules: [], incompleteNominations: [], nightsWithoutJury: [] };
const event = { id: "e1", name: "Evento asignado", status: "CONFIGURING", active: true };
const ACTION_WORDS = /Creá|Programá|Asigná|Cargá|Corregir|Configurar|activá|Elegí/;

function mockApi(readiness) {
  apiRequest.mockImplementation(async (path) => {
    if (path.endsWith("/readiness")) return readiness;
    if (path.endsWith("/troupes")) return [{ id: "t1", name: "Estrella", categoryId: "c1", active: true }];
    if (path.endsWith("/categories")) return [{ id: "c1", name: "Comparsa", active: true }];
    return [];
  });
}
const calledPaths = () => apiRequest.mock.calls.map(([path]) => path);
const expectNoReservedCalls = () => {
  for (const path of calledPaths()) {
    expect(path).not.toMatch(/\/open$|\/open-operations|\/voting\/status/);
  }
};

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  window.localStorage.clear();
});

describe("eventAdminReadinessItems", () => {
  it("clasifica cada bloqueo sin indicar acciones que ADMIN_EVENT no tiene", () => {
    const items = eventAdminReadinessItems(fullReadiness);
    const byKey = Object.fromEntries(items.map((item) => [item.key, item]));
    expect(byKey["missing-COMPETITION_NIGHT"].resolvableHere).toBe(true);
    expect(items.filter((item) => item.resolvableHere)).toHaveLength(1);
    for (const item of items) expect(item.text).not.toMatch(ACTION_WORDS);
    for (const key of ["missing-ACTIVE_SPECIALTY", "missing-ACTIVE_RUBRIC", "rubric-r1", "nomination-r1-t1", "jury-n1"]) {
      expect(byKey[key].text).toMatch(/administrador general/);
    }
    expect(byKey["troupe-t1"].text).toBe("La comparsa «Estrella» no tiene una categoría activa.");
    expect(byKey["schedule-n1"].text).toBe("La jornada «Primera noche» no tiene comparsas programadas.");
    expect(items.some((item) => /INCOMPLETE_|NIGHTS_WITHOUT_JURY/.test(item.key))).toBe(false);
  });

  it("un código desconocido no se expone ni se atribuye a nadie", () => {
    const [item] = eventAdminReadinessItems({ ...readyReadiness, ready: false, missing: ["NUEVO_CODIGO"] });
    expect(item.text).toBe("Hay un requisito pendiente que no se pudo identificar.");
    expect(item.resolvableHere).toBe(false);
  });

  it("no inventa bloqueos con readiness no interpretable", () => {
    expect(eventAdminReadinessItems(null)).toEqual([]);
    expect(eventAdminReadinessItems({ ready: true })).toEqual([]);
  });
});

describe("EventReadinessPanel en modo ADMIN_EVENT", () => {
  it("solo ofrece «Ir al problema» para la jornada de competencia, sin enlaces ni apertura", async () => {
    mockApi(fullReadiness);
    const onGoToNights = vi.fn();
    render(<EventReadinessPanel event={event} eventAdminMode onGoToNights={onGoToNights} />);
    await screen.findByText(/no tiene una categoría activa/);
    const panel = screen.getByRole("heading", { name: "Requisitos para abrir el evento" }).closest("section");
    expect(within(panel).getAllByRole("button", { name: "Ir al problema" })).toHaveLength(1);
    expect(panel.querySelectorAll("a")).toHaveLength(0);
    expect(within(panel).queryByRole("button", { name: /Abrir evento/ })).not.toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "Ir al problema" }));
    expect(onGoToNights).toHaveBeenCalled();
    expectNoReservedCalls();
  });

  it("con readiness listo no ofrece abrir y aclara quién lo hace", async () => {
    mockApi(readyReadiness);
    render(<EventReadinessPanel event={event} eventAdminMode />);
    expect(await screen.findByText(/La apertura la realiza el administrador general/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Abrir evento/ })).not.toBeInTheDocument();
    expectNoReservedCalls();
  });

  it("una operación de apertura pendiente de otra cuenta no se consulta, no se muestra ni se borra", async () => {
    const stored = JSON.stringify({ eventId: "e1", intent: "OPEN_EVENT", operationId: "op-1" });
    window.localStorage.setItem("event-open-operation:e1", stored);
    mockApi(readyReadiness);
    render(<EventReadinessPanel event={event} eventAdminMode />);
    await screen.findByText(/La apertura la realiza el administrador general/);
    expect(screen.queryByRole("button", { name: /Consultar resultado de apertura/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/intento de apertura/)).not.toBeInTheDocument();
    expect(window.localStorage.getItem("event-open-operation:e1")).toBe(stored);
    expectNoReservedCalls();
  });

  it("sin bloqueos detallados no informa «0 pendientes» si el evento no está listo", async () => {
    mockApi({ ...readyReadiness, ready: false, missing: ["INCOMPLETE_SCHEDULES"] });
    render(<EventReadinessPanel event={event} eventAdminMode />);
    expect(await screen.findByText("Hay requisitos pendientes para abrir.")).toBeInTheDocument();
    expect(screen.queryByText(/pendientes para abrir: 0/)).not.toBeInTheDocument();
  });

  it("ADMIN conserva el botón de apertura", async () => {
    mockApi(readyReadiness);
    render(<EventReadinessPanel event={event} />);
    expect(await screen.findByRole("button", { name: "Abrir evento" })).toBeEnabled();
  });
});

describe("EventConfigurationPage en modo ADMIN_EVENT", () => {
  const nights = [{ id: "n1", name: "Primera noche", kind: "COMPETITION", status: "OPEN", displayOrder: 1 }];

  it("es de solo lectura: sin guardar evento ni controles de jornadas", async () => {
    mockApi(fullReadiness);
    render(<EventConfigurationPage event={event} nights={nights} eventAdminMode />);
    expect(screen.getByText("Primera noche")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar evento" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Agregar jornada/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Editar jornada/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Eliminar jornada/ })).not.toBeInTheDocument();
    await screen.findByText(/no tiene una categoría activa/);
  });

  it("con el evento abierto no ofrece «Finalizar jornada» ni consulta el estado de votación", async () => {
    mockApi(readyReadiness);
    render(<EventConfigurationPage event={{ ...event, status: "OPEN" }} nights={nights} eventAdminMode />);
    await waitFor(() => expect(calledPaths().some((path) => path.endsWith("/readiness"))).toBe(true));
    expect(screen.queryByRole("button", { name: /Finalizar jornada/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Abrí y cerrá la votación/)).not.toBeInTheDocument();
    expectNoReservedCalls();
  });

  it("un evento inactivo se identifica como solo consulta", async () => {
    mockApi(fullReadiness);
    render(<EventConfigurationPage event={{ ...event, active: false }} nights={nights} eventAdminMode />);
    expect(screen.getByText(/Evento inactivo: solo consulta/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar evento" })).not.toBeInTheDocument();
    await screen.findByText(/no tiene una categoría activa/);
  });

  it("ADMIN conserva sus controles", async () => {
    mockApi(fullReadiness);
    render(<EventConfigurationPage event={event} nights={nights} />);
    expect(screen.getByRole("button", { name: "Guardar evento" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Agregar jornada/ })).toBeInTheDocument();
    expect((await screen.findAllByText(/Asigná al menos un jurado activo/)).length).toBeGreaterThan(0);
  });
});

describe("Revisión final en modo ADMIN_EVENT", () => {
  it("con bloqueos muestra la lista clasificada y solo el enlace a Jornadas", async () => {
    mockApi(fullReadiness);
    render(<AdminCompetenciaPage event={event} eventAdminMode initialStep="revision" />);
    const list = await screen.findByRole("list", { name: "Requisitos pendientes para abrir el evento" });
    expect(list.textContent).not.toMatch(ACTION_WORDS);
    const links = within(list).getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "#/admin/events");
    expect(screen.queryByText(/resolvé los bloqueos/)).not.toBeInTheDocument();
    expectNoReservedCalls();
  });

  it("listo para abrir: sin «Abrir competencia» y con el aviso del administrador general", async () => {
    mockApi(readyReadiness);
    render(<AdminCompetenciaPage event={event} eventAdminMode initialStep="revision" />);
    expect(await screen.findByText(/La apertura la realiza el administrador general/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Abrir competencia/ })).not.toBeInTheDocument();
  });

  it.each([
    ["OPEN", [], []],
    ["CLOSED", [], []],
    ["OPEN", ["SCRUTINEER"], ["#/admin/results"]],
    ["CLOSED", ["ESCRIBANO"], ["#/admin/results"]],
  ])("evento %s con roles %j: enlaces solo por rol propio", async (status, ownRoles, expectedLinks) => {
    mockApi(readyReadiness);
    render(<AdminCompetenciaPage event={{ ...event, status }} eventAdminMode ownRoles={ownRoles} initialStep="revision" />);
    const banner = await screen.findByRole("region", { name: "Estado de la competencia" });
    expect(within(banner).queryAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(expectedLinks);
    expect(document.querySelector('a[href="#/admin/voting"]')).toBeNull();
  });

  it("ADMIN con el evento abierto conserva sus enlaces", async () => {
    mockApi(readyReadiness);
    render(<AdminCompetenciaPage event={{ ...event, status: "OPEN" }} initialStep="revision" />);
    const banner = await screen.findByRole("region", { name: "Estado de la competencia" });
    expect(within(banner).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["#/admin/voting", "#/admin/results"]);
  });
});
