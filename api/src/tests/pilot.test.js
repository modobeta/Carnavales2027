import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createEmailDelivery, validateEmailConfig } from "../email/delivery.js";
import { createIdentityBudget, createOtpSendLimiter } from "../auth/identity-limiter.js";
import { validateProductionConfig } from "../config/production.js";
import { createApp } from "../app.js";
import { mountWebClient } from "../web-client.js";
import { withTransaction } from "../db/transaction.js";
import { resetMonitorEventBus, subscribeMonitorEvents, emitMonitorEvent } from "../modules/monitor/monitor-event-bus.js";

const smtp = { NODE_ENV: "production", EMAIL_PROVIDER: "smtp", EMAIL_FROM: "sender@example.test", SMTP_HOST: "smtp.example.test", SMTP_USER: "user", SMTP_PASSWORD: "private", SMTP_SECURE: "true", SMTP_PORT: "465" };

test("SMTP retained, console forbidden in production and production config validated", async () => {
  let sent;
  await createEmailDelivery({ env: smtp, createTransport: (options) => {
    assert.equal(options.secure, true);
    return { sendMail: async (mail) => { sent = mail; } };
  } })({ to: "login@example.test", text: "code" });
  assert.equal(sent.to, "login@example.test");
  assert.throws(() => validateEmailConfig({ NODE_ENV: "production", EMAIL_PROVIDER: "console" }));
  assert.throws(() => validateEmailConfig({ ...smtp, EMAIL_PROVIDER: "gmail" }));
  const env = { ...smtp, DATABASE_URL: "postgres://test:test@db.example.test/db?sslmode=require", BETTER_AUTH_SECRET: "x".repeat(32), BETTER_AUTH_URL: "https://app.example.test", FRONTEND_URL: "https://app.example.test", TRUST_PROXY: "1" };
  validateProductionConfig(env);
  for (const override of [{ DATABASE_URL: "postgres://test:test@db/db" }, { FRONTEND_URL: "https://different.example.test" }, { BETTER_AUTH_SECRET: "" }, { TRUST_PROXY: "true" }]) {
    assert.throws(() => validateProductionConfig({ ...env, ...override }));
  }
});

test("identity budgets expire and OTP uses resolved user identity across challenges", async (t) => {
  let now = 0;
  const budget = createIdentityBudget({ limit: 1, now: () => now });
  assert.equal(budget("one"), 0); assert.equal(budget("two"), 0); assert.equal(budget("one"), 900);
  now = 900001; assert.equal(budget("one"), 0);
  const previous = process.env.ENABLE_RATE_LIMIT_TESTS; process.env.ENABLE_RATE_LIMIT_TESTS = "true";
  t.after(() => { if (previous === undefined) delete process.env.ENABLE_RATE_LIMIT_TESTS; else process.env.ENABLE_RATE_LIMIT_TESTS = previous; });
  const limit = createOtpSendLimiter(); let sent = 0;
  for (let n = 0; n < 3; n++) await limit(async () => sent++, { user: { id: "u" }, otp: String(n) });
  await assert.rejects(limit(async () => sent++, { user: { id: "u" }, otp: "new-challenge" }), (e) => e.statusCode === 429 && Number(e.headers["Retry-After"]) > 0);
  await limit(async () => sent++, { user: { id: "other" }, otp: "x" });
  assert.equal(sent, 4);
});

test("30 accounts share an IP; one account gets 429 without blocking another", async (t) => {
  const previous = process.env.ENABLE_RATE_LIMIT_TESTS; process.env.ENABLE_RATE_LIMIT_TESTS = "true";
  t.after(() => { if (previous === undefined) delete process.env.ENABLE_RATE_LIMIT_TESTS; else process.env.ENABLE_RATE_LIMIT_TESTS = previous; });
  const app = createApp({ authHandler: (req, res) => res.json({ ip: req.headers["x-carnaval-client-ip"] }) });
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening"); t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = "http://127.0.0.1:" + server.address().port;
  const login = (email) => fetch(base + "/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", "x-carnaval-client-ip": "spoof" }, body: JSON.stringify({ email }) });
  const responses = await Promise.all(Array.from({ length: 30 }, (_, i) => login("pilot" + i + "@example.test")));
  assert.ok(responses.every((res) => res.status === 200));
  assert.notEqual((await responses[0].json()).ip, "spoof");
  for (let i = 1; i < 10; i++) assert.equal((await login("PILOT0@example.test")).status, 200);
  const blocked = await login(" pilot0@example.test ");
  assert.equal(blocked.status, 429); assert.ok(Number(blocked.headers.get("retry-after")) > 0);
  assert.equal((await login("pilot1@example.test")).status, 200);
  assert.equal((await fetch(base + "/api/auth/get-session")).status, 200);
});

test("static client has its own CSP, does not swallow API paths, and SW revalidates", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "carnaval-client-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(path.join(dir, "index.html"), "<!doctype html><title>Pilot</title>");
  await writeFile(path.join(dir, "sw.js"), "/*worker*/");
  const app = createApp(); mountWebClient(app, dir);
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening"); t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = "http://127.0.0.1:" + server.address().port;
  const html = await fetch(base + "/");
  assert.equal(html.status, 200); assert.match(html.headers.get("content-security-policy"), /script-src 'self'/);
  assert.equal((await fetch(base + "/sw.js")).headers.get("cache-control"), "no-cache");
  const api = await fetch(base + "/api/missing");
  assert.equal(api.status, 404); assert.match(api.headers.get("content-type"), /json/);
  assert.match(api.headers.get("content-security-policy"), /default-src 'none'/);
  assert.equal((await fetch(base + "/health")).status, 200);
});

test("postcommit subscriber exceptions and rejections cannot retry writes or block listeners", async (t) => {
  resetMonitorEventBus(); t.after(resetMonitorEventBus);
  const queries = []; let writes = 0, received = 0;
  const pool = { connect: async () => ({ query: async (sql) => queries.push(sql), release() {} }) };
  subscribeMonitorEvents(() => { throw Object.assign(Error("private payload"), { code: "40P01" }); });
  subscribeMonitorEvents(async () => { throw Error("async failure"); });
  subscribeMonitorEvents(() => { received++; });
  const result = await withTransaction(async () => { writes++; emitMonitorEvent("TEST"); return "saved"; }, { pool, sleep: async () => {} });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(result, "saved"); assert.equal(writes, 1); assert.equal(received, 1);
  assert.deepEqual(queries, ["BEGIN", "COMMIT"]);
});
