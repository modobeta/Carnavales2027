import { rubricIconUrl } from "../lib/rubric-icons.js";

/**
 * RubricIcon — ícono del rubro dentro de un círculo (Spec 029, migración 083).
 *
 * Por defecto el círculo se pinta con el color representativo de la comparsa
 * (`color`). Sobre un encabezado ya pintado con ese mismo color (`onBrand`) se
 * usa un círculo claro para que el ícono siga siendo visible. No renderiza nada
 * si el rubro no tiene ícono, para no dejar imágenes rotas.
 *
 * `label` vuelve el ícono accesible cuando el nombre del rubro no está visible
 * cerca; si se omite, el ícono queda decorativo (`aria-hidden`).
 */
export function RubricIcon({ icon, color = null, size = "md", label, onBrand = false, className = "" }) {
  if (!icon || !rubricIconUrl(icon)) return null;
  const accessible = label ? { role: "img", "aria-label": label } : { "aria-hidden": "true" };
  const style = !onBrand && color ? { backgroundColor: color } : undefined;
  return (
    <span
      className={`rubric-icon-circle is-${size}${onBrand ? " is-on-brand" : ""}${className ? ` ${className}` : ""}`}
      style={style}
      {...accessible}
    >
      <img className="rubric-icon" src={rubricIconUrl(icon)} alt="" loading="lazy" />
    </span>
  );
}
