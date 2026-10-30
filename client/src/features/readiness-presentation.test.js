import { describe, expect, it } from "vitest";
import { readinessIssues, readinessStepStates } from "./readiness-presentation.js";

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

describe("readinessIssues", () => {
  it("dirige el jurado pendiente a Jornadas para preparar su asignación", () => {
    const issues = readinessIssues(ready({
      ready: true,
      nightsWithoutJury: [{ nightId: "night 1", nightName: "Noche 1" }],
    }));

    expect(issues).toContainEqual(expect.objectContaining({
      key: "jury-night 1",
      description: "Prepará la asignación en Jornadas antes de abrir esta jornada.",
      href: "#/admin/events",
      action: "Ir a Jornadas",
      kind: "deferred",
    }));
  });
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
