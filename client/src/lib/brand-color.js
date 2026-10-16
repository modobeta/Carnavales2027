/**
 * Utilidades de color de identidad de comparsa.
 *
 * El color lo administra el backend (`event_troupe.brand_color`). El cliente no
 * lo valida como regla de negocio: sólo calcula un color de texto legible para
 * poder pintarlo como fondo sin perder contraste.
 */

const DARK_INK = "#101014";
const LIGHT_INK = "#ffffff";

function parseHex(value) {
  if (typeof value !== "string") return null;
  const hex = value.trim().replace(/^#/, "");
  if (hex.length === 3) {
    return [
      Number.parseInt(hex[0] + hex[0], 16),
      Number.parseInt(hex[1] + hex[1], 16),
      Number.parseInt(hex[2] + hex[2], 16),
    ];
  }
  if (hex.length === 6) {
    return [
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16),
    ];
  }
  return null;
}

function channelToLinear(channel) {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Luminancia relativa WCAG de un color hex, o `null` si el valor no es válido. */
export function relativeLuminance(value) {
  const rgb = parseHex(value);
  if (!rgb || rgb.some(Number.isNaN)) return null;
  const [r, g, b] = rgb.map(channelToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a, b) {
  const [hi, lo] = a >= b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Devuelve el color de texto (oscuro o claro) con mayor contraste sobre el fondo
 * indicado. Si el fondo no es un hex válido, devuelve texto claro.
 */
export function readableInk(background) {
  const luminance = relativeLuminance(background);
  if (luminance === null) return LIGHT_INK;
  const dark = contrastRatio(luminance, relativeLuminance(DARK_INK));
  const light = contrastRatio(luminance, relativeLuminance(LIGHT_INK));
  return dark >= light ? DARK_INK : LIGHT_INK;
}
