import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { createApp } from "../app.js";
import { closePool, getPool } from "../db/pool.js";
import { migrate } from "../db/migrate.js";
import { seedActiveJudge } from "./helpers/judge-fixture.js";

const originalDatabaseUrl = process.env.DATABASE_URL;

test("Spec 036 T8: DELETE logo autoriza propietario persistido y conserva contrato, GET y atomicidad", {
  skip: !process.env.TEST_DATABASE_URL,
}, async (context) => {
  context.after(async () => {
    await closePool();
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  });
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await migrate();
  const pool = getPool();
  const users = ["admin", "assignedAdmin", "assigned", "other", "unassigned", "judge", "veedor", "escribano", "comisario", "scrutineer"];
  const ids = Object.fromEntries([...users, "target", "otherEvent", "inactive", "lifecycle"].map((key) => [key, randomUUID()]));
  await pool.query(`INSERT INTO "user" (id,name,email,"emailVerified")
    SELECT id, '036 T8 fixture', id || '@example.test', true FROM unnest($1::text[]) AS id`, [users.map((key) => ids[key])]);
  for (const [key, role] of [["admin", "ADMIN"], ["assignedAdmin", "ADMIN"], ["judge", "JUDGE"],
    ["veedor", "VEEDOR"], ["escribano", "ESCRIBANO"], ["comisario", "COMISARIO"], ["scrutineer", "SCRUTINEER"]]) {
    await pool.query("INSERT INTO user_role(user_id,role_code) VALUES ($1,$2)", [ids[key], role]);
  }
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>');
  const sha256 = createHash("sha256").update(svg).digest("hex");
  const troupes = {};
  for (const key of ["target", "otherEvent", "inactive", "lifecycle"]) {
    await pool.query("INSERT INTO carnival_event(id,name,active) VALUES ($1,$2,$3)", [ids[key], `036 T8 ${key}`, key !== "inactive"]);
    const { rows: [category] } = await pool.query(`INSERT INTO event_category(event_id,name,code,display_order)
      VALUES ($1,'Comparsa','COMPARSA',1) RETURNING id`, [ids[key]]);
    const { rows: [troupe] } = await pool.query(`INSERT INTO event_troupe(event_id,category_id,name,logo_data,logo_mime,logo_sha256,logo_updated_at)
      VALUES ($1,$2,'Original',$3,'image/svg+xml',$4,CURRENT_TIMESTAMP) RETURNING id`, [ids[key], category.id, svg, sha256]);
    troupes[key] = { id: troupe.id, eventId: ids[key], name: "Original" };
  }
  await pool.query(`INSERT INTO admin_event_assignment(user_id,event_id,is_active) VALUES
    ($1,$2,true),($1,$3,true),($1,$4,true),($5,$2,true),($6,$7,true)`,
  [ids.assigned, ids.target, ids.inactive, ids.lifecycle, ids.assignedAdmin, ids.other, ids.otherEvent]);
  const sessions = Object.fromEntries(users.map((key) => [key, { user: { id: ids[key], twoFactorEnabled: true } }]));
  sessions.noTwoFactor = { user: { id: ids.assigned, twoFactorEnabled: false } };
  const app = createApp({ getSession: async ({ headers }) => sessions[headers.get("x-test-session")] ?? null });
  await withServer(app, async (baseUrl) => {
    const request = (troupeId, session, body, query = "", headers = {}) => fetch(
      `${baseUrl}/api/v1/troupes/${troupeId}/logo${query}`, {
        method: "DELETE", ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        headers: { "content-type": "application/json", ...(session ? { "x-test-session": session } : {}), ...headers },
      });
    const snapshot = async () => (await Promise.all([
      pool.query("SELECT * FROM carnival_event ORDER BY id"),
      pool.query("SELECT * FROM event_category ORDER BY id"),
      pool.query("SELECT * FROM event_troupe ORDER BY id"),
      pool.query("SELECT * FROM admin_event_assignment ORDER BY user_id,event_id"),
      pool.query("SELECT * FROM user_role ORDER BY user_id,role_code"),
      pool.query("SELECT * FROM audit_event ORDER BY id"),
      pool.query("SELECT * FROM general_audit_hash_chain_head"),
    ])).map(({ rows }) => rows);
    const upload = async (key, session = "admin") => {
      const response = await fetch(`${baseUrl}/api/v1/troupes/${troupes[key].id}/logo`, {
        method: "PUT", headers: { "x-test-session": session, "content-type": "image/svg+xml" }, body: svg,
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ...troupes[key], hasLogo: true, logoSha256: sha256 });
    };
    const assertDeleted = async (key, session, { body, query, headers, withLogo = true } = {}) => {
      if (withLogo) await upload(key);
      const troupe = troupes[key];
      const before = await snapshot();
      const row = before[2].find(({ id }) => id === troupe.id);
      assert.equal(row.logo_data !== null, withLogo);
      const response = await request(troupe.id, session, body, query, headers);
      assert.equal(response.status, 200);
      const expected = { ...troupe, hasLogo: false };
      assert.deepEqual(await response.json(), expected);
      const after = await snapshot();
      const updated = after[2].find(({ id }) => id === troupe.id);
      assert.ok(updated.updated_at instanceof Date);
      assert.ok(updated.updated_at >= row.updated_at);
      const expectedRows = before[2].map((item) => item.id !== troupe.id ? item : {
        ...item, logo_data: null, logo_mime: null, logo_sha256: null, logo_updated_at: null, updated_at: updated.updated_at,
      });
      assert.deepEqual(after.slice(0, 5), [before[0], before[1], expectedRows, before[3], before[4]]);
      const previousIds = new Set(before[5].map(({ id }) => id));
      assert.deepEqual(after[5].filter(({ id }) => previousIds.has(id)), before[5]);
      const audits = after[5].filter(({ id }) => !previousIds.has(id));
      assert.equal(audits.length, 1);
      assert.equal(audits[0].actor_user_id, ids[session]);
      assert.equal(audits[0].action, "TROUPE_LOGO_DELETED");
      assert.equal(audits[0].entity_type, "event_troupe");
      assert.equal(audits[0].entity_id, troupe.id);
      assert.deepEqual(audits[0].after_data, expected);
    };
    const assertRejected = async (troupeId, session, status, expected, body, query, headers) => {
      const before = await snapshot();
      const response = await request(troupeId, session, body, query, headers);
      assert.equal(response.status, status, `${session} DELETE ${troupeId}`);
      assert.deepEqual(await response.json(), expected);
      assert.deepEqual(await snapshot(), before);
    };

    // Confirm the existing ADMIN 200 contract, then RED: delegated DELETE is still 403.
    await assertDeleted("target", "admin");
    await assertDeleted("target", "assigned");

    await context.test("ADMIN global con/sin asignación prevalece, incluido evento inactivo", async () => {
      for (const session of ["admin", "assignedAdmin"]) {
        await assertDeleted("otherEvent", session);
        await assertDeleted("inactive", session);
      }
      await pool.query("UPDATE admin_event_assignment SET is_active=false WHERE user_id=$1", [ids.assignedAdmin]);
      await assertDeleted("target", "assignedAdmin");
    });

    await context.test("sesión/2FA, roles y propietario exacto rechazan sin divulgar ni alterar logos", async () => {
      for (const key of ["target", "otherEvent", "inactive"]) await upload(key);
      for (const [key, session, status, code] of [
        ["target", null, 401, "UNAUTHENTICATED"], ["target", "expired", 401, "UNAUTHENTICATED"],
        ["target", "noTwoFactor", 403, "TWO_FACTOR_REQUIRED"], ["target", "other", 403, "ADMIN_REQUIRED"],
        ["otherEvent", "assigned", 403, "ADMIN_REQUIRED"], ["inactive", "assigned", 403, "ADMIN_REQUIRED"],
        ...["unassigned", "judge", "veedor", "escribano", "comisario", "scrutineer"].map((session) => ["target", session, 403, "ADMIN_REQUIRED"]),
      ]) await assertRejected(troupes[key].id, session, status, { code });
      for (const troupeId of [randomUUID(), "not-a-uuid"]) await assertRejected(troupeId, "assigned", 403, { code: "ADMIN_REQUIRED" });
      for (const session of ["admin", "assignedAdmin"]) {
        await assertRejected(randomUUID(), session, 404, { code: "TROUPE_NOT_FOUND" });
        await assertRejected("not-a-uuid", session, 400, { code: "VALIDATION_ERROR" });
      }
    });

    await context.test("body/query/headers no autorizan ni desplazan propietario, ruta, conexión o actor", async () => {
      const spoof = { eventId: ids.target, troupeId: troupes.target.id, role: "ADMIN", userId: ids.admin,
        actor: ids.admin, actorUserId: ids.admin, client: null, permissions: ["ADMIN"] };
      const query = `?${new URLSearchParams(spoof)}`;
      const headers = { "x-event-id": ids.target, "x-troupe-id": troupes.target.id, "x-role": "ADMIN", "x-user-id": ids.admin,
        "x-actor": ids.admin, "x-actor-user-id": ids.admin, "x-client": "{}", "x-permissions": "ADMIN" };
      for (const session of ["assigned", "unassigned", "judge", null, "noTwoFactor"]) {
        await assertRejected(troupes.otherEvent.id, session, session === null ? 401 : 403,
          { code: session === null ? "UNAUTHENTICATED" : session === "noTwoFactor" ? "TWO_FACTOR_REQUIRED" : "ADMIN_REQUIRED" }, spoof, query, headers);
      }
      for (const [index, session] of ["assigned", "assigned", "admin"].entries()) {
        if (index === 1) await pool.query("INSERT INTO admin_event_assignment(user_id,event_id,is_active) VALUES ($1,$2,true)", [ids.assigned, ids.otherEvent]);
        const fields = { ...spoof, eventId: ids.otherEvent, troupeId: troupes.otherEvent.id, userId: ids.other, client: {}, name: "Ignored", active: false };
        await assertDeleted("target", session, { body: fields, query: `?${new URLSearchParams(fields)}`, headers: {
          ...headers, "x-event-id": ids.otherEvent, "x-troupe-id": troupes.otherEvent.id,
        } });
      }
    });

    await context.test("sin logo y repetición mantienen 200 y una nueva auditoría por DELETE", async () => {
      for (const session of ["assigned", "admin"]) {
        await assertDeleted("target", session, { withLogo: false });
        await assertDeleted("target", session, { withLogo: false, body: { operationId: randomUUID() } });
      }
    });

    await context.test("comparsa inactiva admite DELETE; GET Jurado conserva binario, SHA/ETag/304 y ausencia", async () => {
      await pool.query("UPDATE event_troupe SET active=false WHERE id=$1", [troupes.target.id]);
      await upload("target", "assigned");
      const url = `${baseUrl}/api/v1/troupes/${troupes.target.id}/logo`;
      const before = await snapshot();
      for (const session of [null, "expired", "noTwoFactor"]) {
        const read = await fetch(url, { headers: session ? { "x-test-session": session } : {} });
        assert.equal(read.status, session === "noTwoFactor" ? 403 : 401);
        assert.deepEqual(await read.json(), { code: session === "noTwoFactor" ? "TWO_FACTOR_REQUIRED" : "UNAUTHENTICATED" });
      }
      const read = await fetch(url, { headers: { "x-test-session": "judge" } });
      assert.equal(read.status, 200);
      assert.equal(read.headers.get("content-type"), "image/svg+xml");
      assert.equal(read.headers.get("etag"), `"${sha256}"`);
      assert.equal(read.headers.get("cache-control"), "private, max-age=86400");
      assert.equal(read.headers.get("x-content-type-options"), "nosniff");
      assert.equal(read.headers.get("content-security-policy"), "default-src 'none'; style-src 'unsafe-inline'; sandbox");
      assert.deepEqual(Buffer.from(await read.arrayBuffer()), svg);
      const cached = await fetch(url, { headers: { "x-test-session": "judge", "if-none-match": `"${sha256}"` } });
      assert.equal(cached.status, 304);
      assert.equal(cached.headers.get("etag"), `"${sha256}"`);
      assert.equal(cached.headers.get("cache-control"), "private, max-age=86400");
      assert.equal((await cached.arrayBuffer()).byteLength, 0);
      assert.deepEqual(await snapshot(), before);
      await assertDeleted("target", "assigned");
      const deleted = await snapshot();
      for (const headers of [{}, { "if-none-match": `"${sha256}"` }]) {
        const withoutLogo = await fetch(url, { headers: { "x-test-session": "judge", ...headers } });
        assert.equal(withoutLogo.status, 404);
        assert.deepEqual(await withoutLogo.json(), { code: "TROUPE_LOGO_NOT_FOUND" });
      }
      const missing = await fetch(`${baseUrl}/api/v1/troupes/${randomUUID()}/logo`, { headers: { "x-test-session": "judge" } });
      assert.equal(missing.status, 404);
      assert.deepEqual(await missing.json(), { code: "TROUPE_NOT_FOUND" });
      assert.deepEqual(await snapshot(), deleted);
      await upload("target", "assigned");
    });

    await context.test("fallos tras UPDATE real y en auditoría revierten bytes, metadata y evidencia", async () => {
      for (const session of ["assigned", "admin"]) for (const stage of ["update", "audit"]) {
        const before = await snapshot();
        assert.deepEqual(before[2].find(({ id }) => id === troupes.target.id).logo_data, svg);
        const originalConnect = pool.connect;
        const restores = [];
        let updatedRow;
        let failures = 0;
        const connectMock = context.mock.method(pool, "connect", function (...args) {
          const wrap = (client) => {
            const descriptor = Object.getOwnPropertyDescriptor(client, "query");
            const originalQuery = client.query;
            client.query = async function (query, ...queryArgs) {
              const isUpdate = typeof query === "string" && /^\s*UPDATE\s+event_troupe\b/i.test(query);
              const isAudit = typeof query === "string" && /^\s*INSERT\s+INTO\s+audit_event\b/i.test(query);
              if (stage === "audit" && isAudit) { failures += 1; throw new Error("Injected DELETE logo audit failure"); }
              const result = await originalQuery.call(client, query, ...queryArgs);
              if (isUpdate) {
                updatedRow = result.rows[0];
                if (stage === "update") { failures += 1; throw new Error("Injected failure after DELETE logo UPDATE"); }
              }
              return result;
            };
            restores.push(() => {
              if (descriptor) Object.defineProperty(client, "query", descriptor);
              else delete client.query;
            });
            return client;
          };
          if (typeof args[0] === "function") return originalConnect.call(pool, (error, client, release) => args[0](error, error ? client : wrap(client), release));
          return originalConnect.call(pool).then(wrap);
        });
        let response;
        try { response = await request(troupes.target.id, session); }
        finally { connectMock.mock.restore(); for (const restore of restores.reverse()) restore(); }
        assert.equal(response.status, 500);
        assert.deepEqual(await response.json(), { code: "INTERNAL_ERROR" });
        assert.equal(failures, 1);
        assert.deepEqual(updatedRow, { ...troupes.target, hasLogo: false }, "UPDATE real anterior al fallo");
        assert.deepEqual(await snapshot(), before);
      }
    });

    await context.test("revocación y rol efectivo rigen al siguiente DELETE sin afectar B ni ADMIN", async () => {
      await pool.query("UPDATE admin_event_assignment SET is_active=false WHERE user_id=$1 AND event_id=$2", [ids.assigned, ids.target]);
      await assertRejected(troupes.target.id, "assigned", 403, { code: "ADMIN_REQUIRED" });
      await assertDeleted("otherEvent", "assigned");
      await assertDeleted("target", "admin");
      await assertDeleted("target", "assignedAdmin");
      await pool.query("DELETE FROM user_role WHERE user_id=$1 AND role_code='ADMIN'", [ids.assignedAdmin]);
      await upload("target");
      await assertRejected(troupes.target.id, "assignedAdmin", 403, { code: "ADMIN_REQUIRED" });
    });

    await context.test("lifecycle OPEN/CLOSED conserva guarda persistente DELETE para ambos actores", async () => {
      const eventId = ids.lifecycle;
      const { rows: [night] } = await pool.query("INSERT INTO night(event_id,name,display_order,kind,status) VALUES ($1,'Noche',1,'COMPETITION','OPEN') RETURNING id", [eventId]);
      const { rows: [specialty] } = await pool.query("INSERT INTO event_specialty(event_id,name,code,display_order) VALUES ($1,'Baile','BAILE',1) RETURNING id", [eventId]);
      const { rows: [rubric] } = await pool.query("INSERT INTO rubric(event_id,name,code,evaluation_target) VALUES ($1,'Rubro','RUBRO','TROUPE') RETURNING id", [eventId]);
      await pool.query("INSERT INTO evaluation_item(event_id,rubric_id,specialty_id,name,code) VALUES ($1,$2,$3,'Item','ITEM')", [eventId, rubric.id, specialty.id]);
      await pool.query("INSERT INTO night_troupe_schedule(event_id,night_id,event_troupe_id,presentation_order) VALUES ($1,$2,$3,1)", [eventId, night.id, troupes.lifecycle.id]);
      await seedActiveJudge({ client: pool, eventId, nightId: night.id, specialtyId: specialty.id });
      const opened = await fetch(`${baseUrl}/api/v1/events/${eventId}/open`, { method: "POST", headers: { "x-test-session": "admin", "Idempotency-Key": randomUUID() } });
      assert.equal(opened.status, 200);
      assert.equal((await opened.json()).status, "OPEN");
      for (const status of ["OPEN", "CLOSED"]) {
        if (status === "CLOSED") {
          await pool.query("UPDATE night SET status='CLOSED' WHERE id=$1", [night.id]);
          await pool.query("UPDATE carnival_event SET status='CLOSED' WHERE id=$1", [eventId]);
        }
        assert.deepEqual((await pool.query("SELECT active,status FROM carnival_event WHERE id=$1", [eventId])).rows, [{ active: true, status }]);
        for (const session of ["assigned", "admin"]) await assertRejected(troupes.lifecycle.id, session, 409, { code: "EVENT_LOCKED" });
        await assertRejected(troupes.lifecycle.id, "other", 403, { code: "ADMIN_REQUIRED" });
      }
    });
  });
});

test("Spec 036 T7: PUT logo autoriza propietario persistido y conserva binario, GET y atomicidad", {
  skip: !process.env.TEST_DATABASE_URL,
}, async (context) => {
  context.after(async () => {
    await closePool();
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  });
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await migrate();
  const pool = getPool();
  const users = ["admin", "assignedAdmin", "assigned", "other", "unassigned", "judge", "veedor", "escribano", "comisario", "scrutineer"];
  const ids = Object.fromEntries([...users, "target", "otherEvent", "inactive", "lifecycle"].map((key) => [key, randomUUID()]));
  await pool.query(`INSERT INTO "user" (id,name,email,"emailVerified")
    SELECT id, '036 T7 fixture', id || '@example.test', true FROM unnest($1::text[]) AS id`, [users.map((key) => ids[key])]);
  for (const [key, role] of [["admin", "ADMIN"], ["assignedAdmin", "ADMIN"], ["judge", "JUDGE"],
    ["veedor", "VEEDOR"], ["escribano", "ESCRIBANO"], ["comisario", "COMISARIO"], ["scrutineer", "SCRUTINEER"]]) {
    await pool.query("INSERT INTO user_role(user_id,role_code) VALUES ($1,$2)", [ids[key], role]);
  }
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>');
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF1sAAAAASUVORK5CYII=", "base64");
  const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
  const troupes = {};
  for (const key of ["target", "otherEvent", "inactive", "lifecycle"]) {
    await pool.query("INSERT INTO carnival_event(id,name,active) VALUES ($1,$2,$3)", [ids[key], `036 T7 ${key}`, key !== "inactive"]);
    const { rows: [category] } = await pool.query(`INSERT INTO event_category(event_id,name,code,display_order)
      VALUES ($1,'Comparsa','COMPARSA',1) RETURNING id`, [ids[key]]);
    const { rows: [troupe] } = await pool.query(`INSERT INTO event_troupe(event_id,category_id,name,logo_data,logo_mime,logo_sha256,logo_updated_at)
      VALUES ($1,$2,'Original',$3,'image/svg+xml',$4,CURRENT_TIMESTAMP) RETURNING id`, [ids[key], category.id, svg, hash(svg)]);
    troupes[key] = { id: troupe.id, eventId: ids[key], name: "Original" };
  }
  await pool.query(`INSERT INTO admin_event_assignment(user_id,event_id,is_active) VALUES
    ($1,$2,true),($1,$3,true),($1,$4,true),($5,$2,true),($6,$7,true)`,
  [ids.assigned, ids.target, ids.inactive, ids.lifecycle, ids.assignedAdmin, ids.other, ids.otherEvent]);
  const sessions = Object.fromEntries(users.map((key) => [key, { user: { id: ids[key], twoFactorEnabled: true } }]));
  sessions.noTwoFactor = { user: { id: ids.assigned, twoFactorEnabled: false } };
  const app = createApp({ getSession: async ({ headers }) => sessions[headers.get("x-test-session")] ?? null });
  await withServer(app, async (baseUrl) => {
    const request = (troupeId, session, body = png, mime = "image/png", query = "", headers = {}) => fetch(
      `${baseUrl}/api/v1/troupes/${troupeId}/logo${query}`, {
        method: "PUT", body,
        headers: { ...(mime ? { "content-type": mime } : {}), ...(session ? { "x-test-session": session } : {}), ...headers },
      });
    const snapshot = async () => (await Promise.all([
      pool.query("SELECT * FROM carnival_event ORDER BY id"),
      pool.query("SELECT * FROM event_category ORDER BY id"),
      pool.query("SELECT * FROM event_troupe ORDER BY id"),
      pool.query("SELECT * FROM admin_event_assignment ORDER BY user_id,event_id"),
      pool.query("SELECT * FROM user_role ORDER BY user_id,role_code"),
      pool.query("SELECT * FROM audit_event ORDER BY id"),
      pool.query("SELECT * FROM general_audit_hash_chain_head"),
    ])).map(({ rows }) => rows);
    const assertUploaded = async (key, session, body = png, mime = "image/png", query, headers, detectedMime = mime) => {
      const troupe = troupes[key];
      const { rows: [before] } = await pool.query("SELECT * FROM event_troupe WHERE id=$1", [troupe.id]);
      const beforeAudit = (await pool.query("SELECT id FROM audit_event WHERE entity_id=$1", [troupe.id])).rows;
      const response = await request(troupe.id, session, body, mime, query, headers);
      assert.equal(response.status, 200);
      const expected = { ...troupe, hasLogo: true, logoSha256: hash(body) };
      assert.deepEqual(await response.json(), expected);
      const { rows: [after] } = await pool.query("SELECT * FROM event_troupe WHERE id=$1", [troupe.id]);
      assert.ok(after.logo_updated_at instanceof Date);
      assert.ok(after.logo_updated_at >= before.logo_updated_at);
      assert.deepEqual(after, { ...before, logo_data: body, logo_mime: detectedMime, logo_sha256: hash(body),
        logo_updated_at: after.logo_updated_at, updated_at: after.updated_at });
      const audits = (await pool.query(`SELECT id,actor_user_id AS "actorUserId",action,entity_type AS "entityType",after_data AS "after"
        FROM audit_event WHERE entity_id=$1`, [troupe.id])).rows.filter(({ id }) => !beforeAudit.some((row) => row.id === id));
      assert.equal(audits.length, 1);
      assert.deepEqual(audits[0], { id: audits[0].id, actorUserId: ids[session], action: "TROUPE_LOGO_UPDATED", entityType: "event_troupe", after: expected });
    };
    const assertRejected = async (troupeId, session, status, expected, body, mime, query, headers) => {
      const before = await snapshot();
      const response = await request(troupeId, session, body, mime, query, headers);
      assert.equal(response.status, status, `${session} PUT ${troupeId}`);
      assert.deepEqual(await response.json(), expected);
      assert.deepEqual(await snapshot(), before);
    };

    // RED anchor: ADMIN-only PUT returns 403 instead of the delegated success.
    await assertUploaded("target", "assigned");

    await context.test("ADMIN global con/sin asignación prevalece, incluido evento inactivo", async () => {
      for (const session of ["admin", "assignedAdmin"]) {
        await assertUploaded("otherEvent", session);
        await assertUploaded("inactive", session);
      }
      await pool.query("UPDATE admin_event_assignment SET is_active=false WHERE user_id=$1", [ids.assignedAdmin]);
      await assertUploaded("target", "assignedAdmin");
    });

    await context.test("sesión/2FA, roles y propietario exacto rechazan sin divulgación ni cambios", async () => {
      for (const [key, session, status, code] of [
        ["target", null, 401, "UNAUTHENTICATED"], ["target", "expired", 401, "UNAUTHENTICATED"],
        ["target", "noTwoFactor", 403, "TWO_FACTOR_REQUIRED"], ["target", "other", 403, "ADMIN_REQUIRED"],
        ["otherEvent", "assigned", 403, "ADMIN_REQUIRED"], ["inactive", "assigned", 403, "ADMIN_REQUIRED"],
        ...["unassigned", "judge", "veedor", "escribano", "comisario", "scrutineer"].map((session) => ["target", session, 403, "ADMIN_REQUIRED"]),
      ]) {
        await assertRejected(troupes[key].id, session, status, { code });
        await assertRejected(troupes[key].id, session, status, { code }, Buffer.from("invalid"));
      }
      for (const troupeId of [randomUUID(), "not-a-uuid"]) await assertRejected(troupeId, "assigned", 403, { code: "ADMIN_REQUIRED" });
      for (const session of ["admin", "assignedAdmin"]) {
        await assertRejected(randomUUID(), session, 404, { code: "TROUPE_NOT_FOUND" });
        await assertRejected("not-a-uuid", session, 400, { code: "VALIDATION_ERROR" });
        for (const troupeId of [randomUUID(), "not-a-uuid"]) await assertRejected(troupeId, session, 400,
          { code: "VALIDATION_ERROR", message: "El logo debe ser un PNG, JPG, WebP o SVG válido." }, Buffer.from("invalid"));
      }
    });

    await context.test("body/query/headers no conceden ni desplazan permiso, ruta, conexión o actor", async () => {
      const spoof = { eventId: ids.target, troupeId: troupes.target.id, role: "ADMIN", userId: ids.admin,
        actor: ids.admin, actorUserId: ids.admin, client: null, permissions: ["ADMIN"] };
      const query = `?${new URLSearchParams(spoof)}`;
      const headers = { "x-event-id": ids.target, "x-troupe-id": troupes.target.id, "x-role": "ADMIN", "x-user-id": ids.admin, "x-actor-user-id": ids.admin, "x-client": "{}" };
      for (const session of ["assigned", "unassigned", "judge"]) {
        await assertRejected(troupes.otherEvent.id, session, 403, { code: "ADMIN_REQUIRED" }, png, "image/png", query, headers);
        await assertRejected(troupes.otherEvent.id, session, 403, { code: "ADMIN_REQUIRED" }, JSON.stringify(spoof), "application/json", query, headers);
      }
      for (const [index, session] of ["assigned", "assigned", "admin"].entries()) {
        if (index === 1) await pool.query("INSERT INTO admin_event_assignment(user_id,event_id,is_active) VALUES ($1,$2,true)", [ids.assigned, ids.otherEvent]);
        const beforeOther = (await pool.query("SELECT * FROM event_troupe WHERE event_id=$1 ORDER BY id", [ids.otherEvent])).rows;
        // Binary content containing spoof fields is only content; JSON is not an upload.
        const fields = { ...spoof, eventId: ids.otherEvent, troupeId: troupes.otherEvent.id, userId: ids.other, client: {} };
        const bytes = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg"><metadata>${JSON.stringify(fields)}</metadata></svg>`);
        await assertUploaded("target", session, bytes, "image/svg+xml", `?${new URLSearchParams(fields)}`, headers);
        await assertRejected(troupes.target.id, session, 400, { code: "VALIDATION_ERROR", message: "logoData debe ser un archivo no vacío." },
          JSON.stringify(fields), "application/json");
        assert.deepEqual((await pool.query("SELECT * FROM event_troupe WHERE event_id=$1 ORDER BY id", [ids.otherEvent])).rows, beforeOther);
      }
    });

    await context.test("formatos, MIME, vacío, contenido y límite binario conservan errores y SHA-256", async () => {
      for (const session of ["assigned", "admin"]) {
        for (const [body, mime, message] of [
          [Buffer.alloc(0), "image/png", "logoData debe ser un archivo no vacío."],
          [undefined, "image/png", "logoData debe ser un archivo no vacío."],
          [Buffer.from("not an image"), "image/png", "El logo debe ser un PNG, JPG, WebP o SVG válido."],
          [Buffer.from("GIF89a"), "image/gif", "El logo debe ser un PNG, JPG, WebP o SVG válido."],
          [png, "image/jpeg", "El tipo declarado (image/jpeg) no coincide con el contenido (image/png)."],
          [png, "application/octet-stream", "El tipo declarado (application/octet-stream) no coincide con el contenido (image/png)."],
          [png, "image/png; charset=utf-8", "El tipo declarado (image/png; charset=utf-8) no coincide con el contenido (image/png)."],
        ]) await assertRejected(troupes.target.id, session, 400, { code: "VALIDATION_ERROR", message }, body === undefined ? null : body, mime);
        await assertRejected(troupes.target.id, session, 413, { code: "PAYLOAD_TOO_LARGE", message: "Payload excede el límite permitido." }, Buffer.alloc(1048577), "image/png");
        const max = Buffer.alloc(1048576);
        png.copy(max);
        await assertUploaded("target", session, max);
        await assertUploaded("target", session, png, null, undefined, undefined, "image/png");
        // Existing validation recognizes these byte signatures; it does not fully decode images.
        for (const [bytes, mime] of [[svg, "image/svg+xml"], [Buffer.from([0xff, 0xd8, 0xff, 0xd9]), "image/jpeg"],
          [Buffer.from("RIFF\x04\x00\x00\x00WEBP", "latin1"), "image/webp"]]) await assertUploaded("target", session, bytes, mime);
      }
    });

    await context.test("comparsa inactiva no es evento inactivo; GET Jurado conserva bytes, MIME, caché y ausencia", async () => {
      await pool.query("UPDATE event_troupe SET active=false WHERE id=$1", [troupes.target.id]);
      await assertUploaded("target", "assigned", svg, "image/svg+xml");
      const before = await snapshot();
      const url = `${baseUrl}/api/v1/troupes/${troupes.target.id}/logo`;
      for (const session of [null, "expired", "noTwoFactor"]) {
        const read = await fetch(url, { headers: session ? { "x-test-session": session } : {} });
        assert.equal(read.status, session === "noTwoFactor" ? 403 : 401);
        assert.deepEqual(await read.json(), { code: session === "noTwoFactor" ? "TWO_FACTOR_REQUIRED" : "UNAUTHENTICATED" });
      }
      const read = await fetch(url, { headers: { "x-test-session": "judge" } });
      assert.equal(read.status, 200);
      assert.equal(read.headers.get("content-type"), "image/svg+xml");
      assert.equal(read.headers.get("etag"), `"${hash(svg)}"`);
      assert.equal(read.headers.get("cache-control"), "private, max-age=86400");
      assert.equal(read.headers.get("x-content-type-options"), "nosniff");
      assert.equal(read.headers.get("content-security-policy"), "default-src 'none'; style-src 'unsafe-inline'; sandbox");
      assert.deepEqual(Buffer.from(await read.arrayBuffer()), svg);
      const cached = await fetch(url, { headers: { "x-test-session": "judge", "if-none-match": `"${hash(svg)}"` } });
      assert.equal(cached.status, 304);
      assert.equal(cached.headers.get("etag"), `"${hash(svg)}"`);
      assert.equal(cached.headers.get("cache-control"), "private, max-age=86400");
      assert.equal((await cached.arrayBuffer()).byteLength, 0);
      assert.deepEqual(await snapshot(), before);
      await pool.query("UPDATE event_troupe SET logo_data=NULL,logo_mime=NULL,logo_sha256=NULL,logo_updated_at=NULL WHERE id=$1", [troupes.target.id]);
      const withoutLogo = await fetch(url, { headers: { "x-test-session": "judge" } });
      assert.equal(withoutLogo.status, 404);
      assert.deepEqual(await withoutLogo.json(), { code: "TROUPE_LOGO_NOT_FOUND" });
      const missing = await fetch(`${baseUrl}/api/v1/troupes/${randomUUID()}/logo`, { headers: { "x-test-session": "judge" } });
      assert.equal(missing.status, 404);
      assert.deepEqual(await missing.json(), { code: "TROUPE_NOT_FOUND" });
      await assertUploaded("target", "assigned");
    });

    await context.test("fallos tras UPDATE real y en auditoría revierten binario, metadata y evidencia", async () => {
      for (const stage of ["update", "audit"]) {
        const before = await snapshot();
        const originalConnect = pool.connect;
        const restores = [];
        let updatedRow;
        let failures = 0;
        const connectMock = context.mock.method(pool, "connect", function (...args) {
          const wrap = (client) => {
            const descriptor = Object.getOwnPropertyDescriptor(client, "query");
            const originalQuery = client.query;
            client.query = async function (query, ...queryArgs) {
              const isUpdate = typeof query === "string" && /^\s*UPDATE\s+event_troupe\b/i.test(query);
              const isAudit = typeof query === "string" && /^\s*INSERT\s+INTO\s+audit_event\b/i.test(query);
              if (stage === "audit" && isAudit) { failures += 1; throw new Error("Injected logo audit failure"); }
              const result = await originalQuery.call(client, query, ...queryArgs);
              if (isUpdate) {
                updatedRow = result.rows[0];
                if (stage === "update") { failures += 1; throw new Error("Injected failure after logo UPDATE"); }
              }
              return result;
            };
            restores.push(() => {
              if (descriptor) Object.defineProperty(client, "query", descriptor);
              else delete client.query;
            });
            return client;
          };
          if (typeof args[0] === "function") return originalConnect.call(pool, (error, client, release) => args[0](error, error ? client : wrap(client), release));
          return originalConnect.call(pool).then(wrap);
        });
        let response;
        try { response = await request(troupes.target.id, "assigned", svg, "image/svg+xml"); }
        finally { connectMock.mock.restore(); for (const restore of restores.reverse()) restore(); }
        assert.equal(response.status, 500);
        assert.deepEqual(await response.json(), { code: "INTERNAL_ERROR" });
        assert.equal(failures, 1);
        assert.deepEqual(updatedRow, { ...troupes.target, hasLogo: true, logoSha256: hash(svg) }, "UPDATE real anterior al fallo");
        assert.deepEqual(await snapshot(), before);
      }
    });

    await context.test("revocación y rol efectivo rigen al siguiente PUT sin afectar B ni ADMIN", async () => {
      await pool.query("UPDATE admin_event_assignment SET is_active=false WHERE user_id=$1 AND event_id=$2", [ids.assigned, ids.target]);
      await assertRejected(troupes.target.id, "assigned", 403, { code: "ADMIN_REQUIRED" });
      await assertUploaded("otherEvent", "assigned");
      await assertUploaded("target", "admin");
      await assertUploaded("target", "assignedAdmin");
      await pool.query("DELETE FROM user_role WHERE user_id=$1 AND role_code='ADMIN'", [ids.assignedAdmin]);
      await assertRejected(troupes.target.id, "assignedAdmin", 403, { code: "ADMIN_REQUIRED" });
    });

    await context.test("lifecycle OPEN/CLOSED conserva guarda persistente de PUT para ambos actores", async () => {
      const eventId = ids.lifecycle;
      const { rows: [night] } = await pool.query("INSERT INTO night(event_id,name,display_order,kind,status) VALUES ($1,'Noche',1,'COMPETITION','OPEN') RETURNING id", [eventId]);
      const { rows: [specialty] } = await pool.query("INSERT INTO event_specialty(event_id,name,code,display_order) VALUES ($1,'Baile','BAILE',1) RETURNING id", [eventId]);
      const { rows: [rubric] } = await pool.query("INSERT INTO rubric(event_id,name,code,evaluation_target) VALUES ($1,'Rubro','RUBRO','TROUPE') RETURNING id", [eventId]);
      await pool.query("INSERT INTO evaluation_item(event_id,rubric_id,specialty_id,name,code) VALUES ($1,$2,$3,'Item','ITEM')", [eventId, rubric.id, specialty.id]);
      await pool.query("INSERT INTO night_troupe_schedule(event_id,night_id,event_troupe_id,presentation_order) VALUES ($1,$2,$3,1)", [eventId, night.id, troupes.lifecycle.id]);
      await seedActiveJudge({ client: pool, eventId, nightId: night.id, specialtyId: specialty.id });
      const opened = await fetch(`${baseUrl}/api/v1/events/${eventId}/open`, { method: "POST", headers: { "x-test-session": "admin", "Idempotency-Key": randomUUID() } });
      assert.equal(opened.status, 200);
      assert.equal((await opened.json()).status, "OPEN");
      for (const status of ["OPEN", "CLOSED"]) {
        if (status === "CLOSED") {
          await pool.query("UPDATE night SET status='CLOSED' WHERE id=$1", [night.id]);
          await pool.query("UPDATE carnival_event SET status='CLOSED' WHERE id=$1", [eventId]);
        }
        assert.deepEqual((await pool.query("SELECT active,status FROM carnival_event WHERE id=$1", [eventId])).rows, [{ active: true, status }]);
        for (const session of ["assigned", "admin"]) await assertRejected(troupes.lifecycle.id, session, 409, { code: "EVENT_LOCKED" });
        await assertRejected(troupes.lifecycle.id, "other", 403, { code: "ADMIN_REQUIRED" });
      }
    });
  });
});

async function withServer(app, run) {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("Spec 029: ciclo de vida del logo de comparsa y permisos", {
  skip: !process.env.TEST_DATABASE_URL,
}, async (context) => {
  context.after(async () => {
    await closePool();
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  });
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await migrate();

  const pool = getPool();
  const adminId = randomUUID();
  const judgeId = randomUUID();
  await pool.query(
    `INSERT INTO "user"(id, name, email, "emailVerified")
     VALUES ($1, 'Admin logo', $2, true), ($3, 'Judge logo', $4, true)`,
    [adminId, `${adminId}@example.test`, judgeId, `${judgeId}@example.test`],
  );
  await pool.query("INSERT INTO user_role (user_id, role_code) VALUES ($1, 'ADMIN')", [adminId]);
  await pool.query("INSERT INTO user_role (user_id, role_code) VALUES ($1, 'JUDGE')", [judgeId]);

  const { rows: [event] } = await pool.query(
    "INSERT INTO carnival_event(name) VALUES($1) RETURNING id",
    ["Evento logo"],
  );
  const { rows: [category] } = await pool.query(
    "INSERT INTO event_category(event_id, name, code, display_order) VALUES($1,$2,$3,$4) RETURNING id",
    [event.id, "Comparsa", "COMPARSA", 1],
  );
  const { rows: [troupe] } = await pool.query(
    "INSERT INTO event_troupe(event_id, category_id, name) VALUES($1,$2,$3) RETURNING id",
    [event.id, category.id, "Ara Bera"],
  );

  const app = createApp({
    getSession: async ({ headers }) => {
      const role = headers.get("x-test-session");
      if (role === "admin") return { user: { id: adminId, twoFactorEnabled: true } };
      if (role === "judge") return { user: { id: judgeId, twoFactorEnabled: true } };
      return null;
    },
  });

  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);

  await withServer(app, async (baseUrl) => {
    const put = (body, session) => fetch(`${baseUrl}/api/v1/troupes/${troupe.id}/logo`, {
      method: "PUT",
      headers: { "content-type": "image/png", "x-test-session": session },
      body,
    });

    // El jurado no puede escribir el logo.
    assert.equal((await put(png, "judge")).status, 403);

    // Contenido inválido rechazado por la firma de bytes, no por el Content-Type.
    assert.equal((await put(Buffer.from("no-es-imagen"), "admin")).status, 400);

    // Alta válida como ADMIN.
    const upload = await put(png, "admin");
    assert.equal(upload.status, 200);
    const uploaded = await upload.json();
    assert.equal(uploaded.hasLogo, true);
    assert.match(uploaded.logoSha256, /^[0-9a-f]{64}$/);

    // El listado expone metadatos, nunca los bytes.
    const listed = await (await fetch(`${baseUrl}/api/v1/events/${event.id}/troupes`, {
      headers: { "x-test-session": "admin" },
    })).json();
    assert.equal(listed[0].hasLogo, true);
    assert.equal(listed[0].logoSha256, uploaded.logoSha256);
    assert.equal(listed[0].logoData, undefined);

    // Lectura operativa (jurado) con ETag y cache privado.
    const read = await fetch(`${baseUrl}/api/v1/troupes/${troupe.id}/logo`, {
      headers: { "x-test-session": "judge" },
    });
    assert.equal(read.status, 200);
    assert.equal(read.headers.get("content-type"), "image/png");
    assert.equal(read.headers.get("etag"), `"${uploaded.logoSha256}"`);
    assert.match(read.headers.get("cache-control"), /private/);
    assert.deepEqual(Buffer.from(await read.arrayBuffer()), png);

    const cached = await fetch(`${baseUrl}/api/v1/troupes/${troupe.id}/logo`, {
      headers: { "x-test-session": "judge", "if-none-match": `"${uploaded.logoSha256}"` },
    });
    assert.equal(cached.status, 304);

    // Baja del logo.
    const removed = await fetch(`${baseUrl}/api/v1/troupes/${troupe.id}/logo`, {
      method: "DELETE",
      headers: { "x-test-session": "admin" },
    });
    assert.equal(removed.status, 200);
    assert.equal((await removed.json()).hasLogo, false);

    const afterDelete = await fetch(`${baseUrl}/api/v1/troupes/${troupe.id}/logo`, {
      headers: { "x-test-session": "judge" },
    });
    assert.equal(afterDelete.status, 404);
  });
});
