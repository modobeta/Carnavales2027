import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { apiRequest } from "../api/http.js";
import { AdminCompetenciaPage } from "../pages/AdminCompetenciaPage.jsx";
vi.mock("../api/http.js", () => ({ apiRequest: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

function setup(delayedResource) {
  const data = { categories: [{ id: "c1", name: "Comparsa", active: true }], troupes: [{ id: "t1", name: "Estrella", active: true }], specialties: [{ id: "sp1", name: "Danza", active: true }], rubrics: [], "orphaned-criteria": [], nights: [{ id: "n1", name: "Noche 1" }, { id: "n2", name: "Noche 2" }], schedule: [] };
  const pending = [];
  let delaying = true;
  apiRequest.mockImplementation(async (path, options) => {
    const resource = path.split("/").at(-1).split("?")[0];
    if (options?.method) {
      const body = JSON.parse(options.body);
      const saved = { id: `${resource}-new`, active: true, items: [], criteria: [], presentationOrder: 1, ...body };
      if (resource === "items") data.rubrics.find(r => path.includes(r.id)).items.push(saved);
      else data[resource].push(saved);
      delaying = false;
      return saved;
    }
    if (path.includes("/rubrics/") && !path.endsWith("/items")) return structuredClone(data.rubrics.find(r => path.endsWith(r.id)));
    const snapshot = structuredClone(data[resource] ?? []);
    if (resource === delayedResource && delaying) return new Promise(resolve => pending.push(() => resolve(snapshot)));
    return snapshot;
  });
  render(<AdminCompetenciaPage event={{ id: "e1", name: "Carnaval", status: "CONFIGURING" }} />);
  return async () => { await act(async () => pending.forEach(resolve => resolve())); };
}

it("conserva el tipo creado y su opción en comparsas frente a lecturas anteriores tardías", async () => {
  const release = setup("categories");
  fireEvent.click(screen.getByRole("button", { name: "+ Nuevo tipo" }));
  const form = screen.getByRole("button", { name: "Agregar tipo" }).closest("form");
  fireEvent.change(within(form).getByLabelText("Nombre"), { target: { value: "Invitadas" } });
  fireEvent.submit(form);
  await screen.findByRole("button", { name: "Editar tipo Invitadas" });
  await release();
  expect(screen.getByRole("button", { name: "Editar tipo Invitadas" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Nueva comparsa/ }));
  expect(within(screen.getByRole("dialog")).getByRole("option", { name: "Invitadas" })).toBeInTheDocument();
});

it("conserva el rubro nuevo cuando termina una lectura anterior vacía", async () => {
  const release = setup("rubrics");
  fireEvent.click(screen.getByRole("button", { name: /Rubros, ítems y criterios/ }));
  const form = screen.getByRole("button", { name: "Crear rubro" }).closest("form");
  fireEvent.change(within(form).getByLabelText("Nombre"), { target: { value: "Vestuario" } });
  fireEvent.submit(form);
  await screen.findByRole("button", { name: "Agregar item a Vestuario" });
  await release();
  expect(screen.getByRole("button", { name: "Agregar item a Vestuario" })).toBeInTheDocument();
});

it("no pierde una comparsa programada por una lectura inicial tardía", async () => {
  const release = setup("schedule");
  const selector = await screen.findByRole("combobox", { name: "Comparsa para programar en la jornada" });
  fireEvent.change(selector, { target: { value: "t1" } });
  fireEvent.click(screen.getByRole("button", { name: "Programar comparsa" }));
  await screen.findByRole("button", { name: "Quitar Estrella de Noche 1" });
  await release();
  expect(screen.getByRole("button", { name: "Quitar Estrella de Noche 1" })).toBeInTheDocument();
});

it("mantiene la jornada elegida al actualizar tipos de participación", async () => {
  setup();
  const selector = await screen.findByRole("combobox", { name: "Jornada para el orden de pasada" });
  fireEvent.change(selector, { target: { value: "n2" } });
  fireEvent.click(screen.getByRole("button", { name: "+ Nuevo tipo" }));
  const form = screen.getByRole("button", { name: "Agregar tipo" }).closest("form");
  fireEvent.change(within(form).getByLabelText("Nombre"), { target: { value: "Invitadas" } });
  fireEvent.submit(form);
  await screen.findByRole("button", { name: "Editar tipo Invitadas" });
  await act(async () => {});
  expect(selector).toHaveValue("n2");
});


it("actualiza la comparsa y el selector de programación aunque termine una consulta vieja", async () => {
  const release = setup("troupes");
  await screen.findByRole("button", { name: "Editar tipo Comparsa" });
  fireEvent.click(screen.getByRole("button", { name: "+ Nueva comparsa" }));
  const form = screen.getByRole("button", { name: "Agregar comparsa" }).closest("form");
  fireEvent.change(within(form).getByLabelText("Nombre"), { target: { value: "Luna" } });
  fireEvent.change(within(form).getByLabelText("Tipo de participación"), { target: { value: "c1" } });
  fireEvent.submit(form);
  await screen.findByRole("button", { name: "Editar comparsa Luna" });
  await release();
  expect(screen.getByRole("button", { name: "Editar comparsa Luna" })).toBeInTheDocument();
  expect(within(screen.getByRole("combobox", { name: "Comparsa para programar en la jornada" })).getByRole("option", { name: "Luna" })).toBeInTheDocument();
});

it("muestra un rubro y su ítem recién creados sin recargar y conserva el resumen actualizado", async () => {
  const release = setup("rubrics");
  fireEvent.click(screen.getByRole("button", { name: /Rubros, ítems y criterios/ }));
  const form = screen.getByRole("button", { name: "Crear rubro" }).closest("form");
  fireEvent.change(within(form).getByLabelText("Nombre"), { target: { value: "Vestuario" } });
  fireEvent.submit(form);
  const add = await screen.findByRole("button", { name: "Agregar item a Vestuario" });
  fireEvent.change(screen.getByLabelText("Nuevo item puntuable para Vestuario"), { target: { value: "Colorido" } });
  fireEvent.change(screen.getByLabelText("Especialidad del nuevo item para Vestuario"), { target: { value: "sp1" } });
  fireEvent.submit(add.closest("form"));
  await screen.findByText("Item guardado.");
  await release();
  expect(screen.getAllByText("Colorido").length).toBeGreaterThan(0);
  expect(screen.getByText(/Todos los rubros tienen ítems puntuables/)).toBeInTheDocument();
});
