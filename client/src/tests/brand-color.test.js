import { describe, expect, it } from "vitest";
import { readableInk, relativeLuminance } from "../lib/brand-color.js";

describe("color legible sobre el color de la comparsa", () => {
  it("elige tinta oscura sobre fondos claros", () => {
    expect(readableInk("#ffffff")).toBe("#101014");
    expect(readableInk("#ffff00")).toBe("#101014");
    expect(readableInk("#fff")).toBe("#101014");
  });

  it("elige tinta clara sobre fondos oscuros", () => {
    expect(readableInk("#000000")).toBe("#ffffff");
    expect(readableInk("#036B8B")).toBe("#ffffff");
    expect(readableInk("#5e46be")).toBe("#ffffff");
  });

  it("cae en tinta clara cuando el color no es válido", () => {
    expect(readableInk("no-es-un-color")).toBe("#ffffff");
    expect(readableInk(null)).toBe("#ffffff");
    expect(relativeLuminance("no-es-un-color")).toBeNull();
  });

  it("calcula la luminancia relativa WCAG de extremos conocidos", () => {
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
  });
});
