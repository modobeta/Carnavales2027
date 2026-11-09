/**
 * admin-ux-labels — Mapa de presentación UX (Spec 027/C4, RF-UX-01).
 *
 * Solo presentación: los valores internos/API (CONFIGURING, OPEN,
 * displayOrder, standbyForAssignmentId, matrix, ...) NO cambian.
 * Usar `uxLabel()` para textos visibles y conservar el código
 * original en atributos/llamadas API.
 */

export const UX_STATUS_LABELS = {
  CONFIGURING: "En configuración",
  OPEN: "Competencia abierta",
  CLOSED: "Evento cerrado",
};

export const UX_FIELD_LABELS = {
  displayOrder: "Orden de visualización",
  assignmentType: "Tipo de asignación",
  standbyForAssignmentId: "Suplente de",
  matrix: "Planillas de evaluación",
  orphanedCriterion: "Criterio pendiente de asignar",
};

export const UX_ERROR_HINTS = {
  RESOURCE_CONFLICT: "Ese nombre u orden ya está en uso.",
  EVENT_LOCKED:
    "🔒 La competencia está abierta. La configuración de planillas ya no puede modificarse.",
  JUDGE_QUOTA_REQUIRED:
    "Todavía no hay cupo para esta jornada y especialidad. Configurá el cupo y volvé a intentar.",
  JUDGE_QUOTA_FULL:
    "El cupo ya está completo. Aumentá el cupo antes de asignar otro jurado.",
  JUDGE_QUOTA_BELOW_ASSIGNMENTS:
    "El nuevo cupo no puede ser menor que las asignaciones activas. Conservá o aumentá el valor actual.",
  JUDGE_QUOTA_NIGHT_NOT_DRAFT:
    "El cupo solo puede cambiarse mientras la jornada está en borrador. Para modificarlo, usá una jornada futura que todavía no se haya abierto.",
  JUDGE_ALREADY_ASSIGNED:
    "Este jurado ya tiene una asignación activa en la jornada. Elegí otro jurado o revisá su asignación existente.",
  JUDGE_ASSIGNMENT_NIGHT_OPEN:
    "La jornada ya está abierta y no admite altas nuevas. Para cubrir un puesto, revisá si corresponde reemplazar una asignación existente.",
  NIGHT_CLOSED:
    "La jornada ya está cerrada y no admite cambios. Elegí una jornada futura para gestionar asignaciones.",
  JUDGE_NOT_ASSIGNABLE:
    "El jurado no está registrado o está suspendido. Elegí un jurado registrado y habilitado.",
  PRIMARY_BALLOT_SUBMITTED:
    "El titular ya presentó su planilla; no se puede reemplazar ni revocar. Conservá la asignación y su evidencia.",
  STANDBY_NOT_FOUND:
    "No hay un suplente activo vinculado a esta asignación. Asigná primero un suplente.",
  INVALID_STANDBY_PRIMARY:
    "El suplente debe vincularse a un titular activo de esta misma jornada y especialidad. Revisá la asignación del titular.",
};

export function uxStatusLabel(status, fallback = status) {
  if (typeof status !== "string") return fallback;
  return UX_STATUS_LABELS[status.toUpperCase().trim()] ?? fallback;
}

export function uxFieldLabel(field, fallback = field) {
  if (typeof field !== "string") return fallback;
  return UX_FIELD_LABELS[field] ?? fallback;
}

export function uxErrorHint(code, fallback) {
  if (typeof code !== "string") return fallback;
  return UX_ERROR_HINTS[code] ?? fallback;
}
