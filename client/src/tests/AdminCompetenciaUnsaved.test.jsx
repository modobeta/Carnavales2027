import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import App from "../App.jsx";
import { AdminCompetenciaPage } from "../pages/AdminCompetenciaPage.jsx";
import { apiRequest } from "../api/http.js";

vi.mock("../api/http.js", () => ({ apiRequest: vi.fn() }));
const event = { id: "e1", name: "Carnaval 2027", status: "CONFIGURING" };
const other = { id: "e2", name: "Otro evento", status: "CONFIGURING" };
const specialties = [{ id: "s1", name: "Danza", active: true }, { id: "s2", name: "Música", active: true }];
const readiness = { ready: false, missing: [], incompleteRubrics: [], incompleteNominations: [], incompleteTroupes: [], incompleteSchedules: [], nightsWithoutJury: [] };

function mockApi({ hasRubric = false } = {}) {
  apiRequest.mockImplementation(async (path, options) => {
    if (options?.method === "POST" && path === "/api/v1/events/e1/rubrics") return { id: "r1", name: "Coreografía", items: [], criteria: [] };
    if (path === "/api/v1/events") return [event, other];
    const resource = path.split("?")[0].split("/").at(-1);
    if (resource === "rubrics" && !options?.method && hasRubric) return [{ id: "existing", name: "Vestuario", active: true, items: [{ id: "i1", name: "Color", specialtyId: "s1", active: true }], criteria: [], nominations: [] }];
    return structuredClone({ specialties, rubrics: [], readiness, troupes: [], categories: [], "orphaned-criteria": [] }[resource] ?? []);
  });
}

async function draft() {
  const open = await screen.findByRole("button", { name: /Crear primer rubro|Agregar rubro/ });
  fireEvent.click(open);
  const form = screen.getByRole("button", { name: "Crear rubro" }).closest("form");
  fireEvent.change(within(form).getByLabelText("Nombre del rubro"), { target: { value: "Coreografía" } });
  return form;
}

function discardDialog() { return screen.getByRole("dialog", { name: /descartar cambios/i }); }
function stay() { fireEvent.click(within(discardDialog()).getByRole("button", { name: /permanecer/i })); }
function discard() { fireEvent.click(within(discardDialog()).getByRole("button", { name: /descartar/i })); }

afterEach(() => {
  cleanup(); vi.resetAllMocks(); vi.unstubAllGlobals(); window.localStorage.clear();
  window.history.replaceState(null, "", "#/login");
});

it("cancelar desde formulario o cabecera advierte; permanecer conserva valores y descartar no guarda", async () => {
  mockApi({ hasRubric: true });
  render(<AdminCompetenciaPage event={event} initialStep="catalogo" />);
  const form = await draft();
  fireEvent.click(within(form).getByRole("button", { name: "Cancelar" }));
  expect(discardDialog()).toBeInTheDocument();
  stay();
  expect(within(form).getByLabelText("Nombre del rubro")).toHaveValue("Coreografía");
  fireEvent.click(screen.getByRole("button", { name: "Cancelar", expanded: true }));
  discard();
  expect(screen.queryByRole("button", { name: "Crear rubro" })).not.toBeInTheDocument();
  expect(apiRequest).not.toHaveBeenCalledWith("/api/v1/events/e1/rubrics", expect.anything());
});

it("permanecer devuelve foco al borrador y confirmar descarte lo deja en un control que continúa visible", async () => {
  mockApi(); render(<AdminCompetenciaPage event={event} initialStep="catalogo" />);
  const form = await draft();
  const input = within(form).getByLabelText("Nombre del rubro");
  input.focus();
  fireEvent.click(within(form).getByRole("button", { name: "Cancelar" }));
  stay();
  expect(input).toHaveFocus();
  fireEvent.click(within(form).getByRole("button", { name: "Cancelar" }));
  discard();
  expect(input).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: "Agregar rubro" })).toHaveFocus());
});

it("salir del catálogo a Evaluación permite permanecer o descartar el borrador", async () => {
  mockApi(); render(<AdminCompetenciaPage event={event} initialStep="catalogo" />);
  await draft();
  const evaluation = screen.getByRole("button", { name: /^Evaluación / });
  fireEvent.click(evaluation); stay();
  expect(screen.getByLabelText("Nombre del rubro")).toHaveValue("Coreografía");
  fireEvent.click(evaluation); discard();
  expect(await screen.findByRole("heading", { name: "Configurar evaluación" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Crear rubro" })).not.toBeInTheDocument();
});

it.each(["stepper", "footer", "back"])('el control %s advierte antes de salir y permite permanecer o descartar', async (control) => {
  mockApi(); const onBack = vi.fn();
  render(<AdminCompetenciaPage event={event} initialStep="catalogo" onBack={onBack} />);
  await draft();
  const target = () => control === "stepper"
    ? within(screen.getByRole("navigation", { name: "Pasos de configuración de competencia" })).getByRole("button", { name: /Especialidades/ })
    : control === "back" ? screen.getByRole("button", { name: "Volver", exact: true })
      : screen.getByRole("button", { name: /Continuar a especialidades/i });
  fireEvent.click(target()); stay();
  expect(screen.getByLabelText("Nombre del rubro")).toHaveValue("Coreografía");
  fireEvent.click(target()); discard();
  if (control === "back") expect(onBack).toHaveBeenCalledOnce();
  else expect(screen.queryByLabelText("Nombre del rubro")).not.toBeInTheDocument();
  expect(apiRequest).not.toHaveBeenCalledWith("/api/v1/events/e1/rubrics", expect.anything());
});

it("beforeunload solo avisa mientras hay cambios; guardar libera la guardia y conserva POST legado", async () => {
  mockApi(); render(<AdminCompetenciaPage event={event} initialStep="catalogo" />);
  const form = await draft();
  const before = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(before);
  expect(before.defaultPrevented).toBe(true);
  fireEvent.submit(form);
  expect(await screen.findByText("Rubro confirmado: Coreografía (r1).")).toBeInTheDocument();
  await waitFor(() => expect(form).not.toBeInTheDocument());
  expect(apiRequest).toHaveBeenCalledWith("/api/v1/events/e1/rubrics", expect.objectContaining({ method: "POST", body: expect.stringContaining('"name":"Coreografía"') }));
  const after = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(after);
  expect(after.defaultPrevented).toBe(false);
});

it("hash externo y enlace a otra ruta no desmontan el borrador antes de decidir", async () => {
  window.history.replaceState(null, "", "#/admin/competencia?step=catalogo");
  mockApi(); render(<App session={{ status: "authenticated", roles: ["ADMIN"], user: { id: "u1", name: "Admin" } }} />);
  await draft();
  await act(async () => { window.location.hash = "#/admin/events"; });
  await waitFor(() => expect(discardDialog()).toBeInTheDocument());
  expect(window.location.hash).toBe("#/admin/competencia?step=catalogo");
  expect(screen.getByLabelText("Nombre del rubro")).toHaveValue("Coreografía");
  stay();
  await act(async () => { window.location.hash = "#/admin/judges"; });
  await waitFor(() => expect(discardDialog()).toBeInTheDocument());
  discard();
  await waitFor(() => expect(window.location.hash).toBe("#/admin/judges"));
  expect(screen.queryByLabelText("Nombre del rubro")).not.toBeInTheDocument();
});

it("intercepta un enlace de navegación y un hash del mismo asistente antes de cambiar de paso", async () => {
  window.history.replaceState(null, "", "#/admin/competencia?step=catalogo");
  mockApi(); render(<App session={{ status: "authenticated", roles: ["ADMIN"], user: { id: "u1", name: "Admin" } }} />);
  await draft();
  fireEvent.click(screen.getByRole("button", { name: "Abrir menu de navegacion" }));
  const link = screen.getByRole("link", { name: /Especialidades/ });
  fireEvent.click(link);
  await waitFor(() => expect(discardDialog()).toBeInTheDocument());
  expect(window.location.hash).toBe("#/admin/competencia?step=catalogo");
  stay();
  await act(async () => { window.location.hash = "#/admin/competencia?step=revision"; });
  await waitFor(() => expect(discardDialog()).toBeInTheDocument());
  expect(screen.getByLabelText("Nombre del rubro")).toHaveValue("Coreografía");
  expect(window.location.hash).toBe("#/admin/competencia?step=catalogo");
  discard();
  await waitFor(() => expect(window.location.hash).toBe("#/admin/competencia?step=revision"));
  expect(screen.queryByLabelText("Nombre del rubro")).not.toBeInTheDocument();
});

it("Permanecer tras history.forward conserva la entrada original y permite avanzar después", async () => {
  window.history.replaceState(null, "", "#/admin/home");
  mockApi();
  const view = render(<App session={{ status: "authenticated", roles: ["ADMIN"], user: { id: "u1", name: "Admin" } }} />);
  await screen.findByRole("heading", { name: "Mis eventos" });
  await act(async () => { window.location.hash = "#/admin/competencia?step=catalogo"; });
  await screen.findByRole("button", { name: /Crear primer rubro|Agregar rubro/ });
  await act(async () => { window.location.hash = "#/admin/events"; });
  await waitFor(() => expect(window.location.hash).toBe("#/admin/events"));
  window.history.back();
  await waitFor(() => expect(window.location.hash).toBe("#/admin/competencia?step=catalogo"));
  await draft();
  window.history.forward();
  await waitFor(() => expect(discardDialog()).toBeInTheDocument());
  stay();
  expect(window.location.hash).toBe("#/admin/competencia?step=catalogo");
  view.unmount();
  window.history.forward();
  await waitFor(() => expect(window.location.hash).toBe("#/admin/events"));
});

it("Permanecer tras history.back conserva la entrada anterior y permite retroceder después", async () => {
  window.history.replaceState(null, "", "#/admin/home");
  mockApi();
  const view = render(<App session={{ status: "authenticated", roles: ["ADMIN"], user: { id: "u1", name: "Admin" } }} />);
  await screen.findByRole("heading", { name: "Mis eventos" });
  await act(async () => { window.location.hash = "#/admin/competencia?step=catalogo"; });
  await draft();
  window.history.back();
  await waitFor(() => expect(discardDialog()).toBeInTheDocument());
  stay();
  await waitFor(() => expect(window.location.hash).toBe("#/admin/competencia?step=catalogo"));
  expect(screen.getByLabelText("Nombre del rubro")).toHaveValue("Coreografía");
  view.unmount();
  window.history.back();
  await waitFor(() => expect(window.location.hash).toBe("#/admin/home"));
});

it("sin Navigation API no adivina la dirección de una entrada anterior sin marcador", async () => {
  window.history.replaceState(null, "", "#/login");
  window.history.pushState(null, "", "#/admin/home");
  window.history.pushState(null, "", "#/admin/competencia?step=catalogo");
  mockApi();
  const view = render(<App session={{ status: "authenticated", roles: ["ADMIN"], user: { id: "u1", name: "Admin" } }} />);
  await draft();
  window.history.back();
  await screen.findByRole("heading", { name: "Mis eventos" });
  expect(window.location.hash).toBe("#/admin/home");
  expect(screen.queryByRole("dialog", { name: /descartar cambios/i })).not.toBeInTheDocument();
  view.unmount();
  window.history.forward();
  await waitFor(() => expect(window.location.hash).toBe("#/admin/competencia?step=catalogo"));
});

it("la navegación interceptable decide antes del commit: permanecer cancela y descartar permite salir", async () => {
  window.history.replaceState(null, "", "#/admin/competencia?step=catalogo");
  const navigation = new EventTarget();
  vi.stubGlobal("navigation", navigation);
  mockApi(); render(<AdminCompetenciaPage event={event} initialStep="catalogo" />);
  await draft();

  const attempt = () => {
    let precommit;
    const change = new Event("navigate", { cancelable: true });
    Object.assign(change, {
      canIntercept: true,
      destination: { url: `${window.location.origin}/#/admin/events` },
      intercept: ({ precommitHandler }) => { precommit = precommitHandler; },
    });
    navigation.dispatchEvent(change);
    return precommit();
  };

  let first;
  act(() => { first = attempt(); });
  expect(discardDialog()).toBeInTheDocument();
  expect(window.location.hash).toBe("#/admin/competencia?step=catalogo");
  stay();
  await expect(first).rejects.toMatchObject({ name: "AbortError" });
  expect(screen.getByLabelText("Nombre del rubro")).toHaveValue("Coreografía");

  let second;
  act(() => { second = attempt(); });
  discard();
  await expect(second).resolves.toBeUndefined();
  expect(apiRequest).not.toHaveBeenCalledWith("/api/v1/events/e1/rubrics", expect.anything());
});

it("EventPicker decide antes de alterar evento o storage y no guarda al descartar", async () => {
  window.history.replaceState(null, "", "#/admin/competencia?step=catalogo");
  mockApi(); render(<App session={{ status: "authenticated", roles: ["ADMIN"], user: { id: "u1", name: "Admin" } }} />);
  await draft();
  const key = "carnavales.event.u1.operational";
  fireEvent.click(screen.getByRole("button", { name: /^Evento actual/ }));
  const option = screen.getByRole("option", { name: "Otro evento" });
  option.focus();
  fireEvent.click(option);
  expect(discardDialog()).toBeInTheDocument();
  expect(window.localStorage.getItem(key)).toBe("e1");
  stay();
  expect(screen.getByLabelText("Nombre del rubro")).toHaveValue("Coreografía");
  expect(screen.getByLabelText("Nombre del rubro")).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: /^Evento actual/ }));
  fireEvent.click(screen.getByRole("option", { name: "Otro evento" }));
  discard();
  await waitFor(() => expect(window.localStorage.getItem(key)).toBe("e2"));
  expect(screen.getByRole("heading", { name: "Otro evento" })).toBeInTheDocument();
  expect(apiRequest).not.toHaveBeenCalledWith("/api/v1/events/e1/rubrics", expect.anything());
});

it("Escape y cierre del modal equivalen a permanecer, sin abandonar ni POST", async () => {
  mockApi(); render(<AdminCompetenciaPage event={event} initialStep="catalogo" />);
  const form = await draft();
  fireEvent.click(within(form).getByRole("button", { name: "Cancelar" }));
  fireEvent(discardDialog(), new Event("cancel", { bubbles: true, cancelable: true }));
  expect(screen.getByLabelText("Nombre del rubro")).toHaveValue("Coreografía");
  fireEvent.click(within(form).getByRole("button", { name: "Cancelar" }));
  fireEvent.click(within(discardDialog()).getByRole("button", { name: "Cerrar diálogo" }));
  expect(screen.getByLabelText("Nombre del rubro")).toHaveValue("Coreografía");
  expect(apiRequest).not.toHaveBeenCalledWith("/api/v1/events/e1/rubrics", expect.anything());
});

it("al desmontar quita la advertencia de descarga y ya no intercepta el hash", async () => {
  mockApi(); const view = render(<AdminCompetenciaPage event={event} initialStep="catalogo" />);
  await draft();
  view.unmount();
  const unload = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(false);
  await act(async () => { window.location.hash = "#/admin/events"; fireEvent(window, new Event("hashchange")); });
  expect(window.location.hash).toBe("#/admin/events");
});
