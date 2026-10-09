import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createApp } from "../app.js";
import { closePool, getPool } from "../db/pool.js";
import { migrate } from "../db/migrate.js";
import { openEvent } from "../modules/events/event-readiness.service.js";
import { createEvent, createNight } from "../modules/events/event-service.js";
import { seedActiveJudge } from "./helpers/judge-fixture.js";

function withServer(app, run) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", async () => {
      try {
        await run(`http://127.0.0.1:${server.address().port}`);
        resolve();
      } catch (error) {
        reject(error);
      } finally {
        server.close((error) => error && reject(error));
      }
    });
  });
}

test("PATCH jornada autoriza ADMIN_EVENT por owner persistido y mantiene auditoría", {
  skip: !process.env.TEST_DATABASE_URL,
}, async (context) => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await migrate();
  const pool = getPool();
  const ids = Object.fromEntries([
    "admin", "assigned", "revoked", "judge", "eventA", "eventB", "inactiveEvent", "nightA", "nightB", "nightInactive",
  ].map((key) => [key, randomUUID()]));

  context.after(async () => {
    await pool.query("DELETE FROM night WHERE id = ANY($1::uuid[])", [[ids.nightA, ids.nightB, ids.nightInactive]]);
    await pool.query("DELETE FROM admin_event_assignment WHERE user_id = ANY($1::text[])", [[ids.assigned, ids.revoked]]);
    await pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [[ids.admin, ids.assigned, ids.revoked, ids.judge]]);
    await pool.query("DELETE FROM carnival_event WHERE id = ANY($1::uuid[])", [[ids.eventA, ids.eventB, ids.inactiveEvent]]);
    await closePool();
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  });

  await pool.query(
    `INSERT INTO "user" (id, name, email, "emailVerified")
     SELECT id, 'T6 fixture', id || '@example.test', true FROM unnest($1::text[]) AS id`,
    [[ids.admin, ids.assigned, ids.revoked, ids.judge]],
  );
  await pool.query("INSERT INTO user_role (user_id, role_code) VALUES ($1, 'ADMIN'), ($2, 'JUDGE')", [ids.admin, ids.judge]);
  await pool.query(
    `INSERT INTO carnival_event (id, name, status, active) VALUES
     ($1, 'T6 event A', 'CONFIGURING', true), ($2, 'T6 event B', 'CONFIGURING', true),
     ($3, 'T6 inactive event', 'CONFIGURING', false)`,
    [ids.eventA, ids.eventB, ids.inactiveEvent],
  );
  await pool.query(
    `INSERT INTO night (id, event_id, name, display_order, kind) VALUES
     ($1, $2, 'T6 night A', 1, 'COMPETITION'), ($3, $4, 'T6 night B', 1, 'AWARDS'),
     ($5, $6, 'T6 inactive night', 1, 'AWARDS')`,
    [ids.nightA, ids.eventA, ids.nightB, ids.eventB, ids.nightInactive, ids.inactiveEvent],
  );
  await pool.query(
    `INSERT INTO admin_event_assignment (user_id, event_id, is_active) VALUES
     ($1, $2, true), ($1, $3, true), ($4, $2, false)`,
    [ids.assigned, ids.eventA, ids.inactiveEvent, ids.revoked],
  );

  const sessions = {
    admin: { user: { id: ids.admin, twoFactorEnabled: true } },
    assigned: { user: { id: ids.assigned, twoFactorEnabled: true } },
    revoked: { user: { id: ids.revoked, twoFactorEnabled: true } },
    judge: { user: { id: ids.judge, twoFactorEnabled: true } },
    noTwoFactor: { user: { id: ids.assigned, twoFactorEnabled: false } },
  };
  const app = createApp({ getSession: async ({ headers }) => sessions[headers.get("x-test-session")] ?? null });

  await withServer(app, async (baseUrl) => {
    const request = (nightId, session, body) => fetch(`${baseUrl}/api/v1/nights/${nightId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...(session ? { "x-test-session": session } : {}) },
      body: JSON.stringify(body),
    });
    const update = {
      name: "T6 authorized update", displayOrder: 2, kind: "COMPETITION", eventDate: "2027-02-06",
      eventId: ids.eventB, nightId: ids.nightB, actorUserId: ids.admin, role: "ADMIN", userId: ids.admin,
    };
    const delegated = await request(ids.nightA, "assigned", update);
    assert.equal(delegated.status, 200, `authorized ADMIN_EVENT unexpectedly received ${delegated.status}: ${await delegated.clone().text()}`);
    const delegatedBody = await delegated.json();
    assert.deepEqual(delegatedBody, {
      id: ids.nightA, eventId: ids.eventA, name: "T6 authorized update", displayOrder: 2,
      kind: "COMPETITION", status: "DRAFT", eventDate: "2027-02-06",
    });
    assert.deepEqual(
      (await pool.query(`SELECT id, event_id AS "eventId", name, display_order AS "displayOrder", kind, status, event_date AS "eventDate"
                           FROM night WHERE id=$1`, [ids.nightA])).rows,
      [delegatedBody],
    );
    assert.deepEqual(
      (await pool.query(`SELECT actor_user_id AS "actorUserId", action, entity_type AS "entityType", entity_id AS "entityId"
                           FROM audit_event WHERE action='NIGHT_UPDATED' AND entity_id=$1 ORDER BY id DESC LIMIT 1`, [ids.nightA])).rows,
      [{ actorUserId: ids.assigned, action: "NIGHT_UPDATED", entityType: "night", entityId: ids.nightA }],
    );
    assert.deepEqual(
      (await pool.query("SELECT id, name FROM night WHERE id = ANY($1::uuid[]) ORDER BY id", [[ids.nightA, ids.nightB]])).rows,
      [{ id: ids.nightA, name: "T6 authorized update" }, { id: ids.nightB, name: "T6 night B" }].sort((a, b) => a.id.localeCompare(b.id)),
      "nightId del body no debe desviar la escritura desde el ID de la ruta",
    );

    const snapshot = async () => Promise.all([
      pool.query("SELECT id, event_id, name, display_order, kind, status, event_date FROM night WHERE id = ANY($1::uuid[]) ORDER BY id", [[ids.nightA, ids.nightB, ids.nightInactive]]),
      pool.query("SELECT id, actor_user_id, action, entity_type, entity_id, before_data, after_data FROM audit_event ORDER BY id"),
    ]);
    const beforeDenied = await snapshot();
    const deniedCases = [
      [ids.nightB, "assigned", { ...update, eventId: ids.eventA }, 403, { code: "ADMIN_REQUIRED" }],
      [ids.nightB, "assigned", { ...update, eventId: ids.eventB }, 403, { code: "ADMIN_REQUIRED" }],
      [ids.nightInactive, "assigned", { ...update, eventId: ids.eventA }, 403, { code: "ADMIN_REQUIRED" }],
      [ids.nightA, "revoked", update, 403, { code: "ADMIN_REQUIRED" }],
      [ids.nightA, "judge", { ...update, role: "ADMIN", userId: ids.admin }, 403, { code: "ADMIN_REQUIRED" }],
      [ids.nightA, "noTwoFactor", update, 403, { code: "TWO_FACTOR_REQUIRED" }],
      [ids.nightA, null, update, 401, { code: "UNAUTHENTICATED" }],
      ["not-a-uuid", "admin", update, 400, { code: "VALIDATION_ERROR" }],
      [randomUUID(), "admin", update, 404, { code: "NIGHT_NOT_FOUND" }],
      [randomUUID(), "assigned", update, 403, { code: "ADMIN_REQUIRED" }],
      [ids.nightA, "assigned", { ...update, name: " " }, 400, { code: "VALIDATION_ERROR", message: "name debe ser texto no vacío." }],
    ];
    for (const [nightId, session, body, status, expected] of deniedCases) {
      const response = await request(nightId, session, body);
      assert.equal(response.status, status, `${session ?? "anonymous"} PATCH ${nightId}`);
      assert.deepEqual(await response.json(), expected);
    }
    const afterDenied = await snapshot();
    assert.deepEqual(afterDenied.map(({ rows }) => rows), beforeDenied.map(({ rows }) => rows));

    const globalUpdate = await request(ids.nightB, "admin", {
      name: "T6 ADMIN update", displayOrder: 3, kind: "AWARDS", eventDate: null,
      eventId: ids.eventA,
    });
    assert.equal(globalUpdate.status, 200);
    assert.deepEqual(await globalUpdate.json(), {
      id: ids.nightB, eventId: ids.eventB, name: "T6 ADMIN update", displayOrder: 3,
      kind: "AWARDS", status: "DRAFT", eventDate: null,
    });
    assert.equal(
      (await pool.query("SELECT actor_user_id FROM audit_event WHERE action='NIGHT_UPDATED' AND entity_id=$1 ORDER BY id DESC LIMIT 1", [ids.nightB])).rows[0].actor_user_id,
      ids.admin,
    );

  });
});

test("PATCH cierre final atribuye EVENT_CLOSED al usuario de sesión, no al body", {
  skip: !process.env.TEST_DATABASE_URL,
}, async (context) => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await migrate();
  const pool = getPool();
  const client = await pool.connect();
  const actorId = randomUUID();
  const spoofedAdminId = randomUUID();
  const eventName = `T6 close actor ${randomUUID()}`;
  let server;
  const originalConnect = pool.connect;

  context.after(async () => {
    pool.connect = originalConnect;
    await client.query("ROLLBACK").catch(() => {});
    client.release();
    await closePool();
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  });

  await client.query("BEGIN");
  await client.query(
    `INSERT INTO "user" (id, name, email, "emailVerified") VALUES
      ($1, 'ADMIN_EVENT fixture', $2, true), ($3, 'ADMIN spoof fixture', $4, true)`,
    [actorId, `${actorId}@example.test`, spoofedAdminId, `${spoofedAdminId}@example.test`],
  );
  await client.query("INSERT INTO user_role(user_id,role_code) VALUES($1,'ADMIN')", [spoofedAdminId]);
  const event = await createEvent({ client, name: eventName });
  const night = await createNight({ client, eventId: event.id, name: "T6 final night", displayOrder: 1, kind: "COMPETITION" });
  await client.query("INSERT INTO admin_event_assignment(user_id,event_id,is_active) VALUES($1,$2,true)", [actorId, event.id]);
  const { rows: [category] } = await client.query(
    "INSERT INTO event_category(event_id,name,code,display_order) VALUES($1,'T6 close category',$2,1) RETURNING id",
    [event.id, `CAT_${randomUUID().replaceAll('-', '').slice(0, 12)}`],
  );
  const { rows: [troupe] } = await client.query(
    "INSERT INTO event_troupe(event_id,category_id,name) VALUES($1,$2,'T6 close troupe') RETURNING id",
    [event.id, category.id],
  );
  await client.query(
    "INSERT INTO night_troupe_schedule(event_id,night_id,event_troupe_id,presentation_order) VALUES($1,$2,$3,1)",
    [event.id, night.id, troupe.id],
  );
  const { rows: [specialty] } = await client.query(
    "INSERT INTO event_specialty(event_id,name,code,display_order) VALUES($1,'T6 close specialty',$2,1) RETURNING id",
    [event.id, `SPEC_${randomUUID().replaceAll('-', '').slice(0, 12)}`],
  );
  const { rows: [rubric] } = await client.query(
    "INSERT INTO rubric(event_id,name,code,evaluation_target) VALUES($1,'T6 close rubric',$2,'TROUPE') RETURNING id",
    [event.id, `RUB_${randomUUID().replaceAll('-', '').slice(0, 12)}`],
  );
  await client.query(
    "INSERT INTO evaluation_item(event_id,rubric_id,specialty_id,name,code) VALUES($1,$2,$3,'T6 close item',$4)",
    [event.id, rubric.id, specialty.id, `ITEM_${randomUUID().replaceAll('-', '').slice(0, 12)}`],
  );
  await seedActiveJudge({ client, eventId: event.id, nightId: night.id, specialtyId: specialty.id, adminId: spoofedAdminId });
  await openEvent({ client, eventId: event.id, actorUserId: spoofedAdminId });
  await client.query("UPDATE night SET status='OPEN' WHERE id=$1", [night.id]);
  await client.query(
    "INSERT INTO voting_window(event_id,night_id,status,closed_at) VALUES($1,$2,'CLOSED',CURRENT_TIMESTAMP)",
    [event.id, night.id],
  );

  pool.connect = async (...args) => {
    if (args.length) return originalConnect(...args);
    return {
      query: (sql, values) => {
        if (sql === "BEGIN") return client.query("SAVEPOINT route_transaction");
        if (sql === "COMMIT") return client.query("RELEASE SAVEPOINT route_transaction");
        if (sql === "ROLLBACK") return client.query("ROLLBACK TO SAVEPOINT route_transaction")
          .then(() => client.query("RELEASE SAVEPOINT route_transaction"));
        return client.query(sql, values);
      },
      release() {},
    };
  };

  const app = createApp({ getSession: async ({ headers }) => headers.get("x-test-session") === "assigned"
    ? { user: { id: actorId, twoFactorEnabled: true } }
    : null });
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/nights/${night.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-test-session": "assigned" },
      body: JSON.stringify({
        name: night.name, displayOrder: night.displayOrder, kind: night.kind,
        eventDate: null, status: "CLOSED", actorUserId: spoofedAdminId,
      }),
    });
    assert.equal(response.status, 200, `el cierre final debe completar: ${await response.clone().text()}`);
  });
  server = null;
  const { rows: [closureAudit] } = await client.query(
    "SELECT actor_user_id FROM audit_event WHERE action='EVENT_CLOSED' AND entity_id=$1 ORDER BY id DESC LIMIT 1",
    [event.id],
  );
  assert.equal(closureAudit.actor_user_id, actorId);
});
