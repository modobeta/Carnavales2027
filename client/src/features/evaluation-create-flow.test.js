import { expect, it } from "vitest";
import { evaluationItemCode, unequivocalCreateRejection } from "./evaluation-create-flow.js";

it.each([
  ["Coreografía", "COREOGRAFIA"],
  [" ! A -- b ? ", "A_B"],
  ["é".repeat(70), "E".repeat(64)],
  ["!!!", ""],
])("deriva un código compatible con el alta conjunta para %s", (name, expected) => {
  expect(evaluationItemCode(name)).toBe(expected);
});

it("solo clasifica como rechazo recibido los HTTP inequívocos, nunca timeout, 5xx ni ausencia de comprobante", () => {
  expect(unequivocalCreateRejection({ status: 409, code: "RESOURCE_CONFLICT" })).toBe(true);
  expect(unequivocalCreateRejection({ status: 400, code: "VALIDATION_ERROR" })).toBe(true);
  expect(unequivocalCreateRejection({ status: 401, code: "UNAUTHENTICATED" })).toBe(true);
  expect(unequivocalCreateRejection({ status: 429, code: "RATE_LIMIT_EXCEEDED" })).toBe(true);
  for (const error of [undefined, new Error("sin comprobante"), { status: 0 }, { status: 408 }, { status: 429 }, { status: 503 }]) {
    expect(unequivocalCreateRejection(error)).toBe(false);
  }
});
