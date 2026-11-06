import assert from "node:assert/strict";
import test from "node:test";
import { deriveReinaPlacements } from "./reina-placements.js";

function competitor(nominationId, participantName, totalScore) {
  return { nominationId, participantName, troupeName: `Comparsa ${participantName}`, totalScore };
}

function reinaRanking(competitors) {
  return { rubricCode: "REINA_CARNAVAL", rubricKind: "RANDOM", competitors };
}

test("Primera y Segunda Princesa son el 2do y 3er puesto del ranking de Reina del Carnaval", () => {
  const result = deriveReinaPlacements([
    reinaRanking([
      competitor("n1", "Ana", 100),
      competitor("n2", "Bela", 90),
      competitor("n3", "Cora", 80),
      competitor("n4", "Dana", 70),
    ]),
  ]);

  const [primera, segunda] = result.placements;
  assert.equal(primera.code, "PRIMERA_PRINCESA");
  assert.equal(primera.position, 2);
  assert.equal(primera.status, "AWARDED");
  assert.equal(primera.nomination.participantName, "Bela");
  assert.equal(segunda.code, "SEGUNDA_PRINCESA");
  assert.equal(segunda.position, 3);
  assert.equal(segunda.status, "AWARDED");
  assert.equal(segunda.nomination.participantName, "Cora");
});

test("empate en el 2do o 3er puntaje deja el puesto sin resolver en lugar de adjudicarlo", () => {
  const result = deriveReinaPlacements([
    reinaRanking([
      competitor("n1", "Ana", 100),
      competitor("n2", "Bela", 90),
      competitor("n3", "Cora", 90),
      competitor("n4", "Dana", 70),
    ]),
  ]);

  const [primera, segunda] = result.placements;
  assert.equal(primera.status, "TIE_UNRESOLVED");
  assert.equal(primera.nomination, null);
  assert.deepEqual(primera.candidates.map((c) => c.participantName), ["Bela", "Cora"]);
  assert.equal(segunda.status, "TIE_UNRESOLVED");
  assert.equal(segunda.nomination, null);
});

test("con menos de tres nominados, el puesto faltante queda marcado", () => {
  const result = deriveReinaPlacements([
    reinaRanking([competitor("n1", "Ana", 100), competitor("n2", "Bela", 90)]),
  ]);

  const [primera, segunda] = result.placements;
  assert.equal(primera.status, "AWARDED");
  assert.equal(segunda.status, "NOT_ENOUGH_NOMINEES");
  assert.equal(segunda.nomination, null);
});

test("sin ranking de Reina del Carnaval ambos puestos quedan pendientes", () => {
  const result = deriveReinaPlacements([
    { rubricCode: "TRAJE_FEMENINO", rubricKind: "RANDOM", competitors: [competitor("n1", "Ana", 100)] },
  ]);

  assert.deepEqual(result.placements.map((p) => p.status), ["NO_REINA_RANKING", "NO_REINA_RANKING"]);
});

test("los puestos no dependen de rubros que no sean Reina del Carnaval", () => {
  const result = deriveReinaPlacements([
    { rubricCode: "REY_CARNAVAL", rubricKind: "RANDOM", competitors: [competitor("r1", "Rey", 99)] },
    reinaRanking([
      competitor("n1", "Ana", 100),
      competitor("n2", "Bela", 90),
      competitor("n3", "Cora", 80),
    ]),
  ]);

  assert.equal(result.placements[0].nomination.participantName, "Bela");
  assert.equal(result.placements[1].nomination.participantName, "Cora");
});
