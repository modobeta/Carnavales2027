import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../api/http.js";
import { AdminCompetenciaPage } from "../pages/AdminCompetenciaPage.jsx";
import { JuradosPorJornadaSection } from "../features/JuradosPorJornadaSection.jsx";

vi.mock("../api/http.js", () => ({ apiRequest: vi.fn() }));

// Spec 040 T3 (E-2): un error de carga inicial se muestra como error con «Reintentar», no como vacío.
const event = { id: "e1", name: "Evento", status: "CONFIGURING", active: true };
const readiness = { ready: false, missing: [], incompleteTroupes: [], incompleteRubrics: [], incompleteSchedules: [], incompleteNominations: [], nightsWithoutJury: [] };
const data = {
  troupes: [{ id: "t1", name: "Estrella", categoryId: "c1", active: true }],
  categories: [{ id: "c1", name: "Comparsa", code: "COMPARSA", displayOrder: 1, active: true }],
  specialties: [{ id: "s1", name: "Danza", code: "DANZA", displayOrder: 1, active: true }],
  rubrics: [],
  nights: [{ id: "n1", name: "Primera noche", kind: "COMPETITION" }],
};

// Falla la ruta indicada hasta que `healthy.value` pase a verdadero (simula el reintento exitoso).
function mockApi(failingSuffix) {
  const healthy = { value: false };
  apiRequest.mockImplementation(async (path) => {
    const bare = path.split("?")[0];
    if (!healthy.value && bare.endsWith(failingSuffix)) throw new Error("timeout");
    if (bare.endsWith("/readiness")) return readiness;
    if (bare.endsWith("/troupes")) return data.troupes;
    if (bare.endsWith("/categories")) return data.categories;
    if (bare.endsWith("/specialties")) return data.specialties;
    if (bare.endsWith("/rubrics")) return data.rubrics;
    if (bare.endsWith("/nights")) return data.nights;
    if (bare.endsWith("/judge-assignments")) return { quotas: [], assignments: [] };
    if (bare === "/api/v1/judges") return [];
    return [];
  });
  return healthy;
}

describe("AdminCompetenciaPage: errores de carga con Reintentar (spec 040 T3)", () => {
  afterEach(() => {
    cleanup();
    vi.resetAllMocks();
  });

  it("progreso del asistente: error con reintento en lugar de cero", async () => {
    const healthy = mockApi("/troupes");
    render(<AdminCompetenciaPage event={event} initialStep="revision" />);
    const alert = await screen.findByText("No se pudo cargar el resumen de la preparación.");
    expect(screen.queryByText("0 comparsas")).not.toBeInTheDocument();
    healthy.value = true;
    fireEvent.click(within(alert.closest("[role=alert]")).getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("1 comparsas")).toBeInTheDocument();
    expect(screen.queryByText("No se pudo cargar el resumen de la preparación.")).not.toBeInTheDocument();
  });

  it("sección Comparsas: error con reintento, sin «Sin comparsas»", async () => {
    const healthy = mockApi("/troupes");
    render(<AdminCompetenciaPage event={event} />);
    const block = screen.getByRole("region", { name: "Bloque 2 de 3: Comparsas" });
    const alert = await within(block).findByRole("alert");
    expect(alert).toHaveTextContent("No se pudieron cargar las comparsas.");
    expect(within(block).queryByText("Sin comparsas para los filtros actuales.")).not.toBeInTheDocument();
    healthy.value = true;
    fireEvent.click(within(alert).getByRole("button", { name: "Reintentar" }));
    expect(await within(block).findByText("Estrella")).toBeInTheDocument();
  });

  it("sección Tipos de participación: error con reintento, sin «Todavía no hay»", async () => {
    const healthy = mockApi("/categories");
    render(<AdminCompetenciaPage event={event} />);
    const block = screen.getByRole("region", { name: "Bloque 1 de 3: Tipos de participación" });
    const alert = await within(block).findByRole("alert");
    expect(alert).toHaveTextContent("No se pudieron cargar los tipos de participación.");
    expect(within(block).queryByText("Todavía no hay tipos de participación.")).not.toBeInTheDocument();
    healthy.value = true;
    fireEvent.click(within(alert).getByRole("button", { name: "Reintentar" }));
    expect(await within(block).findByText("Comparsa")).toBeInTheDocument();
  });

  it("sección Especialidades: error con reintento, sin «Todavía no hay»", async () => {
    const healthy = mockApi("/specialties");
    render(<AdminCompetenciaPage event={event} initialStep="jurados" />);
    const block = screen.getByRole("region", { name: "Gestión de especialidades" });
    const alert = await within(block).findByRole("alert");
    expect(alert).toHaveTextContent("No se pudieron cargar las especialidades.");
    expect(within(block).queryByText("Todavía no hay especialidades.")).not.toBeInTheDocument();
    healthy.value = true;
    fireEvent.click(within(alert).getByRole("button", { name: "Reintentar" }));
    expect(await within(block).findByText("Danza")).toBeInTheDocument();
  });

  it("Evaluación: un fallo de comparsas se informa sin ocultar el editor de rubros", async () => {
    mockApi("/troupes");
    render(<AdminCompetenciaPage event={event} initialStep="rubros" />);
    expect(await screen.findByRole("button", { name: "Crear primer rubro" })).toBeInTheDocument();
    expect(screen.getByText(/No se pudieron cargar datos complementarios: comparsas/)).toBeInTheDocument();
    expect(screen.queryByText("No se pudo cargar la configuración de evaluación.")).not.toBeInTheDocument();
  });

  it("resumen de Evaluación no cuenta huérfanos como cero cuando falla su lectura", async () => {
    mockApi("/orphaned-criteria");
    render(<AdminCompetenciaPage event={event} initialStep="rubros" />);
    const summary = await screen.findByRole("region", { name: "Resumen de evaluación" });
    expect(within(summary).getByText("Criterios descriptivos por comprobar.")).toBeInTheDocument();
    expect(within(summary).queryByText(/No hay criterios descriptivos pendientes/)).not.toBeInTheDocument();
  });

  it("Orden de pasada: un fallo al cargar jornadas no queda como «Cargando» ni vacío", async () => {
    const healthy = mockApi("/nights");
    render(<AdminCompetenciaPage event={event} />);
    const block = screen.getByRole("region", { name: "Orden de pasada por jornada" });
    const alert = await within(block).findByRole("alert");
    expect(alert).toHaveTextContent("No se pudieron cargar las jornadas.");
    expect(within(block).queryByText("Cargando jornadas...")).not.toBeInTheDocument();
    healthy.value = true;
    fireEvent.click(within(alert).getByRole("button", { name: "Reintentar" }));
    expect(await within(block).findByRole("combobox", { name: "Jornada para el orden de pasada" })).toBeInTheDocument();
  });
});

describe("JuradosPorJornadaSection: padrón de jurados (spec 040 T3)", () => {
  afterEach(() => {
    cleanup();
    vi.resetAllMocks();
  });

  it("un fallo de /api/v1/judges se muestra como error con reintento, no como padrón vacío", async () => {
    const healthy = mockApi("/api/v1/judges");
    render(<JuradosPorJornadaSection event={event} onOpenSpecialties={() => {}} onDataChanged={() => {}} />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("No se pudieron cargar las asignaciones del evento.");
    healthy.value = true;
    fireEvent.click(within(alert).getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Primera noche", { exact: false })).toBeInTheDocument();
  });
});
