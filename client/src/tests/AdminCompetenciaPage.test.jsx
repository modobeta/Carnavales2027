import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../api/http.js";
import { AdminCompetenciaPage } from "../pages/AdminCompetenciaPage.jsx";

vi.mock("../api/http.js", () => ({ apiRequest: vi.fn() }));

const item = {
  id: "item-1",
  name: "Interpretacion",
  specialtyId: "specialty-1",
  specialtyName: "Danza",
  displayOrder: 1,
  required: true,
  allowNotPresented: true,
  active: true,
};

const rubric = {
  id: "rubric-1",
  name: "Coreografia",
  rubricType: "NOMINATIVE",
  resolutionMethod: "JURY",
  evaluationTarget: "TROUPE",
  active: true,
  items: [item],
  criteria: [{ id: "criterion-1", rubricId: "rubric-1", scoringItemId: item.id, description: "Precision", displayOrder: 1, active: true }],
};

function mockCompetitionData({ orphaned = [], rubrics = [rubric], specialties = [{ id: "specialty-1", name: "Danza", code: "DANZA", displayOrder: 1, active: true }], readiness = { ready: true, missing: [], incompleteTroupes: [], incompleteRubrics: [], incompleteSchedules: [], incompleteNominations: [], nightsWithoutJury: [] }, write = vi.fn().mockRejectedValue(new Error("Escritura inesperada")) } = {}) {
  const liveRubrics = rubrics.map((entry) => ({ ...entry }));
  apiRequest.mockImplementation(async (path, options) => {
    if (options?.method) {
      const result = await write(path, options);
      if (options.method === "POST" && path.endsWith("/rubrics") && result?.id) liveRubrics.push({ ...result, items: [], criteria: [], specialties: [] });
      return result;
    }
    if (path.endsWith("/readiness")) {
      if (readiness instanceof Error) throw readiness;
      return readiness;
    }
    if (path.endsWith("/troupes")) return [{ id: "troupe-1", name: "Estrella", categoryId: "category-1", active: true }];
    if (path.endsWith("/categories")) return [{ id: "category-1", name: "Comparsa", code: "COMPARSA", displayOrder: 1, active: true }];
    if (path.endsWith("/specialties")) return specialties;
    if (path.endsWith("/rubrics")) return liveRubrics.map((entry) => ({ ...entry }));
    if (path.startsWith("/api/v1/rubrics/")) return rubrics.find((entry) => path.endsWith(`/${entry.id}`));
    if (path.endsWith("/orphaned-criteria")) return orphaned;
    throw new Error(`Solicitud inesperada: ${path}`);
  });
}

describe("AdminCompetenciaPage", () => {
  afterEach(() => {
    cleanup();
    vi.resetAllMocks();
  });

  it("clasifica las cuatro etapas con los checks oficiales y limita la revisión a bloqueos readiness", async () => {
    mockCompetitionData({ readiness: {
      ready: false,
      missing: ["ACTIVE_TROUPE", "NIGHTS_WITHOUT_JURY"],
      incompleteTroupes: [{ id: "t-1", name: "Estrella" }],
      incompleteRubrics: [],
      incompleteSchedules: [],
      incompleteNominations: [],
      nightsWithoutJury: [{ nightId: "n-1", nightName: "Noche 1" }],
    } });
    render(<AdminCompetenciaPage event={{ id: "event-1", name: "Carnaval", status: "CONFIGURING" }} />);

    expect(await screen.findAllByText("Incompleto", { selector: ".competencia-step-state" })).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: /Revisión final/ }));
    expect(await screen.findByText(/Estrella/)).toBeInTheDocument();
    expect(screen.getByText("Asigná jurado activo a esta jornada de competencia.")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Bloqueos oficiales de readiness" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Revisar asignaciones" })).toHaveAttribute("href", "#/admin/assignments");
  });

  it("mantiene el estado no disponible si readiness no pudo consultarse", async () => {
    mockCompetitionData({ readiness: new Error("offline") });
    render(<AdminCompetenciaPage event={{ id: "event-1", status: "CONFIGURING" }} />);

    expect(await screen.findAllByText("No disponible")).not.toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: /Evaluación/ }));
    expect(await screen.findByText("No se pudo comprobar el estado de evaluación ahora. La Revisión final verificará los bloqueos oficiales.")).toBeInTheDocument();
    expect(screen.queryByText(/configuración está completa y lista/)).not.toBeInTheDocument();
  });

  it("muestra el estado legible del evento activo en la cabecera", () => {
    mockCompetitionData();
    render(<AdminCompetenciaPage event={{ id: "event-1", name: "Carnaval", status: "CONFIGURING" }} />);

    expect(screen.getByText("Estado del evento: En configuración")).toBeInTheDocument();
  });

  it("indica que el estado no está disponible cuando el evento no lo informa", () => {
    mockCompetitionData();
    render(<AdminCompetenciaPage event={{ id: "event-1", name: "Carnaval" }} />);

    expect(screen.getByText("Estado del evento: No disponible")).toBeInTheDocument();
  });

  it("abre el paso indicado por el enlace del panel lateral", async () => {
    mockCompetitionData();
    render(<AdminCompetenciaPage event={{ id: "event-1", name: "Carnaval", status: "CONFIGURING" }} initialStep="rubros" />);

    expect(await screen.findByRole("heading", { name: "Configurar evaluación" })).toBeInTheDocument();
    expect(screen.getByText("Definí qué va a evaluar cada jurado y cómo se registrará su evaluación.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Paso 3 de 4: Evaluación/ })).toHaveAttribute("aria-current", "step");
  });

  it("oculta el formulario de rubro hasta que se solicite y adapta el sujeto al objetivo", async () => {
    mockCompetitionData();
    render(<AdminCompetenciaPage event={{ id: "event-1", status: "CONFIGURING" }} initialStep="rubros" />);

    expect(screen.queryByRole("button", { name: "Crear rubro" })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "+ Agregar rubro" }));
    const form = screen.getByRole("button", { name: "Crear rubro" }).closest("form");
    const target = within(form).getByLabelText("A quién se evalúa");
    expect(within(form).queryByLabelText("Qué tipo de participante")).not.toBeInTheDocument();

    fireEvent.change(target, { target: { value: "NOMINATION" } });
    expect(within(form).getByLabelText("Qué tipo de participante")).toBeInTheDocument();
    fireEvent.change(target, { target: { value: "TROUPE" } });
    expect(within(form).queryByLabelText("Qué tipo de participante")).not.toBeInTheDocument();
  });

  it("filtra por especialidad usando los ítems existentes y mantiene visible el rubro compartido", async () => {
    const vestidoItem = { ...item, id: "item-vestido", specialtyId: "specialty-2", specialtyName: "Vestido", name: "Terminación" };
    const shared = { ...rubric, items: [item, vestidoItem] };
    const vestidoOnly = { ...rubric, id: "rubric-vestido", name: "Vestuario", items: [{ ...vestidoItem, id: "item-vestuario", rubricId: "rubric-vestido" }] };
    mockCompetitionData({
      rubrics: [shared, vestidoOnly],
      specialties: [
        { id: "specialty-1", name: "Danza", code: "DANZA", displayOrder: 1, active: true },
        { id: "specialty-2", name: "Vestido", code: "VESTIDO", displayOrder: 2, active: true },
      ],
    });
    render(<AdminCompetenciaPage event={{ id: "event-1", status: "CONFIGURING" }} initialStep="rubros" />);

    expect(await screen.findByRole("heading", { name: "Rubros de Danza" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Coreografia" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Vestido/ }));
    expect(await screen.findByRole("heading", { name: "Rubros de Vestido" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Coreografia" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Vestuario" })).toBeInTheDocument();
    expect(screen.getByText(/Este rubro se comparte entre Danza y Vestido/)).toBeInTheDocument();
  });

  it("renderiza bajo la capa de instrumento data-layer='instrument' (RF-177)", () => {
    mockCompetitionData();
    const { container } = render(<AdminCompetenciaPage event={{ id: "event-1", name: "Carnaval", status: "CONFIGURING" }} />);
    expect(container.querySelector("main.admin-shell")).toHaveAttribute("data-layer", "instrument");
  });

  it("agrupa las acciones del rubro para mantenerlas próximas entre sí", async () => {
    mockCompetitionData();
    const { container } = render(<AdminCompetenciaPage event={{ id: "event-1", name: "Carnaval", status: "CONFIGURING" }} />);

    fireEvent.click(screen.getByRole("button", { name: /Evaluación/ }));
    await screen.findByRole("button", { name: "Expandir Coreografia" });

    const actions = container.querySelector('[data-rubric-id="rubric-1"] .rubric-card-actions');
    expect(actions).not.toBeNull();
    expect(within(actions).getByRole("button", { name: "Expandir Coreografia" })).toBeInTheDocument();
    expect(within(actions).getByRole("button", { name: "Desactivar rubro Coreografia" })).toBeInTheDocument();
  });

  it("usa categorias existentes como tipos de participacion", async () => {
    mockCompetitionData();
    render(<AdminCompetenciaPage event={{ id: "event-1", name: "Carnaval", status: "CONFIGURING" }} />);

    fireEvent.click(screen.getByRole("button", { name: /Participantes/ }));
    expect(await screen.findByText("COMPARSA")).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/events/event-1/categories");
    expect(apiRequest.mock.calls.some(([path]) => path.includes("participation-types"))).toBe(false);
  });

  it("muestra criterios dentro de su item y deriva la matriz", async () => {
    mockCompetitionData();
    const { container } = render(<AdminCompetenciaPage event={{ id: "event-1", name: "Carnaval", status: "CONFIGURING" }} />);

    fireEvent.click(screen.getByRole("button", { name: /Evaluación/ }));
    fireEvent.click(screen.getByRole("tab", { name: "Ítems" }));
    fireEvent.click(await screen.findByRole("button", { name: "Expandir Coreografia" }));
    const rubricCard = container.querySelector('[data-rubric-id="rubric-1"]');
    expect(within(rubricCard).getByText("Interpretacion")).toBeInTheDocument();
    expect(within(rubricCard).getByText("Precision")).toBeInTheDocument();
  });

  it("reasigna un criterio historico al item seleccionado", async () => {
    mockCompetitionData({
      orphaned: [{ id: "orphan-1", rubricId: "rubric-1", rubricName: "Coreografia", description: "Expresion" }],
      write: vi.fn().mockResolvedValue({ id: "orphan-1", rubricId: "rubric-1", scoringItemId: item.id, description: "Expresion", displayOrder: 2, active: true }),
    });
    render(<AdminCompetenciaPage event={{ id: "event-1", name: "Carnaval", status: "CONFIGURING" }} />);

    fireEvent.click(screen.getByRole("button", { name: /Evaluación/ }));
    fireEvent.click(screen.getByRole("tab", { name: "Ítems" }));
    expect(await screen.findByText(/Expresion/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Item para Coreografia: Expresion" }), { target: { value: item.id } });
    fireEvent.click(screen.getByRole("button", { name: "Reasignar Expresion" }));
    expect(apiRequest).not.toHaveBeenCalledWith("/api/v1/rubric-criteria/orphan-1", expect.anything());
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar reasignación" }));

    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "/api/v1/rubric-criteria/orphan-1",
      { method: "PATCH", body: JSON.stringify({ scoringItemId: item.id }) },
    ));
    expect(await screen.findByText("Criterio reasignado.")).toBeInTheDocument();
  });

  it.each(["PERSON", "COUPLE", "GROUP", "FIGURE", "ELEMENT", "OTHER"])("crea NOMINATION con sujeto %s", async (subjectType) => {
    const write = vi.fn().mockImplementation(async (_path, options) => ({ id: "new-rubric", ...JSON.parse(options.body) }));
    mockCompetitionData({ write });
    render(<AdminCompetenciaPage event={{ id: "event-1", status: "CONFIGURING" }} />);
    fireEvent.click(screen.getByRole("button", { name: /Evaluación/ }));
    fireEvent.click(await screen.findByRole("button", { name: "+ Agregar rubro" }));
    await screen.findByRole("button", { name: "Expandir Coreografia" });
    const form = screen.getByRole("button", { name: "Crear rubro" }).closest("form");
    const fields = within(form);
    fireEvent.change(fields.getByLabelText("A quién se evalúa"), { target: { value: "NOMINATION" } });
    expect(Array.from(fields.getByLabelText("Qué tipo de participante").options, (option) => option.value))
      .toEqual(["PERSON", "COUPLE", "GROUP", "FIGURE", "ELEMENT", "OTHER"]);
    fireEvent.change(fields.getByLabelText("Nombre del rubro"), { target: { value: "Figura destacada" } });
    fireEvent.change(fields.getByLabelText("Qué tipo de participante"), { target: { value: subjectType } });
    fireEvent.change(fields.getByLabelText("Método de resolución"), { target: { value: "COMMITTEE" } });
    fireEvent.change(fields.getByLabelText("Detalle adicional (opcional)"), { target: { value: "Participante" } });
    fireEvent.submit(form);
    await screen.findByText("Rubro guardado.");
    expect(write).toHaveBeenCalledExactlyOnceWith("/api/v1/events/event-1/rubrics", {
      method: "POST",
      body: JSON.stringify({ name: "Figura destacada", evaluationTarget: "NOMINATION", rubricType: "NOMINATIVE", resolutionMethod: "COMMITTEE", evaluationObjective: "Participante", expectedSubjectType: subjectType }),
    });
    expect(screen.queryByRole("button", { name: "Crear rubro" })).not.toBeInTheDocument();
  });

  it.each([
    ["TROUPE", null, "NOMINATION", "COUPLE"],
    ["NOMINATION", "FIGURE", "NOMINATION", "FIGURE"],
    ["NOMINATION", "PERSON", "NOMINATION", "GROUP"],
    ["NOMINATION", "ELEMENT", "TROUPE", null],
  ])("edita %s/%s a %s/%s", async (initialTarget, initialSubject, target, subject) => {
    const write = vi.fn().mockImplementation(async (_path, options) => ({ id: rubric.id, ...JSON.parse(options.body) }));
    mockCompetitionData({ write, rubrics: [{ ...rubric, evaluationTarget: initialTarget, expectedSubjectType: initialSubject }] });
    render(<AdminCompetenciaPage event={{ id: "event-1", status: "CONFIGURING" }} />);
    fireEvent.click(screen.getByRole("button", { name: /Evaluación/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Expandir Coreografia" }));
    fireEvent.click(await screen.findByRole("button", { name: "Editar rubro" }));
    const form = screen.getByRole("button", { name: "Guardar rubro" }).closest("form");
    const fields = within(form);
    if (initialTarget === "NOMINATION") expect(fields.getByLabelText("Qué tipo de participante")).toHaveValue(initialSubject ?? "PERSON");
    else expect(fields.queryByLabelText("Qué tipo de participante")).not.toBeInTheDocument();
    fireEvent.change(fields.getByLabelText("A quién se evalúa"), { target: { value: target } });
    if (subject) fireEvent.change(fields.getByLabelText("Qué tipo de participante"), { target: { value: subject } });
    fireEvent.submit(form);
    expect(write).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar y guardar" }));
    await screen.findByText("Rubro guardado.");
    expect(write).toHaveBeenCalledExactlyOnceWith("/api/v1/rubrics/rubric-1", {
      method: "PATCH",
      body: JSON.stringify({ name: "Coreografia", evaluationTarget: target, expectedSubjectType: subject, rubricType: "NOMINATIVE", resolutionMethod: "JURY", evaluationObjective: null, active: true }),
    });
  });

  it.each([
    [/Participantes/, "+ Nuevo tipo", "Editar tipo Comparsa", "Agregar tipo", "/api/v1/events/event-1/categories", "/api/v1/categories/category-1", "category"],
    [/Jurados y especialidades/, "+ Nueva especialidad", "Editar especialidad Danza", "Agregar especialidad", "/api/v1/events/event-1/specialties", "/api/v1/specialties/specialty-1", "specialty"],
  ])("%s usa drawer con Orden de visualización y guarda crear/editar", async (section, createLabel, editLabel, submitLabel, createPath, editPath, prefix) => {
    const write = vi.fn().mockImplementation(async (path, options) => ({ id: `${prefix}-9`, ...JSON.parse(options.body) }));
    mockCompetitionData({ write });
    render(<AdminCompetenciaPage event={{ id: "event-1", status: "CONFIGURING" }} />);
    fireEvent.click(screen.getByRole("button", { name: section }));
    // Paso 1 muestra tipos y comparsas (2 tablas); el resto una sola.
    expect((await screen.findAllByRole("table"))).toHaveLength(String(section) === String(/Participantes/) ? 2 : 1);

    fireEvent.click(screen.getByRole("button", { name: createLabel }));
    const createForm = screen.getByRole("button", { name: submitLabel }).closest("form");
    const createFields = within(createForm);
    // Al crear, el orden lo asigna el servidor: el campo no se muestra.
    expect(createFields.queryByLabelText("Orden de visualización")).toBeNull();
    fireEvent.change(createFields.getByLabelText("Nombre"), { target: { value: "Nuevo" } });
    fireEvent.submit(createForm);
    await waitFor(() => expect(write).toHaveBeenCalledWith(
      createPath,
      { method: "POST", body: JSON.stringify({ name: "Nuevo" }) },
    ));
    expect(await screen.findByText("Guardado.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: editLabel }));
    const editForm = screen.getByRole("button", { name: "Guardar" }).closest("form");
    const editFields = within(editForm);
    expect(editFields.getByLabelText("Orden de visualización")).toBeInTheDocument();
    fireEvent.change(editFields.getByLabelText("Nombre"), { target: { value: "Editado" } });
    fireEvent.click(editFields.getByLabelText("Activa"));
    fireEvent.submit(editForm);
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar y guardar" }));
    await waitFor(() => expect(write).toHaveBeenCalledWith(
      editPath,
      expect.objectContaining({ method: "PATCH" }),
    ));
  });

  it("muestra mensaje humano ante nombre u orden duplicado", async () => {
    const write = vi.fn().mockRejectedValue({ code: "RESOURCE_CONFLICT" });
    mockCompetitionData({ write });
    render(<AdminCompetenciaPage event={{ id: "event-1", status: "CONFIGURING" }} />);
    fireEvent.click(screen.getByRole("button", { name: /Participantes/ }));
    expect((await screen.findAllByRole("table"))).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "+ Nuevo tipo" }));
    const form = screen.getByRole("button", { name: "Agregar tipo" }).closest("form");
    fireEvent.change(within(form).getByLabelText("Nombre"), { target: { value: "Duplicado" } });
    fireEvent.submit(form);
    expect(await screen.findByText("Ese nombre u orden ya está en uso.")).toBeInTheDocument();
  });

  it.each([
    [/Participantes/, "Eliminar tipo Comparsa", "Eliminar Comparsa", "/api/v1/categories/category-1", "Tipo Comparsa eliminado (desactivado en BD)."],
    [/Jurados y especialidades/, "Eliminar especialidad Danza", "Eliminar Danza", "/api/v1/specialties/specialty-1", "Especialidad Danza eliminada (desactivada en BD)."],
  ])("%s elimina con confirmacion previa", async (section, deleteLabel, dialogName, deletePath, message) => {
    const write = vi.fn().mockImplementation(async (path, options) => ({ id: path.split("/").at(-1), ...JSON.parse(options.body) }));
    mockCompetitionData({ write });
    render(<AdminCompetenciaPage event={{ id: "event-1", status: "CONFIGURING" }} />);
    fireEvent.click(screen.getByRole("button", { name: section }));
    fireEvent.click(await screen.findByRole("button", { name: deleteLabel }));
    expect(await screen.findByRole("dialog", { name: dialogName })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar (desactivar)" }));
    await waitFor(() => expect(write).toHaveBeenCalledWith(deletePath, {
      method: "PATCH",
      body: JSON.stringify({ active: false }),
    }));
    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it("desactiva rubro con confirmacion", async () => {
    const write = vi.fn().mockImplementation(async (path, options) => ({ id: path.split("/").at(-1), ...JSON.parse(options.body) }));
    mockCompetitionData({ write });
    render(<AdminCompetenciaPage event={{ id: "event-1", status: "CONFIGURING" }} />);
    fireEvent.click(screen.getByRole("button", { name: /Evaluación/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Desactivar rubro Coreografia" }));
    expect(await screen.findByRole("dialog", { name: "Desactivar Coreografia" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Desactivar" }));
    await waitFor(() => expect(write).toHaveBeenCalledWith(
      "/api/v1/rubrics/rubric-1",
      expect.objectContaining({ method: "PATCH" }),
    ));
    const [, options] = write.mock.calls.find(([path]) => path === "/api/v1/rubrics/rubric-1");
    expect(JSON.parse(options.body).active).toBe(false);
    expect(await screen.findByText("Rubro Coreografia desactivado.")).toBeInTheDocument();
  });
  it.each([
      [/Evaluación/, "Crear rubro", null, "/api/v1/events/event-1/rubrics"],
    [/Evaluación/, "Guardar rubro", "Expandir Coreografia", "/api/v1/rubrics/rubric-1"],
    [/Evaluación/, "Crear ítem en Coreografia", null, "/api/v1/rubrics/rubric-1/items"],
    [/Evaluación/, "Guardar item", "Editar item Interpretacion", "/api/v1/evaluation-items/item-1"],
    [/Evaluación/, "Agregar criterio a Interpretacion", "Expandir Coreografia", "/api/v1/rubrics/rubric-1/criteria"],
    [/Evaluación/, "Guardar criterio Precision", "Editar criterio Precision", "/api/v1/rubric-criteria/criterion-1"],
  ])("%s: %s conserva entradas, bloquea duplicados y permite reintentar", async (section, action, edit, path) => {
    let rejectWrite;
    const write = vi.fn().mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectWrite = reject; }))
      .mockImplementationOnce(async (_path, options) => ({
        id: path.split("/").at(-1), ...JSON.parse(options.body),
      }));
    mockCompetitionData({ write });
    render(<AdminCompetenciaPage event={{ id: "event-1", status: "CONFIGURING" }} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: section }));
    if (String(section) === String(/Evaluación/)) {
      const itemAction = ["Crear ítem en Coreografia", "Guardar item", "Agregar criterio a Interpretacion", "Guardar criterio Precision"].includes(action);
      if (itemAction) fireEvent.click(screen.getByRole("tab", { name: "Ítems" }));
      if (action === "Crear rubro") fireEvent.click(await screen.findByRole("button", { name: "+ Agregar rubro" }));
      if (action === "Crear ítem en Coreografia") fireEvent.click(await screen.findByRole("button", { name: action }));
      const expand = await screen.findByRole("button", { name: "Expandir Coreografia" });
      if (edit) fireEvent.click(expand);
      if (action === "Guardar rubro") {
        fireEvent.click(await screen.findByRole("button", { name: "Editar rubro" }));
      }
    } else {
      await screen.findByRole("button", { name: /^Editar / });
    }
    if (edit && edit !== "Expandir Coreografia") fireEvent.click(screen.getByRole("button", { name: edit }));
    const button = action === "Crear ítem en Coreografia"
      ? screen.getByRole("button", { name: "Agregar ítem" })
      : screen.getByRole("button", { name: action });
    const form = action === "Crear ítem en Coreografia"
      ? screen.getByRole("dialog", { name: "Crear ítem en Coreografia" }).querySelector("form")
      : button.closest("form");
    const fields = within(form);
    const text = fields.getByRole("textbox", { name: /Nombre|Nuevo item|Nuevo criterio|Descripcion/ });
    fireEvent.change(text, { target: { value: "Entrada conservada" } });
    for (const select of fields.queryAllByRole("combobox")) {
      const value = select.name === "evaluationTarget" ? "NOMINATION" :
        select.name === "expectedSubjectType" ? "OTHER" : Array.from(select.options).find((option) => option.value).value;
      fireEvent.change(select, { target: { value } });
    }
    for (const checkbox of fields.queryAllByRole("checkbox")) fireEvent.click(checkbox);
    for (const order of fields.queryAllByRole("spinbutton")) fireEvent.change(order, { target: { value: "3" } });
    const expectedBody = Object.fromEntries(new FormData(form));
    // Both events in one batch exercise the synchronous guard, not only disabled buttons.
    act(() => { fireEvent.submit(form); fireEvent.submit(form); });
    if (action === "Crear ítem en Coreografia") {
      expect(write).not.toHaveBeenCalled();
      fireEvent.click(await screen.findByRole("button", { name: "Confirmar y guardar" }));
    } else if (action.startsWith("Guardar")) {
      expect(write).not.toHaveBeenCalled();
      fireEvent.click(await screen.findByRole("button", { name: "Confirmar y guardar" }));
    }
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toBe(path);
    expect(write.mock.calls[0][1].method).toBe(action.startsWith("Guardar") ? "PATCH" : "POST");
    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "true");
    for (const control of screen.getAllByRole("button")) expect(control).toBeDisabled();
    for (const control of form.elements) expect(control).toBeDisabled();
    expect(text).toHaveValue("Entrada conservada");
    fireEvent.submit(form);
    const otherForm = Array.from(screen.getByRole("main").querySelectorAll("form")).find((candidate) => candidate !== form);
    if (otherForm) fireEvent.submit(otherForm);
    expect(write).toHaveBeenCalledTimes(1);
    await act(async () => { rejectWrite(new Error("Fallo de red")); });
    expect(await screen.findByText("No se pudo guardar.")).toBeInTheDocument();
    expect(button).toBeEnabled();
    expect(Object.fromEntries(new FormData(form))).toEqual(expectedBody);
    fireEvent.click(button);
    if (action.startsWith("Guardar") || action === "Crear ítem en Coreografia") fireEvent.click(await screen.findByRole("button", { name: "Confirmar y guardar" }));
    await waitFor(() => expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "false"));
    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[1]).toEqual(write.mock.calls[0]);
    expect(screen.queryByText("No se pudo guardar.")).not.toBeInTheDocument();
    if (action === "Crear ítem en Coreografia") {
      expect(screen.queryByRole("dialog", { name: "Crear ítem en Coreografia" })).not.toBeInTheDocument();
    } else if (!action.startsWith("Guardar")) expect(text).toHaveValue("");
    else if (action === "Guardar rubro") expect(text).toHaveValue("Entrada conservada");
    else expect(button).not.toBeInTheDocument();
  });

  it("conserva la seleccion de huerfano al fallar y bloquea reasignaciones repetidas", async () => {
    let rejectWrite;
    const write = vi.fn().mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectWrite = reject; }))
      .mockResolvedValueOnce({ id: "orphan-1", rubricId: rubric.id, scoringItemId: item.id });
    mockCompetitionData({ write, orphaned: [{ id: "orphan-1", rubricId: rubric.id, rubricName: rubric.name, description: "Expresion" }] });
    render(<AdminCompetenciaPage event={{ id: "event-1", status: "CONFIGURING" }} />);
    fireEvent.click(screen.getByRole("button", { name: /Evaluación/ }));
    const select = await screen.findByRole("combobox", { name: "Item para Coreografia: Expresion" });
    const button = screen.getByRole("button", { name: "Reasignar Expresion" });
    fireEvent.change(select, { target: { value: item.id } });
    act(() => { fireEvent.submit(button.closest("form")); fireEvent.submit(button.closest("form")); });
    expect(write).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar reasignación" }));
    expect(write).toHaveBeenCalledTimes(1);
    expect(select).toBeDisabled();
    expect(button).toBeDisabled();
    expect(screen.getByRole("button", { name: /Evaluación/ })).toBeDisabled();
    await act(async () => { rejectWrite(new Error("Fallo de red")); });
    expect(await screen.findByText("No se pudo reasignar el criterio.")).toBeInTheDocument();
    expect(select).toHaveValue(item.id);
    expect(select).toBeEnabled();
    fireEvent.click(button);
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar reasignación" }));
    await screen.findByText("Criterio reasignado.");
    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[1]).toEqual(["/api/v1/rubric-criteria/orphan-1", { method: "PATCH", body: JSON.stringify({ scoringItemId: item.id }) }]);
    expect(button).not.toBeInTheDocument();
  });

  it("explica metadata sin cambiar reglas y da nombre a controles inline", async () => {
    mockCompetitionData();
    render(<AdminCompetenciaPage event={{ id: "event-1", status: "CONFIGURING" }} />);
    fireEvent.click(screen.getByRole("button", { name: /Evaluación/ }));
    fireEvent.click(screen.getByRole("tab", { name: "Ítems" }));
    fireEvent.click(await screen.findByRole("button", { name: "Expandir Coreografia" }));
    fireEvent.click(screen.getByRole("button", { name: "Crear ítem en Coreografia" }));
    const itemDialog = screen.getByRole("dialog", { name: "Crear ítem en Coreografia" });
    expect(within(itemDialog).getByRole("textbox", { name: "Nuevo item puntuable para Coreografia" })).toBeInTheDocument();
    expect(within(itemDialog).getByRole("combobox", { name: "Especialidad del nuevo item para Coreografia" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Nuevo criterio para Interpretacion" })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Orden del nuevo criterio para Interpretacion" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agregar criterio a Interpretacion" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Editar item Interpretacion" }));
    fireEvent.click(screen.getByRole("button", { name: "Editar criterio Precision" }));
    for (const control of screen.getAllByRole("checkbox", { name: /Obligatorio/ })) {
      expect(control).toHaveAccessibleDescription(/Todos los items deben resolverse. Pendientes bloquean cierre./);
    }
    for (const control of screen.getAllByRole("checkbox", { name: /Permite No presentado/ })) {
      expect(control).toHaveAccessibleDescription(/Admite calificación 'No se presentó'./);
    }
    for (const advancedOptions of screen.getAllByText("Opciones avanzadas")) fireEvent.click(advancedOptions);
    fireEvent.click(within(itemDialog).getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getByRole("tab", { name: "Rubros" }));
    fireEvent.click(screen.getByRole("button", { name: "Editar rubro" }));
    for (const advancedOptions of screen.getAllByText("Opciones avanzadas")) fireEvent.click(advancedOptions);
    for (const control of screen.getAllByRole("combobox", { name: /Método de resolución/ })) {
      expect(control).toHaveAccessibleDescription(/describe cómo se resuelve el rubro; no ejecuta fórmulas ni decisiones automáticas/);
    }
    for (const role of ["textbox", "combobox", "button"]) {
      for (const control of screen.getAllByRole(role)) expect(control).toHaveAccessibleName();
    }
    expect(apiRequest.mock.calls.every(([, options]) => !options?.method)).toBe(true);
  });

  const reorderedRubric = {
    ...rubric,
    items: [item, { ...item, id: "item-2", name: "Composicion", displayOrder: 7, active: false }],
    criteria: [
      ...rubric.criteria,
      { id: "criterion-other", scoringItemId: "item-2", description: "Criterio ajeno", displayOrder: 2, active: true },
      { id: "criterion-2", scoringItemId: item.id, description: "Expresion", displayOrder: 8, active: false },
    ],
  };

  it.each([
    ["item", "Interpretacion", "Composicion", "evaluation-items", "item-1", "item-2", 7],
    ["criterio", "Precision", "Expresion", "rubric-criteria", "criterion-1", "criterion-2", 8],
  ])("reordena %s con vecino esperado, preserva huecos y bloquea doble envio", async (kind, first, second, resource, firstId, secondId, lastOrder) => {
    let resolveWrite;
    const write = vi.fn(() => new Promise((resolve) => { resolveWrite = resolve; }));
    mockCompetitionData({ rubrics: [reorderedRubric], write });
    render(<AdminCompetenciaPage event={{ id: "event-1", status: "CONFIGURING" }} />);
    fireEvent.click(screen.getByRole("button", { name: /Evaluación/ }));
    fireEvent.click(screen.getByRole("tab", { name: "Ítems" }));
    fireEvent.click(await screen.findByRole("button", { name: "Expandir Coreografia" }));
    expect(screen.getByRole("button", { name: `Subir ${kind} ${first}` })).toBeDisabled();
    expect(screen.getByRole("button", { name: `Bajar ${kind} ${second}` })).toBeDisabled();
    const move = screen.getByRole("button", { name: `Bajar ${kind} ${first}` });
    act(() => { fireEvent.click(move); fireEvent.click(move); });
    expect(write).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar y guardar" }));
    expect(write).toHaveBeenCalledExactlyOnceWith(`/api/v1/${resource}/${firstId}/reorder`, {
      method: "POST",
      body: JSON.stringify({ direction: "DOWN", neighborId: secondId, expectedOrder: 1, expectedNeighborOrder: lastOrder }),
    });
    expect(move).toBeDisabled();
    expect(screen.getByRole("button", { name: /Revisión final/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: `Subir ${kind} ${first}` }).compareDocumentPosition(screen.getByRole("button", { name: `Subir ${kind} ${second}` })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await act(async () => { resolveWrite({ changes: [{ id: firstId, displayOrder: lastOrder }, { id: secondId, displayOrder: 1 }] }); });
    expect(await screen.findByText("Orden actualizado.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Subir ${kind} ${second}` })).toBeDisabled();
    expect(screen.getByRole("button", { name: `Bajar ${kind} ${first}` })).toBeDisabled();
    expect(screen.getByRole("button", { name: `Subir ${kind} ${second}` }).compareDocumentPosition(screen.getByRole("button", { name: `Subir ${kind} ${first}` })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Criterio ajeno")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: `Subir ${kind} ${first}` }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar y guardar" }));
    expect(write.mock.calls[1]).toEqual([`/api/v1/${resource}/${firstId}/reorder`, {
      method: "POST", body: JSON.stringify({ direction: "UP", neighborId: secondId, expectedOrder: lastOrder, expectedNeighborOrder: 1 }),
    }]);
    await act(async () => { resolveWrite({ changes: [{ id: firstId, displayOrder: 1 }, { id: secondId, displayOrder: lastOrder }] }); });
  });

  it("recarga un conflicto sin repetir el intercambio automaticamente", async () => {
    const rubrics = [reorderedRubric];
    const write = vi.fn(async () => {
      rubrics[0] = { ...reorderedRubric, rubricType: "SPECIAL", items: [{ ...item, displayOrder: 7 }, { ...reorderedRubric.items[1], displayOrder: 1 }] };
      throw { code: "ORDER_CONFLICT" };
    });
    mockCompetitionData({ rubrics, write });
    render(<AdminCompetenciaPage event={{ id: "event-1", status: "CONFIGURING" }} />);
    fireEvent.click(screen.getByRole("button", { name: /Evaluación/ }));
    fireEvent.click(screen.getByRole("tab", { name: "Ítems" }));
    fireEvent.click(await screen.findByRole("button", { name: "Expandir Coreografia" }));
    fireEvent.click(screen.getByRole("button", { name: "Bajar item Interpretacion" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar y guardar" }));
    expect(await screen.findByText(/La configuracion cambio/)).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/rubrics/rubric-1");
    expect(write).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Guardar rubro" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Rubros" }));
    fireEvent.click(screen.getByRole("button", { name: "Expandir Coreografia" }));
    fireEvent.click(screen.getByRole("button", { name: "Editar rubro" }));
    const editor = screen.getByRole("button", { name: "Guardar rubro" }).closest("form");
    expect(within(editor).getByLabelText("Tipo")).toHaveValue("SPECIAL");
    fireEvent.click(screen.getByRole("tab", { name: "Ítems" }));
    expect(screen.getByRole("button", { name: "Bajar item Interpretacion" })).toBeDisabled();
  });

  it("no modifica orden local ante fallo de red", async () => {
    mockCompetitionData({ rubrics: [reorderedRubric] });
    render(<AdminCompetenciaPage event={{ id: "event-1", status: "CONFIGURING" }} />);
    fireEvent.click(screen.getByRole("button", { name: /Evaluación/ }));
    fireEvent.click(screen.getByRole("tab", { name: "Ítems" }));
    fireEvent.click(await screen.findByRole("button", { name: "Expandir Coreografia" }));
    fireEvent.click(screen.getByRole("button", { name: "Bajar item Interpretacion" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar y guardar" }));
    expect(await screen.findByText(/No se pudo cambiar el orden/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bajar item Interpretacion" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Subir item Interpretacion" })).toBeDisabled();
  });

  it("no ofrece reordenamiento con evento OPEN", async () => {
    mockCompetitionData({ rubrics: [reorderedRubric] });
    render(<AdminCompetenciaPage event={{ id: "event-1", status: "OPEN" }} />);
    fireEvent.click(screen.getByRole("button", { name: /Evaluación/ }));
    fireEvent.click(screen.getByRole("tab", { name: "Ítems" }));
    fireEvent.click(await screen.findByRole("button", { name: "Expandir Coreografia" }));
    expect(screen.queryByRole("button", { name: /Subir|Bajar/ })).not.toBeInTheDocument();
    expect(apiRequest.mock.calls.every(([, options]) => !options?.method)).toBe(true);
  });

  describe("Spec 017 T09a/T09b: ficha de comparsa y orden de pasada", () => {
    const troupes = [
      { id: "troupe-1", name: "Estrella", categoryId: "category-1", categoryName: "Comparsa", brandColor: "#3B82F6", active: true },
      { id: "troupe-2", name: "Apagada", categoryId: "category-1", categoryName: "Comparsa", brandColor: null, active: false },
    ];
    const scheduleRows = [
      { id: "s-1", nightId: "night-1", troupeId: "troupe-1", troupeName: "Estrella", troupeBrandColor: "#3B82F6", presentationOrder: 1, status: "SCHEDULED" },
      { id: "s-2", nightId: "night-1", troupeId: "troupe-2", troupeName: "Apagada", troupeBrandColor: null, presentationOrder: 2, status: "SCHEDULED" },
    ];
    function mockTroupes({ write = vi.fn(), schedule = scheduleRows, rows = troupes } = {}) {
      const live = rows.map((t) => ({ ...t }));
      apiRequest.mockImplementation(async (path, options) => {
        if (options?.method) {
          const result = await write(path, options);
          if (options.method === "POST" && path.endsWith("/troupes") && result?.id) live.push({ ...result });
          return result;
        }
        if (path === "/api/v1/events/event-1/nights") return [{ id: "night-1", name: "Noche 1", displayOrder: 1, kind: "COMPETITION" }];
        if (path.startsWith("/api/v1/events/event-1/schedule")) return schedule.map((row) => ({ ...row }));
        if (path.endsWith("/troupes")) return live.map((t) => ({ ...t }));
        if (path.endsWith("/categories")) return [{ id: "category-1", name: "Comparsa", code: "COMPARSA", displayOrder: 1, active: true }];
        if (path.endsWith("/specialties")) return [{ id: "specialty-1", name: "Danza", code: "DANZA", displayOrder: 1, active: true }];
        if (path.endsWith("/rubrics")) return [rubric];
        if (path.endsWith("/orphaned-criteria")) return [];
        throw new Error(`Solicitud inesperada: ${path}`);
      });
    }
    async function openTroupesTab() {
      render(<AdminCompetenciaPage event={{ id: "event-1", name: "Carnaval", status: "CONFIGURING" }} />);
      fireEvent.click(screen.getByRole("button", { name: /Participantes/ }));
      // Paso 1 asentado: tabla de tipos + tabla de comparsas (evita race con el schedule)
      expect((await screen.findAllByRole("table"))).toHaveLength(2);
    }

    it("muestra horario de API y distingue el cronograma ficticio", async () => {
      mockTroupes({ schedule: [{ ...scheduleRows[0], scheduledAt: "2027-02-07T04:00:00.000Z",
        scheduledTimezone: "America/Argentina/Cordoba", orderSource: "TEST_SIMULATED_DRAW" }] });
      await openTroupesTab();
      expect(await screen.findByText(/Programada:.*01:00/)).toHaveTextContent("07/02/2027");
      expect(screen.getByText(/no son un cronograma oficial de la COC/)).toBeInTheDocument();
    });

    it("crea comparsa con color desde el selector y muestra preview Vista jurado", async () => {
      const write = vi.fn().mockResolvedValue({ id: "troupe-3", name: "Nueva", categoryId: "category-1", categoryName: "Comparsa", brandColor: "#22c55e", active: true });
      mockTroupes({ write });
      await openTroupesTab();
      fireEvent.click(screen.getByRole("button", { name: "+ Nueva comparsa" }));
      const form = screen.getByRole("button", { name: "Agregar comparsa" }).closest("form");
      const fields = within(form);
      fireEvent.change(fields.getByLabelText("Nombre"), { target: { value: "Nueva" } });
      fireEvent.change(fields.getByLabelText("Tipo de participación"), { target: { value: "category-1" } });
      fireEvent.click(fields.getByLabelText("Usar color de identidad"));
      fireEvent.change(fields.getByLabelText("Color (opcional)"), { target: { value: "#22C55E" } });
      fireEvent.submit(form);
      await screen.findByText("Guardado.");
      expect(write).toHaveBeenCalledExactlyOnceWith("/api/v1/events/event-1/troupes", {
        method: "POST",
        body: JSON.stringify({ name: "Nueva", categoryId: "category-1", brandColor: "#22c55e" }),
      });
      expect(await screen.findByText("Vista jurado: Nueva (#22c55e)")).toBeInTheDocument();
    });

    it("crea comparsa sin color cuando no se activa el selector", async () => {
      const write = vi.fn().mockResolvedValue({ id: "troupe-3", name: "Nueva", categoryId: "category-1", categoryName: "Comparsa", brandColor: null, active: true });
      mockTroupes({ write });
      await openTroupesTab();
      fireEvent.click(screen.getByRole("button", { name: "+ Nueva comparsa" }));
      const form = screen.getByRole("button", { name: "Agregar comparsa" }).closest("form");
      const fields = within(form);
      fireEvent.change(fields.getByLabelText("Nombre"), { target: { value: "Nueva" } });
      fireEvent.change(fields.getByLabelText("Tipo de participación"), { target: { value: "category-1" } });
      fireEvent.submit(form);
      await screen.findByText("Guardado.");
      expect(write).toHaveBeenCalledExactlyOnceWith("/api/v1/events/event-1/troupes", {
        method: "POST",
        body: JSON.stringify({ name: "Nueva", categoryId: "category-1", brandColor: null }),
      });
    });

    it("quita el color de una comparsa existente al desactivar el selector", async () => {
      const write = vi.fn(async (path, options) => {
        if (path === "/api/v1/troupes/troupe-1" && options.method === "PATCH") return { id: "troupe-1", ...JSON.parse(options.body) };
        throw new Error(`Solicitud inesperada: ${path}`);
      });
      mockTroupes({ write });
      await openTroupesTab();
      fireEvent.click(screen.getByRole("button", { name: "Editar comparsa Estrella" }));
      const form = screen.getByRole("button", { name: "Guardar comparsa" }).closest("form");
      const fields = within(form);
      expect(fields.getByLabelText("Usar color de identidad")).toBeChecked();
      fireEvent.click(fields.getByLabelText("Usar color de identidad"));
      fireEvent.submit(form);
      fireEvent.click(await screen.findByRole("button", { name: "Confirmar y guardar" }));
      await waitFor(() => expect(write).toHaveBeenCalledWith(
        "/api/v1/troupes/troupe-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ name: "Estrella", categoryId: "category-1", brandColor: null, active: true }),
        }),
      ));
    });

    it("muestra el logo de la comparsa en la tabla con URL versionada", async () => {
      mockTroupes({
        rows: [
          { id: "troupe-1", name: "Estrella", categoryId: "category-1", categoryName: "Comparsa", brandColor: null, active: true, hasLogo: true, logoSha256: "hash-1" },
        ],
      });
      await openTroupesTab();
      expect(await screen.findByRole("img", { name: "Logo de Estrella" })).toHaveAttribute(
        "src",
        "/api/v1/troupes/troupe-1/logo?v=hash-1",
      );
    });

    it("sube el logo de la comparsa después de crearla", async () => {
      const write = vi.fn(async (path, options) => {
        if (path === "/api/v1/events/event-1/troupes" && options.method === "POST") {
          return { id: "troupe-3", name: "Nueva", categoryId: "category-1", categoryName: "Comparsa", brandColor: null, active: true };
        }
        if (path === "/api/v1/troupes/troupe-3/logo" && options.method === "PUT") {
          return { id: "troupe-3", hasLogo: true, logoSha256: "hash-1" };
        }
        throw new Error(`Solicitud inesperada: ${path}`);
      });
      mockTroupes({ write });
      await openTroupesTab();
      fireEvent.click(screen.getByRole("button", { name: "+ Nueva comparsa" }));
      const form = screen.getByRole("button", { name: "Agregar comparsa" }).closest("form");
      const fields = within(form);
      fireEvent.change(fields.getByLabelText("Nombre"), { target: { value: "Nueva" } });
      fireEvent.change(fields.getByLabelText("Tipo de participación"), { target: { value: "category-1" } });
      const logo = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "logo.png", { type: "image/png" });
      fireEvent.change(fields.getByLabelText("Logo (opcional)"), { target: { files: [logo] } });
      fireEvent.submit(form);
      await waitFor(() => expect(write).toHaveBeenCalledWith(
        "/api/v1/troupes/troupe-3/logo",
        expect.objectContaining({ method: "PUT", headers: { "content-type": "image/png" }, body: logo }),
      ));
      expect(await screen.findByText("Guardado. Logo actualizado.")).toBeInTheDocument();
    });

    it("quita el logo de una comparsa existente", async () => {
      const write = vi.fn(async (path, options) => {
        if (path === "/api/v1/troupes/troupe-1" && options.method === "PATCH") return { id: "troupe-1", ...JSON.parse(options.body) };
        if (path === "/api/v1/troupes/troupe-1/logo" && options.method === "DELETE") return { id: "troupe-1", hasLogo: false };
        throw new Error(`Solicitud inesperada: ${path}`);
      });
      mockTroupes({
        write,
        rows: [
          { id: "troupe-1", name: "Estrella", categoryId: "category-1", categoryName: "Comparsa", brandColor: "#3B82F6", active: true, hasLogo: true, logoSha256: "hash-1" },
        ],
      });
      await openTroupesTab();
      fireEvent.click(screen.getByRole("button", { name: "Editar comparsa Estrella" }));
      fireEvent.click(await screen.findByRole("button", { name: "Quitar logo" }));
      const form = screen.getByRole("button", { name: "Guardar comparsa" }).closest("form");
      fireEvent.submit(form);
      fireEvent.click(await screen.findByRole("button", { name: "Confirmar y guardar" }));
      await waitFor(() => expect(write).toHaveBeenCalledWith(
        "/api/v1/troupes/troupe-1/logo",
        expect.objectContaining({ method: "DELETE" }),
      ));
      expect(await screen.findByText("Guardado. Logo eliminado.")).toBeInTheDocument();
    });

    it("rechaza un archivo de logo inválido sin llamar a la API", async () => {
      const write = vi.fn();
      mockTroupes({ write });
      await openTroupesTab();
      fireEvent.click(screen.getByRole("button", { name: "+ Nueva comparsa" }));
      const form = screen.getByRole("button", { name: "Agregar comparsa" }).closest("form");
      const fields = within(form);
      fireEvent.change(fields.getByLabelText("Nombre"), { target: { value: "Nueva" } });
      fireEvent.change(fields.getByLabelText("Tipo de participación"), { target: { value: "category-1" } });
      const bad = new File(["hello"], "logo.txt", { type: "text/plain" });
      fireEvent.change(fields.getByLabelText("Logo (opcional)"), { target: { files: [bad] } });
      expect(await screen.findByRole("alert")).toHaveTextContent(/PNG, JPG, WebP o SVG/);
      fireEvent.submit(form);
      expect(write).not.toHaveBeenCalled();
    });

    it("edita comparsa en drawer, bloquea doble envío y reintenta tras fallo", async () => {
      let rejectWrite;
      const write = vi.fn()
        .mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectWrite = reject; }))
        .mockImplementationOnce(async (path, options) => ({ id: "troupe-1", ...JSON.parse(options.body) }));
      mockTroupes({ write });
      await openTroupesTab();
      fireEvent.click(screen.getByRole("button", { name: "Editar comparsa Estrella" }));
      const button = screen.getByRole("button", { name: "Guardar comparsa" });
      const form = button.closest("form");
      const fields = within(form);
      fireEvent.change(fields.getByLabelText("Nombre"), { target: { value: "Estrella Editada" } });
      act(() => { fireEvent.submit(form); fireEvent.submit(form); });
      expect(write).not.toHaveBeenCalled();
      fireEvent.click(await screen.findByRole("button", { name: "Confirmar y guardar" }));
      expect(write).toHaveBeenCalledTimes(1);
      expect(write.mock.calls[0][0]).toBe("/api/v1/troupes/troupe-1");
      expect(write.mock.calls[0][1].method).toBe("PATCH");
      await act(async () => { rejectWrite(new Error("Fallo de red")); });
      expect(await screen.findByText("No se pudo guardar.")).toBeInTheDocument();
      expect(fields.getByLabelText("Nombre")).toHaveValue("Estrella Editada");
      fireEvent.click(button);
      fireEvent.click(await screen.findByRole("button", { name: "Confirmar y guardar" }));
      await waitFor(() => expect(write).toHaveBeenCalledTimes(2));
      expect(await screen.findByText("Guardado.")).toBeInTheDocument();
    });

    it("filtra por busqueda y estado sin ocultar datos", async () => {
      mockTroupes();
      await openTroupesTab();
      const section = screen.getByRole("heading", { name: "Comparsas" }).closest("section");
      const cards = () => within(section);
      expect(screen.getByText("1 de 2 comparsas")).toBeInTheDocument();
      expect(cards().queryByText("Apagada")).not.toBeInTheDocument();
      fireEvent.change(screen.getByRole("combobox", { name: "Filtrar comparsas por estado" }), { target: { value: "all" } });
      expect(screen.getByText("2 de 2 comparsas")).toBeInTheDocument();
      fireEvent.change(screen.getByRole("searchbox", { name: "Buscar comparsa por nombre" }), { target: { value: "estre" } });
      expect(cards().getByText("Estrella")).toBeInTheDocument();
      expect(cards().queryByText("Apagada")).not.toBeInTheDocument();
      expect(screen.getByText("1 de 2 comparsas")).toBeInTheDocument();
      fireEvent.change(screen.getByRole("searchbox", { name: "Buscar comparsa por nombre" }), { target: { value: "" } });
      fireEvent.change(screen.getByRole("combobox", { name: "Filtrar comparsas por estado" }), { target: { value: "inactive" } });
      expect(cards().queryByText("Estrella")).not.toBeInTheDocument();
      expect(cards().getByText("Apagada")).toBeInTheDocument();
    });

    it("elimina (desactiva) comparsa con confirmacion y permite reactivar", async () => {
      const write = vi.fn(async (path, options) => {
        const body = JSON.parse(options.body);
        if (path === "/api/v1/troupes/troupe-1" && options.method === "PATCH") return { id: "troupe-1", ...body };
        throw new Error(`Solicitud inesperada: ${path}`);
      });
      mockTroupes({ write });
      await openTroupesTab();
      fireEvent.click(screen.getByRole("button", { name: "Eliminar comparsa Estrella" }));
      expect(await screen.findByRole("dialog", { name: "Eliminar Estrella" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Eliminar (desactivar)" }));
      expect(write).toHaveBeenCalledWith("/api/v1/troupes/troupe-1", {
        method: "PATCH",
        body: JSON.stringify({ active: false }),
      });
      expect(await screen.findByText("Comparsa Estrella eliminada (desactivada en BD).")).toBeInTheDocument();
    });

    it("muestra orden por jornada y reordena con vecino esperado", async () => {
      const write = vi.fn().mockResolvedValue({ changes: [{ id: "s-1", presentationOrder: 2 }, { id: "s-2", presentationOrder: 1 }] });
      mockTroupes({ write });
      await openTroupesTab();
      expect(await screen.findByText("Orden de pasada")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Subir Estrella en Noche 1" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Bajar Apagada en Noche 1" })).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: "Bajar Estrella en Noche 1" }));
      expect(write).not.toHaveBeenCalled();
      fireEvent.click(await screen.findByRole("button", { name: "Confirmar y guardar" }));
      expect(write).toHaveBeenCalledExactlyOnceWith("/api/v1/schedule/s-1/reorder", {
        method: "POST",
        body: JSON.stringify({ direction: "DOWN", neighborId: "s-2", expectedOrder: 1, expectedNeighborOrder: 2 }),
      });
      expect(await screen.findByText("Orden de pasada actualizado.")).toBeInTheDocument();
    });

    it("recarga la jornada ante conflicto sin repetir el intercambio", async () => {
      const write = vi.fn().mockRejectedValueOnce({ code: "ORDER_CONFLICT" });
      mockTroupes({ write });
      await openTroupesTab();
      await screen.findByText("Orden de pasada");
      fireEvent.click(screen.getByRole("button", { name: "Bajar Estrella en Noche 1" }));
      fireEvent.click(await screen.findByRole("button", { name: "Confirmar y guardar" }));
      expect(await screen.findByText(/El orden cambio/)).toBeInTheDocument();
      expect(write).toHaveBeenCalledTimes(1);
      expect(apiRequest).toHaveBeenCalledWith("/api/v1/events/event-1/schedule?nightId=night-1");
    });

    it("oculta edicion y reorden de comparsas con evento OPEN", async () => {
      mockTroupes();
      render(<AdminCompetenciaPage event={{ id: "event-1", status: "OPEN" }} />);
      fireEvent.click(screen.getByRole("button", { name: /Participantes/ }));
      await screen.findByText("Estrella");
      expect(screen.queryByRole("button", { name: /Editar comparsa|Nueva comparsa|Subir|Bajar/ })).not.toBeInTheDocument();
      expect(apiRequest.mock.calls.every(([, options]) => !options?.method)).toBe(true);
    });

    it("programa y quita comparsas de la jornada", async () => {
      const write = vi.fn().mockImplementation(async (path, options) => {
        if (path.endsWith("/schedule") && options.method === "POST") {
          return { id: "s-9", presentationOrder: 1, status: "SCHEDULED" };
        }
        if (path.endsWith("/schedule/s-9") && options.method === "DELETE") return { id: "s-9" };
        throw new Error("Escritura inesperada");
      });
      mockTroupes({ write, schedule: [] });
      render(<AdminCompetenciaPage event={{ id: "event-1", name: "Carnaval", status: "CONFIGURING" }} />);
      expect(await screen.findByText(/Sin comparsas programadas/)).toBeInTheDocument();
      fireEvent.change(
        screen.getByRole("combobox", { name: "Comparsa para programar en la jornada" }),
        { target: { value: "troupe-1" } },
      );
      fireEvent.click(screen.getByRole("button", { name: "Programar comparsa" }));
      expect(write).not.toHaveBeenCalled();
      fireEvent.click(await screen.findByRole("button", { name: "Confirmar y guardar" }));
      expect(write).toHaveBeenCalledWith("/api/v1/events/event-1/schedule", {
        method: "POST",
        body: JSON.stringify({ nightId: "night-1", troupeId: "troupe-1" }),
      });
      expect(await screen.findByText("Comparsa programada en la jornada.")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Quitar Estrella de Noche 1" }));
      fireEvent.click(await screen.findByRole("button", { name: "Quitar de la jornada" }));
      expect(write).toHaveBeenCalledWith("/api/v1/schedule/s-9", { method: "DELETE" });
      expect(await screen.findByText("Comparsa quitada de la jornada.")).toBeInTheDocument();
    });
  });

  describe("Spec 027/D: árbol de evaluación y planillas accionables", () => {
    function mockRubrics({ rubrics: customRubrics } = {}) {
      const rubrics = customRubrics ?? [rubric];
      apiRequest.mockImplementation(async (path, options) => {
        if (options?.method) throw new Error("Escritura inesperada");
        if (path.endsWith("/readiness")) return { ready: true, missing: [], incompleteTroupes: [], incompleteRubrics: [], incompleteSchedules: [], incompleteNominations: [], nightsWithoutJury: [] };
        if (path.endsWith("/troupes")) return [];
        if (path.endsWith("/categories")) return [];
        if (path.endsWith("/specialties")) {
          return [{ id: "specialty-1", name: "Danza", code: "DANZA", displayOrder: 1, active: true }];
        }
        if (path.endsWith("/rubrics")) return rubrics.map((r) => ({ ...r }));
        if (path.endsWith("/orphaned-criteria")) return [];
        throw new Error(`Solicitud inesperada: ${path}`);
      });
    }

    it("muestra rubros agrupados por especialidad y criterios junto al ítem", async () => {
      mockRubrics();
      render(<AdminCompetenciaPage event={{ id: "event-1", status: "CONFIGURING" }} />);
      fireEvent.click(screen.getByRole("button", { name: /Evaluación/ }));
      fireEvent.click(screen.getByRole("tab", { name: "Ítems" }));
      expect(await screen.findByRole("heading", { name: "Rubros de Danza" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Expandir Coreografia" }));
      const rubricCard = document.querySelector('[data-rubric-id="rubric-1"]');
      expect(within(rubricCard).getByText("Interpretacion")).toBeInTheDocument();
      expect(within(rubricCard).getByText("Precision")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Crear ítem en Coreografia" }));
      expect(within(screen.getByRole("dialog", { name: "Crear ítem en Coreografia" })).getByText("Opciones avanzadas")).toBeInTheDocument();
    });

  it("mantiene visibles los rubros sin asociación activa para poder resolverlos", async () => {
      mockRubrics({
        rubrics: [
          { ...rubric, id: "rubric-empty", name: "Vacio", items: [{ ...item, id: "inactive-item", active: false }], criteria: [] },
          rubric,
        ],
      });
      render(<AdminCompetenciaPage event={{ id: "event-1", status: "CONFIGURING" }} />);
      fireEvent.click(screen.getByRole("button", { name: /Evaluación/ }));
      expect(await screen.findByRole("heading", { name: "Otros rubros por revisar" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Vacio" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Expandir Vacio" }));
      expect(await screen.findByRole("button", { name: "Contraer Vacio" })).toBeInTheDocument();
    });

    it("separa Rubros e Ítems y confirma el alta desde el diálogo de creación", async () => {
      const write = vi.fn().mockResolvedValue({ id: "item-new", name: "Colorido", specialtyId: "specialty-1", required: true, allowNotPresented: true });
      mockCompetitionData({ write });
      render(<AdminCompetenciaPage event={{ id: "event-1", status: "CONFIGURING" }} />);
      fireEvent.click(screen.getByRole("button", { name: /Evaluación/ }));
      fireEvent.click(await screen.findByRole("button", { name: "Expandir Coreografia" }));

      expect(screen.getByRole("tab", { name: "Rubros" })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("button", { name: "Editar rubro" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Crear ítem en Coreografia" })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("tab", { name: "Ítems" }));
      expect(screen.getByRole("button", { name: "Crear ítem en Coreografia" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Crear ítem en Coreografia" }));
      const dialog = await screen.findByRole("dialog", { name: "Crear ítem en Coreografia" });
      const form = dialog.querySelector("form");
      fireEvent.change(within(form).getByRole("textbox", { name: "Nuevo item puntuable para Coreografia" }), { target: { value: "Colorido" } });
      fireEvent.change(within(form).getByRole("combobox", { name: "Especialidad del nuevo item para Coreografia" }), { target: { value: "specialty-1" } });
      fireEvent.submit(form);

      expect(write).not.toHaveBeenCalled();
      fireEvent.click(await screen.findByRole("button", { name: "Confirmar y guardar" }));
      await screen.findByText("Item guardado.");
      expect(write).toHaveBeenCalledExactlyOnceWith("/api/v1/rubrics/rubric-1/items", {
        method: "POST",
        body: JSON.stringify({ name: "Colorido", specialtyId: "specialty-1", required: true, allowNotPresented: true }),
      });
      expect(screen.queryByRole("dialog", { name: "Crear ítem en Coreografia" })).not.toBeInTheDocument();
    });
  });

  describe("asistente de configuración (wizard)", () => {
    it("muestra 4 pasos en orden de dependencia con progreso no bloqueante", async () => {
      mockCompetitionData();
      render(<AdminCompetenciaPage event={{ id: "event-1", status: "CONFIGURING" }} />);
      expect(await screen.findByText("Completo según readiness de la API.")).toBeInTheDocument();
      for (const step of [/Participantes/, /Jurados y especialidades/, /Evaluación/, /Revisión final/]) {
        expect(screen.getByRole("button", { name: step })).toBeInTheDocument();
      }
      // Los estados desconocidos no se convierten en progreso ni porcentaje.
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
      expect(screen.getAllByText("Completo", { selector: ".competencia-step-state" })).toHaveLength(4);
      expect(screen.queryByRole("region", { name: "Configuración de la competencia" })).not.toBeInTheDocument();
      // Paso 1 por defecto: tipos y comparsas juntos, sin resumen suelto
      expect(screen.getByRole("heading", { name: "Tipos de participacion" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Comparsas" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Resumen de competencia" })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /Revisión final/ }));
      expect(await screen.findByText("La API confirma que no hay bloqueos oficiales de apertura.")).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Resumen de competencia" })).not.toBeInTheDocument();
      expect(screen.queryByText(/Items puntuables/)).not.toBeInTheDocument();
    });

    it("auto-expande el rubro recién creado para seguir cargando ítems", async () => {
      const write = vi.fn().mockImplementation(async (_path, options) => ({ id: "rubric-new", ...JSON.parse(options.body) }));
      mockCompetitionData({ write, rubrics: [] });
      render(<AdminCompetenciaPage event={{ id: "event-1", status: "CONFIGURING" }} />);
      fireEvent.click(screen.getByRole("button", { name: /Evaluación/ }));
      fireEvent.click(await screen.findByRole("button", { name: "+ Agregar rubro" }));
      fireEvent.change(screen.getByRole("textbox", { name: "Nombre del rubro" }), { target: { value: "Nuevo Rubro" } });
      fireEvent.click(screen.getByRole("button", { name: "Crear rubro" }));
      expect(await screen.findByRole("button", { name: "Contraer Nuevo Rubro" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("tab", { name: "Ítems" }));
      fireEvent.click(await screen.findByRole("button", { name: "Crear ítem en Nuevo Rubro" }));
      expect(screen.getByRole("textbox", { name: "Nuevo item puntuable para Nuevo Rubro" })).toBeInTheDocument();
    });
  });

  describe("refinamiento UX sin cambios de lógica", () => {
    it("muestra cabecera compacta con evento, paso actual y Volver, sin porcentaje inferido", async () => {
      mockCompetitionData();
      const onBack = vi.fn();
      render(<AdminCompetenciaPage event={{ id: "event-1", name: "Carnaval", status: "CONFIGURING" }} onBack={onBack} />);
      expect(screen.getByText("Competencia")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Carnaval", level: 1 })).toBeInTheDocument();
      expect(screen.getByText(/Paso 1 de 4/)).toBeInTheDocument();
      expect(screen.queryByText(/% completado/)).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Volver" }));
      expect(onBack).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole("button", { name: /Jurados y especialidades/ }));
      expect(await screen.findByText(/Paso 2 de 4/)).toBeInTheDocument();
    });

    it("el stepper expone 4 pasos accionables con estado y marca el actual", async () => {
      mockCompetitionData();
      render(<AdminCompetenciaPage event={{ id: "event-1", status: "CONFIGURING" }} />);
      const nav = screen.getByRole("navigation", { name: "Pasos de configuración de competencia" });
      expect(within(nav).getAllByRole("button")).toHaveLength(4);
      expect(screen.getByRole("button", { name: /Paso 1 de 4: Participantes/ })).toHaveAttribute("aria-current", "step");
      expect(screen.getByRole("button", { name: /Paso 4 de 4: Revisión final/ })).not.toHaveAttribute("aria-current");
      fireEvent.click(screen.getByRole("button", { name: /Revisión final/ }));
      expect(await screen.findByRole("heading", { name: "Revisión final" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Paso 4 de 4: Revisión final/ })).toHaveAttribute("aria-current", "step");
    });

    it("el paso Participantes muestra el estado readiness sin resumir conteos locales", async () => {
      mockCompetitionData();
      render(<AdminCompetenciaPage event={{ id: "event-1", status: "CONFIGURING" }} />);
      expect(screen.getByRole("heading", { name: "Participantes" })).toBeInTheDocument();
      for (const block of ["Bloque 1 de 3: Tipos de participación", "Bloque 2 de 3: Comparsas", "Bloque 3 de 3: Orden de pasada por jornada"]) {
        expect(screen.getByRole("region", { name: block })).toBeInTheDocument();
      }
      const summary = screen.getByRole("region", { name: "Resumen del paso Participantes" });
      expect(within(summary).getByRole("heading", { name: "Resumen del paso" })).toBeInTheDocument();
      expect(await within(summary).findByText(/Completo según readiness/)).toBeInTheDocument();
    });

    it("el resumen del paso Jurados refleja readiness y conserva acceso a Jurados", async () => {
      mockCompetitionData();
      render(<AdminCompetenciaPage event={{ id: "event-1", status: "CONFIGURING" }} />);
      fireEvent.click(screen.getByRole("button", { name: /Jurados y especialidades/ }));
      expect(await screen.findByRole("heading", { name: "Jurados y especialidades" })).toBeInTheDocument();
      const summary = screen.getByRole("region", { name: "Resumen del paso Jurados y especialidades" });
      expect(within(summary).getByText(/Completo según readiness/)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Jurados" })).toHaveAttribute("href", "#/admin/judges");
    });

    it("mueve el foco al título del paso al navegar y no usa el copy anterior", async () => {
      mockCompetitionData();
      render(<AdminCompetenciaPage event={{ id: "event-1", status: "CONFIGURING" }} />);
      fireEvent.click(screen.getByRole("button", { name: /Evaluación/ }));
      const title = await screen.findByRole("heading", { name: "Configurar evaluación" });
      expect(title).toHaveFocus();
      expect(screen.queryByText(/Quiénes participan/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Quién evalúa/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Qué se puntúa/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Revisar y cerrar/)).not.toBeInTheDocument();
    });
  });
});
