import { describe, expect, it } from "vitest";
import { deriveEvaluationPresentation } from "./evaluation-presentation.js";

const specialty = (id, active = true) => ({ id, name: id, active });
const item = (id, specialtyId, active = true) => ({ id, name: id, specialtyId, active });
const rubric = (id, items = [], active = true) => ({ id, name: id, active, items, criteria: [] });
const readiness = (changes = {}) => ({
  ready: true, missing: [], incompleteTroupes: [], incompleteRubrics: [],
  incompleteSchedules: [], incompleteNominations: [], nightsWithoutJury: [], ...changes,
});

describe("deriveEvaluationPresentation", () => {
  it("counts active rubrics with active scoring items, not descriptive criteria or inactive specialties", () => {
    const danza = specialty("danza");
    const canto = specialty("canto");
    const historical = specialty("historical", false);
    const shared = rubric("shared", [item("a", "danza"), item("b", "canto"), item("old", "historical")]);
    shared.criteria = [{ id: "criterion", active: true }];
    const inactiveItem = rubric("inactive-item", [item("off", "canto", false)]);
    const inactiveRubric = rubric("inactive-rubric", [item("hidden", "canto")], false);
    const view = deriveEvaluationPresentation({
      specialties: [danza, canto, historical], rubrics: [shared, inactiveItem, inactiveRubric], readiness: readiness(),
    });

    expect(view.specialties.map(({ id, rubricCount, status }) => [id, rubricCount, status])).toEqual([
      ["danza", 1, "Lista"], ["canto", 1, "Lista"],
    ]);
    expect(view.specialties[0].rubrics[0]).toMatchObject({ rubric: shared, items: [shared.items[0]], shared: true });
    expect(view.specialties[1].rubrics[0]).toMatchObject({ rubric: shared, items: [shared.items[1]], shared: true });
    expect(view.specialties[0].rubrics[0].rubric).toBe(view.specialties[1].rubrics[0].rubric);
    expect(view.progress).toEqual({ readyCount: 2, total: 2 });
    expect(view.pendingRubrics).toEqual([inactiveItem]);
    expect(view.historicalRubrics).toEqual([inactiveRubric]);
  });

  it("shows 1 of 2 with no official incompletes, independent of readiness.ready", () => {
    const view = deriveEvaluationPresentation({
      specialties: [specialty("danza"), specialty("canto")],
      rubrics: [rubric("coreo", [item("scored", "danza")])],
      readiness: readiness({ ready: false, missing: ["COMPETITION_NIGHT"] }),
    });

    expect(view.specialties.map(({ status }) => status)).toEqual(["Lista", "Sin configurar"]);
    expect(view.progress).toEqual({ readyCount: 1, total: 2 });
    expect(view).not.toHaveProperty("ready");
    expect(view.progress).not.toHaveProperty("ready");
  });

  it("presents one item under every associated specialty for independent evaluation", () => {
    const sharedItem = { id: "shared-item", name: "Presencia", specialtyId: "danza", specialtyIds: ["danza", "canto"] };
    const view = deriveEvaluationPresentation({
      specialties: [specialty("danza"), specialty("canto")],
      rubrics: [rubric("shared-rubric", [sharedItem])], readiness: readiness(),
    });

    expect(view.specialties.map(({ rubrics: entries }) => entries[0].items)).toEqual([[sharedItem], [sharedItem]]);
    expect(view.specialties.map(({ rubrics: entries }) => entries[0].shared)).toEqual([true, true]);
  });

  it.each([
    ["rubric", { incompleteRubrics: [{ id: "shared", name: "shared" }] }],
    ["nomination", { incompleteNominations: [{ rubricId: "shared", troupeId: "t1" }] }],
  ])("marks every covered active specialty incomplete for a shared %s pending item", (_kind, changes) => {
    const view = deriveEvaluationPresentation({
      specialties: [specialty("danza"), specialty("canto")],
      rubrics: [rubric("shared", [item("a", "danza"), item("b", "canto")])],
      readiness: readiness(changes),
    });

    expect(view.specialties.map(({ status }) => status)).toEqual(["Incompleta", "Incompleta"]);
    expect(view.progress).toEqual({ readyCount: 0, total: 2 });
  });

  it("keeps incomplete active rubrics with no active specialty association in global pending, without inventing specialty coverage", () => {
    const orphan = rubric("orphan", [item("old", "inactive-specialty")]);
    const inactive = rubric("inactive", [], false);
    const view = deriveEvaluationPresentation({
      specialties: [specialty("danza"), specialty("inactive-specialty", false)],
      rubrics: [orphan, inactive],
      readiness: readiness({ incompleteRubrics: [{ id: "orphan" }] }),
    });

    expect(view.specialties[0]).toMatchObject({ rubricCount: 0, status: "Sin configurar", rubrics: [] });
    expect(view.progress).toEqual({ readyCount: 0, total: 1 });
    expect(view.pendingRubrics).toEqual([orphan]);
    expect(view.historicalRubrics).toEqual([inactive]);
  });

  it("does not claim full preparation when there are no active specialties, but preserves pending and history", () => {
    const active = rubric("active", []);
    const inactive = rubric("inactive", [], false);
    const view = deriveEvaluationPresentation({
      specialties: [specialty("off", false)], rubrics: [active, inactive], readiness: readiness(),
    });

    expect(view.specialties).toEqual([]);
    expect(view.progress).toEqual({ readyCount: 0, total: 0 });
    expect(view.pendingRubrics).toEqual([active]);
    expect(view.historicalRubrics).toEqual([inactive]);
  });

  it.each([
    [{ specialties: undefined, rubrics: [], readiness: readiness() }],
    [{ specialties: [], rubrics: undefined, readiness: readiness() }],
    [{ specialties: [], rubrics: [], readiness: undefined }],
    [{ specialties: [], rubrics: [], readiness: { ready: true } }],
  ])("does not derive a false zero or Lista from incomplete readings", (input) => {
    expect(deriveEvaluationPresentation(input)).toBeNull();
  });

  it("does not treat a rubric with a missing items catalog as an empty rubric", () => {
    expect(deriveEvaluationPresentation({
      specialties: [specialty("danza")],
      rubrics: [{ id: "unknown", name: "unknown", active: true }],
      readiness: readiness(),
    })).toBeNull();
  });
});
