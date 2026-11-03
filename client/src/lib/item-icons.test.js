import { describe, expect, it } from "vitest";

describe("catálogo de íconos de ítem", () => {
  it("expone las claves del catálogo actualizado", () => {
    expect(ITEM_ICON_KEYS).toEqual([
      "AnunciadorDelCarnaval",
      "BastoneraDeComparsa",
      "BateriaDeComparsa",
      "CarroDeComparsa",
      "CarrozaDeReina",
      "ComisionDeFrente",
      "CordonerasDeBateria",
      "CordonerasDelCarnaval",
      "CoreografiaDeComparsa",
      "DisenoDeComparsa",
      "EmbajadorDelCarnaval",
      "InterpretacionMusical",
      "ParejaDeBaileDelCarnaval",
      "PresentadorDeComparsa",
      "PortaestandarteDeBateria",
      "ReinaDelCarnaval",
      "TrajeFemenino",
    ]);
    expect(ITEM_ICONS).toHaveLength(19);
  });

  it("resuelve el asset versionado del repositorio", () => {
    expect(itemIconUrl("BateriaDeComparsa")).toBe("/icons/items/Bater%C3%ADa%20de%20Comparsa.png");
    expect(itemIconUrl("InterpretacionMusical")).toBe("/icons/items/Interpretaci%C3%B3n%20Musical.png");
  });

  it("no construye rutas fuera del catálogo", () => {
    expect(itemIconUrl("Desconocido")).toBe("");
    expect(itemIconUrl("../secreto")).toBe("");
    expect(isItemIcon("CoreografiaDeComparsa")).toBe(true);
    expect(isItemIcon("coreografiadecomparsa")).toBe(false);
  });

  it("devuelve una etiqueta legible sólo para claves válidas", () => {
    expect(itemIconLabel("DisenoDeComparsa")).toBe("Diseño de comparsa");
    expect(itemIconLabel("PresentadorDeComparsa")).toBe("Presentador de comparsa");
    expect(itemIconLabel("Nope")).toBeNull();
  });
});
