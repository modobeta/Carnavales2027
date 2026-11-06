/**
 * Primera y Segunda Princesa del Carnaval no son rubros con jurado propio.
 * Según el reglamento (proyecto edición 2027, rubro aleatorio 2 y 3), son el
 * segundo y tercer mejor puntaje de la elección de Reina del Carnaval.
 *
 * Si hay empate en el puntaje que ocupa el puesto, el puesto no se adjudica:
 * el reglamento no define un desempate para este caso.
 */

export const REINA_RUBRIC_CODE = "REINA_CARNAVAL";

const PLACEMENTS = [
  { code: "PRIMERA_PRINCESA", name: "Primera Princesa", position: 2 },
  { code: "SEGUNDA_PRINCESA", name: "Segunda Princesa", position: 3 },
];

function toNomination(competitor) {
  return {
    nominationId: competitor.nominationId,
    participantName: competitor.participantName,
    troupeName: competitor.troupeName,
    totalScore: competitor.totalScore,
  };
}

function resolvePlacement(placement, competitors) {
  const base = { code: placement.code, name: placement.name, position: placement.position };
  const candidate = competitors[placement.position - 1];
  if (!candidate) return { ...base, status: "NOT_ENOUGH_NOMINEES", nomination: null };

  const tied = competitors.filter((entry) => entry.totalScore === candidate.totalScore);
  if (tied.length > 1) {
    return {
      ...base,
      status: "TIE_UNRESOLVED",
      nomination: null,
      candidates: tied.map(toNomination),
    };
  }
  return { ...base, status: "AWARDED", nomination: toNomination(candidate), candidates: [] };
}

/**
 * @param {Array} rubricRankings salida de computeRubricRankings
 * @returns {{ placements: Array }}
 */
export function deriveReinaPlacements(rubricRankings) {
  const reina = rubricRankings.find((ranking) => ranking.rubricCode === REINA_RUBRIC_CODE);
  if (!reina) {
    return {
      placements: PLACEMENTS.map((placement) => ({
        ...placement,
        status: "NO_REINA_RANKING",
        nomination: null,
        candidates: [],
      })),
    };
  }

  // computeRubricRankings entrega los competidores ordenados por puntaje descendente.
  const competitors = reina.competitors ?? [];
  return {
    placements: PLACEMENTS.map((placement) => resolvePlacement(placement, competitors)),
  };
}
