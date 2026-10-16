import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../api/http.js";
import { AdminCompetenciaPage } from "../pages/AdminCompetenciaPage.jsx";

vi.mock("../api/http.js", () => ({ apiRequest: vi.fn() }));

const event = { id: "e1", name: "Evento asignado", status: "CONFIGURING", active: true };
const readiness = { ready: true, missing: [], incompleteTroupes: [], incompleteRubrics: [], incompleteSchedules: [], incompleteNominations: [], nightsWithoutJury: [] };
const forbidden = ["/specialties", "/rubrics", "/orphaned-criteria", "/schedule", "/judge-assignments", "/judge-quota", "/api/v1/judges"];

function mockApi(currentReadiness = readiness) {
  apiRequest.mockImplementation(async (path) => {
    if (path.endsWith("/readiness")) return currentReadiness;
    if (path.endsWith("/troupes")) return [{ id: "t1", name: "Estrella", categoryId: "c1", active: true }];
    if (path.endsWith("/categories")) return [{ id: "c1", name: "Comparsa", code: "COMPARSA", displayOrder: 1, active: true }];
    return [];
  });
}
const calledPaths = () => apiRequest.mock.calls.map(([path]) => path);
const expectNoForbiddenCalls = () => {
  for (const path of calledPaths()) for (const fragment of forbidden) expect(path).not.toContain(fragment);
};

describe("AdminCompetenciaPage en modo ADMIN_EVENT (spec 040 T2)", () => {
  afterEach(() => {
    cleanup();
    vi.resetAllMocks();
  });

  it("muestra solo Participantes y Revisión final, con el contador sobre los pasos visibles", async () => {
    mockApi();
    render(<AdminCompetenciaPage event={event} eventAdminMode />);
    const stepper = screen.getByRole("navigation", { name: "Pasos de configuración de competencia" });
    const steps = within(stepper).getAllByRole("button");
    expect(steps).toHaveLength(2);
    expect(steps[0]).toHaveAccessibleName(/^Paso 1 de 2: Participantes/);
    expect(steps[1]).toHaveAccessibleName(/^Paso 2 de 2: Revisi/);
    expect(screen.getByText("Paso 1 de 2")).toBeInTheDocument();
    expect(within(stepper).queryByText("Jurados")).not.toBeInTheDocument();
    expect(within(stepper).queryByText("Evaluación")).not.toBeInTheDocument();
    await screen.findByText("Estrella");
    expectNoForbiddenCalls();
  });

  it("Participantes queda en consulta, sin pestaña de orden de pasada ni controles de cambio", async () => {
    mockApi();
    render(<AdminCompetenciaPage event={event} eventAdminMode />);
    await screen.findByText("Estrella");
    expect(screen.queryByRole("tab", { name: "Orden de pasada por jornada" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Nueva comparsa/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Nuevo tipo/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Editar / })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Eliminar / })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Reactivar / })).not.toBeInTheDocument();
  });

  it.each([
    ["jurados", ""],
    ["jurados", "asignaciones"],
    ["rubros", ""],
  ])("la URL directa a step=%s tab=%s cae en Participantes sin consultar rutas rechazadas", async (initialStep, initialTab) => {
    mockApi();
    render(<AdminCompetenciaPage event={event} eventAdminMode initialStep={initialStep} initialTab={initialTab} />);
    expect(screen.getByRole("heading", { name: "Participantes", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("Paso 1 de 2")).toBeInTheDocument();
    await screen.findByText("Estrella");
    expectNoForbiddenCalls();
  });

  it("el pie no ofrece abrir la competencia ni ir a control de votación", async () => {
    mockApi();
    render(<AdminCompetenciaPage event={event} eventAdminMode initialStep="revision" />);
    await waitFor(() => expect(calledPaths().some((path) => path.endsWith("/readiness"))).toBe(true));
    const footer = screen.getByRole("navigation", { name: "Navegación del asistente" });
    expect(within(footer).queryByRole("button", { name: /Abrir competencia/ })).not.toBeInTheDocument();
    expect(within(footer).queryByRole("link", { name: /Control de votación/ })).not.toBeInTheDocument();
    fireEvent.click(within(footer).getByRole("button", { name: /Volver a comparsas/ }));
    expect(screen.getByRole("heading", { name: "Participantes", level: 2 })).toBeInTheDocument();
  });

  it("el resumen de Revisión final no ofrece pasos ocultos ni cifras no consultadas", async () => {
    mockApi();
    render(<AdminCompetenciaPage event={event} eventAdminMode initialStep="revision" />);
    const summary = await screen.findByRole("region", { name: "Resumen de la preparación" });
    await within(summary).findByText("1 comparsas");
    expect(within(summary).queryByRole("button", { name: "Ver jurados" })).not.toBeInTheDocument();
    expect(within(summary).queryByRole("button", { name: "Ver evaluación" })).not.toBeInTheDocument();
    expect(within(summary).queryByText(/especialidades|rubros|criterios de puntuación/)).not.toBeInTheDocument();
    expect(within(summary).queryByText("Paso 3")).not.toBeInTheDocument();
    expectNoForbiddenCalls();
  });

  it("la guía de Participantes informa los pendientes sin indicar acciones no disponibles", async () => {
    mockApi({ ...readiness, ready: false, missing: ["ACTIVE_TROUPE"], incompleteTroupes: [{ name: "Estrella" }], incompleteNominations: [{ rubricName: "Reina", troupeName: "Estrella" }] });
    render(<AdminCompetenciaPage event={event} eventAdminMode />);
    const guidance = await screen.findByText(/No hay comparsas activas/);
    expect(guidance.textContent).not.toMatch(/Creá|Elegí|Cargá|activá/);
    expect(guidance.textContent).toMatch(/Estrella no tiene una categoría activa/);
    expect(guidance.textContent).toMatch(/administrador general/);
  });

  it("ADMIN conserva los cuatro pasos y los controles", async () => {
    mockApi();
    render(<AdminCompetenciaPage event={event} />);
    const stepper = screen.getByRole("navigation", { name: "Pasos de configuración de competencia" });
    expect(within(stepper).getAllByRole("button")).toHaveLength(4);
    expect(screen.getByText("Paso 1 de 4")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Orden de pasada por jornada" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Nueva comparsa/ })).toBeInTheDocument();
  });
});
