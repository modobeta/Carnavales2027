import { isInterpretableReadiness } from "./readiness-presentation.js";

// Solo presenta lecturas completas del mismo evento; la vigencia se controla en quien las obtiene.
// No sustituye readiness.ready ni autoriza la apertura del evento.
export function deriveEvaluationPresentation({ specialties, rubrics, readiness }) {
  if (!Array.isArray(specialties) || !Array.isArray(rubrics) || !isInterpretableReadiness(readiness)
    || rubrics.some((rubric) => !Array.isArray(rubric.items))) return null;

  const activeSpecialties = specialties.filter((specialty) => specialty.active !== false);
  const activeIds = new Set(activeSpecialties.map((specialty) => specialty.id));
  const incompleteIds = new Set(readiness.incompleteRubrics.map((rubric) => rubric.id));
  const nominationIds = new Set(readiness.incompleteNominations.map((nomination) => nomination.rubricId));
  const associations = new Map();
  const pendingRubrics = [];
  const historicalRubrics = [];

  for (const rubric of rubrics) {
    const items = rubric.items.filter((item) => item.active !== false
      && (item.specialtyIds ?? [item.specialtyId]).some((id) => activeIds.has(id)));
    if (rubric.active === false) {
      historicalRubrics.push(rubric);
      continue;
    }
    if (items.length === 0) {
      pendingRubrics.push(rubric);
      continue;
    }
    const specialtyIds = new Set(items.flatMap((item) => item.specialtyIds ?? [item.specialtyId]));
    for (const specialtyId of specialtyIds) {
      associations.set(specialtyId, [...(associations.get(specialtyId) ?? []), {
        rubric,
        items: items.filter((item) => (item.specialtyIds ?? [item.specialtyId]).includes(specialtyId)),
        shared: specialtyIds.size > 1,
      }]);
    }
  }

  const projected = activeSpecialties.map((specialty) => {
    const associated = associations.get(specialty.id) ?? [];
    const status = associated.length === 0 ? "Sin configurar"
      : associated.some(({ rubric }) => incompleteIds.has(rubric.id) || nominationIds.has(rubric.id))
        ? "Incompleta" : "Lista";
    return { ...specialty, rubrics: associated, rubricCount: associated.length, status };
  });

  return {
    specialties: projected,
    pendingRubrics,
    historicalRubrics,
    progress: { readyCount: projected.filter((specialty) => specialty.status === "Lista").length, total: projected.length },
  };
}
