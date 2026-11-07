import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../App.jsx";
import { apiRequest } from "../api/http.js";
import { preparationStages, preparationIssueLocation } from "../features/admin-preparation.js";

vi.mock("../api/http.js", () => ({ apiRequest: vi.fn() }));
const admin = { status: "authenticated", user: { id: "admin-preparation", name: "Admin" }, roles: ["ADMIN"] };
const event = { id: "e1", name: "Carnaval 2027", status: "CONFIGURING" };
const readiness = { ready: true, missing: [], incompleteRubrics: [], incompleteNominations: [], incompleteTroupes: [], incompleteSchedules: [], nightsWithoutJury: [] };

function mockApi({ check = readiness, nights = [{ id: "n1", name: "Noche 1", kind: "COMPETITION", status: "DRAFT" }], override } = {}) {
  const catalog = [{ ...event }];
  apiRequest.mockImplementation(async (path, options) => {
    const custom = override?.(path, options);
    if (custom !== undefined) return custom;
    if (path === "/api/v1/events" && options?.method === "POST") {
      const created = { id: "e2", ...JSON.parse(options.body), status: "CONFIGURING" }; catalog.push(created); return created;
    }
    if (path === "/api/v1/events") return catalog;
    if (/\/events\/[^/]+$/.test(path) && options?.method === "PATCH") return { ...event, ...JSON.parse(options.body) };
    if (path.endsWith("/nights") && options?.method === "POST") {
      const created = { id: "n2", ...JSON.parse(options.body), status: "DRAFT" }; nights.push(created);
      check.missing = check.missing.filter((code) => code !== "COMPETITION_NIGHT"); return created;
    }
    const resource = path.split("?")[0].split("/").at(-1);
    return structuredClone({ readiness: check, nights, specialties: [], rubrics: [], troupes: [], categories: [], "orphaned-criteria": [] }[resource] ?? []);
  });
}
function mount(query = "stage=event&task=data", session = admin) {
  window.history.replaceState({}, "", `#/admin/prepare?${query}`);
  return render(<App session={session} />);
}
const progress = () => screen.getByRole("progressbar", { name: "Etapas de preparación completas" });
const writes = () => apiRequest.mock.calls.filter(([, options]) => options?.method && options.method !== "GET");

describe("Preparación guiada ADMIN", () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); window.localStorage.clear(); window.history.replaceState({}, "", "#/login"); });

  it("crea una sola vez, selecciona el evento nuevo y continúa con jornadas", async () => {
    mockApi({ nights: [], check: { ...readiness, ready: false, missing: ["COMPETITION_NIGHT", "ACTIVE_RUBRIC", "ACTIVE_SPECIALTY", "ACTIVE_TROUPE"] } });
    mount("stage=event&task=data&new=1");
    fireEvent.change(screen.getByRole("textbox", { name: "Nombre del evento" }), { target: { value: "Carnaval Nuevo" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear y continuar" }));
    expect(await screen.findByRole("heading", { name: "Armá el calendario" })).toBeInTheDocument();
    expect(window.location.hash).toBe("#/admin/prepare?stage=event&task=nights");
    expect(screen.getByRole("button", { name: /^Evento actual/ })).toHaveTextContent("Carnaval Nuevo");
    expect(writes()).toHaveLength(1);
    expect(writes()[0]).toEqual(["/api/v1/events", expect.objectContaining({ body: JSON.stringify({ name: "Carnaval Nuevo" }) })]);
    expect(screen.queryByRole("button", { name: /Preparar jurados/ })).not.toBeInTheDocument();
  });

  it("bloquea doble envío y conserva el nombre ante un error de creación", async () => {
    let reject;
    mockApi({ override: (path, options) => path === "/api/v1/events" && options?.method === "POST" ? new Promise((_, fail) => { reject = fail; }) : undefined });
    mount("new=1");
    const input = screen.getByRole("textbox", { name: "Nombre del evento" });
    fireEvent.change(input, { target: { value: "Nombre pendiente" } });
    fireEvent.submit(input.closest("form")); fireEvent.submit(input.closest("form"));
    expect(writes()).toHaveLength(1);
    await act(async () => reject(new Error("network")));
    expect(await screen.findByText(/Tu nombre se conserva/)).toHaveAttribute("role", "alert");
    expect(input).toHaveValue("Nombre pendiente");
    expect(screen.getByRole("button", { name: "Crear y continuar" })).toBeEnabled();
    expect(screen.queryByText(/El evento activo ya no figura/)).not.toBeInTheDocument();
  });

  it("mantiene el control de confirmación al crear una jornada", async () => {
    const check = { ...structuredClone(readiness), ready: false, missing: ["COMPETITION_NIGHT", "ACTIVE_RUBRIC", "ACTIVE_SPECIALTY", "ACTIVE_TROUPE"] };
    mockApi({ nights: [], check }); mount("stage=event&task=nights");
    fireEvent.click(await screen.findByRole("button", { name: "+ Agregar jornada" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Nombre de jornada" }), { target: { value: "Noche inicial" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar jornada" }));
    expect(writes()).toHaveLength(0);
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar alta" }));
    await waitFor(() => expect(progress()).toHaveAttribute("aria-valuenow", "1"));
    expect(screen.getByText("Noche inicial", { selector: "strong" })).toBeInTheDocument();
    expect(writes()[0][0]).toBe("/api/v1/events/e1/nights");
    expect(screen.queryByRole("button", { name: /Preparar jurados/ })).not.toBeInTheDocument();
  });

  it("no marca etapas completas por navegar", async () => {
    mockApi({ check: { ...readiness, ready: false, missing: ["ACTIVE_TROUPE"] } }); mount("stage=event&task=nights");
    await waitFor(() => expect(progress()).toHaveAttribute("aria-valuenow", "2"));
    const navigation = screen.getByRole("region", { name: "Progreso de preparación" });
    fireEvent.click(within(navigation).getByRole("button", { name: /^Evaluación/ }));
    expect(await screen.findByRole("heading", { name: "Definí qué se evalúa" })).toBeInTheDocument();
    await waitFor(() => expect(progress()).toHaveAttribute("aria-valuenow", "2"));
    expect(document.querySelectorAll("main")).toHaveLength(1);
    expect(writes()).toHaveLength(0);
  });

  it("termina listo sin abrir evento ni exigir jurados futuros", async () => {
    mockApi({ check: { ...readiness, nightsWithoutJury: [{ nightId: "n2", nightName: "Noche futura" }] } }); mount("stage=review");
    expect(await screen.findByRole("heading", { name: "El evento está listo para abrir" })).toBeInTheDocument();
    expect(progress()).toHaveAttribute("aria-valuenow", "4");
    fireEvent.click(screen.getByRole("button", { name: "Finalizar preparación" }));
    expect(screen.getByRole("heading", { name: "Preparación finalizada" })).toBeInTheDocument();
    expect(writes()).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /Abrir competencia|Abrir evento/ })).not.toBeInTheDocument();
  });

  it.each(["unavailable", "malformed"])("no declara listo ante revisión %s", async (mode) => {
    mockApi({ override: (path) => path.endsWith("/readiness") ? mode === "unavailable" ? Promise.reject(new Error("network")) : { ready: true } : undefined });
    mount("stage=review");
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo revisar");
    expect(progress()).not.toHaveAttribute("aria-valuenow");
    expect(screen.queryByRole("button", { name: "Finalizar preparación" })).not.toBeInTheDocument();
  });

  it("lleva el faltante de programación al editor correspondiente", async () => {
    mockApi({ check: { ...readiness, ready: false, incompleteSchedules: [{ nightId: "n1", nightName: "Noche 1" }] } }); mount("stage=review");
    fireEvent.click(await screen.findByRole("button", { name: "Configurar orden de salida →" }));
    expect(await screen.findByRole("heading", { name: "Programá el orden de salida" })).toBeInTheDocument();
    expect(window.location.hash).toContain("stage=troupes&task=orden");
    expect(writes()).toHaveLength(0);
  });

  it("confirma un cambio de nombre antes de continuar, sin pedir descartarlo después de guardar", async () => {
    mockApi(); mount();
    const input = await screen.findByRole("textbox", { name: "Nombre del evento" });
    fireEvent.change(input, { target: { value: "Carnaval Renombrado" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar y continuar" }));
    expect(writes()).toHaveLength(0);
    fireEvent.click(await screen.findByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByRole("heading", { name: "Armá el calendario" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Cambios sin guardar" })).not.toBeInTheDocument();
    expect(writes()).toHaveLength(1);
  });

  it("advierte al salir con el nombre nuevo sin guardar y permite seguir editando", async () => {
    mockApi(); mount("new=1");
    fireEvent.change(screen.getByRole("textbox", { name: "Nombre del evento" }), { target: { value: "Borrador" } });
    fireEvent.click(screen.getByRole("button", { name: "Mis eventos" }));
    const dialog = await screen.findByRole("dialog", { name: "Cambios sin guardar" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Seguir editando" }));
    expect(screen.getByRole("textbox", { name: "Nombre del evento" })).toHaveValue("Borrador");
    await waitFor(() => expect(window.location.hash).toContain("/admin/prepare"));
    expect(writes()).toHaveLength(0);
  });

  it("rechaza acceso al asistente sin ADMIN", () => {
    mockApi(); mount("new=1", { ...admin, roles: ["JUDGE"] });
    expect(screen.getByText("No tenés permisos de administración")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Crear y continuar" })).not.toBeInTheDocument();
    expect(writes()).toHaveLength(0);
  });

  it("protege el borrador de rubro al cambiar de etapa y descarta sin guardar", async () => {
    mockApi(); mount("stage=evaluation&task=catalogo");
    fireEvent.click(await screen.findByRole("button", { name: /Crear primer rubro|Agregar rubro/ }));
    fireEvent.change(screen.getByLabelText("Nombre del rubro"), { target: { value: "Coreografía" } });
    const target = within(screen.getByRole("region", { name: "Progreso de preparación" })).getByRole("button", { name: /^Comparsas/ });
    fireEvent.click(target);
    let dialog = screen.getByRole("dialog", { name: /descartar cambios/i });
    fireEvent.click(within(dialog).getByRole("button", { name: /permanecer/i }));
    expect(screen.getByLabelText("Nombre del rubro")).toHaveValue("Coreografía");
    expect(window.location.hash).toContain("stage=evaluation");
    fireEvent.click(target);
    dialog = screen.getByRole("dialog", { name: /descartar cambios/i });
    fireEvent.click(within(dialog).getByRole("button", { name: /descartar/i }));
    expect(await screen.findByRole("heading", { name: "Agregá las comparsas" })).toBeInTheDocument();
    expect(writes()).toHaveLength(0);
  });

  it("protege una jornada sin guardar al cambiar de etapa", async () => {
    mockApi(); mount("stage=event&task=nights");
    fireEvent.click(await screen.findByRole("button", { name: "+ Agregar jornada" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Nombre de jornada" }), { target: { value: "Noche pendiente" } });
    fireEvent.click(within(screen.getByRole("region", { name: "Progreso de preparación" })).getByRole("button", { name: /^Evaluación/ }));
    const dialog = screen.getByRole("dialog", { name: "Cambios sin guardar" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Seguir editando" }));
    expect(screen.getByRole("textbox", { name: "Nombre de jornada" })).toHaveValue("Noche pendiente");
    expect(window.location.hash).toContain("stage=event");
    expect(writes()).toHaveLength(0);
  });

  it("reintenta una revisión fallida sin declarar éxito antes de la API", async () => {
    let available = false;
    mockApi({ override: (path) => path.endsWith("/readiness") && !available ? Promise.reject(new Error("network")) : undefined });
    mount("stage=review");
    await screen.findByRole("alert");
    expect(screen.queryByRole("button", { name: "Finalizar preparación" })).not.toBeInTheDocument();
    available = true;
    fireEvent.click(screen.getByRole("button", { name: "Revisar nuevamente" }));
    expect(await screen.findByRole("button", { name: "Finalizar preparación" })).toBeEnabled();
    expect(writes()).toHaveLength(0);
  });

  it("sincroniza los enlaces internos del editor con el paso del asistente", async () => {
    mockApi(); mount("stage=evaluation&task=rubros");
    fireEvent.click(await screen.findByRole("button", { name: "Volver a Especialidades" }));
    expect(await screen.findByRole("heading", { name: "Prepará las especialidades" })).toBeInTheDocument();
    expect(window.location.hash).toContain("stage=evaluation&task=especialidades");
  });
});

describe("Estados del asistente", () => {
  it("mantiene estados desconocidos como no disponibles", () => {
    expect(preparationStages({ ready: true }, "available")).toEqual(["unavailable", "unavailable", "unavailable", "unavailable"]);
  });
  it("no inventa destino de edición para una regla desconocida", () => {
    expect(preparationIssueLocation({ key: "missing-FUTURE_RULE" })).toBeNull();
  });
});
