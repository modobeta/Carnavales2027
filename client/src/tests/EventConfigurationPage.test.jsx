import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../api/http.js";
import { EventConfigurationPage } from "../pages/EventConfigurationPage.jsx";

vi.mock("../api/http.js", () => ({ apiRequest: vi.fn() }));

describe("EventConfigurationPage", () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it("renderiza bajo la capa de instrumento data-layer='instrument' (RF-177)", () => {
    const { container } = render(<EventConfigurationPage event={{ id: "event-1", status: "CONFIGURING" }} />);
    expect(container.querySelector("main.admin-shell")).toHaveAttribute("data-layer", "instrument");
  });

  it("muestra solo datos del evento y jornadas, sin rubros ni comparsas", () => {
    render(<EventConfigurationPage event={{ id: "event-1", status: "CONFIGURING" }} />);
    expect(screen.getByRole("heading", { name: "Datos del evento" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Jornadas" })).toBeInTheDocument();
    expect(screen.queryByText("Rubros")).not.toBeInTheDocument();
    expect(screen.queryByText("Comparsas")).not.toBeInTheDocument();
    expect(screen.queryByText("Especialidades")).not.toBeInTheDocument();
  });

  it("deja la configuracion en solo lectura cuando el evento esta OPEN", () => {
    render(<EventConfigurationPage event={{ id: "event-1", status: "OPEN" }} />);
    expect(screen.getByLabelText("Nombre del evento")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "+ Agregar jornada" })).not.toBeInTheDocument();
    expect(screen.getByText(/ya no puede modificarse/)).toBeInTheDocument();
  });

  it("muestra el boton de Competencia", () => {
    const onCompetencia = vi.fn();
    render(<EventConfigurationPage event={{ id: "event-1", status: "CONFIGURING" }} onCompetencia={onCompetencia} />);
    expect(screen.getByRole("button", { name: "Competencia" })).toBeInTheDocument();
  });

  it("permite crear una jornada desde el drawer", async () => {
    apiRequest.mockResolvedValueOnce({ ready: false, missing: [], incompleteTroupes: [], incompleteRubrics: [], orphanedCriteria: [] });
    apiRequest.mockResolvedValueOnce({ id: "n1", name: "Noche 1", displayOrder: 1, kind: "COMPETITION", eventDate: null });
    apiRequest.mockResolvedValueOnce({ ready: false, missing: [], incompleteTroupes: [], incompleteRubrics: [], orphanedCriteria: [] });
    render(<EventConfigurationPage event={{ id: "event-1", status: "CONFIGURING" }} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Agregar jornada" }));
    fireEvent.change(screen.getByLabelText("Nombre de jornada"), { target: { value: "Noche 1" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar jornada" }));

    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "/api/v1/events/event-1/nights",
      expect.objectContaining({ body: JSON.stringify({ name: "Noche 1", displayOrder: 1, kind: "COMPETITION", eventDate: null }) }),
    ));
  });

  it("agrupa Cancelar y Agregar jornada en el pie del formulario", () => {
    render(<EventConfigurationPage event={{ id: "event-1", status: "CONFIGURING" }} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Agregar jornada" }));

    const form = screen.getByRole("button", { name: "Agregar jornada" }).closest("form");
    const actions = form.querySelector(".dialog-footer-actions");

    expect(actions).toBeInTheDocument();
    expect(within(actions).getAllByRole("button").map((button) => button.textContent.trim()))
      .toEqual(["Cancelar", "Agregar jornada"]);
  });

  it("mantiene el tipo de jornada como un selector etiquetado y personalizado visualmente", () => {
    render(<EventConfigurationPage event={{ id: "event-1", status: "CONFIGURING" }} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Agregar jornada" }));

    expect(screen.getByLabelText("Tipo de jornada")).toHaveClass("night-form__kind");
  });

  it("presenta el orden como Orden de visualización con max+1", async () => {
    apiRequest.mockResolvedValue({ ready: false, missing: [], incompleteTroupes: [], incompleteRubrics: [], orphanedCriteria: [] });
    render(<EventConfigurationPage
      event={{ id: "event-1", status: "CONFIGURING" }}
      nights={[{ id: "n1", name: "Noche 1", displayOrder: 1, kind: "COMPETITION", eventDate: null }]}
    />);

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "#" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "+ Agregar jornada" }));
    expect(screen.getByLabelText("Orden de visualización")).toHaveValue(2);
  });

  it("permite editar una jornada desde la tabla", async () => {
    apiRequest.mockResolvedValue({ ready: false, missing: [], incompleteTroupes: [], incompleteRubrics: [], orphanedCriteria: [] });
    render(<EventConfigurationPage
      event={{ id: "event-1", status: "CONFIGURING" }}
      nights={[{ id: "n1", name: "Noche 1", displayOrder: 1, kind: "COMPETITION", eventDate: null }]}
    />);

    fireEvent.click(screen.getByRole("button", { name: "Editar jornada Noche 1" }));
    fireEvent.change(screen.getByLabelText("Nombre de jornada"), { target: { value: "Noche 1 Editada" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar jornada" }));

    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "/api/v1/nights/n1",
      expect.objectContaining({ method: "PATCH" }),
    ));
  });

  it("permite editar el nombre del evento", async () => {
    apiRequest.mockResolvedValueOnce({ ready: false, missing: [], incompleteTroupes: [], incompleteRubrics: [], orphanedCriteria: [] });
    apiRequest.mockResolvedValueOnce({ id: "event-1", name: "Goya 2027 Editado", status: "CONFIGURING" });
    apiRequest.mockResolvedValueOnce({ ready: false, missing: [], incompleteTroupes: [], incompleteRubrics: [], orphanedCriteria: [] });
    render(<EventConfigurationPage event={{ id: "event-1", name: "Goya 2027", status: "CONFIGURING" }} />);

    fireEvent.change(screen.getByLabelText("Nombre del evento"), { target: { value: "Goya 2027 Editado" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar evento" }));
    // E-1 (spec 040): ADMIN también confirma el cambio en un modal.
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "/api/v1/events/event-1",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ name: "Goya 2027 Editado" }) }),
    ));
  });

  it("muestra el panel de preparacion del evento", async () => {
    apiRequest.mockResolvedValue({ ready: true, missing: [], incompleteTroupes: [], incompleteRubrics: [], orphanedCriteria: [] });
    render(<EventConfigurationPage event={{ id: "event-1", status: "CONFIGURING" }} />);
    await waitFor(() => expect(screen.getByText("Requisitos para abrir el evento")).toBeInTheDocument());
  });

  it("permite eliminar una jornada con confirmacion previa", async () => {
    apiRequest.mockImplementation((url, options) => options?.method === "DELETE"
      ? Promise.resolve({ id: "n1" })
      : Promise.resolve({ ready: false, missing: [], incompleteTroupes: [], incompleteRubrics: [], orphanedCriteria: [] }));
    render(<EventConfigurationPage
      event={{ id: "event-1", status: "CONFIGURING" }}
      nights={[{ id: "n1", name: "Noche 1", displayOrder: 1, kind: "COMPETITION", eventDate: null }]}
    />);

    fireEvent.click(screen.getByRole("button", { name: "Eliminar jornada Noche 1" }));
    expect(await screen.findByRole("dialog", { name: "Eliminar Noche 1" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Eliminar jornada" }));

    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "/api/v1/nights/n1",
      expect.objectContaining({ method: "DELETE" }),
    ));
    expect(await screen.findByText("Jornada Noche 1 eliminada.")).toBeInTheDocument();
  });

  it("advierte sobre cambios sin guardar al intentar salir del drawer con datos", async () => {
    apiRequest.mockResolvedValue({ ready: false, missing: [], incompleteTroupes: [], incompleteRubrics: [], orphanedCriteria: [] });
    render(<EventConfigurationPage event={{ id: "event-1", status: "CONFIGURING" }} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Agregar jornada" }));
    fireEvent.change(screen.getByLabelText("Nombre de jornada"), { target: { value: "Noche 1" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(await screen.findByRole("dialog", { name: "Cambios sin guardar" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Descartar cambios" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "+ Agregar jornada" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("dialog", { name: "Cambios sin guardar" })).not.toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalledWith("/api/v1/events/event-1/nights", expect.anything());
  });

  it("oculta eliminar jornada cuando el evento esta OPEN", () => {
    render(<EventConfigurationPage
      event={{ id: "event-1", status: "OPEN" }}
      nights={[{ id: "n1", name: "Noche 1", displayOrder: 1, kind: "COMPETITION", eventDate: null, status: "DRAFT" }]}
    />);
    expect(screen.queryByRole("button", { name: "Eliminar jornada Noche 1" })).not.toBeInTheDocument();
  });
});
