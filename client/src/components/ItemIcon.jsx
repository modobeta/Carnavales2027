import { itemIconUrl } from "../lib/item-icons.js";

/**
 * ItemIcon — ícono de un ítem puntuable dentro de un círculo ámbar.
 *
 * El círculo usa el color `#FFC107` definido en CSS para distinguirlo del ícono
 * del rubro (que se pinta con el color de la comparsa). No renderiza nada si el
 * ítem no tiene ícono, para no dejar imágenes rotas.
 *
 * `label` vuelve el ícono accesible cuando el nombre del ítem no está visible
 * cerca; si se omite, el ícono queda decorativo (`aria-hidden`).
 */
export function ItemIcon({ icon, size = "md", label, className = "" }) {
  if (!icon || !itemIconUrl(icon)) return null;
  const accessible = label ? { role: "img", "aria-label": label } : { "aria-hidden": "true" };
  return (
    <span
      className={`rubric-icon-circle item-icon-circle is-${size}${className ? ` ${className}` : ""}`}
      {...accessible}
    >
      <img className="rubric-icon item-icon" src={itemIconUrl(icon)} alt="" loading="lazy" />
    </span>
  );
}
