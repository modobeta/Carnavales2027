/**
 * Catálogo cerrado de íconos de rubro.
 *
 * La clave es la que persiste la API en `rubric.icon` (migración 083) y coincide
 * con el nombre del asset versionado en `public/icons/rubros`. El cliente no
 * recibe el binario desde la API: resuelve el archivo del repositorio. Debe
 * mantenerse sincronizado con `RUBRIC_ICONS` de
 * `api/src/modules/rubrics/rubric-service.js`.
 */
export const RUBRIC_ICONS = Object.freeze([
  { key: "Bastonera", label: "Bastonera" },
  { key: "Bateria", label: "Batería" },
  { key: "Carruaje", label: "Carruaje" },
  { key: "Musica", label: "Música" },
  { key: "Pareja", label: "Pareja" },
  { key: "PortaEstandarte", label: "Portaestandarte" },
  { key: "Presentador", label: "Presentador" },
  { key: "Reina", label: "Reina" },
  { key: "Rey", label: "Rey" },
  { key: "Traje", label: "Traje" },
]);

export const RUBRIC_ICON_KEYS = Object.freeze(RUBRIC_ICONS.map((icon) => icon.key));

const RUBRIC_ICON_KEY_SET = new Set(RUBRIC_ICON_KEYS);

/** `true` cuando la clave pertenece al catálogo vigente. */
export function isRubricIcon(key) {
  return RUBRIC_ICON_KEY_SET.has(key);
}

/**
 * URL del asset del ícono. Devuelve cadena vacía si la clave no es válida para
 * no construir rutas fuera del catálogo.
 */
export function rubricIconUrl(key) {
  return isRubricIcon(key) ? `/icons/rubros/${key}.png` : "";
}

/** Etiqueta legible de una clave, o `null` si no pertenece al catálogo. */
export function rubricIconLabel(key) {
  return RUBRIC_ICONS.find((icon) => icon.key === key)?.label ?? null;
}
