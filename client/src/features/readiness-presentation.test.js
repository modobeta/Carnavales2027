import { describe, expect, it } from "vitest";
import { readinessStepStates } from "./readiness-presentation.js";

const ready = (overrides = {}) => ({
  ready: true,
  missing: [],
  incompleteTroupes: [],
  incompleteRubrics: [],
  incompleteSchedules: [],
  incompleteNominations: [],
  nightsWithoutJury: [],
  ...overrides,
});

describe("readinessStepStates", () => {
  it("marca Comparsas incompleto si falta programar una jornada", () => {
    const readiness = ready({
      ready: false,
      missing: ["INCOMPLETE_SCHEDULES"],
      incompleteSchedules: [{ nightId: "night-1", nightName: "Noche 1" }],
    });

    expect(readinessStepStates(readiness, "available")).toMatchObject({
      participantes: "incomplete",
      revision: "incomplete",
    });
  });

  it("refleja que Evaluación depende de una especialidad activa", () => {
    const readiness = ready({
      ready: false,
      missing: ["ACTIVE_SPECIALTY"],
    });

    expect(readinessStepStates(readiness, "available")).toMatchObject({
      especialidades: "incomplete",
      rubros: "incomplete",
      revision: "incomplete",
    });
  });
});
