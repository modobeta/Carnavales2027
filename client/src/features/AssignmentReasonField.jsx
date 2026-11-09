import { useState } from "react";

const REASONS = [
  ["UNAVAILABILITY", "Cambio de disponibilidad"],
  ["ABSENCE", "Ausencia"],
  ["OPERATIONAL", "Necesidad operativa"],
];

/** Motivo auditable con opciones frecuentes y detalle libre solo para "Otro". */
export function AssignmentReasonField({ id = "action-reason", label = "Motivo" }) {
  const [reasonType, setReasonType] = useState("");
  const isOther = reasonType === "OTHER";

  return (
    <>
      <label htmlFor={id}>{label}</label>
      <select id={id} name="reasonType" value={reasonType} onChange={(event) => setReasonType(event.target.value)} required>
        <option value="">Elegí un motivo</option>
        {REASONS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
        <option value="OTHER">Otro</option>
      </select>
      {isOther && (
        <>
          <label htmlFor={`${id}-other`}>Detalle del motivo</label>
          <input id={`${id}-other`} name="reasonOther" required minLength={1} maxLength={500} pattern=".*\S.*" title="Escribí un motivo concreto." />
        </>
      )}
    </>
  );
}

export function assignmentReasonFromForm(values) {
  const type = values.get("reasonType");
  if (type === "OTHER") return `Otro: ${String(values.get("reasonOther") ?? "").trim()}`;
  return REASONS.find(([value]) => value === type)?.[1] ?? "";
}
