import { RUBRIC_ICONS, rubricIconUrl } from "../lib/rubric-icons.js";

/**
 * RubricIconPicker — selector visual del ícono de un rubro para Administración.
 *
 * Usa radios nativos dentro de un `fieldset` (accesibles y compatibles con
 * `FormData`, sin estado controlado). El campo se envía como `icon`; el valor
 * vacío significa "sin ícono" y limpia el catálogo del rubro.
 */
export function RubricIconPicker({ name = "icon", defaultValue = null, disabled = false }) {
  const current = defaultValue ?? "";
  return (
    <fieldset className="rubric-icon-picker" disabled={disabled}>
      <legend>Ícono del rubro</legend>
      <p className="rubric-icon-picker-hint">Se muestra al jurado junto al nombre del rubro.</p>
      <div className="rubric-icon-options">
        <label className="rubric-icon-option">
          <input type="radio" name={name} value="" defaultChecked={current === ""} />
          <span className="rubric-icon-swatch is-empty" aria-hidden="true" />
          <span className="rubric-icon-option-label">Sin ícono</span>
        </label>
        {RUBRIC_ICONS.map(({ key, label }) => (
          <label className="rubric-icon-option" key={key}>
            <input type="radio" name={name} value={key} defaultChecked={current === key} />
            <span className="rubric-icon-swatch" aria-hidden="true">
              <img src={rubricIconUrl(key)} alt="" loading="lazy" />
            </span>
            <span className="rubric-icon-option-label">{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
