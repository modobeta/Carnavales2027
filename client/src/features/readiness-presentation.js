export const PREPARATION_STEPS = [
  { key: "participantes", label: "Participantes", href: "#/admin/competencia" },
  { key: "jurados", label: "Jurados y especialidades", href: "#/admin/competencia" },
  { key: "rubros", label: "Rubros/criterios", href: "#/admin/competencia" },
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
  ACTIVE_TROUPE: ["Creá o activá al menos una comparsa", "#/admin/competencia", "Configurar comparsas"],
  ACTIVE_SPECIALTY: ["Creá o activá al menos una especialidad", "#/admin/competencia", "Configurar especialidades"],
  ACTIVE_RUBRIC: ["Creá o activá al menos un rubro", "#/admin/competencia", "Configurar rubros"],
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
    participantes: has("ACTIVE_TROUPE") || readiness.incompleteTroupes.length > 0 || readiness.incompleteNominations.length > 0 ? "incomplete" : "complete",
    jurados: has("ACTIVE_SPECIALTY") || readiness.nightsWithoutJury.length > 0 ? "incomplete" : "complete",
    rubros: has("ACTIVE_RUBRIC") || readiness.incompleteRubrics.length > 0 ? "incomplete" : "complete",
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
    key: `troupe-${troupe.id}`, title: `${troupe.name} necesita una categoría activa`, description: "Elegí una categoría activa para esta comparsa.", href: "#/admin/competencia", action: "Corregir participante", kind: "blocking",
  }));
  readiness.incompleteRubrics.forEach((rubric) => issues.push({
    key: `rubric-${rubric.id}`, title: `${rubric.name} necesita ítems puntuables válidos`, description: "Agregá ítems puntuables con especialidades activas.", href: "#/admin/competencia", action: "Corregir rubro", kind: "blocking",
  }));
  readiness.incompleteSchedules.forEach((night) => issues.push({
    key: `schedule-${night.nightId}`, title: `${night.nightName} no tiene comparsas programadas`, description: "Programá al menos una comparsa en esta jornada de Competencia.", href: "#/admin/competencia", action: "Configurar orden de salida", kind: "blocking",
  }));
  readiness.incompleteNominations.forEach((item) => issues.push({
    key: `nomination-${item.rubricId}-${item.troupeId}`, title: `Falta un participante para ${item.rubricName} en ${item.troupeName}`, description: "Cargá al menos un participante para este rubro y esta comparsa.", href: "#/admin/competencia", action: "Cargar participante", kind: "blocking",
  }));
  readiness.nightsWithoutJury.forEach((night) => issues.push({
    key: `jury-${night.nightId}`, title: `${night.nightName} no tiene jurados asignados`, description: "Asigná al menos un jurado activo a esta jornada de Competencia.", href: "#/admin/assignments", action: "Asignar jurado", kind: "blocking",
  }));
  return issues;
}

const GENERAL_ADMIN = "lo resuelve el administrador general";

// Clasificación de bloqueos para ADMIN_EVENT (spec 040, CA-5.2): solo la jornada de competencia
// es resoluble desde su área; el resto se informa sin acciones ni promesas de disponibilidad.
export function eventAdminReadinessItems(readiness) {
  if (!isInterpretableReadiness(readiness)) return [];
  const items = [];
  const missingText = {
    COMPETITION_NIGHT: "Falta una jornada de Competencia.",
    ACTIVE_TROUPE: "No hay comparsas activas.",
    ACTIVE_SPECIALTY: `No hay especialidades activas; ${GENERAL_ADMIN}.`,
    ACTIVE_RUBRIC: `No hay rubros activos; ${GENERAL_ADMIN}.`,
  };
  for (const code of readiness.missing) {
    if (["INCOMPLETE_SCHEDULES", "INCOMPLETE_NOMINATIONS", "NIGHTS_WITHOUT_JURY", "INCOMPLETE_TROUPES", "INCOMPLETE_RUBRICS"].includes(code)) continue;
    items.push({ key: `missing-${code}`, text: missingText[code] ?? "Hay un requisito pendiente que no se pudo identificar.", resolvableHere: code === "COMPETITION_NIGHT" });
  }
  readiness.incompleteTroupes.forEach((troupe) => items.push({ key: `troupe-${troupe.id}`, text: `La comparsa «${troupe.name}» no tiene una categoría activa.`, resolvableHere: false }));
  readiness.incompleteSchedules.forEach((night) => items.push({ key: `schedule-${night.nightId}`, text: `La jornada «${night.nightName}» no tiene comparsas programadas.`, resolvableHere: false }));
  readiness.incompleteRubrics.forEach((rubric) => items.push({ key: `rubric-${rubric.id}`, text: `El rubro «${rubric.name}» necesita ítems puntuables válidos; ${GENERAL_ADMIN}.`, resolvableHere: false }));
  readiness.incompleteNominations.forEach((item) => items.push({ key: `nomination-${item.rubricId}-${item.troupeId}`, text: `Falta un participante para «${item.rubricName}» en «${item.troupeName}»; ${GENERAL_ADMIN}.`, resolvableHere: false }));
  readiness.nightsWithoutJury.forEach((night) => items.push({ key: `jury-${night.nightId}`, text: `La jornada «${night.nightName}» no tiene jurados asignados; ${GENERAL_ADMIN}.`, resolvableHere: false }));
  return items;
}
