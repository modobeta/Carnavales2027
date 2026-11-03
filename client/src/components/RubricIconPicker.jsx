import { RUBRIC_ICONS, rubricIconUrl } from "../lib/rubric-icons.js";
import { IconPicker } from "./IconPicker.jsx";

/**
 * RubricIconPicker — selector visual del ícono de un rubro para Administración.
 *
 * El campo se envía como `icon`; el valor vacío significa "sin ícono" y limpia
 * el catálogo del rubro.
 */
export function RubricIconPicker({ name = "icon", defaultValue = null, disabled = false }) {
  return (
    <IconPicker
      name={name}
      defaultValue={defaultValue}
      disabled={disabled}
      icons={RUBRIC_ICONS}
      urlFor={rubricIconUrl}
      legend="Ícono del rubro"
      hint="Se muestra al jurado junto al nombre del rubro."
    />
  );
}
