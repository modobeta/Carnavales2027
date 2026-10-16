import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RubricIconPicker } from "../components/RubricIconPicker.jsx";

describe("RubricIconPicker", () => {
  afterEach(cleanup);

  it("ofrece las diez opciones del catálogo más la opción sin ícono", () => {
    const { container } = render(<RubricIconPicker />);
    expect(screen.getAllByRole("radio")).toHaveLength(11);
    expect(screen.getByLabelText("Sin ícono")).toBeChecked();
    expect(screen.getByLabelText("Música")).not.toBeChecked();
    expect(container.querySelector("img[src='/icons/rubros/Reina.png']")).not.toBeNull();
  });

  it("preselecciona el ícono del rubro al editar", () => {
    render(<RubricIconPicker defaultValue="PortaEstandarte" />);
    expect(screen.getByLabelText("Portaestandarte")).toBeChecked();
    expect(screen.getByLabelText("Sin ícono")).not.toBeChecked();
  });

  it("envía el valor elegido como campo de formulario", () => {
    const { container } = render(
      <form>
        <RubricIconPicker name="icon" defaultValue="Traje" />
      </form>,
    );
    const data = new FormData(container.querySelector("form"));
    expect(data.get("icon")).toBe("Traje");
  });
});
