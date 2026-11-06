import assert from "node:assert/strict";
import test from "node:test";
import { RANDOM_RUBRICS } from "../db/seeds/full-event.catalog.js";

test("el catálogo de aleatorios no carga princesas como rubros propios", () => {
  const codes = RANDOM_RUBRICS.map((entry) => entry.code);
  assert.ok(!codes.includes("PRIMERA_PRINCESA"));
  assert.ok(!codes.includes("SEGUNDA_PRINCESA"));
});

test("el catálogo tiene 9 aleatorios: los 11 del reglamento menos las dos princesas", () => {
  assert.equal(RANDOM_RUBRICS.length, 9);
  assert.ok(RANDOM_RUBRICS.some((entry) => entry.code === "REINA_CARNAVAL"));
});
