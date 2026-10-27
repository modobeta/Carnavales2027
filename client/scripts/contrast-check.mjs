/**
 * contrast-check.mjs — Verificación de contraste (STYLES.md §3)
 *
 * Lee los tokens resueltos de `src/styles/tokens.css` para el tema claro
 * (`:root`) y el oscuro (`:root[data-theme="dark"]`), y calcula ratios WCAG
 * 2.2 sobre las combinaciones críticas de texto, controles y estados.
 *
 * Los colores oficiales no se modifican: si una combinación falla, se ajusta
 * la tinta, la superficie o el uso del color en los componentes.
 *
 * Uso: node scripts/contrast-check.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const tokensPath = resolve(here, "../src/styles/tokens.css");
const css = readFileSync(tokensPath, "utf8");

/* ==========================================================================
   Lectura y resolución de tokens
   ========================================================================== */
const parseBlock = (pattern) => {
  const match = css.match(pattern);
  if (!match) throw new Error(`No se encontró el bloque ${pattern} en tokens.css`);
  const declarations = new Map();
  for (const [, name, value] of match[1].matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    declarations.set(name, value.trim());
  }
  return declarations;
};

const lightTokens = parseBlock(/:root\s*\{([\s\S]*?)\n\}/);
const darkOverrides = parseBlock(/:root\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/);
// El bloque oscuro solo redefine parte de los tokens: hereda el resto del claro.
const darkTokens = new Map([...lightTokens, ...darkOverrides]);

const hexToRgb = (hex) => {
  const value = hex.replace("#", "").trim();
  const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
};

const parseColor = (value) => {
  const trimmed = value.trim();
  if (trimmed.startsWith("#")) return { rgb: hexToRgb(trimmed), alpha: 1 };
  const fn = trimmed.match(/^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i);
  if (!fn) return null;
  return {
    rgb: [Number(fn[1]), Number(fn[2]), Number(fn[3])],
    alpha: fn[4] === undefined ? 1 : Number(fn[4]),
  };
};

const createResolver = (tokens) => {
  const cache = new Map();

  const resolveToken = (name) => {
    if (cache.has(name)) return cache.get(name);
    const raw = tokens.get(name);
    if (raw === undefined) return null;
    cache.set(name, null); // evita ciclos
    const resolved = resolveValue(raw);
    cache.set(name, resolved);
    return resolved;
  };

  const resolveValue = (value) => {
    const trimmed = value.trim();
    const variable = trimmed.match(/^var\(\s*--([\w-]+)\s*(?:,\s*([\s\S]+))?\)$/);
    if (variable) {
      const resolved = resolveToken(variable[1]);
      if (resolved) return resolved;
      return variable[2] ? resolveValue(variable[2]) : null;
    }
    return parseColor(trimmed);
  };

  return { resolveToken, resolveValue };
};

const channel = (v) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

const composite = (fg, bg) => fg.rgb.map((c, i) => Math.round(fg.alpha * c + (1 - fg.alpha) * bg.rgb[i]));

const contrast = (fg, bg) => {
  const la = luminance(fg.rgb);
  const lb = luminance(bg.rgb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/* ==========================================================================
   Combinaciones críticas
   Cada entrada: [descripción, primer token, segundo token, mínimo, base?]
   `base` permite componer un color translúcido sobre una superficie.
   ========================================================================== */
const textChecks = (t) => [
  // Texto principal y secundario sobre las superficies del tema.
  ["texto primario sobre fondo", "text-primary", "surface-base", 4.5],
  ["texto primario sobre tarjeta", "text-primary", "surface-card", 4.5],
  ["texto primario sobre superficie elevada", "text-primary", "surface-raised", 4.5],
  ["texto primario sobre campo", "text-primary", "surface-input", 4.5],
  ["texto secundario sobre fondo", "text-secondary", "surface-base", 4.5],
  ["texto secundario sobre tarjeta", "text-secondary", "surface-card", 4.5],
  ["texto secundario sobre superficie elevada", "text-secondary", "surface-raised", 4.5],
  ["texto atenuado sobre fondo", "text-muted", "surface-base", 4.5],
  ["texto atenuado sobre tarjeta", "text-muted", "surface-card", 4.5],
  ["texto atenuado sobre superficie elevada", "text-muted", "surface-raised", 4.5],
  ["enlace sobre fondo", "accent-text", "surface-base", 4.5],
  ["enlace sobre tarjeta", "accent-text", "surface-card", 4.5],
  ["texto sobre modal", "text-on-modal", "surface-modal", 4.5],
  ["texto suave sobre modal", "text-on-modal-soft", "surface-modal", 4.5],

  // Tinta sobre caras oficiales.
  ["tinta de acción sobre rosa", "text-on-primary", "action-fill", 4.5],
  ["tinta de acento sobre rosa", "text-on-accent", "accent-primary", 4.5],
  ["tinta secundaria sobre azul", "text-on-secondary", "secondary-fill", 4.5],
  ["tinta de confirmación sobre verde", "text-on-confirm", "confirm-fill", 4.5],
  ["tinta de cancelación sobre coral", "text-on-cancel", "cancel-fill", 4.5],
  ["tinta de aviso sobre ámbar", "text-on-highlight", "palette-highlight", 4.5],
  ["tinta de navegación activa sobre rosa", "text-on-primary", "palette-admin-nav-active", 4.5],
  ["tinta de comparsa sobre su marca", "troupe-brand-ink", "troupe-brand", 4.5],

  // Botones por variante.
  ["botón violeta", "modal-violet-ink", "modal-violet", 4.5],
  ["botón violeta hover", "modal-violet-ink", "modal-violet-strong", 4.5],
  ["botón verde", "modal-success-ink", "modal-success", 4.5],
  ["botón verde hover", "modal-success-ink", "modal-success-strong", 4.5],
  ["botón ámbar", "modal-warning-ink", "modal-warning", 4.5],
  ["botón ámbar hover", "modal-warning-ink", "modal-warning-strong", 4.5],
  ["botón coral", "modal-danger-ink", "modal-danger", 4.5],
  ["botón coral hover", "modal-danger-ink", "modal-danger-strong", 4.5],
  ["botón azul", "modal-info-ink", "modal-info", 4.5],
  ["botón azul hover", "modal-info-ink", "modal-info-strong", 4.5],
  ["botón edición", "palette-edit-ink", "palette-edit-fill", 4.5],
  ["botón edición hover", "palette-edit-ink", "palette-edit-hover", 4.5],
  ["botón secundario", "palette-secondary-ink", "palette-secondary-fill", 4.5],
  ["botón secundario hover", "palette-secondary-ink", "palette-secondary-hover", 4.5],

  // Estados semánticos como texto sobre su tinte.
  ["texto de éxito sobre su tinte", "success-text", "success-bg", 4.5, "surface-card"],
  ["texto de aviso sobre su tinte", "warning-text", "warning-bg", 4.5, "surface-card"],
  ["texto de peligro sobre su tinte", "danger-text", "danger-bg", 4.5, "surface-card"],
  ["texto de información sobre su tinte", "info-text", "info-bg", 4.5, "surface-card"],
  ["texto de éxito en modal", "modal-success-text", "surface-modal", 4.5],
  ["texto de aviso en modal", "modal-warning-text", "surface-modal", 4.5],
  ["texto de peligro en modal", "modal-danger-text", "surface-modal", 4.5],
  ["texto de información en modal", "modal-info-text", "surface-modal", 4.5],
  ["icono de éxito en modal", "modal-success-text", "modal-success-soft", 4.5, "surface-modal"],
  ["icono de aviso en modal", "modal-warning-text", "modal-warning-soft", 4.5, "surface-modal"],
  ["icono de peligro en modal", "modal-danger-text", "modal-danger-soft", 4.5, "surface-modal"],
  ["icono de información en modal", "modal-info-text", "modal-info-soft", 4.5, "surface-modal"],

  // Discos e indicadores de estado.
  ["tinta inversa sobre disco de éxito", "text-inverse", "success-fill", 4.5],
  ["tinta inversa sobre disco de aviso", "text-inverse", "warning-fill", 4.5],
  ["tinta inversa sobre disco de peligro", "text-inverse", "danger-fill", 4.5],
];

const controlChecks = () => [
  // Controles e indicadores esenciales (§3.2: 3:1).
  ["borde fuerte sobre fondo", "border-strong", "surface-base", 3],
  ["borde fuerte sobre tarjeta", "border-strong", "surface-card", 3],
  ["borde fuerte sobre superficie elevada", "border-strong", "surface-raised", 3],
  ["borde de campo sobre su superficie", "border-input", "surface-input", 3],
  ["foco sobre fondo", "focus-color", "surface-base", 3],
  ["foco sobre tarjeta", "focus-color", "surface-card", 3],
  ["acento rosa sobre fondo", "accent-primary", "surface-base", 3],
  ["acento azul sobre fondo", "accent", "surface-base", 3],
  ["texto de error sobre fondo", "danger-text", "surface-base", 4.5],
  ["texto de éxito sobre fondo", "success-text", "surface-base", 4.5],
];

/* ==========================================================================
   Ejecución
   ========================================================================== */
const runTheme = (themeName, tokens) => {
  const { resolveToken } = createResolver(tokens);
  const color = (name) => {
    const resolved = resolveToken(name);
    if (!resolved) throw new Error(`Token sin resolver en ${themeName}: --${name}`);
    return resolved;
  };
  const checks = [...textChecks(), ...controlChecks()];

  console.log(`\nTema ${themeName} (${tokens.get("palette-page")})`);

  let failures = 0;
  for (const [label, fgName, bgName, min, baseName] of checks) {
    const fg = color(fgName);
    const base = baseName ? color(baseName) : null;
    const bg = base ? { rgb: composite(color(bgName), base), alpha: 1 } : color(bgName);
    const ratio = contrast(fg, bg);
    const ok = ratio >= min;
    if (!ok) failures += 1;
    console.log(`${ok ? "OK  " : "FALLA"} ${ratio.toFixed(2)}:1 (mín ${min}:1) — ${label}`);
  }
  return failures;
};

const failures = runTheme("claro", lightTokens) + runTheme("oscuro", darkTokens);
console.log(failures === 0
  ? "\nTodas las combinaciones verificadas cumplen."
  : `\n${failures} combinación(es) por debajo del mínimo.`);
process.exit(failures === 0 ? 0 : 1);
