import { test } from "node:test";
import assert from "node:assert/strict";
import { requireRegistrationPassword } from "../auth/registration-password.js";
import { acceptInvitation } from "../modules/judges/judge-service.js";
import { acceptOperationalInvitation } from "../modules/operational-profiles/operational-profile-service.js";
import { acceptRoleInvitation } from "../modules/users/user-service.js";

test("registro exige longitud, mayúscula, minúscula y número", () => {
  for (const password of [null, 12345678, "", "Abc1234", "abcdefgh1", "ABCDEFGH1", "Abcdefghi", "Aa1" + "x".repeat(126)]) {
    assert.throws(() => requireRegistrationPassword(password), TypeError);
  }
  for (const password of ["Abcdefg1", "Ábcdefg1", "Aa1" + "x".repeat(125)]) {
    assert.doesNotThrow(() => requireRegistrationPassword(password));
  }
});

test("las tres aceptaciones rechazan claves débiles antes de acceder a la base o crear usuarios", async () => {
  for (const accept of [acceptInvitation, acceptOperationalInvitation, acceptRoleInvitation]) {
    await assert.rejects(() => accept({ secret: "test", token: "test", password: "abcdefgh" }), TypeError);
  }
});
