import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createApp } from "../app.js";
import { closePool, getPool } from "../db/pool.js";
import { migrate } from "../db/migrate.js";
import { openEvent } from "../modules/events/event-readiness.service.js";
import { createEvent, createNight, deleteNight } from "../modules/events/event-service.js";
import { seedActiveJudge } from "./helpers/judge-fixture.js";

const originalDatabaseUrl = process.env.DATABASE_URL;

function restoreDatabaseUrl() {
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
    return;
  }
  process.env.DATABASE_URL = originalDatabaseUrl;
}

async function withServer(app, run) {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  try {
    const address = server.address();
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

test("DELETE /nights/:nightId borra solo jornadas sin historial y respeta evento abierto", {
  skip: !process.env.TEST_DATABASE_URL,
}, async (context) => {
  context.after(async () => {
    await closePool();
    restoreDatabaseUrl();
  });
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await migrate();

  const adminId = randomUUID();
  const pool = getPool();
  await pool.query(
    `INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, $2, $3, true)`,
    [adminId, "Night delete admin", `${adminId}@example.test`],
  );
  await pool.query("INSERT INTO user_role (user_id, role_code) VALUES ($1, 'ADMIN')", [adminId]);
  const app = createApp({
    getSession: async ({ headers }) => headers.get("x-test-session") === "admin"
      ? { user: { id: adminId, email: `${adminId}@example.test`, name: "Night delete admin", twoFactorEnabled: true } }
      : null,
  });
  const headers = { "content-type": "application/json", "x-test-session": "admin" };

  await withServer(app, async (baseUrl) => {
    const createEvent = await fetch(`${baseUrl}/api/v1/events`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Evento borrado jornadas" }),
    });
    assert.equal(createEvent.status, 201);
    const event = await createEvent.json();

    const createNight = await fetch(`${baseUrl}/api/v1/events/${event.id}/nights`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Limpia", displayOrder: 1, kind: "COMPETITION" }),
    });
    assert.equal(createNight.status, 201);
    const cleanNight = await createNight.json();

    // Jornada inexistente → 404.
    const missing = await fetch(`${baseUrl}/api/v1/nights/${randomUUID()}`, {
      method: "DELETE",
      headers: { "x-test-session": "admin" },
    });
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).code, "NIGHT_NOT_FOUND");

    // Jornada limpia → 200 y desaparece del listado.
    const remove = await fetch(`${baseUrl}/api/v1/nights/${cleanNight.id}`, {
      method: "DELETE",
      headers: { "x-test-session": "admin" },
    });
    assert.equal(remove.status, 200);
    assert.equal((await remove.json()).id, cleanNight.id);
    assert.deepEqual(
      (await pool.query("SELECT actor_user_id,action,entity_type,entity_id FROM audit_event WHERE action='NIGHT_DELETED' AND entity_id=$1 ORDER BY id DESC LIMIT 1", [cleanNight.id])).rows,
      [{ actor_user_id: adminId, action: "NIGHT_DELETED", entity_type: "night", entity_id: cleanNight.id }],
    );
    const listAfter = await fetch(`${baseUrl}/api/v1/events/${event.id}/nights`, {
      headers: { "x-test-session": "admin" },
    });
    assert.deepEqual((await listAfter.json()).map((night) => night.id), []);

    // Jornada con comparsa programada → 409 NIGHT_HAS_HISTORY.
    const createNight2 = await fetch(`${baseUrl}/api/v1/events/${event.id}/nights`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Programada", displayOrder: 1, kind: "COMPETITION" }),
    });
    assert.equal(createNight2.status, 201);
    const busyNight = await createNight2.json();
    const { rows: categories } = await pool.query(
      "INSERT INTO event_category(event_id,name,code,display_order) VALUES($1,'Tipo','TIPO_DEL',1) RETURNING id",
      [event.id],
    );
    const { rows: [troupe] } = await pool.query(
      "INSERT INTO event_troupe(event_id,category_id,name) VALUES($1,$2,'Comparsa') RETURNING id",
      [event.id, categories[0].id],
    );
    const program = await fetch(`${baseUrl}/api/v1/events/${event.id}/schedule`, {
      method: "POST",
      headers,
      body: JSON.stringify({ nightId: busyNight.id, troupeId: troupe.id }),
    });
    assert.equal(program.status, 201);
    const blocked = await fetch(`${baseUrl}/api/v1/nights/${busyNight.id}`, {
      method: "DELETE",
      headers: { "x-test-session": "admin" },
    });
    assert.equal(blocked.status, 409);
    assert.equal((await blocked.json()).code, "NIGHT_HAS_HISTORY");

    // Evento abierto → 409 EVENT_LOCKED aunque la jornada esté limpia.
    const createNight3 = await fetch(`${baseUrl}/api/v1/events/${event.id}/nights`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Otra", displayOrder: 2, kind: "COMPETITION" }),
    });
    assert.equal(createNight3.status, 201);
    const thirdNight = await createNight3.json();
    const { rows: specialties } = await pool.query(
      "INSERT INTO event_specialty(event_id,name,code,display_order) VALUES($1,'Baile','BAILE_DEL',1) RETURNING id",
      [event.id],
    );
    const { rows: rubrics } = await pool.query(
      "INSERT INTO rubric(event_id,name,code,evaluation_target) VALUES($1,'Rubro','RUBRO_DEL','TROUPE') RETURNING id",
      [event.id],
    );
    await pool.query(
      "INSERT INTO evaluation_item(event_id,rubric_id,specialty_id,name,code) VALUES($1,$2,$3,'Ítem','ITEM_DEL')",
      [event.id, rubrics[0].id, specialties[0].id],
    );
    const program2 = await fetch(`${baseUrl}/api/v1/events/${event.id}/schedule`, {
      method: "POST",
      headers,
      body: JSON.stringify({ nightId: thirdNight.id, troupeId: troupe.id }),
    });
    assert.equal(program2.status, 201);
    await seedActiveJudge({ client: pool, eventId: event.id, nightId: busyNight.id, specialtyId: specialties[0].id });
    await seedActiveJudge({ client: pool, eventId: event.id, nightId: thirdNight.id, specialtyId: specialties[0].id });
    const openEvent = await fetch(`${baseUrl}/api/v1/events/${event.id}/open`, {
      method: "POST",
      headers: { "x-test-session": "admin", "Idempotency-Key": randomUUID() },
    });
    assert.equal(openEvent.status, 200);
    const lockedDelete = await fetch(`${baseUrl}/api/v1/nights/${busyNight.id}`, {
      method: "DELETE",
      headers: { "x-test-session": "admin" },
    });
    assert.equal(lockedDelete.status, 409);
    assert.equal((await lockedDelete.json()).code, "EVENT_LOCKED");
  });
});

test("DELETE jornada delega por owner activo y conserva historia/auditoría", {
  skip: !process.env.TEST_DATABASE_URL,
}, async (context) => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await migrate();
  const pool = getPool();
  const ids = Object.fromEntries([
    "admin", "assigned", "revoked", "judge", "eventA", "eventB", "inactiveEvent",
    "cleanNight", "auditFailureNight", "historyNight", "otherNight", "inactiveNight",
  ].map((key) => [key, randomUUID()]));

  context.after(async () => {
    await pool.query("DELETE FROM night_troupe_schedule WHERE night_id = ANY($1::uuid[])", [[ids.cleanNight, ids.auditFailureNight, ids.historyNight, ids.otherNight, ids.inactiveNight]]).catch(() => {});
    await pool.query("DELETE FROM night WHERE id = ANY($1::uuid[])", [[ids.cleanNight, ids.auditFailureNight, ids.historyNight, ids.otherNight, ids.inactiveNight]]).catch(() => {});
    await pool.query("DELETE FROM event_troupe WHERE event_id = ANY($1::uuid[])", [[ids.eventA, ids.eventB, ids.inactiveEvent]]).catch(() => {});
    await pool.query("DELETE FROM event_category WHERE event_id = ANY($1::uuid[])", [[ids.eventA, ids.eventB, ids.inactiveEvent]]).catch(() => {});
    await pool.query("DELETE FROM admin_event_assignment WHERE user_id = ANY($1::text[])", [[ids.assigned, ids.revoked]]).catch(() => {});
    await pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [[ids.admin, ids.assigned, ids.revoked, ids.judge]]).catch(() => {});
    await pool.query("DELETE FROM carnival_event WHERE id = ANY($1::uuid[])", [[ids.eventA, ids.eventB, ids.inactiveEvent]]).catch(() => {});
    await closePool();
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  });

  await pool.query(
    `INSERT INTO "user"(id,name,email,"emailVerified") VALUES
      ($1,'Night delete ADMIN',$1 || '@example.test',true),
      ($2,'Night delete ADMIN_EVENT',$2 || '@example.test',true),
      ($3,'Night delete revoked',$3 || '@example.test',true),
      ($4,'Night delete JUDGE',$4 || '@example.test',true)`,
    [ids.admin, ids.assigned, ids.revoked, ids.judge],
  );
  await pool.query("INSERT INTO user_role(user_id,role_code) VALUES($1,'ADMIN'),($2,'JUDGE')", [ids.admin, ids.judge]);
  await pool.query(
    `INSERT INTO carnival_event(id,name,status,active) VALUES
      ($1,'T7 event A','CONFIGURING',true), ($2,'T7 event B','CONFIGURING',true),
      ($3,'T7 inactive event','CONFIGURING',false)`,
    [ids.eventA, ids.eventB, ids.inactiveEvent],
  );
  await pool.query(
    `INSERT INTO night(id,event_id,name,display_order,kind) VALUES
      ($1,$2,'T7 clean',1,'AWARDS'), ($3,$2,'T7 audit failure',2,'AWARDS'),
      ($4,$2,'T7 with schedule',3,'AWARDS'), ($5,$6,'T7 other event',1,'AWARDS'),
      ($7,$8,'T7 inactive event',1,'AWARDS')`,
    [ids.cleanNight, ids.eventA, ids.auditFailureNight, ids.historyNight, ids.otherNight, ids.eventB, ids.inactiveNight, ids.inactiveEvent],
  );
  await pool.query(
    `INSERT INTO admin_event_assignment(user_id,event_id,is_active) VALUES
      ($1,$2,true), ($1,$3,true), ($4,$2,false)`,
    [ids.assigned, ids.eventA, ids.inactiveEvent, ids.revoked],
  );
  const { rows: [category] } = await pool.query(
    "INSERT INTO event_category(event_id,name,code,display_order) VALUES($1,'T7 category','T7_CATEGORY',1) RETURNING id",
    [ids.eventA],
  );
  const { rows: [troupe] } = await pool.query(
    "INSERT INTO event_troupe(event_id,category_id,name) VALUES($1,$2,'T7 troupe') RETURNING id",
    [ids.eventA, category.id],
  );
  await pool.query(
    "INSERT INTO night_troupe_schedule(event_id,night_id,event_troupe_id,presentation_order) VALUES($1,$2,$3,1)",
    [ids.eventA, ids.historyNight, troupe.id],
  );

  const sessions = {
    admin: { user: { id: ids.admin, twoFactorEnabled: true } },
    assigned: { user: { id: ids.assigned, twoFactorEnabled: true } },
    revoked: { user: { id: ids.revoked, twoFactorEnabled: true } },
    judge: { user: { id: ids.judge, twoFactorEnabled: true } },
    noTwoFactor: { user: { id: ids.assigned, twoFactorEnabled: false } },
  };
  const app = createApp({ getSession: async ({ headers }) => sessions[headers.get("x-test-session")] ?? null });
  const snapshot = async () => Promise.all([
    pool.query("SELECT id,event_id,name FROM night WHERE id=ANY($1::uuid[]) ORDER BY id", [[ids.cleanNight, ids.auditFailureNight, ids.historyNight, ids.otherNight, ids.inactiveNight]]),
    pool.query("SELECT id,actor_user_id,action,entity_type,entity_id,before_data,after_data FROM audit_event ORDER BY id"),
  ]);

  await withServer(app, async (baseUrl) => {
    const request = (nightId, session, body = undefined) => fetch(`${baseUrl}/api/v1/nights/${nightId}`, {
      method: "DELETE",
      headers: {
        ...(session ? { "x-test-session": session } : {}),
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const beforeDenied = await snapshot();
    const denials = [
      [ids.otherNight, "assigned", { role: "ADMIN", userId: ids.admin }, 403, { code: "ADMIN_REQUIRED" }],
      [ids.inactiveNight, "assigned", undefined, 403, { code: "ADMIN_REQUIRED" }],
      [ids.cleanNight, "revoked", undefined, 403, { code: "ADMIN_REQUIRED" }],
      [ids.cleanNight, "judge", { role: "ADMIN", userId: ids.admin }, 403, { code: "ADMIN_REQUIRED" }],
      [ids.cleanNight, "noTwoFactor", undefined, 403, { code: "TWO_FACTOR_REQUIRED" }],
      [ids.cleanNight, null, undefined, 401, { code: "UNAUTHENTICATED" }],
      ["not-a-uuid", "admin", undefined, 400, { code: "VALIDATION_ERROR" }],
      [randomUUID(), "admin", undefined, 404, { code: "NIGHT_NOT_FOUND" }],
    ];
    for (const [nightId, session, body, status, expected] of denials) {
      const response = await request(nightId, session, body);
      assert.equal(response.status, status, `${session ?? "anonymous"} DELETE ${nightId}`);
      assert.deepEqual(await response.json(), expected);
    }
    const afterDenied = await snapshot();
    assert.deepEqual(afterDenied.map(({ rows }) => rows), beforeDenied.map(({ rows }) => rows));

    const history = await request(ids.historyNight, "assigned");
    assert.equal(history.status, 409);
    assert.equal((await history.json()).code, "NIGHT_HAS_HISTORY");
    assert.deepEqual((await snapshot()).map(({ rows }) => rows), beforeDenied.map(({ rows }) => rows));

    const connectDescriptor = Object.getOwnPropertyDescriptor(pool, "connect");
    const originalConnect = pool.connect;
    const restoreClientQueries = [];
    let injectedAuditFailureCount = 0;
    const wrapConnectedClient = (client) => {
      const queryDescriptor = Object.getOwnPropertyDescriptor(client, "query");
      const originalQuery = client.query;
      client.query = function (query, ...queryArgs) {
        if (typeof query === "string" && /^\s*INSERT\s+INTO\s+audit_event\b/i.test(query)) {
          injectedAuditFailureCount += 1;
          return Promise.reject(new Error("Injected audit persistence failure"));
        }
        return originalQuery.call(client, query, ...queryArgs);
      };
      restoreClientQueries.push(() => {
        if (queryDescriptor) Object.defineProperty(client, "query", queryDescriptor);
        else delete client.query;
      });
      return client;
    };
    pool.connect = (...args) => {
      const callback = args[0];
      if (typeof callback === "function") {
        return originalConnect.call(pool, (error, client, release) => {
          if (!error) wrapConnectedClient(client);
          callback(error, client, release);
        });
      }
      return originalConnect.call(pool).then(wrapConnectedClient);
    };
    try {
      const auditFailure = await request(ids.auditFailureNight, "assigned");
      assert.ok(auditFailure.status >= 400, `fallo de auditoría no debe devolver éxito; HTTP ${auditFailure.status}`);
      assert.equal(injectedAuditFailureCount, 1);
    } finally {
      if (connectDescriptor) Object.defineProperty(pool, "connect", connectDescriptor);
      else delete pool.connect;
      for (const restore of restoreClientQueries) restore();
    }
    assert.equal((await pool.query("SELECT id FROM night WHERE id=$1", [ids.auditFailureNight])).rowCount, 1);
    assert.equal((await pool.query("SELECT id FROM audit_event WHERE action='NIGHT_DELETED' AND entity_id=$1", [ids.auditFailureNight])).rowCount, 0);

    const deleted = await request(ids.cleanNight, "assigned", { actorUserId: ids.admin });
    assert.equal(deleted.status, 200);
    assert.deepEqual(await deleted.json(), { id: ids.cleanNight });
    assert.equal((await pool.query("SELECT id FROM night WHERE id=$1", [ids.cleanNight])).rowCount, 0);
    assert.deepEqual(
      (await pool.query("SELECT actor_user_id,action,entity_type,entity_id FROM audit_event WHERE action='NIGHT_DELETED' AND entity_id=$1 ORDER BY id DESC LIMIT 1", [ids.cleanNight])).rows,
      [{ actor_user_id: ids.assigned, action: "NIGHT_DELETED", entity_type: "night", entity_id: ids.cleanNight }],
    );
  });
});

test("DELETE ADMIN_EVENT conserva bloqueos de historial y estado OPEN", {
  skip: !process.env.TEST_DATABASE_URL,
}, async (context) => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await migrate();
  const pool = getPool();
  const client = await pool.connect();
  const actorId = randomUUID();
  const originalConnect = pool.connect;
  let connectDescriptor;

  context.after(async () => {
    if (connectDescriptor) Object.defineProperty(pool, "connect", connectDescriptor);
    else delete pool.connect;
    await client.query("ROLLBACK").catch(() => {});
    client.release();
    await closePool();
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  });

  await client.query("BEGIN");
  await client.query(
    `INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,'T7 history ADMIN_EVENT',$2,true)`,
    [actorId, `${actorId}@example.test`],
  );
  const configEvent = await createEvent({ client, name: `T7 blockers ${randomUUID()}` });
  const nightIds = {};
  for (const key of ["assignment", "quota", "ballot", "schedule", "penalty", "window"]) {
    const night = await createNight({
      client,
      eventId: configEvent.id,
      name: `T7 ${key}`,
      displayOrder: Object.keys(nightIds).length + 1,
      kind: key === "window" ? "AWARDS" : "COMPETITION",
    });
    nightIds[key] = night.id;
  }

  const { rows: [category] } = await client.query(
    "INSERT INTO event_category(event_id,name,code,display_order) VALUES($1,'T7 blocker category',$2,1) RETURNING id",
    [configEvent.id, `T7CAT_${randomUUID().replaceAll('-', '').slice(0, 12)}`],
  );
  const { rows: [troupe] } = await client.query(
    "INSERT INTO event_troupe(event_id,category_id,name) VALUES($1,$2,'T7 blocker troupe') RETURNING id",
    [configEvent.id, category.id],
  );
  const { rows: [specialty] } = await client.query(
    "INSERT INTO event_specialty(event_id,name,code,display_order) VALUES($1,'T7 blocker specialty',$2,1) RETURNING id",
    [configEvent.id, `T7SPEC_${randomUUID().replaceAll('-', '').slice(0, 12)}`],
  );
  await client.query(
    "INSERT INTO admin_event_assignment(user_id,event_id,is_active) VALUES($1,$2,true)",
    [actorId, configEvent.id],
  );
  await client.query(
    "INSERT INTO judge_quota(event_id,night_id,specialty_id,max_assignments) VALUES($1,$2,$3,1)",
    [configEvent.id, nightIds.quota, specialty.id],
  );
  const judge = await seedActiveJudge({
    client,
    eventId: configEvent.id,
    nightId: nightIds.ballot,
    specialtyId: specialty.id,
    adminId: actorId,
  });
  await client.query(
    `INSERT INTO judge_assignment(event_id,night_id,specialty_id,judge_profile_id,status,reason,revoked_at,revoked_by)
     VALUES($1,$2,$3,$4,'REVOKED','T7 blocker fixture',CURRENT_TIMESTAMP,$5)`,
    [configEvent.id, nightIds.assignment, specialty.id, judge.profileId, actorId],
  );
  await client.query(
    `INSERT INTO ballot(event_id,night_id,judge_assignment_id,judge_profile_id,specialty_id)
     VALUES($1,$2,$3,$4,$5)`,
    [configEvent.id, nightIds.ballot, judge.assignmentId, judge.profileId, specialty.id],
  );
  await client.query(
    "INSERT INTO night_troupe_schedule(event_id,night_id,event_troupe_id,presentation_order) VALUES($1,$2,$3,1)",
    [configEvent.id, nightIds.schedule, troupe.id],
  );
  const { rows: [penaltyNight] } = await client.query(
    "UPDATE night SET kind='COMPETITION' WHERE id=$1 RETURNING id",
    [nightIds.penalty],
  );
  await client.query(
    `INSERT INTO troupe_penalty(event_id,night_id,event_troupe_id,reason,penalty_points,applied_by_user_id)
     VALUES($1,$2,$3,'T7 blocker fixture',1,$4)`,
    [configEvent.id, penaltyNight.id, troupe.id, actorId],
  );
  await client.query(
    "INSERT INTO voting_window(event_id,night_id,status,closed_at) VALUES($1,$2,'CLOSED',CURRENT_TIMESTAMP)",
    [configEvent.id, nightIds.window],
  );

  const openEventRecord = await createEvent({ client, name: `T7 open blocker ${randomUUID()}` });
  const openNight = await createNight({ client, eventId: openEventRecord.id, name: "T7 open night", displayOrder: 1, kind: "COMPETITION" });
  await client.query(
    "INSERT INTO admin_event_assignment(user_id,event_id,is_active) VALUES($1,$2,true)",
    [actorId, openEventRecord.id],
  );
  const { rows: [openCategory] } = await client.query(
    "INSERT INTO event_category(event_id,name,code,display_order) VALUES($1,'T7 open category',$2,1) RETURNING id",
    [openEventRecord.id, `OPEN_CAT_${randomUUID().replaceAll('-', '').slice(0, 8)}`],
  );
  const { rows: [openTroupe] } = await client.query(
    "INSERT INTO event_troupe(event_id,category_id,name) VALUES($1,$2,'T7 open troupe') RETURNING id",
    [openEventRecord.id, openCategory.id],
  );
  await client.query(
    "INSERT INTO night_troupe_schedule(event_id,night_id,event_troupe_id,presentation_order) VALUES($1,$2,$3,1)",
    [openEventRecord.id, openNight.id, openTroupe.id],
  );
  const { rows: [openSpecialty] } = await client.query(
    "INSERT INTO event_specialty(event_id,name,code,display_order) VALUES($1,'T7 open specialty',$2,1) RETURNING id",
    [openEventRecord.id, `OPEN_SPEC_${randomUUID().replaceAll('-', '').slice(0, 8)}`],
  );
  const { rows: [rubric] } = await client.query(
    "INSERT INTO rubric(event_id,name,code,evaluation_target) VALUES($1,'T7 open rubric',$2,'TROUPE') RETURNING id",
    [openEventRecord.id, `OPEN_RUB_${randomUUID().replaceAll('-', '').slice(0, 8)}`],
  );
  await client.query(
    "INSERT INTO evaluation_item(event_id,rubric_id,specialty_id,name,code) VALUES($1,$2,$3,'T7 open item',$4)",
    [openEventRecord.id, rubric.id, openSpecialty.id, `OPEN_ITEM_${randomUUID().replaceAll('-', '').slice(0, 8)}`],
  );
  await seedActiveJudge({
    client,
    eventId: openEventRecord.id,
    nightId: openNight.id,
    specialtyId: openSpecialty.id,
    adminId: actorId,
  });
  await openEvent({ client, eventId: openEventRecord.id, actorUserId: actorId });

  connectDescriptor = Object.getOwnPropertyDescriptor(pool, "connect");
  pool.connect = async (...args) => {
    if (args.length) return originalConnect.call(pool, ...args);
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
    const snapshot = async () => Promise.all([
      client.query("SELECT id,event_id,name FROM night ORDER BY event_id,id"),
      client.query("SELECT id,actor_user_id,action,entity_type,entity_id,before_data,after_data FROM audit_event ORDER BY id"),
    ]);
    const before = await snapshot();
    for (const nightId of Object.values(nightIds)) {
      const response = await fetch(`${baseUrl}/api/v1/nights/${nightId}`, {
        method: "DELETE",
        headers: { "x-test-session": "assigned" },
      });
      assert.equal(response.status, 409, `historial de ${nightId}: ${await response.clone().text()}`);
      assert.equal((await response.json()).code, "NIGHT_HAS_HISTORY");
    }
    const openResponse = await fetch(`${baseUrl}/api/v1/nights/${openNight.id}`, {
      method: "DELETE",
      headers: { "x-test-session": "assigned" },
    });
    assert.equal(openResponse.status, 409);
    assert.equal((await openResponse.json()).code, "EVENT_LOCKED");
    const after = await snapshot();
    assert.deepEqual(after.map(({ rows }) => rows), before.map(({ rows }) => rows));
  });
});

test("deleteNight bloquea una planilla sin depender de otros historiales", async () => {
  const nightId = randomUUID();
  const queriedBlockers = [];
  const client = {
    async query(sql) {
      if (sql.includes("FROM night n JOIN carnival_event e")) {
        return { rows: [{ id: nightId, name: "T7 ballot isolation", eventId: randomUUID(), eventStatus: "CONFIGURING" }] };
      }
      const blocker = ["ballot", "judge_assignment", "judge_quota", "night_troupe_schedule", "troupe_penalty", "voting_window"]
        .find((table) => sql.includes(`FROM ${table} WHERE night_id = $1`));
      if (blocker) {
        queriedBlockers.push(blocker);
        return { rows: [{ n: blocker === "ballot" ? 1 : 0 }] };
      }
      if (/^DELETE FROM night\b/i.test(sql)) throw new Error("deleteNight no debe intentar borrar una jornada con ballot");
      throw new Error(`Consulta inesperada en fake client: ${sql}`);
    },
  };

  await assert.rejects(
    deleteNight({ client, nightId, actorUserId: randomUUID() }),
    { message: "NIGHT_HAS_HISTORY" },
  );
  assert.deepEqual(queriedBlockers, ["ballot"]);
});
