/**
 * ItemIconPicker — selector visual de íconos de ítem para Administración.
 *
 * Usa radios nativos dentro de un `fieldset` (accesibles y compatibles con
 * `FormData`, sin estado controlado). El valor vacío significa "sin ícono".
 * El catálogo y la resolución de assets llegan por props para reutilizarlo.
 */
export const ITEM_ICONS = [
  { key: "AnunciadorDelCarnaval", label: "Anunciador del carnaval", file: "Anunciador del Carnaval.png" },
  { key: "BastoneraDeComparsa", label: "Bastonera de comparsa", file: "Bastonera de Comparsa.png" },
  { key: "BateriaDeComparsa", label: "Batería de comparsa", file: "Batería de comparsa.png" },
  { key: "CarroDeComparsa", label: "Carro de comparsa", file: "Carro de carnaval.png" },
  { key: "CarrozaDeReina", label: "Carroza de reina", file: "Carroza de Reina.png" },
  { key: "ComisionDeFrente", label: "Comisión de frente", file: "Comisión de frente.png" },
  { key: "CordonerasDeBateria", label: "Cordoneras de batería", file: "Cordoneras de batería.png" },
  { key: "CordonerasDelCarnaval", label: "Cordoneras del carnaval", file: "Cordoneras del Carnaval.png" },
  { key: "CoreografiaDeComparsa", label: "Coreografía de comparsa", file: "Coreografía de comparsa.png" },
  { key: "DisenoDeComparsa", label: "Diseño de comparsa", file: "Diseño de comparsa.png" },
  { key: "EmbajadorDelCarnaval", label: "Embajador del carnaval", file: "Embajador del Carnaval.png" },
  { key: "InterpretacionMusical", label: "Interpretación musical", file: "Interpretación Musical.png" },
  { key: "ParejaDeBaileDelCarnaval", label: "Pareja de baile del carnaval", file: "Pareja de Baile del Carnaval.png" },
  { key: "PresentadorDeComparsa", label: "Presentador de comparsa", file: "Presentador de Comparsa.png" },
  { key: "PortaestandarteDeBateria", label: "Portaestandarte de batería", file: "Portaestandarte de batería.png" },
  { key: "ReinaDelCarnaval", label: "Reina del carnaval", file: "Reina del carnaval.png" },
  { key: "TrajeFemenino", label: "Traje femenino", file: "Traje Femenino.png" },
  { key: "ReyDelCarnaval", label: "Rey del carnaval", file: "Rey del carnaval.png" },
  { key: "PortaEstandarteDelCarnaval", label: "Porta Estandarte del carnaval", file: "Porta Estandarte del Carnaval.png" },
  { key: "ReinaDeLaComparsa", label: "Reina de la comparsa", file: "Reina de la comparsa.png" },
];

export const ITEM_ICON_KEYS = ITEM_ICONS.map((icon) => icon.key);

const ITEM_ICON_KEY_SET = new Set(ITEM_ICONS.map((icon) => icon.key));

/** `true` cuando la clave pertenece al catálogo vigente. */
export function isItemIcon(key) {
  return ITEM_ICON_KEY_SET.has(key);
}

/**
 * URL del asset del ícono. Devuelve cadena vacía si la clave no es válida para
 * no construir rutas fuera del catálogo.
 */
export function itemIconUrl(key) {
  const icon = ITEM_ICONS.find((entry) => entry.key === key);
  return icon ? `/assets/evaluation/items/${icon.file}` : "";
}

/** Etiqueta legible de una clave, o `null` si no pertenece al catálogo. */
export function itemIconLabel(key) {
  return ITEM_ICONS.find((icon) => icon.key === key)?.label ?? null;
}