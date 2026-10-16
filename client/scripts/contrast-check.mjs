/**
 * contrast-check.mjs — Herramienta de verificación de contraste (STYLES.md §8)
 *
 * Calcula ratios WCAG 2.2 para las combinaciones críticas de la paleta
 * definida en STYLES.md y en src/styles/tokens.css.
 *
 * Paleta resuelta (STYLES.md §2.1 / §3):
 *   - Fondo principal:             degradado vertical #036B8B → #5e46be
 *   - Tarjetas y paneles:          #5e46be (lavanda; tinta clara)
 *   - Superficies del tema oscuro: #243A53 (tinta clara)
 *   - Botón principal:             #d22b8f (§3.1)
 *
 * Uso: node scripts/contrast-check.mjs
 */

const hexToRgb = (hex) => {
  const value = hex.replace("#", "").trim();
  const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
};

const channel = (v) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

const blend = (fg, alpha, bg) => fg.map((c, i) => Math.round(alpha * c + (1 - alpha) * bg[i]));

const contrast = (a, b) => {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

const C = {
  // Extremos del degradado del fondo principal (§2.1)
  pageTop: hexToRgb("#036B8B"),
  pageBottom: hexToRgb("#5e46be"),
  // Tarjeta/panel lavanda = extremo inferior del degradado
  card: hexToRgb("#5e46be"),
  panel: hexToRgb("#243A53"),
  panelStrong: hexToRgb("#2F4D6E"),
  deep: hexToRgb("#16293C"),
  white: [255, 255, 255],

  // Botones (§3)
  primaryFill: hexToRgb("#d22b8f"),
  primaryFillHover: hexToRgb("#A81F70"),
  secondaryFill: hexToRgb("#DF3CB5"),
  secondaryInk: hexToRgb("#2E0033"),
  tertiaryFill: hexToRgb("#243A53"),
  edit: hexToRgb("#A500B5"),
  editHover: hexToRgb("#7D008A"),
  success: hexToRgb("#2BC100"),
  successHover: hexToRgb("#26A800"),
  successInk: hexToRgb("#0B2600"),
  warning: hexToRgb("#FF6F00"),
  warningHover: hexToRgb("#E05F00"),
  warningInk: hexToRgb("#2A1200"),
  danger: hexToRgb("#DC2626"),
  dangerHover: hexToRgb("#B91C1C"),

  // Acento, foco y texto sobre superficies oscuras
  accent: hexToRgb("#01B2D4"),
  accentText: hexToRgb("#BCE8F5"),
  highlight: hexToRgb("#E0B544"),
  textSecondary: hexToRgb("#EEE4F2"),
  textMuted: hexToRgb("#E7E0EC"),
  successText: hexToRgb("#B6F5C4"),
  warningText: hexToRgb("#FFE08A"),
  dangerText: hexToRgb("#FFD4D4"),
  infoText: hexToRgb("#C9E2FF"),
  successFill: hexToRgb("#B6F5C4"),
  warningFill: hexToRgb("#FFE08A"),
  navActive: hexToRgb("#D22B8F"),
  chrome: blend(hexToRgb("#0F2233"), 0.92, hexToRgb("#5e46be")),
};

const checks = [
  // Texto sobre el fondo principal — extremo inferior del degradado (§8: 4.5:1)
  ["texto primario sobre fondo principal (lavanda)", C.white, C.pageBottom, 4.5],
  ["texto secundario sobre fondo principal (lavanda)", C.textSecondary, C.pageBottom, 4.5],
  ["texto atenuado sobre fondo principal (lavanda)", C.textMuted, C.pageBottom, 4.5],
  ["texto de enlace sobre fondo principal (lavanda)", C.accentText, C.pageBottom, 4.5],

  // Texto sobre el fondo principal — extremo superior del degradado (#036B8B)
  ["texto primario sobre fondo principal (teal)", C.white, C.pageTop, 4.5],
  ["texto secundario sobre fondo principal (teal)", C.textSecondary, C.pageTop, 4.5],
  ["texto atenuado sobre fondo principal (teal)", C.textMuted, C.pageTop, 4.5],
  ["texto de enlace sobre fondo principal (teal)", C.accentText, C.pageTop, 4.5],

  // Texto claro sobre la tarjeta lavanda (§2.1: 4.5:1)
  ["texto primario sobre tarjeta", C.white, C.card, 4.5],
  ["texto secundario sobre tarjeta", C.textSecondary, C.card, 4.5],
  ["texto atenuado sobre tarjeta", C.textMuted, C.card, 4.5],
  ["texto de enlace sobre tarjeta", C.accentText, C.card, 4.5],

  // Texto claro sobre el tema oscuro (#243A53: 4.5:1)
  ["texto primario sobre tema oscuro", C.white, C.panel, 4.5],
  ["texto secundario sobre tema oscuro", C.textSecondary, C.panel, 4.5],
  ["texto atenuado sobre tema oscuro", C.textMuted, C.panel, 4.5],
  ["texto de enlace sobre tema oscuro", C.accentText, C.panel, 4.5],

  // Botones (§3): tinta sobre relleno
  ["botón principal: blanco sobre #d22b8f", C.white, C.primaryFill, 4.5],
  ["botón principal hover: blanco sobre #A81F70", C.white, C.primaryFillHover, 4.5],
  ["botón secundario: tinta sobre #DF3CB5", C.secondaryInk, C.secondaryFill, 4.5],
  ["botón terciario: blanco sobre #243A53", C.white, C.tertiaryFill, 4.5],
  ["botón edición: blanco sobre #A500B5", C.white, C.edit, 4.5],
  ["botón edición hover: blanco sobre #7D008A", C.white, C.editHover, 4.5],
  ["botón éxito: tinta sobre #2BC100", C.successInk, C.success, 4.5],
  ["botón éxito hover: tinta sobre #26A800", C.successInk, C.successHover, 4.5],
  ["botón advertencia: tinta sobre #FF6F00", C.warningInk, C.warning, 4.5],
  ["botón advertencia hover: tinta sobre #E05F00", C.warningInk, C.warningHover, 4.5],
  ["botón destructivo: blanco sobre #DC2626", C.white, C.danger, 4.5],
  ["botón destructivo hover: blanco sobre #B91C1C", C.white, C.dangerHover, 4.5],

  // Controles, foco y estados gráficos (§8: 3:1)
  ["borde fuerte sobre fondo principal", blend(C.white, 0.62, C.pageBottom), C.pageBottom, 3],
  ["borde fuerte sobre tema oscuro", blend(C.white, 0.62, C.panel), C.panel, 3],
  ["borde de campo sobre tema oscuro", blend(C.white, 0.4, C.panel), C.panel, 3],
  ["borde fuerte sobre tarjeta", blend(C.white, 0.62, C.card), C.card, 3],
  ["borde de control sobre superficie de campo", blend(C.white, 0.4, C.panel), C.panel, 3],
  ["acento sobre tema oscuro", C.accent, C.panel, 3],
  ["acento sobre fondo principal", C.accentText, C.pageBottom, 3],
  ["foco dorado sobre fondo principal", C.highlight, C.pageBottom, 3],
  ["foco dorado sobre tema oscuro", C.highlight, C.panel, 3],
  ["foco dorado sobre tarjeta", C.highlight, C.card, 3],
  ["navegación activa sobre chrome", C.navActive, C.chrome, 3],

  // Estados semánticos como texto sobre tarjeta (§8: 4.5:1)
  ["texto de éxito sobre tarjeta", C.successText, C.card, 4.5],
  ["texto de advertencia sobre tarjeta", C.warningText, C.card, 4.5],
  ["texto de peligro sobre tarjeta", C.dangerText, C.card, 4.5],
  ["texto de información sobre tarjeta", C.infoText, C.card, 4.5],
  ["tinta inversa sobre disco de éxito", C.deep, C.successFill, 4.5],
  ["tinta inversa sobre disco de advertencia", C.deep, C.warningFill, 4.5],

  // Iconos de modal sobre su tinte translúcido (STYLES.md §4: 4.5:1)
  ["icono de éxito sobre tinte de éxito", C.successText, blend(C.success, 0.18, C.panel), 4.5],
  ["icono de advertencia sobre tinte de advertencia", C.warningText, blend(C.warning, 0.18, C.panel), 4.5],
  ["icono de peligro sobre tinte de peligro", C.dangerText, blend(C.danger, 0.18, C.panel), 4.5],
  ["icono de información sobre tinte de información", C.infoText, blend(C.accent, 0.2, C.panel), 4.5],
];

let failed = 0;
for (const [name, fg, bg, min] of checks) {
  const ratio = contrast(fg, bg);
  const ok = ratio >= min;
  if (!ok) failed += 1;
  console.log(`${ok ? "OK  " : "FALLA"} ${ratio.toFixed(2)}:1 (mín ${min}:1) — ${name}`);
}

console.log(failed === 0 ? "\nTodas las combinaciones verificadas cumplen." : `\n${failed} combinación(es) por debajo del mínimo.`);
process.exit(failed === 0 ? 0 : 1);
