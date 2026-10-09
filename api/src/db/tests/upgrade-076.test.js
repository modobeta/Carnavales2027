import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { prepareDemoSeedTest } from "./demo-seed-test-environment.js";
import { migrate } from "../migrate.js";
import { verifyAuditChain } from "../../scripts/verify-audit-chain.js";
import { auditEvent } from "../../audit/audit-service.js";
import { createBallotsForNight } from "../../modules/ballots/ballot-service.js";

// Reproduces the production migration boundary on a NEW evidence database.
// Historical files are applied byte-for-byte; no existing database is reset.
let client;
async function setupTestData() {
  const suffix = Math.random().toString(36).slice(2, 8);
  const { rows: [event] } = await client.query(
    "INSERT INTO carnival_event(name) VALUES($1) RETURNING id", [`Test Ballots ${suffix}`],
  );
  const { rows: [night] } = await client.query(
    "INSERT INTO night(event_id, name, display_order, kind, status) VALUES($1,$2,$3,$4,$5) RETURNING id",
    [event.id, "Noche 1", 1, "COMPETITION", "OPEN"],
  );
  const { rows: [specialty] } = await client.query(
    "INSERT INTO event_specialty(event_id, name, code, display_order) VALUES($1,$2,$3,$4) RETURNING id",
    [event.id, "Baile", "BAILE", 1],
  );
  const { rows: [rubric] } = await client.query(
    "INSERT INTO rubric(event_id, name, code, evaluation_target) VALUES($1,$2,$3,$4) RETURNING id",
    [event.id, "Reina", "REINA", "TROUPE"],
  );
  const { rows: [item] } = await client.query(
    "INSERT INTO evaluation_item(event_id, rubric_id, specialty_id, name, code) VALUES($1,$2,$3,$4,$5) RETURNING id",
    [event.id, rubric.id, specialty.id, "Presencia", "PRESENCIA"],
  );
  const { rows: [category] } = await client.query(
    "INSERT INTO event_category(event_id, name, code, display_order) VALUES($1,$2,$3,$4) RETURNING id",
    [event.id, "Primera", "PRIMERA", 1],
  );
  const { rows: [troupe] } = await client.query(
    "INSERT INTO event_troupe(event_id, category_id, name) VALUES($1,$2,$3) RETURNING id",
    [event.id, category.id, "Comparsa 1"],
  );
  const { rows: [schedule] } = await client.query(
    "INSERT INTO night_troupe_schedule(event_id, night_id, event_troupe_id, presentation_order, status) VALUES($1,$2,$3,$4,$5) RETURNING id",
    [event.id, night.id, troupe.id, 1, "SCHEDULED"],
  );
  const adminId = randomUUID();
  const judgeUserId = randomUUID();
  await client.query(
    `INSERT INTO "user"(id, name, email, "emailVerified")
     VALUES ($1, 'Admin', $2, true), ($3, 'Judge', $4, true)`,
    [adminId, `${adminId}@example.test`, judgeUserId, `${judgeUserId}@example.test`],
  );
  const { rows: [judgeProfile] } = await client.query(
    "INSERT INTO judge_profile(name, email, document_number, registration_status, created_by) VALUES($1,$2,$3,$4,$5) RETURNING id",
    [`Judge ${suffix}`, `judge${suffix}@test.test`, `DOC${suffix}`, "INVITED", adminId],
  );
  await client.query(
    "UPDATE judge_profile SET user_id = $2, registration_status = 'REGISTERED' WHERE id = $1",
    [judgeProfile.id, judgeUserId],
  );
  await client.query(
    "INSERT INTO judge_quota(event_id, night_id, specialty_id, max_assignments) VALUES($1,$2,$3,$4)",
    [event.id, night.id, specialty.id, 3],
  );
  const { rows: [assignment] } = await client.query(
    `INSERT INTO judge_assignment(event_id, night_id, specialty_id, judge_profile_id, assignment_type)
     VALUES($1,$2,$3,$4,$5) RETURNING id`,
    [event.id, night.id, specialty.id, judgeProfile.id, "PRIMARY"],
  );

  return { event, night, specialty, rubric, item, troupe, schedule, judgeProfile, assignment, adminId };
}


test("upgrade 076 to current preserves historical scores, ballots and audit", { skip: !process.env.TEST_DATABASE_URL }, async (t) => {
  const { pool } = await prepareDemoSeedTest(t);
  client = pool;
  const directory = new URL("../migrations/", import.meta.url);
  const files = (await readdir(directory)).filter(name => /^\d+_.*\.sql$/.test(name)).sort();
  await pool.query("CREATE TABLE schema_migrations(version TEXT PRIMARY KEY,filename TEXT NOT NULL UNIQUE,checksum TEXT NOT NULL,applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)");
  for (const filename of files.filter(name => Number(name.split("_")[0]) <= 76)) {
    const sql = await readFile(new URL(filename, directory), "utf8");
    await pool.query(sql);
    await pool.query("INSERT INTO schema_migrations(version,filename,checksum) VALUES($1,$2,$3)", [filename.split("_")[0],filename,createHash("sha256").update(sql).digest("hex")]);
  }
  const data = await setupTestData();
  const { rows: [nominal] } = await pool.query("INSERT INTO rubric(event_id,name,code,evaluation_target,expected_subject_type) VALUES($1,'Historical nominee','NOM','NOMINATION','PERSON') RETURNING id", [data.event.id]);
  const { rows: [nominalItem] } = await pool.query("INSERT INTO evaluation_item(event_id,rubric_id,specialty_id,name,code) VALUES($1,$2,$3,'Nominee','NOM') RETURNING id", [data.event.id,nominal.id,data.specialty.id]);
  const { rows: [ballot] } = await pool.query("INSERT INTO ballot(event_id,night_id,judge_assignment_id,judge_profile_id,specialty_id) VALUES($1,$2,$3,$4,$5) RETURNING id", [data.event.id,data.night.id,data.assignment.id,data.judgeProfile.id,data.specialty.id]);
  const { rows: [futureNight] } = await pool.query("INSERT INTO night(event_id,name,display_order,kind,status) VALUES($1,'Future competition',2,'COMPETITION','OPEN') RETURNING id", [data.event.id]);
  await pool.query("INSERT INTO night_troupe_schedule(event_id,night_id,event_troupe_id,presentation_order) VALUES($1,$2,$3,1)", [data.event.id,futureNight.id,data.troupe.id]);
  await pool.query("INSERT INTO judge_quota(event_id,night_id,specialty_id,max_assignments) VALUES($1,$2,$3,1)", [data.event.id,futureNight.id,data.specialty.id]);
  await pool.query("INSERT INTO judge_assignment(event_id,night_id,specialty_id,judge_profile_id) VALUES($1,$2,$3,$4)", [data.event.id,futureNight.id,data.specialty.id,data.judgeProfile.id]);
  for (const [item,rubric] of [[data.item,data.rubric],[nominalItem,nominal]]) {
    await pool.query("INSERT INTO ballot_score(ballot_id,event_id,evaluation_item_id,rubric_id,night_schedule_id,score,evaluation_state) VALUES($1,$2,$3,$4,$5,8,'SCORED')", [ballot.id,data.event.id,item.id,rubric.id,data.schedule.id]);
  }
  await pool.query("UPDATE ballot SET status='SUBMITTED', submitted_at=clock_timestamp() WHERE id=$1", [ballot.id]);
  await auditEvent(pool, { actorUserId: null, action:"UPGRADE_FIXTURE",entityType:"ballot",entityId:ballot.id,after:{status:"SUBMITTED"} });
  // Open with the 076 database guard, before newer readiness requirements exist.
  const historical = await pool.connect();
  try {
    await historical.query("BEGIN");
    await historical.query("SELECT set_config('app.allow_event_open','true',true)");
    await historical.query("UPDATE carnival_event SET status='OPEN' WHERE id=$1", [data.event.id]);
    await historical.query("COMMIT");
  } finally { historical.release(); }
  const snapshot = async () => ({
    events:(await pool.query("SELECT * FROM carnival_event ORDER BY id")).rows,
    ballots:(await pool.query("SELECT * FROM ballot ORDER BY id")).rows,
    scores:(await pool.query("SELECT to_jsonb(s) - 'nomination_id' AS row FROM ballot_score s ORDER BY id")).rows,
    audit:(await pool.query("SELECT * FROM audit_event ORDER BY id")).rows,
    types:(await pool.query("SELECT id,rubric_type FROM rubric ORDER BY id")).rows,
  });
  const before = await snapshot();
  const result = await migrate();
  assert.deepEqual(result.applied, files.filter(name => Number(name.split("_")[0]) > 76));
  assert.deepEqual(await snapshot(), before);
  assert.equal((await verifyAuditChain({ pool })).status, "OK");
  assert.equal(Number((await pool.query("SELECT count(*) FROM ballot_score WHERE nomination_id IS NOT NULL")).rows[0].count), 0);
  assert.deepEqual((await migrate()).applied, []);
  const { rows: legacy } = await pool.query("SELECT 1 FROM legacy_nomination_scope WHERE event_id=$1 AND rubric_id=$2 AND event_troupe_id=$3", [data.event.id,nominal.id,data.troupe.id]);
  assert.equal(legacy.length, 1);
  const voting = await pool.connect();
  try {
    await voting.query("BEGIN");
    const opened = await createBallotsForNight(voting, { eventId:data.event.id, nightId:futureNight.id, actorUserId:data.adminId });
    assert.equal(opened.length, 1);
    const { rows: futureScores } = await voting.query("SELECT rubric_id,nomination_id FROM ballot_score WHERE ballot_id=$1", [opened[0].id]);
    assert.equal(futureScores.length, 2);
    assert.equal(futureScores.find((score) => score.rubric_id===nominal.id).nomination_id, null);
  } finally { await voting.query("ROLLBACK"); voting.release(); }
  await assert.rejects(() => pool.query("UPDATE ballot_score SET score=9 WHERE ballot_id=$1", [ballot.id]), /IMMUTABLE|LOCKED/);
  await assert.rejects(() => pool.query("DELETE FROM ballot_score WHERE ballot_id=$1", [ballot.id]), /IMMUTABLE|DELETE|LOCKED/);
});
