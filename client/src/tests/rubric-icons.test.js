import { describe, expect, it } from "vitest";
import {
  RUBRIC_ICONS,
  RUBRIC_ICON_KEYS,
  isRubricIcon,
  rubricIconLabel,
  rubricIconUrl,
} from "../lib/rubric-icons.js";

describe("catálogo de íconos de rubro", () => {
  it("expone las diez claves que persiste la API (migración 083)", () => {
    expect(RUBRIC_ICON_KEYS).toEqual([
      "Bastonera",
      "Bateria",
      "Carruaje",
      "Musica",
      "Pareja",
      "PortaEstandarte",
      "Presentador",
      "Reina",
      "Rey",
      "Traje",
    ]);
    expect(RUBRIC_ICONS).toHaveLength(10);
  });

  it("resuelve el asset versionado del repositorio", () => {
    expect(rubricIconUrl("Musica")).toBe("/icons/rubros/Musica.png");
    expect(rubricIconUrl("PortaEstandarte")).toBe("/icons/rubros/PortaEstandarte.png");
  });

  it("no construye rutas fuera del catálogo", () => {
    expect(rubricIconUrl("Desconocido")).toBe("");
    expect(rubricIconUrl("../secreto")).toBe("");
    expect(isRubricIcon("Reina")).toBe(true);
    expect(isRubricIcon("reina")).toBe(false);
  });

  it("devuelve una etiqueta legible sólo para claves válidas", () => {
    expect(rubricIconLabel("Bateria")).toBe("Batería");
    expect(rubricIconLabel("PortaEstandarte")).toBe("Portaestandarte");
    expect(rubricIconLabel("Nope")).toBeNull();
  });
});
