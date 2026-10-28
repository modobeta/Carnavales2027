import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { apiRequest } from "../api/http.js";
import { AdminCompetenciaPage as CompetitionPage } from "../pages/AdminCompetenciaPage.jsx";

function AdminCompetenciaPage(props) { return <CompetitionPage initialStep="participantes" {...props} />; }

vi.mock("../api/http.js", async (importOriginal) => ({ ...(await importOriginal()), apiRequest: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

const event = (id = "e1") => ({ id, name: id, status: "CONFIGURING" });
const specialties = [{ id: "s1", name: "Danza", active: true }, { id: "s2", name: "Música", active: true }];
const rubric = { id: "r1", name: "Vestuario", active: true, evaluationTarget: "TROUPE", rubricType: "NOMINATIVE", resolutionMethod: "JURY", items: [{ id: "i1", name: "Color", specialtyId: "s1", active: true }], criteria: [], nominations: [] };
const ready = (incompleteRubrics = []) => ({ ready: false, missing: [], incompleteTroupes: [], incompleteRubrics, incompleteNominations: [], incompleteSchedules: [], nightsWithoutJury: [] });
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const posts = () => apiRequest.mock.calls.filter(([, options]) => options?.method === "POST" && options?.body);

async function openCatalog() {
  fireEvent.click(screen.getByRole("button", { name: /^Rubros / }));
  fireEvent.click(await screen.findByRole("button", { name: "Agregar rubro" }));
}

function mockCatalog(overrides = {}) {
  apiRequest.mockImplementation(async (path, options) => {
    if (options?.method) return { id: "r2", name: "Nuevo", active: true, items: [], criteria: [] };
    const resource = path.split("?")[0].split("/").at(-1);
    const defaults = { specialties, rubrics: [rubric], readiness: ready(), troupes: [], categories: [], "orphaned-criteria": [] };
    return overrides[resource] ? overrides[resource](path) : structuredClone(defaults[resource] ?? []);
  });
}

it("nombra stepper y controles de evaluación con el texto visible más su contexto y estado", async () => {
  mockCatalog({ readiness: () => ({ ...ready(), ready: true }), "orphaned-criteria": () => [{ id: "c1", rubricId: "r1", rubricName: "Vestuario", description: "Claridad" }] });
  render(<AdminCompetenciaPage event={event()} initialStep="rubros" />);
  const nav = screen.getByRole("navigation", { name: "Pasos de configuración de competencia" });
  const first = await within(nav).findByRole("button", { name: "Comparsas Completo" });
  expect(first).toHaveAccessibleDescription(/Paso 4 de 6/);
  expect(within(nav).getByRole("button", { name: "Especialidades Completo" })).toHaveAccessibleDescription(/Paso 2 de 6/);
  expect(within(nav).getByRole("button", { name: "Asignar jurados Completo" })).toHaveAccessibleDescription(/Paso 5 de 6.*Asignación de jurados/);
  const current = within(nav).getByRole("button", { name: "Evaluación Completo" });
  expect(current).toHaveAttribute("aria-current", "step");
  expect(current).toHaveAccessibleDescription(/Paso 3 de 6/);
  expect(within(nav).getAllByRole("button")).toHaveLength(6);
  const card = await screen.findByRole("button", { name: "Ver criterios de Vestuario" });
  expect(card).toHaveAttribute("aria-expanded", "false");
  expect(within(card).getByText("▾")).toHaveAttribute("aria-hidden", "true");
  fireEvent.click(card);
  const collapse = screen.getByRole("button", { name: "Ocultar criterios de Vestuario" });
  expect(collapse).toHaveAttribute("aria-expanded", "true");
  expect(within(collapse).getByText("▴")).toHaveAttribute("aria-hidden", "true");
  const menu = screen.getByRole("button", { name: "Más opciones para Vestuario" });
  expect(menu).toHaveAttribute("aria-expanded", "false");
  expect(within(menu).getByText("Más opciones")).toBeVisible();
  fireEvent.click(menu);
  expect(menu).toHaveAttribute("aria-expanded", "true");
  expect(screen.getAllByRole("menu")).toHaveLength(1);
  fireEvent.click(menu);
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Vincular criterio Claridad" })).toBeInTheDocument();
});

it("stepper distingue falta de readiness sin perder nombre visible ni posición del paso", async () => {
  mockCatalog({ readiness: () => Promise.reject(new Error("offline")) });
  render(<AdminCompetenciaPage event={event()} initialStep="rubros" />);
  const nav = screen.getByRole("navigation", { name: "Pasos de configuración de competencia" });
  const current = await within(nav).findByRole("button", { name: "Evaluación No se pudo revisar" });
  expect(current).toHaveAccessibleDescription(/Paso 3 de 6/);
  expect(current).toHaveAttribute("aria-current", "step");
});

it("el botón de opciones conserva la altura táctil del sistema", () => {
  const css = readFileSync(resolve(__dirname, "../styles/competencia.css"), "utf8");
  expect(css).toMatch(/\.rubric-quick-menu-trigger\s*\{[^}]*min-block-size:\s*var\(--touch-target-min\);/s);
});

it("usa un token de texto, no el fondo translúcido, para el huérfano sobre superficie oscura", () => {
  const css = readFileSync(resolve(__dirname, "../styles/competencia.css"), "utf8");
  expect(css).toMatch(/\.overview-alert form span\s*\{\s*color:\s*var\(--text-primary\);\s*\}/);
});

it("una especialidad vacía orienta al catálogo y conserva el alta independiente", async () => {
  let entries = [];
  mockCatalog({ rubrics: () => entries });
  const read = apiRequest.getMockImplementation();
  apiRequest.mockImplementation(async (path, options) => {
    if (options?.method === "POST" && path === "/api/v1/events/e1/rubrics") {
      entries = [{ ...rubric, id: "r2", name: "Coreografía", items: [] }];
      return entries[0];
    }
    return read(path, options);
  });
  render(<AdminCompetenciaPage event={event()} initialStep="rubros" />);
  const empty = await screen.findByRole("heading", { name: "Todavía no configuraste qué se evalúa en Danza." });
  expect(empty).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Agregar rubro" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Ir a Rubros" }));
  fireEvent.click(screen.getByRole("button", { name: "Agregar rubro" }));
  const form = screen.getByRole("button", { name: "Crear rubro" }).closest("form");
  expect(within(form).getByLabelText("Nombre del rubro")).toHaveFocus();
  fireEvent.change(within(form).getByLabelText("Nombre del rubro"), { target: { value: "Coreografía" } });
  fireEvent.submit(form);
  await screen.findByRole("button", { name: "Ocultar opciones de Coreografía" });
  expect(screen.queryByText(/Rubro confirmado:/)).not.toBeInTheDocument();
  expect(apiRequest).toHaveBeenCalledWith("/api/v1/events/e1/rubrics", expect.objectContaining({ method: "POST", body: expect.stringContaining('"name":"Coreografía"') }));
  fireEvent.click(screen.getByRole("button", { name: "Configurar ítems en Evaluación" }));
  expect(screen.getByRole("heading", { name: "Todavía no configuraste qué se evalúa en Danza." })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Ocultar criterios de Coreografía" })).toBeInTheDocument();
  fireEvent.click(within(screen.getByRole("group", { name: "Especialidades de la competencia" })).getByRole("button", { name: /Música/ }));
  expect(screen.getByRole("button", { name: "Ocultar criterios de Coreografía" })).toBeInTheDocument();
});

it("muestra ítems puntuables de cada especialidad en la tarjeta sin abrir criterios ni nominaciones", async () => {
  const shared = { ...rubric, items: [rubric.items[0], { id: "i2", name: "Sincronización", specialtyId: "s2", active: true }],
    criteria: [{ id: "c1", scoringItemId: "i1", description: "Precisión", active: true }],
    evaluationTarget: "NOMINATION", nominations: [{ id: "n1", displayName: "Ana", troupeName: "Estrella", active: true }] };
  mockCatalog({ rubrics: () => [shared] });
  const { container } = render(<AdminCompetenciaPage event={event()} initialStep="rubros" />);
  await screen.findByRole("button", { name: "Ver criterios de Vestuario" });
  const card = container.querySelector('[data-rubric-id="r1"]');
  expect(within(card).getByText("1 ítem puntuable")).toBeInTheDocument();
  expect(within(card).getByRole("list", { name: "Ítems puntuables de Vestuario" })).toHaveTextContent("Color");
  expect(within(card).queryByText("Precisión")).not.toBeInTheDocument();
  expect(within(card).queryByText("Ana")).not.toBeInTheDocument();
  expect(within(card).queryByText(/criterio descriptivo/)).not.toBeInTheDocument();
  expect(within(card).getByText(/se comparte entre Danza y Música/)).toBeInTheDocument();
  fireEvent.click(within(screen.getByRole("group", { name: "Especialidades de la competencia" })).getByRole("button", { name: /Música/ }));
  expect(screen.getAllByRole("heading", { name: "Vestuario" })).toHaveLength(1);
  expect(within(card).getByRole("list", { name: "Ítems puntuables de Vestuario" })).toHaveTextContent("Sincronización");
  expect(within(card).queryByText("Color")).not.toBeInTheDocument();
  fireEvent.click(within(card).getByRole("button", { name: "Ver criterios de Vestuario" }));
  expect(within(card).getByText("1 criterio descriptivo")).toBeInTheDocument();
  expect(within(card).getByText("Precisión")).toBeInTheDocument();
  expect(within(card).getByText("Ana")).toBeInTheDocument();
});

it("separa pendientes activos de historial inactivo y permite completar el primero sin especialidad ficticia", async () => {
  mockCatalog({ specialties: () => [], rubrics: () => [
    { ...rubric, id: "pending", name: "Rubro pendiente", items: [], criteria: [{ id: "c1", description: "Histórico" }] },
    { ...rubric, id: "historical", name: "Rubro archivado", active: false, items: [] },
  ], readiness: () => ready([{ id: "pending", name: "Rubro pendiente" }]) });
  const { container } = render(<AdminCompetenciaPage event={event()} initialStep="rubros" />);
  expect(await screen.findByText("Todavía no hay especialidades activas")).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Rubros activos pendientes de asociación" })).toHaveTextContent("Rubro pendiente");
  expect(screen.getByRole("region", { name: "Historial de rubros inactivos" })).toHaveTextContent("Rubro archivado");
  expect(screen.getByRole("region", { name: "Rubros activos pendientes de asociación" })).not.toHaveTextContent("Rubro archivado");
  expect(screen.queryByRole("button", { name: /Crear primer rubro|Agregar rubro/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "Ítems" }));
  expect(screen.getByRole("button", { name: "Crear ítem en Rubro pendiente" })).toBeDisabled();
  const pending = container.querySelector('[data-rubric-id="pending"]');
  expect(within(pending).getByText("Sin ítems puntuables activos.")).toBeInTheDocument();
  expect(within(pending).getByText(/Necesita configuración/)).toBeInTheDocument();
  fireEvent.click(within(pending).getByRole("button", { name: "Ver criterios de Rubro pendiente" }));
  expect(within(pending).getByText(/todavía no tiene ítems puntuables/)).toBeInTheDocument();
});

it("un rubro activo sin asociación no se anuncia Listo aunque readiness no lo enumere", async () => {
  mockCatalog({ rubrics: () => [{ ...rubric, id: "r2", name: "Sin asociación", items: [] }] });
  const { container } = render(<AdminCompetenciaPage event={event()} initialStep="rubros" />);
  const pending = await screen.findByRole("region", { name: "Rubros activos pendientes de asociación" });
  expect(within(pending).getByText(/Sin asociación activa/)).toBeInTheDocument();
  expect(container.querySelectorAll('[data-rubric-id="r2"]')).toHaveLength(1);
});

it("Evaluación permite gestionar ítems y criterios de rubros existentes", async () => {
  mockCatalog();
  render(<AdminCompetenciaPage event={event()} initialStep="rubros" />);
  await screen.findByRole("button", { name: "Ver criterios de Vestuario" });
  expect(screen.queryByRole("button", { name: "Agregar rubro" })).not.toBeInTheDocument();
  expect(screen.queryByText(/Todavía no configuraste qué se evalúa en Danza/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "Ítems" }));
  fireEvent.click(screen.getByRole("button", { name: "Ver criterios de Vestuario" }));
  expect(screen.getByRole("button", { name: "Crear ítem en Vestuario" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Agregar criterio a Color" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Editar rubro" })).toBeInTheDocument();
});

it("proyecta una sola lectura vigente en selector, indicador y resumen", async () => {
  mockCatalog();
  render(<AdminCompetenciaPage event={event()} initialStep="rubros" />);
  expect((await screen.findAllByText("Especialidades listas: 1 de 2")).length).toBe(1);
  expect(screen.getByText("Usá los rubros ya creados para definir los ítems que puntúan los jurados en cada especialidad.")).toBeInTheDocument();
  const selector = screen.getByRole("group", { name: "Especialidades de la competencia" });
  expect(within(selector).getByRole("button", { name: /Danza/ })).toHaveTextContent("Lista");
  expect(within(selector).getByRole("button", { name: /Música/ })).toHaveTextContent("Sin configurar");
  fireEvent.click(within(selector).getByRole("button", { name: /Música/ }));
  expect(screen.getByRole("heading", { name: "Rubros de Música" })).toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "Resumen de evaluación" })).getByText("Especialidades listas: 1 de 2")).toBeInTheDocument();
});

it("separa orientación incompleta y criterios descriptivos de bloqueos oficiales sin impedir avanzar", async () => {
  mockCatalog({
    readiness: () => ({ ...ready(), ready: true }),
    "orphaned-criteria": () => [{ id: "c1", rubricId: "r1", rubricName: "Vestuario", description: "Precisión" }],
  });
  render(<AdminCompetenciaPage event={event()} initialStep="rubros" />);
  const summary = await screen.findByRole("region", { name: "Resumen de evaluación" });
  expect(within(summary).getByText("Especialidades listas: 1 de 2")).toBeInTheDocument();
  expect(within(summary).getByText(/Música.*Sin configurar/)).toBeInTheDocument();
  expect(within(summary).getByText(/1 criterio descriptivo sin asociar/)).toBeInTheDocument();
  expect(within(summary).getByText(/Sin bloqueos oficiales de evaluación/)).toBeInTheDocument();
  expect(within(summary).queryByText(/criterio.*sin asociar/, { selector: ".evaluation-summary-official *" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Continuar a comparsas/ }));
  fireEvent.click(screen.getByRole("button", { name: /Revisión final/ }));
  expect(await screen.findByRole("heading", { name: "Revisión final" })).toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "Requisitos para abrir el evento" })).getByRole("button", { name: "Abrir competencia" })).toBeEnabled();
  const review = screen.getByRole("region", { name: "Resumen de la preparación" });
  expect(within(review).getByText(/Especialidades listas: 1 de 2/)).toBeInTheDocument();
  expect(within(review).getByText(/1 criterio descriptivo sin asociar/)).toBeInTheDocument();
  expect(within(review).getAllByText(/no bloquea la apertura/i)).toHaveLength(2);
  expect(within(review).getByText("1 criterio descriptivo", { exact: true })).toBeInTheDocument();
  expect(posts()).toHaveLength(0);
});

it("readiness bloquea la apertura aunque la orientación visual esté completa", async () => {
  mockCatalog({ specialties: () => [specialties[0]], readiness: () => ({ ...ready(), missing: ["ACTIVE_TROUPE"] }) });
  render(<AdminCompetenciaPage event={event()} initialStep="rubros" />);
  const summary = await screen.findByRole("region", { name: "Resumen de evaluación" });
  expect(within(summary).getByText("Especialidades listas: 1 de 1")).toBeInTheDocument();
  expect(within(summary).getByText(/Sin bloqueos oficiales de evaluación/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Continuar a comparsas/ }));
  fireEvent.click(screen.getByRole("button", { name: /Revisión final/ }));
  expect(await screen.findByRole("list", { name: "Requisitos pendientes para abrir el evento" })).toHaveTextContent("comparsa");
  expect(screen.queryByRole("button", { name: "Abrir competencia" })).not.toBeInTheDocument();
  expect(posts()).toHaveLength(0);
});

it("cambio de evento descarta lecturas demoradas sin mostrar nombres ni estados anteriores", async () => {
  const oldRubrics = deferred();
  mockCatalog({ rubrics: (path) => path.includes("/e1/") ? oldRubrics.promise : [], specialties: (path) => path.includes("/e1/") ? specialties : [] });
  const view = render(<AdminCompetenciaPage event={event()} initialStep="rubros" />);
  view.rerender(<AdminCompetenciaPage event={event("e2")} initialStep="rubros" />);
  await screen.findAllByText("No hay especialidades activas.");
  await act(async () => { oldRubrics.resolve([rubric]); });
  expect(screen.queryByText("Vestuario")).not.toBeInTheDocument();
  expect(screen.queryByText(/Especialidades listas: 1 de 2/)).not.toBeInTheDocument();
});

it("un GET fallido del par no pinta Lista ni cifras falsas y permite reintentar", async () => {
  let fail = true;
  mockCatalog({ readiness: () => fail ? Promise.reject(new Error("offline")) : ready() });
  render(<AdminCompetenciaPage event={event()} initialStep="rubros" />);
  expect(await screen.findByRole("button", { name: "Reintentar evaluación" })).toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "Resumen de evaluación" })).getByText("Estado por comprobar")).toBeInTheDocument();
  expect(screen.queryByText(/Especialidades listas: \d de/)).not.toBeInTheDocument();
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "Reintentar evaluación" }));
  expect((await screen.findAllByText("Especialidades listas: 1 de 2")).length).toBe(1);
});

it("readiness fallido mantiene catálogo esencial: tarjeta, pendiente e historial sin afirmar progreso", async () => {
  mockCatalog({
    readiness: () => Promise.reject(new Error("offline")),
    rubrics: () => [rubric,
      { ...rubric, id: "r2", name: "Sin ítems", items: [] },
      { ...rubric, id: "r3", name: "Archivado", active: false, items: [] },
    ],
  });
  const { container } = render(<AdminCompetenciaPage event={event()} initialStep="rubros" />);
  expect(await screen.findByRole("button", { name: "Reintentar evaluación" })).toBeInTheDocument();
  const selector = screen.getByRole("group", { name: "Especialidades de la competencia" });
  expect(within(selector).getByRole("button", { name: /Danza/ })).toHaveTextContent("Estado por comprobar");
  await screen.findByRole("button", { name: "Ver criterios de Vestuario" });
  expect(container.querySelector('[data-rubric-id="r1"]')).toHaveTextContent("Color");
  expect(container.querySelector('[data-rubric-id="r1"]')).toHaveTextContent("Estado por comprobar");
  expect(screen.getByRole("region", { name: "Rubros activos pendientes de asociación" })).toHaveTextContent("Sin ítems");
  expect(screen.getByRole("region", { name: "Historial de rubros inactivos" })).toHaveTextContent("Archivado");
  expect(screen.queryByText(/Especialidades listas:/)).not.toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "Resumen de evaluación" })).getByText("Estado por comprobar")).toBeInTheDocument();
});

it("sin especialidades y con readiness fallido conserva pendientes e historial, sin alta imposible", async () => {
  mockCatalog({
    readiness: () => Promise.reject(new Error("offline")),
    specialties: () => [],
    rubrics: () => [
      { ...rubric, id: "r2", name: "Sin asociación", items: [] },
      { ...rubric, id: "r3", name: "Histórico", active: false, items: [] },
    ],
  });
  render(<AdminCompetenciaPage event={event()} initialStep="rubros" />);
  expect(await screen.findByRole("button", { name: "Reintentar evaluación" })).toBeInTheDocument();
  expect(screen.getByText("Todavía no hay especialidades activas")).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Rubros activos pendientes de asociación" })).toHaveTextContent("Sin asociación");
  expect(screen.getByRole("region", { name: "Historial de rubros inactivos" })).toHaveTextContent("Histórico");
  expect(screen.queryByRole("button", { name: /Crear primer rubro|Agregar rubro/ })).not.toBeInTheDocument();
  expect(screen.queryByText(/Especialidades listas:/)).not.toBeInTheDocument();
});

it("nominación pendiente marca Incompleta en selector y Necesita configuración en tarjeta", async () => {
  mockCatalog({ readiness: () => ({ ...ready(), incompleteNominations: [{ rubricId: "r1", troupeId: "t1" }] }) });
  const { container } = render(<AdminCompetenciaPage event={event()} initialStep="rubros" />);
  const selector = await screen.findByRole("group", { name: "Especialidades de la competencia" });
  await screen.findAllByText("Especialidades listas: 0 de 2");
  expect(within(selector).getByRole("button", { name: /Danza/ })).toHaveTextContent("Incompleta");
  await screen.findByRole("button", { name: "Ver criterios de Vestuario" });
  expect(container.querySelector('[data-rubric-id="r1"]')).toHaveTextContent("Necesita configuración");
  expect(container.querySelector('[data-rubric-id="r1"]')).not.toHaveTextContent("Listo");
});

it("un catálogo sin ítems interpretables no se convierte en carga interminable ni en Lista", async () => {
  mockCatalog({ rubrics: () => [{ id: "r1", name: "Incompleto", active: true }] });
  render(<AdminCompetenciaPage event={event()} initialStep="rubros" />);
  expect(await screen.findByRole("button", { name: "Reintentar evaluación" })).toBeInTheDocument();
  expect(screen.queryAllByText(/Especialidades listas:/)).toHaveLength(0);
});

it("con Y=0 comunica que no hay especialidades activas, no Lista ni 0 de 0", async () => {
  mockCatalog({ specialties: () => [] });
  render(<AdminCompetenciaPage event={event()} initialStep="rubros" />);
  expect((await screen.findAllByText("No hay especialidades activas.")).length).toBeGreaterThan(0);
  expect(screen.queryByText(/Especialidades listas:/)).not.toBeInTheDocument();
});

it("una lectura anterior a una mutación que termina última no restaura Lista", async () => {
  const oldReadiness = deferred();
  let first = true;
  let saved = false;
  mockCatalog({
    readiness: () => { if (first) { first = false; return oldReadiness.promise; } return ready([{ id: "r1", name: "Vestuario" }]); },
    rubrics: () => saved ? [rubric, { ...rubric, id: "r2", name: "Nuevo", items: [] }] : [rubric],
  });
  const initial = apiRequest.getMockImplementation();
  apiRequest.mockImplementation(async (path, options) => {
    if (options?.method === "POST" && path.endsWith("/rubrics")) { saved = true; return { id: "r2", name: "Nuevo", items: [], criteria: [], active: true }; }
    return initial(path, options);
  });
  render(<AdminCompetenciaPage event={event()} />);
  fireEvent.click(screen.getByRole("button", { name: "+ Nuevo tipo" }));
  const form = screen.getByRole("button", { name: "Agregar tipo" }).closest("form");
  fireEvent.change(within(form).getByLabelText("Nombre"), { target: { value: "Nuevo" } });
  fireEvent.submit(form);
  fireEvent.click(screen.getByRole("button", { name: /^Evaluación / }));
  expect((await screen.findAllByText("Especialidades listas: 0 de 2")).length).toBe(1);
  await act(async () => { oldReadiness.resolve(ready()); });
  expect(screen.queryByText("Especialidades listas: 1 de 2")).not.toBeInTheDocument();
  expect(screen.getAllByText("Especialidades listas: 0 de 2").length).toBe(1);
});

it("conserva alta legada de rubro y su identificador confirmado sin crear ítems", async () => {
  let rubrics = [rubric];
  mockCatalog({ rubrics: () => rubrics });
  const get = apiRequest.getMockImplementation();
  apiRequest.mockImplementation(async (path, options) => {
    if (options?.method === "POST" && path.endsWith("/rubrics")) {
      rubrics = [...rubrics, { ...rubric, id: "r2", name: "Nuevo", items: [] }];
      return rubrics.at(-1);
    }
    return get(path, options);
  });
  render(<AdminCompetenciaPage event={event()} initialStep="rubros" />);
  await openCatalog();
  const form = screen.getByRole("button", { name: "Crear rubro" }).closest("form");
  fireEvent.change(within(form).getByLabelText("Nombre del rubro"), { target: { value: "Nuevo" } });
  fireEvent.submit(form);
  expect(await screen.findByText("Rubro guardado.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /^Evaluación / }));
  fireEvent.click(screen.getByRole("tab", { name: "Ítems" }));
  expect(await screen.findByRole("button", { name: "Crear ítem en Nuevo" })).toBeInTheDocument();
});

it("el progreso 1/2 no persiste durante la mutación ni ante readiness atrasado; luego pasa a 0/2", async () => {
  const freshReadiness = deferred();
  let saved = false;
  mockCatalog({ readiness: () => saved ? freshReadiness.promise : ready(), rubrics: () => saved ? [rubric, { ...rubric, id: "r2", name: "Nuevo", items: [] }] : [rubric] });
  const get = apiRequest.getMockImplementation();
  apiRequest.mockImplementation(async (path, options) => {
    if (options?.method === "POST" && path.endsWith("/rubrics")) { saved = true; return { ...rubric, id: "r2", name: "Nuevo", items: [] }; }
    return get(path, options);
  });
  render(<AdminCompetenciaPage event={event()} initialStep="rubros" />);
  await screen.findAllByText("Especialidades listas: 1 de 2");
  await openCatalog();
  const form = screen.getByRole("button", { name: "Crear rubro" }).closest("form");
  fireEvent.change(within(form).getByLabelText("Nombre del rubro"), { target: { value: "Nuevo" } });
  fireEvent.submit(form);
  await screen.findByText("Rubro guardado.");
  fireEvent.click(screen.getByRole("button", { name: /^Evaluación / }));
  await waitFor(() => expect(screen.queryAllByText("Especialidades listas: 1 de 2")).toHaveLength(0));
  expect(screen.queryByText("Lista", { exact: true })).not.toBeInTheDocument();
  await act(async () => { freshReadiness.resolve(ready([{ id: "r1", name: "Vestuario" }])); });
  expect((await screen.findAllByText("Especialidades listas: 0 de 2")).length).toBe(1);
});

it("si el catálogo falla después de confirmar el alta, conserva el comprobante pero no afirma el estado global", async () => {
  let saved = false;
  mockCatalog({ rubrics: () => saved ? Promise.reject(new Error("offline")) : [rubric] });
  const get = apiRequest.getMockImplementation();
  apiRequest.mockImplementation(async (path, options) => {
    if (options?.method === "POST" && path.endsWith("/rubrics")) { saved = true; return { ...rubric, id: "r2", name: "Nuevo", items: [] }; }
    return get(path, options);
  });
  render(<AdminCompetenciaPage event={event()} initialStep="rubros" />);
  await screen.findAllByText("Especialidades listas: 1 de 2");
  await openCatalog();
  const form = screen.getByRole("button", { name: "Crear rubro" }).closest("form");
  fireEvent.change(within(form).getByLabelText("Nombre del rubro"), { target: { value: "Nuevo" } });
  fireEvent.submit(form);
  expect(await screen.findByText("Rubro confirmado: Nuevo (r2).")).toBeInTheDocument();
  expect(await screen.findByRole("button", { name: "Reintentar evaluación" })).toBeInTheDocument();
  expect(screen.queryByText(/Especialidades listas:/)).not.toBeInTheDocument();
  expect(screen.queryByText("Lista", { exact: true })).not.toBeInTheDocument();
});

it("POST de A resuelto después de seleccionar B no invalida GET de B ni muestra recibo de A", async () => {
  const postA = deferred();
  const getB = deferred();
  let bCalls = 0;
  mockCatalog({ rubrics: (path) => path.includes("/e2/") ? (++bCalls === 1 ? getB.promise : []) : [rubric] });
  const get = apiRequest.getMockImplementation();
  apiRequest.mockImplementation(async (path, options) => options?.method === "POST" && path.includes("/e1/rubrics") ? postA.promise : get(path, options));
  const view = render(<AdminCompetenciaPage event={event()} initialStep="rubros" />);
  await openCatalog();
  const form = screen.getByRole("button", { name: "Crear rubro" }).closest("form");
  fireEvent.change(within(form).getByLabelText("Nombre del rubro"), { target: { value: "Nuevo A" } });
  fireEvent.submit(form);
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/api/v1/events/e1/rubrics", expect.objectContaining({ method: "POST" })));
  view.rerender(<AdminCompetenciaPage event={event("e2")} initialStep="rubros" />);
  await act(async () => { postA.resolve({ ...rubric, id: "ra", name: "Nuevo A", items: [] }); });
  await act(async () => { getB.resolve([]); });
  fireEvent.click(screen.getByRole("button", { name: /^Evaluación / }));
  expect((await screen.findAllByText("Especialidades listas: 0 de 2")).length).toBe(1);
  expect(screen.getByRole("button", { name: "Administrar rubros" })).toBeEnabled();
  expect(screen.queryByText(/Nuevo A|\(ra\)/)).not.toBeInTheDocument();
  expect(bCalls).toBe(1);
});

it("fallos solo de categorías, comparsas o huérfanos no ocultan el editor y sí informan lectura parcial", async () => {
  mockCatalog({ categories: () => Promise.reject(new Error("sin categorías")), troupes: () => Promise.reject(new Error("sin comparsas")), "orphaned-criteria": () => Promise.reject(new Error("sin criterios")) });
  render(<AdminCompetenciaPage event={event()} initialStep="rubros" />);
  expect(await screen.findByRole("button", { name: "Crear ítem en Vestuario" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Ver criterios de Vestuario" })).toBeInTheDocument();
  expect(screen.getByText(/No se pudieron cargar datos complementarios/)).toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "Resumen de evaluación" })).getByText(/Criterios descriptivos por comprobar/)).toBeInTheDocument();
});

it("un GET secundario todavía pendiente tampoco bloquea rubros, especialidades ni readiness ya recibidos", async () => {
  const slowCategories = deferred();
  mockCatalog({ categories: () => slowCategories.promise });
  render(<AdminCompetenciaPage event={event()} initialStep="rubros" />);
  expect(await screen.findByRole("button", { name: "Ver criterios de Vestuario" })).toBeInTheDocument();
  expect((await screen.findAllByText("Especialidades listas: 1 de 2")).length).toBe(1);
  await act(async () => { slowCategories.resolve([]); });
});

it("con GET posterior fallido permite seguir con rubro confirmado y su ítem aceptado sin estado global", async () => {
  let fail = false;
  mockCatalog({ rubrics: () => fail ? Promise.reject(new Error("sin GET")) : [rubric] });
  const get = apiRequest.getMockImplementation();
  apiRequest.mockImplementation(async (path, options) => {
    if (options?.method === "POST" && path.endsWith("/rubrics")) { fail = true; return { ...rubric, id: "r2", name: "Nuevo", items: [] }; }
    if (options?.method === "POST" && path.endsWith("/items")) return { id: "i2", name: "Nuevo ítem", specialtyId: "s1", active: true, displayOrder: 1 };
    return get(path, options);
  });
  render(<AdminCompetenciaPage event={event()} initialStep="rubros" />);
  await openCatalog();
  const form = screen.getByRole("button", { name: "Crear rubro" }).closest("form");
  fireEvent.change(within(form).getByLabelText("Nombre del rubro"), { target: { value: "Nuevo" } });
  fireEvent.submit(form);
  await screen.findByText("Rubro guardado.");
  fireEvent.click(screen.getByRole("button", { name: /^Evaluación / }));
  fireEvent.click(screen.getByRole("tab", { name: "Ítems" }));
  expect(await screen.findByRole("button", { name: "Crear ítem en Nuevo" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Crear ítem en Nuevo" }));
  const dialog = await screen.findByRole("dialog", { name: "Crear ítem en Nuevo" });
  fireEvent.change(within(dialog).getByLabelText("Nuevo item puntuable para Nuevo"), { target: { value: "Nuevo ítem" } });
  fireEvent.click(within(dialog).getByRole("checkbox", { name: "Danza" }));
  fireEvent.submit(dialog.querySelector("form"));
  fireEvent.click(await screen.findByRole("button", { name: "Confirmar y guardar" }));
  expect(await screen.findByText(/Nuevo ítem \(i2\)/)).toBeInTheDocument();
  expect(screen.queryByText(/Especialidades listas:/)).not.toBeInTheDocument();
});

it("reorden confirmado no suplanta una edición posterior del ítem en catálogo fresco", async () => {
  let name = "Color";
  let order = 1;
  mockCatalog({ rubrics: () => [{ ...rubric, items: [
    { ...rubric.items[0], name, displayOrder: order },
    { id: "i3", name: "Ritmo", specialtyId: "s1", active: true, displayOrder: order === 1 ? 2 : 1 },
  ] }] });
  const get = apiRequest.getMockImplementation();
  apiRequest.mockImplementation(async (path, options) => {
    if (options?.method === "POST" && path.endsWith("/reorder")) { order = 2; return { changes: [{ id: "i1", displayOrder: 2 }, { id: "i3", displayOrder: 1 }] }; }
    if (options?.method === "PATCH" && path.endsWith("/i1")) { name = "Color nuevo"; return { ...rubric.items[0], name, displayOrder: 2 }; }
    if (path === "/api/v1/rubrics/r1") return { ...rubric, items: [{ ...rubric.items[0], name, displayOrder: order }, { id: "i3", name: "Ritmo", specialtyId: "s1", active: true, displayOrder: 1 }] };
    return get(path, options);
  });
  render(<AdminCompetenciaPage event={event()} initialStep="rubros" />);
  fireEvent.click(screen.getByRole("tab", { name: "Ítems" }));
  fireEvent.click(await screen.findByRole("button", { name: "Ver criterios de Vestuario" }));
  fireEvent.click(screen.getByRole("button", { name: "Bajar item Color" }));
  fireEvent.click(await screen.findByRole("button", { name: "Confirmar y guardar" }));
  await screen.findByText("Orden actualizado.");
  fireEvent.click(screen.getByRole("button", { name: "Editar item Color" }));
  const form = screen.getByRole("button", { name: "Guardar item" }).closest("form");
  fireEvent.change(within(form).getByLabelText("Nombre"), { target: { value: "Color nuevo" } });
  fireEvent.submit(form);
  fireEvent.click(await screen.findByRole("button", { name: "Confirmar y guardar" }));
  expect(await screen.findByRole("button", { name: "Editar item Color nuevo" })).toBeInTheDocument();
});

it("edición confirmada de ítem no queda pendiente por arrays de especialidades equivalentes", async () => {
  let itemName = "Color";
  const item = () => ({ ...rubric.items[0], name: itemName, specialtyId: "s1", specialtyIds: ["s1", "s2"],
    specialties: [{ specialtyId: "s1", specialtyName: "Danza" }, { specialtyId: "s2", specialtyName: "Música" }],
    active: true, displayOrder: 1, required: true, allowNotPresented: true });
  mockCatalog({ rubrics: () => [{ ...rubric, items: [item()] }] });
  const get = apiRequest.getMockImplementation();
  apiRequest.mockImplementation(async (path, options) => {
    if (options?.method === "PATCH" && path.endsWith("/i1")) {
      itemName = "Color editado";
      return item();
    }
    return get(path, options);
  });

  render(<AdminCompetenciaPage event={event()} initialStep="rubros" />);
  fireEvent.click(screen.getByRole("tab", { name: "Ítems" }));
  fireEvent.click(await screen.findByRole("button", { name: "Ver criterios de Vestuario" }));
  fireEvent.click(await screen.findByRole("button", { name: "Editar item Color" }));
  const form = screen.getByRole("button", { name: "Guardar item" }).closest("form");
  fireEvent.change(within(form).getByLabelText("Nombre"), { target: { value: "Color editado" } });
  fireEvent.submit(form);
  fireEvent.click(await screen.findByRole("button", { name: "Confirmar y guardar" }));

  expect(await screen.findByRole("button", { name: "Editar item Color editado" })).toBeInTheDocument();
  expect(screen.queryByText(/Estado por comprobar/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Ítem confirmado:/)).not.toBeInTheDocument();
});

it("reordenar programación invalida la orientación de Evaluación antes del siguiente readiness", async () => {
  let changed = false;
  mockCatalog({ readiness: () => changed ? ready([{ id: "r1", name: "Vestuario" }]) : ready() });
  const get = apiRequest.getMockImplementation();
  apiRequest.mockImplementation(async (path, options) => {
    if (path.endsWith("/nights")) return [{ id: "n1", name: "Noche 1" }];
    if (path.includes("/schedule?")) return [
      { id: "sc1", troupeId: "t1", troupeName: "Estrella", nightId: "n1", presentationOrder: 1 },
      { id: "sc2", troupeId: "t2", troupeName: "Luna", nightId: "n1", presentationOrder: 2 },
    ];
    if (options?.method === "POST" && path.endsWith("/reorder")) { changed = true; return { changes: [{ id: "sc1", presentationOrder: 2 }, { id: "sc2", presentationOrder: 1 }] }; }
    return get(path, options);
  });
  render(<AdminCompetenciaPage event={event()} />);
  fireEvent.click(screen.getByRole("tab", { name: "Orden de pasada por jornada" }));
  fireEvent.click(await screen.findByRole("button", { name: "Bajar Estrella en Noche 1" }));
  fireEvent.click(await screen.findByRole("button", { name: "Confirmar y guardar" }));
  await screen.findByText("Orden de pasada actualizado.");
  fireEvent.click(screen.getByRole("button", { name: /^Evaluación / }));
  expect((await screen.findAllByText("Especialidades listas: 0 de 2")).length).toBe(1);
});

it("ítem confirmado sigue editable con recibo aunque GET posterior de rubros traiga la versión anterior", async () => {
  let posted = false;
  mockCatalog({ rubrics: () => [rubric] });
  const read = apiRequest.getMockImplementation();
  apiRequest.mockImplementation(async (path, options) => {
    if (path.endsWith("/rubrics/r1") && !options?.method) return { ...rubric, items: posted ? [...rubric.items, { id: "i2", name: "Nuevo ítem", specialtyId: "s1", active: true, displayOrder: 2 }] : rubric.items };
    if (options?.method === "POST" && path.endsWith("/items")) { posted = true; return { id: "i2", name: "Nuevo ítem", specialtyId: "s1", active: true, displayOrder: 2 }; }
    return read(path, options);
  });
  render(<AdminCompetenciaPage event={event()} initialStep="rubros" />);
  fireEvent.click(screen.getByRole("tab", { name: "Ítems" }));
  fireEvent.click(await screen.findByRole("button", { name: "Crear ítem en Vestuario" }));
  const dialog = await screen.findByRole("dialog", { name: "Crear ítem en Vestuario" });
  fireEvent.change(within(dialog).getByLabelText("Nuevo item puntuable para Vestuario"), { target: { value: "Nuevo ítem" } });
  fireEvent.click(within(dialog).getByRole("checkbox", { name: "Danza" }));
  fireEvent.submit(dialog.querySelector("form"));
  fireEvent.click(await screen.findByRole("button", { name: "Confirmar y guardar" }));
  expect(await screen.findByText("Ítem confirmado: Nuevo ítem (i2).")).toBeInTheDocument();
  expect(screen.queryAllByText(/Especialidades listas:/)).toHaveLength(0);
  // La creación del ítem ya despliega su rubro para continuar editando.
  expect(screen.getByRole("button", { name: "Editar item Nuevo ítem" })).toBeInTheDocument();
});

it("criterio confirmado por respuesta sigue accesible ante catálogo viejo, sin ocultar edición posterior", async () => {
  let criterionName = "Guía nueva";
  let catalogFresh = false;
  const withCriterion = () => ({ ...rubric, criteria: [{ id: "c2", description: criterionName, scoringItemId: "i1", displayOrder: 1, active: true }] });
  mockCatalog({ rubrics: () => catalogFresh ? [withCriterion()] : [rubric] });
  const read = apiRequest.getMockImplementation();
  apiRequest.mockImplementation(async (path, options) => {
    if (options?.method === "POST" && path.endsWith("/criteria")) return { id: "c2", description: "Guía nueva", scoringItemId: "i1", displayOrder: 1, active: true };
    if (options?.method === "PATCH" && path.endsWith("/c2")) { criterionName = "Guía corregida"; catalogFresh = true; return { id: "c2", description: criterionName, scoringItemId: "i1", displayOrder: 1, active: true }; }
    if (path === "/api/v1/rubrics/r1") return withCriterion();
    return read(path, options);
  });
  render(<AdminCompetenciaPage event={event()} initialStep="rubros" />);
  fireEvent.click(screen.getByRole("tab", { name: "Ítems" }));
  fireEvent.click(await screen.findByRole("button", { name: "Ver criterios de Vestuario" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Nuevo criterio para Color" }), { target: { value: "Guía nueva" } });
  fireEvent.submit(screen.getByRole("button", { name: "Agregar criterio a Color" }).closest("form"));
  const creation = await screen.findByRole("dialog", { name: "Confirmar creación del criterio" });
  expect(creation).toHaveTextContent(/Guía nueva.*Color.*Vestuario/);
  const accept = within(creation).getByRole("button", { name: "Confirmar y guardar" });
  await waitFor(() => expect(accept).toBeEnabled());
  fireEvent.click(accept);
  expect(await screen.findByRole("button", { name: "Editar criterio Guía nueva" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Editar criterio Guía nueva" }));
  const form = screen.getByRole("button", { name: "Guardar criterio Guía nueva" }).closest("form");
  fireEvent.change(within(form).getByLabelText("Descripcion"), { target: { value: "Guía corregida" } });
  fireEvent.submit(form);
  fireEvent.click(await screen.findByRole("button", { name: "Confirmar y guardar" }));
  expect(await screen.findByRole("button", { name: "Editar criterio Guía corregida" })).toBeInTheDocument();
});

it("comparsas llegan antes de categorías pendientes y habilitan opciones nominativas sin afirmar categorías", async () => {
  const categories = deferred();
  mockCatalog({ categories: () => categories.promise, troupes: () => [{ id: "t1", name: "Estrella", active: true }], rubrics: () => [{ ...rubric, evaluationTarget: "NOMINATION", nominations: [] }] });
  render(<AdminCompetenciaPage event={event()} initialStep="rubros" />);
  fireEvent.click(await screen.findByRole("button", { name: "Ver criterios de Vestuario" }));
  expect(await screen.findByRole("option", { name: "Estrella" })).toBeInTheDocument();
  expect(screen.getByText(/categorías/)).toBeInTheDocument();
  await act(async () => { categories.resolve([]); });
});

it("POST de ítem libera confirmación y empieza refresh aunque GET individual se demore o falle", async () => {
  const individual = deferred();
  let posted = false;
  mockCatalog({ rubrics: () => posted ? [{ ...rubric, items: [...rubric.items, { id: "i2", name: "Nuevo ítem", specialtyId: "s1", active: true, displayOrder: 2 }] }] : [rubric] });
  const read = apiRequest.getMockImplementation();
  apiRequest.mockImplementation(async (path, options) => {
    if (path === "/api/v1/rubrics/r1" && !options?.method) return individual.promise;
    if (options?.method === "POST" && path.endsWith("/items")) { posted = true; return { id: "i2", name: "Nuevo ítem", specialtyId: "s1", active: true, displayOrder: 2 }; }
    return read(path, options);
  });
  render(<AdminCompetenciaPage event={event()} initialStep="rubros" />);
  fireEvent.click(screen.getByRole("tab", { name: "Ítems" }));
  fireEvent.click(await screen.findByRole("button", { name: "Crear ítem en Vestuario" }));
  const dialog = await screen.findByRole("dialog", { name: "Crear ítem en Vestuario" });
  fireEvent.change(within(dialog).getByLabelText("Nuevo item puntuable para Vestuario"), { target: { value: "Nuevo ítem" } });
  fireEvent.click(within(dialog).getByRole("checkbox", { name: "Danza" }));
  fireEvent.submit(dialog.querySelector("form"));
  fireEvent.click(await screen.findByRole("button", { name: "Confirmar y guardar" }));
  expect((await screen.findAllByText("Especialidades listas: 1 de 2")).length).toBe(1);
  expect(screen.queryByText(/Ítem confirmado:/)).not.toBeInTheDocument();
  expect(apiRequest).not.toHaveBeenCalledWith("/api/v1/rubrics/r1");
  expect(screen.getByText("Item guardado.")).toBeInTheDocument();
});

it("alta simple de rubro no espera un GET adicional anterior a la relectura", async () => {
  const individual = deferred();
  let posted = false;
  let afterPostReads = 0;
  mockCatalog({ rubrics: () => posted && ++afterPostReads === 1 ? individual.promise : posted ? [...[rubric], { ...rubric, id: "r2", name: "Nuevo", items: [] }] : [rubric] });
  const read = apiRequest.getMockImplementation();
  apiRequest.mockImplementation(async (path, options) => {
    if (options?.method === "POST" && path.endsWith("/rubrics")) { posted = true; return { ...rubric, id: "r2", name: "Nuevo", items: [] }; }
    return read(path, options);
  });
  render(<AdminCompetenciaPage event={event()} initialStep="rubros" />);
  await openCatalog();
  const form = screen.getByRole("button", { name: "Crear rubro" }).closest("form");
  fireEvent.change(within(form).getByLabelText("Nombre del rubro"), { target: { value: "Nuevo" } });
  fireEvent.submit(form);
  expect(await screen.findByText("Rubro confirmado: Nuevo (r2).")).toBeInTheDocument();
  expect(await screen.findByRole("button", { name: "Ocultar opciones de Nuevo" })).toBeInTheDocument();
  expect(afterPostReads).toBeGreaterThan(0);
  await act(async () => { individual.resolve(Promise.reject(new Error("GET anterior fallido"))); });
  expect(screen.getByText("Rubro guardado.")).toBeInTheDocument();
});

it("nominación confirmada sigue visible con catálogo viejo y el catálogo actualizado concilia el recibo", async () => {
  let fresh = false;
  const nomination = { id: "n2", rubricId: "r1", eventTroupeId: "t1", displayName: "Ana", subjectType: "PERSON", active: true };
  mockCatalog({ troupes: () => [{ id: "t1", name: "Estrella", active: true }], rubrics: () => [{ ...rubric, evaluationTarget: "NOMINATION", nominations: fresh ? [nomination] : [] }] });
  const read = apiRequest.getMockImplementation();
  apiRequest.mockImplementation(async (path, options) => {
    if (options?.method === "POST" && path.endsWith("/nominations")) return nomination;
    return read(path, options);
  });
  render(<AdminCompetenciaPage event={event()} initialStep="rubros" />);
  fireEvent.click(await screen.findByRole("button", { name: "Ver criterios de Vestuario" }));
  const section = screen.getByRole("region", { name: "Participantes nominados para Vestuario" });
  fireEvent.change(within(section).getByRole("textbox", { name: "Nombre del participante" }), { target: { value: "Ana" } });
  fireEvent.change(within(section).getByRole("combobox", { name: "Comparsa" }), { target: { value: "t1" } });
  fireEvent.submit(within(section).getByRole("button", { name: "Agregar participante" }).closest("form"));
  fireEvent.click(within(await screen.findByRole("dialog", { name: "Agregar participante al rubro" })).getByRole("button", { name: "Agregar participante" }));
  expect(await within(section).findByText("Ana")).toBeInTheDocument();
  expect(within(within(section).getByText("Ana").closest("li")).getByText(/Estrella/)).toBeInTheDocument();
  expect(screen.queryAllByText(/Especialidades listas:/)).toHaveLength(0);
  fresh = true;
  fireEvent.click(screen.getByRole("button", { name: "Reintentar evaluación" }));
  expect((await screen.findAllByText("Especialidades listas: 1 de 2")).length).toBe(1);
  expect(within(section).getAllByText("Ana")).toHaveLength(1);
});

it("orden confirmado con catálogo viejo no tapa edición posterior ni restaura orden anterior", async () => {
  let catalogOrder = 1;
  let catalogName = "Color";
  const rows = () => [{ ...rubric.items[0], name: catalogName, displayOrder: catalogOrder }, { id: "i3", name: "Ritmo", specialtyId: "s1", active: true, displayOrder: catalogOrder === 1 ? 2 : 1 }];
  mockCatalog({ rubrics: () => [{ ...rubric, items: rows() }] });
  const read = apiRequest.getMockImplementation();
  apiRequest.mockImplementation(async (path, options) => {
    if (options?.method === "POST" && path.endsWith("/reorder")) return { changes: [{ id: "i1", displayOrder: 2 }, { id: "i3", displayOrder: 1 }] };
    if (options?.method === "PATCH" && path.endsWith("/i1")) return { ...rubric.items[0], name: "Color nuevo", displayOrder: 2 };
    return read(path, options);
  });
  render(<AdminCompetenciaPage event={event()} initialStep="rubros" />);
  fireEvent.click(screen.getByRole("tab", { name: "Ítems" }));
  fireEvent.click(await screen.findByRole("button", { name: "Ver criterios de Vestuario" }));
  fireEvent.click(screen.getByRole("button", { name: "Bajar item Color" }));
  fireEvent.click(await screen.findByRole("button", { name: "Confirmar y guardar" }));
  await screen.findByText("Orden actualizado.");
  expect(screen.getByRole("button", { name: "Subir item Color" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Editar item Color" }));
  const form = screen.getByRole("button", { name: "Guardar item" }).closest("form");
  fireEvent.change(within(form).getByLabelText("Nombre"), { target: { value: "Color nuevo" } });
  fireEvent.submit(form);
  fireEvent.click(await screen.findByRole("button", { name: "Confirmar y guardar" }));
  expect(await screen.findByRole("button", { name: "Editar item Color nuevo" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Subir item Color nuevo" })).toBeEnabled();
  catalogOrder = 2;
  catalogName = "Color nuevo";
  fireEvent.click(screen.getByRole("button", { name: "Reintentar evaluación" }));
  expect((await screen.findAllByText("Especialidades listas: 1 de 2")).length).toBe(1);
  expect(screen.getByRole("button", { name: "Editar item Color nuevo" })).toBeInTheDocument();
});

it("un PATCH de rubro con nombre igual pero destino cambiado no se concilia contra catálogo viejo", async () => {
  let fresh = false;
  mockCatalog({ rubrics: () => [{ ...rubric, evaluationTarget: fresh ? "NOMINATION" : "TROUPE" }] });
  const read = apiRequest.getMockImplementation();
  apiRequest.mockImplementation(async (path, options) => {
    if (options?.method === "PATCH" && path === "/api/v1/rubrics/r1") return { ...rubric, evaluationTarget: "NOMINATION" };
    return read(path, options);
  });
  render(<AdminCompetenciaPage event={event()} initialStep="rubros" />);
  fireEvent.click(await screen.findByRole("button", { name: "Ver criterios de Vestuario" }));
  fireEvent.click(screen.getByRole("button", { name: "Editar rubro" }));
  fireEvent.change(screen.getByRole("combobox", { name: "A quién se evalúa" }), { target: { value: "NOMINATION" } });
  fireEvent.submit(screen.getByRole("button", { name: "Guardar rubro" }).closest("form"));
  fireEvent.click(await screen.findByRole("button", { name: "Confirmar y guardar" }));
  expect(await screen.findByRole("region", { name: "Participantes nominados para Vestuario" })).toBeInTheDocument();
  expect(screen.queryAllByText(/Especialidades listas:/)).toHaveLength(0);
  fresh = true;
  fireEvent.click(screen.getByRole("button", { name: "Reintentar evaluación" }));
  expect((await screen.findAllByText("Especialidades listas: 1 de 2")).length).toBe(1);
});

it("tras conciliar un ítem, un GET nuevo fallido no elimina el acceso confirmado", async () => {
  let posted = false;
  let fail = false;
  mockCatalog({ categories: () => Promise.reject(new Error("sin categorías")), rubrics: () => fail ? Promise.reject(new Error("sin catálogo")) : [{ ...rubric, items: posted ? [...rubric.items, { id: "i2", name: "Nuevo ítem", specialtyId: "s1", active: true }] : rubric.items }] });
  const read = apiRequest.getMockImplementation();
  apiRequest.mockImplementation(async (path, options) => {
    if (options?.method === "POST" && path.endsWith("/items")) { posted = true; return { id: "i2", name: "Nuevo ítem", specialtyId: "s1", active: true }; }
    return read(path, options);
  });
  render(<AdminCompetenciaPage event={event()} initialStep="rubros" />);
  fireEvent.click(screen.getByRole("tab", { name: "Ítems" }));
  fireEvent.click(await screen.findByRole("button", { name: "Crear ítem en Vestuario" }));
  const dialog = await screen.findByRole("dialog", { name: "Crear ítem en Vestuario" });
  fireEvent.change(within(dialog).getByLabelText("Nuevo item puntuable para Vestuario"), { target: { value: "Nuevo ítem" } });
  fireEvent.click(within(dialog).getByRole("checkbox", { name: "Danza" }));
  fireEvent.submit(dialog.querySelector("form"));
  fireEvent.click(await screen.findByRole("button", { name: "Confirmar y guardar" }));
  expect((await screen.findAllByText("Especialidades listas: 1 de 2")).length).toBe(1);
  fail = true;
  fireEvent.click(screen.getByRole("button", { name: "Reintentar datos complementarios" }));
  expect(await screen.findByText("No se pudo cargar la configuración de evaluación.")).toBeInTheDocument();
  expect(screen.queryAllByText(/Especialidades listas:/)).toHaveLength(0);
  expect(screen.getByRole("button", { name: "Editar item Nuevo ítem" })).toBeInTheDocument();
});

it("resumen de Revisión no cifra un catálogo completo pero anterior al rubro aceptado", async () => {
  mockCatalog({ rubrics: () => [rubric] });
  const read = apiRequest.getMockImplementation();
  apiRequest.mockImplementation(async (path, options) => options?.method === "POST" && path.endsWith("/rubrics")
    ? { ...rubric, id: "r2", name: "Nuevo", items: [] } : read(path, options));
  render(<AdminCompetenciaPage event={event()} initialStep="rubros" />);
  await openCatalog();
  const form = screen.getByRole("button", { name: "Crear rubro" }).closest("form");
  fireEvent.change(within(form).getByLabelText("Nombre del rubro"), { target: { value: "Nuevo" } });
  fireEvent.submit(form);
  expect(await screen.findByText("Rubro confirmado: Nuevo (r2).")).toBeInTheDocument();
  expect(await screen.findByRole("button", { name: "Reintentar evaluación" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /^Revisión final / }));
  expect(screen.queryByText("1 rubros")).not.toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "Resumen de la preparación" })).getByText(/por comprobar/i)).toBeInTheDocument();
});

for (const catalogResult of ["viejo", "fallido"]) {
  it(`mantiene comprobante y alta de ítem de r2 tras ir a Revisión y volver con catálogo ${catalogResult}`, async () => {
    let posted = false;
    mockCatalog({ rubrics: () => posted && catalogResult === "fallido" ? Promise.reject(new Error("sin rubros")) : [rubric] });
    const read = apiRequest.getMockImplementation();
    apiRequest.mockImplementation(async (path, options) => {
      if (options?.method === "POST" && path.endsWith("/rubrics")) {
        posted = true;
        return { ...rubric, id: "r2", name: "Nuevo", items: [], criteria: [] };
      }
      return read(path, options);
    });
    render(<AdminCompetenciaPage event={event()} initialStep="rubros" />);
    await openCatalog();
    const form = screen.getByRole("button", { name: "Crear rubro" }).closest("form");
    fireEvent.change(within(form).getByLabelText("Nombre del rubro"), { target: { value: "Nuevo" } });
    fireEvent.submit(form);
    expect(await screen.findByText("Rubro confirmado: Nuevo (r2).")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Revisión final / }));
    expect(await screen.findByRole("heading", { name: "Revisión final" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Evaluación / }));
    expect(await screen.findByText("Rubro confirmado: Nuevo (r2).")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Ítems" }));
    expect(await screen.findByRole("button", { name: "Crear ítem en Nuevo" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Crear ítem en Nuevo" }));
    expect(await screen.findByRole("dialog", { name: "Crear ítem en Nuevo" })).toBeInTheDocument();
    expect(screen.queryAllByText(/Especialidades listas:/)).toHaveLength(0);
    expect(apiRequest.mock.calls.filter(([, options]) => options?.method === "POST" && options?.body)).toHaveLength(1);
  });
}

it("el comprobante de r2 no se filtra al cambiar a otro evento", async () => {
  mockCatalog({ rubrics: () => [rubric] });
  const read = apiRequest.getMockImplementation();
  apiRequest.mockImplementation(async (path, options) => options?.method === "POST" && path.endsWith("/e1/rubrics")
    ? { ...rubric, id: "r2", name: "Nuevo", items: [] } : read(path, options));
  const view = render(<AdminCompetenciaPage event={event()} initialStep="rubros" />);
  await openCatalog();
  const form = screen.getByRole("button", { name: "Crear rubro" }).closest("form");
  fireEvent.change(within(form).getByLabelText("Nombre del rubro"), { target: { value: "Nuevo" } });
  fireEvent.submit(form);
  expect(await screen.findByText("Rubro confirmado: Nuevo (r2).")).toBeInTheDocument();
  view.rerender(<AdminCompetenciaPage event={event("e2")} initialStep="rubros" />);
  fireEvent.click(screen.getByRole("button", { name: /^Evaluación / }));
  await screen.findByRole("button", { name: "Ver criterios de Vestuario" });
  expect(screen.queryByText("Rubro confirmado: Nuevo (r2).")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Crear ítem en Nuevo" })).not.toBeInTheDocument();
  expect(apiRequest.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
});

it("al reflejar r2, el catálogo vuelve a mandar y un refresco posterior no restaura nombre viejo", async () => {
  let name = null;
  mockCatalog({ categories: () => Promise.reject(new Error("sin categorías")), rubrics: () => name ? [rubric, { ...rubric, id: "r2", name, items: [] }] : [rubric] });
  const read = apiRequest.getMockImplementation();
  apiRequest.mockImplementation(async (path, options) => options?.method === "POST" && path.endsWith("/rubrics")
    ? { ...rubric, id: "r2", name: "Nuevo", items: [] } : read(path, options));
  render(<AdminCompetenciaPage event={event()} initialStep="rubros" />);
  await openCatalog();
  const form = screen.getByRole("button", { name: "Crear rubro" }).closest("form");
  fireEvent.change(within(form).getByLabelText("Nombre del rubro"), { target: { value: "Nuevo" } });
  fireEvent.submit(form);
  expect(await screen.findByRole("button", { name: "Reintentar evaluación" })).toBeInTheDocument();
  name = "Nuevo";
  fireEvent.click(screen.getByRole("button", { name: "Reintentar evaluación" }));
  fireEvent.click(screen.getByRole("button", { name: /^Evaluación / }));
  expect((await screen.findAllByText("Especialidades listas: 1 de 2")).length).toBe(1);
  name = "Nombre posterior";
  fireEvent.click(screen.getByRole("button", { name: /^Revisión final / }));
  fireEvent.click(screen.getByRole("button", { name: /^Evaluación / }));
  fireEvent.click(screen.getByRole("button", { name: "Reintentar datos complementarios" }));
  expect(await screen.findByRole("button", { name: "Ver criterios de Nombre posterior" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Ver criterios de Nuevo" })).not.toBeInTheDocument();
});

it("nominación ya conciliada conserva nombre e ID para operar si otra lectura falla", async () => {
  let saved = false;
  let fail = false;
  const nomination = { id: "n2", rubricId: "r1", eventTroupeId: "t1", displayName: "Ana", subjectType: "PERSON", active: true };
  mockCatalog({ categories: () => Promise.reject(new Error("sin categorías")), troupes: () => [{ id: "t1", name: "Estrella", active: true }], rubrics: () => fail ? Promise.reject(new Error("sin catálogo")) : [{ ...rubric, evaluationTarget: "NOMINATION", nominations: saved ? [{ ...nomination, troupeName: "Estrella" }] : [] }] });
  const read = apiRequest.getMockImplementation();
  apiRequest.mockImplementation(async (path, options) => {
    if (options?.method === "POST" && path.endsWith("/nominations")) { saved = true; return nomination; }
    return read(path, options);
  });
  render(<AdminCompetenciaPage event={event()} initialStep="rubros" />);
  fireEvent.click(await screen.findByRole("button", { name: "Ver criterios de Vestuario" }));
  const section = screen.getByRole("region", { name: "Participantes nominados para Vestuario" });
  fireEvent.change(within(section).getByRole("textbox", { name: "Nombre del participante" }), { target: { value: "Ana" } });
  fireEvent.change(within(section).getByRole("combobox", { name: "Comparsa" }), { target: { value: "t1" } });
  fireEvent.submit(within(section).getByRole("button", { name: "Agregar participante" }).closest("form"));
  fireEvent.click(within(await screen.findByRole("dialog", { name: "Agregar participante al rubro" })).getByRole("button", { name: "Agregar participante" }));
  expect((await screen.findAllByText("Especialidades listas: 1 de 2")).length).toBe(1);
  fail = true;
  fireEvent.click(screen.getByRole("button", { name: "Reintentar datos complementarios" }));
  expect(await screen.findByText("No se pudo cargar la configuración de evaluación.")).toBeInTheDocument();
  const confirmed = screen.getByRole("region", { name: "Participantes nominados para Vestuario" });
  expect(within(confirmed).getByText("Ana")).toBeInTheDocument();
  expect(within(confirmed).getByRole("button", { name: "Desactivar" })).toBeEnabled();
  expect(screen.queryAllByText(/Especialidades listas:/)).toHaveLength(0);
});

it("POST de apertura de A tardío no cambia el estado visible ni muestra éxito en B", async () => {
  const open = deferred();
  mockCatalog({ readiness: () => ({ ...ready(), ready: true }) });
  const read = apiRequest.getMockImplementation();
  apiRequest.mockImplementation(async (path, options) => {
    if (path.endsWith("/e-open-a/open") && options?.method === "POST") return open.promise;
    return read(path, options);
  });
  const view = render(<AdminCompetenciaPage event={event("e-open-a")} initialStep="revision" />);
  fireEvent.click(within(await screen.findByRole("region", { name: "Requisitos para abrir el evento" })).getByRole("button", { name: "Abrir competencia" }));
  fireEvent.click(within(await screen.findByRole("dialog", { name: "¿Abrir la competencia?" })).getByRole("button", { name: "Abrir competencia" }));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/api/v1/events/e-open-a/open", expect.objectContaining({ method: "POST" })));
  view.rerender(<AdminCompetenciaPage event={event("e-open-b")} initialStep="revision" />);
  const request = apiRequest.mock.calls.find(([path]) => path === "/api/v1/events/e-open-a/open")[1];
  await act(async () => { open.resolve({ id: "e-open-a", status: "OPEN", operation: { operationId: request.headers["Idempotency-Key"], eventId: "e-open-a", intent: "OPEN_EVENT", status: "applied" } }); });
  expect(screen.getByText("Estado del evento: En configuración")).toBeInTheDocument();
  expect(screen.queryByText(/Competencia abierta/)).not.toBeInTheDocument();
});

for (const rubricRead of ["fallido", "sin conciliar"]) {
  it(`readiness fresco ready=true permite abrir en Revisión aunque catálogo visual ${rubricRead}`, async () => {
    let posted = false;
    const readyToOpen = { ...ready(), ready: true };
    mockCatalog({
      readiness: () => readyToOpen,
      rubrics: () => posted && rubricRead === "fallido" ? Promise.reject(new Error("sin rubros")) : [rubric],
    });
    const read = apiRequest.getMockImplementation();
    apiRequest.mockImplementation(async (path, options) => options?.method === "POST" && path.endsWith("/rubrics")
      ? (posted = true, { ...rubric, id: "r2", name: "Nuevo", items: [] }) : read(path, options));
    render(<AdminCompetenciaPage event={event()} initialStep="rubros" />);
    await openCatalog();
    const form = screen.getByRole("button", { name: "Crear rubro" }).closest("form");
    fireEvent.change(within(form).getByLabelText("Nombre del rubro"), { target: { value: "Nuevo" } });
    fireEvent.submit(form);
    expect(await screen.findByText("Rubro confirmado: Nuevo (r2).")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Reintentar evaluación" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Evaluación / }));
    expect(screen.queryAllByText(/Especialidades listas:/)).toHaveLength(0);
    expect(within(screen.getByRole("region", { name: "Resumen de evaluación" })).getByText("Estado por comprobar")).toBeInTheDocument();
    await waitFor(() => expect(within(screen.getByRole("region", { name: "Resumen de evaluación" })).queryByText("No se pudo revisar la evaluación. Volvé a intentarlo en Revisión final.")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^Revisión final / }));
    const official = await screen.findByRole("region", { name: "Requisitos para abrir el evento" });
    expect(within(official).getByRole("button", { name: "Abrir competencia" })).toBeEnabled();
    expect(within(official).getByText("Se cumplen los requisitos para abrir el evento.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Requisitos pendientes para abrir el evento" })).not.toBeInTheDocument();
    expect(screen.queryByText("No se pudieron revisar los requisitos. Volvé a intentarlo desde Jornadas.")).not.toBeInTheDocument();
    expect(screen.queryByText("1 rubros")).not.toBeInTheDocument();
    expect(apiRequest.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
  });
}

it("en Revisión invalida ready=true anterior a la mutación hasta recibir readiness nuevo del mismo evento", async () => {
  let posted = false;
  const fresh = deferred();
  mockCatalog({
    readiness: () => posted ? fresh.promise : { ...ready(), ready: true },
    rubrics: () => posted ? [rubric, { ...rubric, id: "r2", name: "Nuevo", items: [] }] : [rubric],
  });
  const read = apiRequest.getMockImplementation();
  apiRequest.mockImplementation(async (path, options) => options?.method === "POST" && path.endsWith("/rubrics")
    ? (posted = true, { ...rubric, id: "r2", name: "Nuevo", items: [] }) : read(path, options));
  render(<AdminCompetenciaPage event={event()} initialStep="revision" />);
  expect(within(await screen.findByRole("region", { name: "Requisitos para abrir el evento" })).getByRole("button", { name: "Abrir competencia" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: /^Evaluación / }));
  await openCatalog();
  const form = screen.getByRole("button", { name: "Crear rubro" }).closest("form");
  fireEvent.change(within(form).getByLabelText("Nombre del rubro"), { target: { value: "Nuevo" } });
  fireEvent.submit(form);
  expect(await screen.findByText("Rubro confirmado: Nuevo (r2).")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /^Revisión final / }));
  expect(screen.queryByRole("button", { name: "Abrir competencia" })).not.toBeInTheDocument();
  expect(screen.getByText("Todavía no se revisaron los requisitos para abrir.")).toBeInTheDocument();
  await act(async () => { fresh.resolve({ ...ready(), ready: true }); });
  expect(within(await screen.findByRole("region", { name: "Requisitos para abrir el evento" })).getByRole("button", { name: "Abrir competencia" })).toBeEnabled();
  expect(apiRequest.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
});

it("readiness tardío ready=true de A no habilita apertura en B con ready=false", async () => {
  const oldReadiness = deferred();
  mockCatalog({ readiness: (path) => path.includes("/e1/") ? oldReadiness.promise : { ...ready(), ready: false, missing: ["ACTIVE_RUBRIC"] } });
  const view = render(<AdminCompetenciaPage event={event("e1")} initialStep="revision" />);
  view.rerender(<AdminCompetenciaPage event={event("e2")} initialStep="revision" />);
  expect(await screen.findByRole("list", { name: "Requisitos pendientes para abrir el evento" })).toBeInTheDocument();
  await act(async () => { oldReadiness.resolve({ ...ready(), ready: true }); });
  expect(screen.queryByRole("button", { name: "Abrir competencia" })).not.toBeInTheDocument();
  expect(screen.getByRole("list", { name: "Requisitos pendientes para abrir el evento" })).toBeInTheDocument();
});

it("readiness antiguo del evento no restablece ready mientras el nuevo GET tras el POST está pendiente", async () => {
  const oldReadiness = deferred();
  const freshReadiness = deferred();
  let reads = 0;
  let posted = false;
  mockCatalog({ readiness: () => ++reads === 2 ? oldReadiness.promise : posted ? freshReadiness.promise : { ...ready(), ready: true },
    rubrics: () => posted ? [rubric, { ...rubric, id: "r2", name: "Nuevo", items: [] }] : [rubric] });
  const read = apiRequest.getMockImplementation();
  apiRequest.mockImplementation(async (path, options) => options?.method === "POST" && path.endsWith("/rubrics")
    ? (posted = true, { ...rubric, id: "r2", name: "Nuevo", items: [] }) : read(path, options));
  render(<AdminCompetenciaPage event={event()} initialStep="rubros" />);
  await openCatalog();
  const form = screen.getByRole("button", { name: "Crear rubro" }).closest("form");
  fireEvent.change(within(form).getByLabelText("Nombre del rubro"), { target: { value: "Nuevo" } });
  fireEvent.submit(form);
  expect(await screen.findByText("Rubro confirmado: Nuevo (r2).")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /^Revisión final / }));
  await act(async () => { oldReadiness.resolve({ ...ready(), ready: true }); });
  expect(screen.queryByRole("button", { name: "Abrir competencia" })).not.toBeInTheDocument();
  await act(async () => { freshReadiness.resolve({ ...ready(), ready: true }); });
  expect(within(await screen.findByRole("region", { name: "Requisitos para abrir el evento" })).getByRole("button", { name: "Abrir competencia" })).toBeEnabled();
});

it("abre los participantes desde su comparsa y permite volver para elegir otra", async () => {
  const ana = { id: "n1", rubricId: "r1", eventTroupeId: "t1", displayName: "Ana", subjectType: "PERSON", active: true };
  mockCatalog({
    troupes: () => [{ id: "t1", name: "Estrella", active: true }, { id: "t2", name: "Luna", active: true }],
    rubrics: () => [{ ...rubric, evaluationTarget: "NOMINATION", nominations: [ana] }],
    readiness: () => ({ ...ready(), incompleteNominations: [{ rubricId: "r1", rubricName: "Vestuario", troupeId: "t2", troupeName: "Luna" }] }),
  });
  render(<AdminCompetenciaPage event={event()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Participantes de Estrella" }));
  const view = await screen.findByRole("region", { name: "Participantes de Estrella" });
  expect(within(view).getByText("Ana")).toBeInTheDocument();
  expect(within(view).getByRole("list")).not.toHaveTextContent("Luna");
  expect(within(view).queryByText("Falta cargar")).not.toBeInTheDocument();
  expect(within(view).queryByRole("combobox")).not.toBeInTheDocument();
  fireEvent.click(within(view).getByRole("button", { name: "Volver a comparsas" }));
  expect(screen.getByRole("button", { name: "Participantes de Estrella" })).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "Participantes de Luna" }));
  const luna = await screen.findByRole("region", { name: "Participantes de Luna" });
  expect(within(luna).queryByText("Ana")).not.toBeInTheDocument();
  expect(within(luna).queryByRole("list")).not.toBeInTheDocument();
  expect(within(luna).getByText("Falta cargar")).toBeInTheDocument();
});

it("agrega desde la comparsa en un único modal y no envía nada al cancelar", async () => {
  const nomination = { id: "n2", rubricId: "r1", eventTroupeId: "t1", displayName: "Ana", subjectType: "PERSON", active: true };
  let nominations = [];
  mockCatalog({
    troupes: () => [{ id: "t1", name: "Estrella", active: true }],
    rubrics: () => [{ ...rubric, evaluationTarget: "NOMINATION", nominations }],
  });
  const read = apiRequest.getMockImplementation();
  apiRequest.mockImplementation(async (path, options) => {
    if (options?.method === "POST" && path.endsWith("/nominations")) { nominations = [nomination]; return nomination; }
    return read(path, options);
  });
  render(<AdminCompetenciaPage event={event()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Participantes de Estrella" }));
  const view = await screen.findByRole("region", { name: "Participantes de Estrella" });
  fireEvent.click(await within(view).findByRole("button", { name: "Agregar participante a Vestuario" }));
  const cancelled = await screen.findByRole("dialog", { name: "Agregar participante al rubro" });
  fireEvent.change(within(cancelled).getByRole("textbox", { name: "Nombre del participante" }), { target: { value: "Borrador" } });
  fireEvent.click(within(cancelled).getByRole("button", { name: "Cancelar" }));
  expect(posts()).toHaveLength(0);
  fireEvent.click(within(view).getByRole("button", { name: "Agregar participante a Vestuario" }));
  const dialog = await screen.findByRole("dialog", { name: "Agregar participante al rubro" });
  expect(dialog).toHaveTextContent(/Estrella.*Vestuario/);
  expect(dialog).toHaveTextContent("Danza");
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Nombre del participante" }), { target: { value: " Ana " } });
  expect(posts()).toHaveLength(0);
  fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar y agregar" }));
  await waitFor(() => expect(posts()).toHaveLength(1));
  expect(posts()[0][0]).toBe("/api/v1/rubrics/r1/nominations");
  expect(JSON.parse(posts()[0][1].body)).toEqual({ eventTroupeId: "t1", displayName: "Ana" });
  expect(await within(view).findByText("Ana")).toBeInTheDocument();
});

it("desde la comparsa respeta el límite de tres activos en rubros aleatorios", async () => {
  const nominations = ["Ana", "Beto", "Caro"].map((displayName, index) => ({
    id: `n${index}`, rubricId: "r1", eventTroupeId: "t1", displayName, subjectType: "PERSON", active: true,
  }));
  mockCatalog({
    troupes: () => [{ id: "t1", name: "Estrella", active: true }],
    rubrics: () => [{ ...rubric, evaluationTarget: "NOMINATION", rubricType: "RANDOM", nominations }],
  });
  render(<AdminCompetenciaPage event={event()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Participantes de Estrella" }));
  expect(screen.getByText(/3 de 3 activos/)).toBeInTheDocument();
  expect(screen.getByText("Máximo 3 participantes activos en este rubro.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Agregar participante a Vestuario" })).not.toBeInTheDocument();
});

it("desde la comparsa desactiva un participante con confirmación", async () => {
  const nomination = { id: "n1", rubricId: "r1", eventTroupeId: "t1", displayName: "Ana", subjectType: "PERSON", active: true };
  mockCatalog({
    troupes: () => [{ id: "t1", name: "Estrella", active: true }],
    rubrics: () => [{ ...rubric, evaluationTarget: "NOMINATION", nominations: [nomination] }],
  });
  const read = apiRequest.getMockImplementation();
  apiRequest.mockImplementation(async (path, options) => {
    if (options?.method === "PATCH" && path === "/api/v1/nominations/n1") return { ...nomination, active: false };
    return read(path, options);
  });
  render(<AdminCompetenciaPage event={event()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Participantes de Estrella" }));
  fireEvent.click(screen.getByRole("button", { name: "Desactivar a Ana en Vestuario" }));
  const dialog = await screen.findByRole("dialog", { name: "Desactivar participante" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Desactivar" }));
  await waitFor(() => expect(apiRequest.mock.calls.some(([path, options]) => path === "/api/v1/nominations/n1" && options?.method === "PATCH")).toBe(true));
  expect(await screen.findByText("Inactivo")).toBeInTheDocument();
});

it("Evaluación conserva los rubros sin el selector de vista anterior", async () => {
  mockCatalog();
  render(<AdminCompetenciaPage event={event()} initialStep="rubros" />);
  expect(await screen.findByRole("button", { name: "Crear ítem en Vestuario" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Por comparsa" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Por rubro" })).not.toBeInTheDocument();
});

it.each(["OPEN", "CLOSED"])("permite consultar participantes pero no modificarlos en %s", async (status) => {
  mockCatalog({
    troupes: () => [{ id: "t1", name: "Estrella", active: true }],
    rubrics: () => [{ ...rubric, evaluationTarget: "NOMINATION", nominations: [{ id: "n1", eventTroupeId: "t1", displayName: "Ana", active: true }] }],
  });
  render(<AdminCompetenciaPage event={{ ...event(), status }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Participantes de Estrella" }));
  const view = await screen.findByRole("region", { name: "Participantes de Estrella" });
  expect(await within(view).findByText("Ana")).toBeInTheDocument();
  expect(within(view).queryByRole("button", { name: /Agregar participante/ })).not.toBeInTheDocument();
  expect(within(view).queryByRole("button", { name: /Desactivar/ })).not.toBeInTheDocument();
});

it("conserva el nombre y muestra el rechazo dentro del modal sin anunciar un alta", async () => {
  mockCatalog({
    troupes: () => [{ id: "t1", name: "Estrella", active: true }],
    rubrics: () => [{ ...rubric, evaluationTarget: "NOMINATION" }],
  });
  const read = apiRequest.getMockImplementation();
  apiRequest.mockImplementation(async (path, options) => {
    if (options?.method === "POST") throw Object.assign(new Error("duplicate"), { code: "NOMINATION_ALREADY_EXISTS" });
    return read(path, options);
  });
  render(<AdminCompetenciaPage event={event()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Participantes de Estrella" }));
  fireEvent.click(await screen.findByRole("button", { name: "Agregar participante a Vestuario" }));
  const dialog = await screen.findByRole("dialog", { name: "Agregar participante al rubro" });
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Nombre del participante" }), { target: { value: "Ana" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar y agregar" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("ya está cargado");
  expect(within(dialog).getByRole("textbox", { name: "Nombre del participante" })).toHaveValue("Ana");
  expect(screen.queryByText("Participante agregado al rubro.")).not.toBeInTheDocument();
});

it("orienta hacia Rubros cuando la comparsa no tiene rubros de nominación disponibles", async () => {
  mockCatalog({ troupes: () => [{ id: "t1", name: "Estrella", active: true }] });
  render(<AdminCompetenciaPage event={event()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Participantes de Estrella" }));
  expect(await screen.findByText(/No hay rubros de nominación activos/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Ir a Rubros" }));
  expect(await screen.findByRole("button", { name: "Agregar rubro" })).toBeInTheDocument();
});

it("un error de carga de participantes ofrece reintento sin afirmar que no hay rubros", async () => {
  let fails = true;
  mockCatalog({
    troupes: () => [{ id: "t1", name: "Estrella", active: true }],
    rubrics: () => { if (fails) throw new Error("offline"); return [{ ...rubric, evaluationTarget: "NOMINATION" }]; },
  });
  render(<AdminCompetenciaPage event={event()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Participantes de Estrella" }));
  const view = await screen.findByRole("region", { name: "Participantes de Estrella" });
  const alert = await within(view).findByRole("alert");
  expect(within(view).queryByText(/No hay rubros de nominación activos/)).not.toBeInTheDocument();
  fails = false;
  fireEvent.click(within(alert).getByRole("button", { name: "Reintentar" }));
  expect(await within(view).findByRole("button", { name: "Agregar participante a Vestuario" })).toBeInTheDocument();
});

it("una confirmación pendiente no duplica el alta ni cierra el modal al cancelar", async () => {
  const accepted = deferred();
  mockCatalog({
    troupes: () => [{ id: "t1", name: "Estrella", active: true }],
    rubrics: () => [{ ...rubric, evaluationTarget: "NOMINATION" }],
  });
  const read = apiRequest.getMockImplementation();
  apiRequest.mockImplementation((path, options) => options?.method === "POST" ? accepted.promise : read(path, options));
  render(<AdminCompetenciaPage event={event()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Participantes de Estrella" }));
  fireEvent.click(await screen.findByRole("button", { name: "Agregar participante a Vestuario" }));
  const dialog = await screen.findByRole("dialog", { name: "Agregar participante al rubro" });
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Nombre del participante" }), { target: { value: "Ana" } });
  const form = within(dialog).getByRole("button", { name: "Confirmar y agregar" }).closest("form");
  fireEvent.submit(form);
  fireEvent.submit(form);
  fireEvent(dialog, new Event("cancel", { bubbles: true, cancelable: true }));
  expect(posts()).toHaveLength(1);
  expect(dialog).toHaveAttribute("open");
  expect(within(dialog).getByRole("button", { name: "Guardando…" })).toBeDisabled();
  expect(screen.queryByText("Participante agregado al rubro.")).not.toBeInTheDocument();
  await act(async () => accepted.resolve({ id: "n1", rubricId: "r1", eventTroupeId: "t1", displayName: "Ana", active: true }));
  expect(await screen.findByText("Participante agregado al rubro.")).toBeInTheDocument();
  expect(screen.getByText("Ana")).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("cambiar de evento descarta la comparsa y el modal de participantes anteriores", async () => {
  mockCatalog({
    troupes: (path) => [{ id: path.includes("/e1/") ? "t1" : "t2", name: path.includes("/e1/") ? "Estrella" : "Luna", active: true }],
    rubrics: () => [{ ...rubric, evaluationTarget: "NOMINATION" }],
  });
  const { rerender } = render(<AdminCompetenciaPage event={event()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Participantes de Estrella" }));
  fireEvent.click(await screen.findByRole("button", { name: "Agregar participante a Vestuario" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Nombre del participante" }), { target: { value: "Borrador de Estrella" } });
  rerender(<AdminCompetenciaPage event={event("e2")} />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Participantes de Estrella" })).not.toBeInTheDocument();
  fireEvent.click(await screen.findByRole("button", { name: "Participantes de Luna" }));
  fireEvent.click(await screen.findByRole("button", { name: "Agregar participante a Vestuario" }));
  expect(screen.getByRole("textbox", { name: "Nombre del participante" })).toHaveValue("");
  expect(posts()).toHaveLength(0);
});
