import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AdminCompetenciaPage as CompetitionPage } from "../pages/AdminCompetenciaPage.jsx";
import { apiRequest, ApiError } from "../api/http.js";
import { readinessStepStates, readinessIssues } from "../features/readiness-presentation.js";

vi.mock("../api/http.js", async (importOriginal) => ({ ...(await importOriginal()), apiRequest: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
function AdminCompetenciaPage(props) { return <CompetitionPage initialStep="catalogo" {...props} />; }
const event = { id: "e1", name: "Carnaval", status: "CONFIGURING" };
const ready = { ready: false, missing: ["ACTIVE_RUBRIC"], incompleteTroupes: [], incompleteRubrics: [], incompleteNominations: [], incompleteSchedules: [], nightsWithoutJury: [] };
const queen = { id: "r1", name: "Reina", active: true, evaluationTarget: "NOMINATION", expectedSubjectType: "PERSON", rubricType: "NOMINATIVE", resolutionMethod: "JURY", items: [], criteria: [], nominations: [{ id: "n1", rubricId: "r1", eventTroupeId: "t1", troupeName: "Estrella", displayName: "Ana", active: true }] };
function setup(overrides = {}) {
  const data = { rubrics: [], specialties: [], troupes: [{ id: "t1", name: "Estrella", active: true }], readiness: ready, ...overrides };
  apiRequest.mockImplementation(async (path, options) => {
    if (options?.method === "POST" && path.endsWith("/rubrics")) {
      const saved = { ...queen, ...JSON.parse(options.body), nominations: [] };
      data.rubrics.push(saved);
      return saved;
    }
    if (options?.method === "POST" && path.endsWith("/items")) {
      const saved = { id: "i1", active: true, ...JSON.parse(options.body) };
      data.rubrics[0].items.push(saved);
      return saved;
    }
    return structuredClone(data[path.split("?")[0].split("/").at(-1)] ?? []);
  });
  return data;
}

it("inicia con Rubros y ofrece los seis pasos en el orden aprobado", async () => {
  setup();
  render(<AdminCompetenciaPage event={event} />);
  const nav = screen.getByRole("navigation", { name: "Pasos de configuración de competencia" });
  expect(within(nav).getAllByRole("button").map((button) => button.textContent.replace(/^\d/, "").replace(/Completo|Incompleto|Pendiente de revisión|No se pudo revisar/g, "").trim()))
    .toEqual(["Rubros", "Especialidades", "Evaluación", "Comparsas", "Asignar jurados", "Revisión final"]);
  expect(await screen.findByRole("button", { name: "Agregar rubro" })).toBeInTheDocument();
  expect(screen.getByText("Paso 1 de 6")).toBeInTheDocument();
});

it("crea un rubro de participantes sin especialidades ni ítems y lo ofrece dentro de la comparsa", async () => {
  setup();
  render(<AdminCompetenciaPage event={event} />);
  fireEvent.click(await screen.findByRole("button", { name: "Agregar rubro" }));
  const form = screen.getByRole("button", { name: "Crear rubro" }).closest("form");
  fireEvent.change(within(form).getByLabelText("Nombre del rubro"), { target: { value: "Reina" } });
  fireEvent.change(within(form).getByLabelText("A quién se evalúa"), { target: { value: "NOMINATION" } });
  expect(within(form).queryByRole("button", { name: "Agregar otro ítem" })).not.toBeInTheDocument();
  expect(within(form).queryByLabelText(/Especialidad/)).not.toBeInTheDocument();
  fireEvent.submit(form);
  await screen.findByText("Rubro guardado.");
  const writes = apiRequest.mock.calls.filter(([, options]) => options?.method === "POST");
  expect(writes).toHaveLength(1);
  expect(writes[0][0]).toBe("/api/v1/events/e1/rubrics");
  expect(JSON.parse(writes[0][1].body)).toMatchObject({ name: "Reina", evaluationTarget: "NOMINATION", expectedSubjectType: "PERSON", rubricType: "NOMINATIVE" });
  expect(JSON.parse(writes[0][1].body)).not.toHaveProperty("initialItem");
  fireEvent.click(screen.getByRole("button", { name: /^Comparsas / }));
  fireEvent.click(await screen.findByRole("button", { name: "Participantes de Estrella" }));
  expect(await screen.findByRole("button", { name: "Agregar participante a Reina" })).toBeInTheDocument();
});

it("Evaluación usa el rubro existente y muestra sus participantes para crear sus ítems", async () => {
  setup({ rubrics: [structuredClone(queen)], specialties: [{ id: "s1", name: "Danza", active: true }], readiness: { ...ready, missing: [], incompleteRubrics: [{ id: "r1", name: "Reina" }] } });
  render(<AdminCompetenciaPage event={event} initialStep="rubros" />);
  const add = await screen.findByRole("button", { name: "Crear ítem en Reina" });
  expect(screen.queryByRole("button", { name: /Agregar rubro|Crear primer rubro/ })).not.toBeInTheDocument();
  expect(screen.getByText("1 participante activo")).toBeInTheDocument();
  fireEvent.click(add);
  const dialog = await screen.findByRole("dialog", { name: "Crear ítem en Reina" });
  fireEvent.change(within(dialog).getByLabelText("Nuevo item puntuable para Reina"), { target: { value: "Presencia" } });
  fireEvent.change(within(dialog).getByLabelText("Especialidad del nuevo item para Reina"), { target: { value: "s1" } });
  fireEvent.submit(dialog.querySelector("form"));
  fireEvent.click(await screen.findByRole("button", { name: "Confirmar y guardar" }));
  expect(await screen.findByText("Item guardado.")).toBeInTheDocument();
  expect(apiRequest.mock.calls.filter(([, options]) => options?.method === "POST").map(([path]) => path)).toEqual(["/api/v1/rubrics/r1/items"]);
  expect(screen.getAllByText("Presencia").length).toBeGreaterThan(0);
});

it("el catálogo permite completar Rubros aunque todavía falten sus ítems de Evaluación", () => {
  const states = readinessStepStates({ ...ready, missing: [], incompleteRubrics: [{ id: "r1", name: "Reina" }] }, "available");
  expect(states.catalogo).toBe("complete");
  expect(states.rubros).toBe("incomplete");
  expect(states.especialidades).toBe("complete");
  expect(states.asignaciones).toBe("complete");
  expect(states.revision).toBe("incomplete");
  const issues = readinessIssues({ ...ready, incompleteRubrics: [{ id: "r1", name: "Reina" }] });
  expect(issues.find((issue) => issue.key === "missing-ACTIVE_RUBRIC").href).toBe("#/admin/competencia?step=catalogo");
  expect(issues.find((issue) => issue.key === "rubric-r1").href).toBe("#/admin/competencia?step=rubros");
});

it("separa bloqueos por especialidades de los bloqueos por asignación de jurados", () => {
  const readiness = { ...ready, missing: ["ACTIVE_SPECIALTY"], nightsWithoutJury: [{ nightId: "n1", nightName: "Noche 1" }] };
  const states = readinessStepStates(readiness, "available");
  expect(states.especialidades).toBe("incomplete");
  expect(states.asignaciones).toBe("incomplete");
  const issues = readinessIssues(readiness);
  expect(issues.find((issue) => issue.key === "missing-ACTIVE_SPECIALTY").href).toBe("#/admin/competencia?step=especialidades");
  expect(issues.find((issue) => issue.key === "jury-n1").href).toBe("#/admin/competencia?step=asignaciones");
});

it.each(["red", "5xx", "sin ID"])("un POST de rubro incierto (%s) no se reenvía ni se confirma por coincidencia en GET", async (failure) => {
  setup();
  const read = apiRequest.getMockImplementation();
  apiRequest.mockImplementation(async (path, options) => {
    if (options?.method === "POST") {
      if (failure === "sin ID") return { name: "Reina" };
      throw new ApiError({ status: failure === "red" ? 0 : 503, code: failure === "red" ? "NETWORK_ERROR" : "INTERNAL_ERROR" });
    }
    if (path.endsWith("/rubrics")) return [queen];
    return read(path, options);
  });
  render(<AdminCompetenciaPage event={event} />);
  fireEvent.click(await screen.findByRole("button", { name: "Agregar rubro" }));
  const form = screen.getByRole("button", { name: "Crear rubro" }).closest("form");
  fireEvent.change(within(form).getByLabelText("Nombre del rubro"), { target: { value: "Reina" } });
  fireEvent.submit(form);
  expect(await screen.findByText(/Resultado por comprobar:/)).toBeInTheDocument();
  fireEvent.click(within(form).getByRole("button", { name: "Revisar configuración guardada" }));
  expect(await within(form).findByText(/Un GET, incluso con nombre o ID coincidente/)).toBeInTheDocument();
  fireEvent.submit(form);
  await act(async () => {});
  expect(apiRequest.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
  expect(screen.queryByText("Rubro guardado.")).not.toBeInTheDocument();
});

it.each([[401, "UNAUTHENTICATED"], [409, "RESOURCE_CONFLICT"], [429, "RATE_LIMIT_EXCEEDED"]])("un rechazo %i conserva el borrador y permite corregir y reintentar", async (status, code) => {
  setup();
  const read = apiRequest.getMockImplementation();
  let rejected = false;
  apiRequest.mockImplementation(async (path, options) => {
    if (options?.method === "POST" && !rejected) {
      rejected = true;
      throw new ApiError({ status, code });
    }
    return read(path, options);
  });
  render(<AdminCompetenciaPage event={event} />);
  fireEvent.click(await screen.findByRole("button", { name: "Agregar rubro" }));
  const form = screen.getByRole("button", { name: "Crear rubro" }).closest("form");
  const name = within(form).getByLabelText("Nombre del rubro");
  fireEvent.change(name, { target: { value: "Reina" } });
  fireEvent.submit(form);
  await within(form).findByText(/Error total:/);
  expect(name).toHaveValue("Reina");
  expect(within(form).getByRole("button", { name: "Crear rubro" })).toBeEnabled();
  expect(screen.queryByText(/Resultado por comprobar:/)).not.toBeInTheDocument();
  fireEvent.change(name, { target: { value: "Reina nueva" } });
  fireEvent.submit(form);
  await screen.findByText("Rubro guardado.");
  const writes = apiRequest.mock.calls.filter(([, options]) => options?.method === "POST");
  expect(writes).toHaveLength(2);
  expect(JSON.parse(writes[1][1].body).name).toBe("Reina nueva");
});

it("descartar una nominación reinicia el siguiente rubro como comparsa", async () => {
  setup();
  render(<AdminCompetenciaPage event={event} />);
  fireEvent.click(await screen.findByRole("button", { name: "Agregar rubro" }));
  const form = screen.getByRole("button", { name: "Crear rubro" }).closest("form");
  fireEvent.change(within(form).getByLabelText("A quién se evalúa"), { target: { value: "NOMINATION" } });
  fireEvent.click(within(form).getByRole("button", { name: "Cancelar" }));
  fireEvent.click(within(await screen.findByRole("dialog", { name: /descartar cambios/i })).getByRole("button", { name: /Descartar/ }));
  fireEvent.click(screen.getByRole("button", { name: "Agregar rubro" }));
  const fresh = screen.getByRole("button", { name: "Crear rubro" }).closest("form");
  expect(within(fresh).getByLabelText("A quién se evalúa")).toHaveValue("TROUPE");
  expect(within(fresh).queryByLabelText("Qué tipo de participante")).not.toBeInTheDocument();
  fireEvent.change(within(fresh).getByLabelText("Nombre del rubro"), { target: { value: "Vestuario" } });
  fireEvent.submit(fresh);
  await screen.findByText("Rubro guardado.");
  const write = apiRequest.mock.calls.find(([, options]) => options?.method === "POST");
  expect(JSON.parse(write[1].body)).toMatchObject({ evaluationTarget: "TROUPE", expectedSubjectType: null });
});

it("un alta pendiente bloquea doble envío y salida del catálogo", async () => {
  setup();
  const read = apiRequest.getMockImplementation();
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  apiRequest.mockImplementation((path, options) => options?.method === "POST" ? pending : read(path, options));
  render(<AdminCompetenciaPage event={event} />);
  fireEvent.click(await screen.findByRole("button", { name: "Agregar rubro" }));
  const form = screen.getByRole("button", { name: "Crear rubro" }).closest("form");
  fireEvent.change(within(form).getByLabelText("Nombre del rubro"), { target: { value: "Reina" } });
  act(() => { fireEvent.submit(form); fireEvent.submit(form); });
  fireEvent.click(screen.getByRole("button", { name: /^Evaluación / }));
  expect(screen.getByRole("heading", { name: "Catálogo de rubros" })).toBeInTheDocument();
  expect(apiRequest.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
  await act(async () => { resolve(queen); });
  await screen.findByText("Rubro guardado.");
});

it("el acceso desde el catálogo selecciona la especialidad del rubro solicitado", async () => {
  setup({ rubrics: [{ ...queen, items: [{ id: "i1", name: "Ritmo", specialtyId: "s2", active: true }] }],
    specialties: [{ id: "s1", name: "Danza", active: true }, { id: "s2", name: "Música", active: true }] });
  render(<AdminCompetenciaPage event={event} />);
  fireEvent.click(await screen.findByRole("button", { name: "Configurar ítems en Evaluación" }));
  expect(await screen.findByRole("button", { name: "Ocultar criterios de Reina" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Música.*rubro/ })).toHaveAttribute("aria-pressed", "true");
});

it.each(["OPEN", "CLOSED"])("el catálogo de rubros queda en consulta en %s", async (status) => {
  setup({ rubrics: [queen] });
  render(<AdminCompetenciaPage event={{ ...event, status }} />);
  await waitFor(() => expect(screen.getAllByText("Reina").length).toBeGreaterThan(0));
  expect(screen.queryByRole("button", { name: "Agregar rubro" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Editar rubro" })).not.toBeInTheDocument();
});
