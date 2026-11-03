/**
 * IconPicker — selector visual de íconos de catálogo para Administración.
 *
 * Usa radios nativos dentro de un `fieldset` (accesibles y compatibles con
 * `FormData`, sin estado controlado). El valor vacío significa "sin ícono".
 * El catálogo y la resolución de assets llegan por props para reutilizarlo en
 * rubros e ítems.
 */
export function IconPicker({ name = "icon", defaultValue = null, disabled = false, icons, urlFor, legend, hint }) {
  const current = defaultValue ?? "";
  return (
    <fieldset className="rubric-icon-picker" disabled={disabled}>
      <legend>{legend}</legend>
      <p className="rubric-icon-picker-hint">{hint}</p>
      <div className="rubric-icon-options">
        <label className="rubric-icon-option">
          <input type="radio" name={name} value="" defaultChecked={current === ""} />
          <span className="rubric-icon-swatch is-empty" aria-hidden="true" />
          <span className="rubric-icon-option-label">Sin ícono</span>
        </label>
        {icons.map(({ key, label }) => (
          <label className="rubric-icon-option" key={key}>
            <input type="radio" name={name} value={key} defaultChecked={current === key} />
            <span className="rubric-icon-swatch" aria-hidden="true">
              <img src={urlFor(key)} alt="" loading="lazy" />
            </span>
            <span className="rubric-icon-option-label">{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
