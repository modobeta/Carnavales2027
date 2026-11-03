/**
 * ItemIconPicker — selector visual de íconos de ítem de rubro para Administración.
 *
 * Usa un layout similar al RubricIconPicker: labels con radio inputs y
 * íconos dentro de swatches, dentro de un fieldset accessible. El valor
 * vacío significa "sin ícono". El catálogo y la resolución de assets
 * llegan por props.
 */
import { ITEM_ICONS, itemIconUrl } from "../lib/item-icons.js";

/** Campo de selector de ícono de ítem para envío como `icon` en FormData. */
export function ItemIconPicker({ name = "icon", defaultValue = null, disabled = false, onChange }) {
  const current = defaultValue ?? "";
  return (
    <fieldset className="rubric-icon-picker" disabled={disabled}>
      <legend>Ícono del ítem</legend>
      <p className="rubric-icon-picker-hint">Se muestra al jurado junto al nombre del ítem.</p>
      <div className="rubric-icon-options">
        <label className="rubric-icon-option">
          <input type="radio" name={name} value="" defaultChecked={current === ""} onChange={() => onChange?.(null)} />
          <span className="rubric-icon-swatch is-empty" aria-hidden="true" />
          <span className="rubric-icon-option-label">Sin ícono</span>
        </label>
        {ITEM_ICONS.map(({ key, label, file }) => (
          <label className="rubric-icon-option" key={key}>
            <input type="radio" name={name} value={key} defaultChecked={current === key} onChange={() => onChange?.(key)} />
            <span className="rubric-icon-swatch" aria-hidden="true">
              <img src={itemIconUrl(key)} alt="" loading="lazy" />
            </span>
            <span className="rubric-icon-option-label">{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
