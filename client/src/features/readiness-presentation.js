export const PREPARATION_STEPS = [
  { key: "catalogo", label: "Rubros", href: "#/admin/competencia?step=catalogo" },
  { key: "especialidades", label: "Especialidades", href: "#/admin/competencia?step=especialidades" },
  { key: "rubros", label: "Evaluación", href: "#/admin/competencia?step=rubros" },
  { key: "participantes", label: "Comparsas", href: "#/admin/competencia?step=participantes" },
  { key: "asignaciones", label: "Asignación de jurados", href: "#/admin/competencia?step=asignaciones" },
  { key: "revision", label: "Revisión final", href: "#/admin/events" },
];

export const READINESS_STATE_LABELS = {
  complete: "Completo",
  incomplete: "Incompleto",
  unqueried: "Pendiente de revisión",
  unavailable: "No se pudo revisar",
};

const MISSING_INFO = {
  COMPETITION_NIGHT: ["Creá al menos una jornada de Competencia", "#/admin/events", "Configurar jornadas"],
  ACTIVE_TROUPE: ["Creá o activá al menos una comparsa", "#/admin/competencia?step=participantes", "Configurar comparsas"],
  ACTIVE_SPECIALTY: ["Creá o activá al menos una especialidad", "#/admin/competencia?step=especialidades", "Configurar especialidades"],
  ACTIVE_RUBRIC: ["Creá o activá al menos un rubro", "#/admin/competencia?step=catalogo", "Configurar rubros"],
};

export function isInterpretableReadiness(readiness) {
  return Boolean(readiness && typeof readiness.ready === "boolean"
    && Array.isArray(readiness.missing)
    && ["incompleteTroupes", "incompleteRubrics", "incompleteSchedules", "incompleteNominations", "nightsWithoutJury"]
      .every((key) => Array.isArray(readiness[key])));
}

export function readinessStepStates(readiness, availability = "unqueried") {
  if (availability !== "available" || !isInterpretableReadiness(readiness)) {
    const state = availability === "unqueried" ? "unqueried" : "unavailable";
    return Object.fromEntries(PREPARATION_STEPS.map(({ key }) => [key, state]));
  }
  const has = (code) => readiness.missing.includes(code);
  const states = {
    catalogo: has("ACTIVE_RUBRIC") ? "incomplete" : "complete",
    especialidades: has("ACTIVE_SPECIALTY") ? "incomplete" : "complete",
    rubros: has("ACTIVE_RUBRIC") || readiness.incompleteRubrics.length > 0 ? "incomplete" : "complete",
    participantes: has("ACTIVE_TROUPE") || readiness.incompleteTroupes.length > 0 || readiness.incompleteNominations.length > 0 ? "incomplete" : "complete",
    asignaciones: readiness.nightsWithoutJury.length > 0 ? "incomplete" : "complete",
    revision: readiness.ready ? "complete" : "incomplete",
  };
  return states;
}

export function readinessIssues(readiness) {
  if (!isInterpretableReadiness(readiness)) return [];
  const issues = [];
  for (const code of readiness.missing) {
    if (["INCOMPLETE_SCHEDULES", "INCOMPLETE_NOMINATIONS", "NIGHTS_WITHOUT_JURY", "INCOMPLETE_TROUPES", "INCOMPLETE_RUBRICS"].includes(code)) continue;
    const [title, href, action] = MISSING_INFO[code] ?? [`Falta resolver ${code}`, "#/admin/events", "Revisar evento"];
    issues.push({ key: `missing-${code}`, title, description: "Este requisito debe completarse antes de abrir el evento.", href, action, kind: "blocking" });
  }
  readiness.incompleteTroupes.forEach((troupe) => issues.push({
    key: `troupe-${troupe.id}`, title: `${troupe.name} necesita una categoría activa`, description: "Elegí una categoría activa para esta comparsa.", href: "#/admin/competencia?step=participantes", action: "Corregir participante", kind: "blocking",
  }));
  readiness.incompleteRubrics.forEach((rubric) => issues.push({
    key: `rubric-${rubric.id}`, title: `${rubric.name} necesita ítems puntuables válidos`, description: "Agregá ítems puntuables con especialidades activas.", href: "#/admin/competencia?step=rubros", action: "Corregir rubro", kind: "blocking",
  }));
  readiness.incompleteSchedules.forEach((night) => issues.push({
    key: `schedule-${night.nightId}`, title: `${night.nightName} no tiene comparsas programadas`, description: "Programá al menos una comparsa en esta jornada de Competencia.", href: "#/admin/competencia?step=participantes", action: "Configurar orden de salida", kind: "blocking",
  }));
  readiness.incompleteNominations.forEach((item) => issues.push({
    key: `nomination-${item.rubricId}-${item.troupeId}`, title: `Falta un participante para ${item.rubricName} en ${item.troupeName}`, description: "Cargá al menos un participante para este rubro y esta comparsa.", href: "#/admin/competencia?step=participantes", action: "Cargar participante", kind: "blocking",
  }));
  readiness.nightsWithoutJury.forEach((night) => issues.push({
    key: `jury-${night.nightId}`, title: `${night.nightName} no tiene jurados asignados`, description: "Asigná al menos un jurado activo a esta jornada de Competencia.", href: "#/admin/competencia?step=asignaciones", action: "Asignar jurado", kind: "blocking",
  }));
  return issues;
}
