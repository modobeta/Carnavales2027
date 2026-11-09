import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createApp } from "../app.js";
import { closePool, getPool } from "../db/pool.js";
import { migrate } from "../db/migrate.js";
import { saveScore, syncBallot } from "../modules/ballots/ballot-service.js";

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

test("Spec 025: puntuaci?n independiente del orden de pasada", {
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
     VALUES ($1, 'Admin Seq', $2, true), ($3, 'Judge Seq', $4, true)`,
    [
      adminId,
      `${adminId}@example.test`,
      judgeUserId,
      `${judgeUserId}@example.test`,
    ],
  );
  await pool.query("INSERT INTO user_role (user_id, role_code) VALUES ($1, 'ADMIN')", [adminId]);
  await pool.query("INSERT INTO user_role (user_id, role_code) VALUES ($1, 'JUDGE')", [judgeUserId]);

  const { rows: [event] } = await pool.query(
    "INSERT INTO carnival_event(name) VALUES($1) RETURNING id", ["Evento Secuencia Pasada"],
  );

  const { rows: [night] } = await pool.query(
    "INSERT INTO night(event_id, name, display_order, kind, status) VALUES($1,$2,$3,$4,$5) RETURNING id",
    [event.id, "Noche Secuencial", 1, "COMPETITION", "DRAFT"],
  );
  const { rows: [specialty] } = await pool.query(
    "INSERT INTO event_specialty(event_id, name, code, display_order) VALUES($1,$2,$3,$4) RETURNING id",
    [event.id, "Danza", "DANZA", 1],
  );
  const { rows: [rubric] } = await pool.query(
    "INSERT INTO rubric(event_id, name, code, evaluation_target) VALUES($1,$2,$3,$4) RETURNING id",
    [event.id, "Coreografía", "COREO", "TROUPE"],
  );
  const { rows: [item1] } = await pool.query(
    "INSERT INTO evaluation_item(event_id, rubric_id, specialty_id, name, code) VALUES($1,$2,$3,$4,$5) RETURNING id",
    [event.id, rubric.id, specialty.id, "Sincronía", "SINCRO"],
  );
  const { rows: [item2] } = await pool.query(
    "INSERT INTO evaluation_item(event_id, rubric_id, specialty_id, name, code) VALUES($1,$2,$3,$4,$5) RETURNING id",
    [event.id, rubric.id, specialty.id, "Originalidad", "ORIGINAL"],
  );
  const { rows: [category] } = await pool.query(
    "INSERT INTO event_category(event_id, name, code, display_order) VALUES($1,$2,$3,$4) RETURNING id",
    [event.id, "Categoría Única", "CATU", 1],
  );

  // 3 comparsas
  const { rows: [troupe1] } = await pool.query(
    "INSERT INTO event_troupe(event_id, category_id, name, brand_color) VALUES($1,$2,$3,$4) RETURNING id",
    [event.id, category.id, "Comparsa Primera", "#FF0000"],
  );
  const { rows: [troupe2] } = await pool.query(
    "INSERT INTO event_troupe(event_id, category_id, name, brand_color) VALUES($1,$2,$3,$4) RETURNING id",
    [event.id, category.id, "Comparsa Segunda", "#00FF00"],
  );
  const { rows: [troupe3] } = await pool.query(
    "INSERT INTO event_troupe(event_id, category_id, name, brand_color) VALUES($1,$2,$3,$4) RETURNING id",
    [event.id, category.id, "Comparsa Tercera", "#0000FF"],
  );

  await pool.query(
    "INSERT INTO night_troupe_schedule(event_id, night_id, event_troupe_id, presentation_order, status) VALUES($1,$2,$3,$4,$5)",
    [event.id, night.id, troupe1.id, 1, "SCHEDULED"],
  );
  await pool.query(
    "INSERT INTO night_troupe_schedule(event_id, night_id, event_troupe_id, presentation_order, status) VALUES($1,$2,$3,$4,$5)",
    [event.id, night.id, troupe2.id, 2, "SCHEDULED"],
  );
  await pool.query(
    "INSERT INTO night_troupe_schedule(event_id, night_id, event_troupe_id, presentation_order, status) VALUES($1,$2,$3,$4,$5)",
    [event.id, night.id, troupe3.id, 3, "SCHEDULED"],
  );

  const { rows: [judgeProfile] } = await pool.query(
    "INSERT INTO judge_profile(name, email, document_number, registration_status, created_by, user_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
    ["Judge Seq Test", `judge-${randomUUID()}@test.test`, `DOC-${randomUUID()}`, "REGISTERED", adminId, judgeUserId],
  );

  await pool.query(
    "INSERT INTO judge_quota(event_id, night_id, specialty_id, max_assignments) VALUES($1,$2,$3,$4)",
    [event.id, night.id, specialty.id, 3],
  );

  await pool.query(
    `INSERT INTO judge_assignment(event_id, night_id, specialty_id, judge_profile_id, assignment_type)
     VALUES($1,$2,$3,$4,$5) RETURNING id`,
    [event.id, night.id, specialty.id, judgeProfile.id, "PRIMARY"],
  );
  await pool.query("UPDATE night SET status='OPEN' WHERE id=$1", [night.id]);

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

    // 1. Abrir votación
    const openRes = await fetch(`${baseUrl}/api/v1/events/${event.id}/nights/${night.id}/voting/open`, {
      method: "POST",
      headers: adminHeaders,
    });
    assert.equal(openRes.status, 201);

    // 2. Obtener planilla y scores
    const listRes = await fetch(`${baseUrl}/api/v1/judge/ballots?include=progress`, {
      headers: judgeHeaders,
    });
    assert.equal(listRes.status, 200);
    const [ballotSummary] = await listRes.json();
    const ballotId = ballotSummary.id;

    const detailRes = await fetch(`${baseUrl}/api/v1/judge/ballots/${ballotId}`, {
      headers: judgeHeaders,
    });
    assert.equal(detailRes.status, 200);
    const ballotDetail = await detailRes.json();

    const t1Scores = ballotDetail.scores.filter((s) => s.troupeName === "Comparsa Primera");
    const t2Scores = ballotDetail.scores.filter((s) => s.troupeName === "Comparsa Segunda");
    const t3Scores = ballotDetail.scores.filter((s) => s.troupeName === "Comparsa Tercera");

    assert.equal(t1Scores.length, 2);
    assert.equal(t2Scores.length, 2);
    assert.equal(t3Scores.length, 2);

    // Las comparsas siguientes se pueden puntuar aunque las anteriores sigan pendientes.
    const outOfOrderRes = await fetch(`${baseUrl}/api/v1/judge/ballots/${ballotId}/scores/${t2Scores[0].id}`, {
      method: "PUT",
      headers: judgeHeaders,
      body: JSON.stringify({ evaluationState: "SCORED", score: 8 }),
    });
    assert.equal(outOfOrderRes.status, 200);

    const directSave = await saveScore({
      actorUserId: judgeUserId,
      ballotId,
      scoreId: t3Scores[0].id,
      evaluationState: "SCORED",
      score: 7,
    });
    assert.equal(directSave.evaluationState, "SCORED");

    for (const [score, decision] of [
      [t1Scores[0], { evaluationState: "SCORED", score: 9 }],
      [t1Scores[1], { evaluationState: "NOT_PRESENTED", score: 0 }],
      [t2Scores[1], { evaluationState: "SCORED", score: 9 }],
      [t3Scores[1], { evaluationState: "SCORED", score: 9 }],
    ]) {
      const saved = await fetch(`${baseUrl}/api/v1/judge/ballots/${ballotId}/scores/${score.id}`, {
        method: "PUT",
        headers: judgeHeaders,
        body: JSON.stringify(decision),
      });
      assert.equal(saved.status, 200);
    }

    const submitRes = await fetch(`${baseUrl}/api/v1/judge/ballots/${ballotId}/submit`, {
      method: "POST",
      headers: judgeHeaders,
    });
    assert.equal(submitRes.status, 200);
    const submitData = await submitRes.json();
    assert.equal(submitData.status, "SUBMITTED");
  });
});
