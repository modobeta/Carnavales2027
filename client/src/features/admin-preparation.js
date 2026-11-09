import { isInterpretableReadiness, readinessStepStates } from "./readiness-presentation.js";

export const ADMIN_PREPARATION_STAGES = [
  { key: "event", label: "Evento", tasks: [{ key: "data", label: "Datos" }, { key: "nights", label: "Jornadas" }] },
  { key: "evaluation", label: "Evaluación", tasks: [{ key: "catalogo", label: "Rubros" }, { key: "especialidades", label: "Especialidades" }, { key: "rubros", label: "Ítems" }] },
  { key: "troupes", label: "Comparsas", tasks: [{ key: "comparsas", label: "Comparsas y participantes" }, { key: "orden", label: "Orden de salida" }] },
  { key: "review", label: "Revisión", tasks: [] },
];

export function preparationLocation(stage, task, creating = false) {
  const item = ADMIN_PREPARATION_STAGES.find((entry) => entry.key === stage) ?? ADMIN_PREPARATION_STAGES[0];
  const selectedTask = item.tasks.find((entry) => entry.key === task)?.key ?? item.tasks[0]?.key ?? "";
  return `#/admin/prepare?stage=${item.key}${selectedTask ? `&task=${selectedTask}` : ""}${creating ? "&new=1" : ""}`;
}

export function preparationStages(readiness, availability = "unqueried") {
  if (availability !== "available" || !isInterpretableReadiness(readiness)) {
    return ADMIN_PREPARATION_STAGES.map(() => availability === "unqueried" ? "unqueried" : "unavailable");
  }
  const states = readinessStepStates(readiness, availability);
  return [
    readiness.missing.includes("COMPETITION_NIGHT") ? "incomplete" : "complete",
    ["catalogo", "especialidades", "rubros"].every((key) => states[key] === "complete") ? "complete" : "incomplete",
    states.participantes,
    readiness.ready ? "complete" : "incomplete",
  ];
}

export function preparationIssueLocation(issue) {
  if (issue.key === "missing-COMPETITION_NIGHT") return ["event", "nights"];
  if (issue.key === "missing-ACTIVE_RUBRIC") return ["evaluation", "catalogo"];
  if (issue.key === "missing-ACTIVE_SPECIALTY") return ["evaluation", "especialidades"];
  if (issue.key.startsWith("rubric-")) return ["evaluation", "rubros"];
  if (issue.key.startsWith("schedule-")) return ["troupes", "orden"];
  if (issue.key === "missing-ACTIVE_TROUPE" || issue.key.startsWith("troupe-") || issue.key.startsWith("nomination-")) return ["troupes", "comparsas"];
  return null;
}
