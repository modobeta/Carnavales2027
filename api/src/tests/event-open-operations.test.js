import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createApp } from "../app.js";
import { closePool, getPool } from "../db/pool.js";
import { migrate } from "../db/migrate.js";
import { createEvent } from "../modules/events/event-service.js";
import { seedActiveJudge } from "./helpers/judge-fixture.js";

const originalDatabaseUrl = process.env.DATABASE_URL;

function restoreDatabaseUrl() {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
}

async function withServer(app, run) {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function createReadyEvent(pool) {
  const event = await createEvent({ name: `Open operation ${randomUUID()}` });
  const { rows: [night] } = await pool.query(
    "INSERT INTO night(event_id,name,display_order,kind) VALUES($1,'Noche',1,'COMPETITION') RETURNING id",
    [event.id],
  );
  const { rows: [category] } = await pool.query(
    "INSERT INTO event_category(event_id,name,code,display_order) VALUES($1,'Categoría','CAT_OPEN',1) RETURNING id",
    [event.id],
  );
  const { rows: [troupe] } = await pool.query(
    "INSERT INTO event_troupe(event_id,category_id,name) VALUES($1,$2,'Comparsa') RETURNING id",
    [event.id, category.id],
  );
  const { rows: [specialty] } = await pool.query(
    "INSERT INTO event_specialty(event_id,name,code,display_order) VALUES($1,'Baile','BAILE_OPEN',1) RETURNING id",
    [event.id],
  );
  const { rows: [rubric] } = await pool.query(
    "INSERT INTO rubric(event_id,name,code,evaluation_target) VALUES($1,'Rubro','RUBRO_OPEN','TROUPE') RETURNING id",
    [event.id],
  );
  await pool.query(
    "INSERT INTO evaluation_item(event_id,rubric_id,specialty_id,name,code) VALUES($1,$2,$3,'Ítem','ITEM_OPEN')",
    [event.id, rubric.id, specialty.id],
  );
  await pool.query(
    "INSERT INTO night_troupe_schedule(event_id,night_id,event_troupe_id,presentation_order) VALUES($1,$2,$3,1)",
    [event.id, night.id, troupe.id],
  );
  await seedActiveJudge({ client: pool, eventId: event.id, nightId: night.id, specialtyId: specialty.id });
  return event;
}

test("apertura de evento requiere key y una key inválida no muta el evento", {
  skip: !process.env.TEST_DATABASE_URL,
}, async (context) => {
  context.after(async () => { await closePool(); restoreDatabaseUrl(); });
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await migrate();
  const pool = getPool();
  const adminId = randomUUID();
  await pool.query(`INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,'Open admin',$2,true)`, [adminId, `${adminId}@example.test`]);
  await pool.query("INSERT INTO user_role(user_id,role_code) VALUES($1,'ADMIN')", [adminId]);
  const app = createApp({ getSession: async ({ headers }) => headers.get("x-test-session") === "admin"
    ? { user: { id: adminId, twoFactorEnabled: true } } : null });
  await withServer(app, async (base) => {
    const event = await createReadyEvent(pool);
    const path = `${base}/api/v1/events/${event.id}/open`;
    const missing = await fetch(path, { method: "POST", headers: { "x-test-session": "admin" } });
    assert.equal(missing.status, 400);
    assert.equal((await missing.json()).code, "IDEMPOTENCY_KEY_REQUIRED");
    const malformed = await fetch(path, { method: "POST", headers: { "x-test-session": "admin", "Idempotency-Key": "not-a-uuid" } });
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).code, "IDEMPOTENCY_KEY_REQUIRED");
    const { rows: [stored] } = await pool.query("SELECT status FROM carnival_event WHERE id=$1", [event.id]);
    assert.equal(stored.status, "CONFIGURING");
    const { rows: claims } = await pool.query("SELECT operation_id FROM event_open_operation_claim WHERE event_id=$1", [event.id]);
    assert.equal(claims.length, 0);
  });
});

test("open operation replay is single-effect, conflicts across events, and lookup is ADMIN+2FA protected", {
  skip: !process.env.TEST_DATABASE_URL,
}, async (context) => {
  context.after(async () => { await closePool(); restoreDatabaseUrl(); });
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await migrate();
  const pool = getPool();
  const adminId = randomUUID();
  const fiscalId = randomUUID();
  await pool.query(`INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,'Open admin',$2,true),($3,'Fiscal',$4,true)`, [adminId, `${adminId}@example.test`, fiscalId, `${fiscalId}@example.test`]);
  await pool.query("INSERT INTO user_role(user_id,role_code) VALUES($1,'ADMIN'),($2,'VEEDOR')", [adminId, fiscalId]);
  const app = createApp({ getSession: async ({ headers }) => {
    const token = headers.get("x-test-session");
    if (token === "admin" || token === "fiscal" || token === "admin-no-2fa") {
      return { user: { id: token === "fiscal" ? fiscalId : adminId, twoFactorEnabled: token !== "admin-no-2fa" } };
    }
    return null;
  } });
  await withServer(app, async (base) => {
    const event = await createReadyEvent(pool);
    const secondEvent = await createReadyEvent(pool);
    const operationId = randomUUID();
    const path = `${base}/api/v1/events/${event.id}/open`;
    const headers = { "x-test-session": "admin", "Idempotency-Key": operationId };
    const [first, concurrent] = await Promise.all([
      fetch(path, { method: "POST", headers }),
      fetch(path, { method: "POST", headers }),
    ]);
    assert.equal(first.status, 200);
    assert.equal(concurrent.status, 200);
    assert.equal((await first.json()).status, "OPEN");
    assert.equal((await concurrent.json()).status, "OPEN");
    const lookupPath = `${base}/api/v1/events/${event.id}/open-operations/${operationId}`;
    const lookup = await fetch(lookupPath, { headers: { "x-test-session": "admin" } });
    assert.equal(lookup.status, 200);
    assert.equal((await lookup.json()).status, "applied");
    const replay = await fetch(path, { method: "POST", headers });
    assert.equal(replay.status, 200);
    assert.equal((await replay.json()).operation.replayed, true);
    const conflict = await fetch(`${base}/api/v1/events/${secondEvent.id}/open`, { method: "POST", headers });
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json()).code, "IDEMPOTENCY_CONFLICT");
    assert.equal((await fetch(lookupPath, { headers: { "x-test-session": "fiscal" } })).status, 403);
    assert.equal((await fetch(lookupPath, { headers: { "x-test-session": "admin-no-2fa" } })).status, 403);
    assert.equal((await fetch(lookupPath)).status, 401);
    const { rows: openedAudit } = await pool.query(
      "SELECT count(*)::int AS count FROM audit_event WHERE action='EVENT_OPENED' AND entity_id=$1", [event.id],
    );
    assert.equal(openedAudit[0].count, 1);
    const { rows: terminal } = await pool.query("SELECT count(*)::int AS count FROM event_open_operation_receipt WHERE operation_id=$1", [operationId]);
    assert.equal(terminal[0].count, 1);
  });
});

test("open operation lookup distinguishes absent and pending, and same-key retry resolves pending", {
  skip: !process.env.TEST_DATABASE_URL,
}, async (context) => {
  context.after(async () => { await closePool(); restoreDatabaseUrl(); });
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await migrate();
  const pool = getPool();
  const adminId = randomUUID();
  await pool.query(`INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,'Open admin',$2,true)`, [adminId, `${adminId}@example.test`]);
  await pool.query("INSERT INTO user_role(user_id,role_code) VALUES($1,'ADMIN')", [adminId]);
  const app = createApp({ getSession: async () => ({ user: { id: adminId, twoFactorEnabled: true } }) });
  await withServer(app, async (base) => {
    const event = await createReadyEvent(pool);
    const operationId = randomUUID();
    const lookupPath = `${base}/api/v1/events/${event.id}/open-operations/${operationId}`;
    const absent = await fetch(lookupPath);
    assert.equal(absent.status, 404);
    assert.equal((await absent.json().catch(() => ({}))).code, "OPEN_OPERATION_NOT_FOUND");
    await pool.query(
      "INSERT INTO event_open_operation_claim(operation_id,event_id,intent,actor_user_id) VALUES($1,$2,'OPEN_EVENT',$3)",
      [operationId, event.id, adminId],
    );
    const pending = await fetch(lookupPath);
    assert.equal((await pending.json()).status, "pending");
    const retry = await fetch(`${base}/api/v1/events/${event.id}/open`, {
      method: "POST", headers: { "Idempotency-Key": operationId },
    });
    assert.equal(retry.status, 200);
    assert.equal((await retry.json()).operation.status, "applied");
  });
});

test("rechazo por readiness queda terminal y la evidencia de apertura es inmutable", {
  skip: !process.env.TEST_DATABASE_URL,
}, async (context) => {
  context.after(async () => { await closePool(); restoreDatabaseUrl(); });
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await migrate();
  const pool = getPool();
  const adminId = randomUUID();
  await pool.query(`INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,'Open admin',$2,true)`, [adminId, `${adminId}@example.test`]);
  await pool.query("INSERT INTO user_role(user_id,role_code) VALUES($1,'ADMIN')", [adminId]);
  const app = createApp({ getSession: async () => ({ user: { id: adminId, twoFactorEnabled: true } }) });
  await withServer(app, async (base) => {
    const event = await createEvent({ name: `Incomplete ${randomUUID()}` });
    const operationId = randomUUID();
    const path = `${base}/api/v1/events/${event.id}/open`;
    const headers = { "Idempotency-Key": operationId };
    const rejected = await fetch(path, { method: "POST", headers });
    assert.equal(rejected.status, 409);
    assert.equal((await rejected.json()).operation.status, "rejected");
    const replay = await fetch(path, { method: "POST", headers });
    assert.equal(replay.status, 409);
    assert.equal((await replay.json()).operation.replayed, true);
    const lookup = await fetch(`${base}/api/v1/events/${event.id}/open-operations/${operationId}`);
    const outcome = await lookup.json();
    assert.equal(outcome.status, "rejected");
    assert.equal(outcome.code, "EVENT_CONFIGURATION_INCOMPLETE");
    await assert.rejects(() => pool.query("UPDATE event_open_operation_receipt SET status='APPLIED' WHERE operation_id=$1", [operationId]));
    await assert.rejects(() => pool.query("DELETE FROM event_open_operation_receipt WHERE operation_id=$1", [operationId]));
    await assert.rejects(() => pool.query("UPDATE event_open_operation_claim SET intent='OTHER' WHERE operation_id=$1", [operationId]));
    await assert.rejects(() => pool.query("DELETE FROM event_open_operation_claim WHERE operation_id=$1", [operationId]));

    const { rows: [roleAndOwnership] } = await pool.query(
      `SELECT current_user AS "applicationRole",
              (SELECT tableowner FROM pg_tables WHERE schemaname='public' AND tablename='event_open_operation_claim') AS "tableOwner",
              pg_has_role(current_user,
                (SELECT tableowner FROM pg_tables WHERE schemaname='public' AND tablename='event_open_operation_claim'),
                'MEMBER') AS "isTableOwnerMember"`,
    );
    assert.ok(roleAndOwnership.applicationRole);
    assert.ok(roleAndOwnership.tableOwner);
    const { rows: truncateTriggers } = await pool.query(
      `SELECT c.relname AS table_name, t.tgenabled, t.tgtype
         FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
        WHERE c.relnamespace='public'::regnamespace
          AND c.relname IN ('event_open_operation_claim','event_open_operation_receipt')
          AND NOT t.tgisinternal AND t.tgname LIKE '%truncate_immutable'`,
    );
    assert.deepEqual(truncateTriggers.map((trigger) => trigger.table_name).sort(), [
      "event_open_operation_claim",
      "event_open_operation_receipt",
    ]);
    assert.ok(truncateTriggers.every((trigger) => trigger.tgenabled !== "D"));

    for (const statement of [
      "TRUNCATE TABLE event_open_operation_receipt",
      "TRUNCATE TABLE event_open_operation_claim CASCADE",
    ]) {
      const client = await pool.connect();
      let truncateError;
      try {
        await client.query("BEGIN");
        try {
          await client.query(statement);
        } catch (error) {
          truncateError = error;
        }
      } finally {
        await client.query("ROLLBACK");
        client.release();
      }
      assert.equal(truncateError?.message, "EVENT_OPEN_OPERATION_EVIDENCE_IMMUTABLE", `${statement} must be blocked before its transaction can commit`);
    }

    await pool.query("DROP INDEX event_open_operation_claim_event_idx");
    await pool.query("CREATE INDEX event_open_operation_claim_event_idx ON event_open_operation_claim(event_id,created_at)");
    const afterIndexRebuild = await fetch(`${base}/api/v1/events/${event.id}/open-operations/${operationId}`);
    assert.equal((await afterIndexRebuild.json()).status, "rejected");
    const { rows: [stored] } = await pool.query("SELECT status FROM carnival_event WHERE id=$1", [event.id]);
    assert.equal(stored.status, "CONFIGURING");
  });
});

test("fallo al guardar receipt revierte apertura y auditoría pero conserva PENDING para reintento", {
  skip: !process.env.TEST_DATABASE_URL,
}, async (context) => {
  context.after(async () => { await closePool(); restoreDatabaseUrl(); });
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await migrate();
  const pool = getPool();
  const adminId = randomUUID();
  await pool.query(`INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,'Open admin',$2,true)`, [adminId, `${adminId}@example.test`]);
  await pool.query("INSERT INTO user_role(user_id,role_code) VALUES($1,'ADMIN')", [adminId]);
  const app = createApp({ getSession: async () => ({ user: { id: adminId, twoFactorEnabled: true } }) });
  await withServer(app, async (base) => {
    const event = await createReadyEvent(pool);
    const operationId = randomUUID();
    await pool.query(`CREATE FUNCTION reject_open_receipt_fixture() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'fixture receipt failure'; END $$`);
    await pool.query(`CREATE TRIGGER reject_open_receipt_fixture BEFORE INSERT ON event_open_operation_receipt
      FOR EACH ROW EXECUTE FUNCTION reject_open_receipt_fixture()`);
    const path = `${base}/api/v1/events/${event.id}/open`;
    const headers = { "Idempotency-Key": operationId };
    try {
      const failed = await fetch(path, { method: "POST", headers });
      assert.equal(failed.status, 500);
      const { rows: [state] } = await pool.query("SELECT status FROM carnival_event WHERE id=$1", [event.id]);
      assert.equal(state.status, "CONFIGURING");
      const { rows: audit } = await pool.query("SELECT count(*)::int AS count FROM audit_event WHERE action='EVENT_OPENED' AND entity_id=$1", [event.id]);
      assert.equal(audit[0].count, 0);
      const lookup = await fetch(`${base}/api/v1/events/${event.id}/open-operations/${operationId}`);
      assert.equal((await lookup.json()).status, "pending");
    } finally {
      await pool.query("DROP TRIGGER reject_open_receipt_fixture ON event_open_operation_receipt");
      await pool.query("DROP FUNCTION reject_open_receipt_fixture()");
    }
    const retry = await fetch(path, { method: "POST", headers });
    assert.equal(retry.status, 200);
    assert.equal((await retry.json()).status, "OPEN");
    const { rows: audit } = await pool.query("SELECT count(*)::int AS count FROM audit_event WHERE action='EVENT_OPENED' AND entity_id=$1", [event.id]);
    assert.equal(audit[0].count, 1);
  });
});
