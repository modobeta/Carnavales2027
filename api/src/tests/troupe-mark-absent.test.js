import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createApp } from "../app.js";
import { closePool, getPool } from "../db/pool.js";
import { migrate } from "../db/migrate.js";

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

test("marca una comparsa completa como no presentada respetando precedencia e idempotencia", {
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
    `INSERT INTO "user"(id, name, email, "emailVerified")
     VALUES ($1, 'Admin Abs', $2, true), ($3, 'Judge Abs', $4, true)`,
    [adminId, `${adminId}@example.test`, judgeUserId, `${judgeUserId}@example.test`],
  );
  await pool.query("INSERT INTO user_role (user_id, role_code) VALUES ($1, 'ADMIN')", [adminId]);
  await pool.query("INSERT INTO user_role (user_id, role_code) VALUES ($1, 'JUDGE')", [judgeUserId]);

  const { rows: [event] } = await pool.query(
    "INSERT INTO carnival_event(name) VALUES($1) RETURNING id", ["Evento Ausencia"],
  );
  const { rows: [night] } = await pool.query(
    "INSERT INTO night(event_id, name, display_order, kind, status) VALUES($1,$2,$3,$4,$5) RETURNING id",
    [event.id, "Noche Ausencia", 1, "COMPETITION", "OPEN"],
  );
  const { rows: [specialty] } = await pool.query(
    "INSERT INTO event_specialty(event_id, name, code, display_order) VALUES($1,$2,$3,$4) RETURNING id",
    [event.id, "Danza", "DANZA", 1],
  );
  const { rows: [rubric] } = await pool.query(
    "INSERT INTO rubric(event_id, name, code, evaluation_target) VALUES($1,$2,$3,$4) RETURNING id",
    [event.id, "Coreografía", "COREO", "TROUPE"],
  );
  await pool.query(
    "INSERT INTO evaluation_item(event_id, rubric_id, specialty_id, name, code) VALUES($1,$2,$3,$4,$5)",
    [event.id, rubric.id, specialty.id, "Sincronía", "SINCRO"],
  );
  await pool.query(
    "INSERT INTO evaluation_item(event_id, rubric_id, specialty_id, name, code) VALUES($1,$2,$3,$4,$5)",
    [event.id, rubric.id, specialty.id, "Originalidad", "ORIGINAL"],
  );
  const { rows: [category] } = await pool.query(
    "INSERT INTO event_category(event_id, name, code, display_order) VALUES($1,$2,$3,$4) RETURNING id",
    [event.id, "Categoría Única", "CATU", 1],
  );
  const { rows: [troupe1] } = await pool.query(
    "INSERT INTO event_troupe(event_id, category_id, name) VALUES($1,$2,$3) RETURNING id",
    [event.id, category.id, "Comparsa Primera"],
  );
  const { rows: [troupe2] } = await pool.query(
    "INSERT INTO event_troupe(event_id, category_id, name) VALUES($1,$2,$3) RETURNING id",
    [event.id, category.id, "Comparsa Segunda"],
  );
  await pool.query(
    "INSERT INTO night_troupe_schedule(event_id, night_id, event_troupe_id, presentation_order, status) VALUES($1,$2,$3,$4,$5)",
    [event.id, night.id, troupe1.id, 1, "SCHEDULED"],
  );
  await pool.query(
    "INSERT INTO night_troupe_schedule(event_id, night_id, event_troupe_id, presentation_order, status) VALUES($1,$2,$3,$4,$5)",
    [event.id, night.id, troupe2.id, 2, "SCHEDULED"],
  );

  const { rows: [judgeProfile] } = await pool.query(
    "INSERT INTO judge_profile(name, email, document_number, registration_status, created_by, user_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
    ["Judge Abs Test", `judge-${randomUUID()}@test.test`, `DOC-${randomUUID()}`, "REGISTERED", adminId, judgeUserId],
  );
  await pool.query(
    "INSERT INTO judge_quota(event_id, night_id, specialty_id, max_assignments) VALUES($1,$2,$3,$4)",
    [event.id, night.id, specialty.id, 2],
  );
  await pool.query(
    "INSERT INTO judge_assignment(event_id, night_id, specialty_id, judge_profile_id, assignment_type) VALUES($1,$2,$3,$4,$5)",
    [event.id, night.id, specialty.id, judgeProfile.id, "PRIMARY"],
  );

  const openClient = await pool.connect();
  try {
    await openClient.query("BEGIN");
    await openClient.query("SELECT set_config('app.allow_event_open','true',true)");
    await openClient.query("UPDATE carnival_event SET status = 'OPEN', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [event.id]);
    await openClient.query("COMMIT");
  } catch (err) {
    await openClient.query("ROLLBACK");
    throw err;
  } finally {
    openClient.release();
  }

  const app = createApp({
    getSession: async ({ headers }) => {
      const role = headers.get("x-test-session");
      if (role === "admin") return { user: { id: adminId, twoFactorEnabled: true } };
      if (role === "judge") return { user: { id: judgeUserId, twoFactorEnabled: true } };
      return null;
    },
  });

  await withServer(app, async (baseUrl) => {
    const adminHeaders = { "content-type": "application/json", "x-test-session": "admin" };
    const judgeHeaders = { "content-type": "application/json", "x-test-session": "judge" };

    await fetch(`${baseUrl}/api/v1/events/${event.id}/nights/${night.id}/voting/open`, {
      method: "POST",
      headers: adminHeaders,
    });

    const [ballotSummary] = await (await fetch(`${baseUrl}/api/v1/judge/ballots?include=progress`, {
      headers: judgeHeaders,
    })).json();
    const ballotId = ballotSummary.id;

    const ballotDetail = await (await fetch(`${baseUrl}/api/v1/judge/ballots/${ballotId}`, {
      headers: judgeHeaders,
    })).json();
    const t1Scores = ballotDetail.scores.filter((s) => s.troupeName === "Comparsa Primera");
    const t2Scores = ballotDetail.scores.filter((s) => s.troupeName === "Comparsa Segunda");
    assert.equal(t1Scores.length, 2);
    assert.equal(t2Scores.length, 2);
    const t1ScheduleId = t1Scores[0].nightScheduleId;
    const t2ScheduleId = t2Scores[0].nightScheduleId;

    // 1. Marcar ausente la comparsa 2 con la 1 pendiente -> bloqueado por precedencia.
    const blocked = await fetch(`${baseUrl}/api/v1/judge/ballots/${ballotId}/troupes/${t2ScheduleId}/mark-absent`, {
      method: "POST",
      headers: judgeHeaders,
    });
    assert.equal(blocked.status, 409);
    assert.equal((await blocked.json()).code, "TROUPE_PRECEDENCE_REQUIRED");

    // 2. Marcar ausente la comparsa 1 -> éxito, marca sus 2 ítems.
    const mark1 = await fetch(`${baseUrl}/api/v1/judge/ballots/${ballotId}/troupes/${t1ScheduleId}/mark-absent`, {
      method: "POST",
      headers: judgeHeaders,
    });
    assert.equal(mark1.status, 200);
    const mark1Body = await mark1.json();
    assert.equal(mark1Body.updatedScoreIds.length, 2);

    const after1 = await (await fetch(`${baseUrl}/api/v1/judge/ballots/${ballotId}`, {
      headers: judgeHeaders,
    })).json();
    const t1After = after1.scores.filter((s) => s.nightScheduleId === t1ScheduleId);
    assert.ok(t1After.every((s) => s.evaluationState === "NOT_PRESENTED" && s.score === 0));

    // 3. Replay idempotente: sin ítems pendientes, no re-incrementa revisión.
    const beforeRevision = Number(mark1Body.revision);
    const replay = await fetch(`${baseUrl}/api/v1/judge/ballots/${ballotId}/troupes/${t1ScheduleId}/mark-absent`, {
      method: "POST",
      headers: judgeHeaders,
    });
    assert.equal(replay.status, 200);
    const replayBody = await replay.json();
    assert.equal(replayBody.updatedScoreIds.length, 0);
    assert.equal(Number(replayBody.revision), beforeRevision);

    // 4. Auditoría: cada ítem + evento de ausencia.
    const { rows: auditRows } = await pool.query(
      `SELECT action FROM ballot_audit_log WHERE ballot_id = $1 AND action = 'TROUPE_MARKED_ABSENT'`,
      [ballotId],
    );
    assert.equal(auditRows.length, 1);

    // 5. Ahora la comparsa 2 queda desbloqueada y puede marcarse ausente.
    const mark2 = await fetch(`${baseUrl}/api/v1/judge/ballots/${ballotId}/troupes/${t2ScheduleId}/mark-absent`, {
      method: "POST",
      headers: judgeHeaders,
    });
    assert.equal(mark2.status, 200);
    assert.equal((await mark2.json()).updatedScoreIds.length, 2);
  });
});
