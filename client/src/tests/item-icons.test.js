import { describe, expect, it } from "vitest";
import { ITEM_ICONS, ITEM_ICON_KEYS, isItemIcon, itemIconUrl, itemIconLabel } from "../lib/item-icons.js";

describe("catálogo de íconos de ítem", () => {
  it("expone 20 claves del catálogo actualizado", () => {
    expect(ITEM_ICON_KEYS).toHaveLength(20);
    expect(ITEM_ICONS).toHaveLength(20);
  });

  it("incluye las claves esperadas", () => {
    const expectedKeys = [
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
      "ReinaDeLaComparsa",
      "ReyDelCarnaval",
      "PortaEstandarteDelCarnaval",
      "TrajeFemenino",
    ];
    expectedKeys.forEach(key => {
      expect(ITEM_ICON_KEYS).toContain(key);
    });
  });

  it("resuelve el asset versionado del repositorio", () => {
    expect(itemIconUrl("BateriaDeComparsa")).toBe("/assets/evaluation/items/Bater%C3%ADa%20de%20Comparsa.png");
    expect(itemIconUrl("ReinaDelCarnaval")).toBe("/assets/evaluation/items/Reina%20del%20carnaval.png");
    expect(itemIconUrl("ReyDelCarnaval")).toBe("/assets/evaluation/items/Rey%20del%20carnaval.png");
    expect(itemIconUrl("PortaEstandarteDelCarnaval")).toBe("/assets/evaluation/items/Porta%20Estandarte%20del%20Carnaval.png");
    expect(itemIconUrl("ReinaDeLaComparsa")).toBe("/assets/evaluation/items/Reina%20de%20la%20comparsa.png");
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
