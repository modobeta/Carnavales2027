import test from "node:test";
import assert from "node:assert/strict";
import { createEmailDelivery, validateEmailConfig } from "../email/delivery.js";

const env = { NODE_ENV: "production", EMAIL_PROVIDER: "gmail", EMAIL_FROM: "Carnaval <sender@gmail.com>",
  GMAIL_CLIENT_ID: "client", GMAIL_CLIENT_SECRET: "private-secret", GMAIL_REFRESH_TOKEN: "private-refresh" };
const tokenResponse = () => ({ ok: true, json: async () => ({ access_token: "private-access", expires_in: 3600 }) });

test("Gmail refreshes once for concurrent messages and preserves MIME recipient, text and HTML", async () => {
  let refreshes = 0;
  const messages = [];
  const deliver = createEmailDelivery({ env, fetchImpl: async (url, options) => {
    assert.ok(options.signal);
    if (url === "https://oauth2.googleapis.com/token") {
      refreshes++;
      assert.equal(options.body.get("grant_type"), "refresh_token");
      assert.equal(options.body.get("refresh_token"), env.GMAIL_REFRESH_TOKEN);
      assert.equal(options.body.get("client_secret"), env.GMAIL_CLIENT_SECRET);
      return tokenResponse();
    }
    assert.equal(url, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
    assert.equal(options.headers.authorization, "Bearer private-access");
    const raw = JSON.parse(options.body).raw;
    assert.match(raw, /^[A-Za-z0-9_-]+$/);
    messages.push(Buffer.from(raw, "base64url").toString());
    return { ok: true, json: async () => ({ id: "accepted" }) };
  } });
  await Promise.all(Array.from({ length: 30 }, (_, i) => deliver({ to: `login${i}@example.test`, subject: "OTP",
    text: "private-code", html: "<p>private-code</p>" })));
  assert.equal(refreshes, 1);
  assert.equal(messages.length, 30);
  for (let i = 0; i < 30; i++) assert.ok(messages.some((mime) => mime.includes(`To: login${i}@example.test\r\n`)));
  assert.match(messages[0], /From: Carnaval <sender@gmail.com>/);
  assert.match(messages[0], /Content-Type: multipart\/alternative/);
  assert.match(messages[0], /private-code/);
});

test("Gmail errors never log payloads, retry sending, or expose provider responses", async () => {
  for (const failure of [
    async () => ({ ok: false, status: 429 }),
    async () => ({ ok: false, status: 401 }),
    async () => { throw Error("private-secret private-code"); },
    async () => ({ ok: true, json: async () => ({ error: "private-code" }) }),
  ]) {
    let sends = 0;
    const logs = [];
    const deliver = createEmailDelivery({ env, logger: { info: (...args) => logs.push(args) }, fetchImpl: async (url) => {
      if (url.includes("oauth2")) return tokenResponse();
      sends++; return failure();
    } });
    await assert.rejects(deliver({ to: "login@example.test", text: "private-code" }), { message: "EMAIL_DELIVERY_FAILED" });
    assert.equal(sends, 1);
    assert.deepEqual(logs, []);
  }
});

test("Gmail missing credentials and revoked refresh tokens fail closed before sending", async () => {
  for (const key of ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"]) {
    assert.throws(() => validateEmailConfig({ ...env, [key]: "" }), new RegExp(key));
  }
  let calls = 0;
  const deliver = createEmailDelivery({ env, fetchImpl: async () => { calls++; return { ok: false }; } });
  await assert.rejects(deliver({ to: "login@example.test", text: "private-code" }), { message: "EMAIL_DELIVERY_FAILED" });
  assert.equal(calls, 1);
});
