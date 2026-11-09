import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ItemIcon } from "../components/ItemIcon.jsx";

describe("ItemIcon", () => {
  afterEach(cleanup);

  it("usa el círculo ámbar y el asset del ítem", () => {
    const { container } = render(<ItemIcon icon="BateriaDeComparsa" />);
    const circle = container.querySelector(".item-icon-circle");
    expect(circle).not.toBeNull();
    expect(circle).toHaveClass("rubric-icon-circle");
    const img = container.querySelector("img.item-icon");
    expect(img).toHaveAttribute("src", "/assets/evaluation/items/Bater%C3%ADa%20de%20Comparsa.png");
    expect(circle).toHaveAttribute("aria-hidden", "true");
  });

  it("no renderiza nada si el ítem no tiene ícono", () => {
    const { container } = render(<ItemIcon icon={null} />);
    expect(container.querySelector(".item-icon-circle")).toBeNull();
  });

  it("expone un nombre accesible cuando se pasa label", () => {
    render(<ItemIcon icon="CarrozaDeReina" label="Ícono del ítem: Carroza" />);
    expect(screen.getByRole("img", { name: "Ícono del ítem: Carroza" })).toBeInTheDocument();
  });
});
