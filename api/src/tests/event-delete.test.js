import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createApp } from "../app.js";
import { closePool, getPool } from "../db/pool.js";
import { migrate } from "../db/migrate.js";
import { seedActiveJudge } from "./helpers/judge-fixture.js";

const originalDatabaseUrl = process.env.DATABASE_URL;

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

async function seedVirginEvent(pool, name) {
  const { rows: [event] } = await pool.query(
    "INSERT INTO carnival_event(name) VALUES($1) RETURNING id", [name],
  );
  const { rows: [night] } = await pool.query(
    "INSERT INTO night(event_id, name, display_order, kind, status) VALUES($1,$2,$3,$4,$5) RETURNING id",
    [event.id, "Noche 1", 1, "COMPETITION", "DRAFT"],
  );
  const { rows: [category] } = await pool.query(
    "INSERT INTO event_category(event_id, name, code, display_order) VALUES($1,$2,$3,$4) RETURNING id",
    [event.id, "Primera", "PRIMERA", 1],
  );
  const { rows: [troupe] } = await pool.query(
    "INSERT INTO event_troupe(event_id, category_id, name) VALUES($1,$2,$3) RETURNING id",
    [event.id, category.id, "Comparsa X"],
  );
  await pool.query(
    "INSERT INTO night_troupe_schedule(event_id, night_id, event_troupe_id, presentation_order) VALUES($1,$2,$3,1)",
    [event.id, night.id, troupe.id],
  );
  const { rows: [specialty] } = await pool.query(
    "INSERT INTO event_specialty(event_id, name, code, display_order) VALUES($1,$2,$3,$4) RETURNING id",
    [event.id, "Baile", "BAILE", 1],
  );
  const { rows: [rubric] } = await pool.query(
    "INSERT INTO rubric(event_id, name, code, evaluation_target) VALUES($1,$2,$3,$4) RETURNING id",
    [event.id, "Reina", "REINA", "TROUPE"],
  );
  await pool.query(
    "INSERT INTO evaluation_item(event_id, rubric_id, specialty_id, name, code) VALUES($1,$2,$3,$4,$5)",
    [event.id, rubric.id, specialty.id, "Presencia", "PRESENCIA"],
  );
  return { event, troupe };
}

test("API eventos: eliminar es baja logica (oculta, conserva fila desactivada)", {
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
  await pool.query(
    `INSERT INTO "user"(id, name, email, "emailVerified") VALUES ($1, 'Admin del', $2, true)`,
    [adminId, `${adminId}@example.test`],
  );
  await pool.query("INSERT INTO user_role (user_id, role_code) VALUES ($1, 'ADMIN')", [adminId]);
  const { event } = await seedVirginEvent(pool, "Evento borrable");

  const app = createApp({ getSession: async ({ headers }) => headers.get("x-test-session") === "admin" ? { user: { id: adminId, twoFactorEnabled: true } } : null });
  await withServer(app, async (baseUrl) => {
    const headers = { "x-test-session": "admin" };
    const del = await fetch(`${baseUrl}/api/v1/events/${event.id}`, { method: "DELETE", headers });
    assert.equal(del.status, 200);
    assert.deepEqual(await del.json(), { id: event.id, active: false });
    const { rows: [row] } = await pool.query("SELECT active FROM carnival_event WHERE id=$1", [event.id]);
    assert.equal(row.active, false);
    const { rows: deletionAudits } = await pool.query(
      "SELECT actor_user_id, action, entity_type, entity_id FROM audit_event WHERE actor_user_id = $1 AND action = 'EVENT_DELETED' AND entity_id = $2",
      [adminId, event.id],
    );
    assert.deepEqual(deletionAudits, [{
      actor_user_id: adminId,
      action: "EVENT_DELETED",
      entity_type: "carnival_event",
      entity_id: event.id,
    }]);
    for (const table of ["night", "event_category", "event_troupe", "event_specialty", "rubric", "evaluation_item"]) {
      const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE event_id=$1`, [event.id]);
      assert.equal(rows[0].n, 1, `${table} conserva filas`);
    }
    const again = await fetch(`${baseUrl}/api/v1/events/${event.id}`, { method: "DELETE", headers });
    assert.equal(again.status, 404);
    const reactivated = await fetch(`${baseUrl}/api/v1/events/${event.id}`, { method: "PATCH", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ active: true }) });
    assert.equal(reactivated.status, 200);
    assert.equal((await reactivated.json()).active, true);
  });
});

test("API eventos: ADMIN_EVENT asignado no puede borrar y el rechazo no altera evento, dependencias ni auditoría", {
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
  const adminEventId = randomUUID();
  const globalAdminId = randomUUID();
  await pool.query(
    `INSERT INTO "user"(id, name, email, "emailVerified")
     VALUES ($1, 'Admin delegado', $2, true), ($3, 'Admin global para spoof', $4, true)`,
    [adminEventId, `${adminEventId}@example.test`, globalAdminId, `${globalAdminId}@example.test`],
  );
  await pool.query("INSERT INTO user_role (user_id, role_code) VALUES ($1, 'ADMIN')", [globalAdminId]);
  const { event, troupe } = await seedVirginEvent(pool, "Evento protegido de delegado");
  await pool.query(
    "INSERT INTO admin_event_assignment (user_id, event_id, is_active) VALUES ($1, $2, true)",
    [adminEventId, event.id],
  );
  const app = createApp({ getSession: async ({ headers }) => {
    const session = headers.get("x-test-session");
    if (session === "admin-event") return { user: { id: adminEventId, twoFactorEnabled: true } };
    if (session === "admin-event-no-2fa") return { user: { id: adminEventId, twoFactorEnabled: false } };
    return null;
  } });

  await withServer(app, async (baseUrl) => {
    const beforeEvent = await pool.query("SELECT id, active, status FROM carnival_event WHERE id = $1", [event.id]);
    const beforeTroupe = await pool.query("SELECT id, event_id FROM event_troupe WHERE id = $1", [troupe.id]);
    const beforeAudit = await pool.query(
      "SELECT id, actor_user_id, action, entity_type, entity_id FROM audit_event WHERE entity_id = $1 ORDER BY id",
      [event.id],
    );
    const path = `${baseUrl}/api/v1/events/${event.id}`;

    const denied = await fetch(path, {
      method: "DELETE",
      headers: { "x-test-session": "admin-event", "content-type": "application/json" },
      body: JSON.stringify({ role: "ADMIN", userId: globalAdminId, eventId: event.id }),
    });
    assert.equal(denied.status, 403);
    assert.deepEqual(await denied.json(), { code: "ADMIN_REQUIRED" });

    const noTwoFactor = await fetch(path, { method: "DELETE", headers: { "x-test-session": "admin-event-no-2fa" } });
    assert.equal(noTwoFactor.status, 403);
    assert.deepEqual(await noTwoFactor.json(), { code: "TWO_FACTOR_REQUIRED" });

    const anonymous = await fetch(path, { method: "DELETE" });
    assert.equal(anonymous.status, 401);
    assert.deepEqual(await anonymous.json(), { code: "UNAUTHENTICATED" });

    assert.deepEqual(await pool.query("SELECT id, active, status FROM carnival_event WHERE id = $1", [event.id]), beforeEvent);
    assert.deepEqual(await pool.query("SELECT id, event_id FROM event_troupe WHERE id = $1", [troupe.id]), beforeTroupe);
    assert.deepEqual(await pool.query(
      "SELECT id, actor_user_id, action, entity_type, entity_id FROM audit_event WHERE entity_id = $1 ORDER BY id",
      [event.id],
    ), beforeAudit);
  });
});

test("API eventos: borrado bloqueado con ballots, asignaciones o evento abierto", {
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
  const judgeUserId = randomUUID();
  await pool.query(
    `INSERT INTO "user"(id, name, email, "emailVerified") VALUES ($1, 'Admin del2', $2, true), ($3, 'Judge del', $4, true)`,
    [adminId, `${adminId}@example.test`, judgeUserId, `${judgeUserId}@example.test`],
  );
  await pool.query("INSERT INTO user_role (user_id, role_code) VALUES ($1, 'ADMIN')", [adminId]);
  const { rows: [profile] } = await pool.query(
    `INSERT INTO judge_profile(user_id, name, email, document_number, registration_status, created_by)
     VALUES ($1,'Juez',$2,$3,'REGISTERED',$4) RETURNING id`,
    [judgeUserId, `${judgeUserId}@example.test`, judgeUserId, adminId],
  );

  const withAssignment = await seedVirginEvent(pool, "Evento con asignacion");
  const { rows: [night] } = await pool.query("SELECT id FROM night WHERE event_id=$1", [withAssignment.event.id]);
  const { rows: [specialty] } = await pool.query("SELECT id FROM event_specialty WHERE event_id=$1", [withAssignment.event.id]);
  await pool.query(
    `INSERT INTO judge_quota(event_id, night_id, specialty_id, max_assignments) VALUES($1,$2,$3,5)`,
    [withAssignment.event.id, night.id, specialty.id],
  );
  await pool.query(
    `INSERT INTO judge_assignment(event_id, night_id, specialty_id, judge_profile_id) VALUES($1,$2,$3,$4)`,
    [withAssignment.event.id, night.id, specialty.id, profile.id],
  );

  const withBallot = await seedVirginEvent(pool, "Evento con ballot");
  const { rows: [nightB] } = await pool.query("SELECT id FROM night WHERE event_id=$1", [withBallot.event.id]);
  const { rows: [specB] } = await pool.query("SELECT id FROM event_specialty WHERE event_id=$1", [withBallot.event.id]);
  await pool.query(
    `INSERT INTO judge_quota(event_id, night_id, specialty_id, max_assignments) VALUES($1,$2,$3,5)`,
    [withBallot.event.id, nightB.id, specB.id],
  );
  const { rows: [assignB] } = await pool.query(
    `INSERT INTO judge_assignment(event_id, night_id, specialty_id, judge_profile_id) VALUES($1,$2,$3,$4) RETURNING id`,
    [withBallot.event.id, nightB.id, specB.id, profile.id],
  );
  await pool.query(
    `INSERT INTO ballot(event_id, night_id, judge_assignment_id, judge_profile_id, specialty_id) VALUES($1,$2,$3,$4,$5)`,
    [withBallot.event.id, nightB.id, assignB.id, profile.id, specB.id],
  );

  const opened = await seedVirginEvent(pool, "Evento abierto");
  const { rows: [openNight] } = await pool.query("SELECT id FROM night WHERE event_id=$1", [opened.event.id]);
  const { rows: [openSpecialty] } = await pool.query("SELECT id FROM event_specialty WHERE event_id=$1", [opened.event.id]);
  await seedActiveJudge({ client: pool, eventId: opened.event.id, nightId: openNight.id, specialtyId: openSpecialty.id, adminId });

  const app = createApp({ getSession: async ({ headers }) => headers.get("x-test-session") === "admin" ? { user: { id: adminId, twoFactorEnabled: true } } : null });
  await withServer(app, async (baseUrl) => {
    const headers = { "x-test-session": "admin" };
    const openRes = await fetch(`${baseUrl}/api/v1/events/${opened.event.id}/open`, { method: "POST", headers: { ...headers, "Idempotency-Key": randomUUID() } });
    assert.equal(openRes.status, 200);
    const delAssignment = await fetch(`${baseUrl}/api/v1/events/${withAssignment.event.id}`, { method: "DELETE", headers });
    assert.equal(delAssignment.status, 409);
    assert.equal((await delAssignment.json()).code, "EVENT_HAS_ASSIGNMENTS");

    const delBallot = await fetch(`${baseUrl}/api/v1/events/${withBallot.event.id}`, { method: "DELETE", headers });
    assert.equal(delBallot.status, 409);
    assert.equal((await delBallot.json()).code, "EVENT_HAS_BALLOTS");

    const delOpen = await fetch(`${baseUrl}/api/v1/events/${opened.event.id}`, { method: "DELETE", headers });
    assert.equal(delOpen.status, 409);

    for (const e of [withAssignment.event, withBallot.event, opened.event]) {
      const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM carnival_event WHERE id=$1", [e.id]);
      assert.equal(rows[0].n, 1, "evento intacto");
    }
  });
});
