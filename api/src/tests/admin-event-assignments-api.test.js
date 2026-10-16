import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createApp } from "../app.js";
import { closePool, getPool } from "../db/pool.js";
import { migrate } from "../db/migrate.js";

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

function restoreDatabaseUrl(originalDatabaseUrl) {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
}

test("ADMIN conserva la consulta de solo lectura de asignaciones activas", {
  skip: !process.env.TEST_DATABASE_URL,
}, async (context) => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const adminId = randomUUID();
  const delegateId = randomUUID();
  const nonAdminId = randomUUID();
  const inactiveId = randomUUID();
  const eventId = randomUUID();
  context.after(async () => {
    const pool = getPool();
    await pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [[adminId, delegateId, nonAdminId, inactiveId]]);
    await pool.query("DELETE FROM carnival_event WHERE id = $1", [eventId]);
    await closePool();
    restoreDatabaseUrl(originalDatabaseUrl);
  });

  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await migrate();
  const pool = getPool();
  await pool.query(
    `INSERT INTO "user" (id, name, email, "emailVerified")
     VALUES ($1, 'Assignment reader', $2, true), ($3, 'Active delegate', $4, true),
            ($5, 'Inactive delegate', $6, true), ($7, 'Non-admin reader', $8, true)`,
    [adminId, `${adminId}@example.test`, delegateId, `${delegateId}@example.test`, inactiveId, `${inactiveId}@example.test`, nonAdminId, `${nonAdminId}@example.test`],
  );
  await pool.query("INSERT INTO carnival_event (id, name) VALUES ($1, 'Read-only assignment event')", [eventId]);
  await pool.query("INSERT INTO user_role (user_id, role_code) VALUES ($1, 'ADMIN')", [adminId]);
  await pool.query(
    `INSERT INTO admin_event_assignment (user_id, event_id, is_active)
     VALUES ($1, $3, true), ($2, $3, false)`,
    [delegateId, inactiveId, eventId],
  );

  const app = createApp({
    getSession: async ({ headers }) => ({
      admin: { user: { id: adminId, twoFactorEnabled: true } },
      nonAdmin: { user: { id: nonAdminId, twoFactorEnabled: true } },
      noTwoFactor: { user: { id: adminId, twoFactorEnabled: false } },
    })[headers.get("x-test-session")] ?? null,
  });
  await withServer(app, async (baseUrl) => {
    const endpoint = `${baseUrl}/api/v1/events/${eventId}/admin-assignments`;
    assert.equal((await fetch(endpoint)).status, 401);
    assert.equal((await fetch(endpoint, { headers: { "x-test-session": "noTwoFactor" } })).status, 403);
    assert.equal((await fetch(endpoint, { headers: { "x-test-session": "nonAdmin" } })).status, 403);
    assert.deepEqual(await (await fetch(`${baseUrl}/api/v1/events/${randomUUID()}/admin-assignments`, {
      headers: { "x-test-session": "admin" },
    })).json(), { code: "EVENT_NOT_FOUND" });
    assert.deepEqual(await (await fetch(`${baseUrl}/api/v1/events/not-a-uuid/admin-assignments`, {
      headers: { "x-test-session": "admin" },
    })).json(), { code: "VALIDATION_ERROR" });
    const response = await fetch(`${baseUrl}/api/v1/events/${eventId}/admin-assignments`, {
      headers: { "x-test-session": "admin" },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), [{ userId: delegateId }]);
  });
});

test("PUT y DELETE de ADMIN_EVENT devuelven 410 sin mutar asignaciones ni auditar concesión o revocación", {
  skip: !process.env.TEST_DATABASE_URL,
}, async (context) => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const adminId = randomUUID();
  const delegateId = randomUUID();
  const nonAdminId = randomUUID();
  const eventId = randomUUID();
  context.after(async () => {
    const pool = getPool();
    await pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [[adminId, delegateId, nonAdminId]]);
    await pool.query("DELETE FROM carnival_event WHERE id = $1", [eventId]);
    await closePool();
    restoreDatabaseUrl(originalDatabaseUrl);
  });

  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await migrate();
  const pool = getPool();
  await pool.query(
    `INSERT INTO "user" (id, name, email, "emailVerified")
     VALUES ($1, 'Assignment admin', $2, true), ($3, 'Existing delegate', $4, true),
            ($5, 'Non-admin caller', $6, true)`,
    [adminId, `${adminId}@example.test`, delegateId, `${delegateId}@example.test`, nonAdminId, `${nonAdminId}@example.test`],
  );
  await pool.query("INSERT INTO carnival_event (id, name) VALUES ($1, 'Retired assignment event')", [eventId]);
  await pool.query("INSERT INTO user_role (user_id, role_code) VALUES ($1, 'ADMIN')", [adminId]);
  await pool.query(
    "INSERT INTO admin_event_assignment (user_id, event_id, is_active) VALUES ($1, $2, true)",
    [delegateId, eventId],
  );

  const app = createApp({
    getSession: async ({ headers }) => ({
      admin: { user: { id: adminId, twoFactorEnabled: true } },
      nonAdmin: { user: { id: nonAdminId, twoFactorEnabled: true } },
      noTwoFactor: { user: { id: adminId, twoFactorEnabled: false } },
    })[headers.get("x-test-session")] ?? null,
  });
  await withServer(app, async (baseUrl) => {
    const assignmentUrl = `${baseUrl}/api/v1/events/${eventId}/admin-assignments/${delegateId}`;
    const snapshot = await pool.query(
      "SELECT user_id, event_id, is_active FROM admin_event_assignment ORDER BY event_id, user_id",
    );
    const mutationAudits = await pool.query(
      `SELECT count(*)::int AS count FROM audit_event
        WHERE actor_user_id = $1
          AND action IN ('ADMIN_EVENT_ASSIGNMENT_GRANTED', 'ADMIN_EVENT_ASSIGNMENT_REVOKED')`,
      [adminId],
    );

    for (const method of ["PUT", "DELETE"]) {
      assert.equal((await fetch(assignmentUrl, { method })).status, 401);
      assert.equal((await fetch(assignmentUrl, { method, headers: { "x-test-session": "noTwoFactor" } })).status, 403);
      assert.equal((await fetch(assignmentUrl, { method, headers: { "x-test-session": "nonAdmin" } })).status, 403);
      const response = await fetch(assignmentUrl, {
        method,
        headers: { "x-test-session": "admin" },
      });
      assert.equal(response.status, 410);
      assert.deepEqual(await response.json(), { code: "ADMIN_EVENT_ASSIGNMENTS_RETIRED" });
    }

    const after = await pool.query(
      "SELECT user_id, event_id, is_active FROM admin_event_assignment ORDER BY event_id, user_id",
    );
    assert.deepEqual(after.rows, snapshot.rows);
    const afterMutationAudits = await pool.query(
      `SELECT count(*)::int AS count FROM audit_event
        WHERE actor_user_id = $1
          AND action IN ('ADMIN_EVENT_ASSIGNMENT_GRANTED', 'ADMIN_EVENT_ASSIGNMENT_REVOKED')`,
      [adminId],
    );
    assert.equal(afterMutationAudits.rows[0].count, mutationAudits.rows[0].count);

    const readOnlyList = await fetch(`${baseUrl}/api/v1/events/${eventId}/admin-assignments`, {
      headers: { "x-test-session": "admin" },
    });
    assert.equal(readOnlyList.status, 200);
    assert.deepEqual(await readOnlyList.json(), [{ userId: delegateId }]);
  });
});
