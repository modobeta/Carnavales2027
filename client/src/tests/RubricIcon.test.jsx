import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RubricIcon } from "../components/RubricIcon.jsx";

describe("RubricIcon", () => {
  afterEach(cleanup);

  it("pinta el círculo con el color de la comparsa y usa el asset del rubro", () => {
    const { container } = render(<RubricIcon icon="Musica" color="#5e46be" />);
    const circle = container.querySelector(".rubric-icon-circle");
    expect(circle).not.toBeNull();
    expect(circle.style.backgroundColor).toBe("rgb(94, 70, 190)");
    const img = container.querySelector("img.rubric-icon");
    expect(img).toHaveAttribute("src", "/icons/rubros/Musica.png");
    expect(circle).toHaveAttribute("aria-hidden", "true");
  });

  it("no renderiza nada si el rubro no tiene ícono", () => {
    const { container } = render(<RubricIcon icon={null} color="#5e46be" />);
    expect(container.querySelector(".rubric-icon-circle")).toBeNull();
  });

  it("usa el círculo claro sobre un encabezado ya pintado con el color", () => {
    const { container } = render(<RubricIcon icon="Rey" color="#5e46be" size="lg" onBrand />);
    const circle = container.querySelector(".rubric-icon-circle");
    expect(circle).toHaveClass("is-lg");
    expect(circle).toHaveClass("is-on-brand");
    expect(circle.style.backgroundColor).toBe("");
  });

  it("expone un nombre accesible cuando se pasa label", () => {
    render(<RubricIcon icon="Reina" color="#5e46be" label="Rubro: Reina" />);
    expect(screen.getByRole("img", { name: "Rubro: Reina" })).toBeInTheDocument();
  });
});
