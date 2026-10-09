import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import test from "node:test";
import { createApp } from "../app.js";
import { closePool, getPool } from "../db/pool.js";
import { migrate } from "../db/migrate.js";
import { seedActiveJudge } from "./helpers/judge-fixture.js";

test("GET readiness autoriza el evento exacto y conserva el contrato completo sin mutaciones", {
  skip: !process.env.TEST_DATABASE_URL,
}, async (context) => {
  const original = process.env.DATABASE_URL;
  context.after(async () => {
    await closePool();
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
  });
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await migrate();
  const pool = getPool();
  const ids = Object.fromEntries([
    "admin", "assigned", "other", "unassigned", "revoked", "judge", "eventA", "eventB", "foreignEvent", "missing",
  ].map((key) => [key, randomUUID()]));
  const userIds = [ids.admin, ids.assigned, ids.other, ids.unassigned, ids.revoked, ids.judge];
  await pool.query(
    `INSERT INTO "user"(id,name,email,"emailVerified")
     SELECT id, 'T3 readiness fixture', id || '@example.test', true FROM unnest($1::text[]) AS id`,
    [userIds],
  );
  await pool.query("INSERT INTO user_role(user_id,role_code) VALUES($1,'ADMIN'),($2,'JUDGE')", [ids.admin, ids.judge]);
  await pool.query(
    `INSERT INTO carnival_event(id,name) VALUES($1,'T3 readiness A'),($2,'T3 readiness B'),($3,'T3 foreign')`,
    [ids.eventA, ids.eventB, ids.foreignEvent],
  );
  await pool.query(
    `INSERT INTO admin_event_assignment(user_id,event_id,is_active) VALUES
     ($1,$2,true),($1,$3,true),($4,$5,true),($6,$2,false)`,
    [ids.assigned, ids.eventA, ids.eventB, ids.other, ids.foreignEvent, ids.revoked],
  );
  const sessions = Object.fromEntries(userIds.map((id) => [id, { user: { id, twoFactorEnabled: true } }]));
  sessions.noTwoFactor = { user: { id: ids.assigned, twoFactorEnabled: false } };
  // The session boundary simulates Better Auth's absent/expired session result, not real expiry.
  sessions.expired = null;
  const app = createApp({ getSession: async ({ headers }) => sessions[headers.get("x-test-session")] ?? null });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const snapshot = async () => {
      // Fixed table names only. Fingerprint every row/column, including evidence from other events.
      const tables = [
        "carnival_event", "admin_event_assignment", "user_role", "night", "event_category", "event_troupe",
        "event_specialty", "rubric", "evaluation_item", "rubric_criterion", "troupe_nomination",
        "night_troupe_schedule", "judge_assignment", "judge_quota", "ballot", "ballot_score", "ballot_audit_log",
        "voting_window", "audit_event", "event_open_operation_claim", "event_open_operation_receipt",
      ];
      return Promise.all(tables.map(async (table) => (await pool.query(
        `SELECT md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text, '[]')) AS digest FROM ${table} t`,
      )).rows));
    };
    const expectResponse = async (eventId, session, status, expected, { body, headers = {} } = {}) => {
      const before = await snapshot();
      const payload = body === undefined ? undefined : JSON.stringify(body);
      // node:http permits an untrusted GET body, unlike fetch.
      const result = await new Promise((resolve, reject) => {
        const req = httpRequest(`${base}/api/v1/events/${eventId}/readiness?role=ADMIN&userId=${ids.admin}&eventId=${ids.eventA}&active=true&search=all`, {
          method: "GET",
          headers: {
            ...(session ? { "x-test-session": session } : {}),
            ...(payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {}),
            ...headers,
          },
        }, (res) => {
          let text = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => { text += chunk; });
          res.on("error", reject);
          res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, text }));
        });
        req.on("error", reject);
        req.end(payload);
      });
      assert.deepEqual(await snapshot(), before, "each readiness GET, rejection and failure must be read-only");
      assert.equal(result.headers["cache-control"], "no-store, private");
      assert.equal(result.status, status, `${session ?? "anonymous"} GET readiness ${eventId}`);
      assert.deepEqual(JSON.parse(result.text), expected); // Entire DTO, no field projection.
      return result;
    };
    const empty = {
      ready: false,
      missing: ["COMPETITION_NIGHT", "ACTIVE_TROUPE", "ACTIVE_SPECIALTY", "ACTIVE_RUBRIC"],
      incompleteTroupes: [], incompleteRubrics: [], incompleteSchedules: [], incompleteNominations: [], nightsWithoutJury: [],
      humanMessages: ["No existe ninguna jornada de competencia configurada", "No hay comparsas activas registradas",
        "No hay especialidades activas configuradas", "No existe ningún rubro activo"],
    };
    // No global role for the delegate; ADMIN initially has no assignment.
    await expectResponse(ids.eventA, ids.assigned, 200, empty);
    await expectResponse(ids.eventA, ids.admin, 200, empty);
    await expectResponse(ids.eventB, ids.assigned, 200, empty);

    for (const session of [ids.other, ids.unassigned, ids.revoked, ids.judge]) {
      for (const eventId of [ids.eventA, ids.missing]) {
        await expectResponse(eventId, session, 403, { code: "ADMIN_REQUIRED" });
      }
    }
    await expectResponse(ids.foreignEvent, ids.assigned, 403, { code: "ADMIN_REQUIRED" });
    await expectResponse(ids.missing, ids.assigned, 403, { code: "ADMIN_REQUIRED" });
    await expectResponse(ids.missing, ids.admin, 404, { code: "EVENT_NOT_FOUND" });
    for (const eventId of [ids.eventA, ids.missing, "not-a-uuid"]) {
      await expectResponse(eventId, null, 401, { code: "UNAUTHENTICATED" });
      await expectResponse(eventId, "expired", 401, { code: "UNAUTHENTICATED" });
      await expectResponse(eventId, "noTwoFactor", 403, { code: "TWO_FACTOR_REQUIRED" });
    }
    for (const session of [ids.admin, ids.assigned, ids.unassigned]) {
      await expectResponse("not-a-uuid", session, 400, { code: "VALIDATION_ERROR" });
    }
    const spoof = {
      body: { userId: ids.admin, role: "ADMIN", roles: ["ADMIN"], eventId: ids.eventA, is_active: true, twoFactorEnabled: true },
      headers: { "x-user-id": ids.admin, "x-role": "ADMIN", "x-event-id": ids.eventA },
    };
    await expectResponse(ids.foreignEvent, ids.assigned, 403, { code: "ADMIN_REQUIRED" }, spoof);
    await expectResponse(ids.eventA, ids.unassigned, 403, { code: "ADMIN_REQUIRED" }, spoof);
    await expectResponse(ids.eventA, "noTwoFactor", 403, { code: "TWO_FACTOR_REQUIRED" }, spoof);

    // Real configuration exercising every detail list; AWARDS does not need a jury/schedule.
    const { rows: [night1, night2] } = await pool.query(
      `INSERT INTO night(event_id,name,display_order,kind) VALUES
       ($1,'T3 Noche 1',1,'COMPETITION'),($1,'T3 Noche 2',2,'COMPETITION'),($1,'T3 Premios',3,'AWARDS') RETURNING id`,
      [ids.eventA],
    );
    const { rows: [category] } = await pool.query(
      "INSERT INTO event_category(event_id,name,code,display_order) VALUES($1,'T3 Cat','CAT',1) RETURNING id", [ids.eventA],
    );
    const { rows: [troupe] } = await pool.query(
      "INSERT INTO event_troupe(event_id,category_id,name) VALUES($1,$2,'T3 Comparsa') RETURNING id", [ids.eventA, category.id],
    );
    const { rows: [specialty] } = await pool.query(
      `INSERT INTO event_specialty(event_id,name,code,display_order) VALUES
       ($1,'T3 Baile','BAILE',1),($1,'T3 Musica sin jurado','MUSICA',2) RETURNING id`, [ids.eventA],
    );
    const { rows: [rubric] } = await pool.query(
      "INSERT INTO rubric(event_id,name,code,evaluation_target) VALUES($1,'T3 sin items','SIN_ITEMS','TROUPE') RETURNING id", [ids.eventA],
    );
    const { rows: [nominationRubric] } = await pool.query(
      `INSERT INTO rubric(event_id,name,code,evaluation_target,expected_subject_type)
       VALUES($1,'T3 Nominativo','NOM','NOMINATION','PERSON') RETURNING id`, [ids.eventA],
    );
    await pool.query(
      "INSERT INTO evaluation_item(event_id,rubric_id,specialty_id,name,code) VALUES($1,$2,$3,'T3 Item','ITEM')",
      [ids.eventA, nominationRubric.id, specialty.id],
    );
    await pool.query(
      "INSERT INTO night_troupe_schedule(event_id,night_id,event_troupe_id,presentation_order) VALUES($1,$2,$3,1)",
      [ids.eventA, night1.id, troupe.id],
    );
    await seedActiveJudge({ client: pool, eventId: ids.eventA, nightId: night1.id, specialtyId: specialty.id });
    await pool.query("UPDATE event_category SET active=false WHERE id=$1", [category.id]);
    const incomplete = {
      ready: false, missing: ["INCOMPLETE_SCHEDULES", "INCOMPLETE_NOMINATIONS", "NIGHTS_WITHOUT_JURY"],
      incompleteTroupes: [{ id: troupe.id, name: "T3 Comparsa" }],
      incompleteRubrics: [{ id: rubric.id, name: "T3 sin items", code: "SIN_ITEMS" }],
      incompleteSchedules: [{ nightId: night2.id, nightName: "T3 Noche 2" }],
      incompleteNominations: [{ rubricId: nominationRubric.id, rubricName: "T3 Nominativo", troupeId: troupe.id, troupeName: "T3 Comparsa" }],
      nightsWithoutJury: [{ nightId: night2.id, nightName: "T3 Noche 2", displayOrder: 2 }],
      humanMessages: ["Una o más jornadas no tienen comparsas programadas en el orden de pasada",
        "Faltan participantes nominados en rubros o comparsas", "Hay jornadas de competencia sin jurado asignado"],
    };
    const checkBoth = async (expected) => {
      for (const active of [true, false]) {
        await pool.query("UPDATE carnival_event SET active=$2 WHERE id=$1", [ids.eventA, active]);
        await expectResponse(ids.eventA, ids.admin, 200, expected);
        await expectResponse(ids.eventA, ids.assigned, 200, expected);
      }
      await pool.query("UPDATE carnival_event SET active=true WHERE id=$1", [ids.eventA]);
    };
    await checkBoth(incomplete);
    // Even identifiers/names in nested detail arrays must never be disclosed to an outsider.
    await expectResponse(ids.eventA, ids.other, 403, { code: "ADMIN_REQUIRED" }, spoof);
    await expectResponse(ids.eventB, ids.assigned, 200, empty, spoof);

    await pool.query("UPDATE event_category SET active=true WHERE id=$1", [category.id]);
    await pool.query(
      "INSERT INTO night_troupe_schedule(event_id,night_id,event_troupe_id,presentation_order) VALUES($1,$2,$3,1)",
      [ids.eventA, night2.id, troupe.id],
    );
    await seedActiveJudge({ client: pool, eventId: ids.eventA, nightId: night2.id, specialtyId: specialty.id });
    await pool.query(
      `INSERT INTO troupe_nomination(event_id,event_troupe_id,rubric_id,subject_type,display_name)
       VALUES($1,$2,$3,'PERSON','T3 Participante')`, [ids.eventA, troupe.id, nominationRubric.id],
    );
    await pool.query("UPDATE event_category SET active=false WHERE id=$1", [category.id]);
    const detailOnly = {
      ...incomplete, missing: [], incompleteSchedules: [], incompleteNominations: [], nightsWithoutJury: [], humanMessages: [],
    };
    // missing=[] and humanMessages=[] are NOT sufficient for ready=true.
    await checkBoth(detailOnly);
    await pool.query("UPDATE event_category SET active=true WHERE id=$1", [category.id]);
    await pool.query(
      "INSERT INTO evaluation_item(event_id,rubric_id,specialty_id,name,code) VALUES($1,$2,$3,'T3 Item','ITEM')",
      [ids.eventA, rubric.id, specialty.id],
    );
    const complete = { ...detailOnly, ready: true, incompleteTroupes: [], incompleteRubrics: [] };
    await checkBoth(complete); // No new per-specialty jury requirement.

    const first = await expectResponse(ids.eventA, ids.assigned, 200, complete);
    await expectResponse(ids.eventA, ids.assigned, 200, complete, { headers: { "Idempotency-Key": randomUUID() } });
    await expectResponse(ids.eventA, ids.assigned, 200, complete, { headers: { "Idempotency-Key": "not-a-key" } });
    await pool.query("UPDATE admin_event_assignment SET is_active=false WHERE user_id=$1 AND event_id=$2", [ids.assigned, ids.eventA]);
    await expectResponse(ids.eventA, ids.assigned, 403, { code: "ADMIN_REQUIRED" }, { headers: { "If-None-Match": first.headers.etag } });
    await expectResponse(ids.eventB, ids.assigned, 200, empty);
    await expectResponse(ids.eventA, ids.admin, 200, complete);
    await pool.query("UPDATE admin_event_assignment SET is_active=true WHERE user_id=$1 AND event_id=$2", [ids.assigned, ids.eventA]);
    await expectResponse(ids.eventA, ids.assigned, 200, complete);
    await pool.query("INSERT INTO admin_event_assignment(user_id,event_id,is_active) VALUES($1,$2,true)", [ids.admin, ids.eventA]);
    await expectResponse(ids.eventA, ids.admin, 200, complete);
    await pool.query("UPDATE admin_event_assignment SET is_active=false WHERE user_id=$1 AND event_id=$2", [ids.admin, ids.eventA]);
    await expectResponse(ids.eventA, ids.admin, 200, complete);

    // Only substitute DB failure boundaries; authorization, service and HTTP remain real.
    const descriptor = Object.getOwnPropertyDescriptor(pool, "query");
    const originalQuery = pool.query;
    for (const failedSql of [
      "SELECT 1 FROM carnival_event WHERE id=$1",
      "SELECT COUNT(*) FROM rubric WHERE event_id=$1 AND active",
      "SELECT role_code FROM user_role WHERE user_id = $1 ORDER BY role_code",
      ") AS allowed",
    ]) {
      pool.query = function (sql, ...args) {
        if (typeof sql === "string" && sql.includes(failedSql)) {
          return Promise.reject(new Error("Injected readiness DB failure: SQL/internal details must not leak"));
        }
        return originalQuery.call(pool, sql, ...args);
      };
      try {
        for (const session of failedSql === ") AS allowed" ? [ids.assigned] : [ids.admin, ids.assigned]) {
          await expectResponse(ids.eventA, session, 500, { code: "INTERNAL_ERROR" });
        }
      } finally {
        if (descriptor) Object.defineProperty(pool, "query", descriptor);
        else delete pool.query;
      }
    }
    await expectResponse(ids.eventA, ids.assigned, 200, complete);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("readiness y apertura exponen contrato HTTP ADMIN", { skip: !process.env.TEST_DATABASE_URL }, async (context) => {
  const original = process.env.DATABASE_URL;
  context.after(async () => { await closePool(); if (original === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = original; });
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await migrate();
  const id = randomUUID();
  const pool = getPool();
  await pool.query(`INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,'Ready admin',$2,true)`, [id, `${id}@example.test`]);
  await pool.query("INSERT INTO user_role(user_id,role_code) VALUES($1,'ADMIN')", [id]);
  const app = createApp({ getSession: async ({ headers }) => headers.get("x-test-session") === "admin" ? { user: { id, twoFactorEnabled: true } } : null });
  const server = await new Promise((resolve) => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const headers = { "content-type": "application/json", "x-test-session": "admin" };
    const post = async (path, body, extraHeaders = {}) => fetch(`${base}${path}`, { method: "POST", headers: { ...headers, ...extraHeaders }, body: JSON.stringify(body) });
    const open = (path) => post(path, {}, { "Idempotency-Key": randomUUID() });
    const event = await (await post("/api/v1/events", { name: "HTTP readiness" })).json();
    const ready = await fetch(`${base}/api/v1/events/${event.id}/readiness`, { headers });
    assert.equal(ready.status, 200);
    assert.ok((await ready.json()).missing.includes("COMPETITION_NIGHT"));
    const incompleteOpen = await open(`/api/v1/events/${event.id}/open`);
    assert.equal(incompleteOpen.status, 409);
    assert.equal((await incompleteOpen.json()).code, "EVENT_CONFIGURATION_INCOMPLETE");
    const category = await (await post(`/api/v1/events/${event.id}/categories`, { name: "Primera", code: "PRIMERA", displayOrder: 1 })).json();
    const troupe = await (await post(`/api/v1/events/${event.id}/troupes`, { name: "Comparsa smoke", categoryId: category.id })).json();
    const specialty = await (await post(`/api/v1/events/${event.id}/specialties`, { name: "Baile", code: "BAILE", displayOrder: 1 })).json();
    const rubric = await (await post(`/api/v1/events/${event.id}/rubrics`, { name: "Coreografía", code: "COREO", evaluationTarget: "TROUPE" })).json();
    await post(`/api/v1/rubrics/${rubric.id}/items`, { name: "Ejecución", code: "EJECUCION", specialtyId: specialty.id });
    const night = await (await post(`/api/v1/events/${event.id}/nights`, { name: "Noche 1", displayOrder: 1, kind: "COMPETITION" })).json();
    const unscheduled = await (await fetch(`${base}/api/v1/events/${event.id}/readiness`, { headers })).json();
    assert.equal(unscheduled.ready, false);
    assert.ok(unscheduled.missing.includes("INCOMPLETE_SCHEDULES"));
    const blockedScheduleOpen = await open(`/api/v1/events/${event.id}/open`);
    assert.equal(blockedScheduleOpen.status, 409);
    assert.equal((await blockedScheduleOpen.json()).code, "EVENT_CONFIGURATION_INCOMPLETE");
    const scheduled = await post(`/api/v1/events/${event.id}/schedule`, { nightId: night.id, troupeId: troupe.id });
    assert.equal(scheduled.status, 201);
    await seedActiveJudge({ client: pool, eventId: event.id, nightId: night.id, specialtyId: specialty.id });
    const complete = await (await fetch(`${base}/api/v1/events/${event.id}/readiness`, { headers })).json();
    assert.equal(complete.ready, true);
    const opened = await open(`/api/v1/events/${event.id}/open`);
    assert.equal(opened.status, 200);
    assert.equal((await opened.json()).status, "OPEN");
    const lockedWrites = [
      post(`/api/v1/events/${event.id}/nights`, { name: "Noche bloqueada", displayOrder: 2, kind: "COMPETITION" }),
      post(`/api/v1/events/${event.id}/categories`, { name: "Categoría bloqueada", code: "BLOQUEADA", displayOrder: 2 }),
      post(`/api/v1/events/${event.id}/troupes`, { name: "Comparsa bloqueada", categoryId: category.id }),
      post(`/api/v1/events/${event.id}/specialties`, { name: "Especialidad bloqueada", code: "BLOQUEADA", displayOrder: 2 }),
      post(`/api/v1/events/${event.id}/rubrics`, { name: "Rubro bloqueado", code: "BLOQUEADO", evaluationTarget: "TROUPE" }),
      post(`/api/v1/rubrics/${rubric.id}/items`, { name: "Ítem bloqueado", code: "BLOQUEADO", specialtyId: specialty.id }),
    ];
    for (const response of await Promise.all(lockedWrites)) {
      assert.equal(response.status, 409);
      assert.equal((await response.json()).code, "EVENT_LOCKED");
    }
    const edit = await fetch(`${base}/api/v1/events/${event.id}`, { method: "PATCH", headers, body: JSON.stringify({ name: "No permitido" }) });
    assert.equal(edit.status, 409);
    assert.equal((await edit.json()).code, "EVENT_LOCKED");
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test("readiness y apertura de un evento inexistente responden 404", { skip: !process.env.TEST_DATABASE_URL }, async (context) => {
  const original=process.env.DATABASE_URL;context.after(async()=>{await closePool();if(original===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=original;});process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;await migrate();const id=randomUUID(),pool=getPool();await pool.query(`INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,'Missing event admin',$2,true)`,[id,`${id}@example.test`]);await pool.query("INSERT INTO user_role(user_id,role_code) VALUES($1,'ADMIN')",[id]);const app=createApp({getSession:async()=>({user:{id,twoFactorEnabled:true}})});const server=await new Promise(r=>{const i=app.listen(0,'127.0.0.1',()=>r(i));});try{const eventId=randomUUID(),base=`http://127.0.0.1:${server.address().port}/api/v1/events/${eventId}`;const readiness=await fetch(`${base}/readiness`);assert.equal(readiness.status,404);assert.deepEqual(await readiness.json(),{code:'EVENT_NOT_FOUND'});const response=await fetch(`${base}/open`,{method:'POST',headers:{'Idempotency-Key':randomUUID()}});assert.equal(response.status,404);assert.deepEqual(await response.json(),{code:'EVENT_NOT_FOUND'});}finally{await new Promise(r=>server.close(r));}
});
