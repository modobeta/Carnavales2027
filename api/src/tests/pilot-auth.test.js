import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { toNodeHandler } from "better-auth/node";
import { createApp } from "../app.js";
import { createCredentialUser } from "../auth/account-service.js";
import { closePool, getPool } from "../db/pool.js";

test("production HTTP: 30 accounts on one IP complete OTP; fourth send is 429 and previous code remains valid", {
  skip: !process.env.TEST_DATABASE_URL, timeout: 180000,
}, async (t) => {
  const names = ["NODE_ENV", "DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "FRONTEND_URL", "ENABLE_RATE_LIMIT_TESTS", "TRUST_PROXY"];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  t.after(async () => { await closePool(); for (const name of names) if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; });
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.BETTER_AUTH_SECRET = "pilot-integration-secret-at-least-32-chars";
  process.env.BETTER_AUTH_URL = "http://127.0.0.1";
  process.env.FRONTEND_URL = "http://127.0.0.1";
  process.env.TRUST_PROXY = "0";
  process.env.NODE_ENV = "test";
  delete process.env.ENABLE_RATE_LIMIT_TESTS;
  const { createAuth } = await import("../auth/auth.js");
  const codes = new Map();
  const auth = createAuth({ sendOtp: async ({ user, otp }) => codes.set(user.email, otp) });
  const cookie = (res) => res.headers.getSetCookie().map((item) => item.split(";")[0]).join("; ");
  const password = "Pilot-Password-2026!";
  const users = [];
  for (let i = 0; i < 30; i++) {
    const email = "pilot-" + Date.now() + "-" + i + "@example.test";
    await createCredentialUser({ authInstance: auth, email, name: "Pilot", password });
    const signed = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
    const headers = new Headers({ cookie: cookie(signed) });
    await auth.api.enableTwoFactor({ headers, body: { password } });
    await auth.api.sendTwoFactorOTP({ headers, body: {} });
    await auth.api.verifyTwoFactorOTP({ headers, body: { code: codes.get(email) } });
    users.push(email);
  }
  process.env.NODE_ENV = "production";
  process.env.ENABLE_RATE_LIMIT_TESTS = "true";
  // Create a new instance with production defaults enabled (rate-limit enabled is captured at creation).
  const productionAuth = createAuth({ sendOtp: async ({ user, otp }) => codes.set(user.email, otp) });
  const app = createApp({ authHandler: toNodeHandler(productionAuth) });
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = "http://127.0.0.1:" + server.address().port;
  const post = (route, body, cookies = "") => fetch(base + "/api/auth/" + route, {
    method: "POST", headers: { "content-type": "application/json", origin: "http://127.0.0.1", cookie: cookies },
    body: JSON.stringify(body),
  });
  for (const email of users) {
    const login = await post("sign-in/email", { email, password });
    assert.equal(login.status, 200); assert.equal((await login.json()).twoFactorRedirect, true);
    const challenge = cookie(login);
    const sent = await post("two-factor/send-otp", {}, challenge);
    assert.equal(sent.status, 200);
    if (email === users[0]) {
      assert.equal((await post("two-factor/send-otp", {}, challenge)).status, 200);
      assert.equal((await post("two-factor/send-otp", {}, challenge)).status, 200);
      const limited = await post("two-factor/send-otp", {}, challenge);
      assert.equal(limited.status, 429);
      assert.ok(Number(limited.headers.get("retry-after")) > 0);
    }
    const verified = await post("two-factor/verify-otp", { code: codes.get(email) }, challenge);
    assert.equal(verified.status, 200, email);
  }

  // The five-attempt budget per code must not bypass the persisted ten-failure account lock.
  const lockedEmail = users[1];
  const login = await post("sign-in/email", { email: lockedEmail, password });
  assert.equal(login.status, 200);
  const challenge = cookie(login);
  for (let batch = 0; batch < 2; batch++) {
    assert.equal((await post("two-factor/send-otp", {}, challenge)).status, 200);
    const wrongCode = codes.get(lockedEmail) === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) {
      assert.equal((await post("two-factor/verify-otp", { code: wrongCode }, challenge)).status, 401);
    }
  }
  const locked = await post("two-factor/verify-otp", { code: codes.get(lockedEmail) }, challenge);
  assert.equal(locked.status, 429);
  assert.equal((await locked.json()).code, "ACCOUNT_TEMPORARILY_LOCKED");
  const { rows } = await getPool().query('SELECT "failedVerificationCount", "lockedUntil" FROM "twoFactor" WHERE "userId" = (SELECT id FROM "user" WHERE email = $1)', [lockedEmail]);
  assert.equal(rows[0].failedVerificationCount, 10);
  assert.ok(new Date(rows[0].lockedUntil).getTime() > Date.now());
});
