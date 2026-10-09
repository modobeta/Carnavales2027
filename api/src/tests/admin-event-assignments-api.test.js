import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createApp } from "../app.js";
import { closePool, getPool } from "../db/pool.js";
import { migrate } from "../db/migrate.js";
import { hasEventAdminAccess } from "../auth/event-admin-access.js";

test("ADMIN lista solo asignaciones activas del evento con acceso global y sin mutar datos", {
  skip: !process.env.TEST_DATABASE_URL,
}, async (context) => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const adminId = randomUUID();
  const eventAdminId = randomUUID();
  const activeUserId = randomUUID();
  const otherEventUserId = randomUUID();
  const inactiveUserId = randomUUID();
  const eventId = randomUUID();
  const otherEventId = randomUUID();
  const emptyEventId = randomUUID();

  context.after(async () => {
    const pool = getPool();
    await pool.query("DELETE FROM \"user\" WHERE id = ANY($1::text[])", [[adminId, eventAdminId, activeUserId, otherEventUserId, inactiveUserId]]);
    await pool.query("DELETE FROM carnival_event WHERE id = ANY($1::uuid[])", [[eventId, otherEventId, emptyEventId]]);
    await closePool();
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  });

  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await migrate();
  const pool = getPool();
  await pool.query(
    `INSERT INTO "user" (id, name, email, "emailVerified")
     VALUES ($1, 'Global admin', $6, true), ($2, 'Event admin', $7, true),
            ($3, 'Active delegate', $8, true), ($4, 'Other-event delegate', $9, true),
            ($5, 'Inactive delegate', $10, true)`,
    [adminId, eventAdminId, activeUserId, otherEventUserId, inactiveUserId,
      `${adminId}@example.test`, `${eventAdminId}@example.test`, `${activeUserId}@example.test`, `${otherEventUserId}@example.test`, `${inactiveUserId}@example.test`],
  );
  await pool.query("INSERT INTO carnival_event (id, name) VALUES ($1, 'Assignment event'), ($2, 'Other assignment event'), ($3, 'Empty assignment event')", [eventId, otherEventId, emptyEventId]);
  await pool.query("INSERT INTO user_role (user_id, role_code) VALUES ($1, 'ADMIN')", [adminId]);
  await pool.query(
    `INSERT INTO admin_event_assignment (user_id, event_id, is_active)
     VALUES ($1, $2, true), ($1, $3, true), ($4, $3, true), ($5, $2, false), ($6, $2, true)`,
    [activeUserId, eventId, otherEventId, otherEventUserId, inactiveUserId, eventAdminId],
  );

  const app = createApp({
    getSession: async ({ headers }) => ({
      admin: { user: { id: adminId, twoFactorEnabled: true } },
      eventAdmin: { user: { id: eventAdminId, twoFactorEnabled: true } },
      noTwoFactor: { user: { id: adminId, twoFactorEnabled: false } },
    })[headers.get("x-test-session")] ?? null,
  });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });

  try {
    const base = `http://127.0.0.1:${server.address().port}/api/v1/events`;
    const auditBefore = await pool.query("SELECT count(*)::int AS count FROM audit_event");
    const assignmentsBefore = await pool.query("SELECT user_id, event_id, is_active FROM admin_event_assignment ORDER BY user_id, event_id");
    assert.deepEqual(await (await fetch(`${base}/${eventId}/admin-assignments`)).json(), { code: "UNAUTHENTICATED" });
    assert.equal((await fetch(`${base}/${eventId}/admin-assignments`)).status, 401);
    assert.deepEqual(await (await fetch(`${base}/${eventId}/admin-assignments`, { headers: { "x-test-session": "noTwoFactor" } })).json(), { code: "TWO_FACTOR_REQUIRED" });
    assert.equal((await fetch(`${base}/${eventId}/admin-assignments`, { headers: { "x-test-session": "noTwoFactor" } })).status, 403);
    const denied = await fetch(`${base}/${eventId}/admin-assignments`, { headers: { "x-test-session": "eventAdmin" } });
    assert.equal(denied.status, 403);
    assert.deepEqual(await denied.json(), { code: "ADMIN_REQUIRED" });

    const list = await fetch(`${base}/${eventId}/admin-assignments`, { headers: { "x-test-session": "admin" } });
    assert.equal(list.status, 200);
    assert.deepEqual(await list.json(), [{ userId: activeUserId }, { userId: eventAdminId }].sort((a, b) => a.userId.localeCompare(b.userId)));

    const emptyList = await fetch(`${base}/${emptyEventId}/admin-assignments`, { headers: { "x-test-session": "admin" } });
    assert.equal(emptyList.status, 200);
    assert.deepEqual(await emptyList.json(), []);

    const empty = await fetch(`${base}/${randomUUID()}/admin-assignments`, { headers: { "x-test-session": "admin" } });
    assert.equal(empty.status, 404);
    assert.deepEqual(await empty.json(), { code: "EVENT_NOT_FOUND" });
    const malformed = await fetch(`${base}/not-a-uuid/admin-assignments`, { headers: { "x-test-session": "admin" } });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), { code: "VALIDATION_ERROR" });

    const assignmentsAfter = await pool.query("SELECT user_id, event_id, is_active FROM admin_event_assignment ORDER BY user_id, event_id");
    assert.equal(assignmentsAfter.rowCount, assignmentsBefore.rowCount);
    assert.deepEqual(assignmentsAfter.rows, assignmentsBefore.rows);
    const auditAfter = await pool.query("SELECT count(*)::int AS count FROM audit_event");
    assert.equal(auditAfter.rows[0].count, auditBefore.rows[0].count);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("ADMIN concede y reactiva ADMIN_EVENT idempotentemente y audita cada solicitud autorizada", {
  skip: !process.env.TEST_DATABASE_URL,
}, async (context) => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const adminId = randomUUID();
  const delegateId = randomUUID();
  const eventId = randomUUID();
  const otherEventId = randomUUID();
  const missingUserId = randomUUID();
  const missingEventId = randomUUID();

  context.after(async () => {
    const pool = getPool();
    await pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [[adminId, delegateId]]);
    await pool.query("DELETE FROM carnival_event WHERE id = ANY($1::uuid[])", [[eventId, otherEventId]]);
    await closePool();
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  });

  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await migrate();
  const pool = getPool();
  await pool.query(
    `INSERT INTO "user" (id, name, email, "emailVerified")
     VALUES ($1, 'Global admin T2', $3, true), ($2, 'Delegate T2', $4, true)`,
    [adminId, delegateId, `${adminId}@example.test`, `${delegateId}@example.test`],
  );
  await pool.query("INSERT INTO carnival_event (id, name) VALUES ($1, 'Grant event'), ($2, 'Other grant event')", [eventId, otherEventId]);
  await pool.query("INSERT INTO user_role (user_id, role_code) VALUES ($1, 'ADMIN')", [adminId]);
  await pool.query(
    "INSERT INTO admin_event_assignment (user_id, event_id, is_active) VALUES ($1, $2, false)",
    [delegateId, eventId],
  );

  const app = createApp({
    getSession: async ({ headers }) => ({
      admin: { user: { id: adminId, twoFactorEnabled: true } },
      eventAdmin: { user: { id: delegateId, twoFactorEnabled: true } },
      noTwoFactor: { user: { id: adminId, twoFactorEnabled: false } },
    })[headers.get("x-test-session")] ?? null,
  });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });

  try {
    const base = `http://127.0.0.1:${server.address().port}/api/v1/events`;
    const url = (event, user) => `${base}/${event}/admin-assignments/${user}`;
    const authorized = { "x-test-session": "admin" };
    const deniedRequests = [
      fetch(url(eventId, delegateId), { method: "PUT" }),
      fetch(url(eventId, delegateId), { method: "PUT", headers: { "x-test-session": "noTwoFactor" } }),
      fetch(url(eventId, delegateId), { method: "PUT", headers: { "x-test-session": "eventAdmin" } }),
    ];
    const denied = await Promise.all(deniedRequests);
    assert.deepEqual(denied.map((response) => response.status), [401, 403, 403]);

    const put = async (target, headers = authorized) => fetch(target, { method: "PUT", headers });
    const activated = await put(url(eventId, delegateId));
    assert.equal(activated.status, 200);
    assert.deepEqual(await activated.json(), { active: true });
    const grantedAssignments = await fetch(`${base}/${eventId}/admin-assignments`, { headers: authorized });
    assert.equal(grantedAssignments.status, 200);
    assert.ok((await grantedAssignments.json()).some(({ userId }) => userId === delegateId));
    assert.equal(await hasEventAdminAccess({ userId: delegateId, eventId, db: pool }), true);
    assert.equal(await hasEventAdminAccess({ userId: delegateId, eventId: otherEventId, db: pool }), false);

    const repeated = await put(url(eventId, delegateId));
    assert.equal(repeated.status, 200);
    assert.deepEqual(await repeated.json(), { active: true });
    const afterRepeat = await pool.query(
      "SELECT is_active FROM admin_event_assignment WHERE user_id = $1 AND event_id = $2",
      [delegateId, eventId],
    );
    assert.deepEqual(afterRepeat.rows, [{ is_active: true }]);

    await pool.query("UPDATE admin_event_assignment SET is_active = false WHERE user_id = $1 AND event_id = $2", [delegateId, eventId]);
    const reactivated = await put(url(eventId, delegateId));
    assert.equal(reactivated.status, 200);
    assert.deepEqual(await reactivated.json(), { active: true });
    const reactivatedAssignments = await fetch(`${base}/${eventId}/admin-assignments`, { headers: authorized });
    assert.equal(reactivatedAssignments.status, 200);
    assert.ok((await reactivatedAssignments.json()).some(({ userId }) => userId === delegateId));

    const rejectedRequests = [
      [url("invalid", delegateId), 400],
      [url(eventId, "invalid"), 400],
      [url(missingEventId, delegateId), 404],
      [url(eventId, missingUserId), 404],
    ];
    for (const [target, expectedStatus] of rejectedRequests) {
      const response = await put(target);
      assert.equal(response.status, expectedStatus);
    }

    assert.deepEqual(await pool.query("SELECT is_active FROM admin_event_assignment WHERE user_id = $1 AND event_id = $2", [delegateId, eventId]).then(({ rows }) => rows), [{ is_active: true }]);
    assert.equal(await pool.query("SELECT 1 FROM admin_event_assignment WHERE user_id = $1 AND event_id = $2", [missingUserId, eventId]).then(({ rowCount }) => rowCount), 0);
    assert.equal(await pool.query("SELECT 1 FROM user_role WHERE user_id = $1 AND role_code = 'ADMIN_EVENT'", [delegateId]).then(({ rowCount }) => rowCount), 0);

    const audits = await pool.query(
      `SELECT action, entity_type, entity_id, after_data
         FROM audit_event WHERE actor_user_id = $1 AND action = 'ADMIN_EVENT_ASSIGNMENT_GRANTED'
        ORDER BY created_at, id`,
      [adminId],
    );
    assert.equal(audits.rowCount, 7);
    assert.ok(audits.rows.every((event) => event.entity_type === "admin_event_assignment"));
    assert.ok(audits.rows.some((event) => event.entity_id.includes(missingUserId)));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("fallo al persistir auditoría de PUT no confirma ni la asignación ni un evento parcial", {
  skip: !process.env.TEST_DATABASE_URL,
}, async (context) => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const adminId = randomUUID();
  const delegateId = randomUUID();
  const eventId = randomUUID();

  context.after(async () => {
    const pool = getPool();
    await pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [[adminId, delegateId]]);
    await pool.query("DELETE FROM carnival_event WHERE id = $1", [eventId]);
    await closePool();
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  });

  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await migrate();
  const pool = getPool();
  await pool.query(
    `INSERT INTO "user" (id, name, email, "emailVerified")
     VALUES ($1, 'Global admin audit failure', $3, true), ($2, 'Delegate audit failure', $4, true)`,
    [adminId, delegateId, `${adminId}@example.test`, `${delegateId}@example.test`],
  );
  await pool.query("INSERT INTO carnival_event (id, name) VALUES ($1, 'Audit failure event')", [eventId]);
  await pool.query("INSERT INTO user_role (user_id, role_code) VALUES ($1, 'ADMIN')", [adminId]);

  const app = createApp({
    getSession: async ({ headers }) => headers.get("x-test-session") === "admin"
      ? { user: { id: adminId, twoFactorEnabled: true } }
      : null,
  });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });

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
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/v1/events/${eventId}/admin-assignments/${delegateId}`,
      { method: "PUT", headers: { "x-test-session": "admin" } },
    );
    assert.ok(response.status >= 400, `fallo de auditoría no debe devolver éxito, recibió HTTP ${response.status}`);
    assert.equal(injectedAuditFailureCount, 1, `falló antes del INSERT auditado: HTTP ${response.status} ${await response.clone().text()}`);

    const assignment = await pool.query(
      "SELECT is_active FROM admin_event_assignment WHERE user_id = $1 AND event_id = $2",
      [delegateId, eventId],
    );
    assert.equal(assignment.rowCount, 0);
    const audit = await pool.query(
      `SELECT 1 FROM audit_event
        WHERE actor_user_id = $1 AND action = 'ADMIN_EVENT_ASSIGNMENT_GRANTED' AND entity_id = $2`,
      [adminId, `${eventId}:${delegateId}`],
    );
    assert.equal(audit.rowCount, 0);
  } finally {
    if (connectDescriptor) Object.defineProperty(pool, "connect", connectDescriptor);
    else delete pool.connect;
    for (const restore of restoreClientQueries) restore();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("ADMIN revoca solo la pareja del evento, audita no-op y rechazos, y conserva ADMIN global", {
  skip: !process.env.TEST_DATABASE_URL,
}, async (context) => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const adminId = randomUUID();
  const delegateId = randomUUID();
  const unassignedUserId = randomUUID();
  const missingUserId = randomUUID();
  const eventId = randomUUID();
  const otherEventId = randomUUID();
  const missingEventId = randomUUID();

  context.after(async () => {
    const pool = getPool();
    await pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [[adminId, delegateId, unassignedUserId]]);
    await pool.query("DELETE FROM carnival_event WHERE id = ANY($1::uuid[])", [[eventId, otherEventId]]);
    await closePool();
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  });

  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await migrate();
  const pool = getPool();
  await pool.query(
    `INSERT INTO "user" (id, name, email, "emailVerified")
     VALUES ($1, 'Global admin DELETE', $4, true), ($2, 'Delegate DELETE', $5, true),
            ($3, 'Unassigned DELETE', $6, true)`,
    [adminId, delegateId, unassignedUserId, `${adminId}@example.test`, `${delegateId}@example.test`, `${unassignedUserId}@example.test`],
  );
  await pool.query("INSERT INTO carnival_event (id, name) VALUES ($1, 'Delete event'), ($2, 'Other delete event')", [eventId, otherEventId]);
  await pool.query("INSERT INTO user_role (user_id, role_code) VALUES ($1, 'ADMIN')", [adminId]);
  await pool.query(
    `INSERT INTO admin_event_assignment (user_id, event_id, is_active)
     VALUES ($1, $2, true), ($1, $3, true), ($4, $2, true)`,
    [delegateId, eventId, otherEventId, adminId],
  );

  const app = createApp({
    getSession: async ({ headers }) => ({
      admin: { user: { id: adminId, twoFactorEnabled: true } },
      eventAdmin: { user: { id: delegateId, twoFactorEnabled: true } },
      noTwoFactor: { user: { id: adminId, twoFactorEnabled: false } },
    })[headers.get("x-test-session")] ?? null,
  });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });

  try {
    const base = `http://127.0.0.1:${server.address().port}/api/v1/events`;
    const url = (event, user) => `${base}/${event}/admin-assignments/${user}`;
    const authorized = { "x-test-session": "admin" };
    const auditStart = await pool.query(
      "SELECT count(*)::int AS count FROM audit_event WHERE actor_user_id = $1",
      [adminId],
    );
    const denied = await Promise.all([
      fetch(url(eventId, delegateId), { method: "DELETE" }),
      fetch(url(eventId, delegateId), { method: "DELETE", headers: { "x-test-session": "noTwoFactor" } }),
      fetch(url(eventId, delegateId), { method: "DELETE", headers: { "x-test-session": "eventAdmin" } }),
    ]);
    assert.deepEqual(denied.map(({ status }) => status), [401, 403, 403]);

    const revoke = async (target) => fetch(target, { method: "DELETE", headers: authorized });
    const revoked = await revoke(url(eventId, delegateId));
    assert.equal(revoked.status, 200);
    assert.deepEqual(await revoked.json(), { active: false });
    const list = await fetch(`${base}/${eventId}/admin-assignments`, { headers: authorized });
    assert.equal(list.status, 200);
    assert.deepEqual(await list.json(), [{ userId: adminId }]);
    assert.equal(await hasEventAdminAccess({ userId: delegateId, eventId, db: pool }), false);
    assert.equal(await hasEventAdminAccess({ userId: delegateId, eventId: otherEventId, db: pool }), true);

    for (const target of [url(eventId, delegateId), url(eventId, unassignedUserId)]) {
      const noOp = await revoke(target);
      assert.equal(noOp.status, 200);
      assert.deepEqual(await noOp.json(), { active: false });
    }
    for (const [target, expectedStatus, expectedCode] of [
      [url("invalid", delegateId), 400, "VALIDATION_ERROR"],
      [url(eventId, "invalid"), 400, "VALIDATION_ERROR"],
      [url(missingEventId, delegateId), 404, "EVENT_NOT_FOUND"],
      [url(eventId, missingUserId), 404, "USER_NOT_FOUND"],
    ]) {
      const rejected = await revoke(target);
      assert.equal(rejected.status, expectedStatus);
      assert.deepEqual(await rejected.json(), { code: expectedCode });
    }

    const selfRevoke = await revoke(url(eventId, adminId));
    assert.equal(selfRevoke.status, 200);
    assert.deepEqual(await selfRevoke.json(), { active: false });
    assert.equal(await hasEventAdminAccess({ userId: adminId, eventId, db: pool }), true);
    assert.deepEqual(
      await pool.query("SELECT role_code FROM user_role WHERE user_id = $1 ORDER BY role_code", [adminId]).then(({ rows }) => rows),
      [{ role_code: "ADMIN" }],
    );

    const audits = await pool.query(
      `SELECT action, entity_id, after_data
         FROM audit_event
        WHERE actor_user_id = $1 AND action = 'ADMIN_EVENT_ASSIGNMENT_REVOKED'
        ORDER BY created_at, id`,
      [adminId],
    );
    assert.equal(audits.rowCount, 8);
    assert.equal(audits.rows.filter(({ after_data: after }) => after?.active === false).length, 8);
    assert.equal(audits.rows.filter(({ after_data: after }) => after?.outcome === "rejected").length, 4);
    const auditEnd = await pool.query(
      "SELECT count(*)::int AS count FROM audit_event WHERE actor_user_id = $1",
      [adminId],
    );
    assert.equal(auditEnd.rows[0].count - auditStart.rows[0].count, 8);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("fallo al auditar DELETE hace rollback y PUT/DELETE concurrentes serializan la pareja", {
  skip: !process.env.TEST_DATABASE_URL,
}, async (context) => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const adminId = randomUUID();
  const delegateId = randomUUID();
  const eventId = randomUUID();
  let server;

  context.after(async () => {
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    const pool = getPool();
    await pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [[adminId, delegateId]]);
    await pool.query("DELETE FROM carnival_event WHERE id = $1", [eventId]);
    await closePool();
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  });

  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await migrate();
  const pool = getPool();
  await pool.query(
    `INSERT INTO "user" (id, name, email, "emailVerified")
     VALUES ($1, 'Global admin DELETE atomicity', $3, true), ($2, 'Delegate DELETE atomicity', $4, true)`,
    [adminId, delegateId, `${adminId}@example.test`, `${delegateId}@example.test`],
  );
  await pool.query("INSERT INTO carnival_event (id, name) VALUES ($1, 'Delete atomicity event')", [eventId]);
  await pool.query("INSERT INTO user_role (user_id, role_code) VALUES ($1, 'ADMIN')", [adminId]);
  await pool.query(
    "INSERT INTO admin_event_assignment (user_id, event_id, is_active) VALUES ($1, $2, true)",
    [delegateId, eventId],
  );

  const app = createApp({
    getSession: async ({ headers }) => headers.get("x-test-session") === "admin"
      ? { user: { id: adminId, twoFactorEnabled: true } }
      : null,
  });
  server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const connectDescriptor = Object.getOwnPropertyDescriptor(pool, "connect");
  const originalConnect = pool.connect;
  const restoreClientQueries = [];
  let injectedAuditFailureCount = 0;
  let injectAuditFailure = true;
  const wrapConnectedClient = (client) => {
    const queryDescriptor = Object.getOwnPropertyDescriptor(client, "query");
    const originalQuery = client.query;
    client.query = function (query, ...queryArgs) {
      if (injectAuditFailure && typeof query === "string" && /^\s*INSERT\s+INTO\s+audit_event\b/i.test(query)) {
        injectAuditFailure = false;
        injectedAuditFailureCount += 1;
        return Promise.reject(new Error("Injected DELETE audit persistence failure"));
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

  const base = `http://127.0.0.1:${server.address().port}/api/v1/events/${eventId}/admin-assignments/${delegateId}`;
  try {
    const failedDelete = await fetch(base, { method: "DELETE", headers: { "x-test-session": "admin" } });
    assert.ok(failedDelete.status >= 400, `fallo de auditoría no debe devolver éxito, recibió HTTP ${failedDelete.status}`);
    assert.equal(injectedAuditFailureCount, 1);
    assert.deepEqual(
      await pool.query("SELECT is_active FROM admin_event_assignment WHERE user_id = $1 AND event_id = $2", [delegateId, eventId]).then(({ rows }) => rows),
      [{ is_active: true }],
    );
    assert.equal(await pool.query(
      `SELECT 1 FROM audit_event WHERE actor_user_id = $1 AND action = 'ADMIN_EVENT_ASSIGNMENT_REVOKED' AND entity_id = $2`,
      [adminId, `${eventId}:${delegateId}`],
    ).then(({ rowCount }) => rowCount), 0);
  } finally {
    if (connectDescriptor) Object.defineProperty(pool, "connect", connectDescriptor);
    else delete pool.connect;
    for (const restore of restoreClientQueries) restore();
  }

  await pool.query(
    "UPDATE admin_event_assignment SET is_active = FALSE WHERE user_id = $1 AND event_id = $2",
    [delegateId, eventId],
  );
  const url = base;
  const concurrentStart = await pool.query(
    `SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) AS event_ids FROM audit_event
      WHERE actor_user_id = $1 AND entity_id = $2
        AND action IN ('ADMIN_EVENT_ASSIGNMENT_GRANTED', 'ADMIN_EVENT_ASSIGNMENT_REVOKED')`,
    [adminId, `${eventId}:${delegateId}`],
  );
  try {
    const [put, del] = await Promise.all([
      fetch(url, { method: "PUT", headers: { "x-test-session": "admin" } }),
      fetch(url, { method: "DELETE", headers: { "x-test-session": "admin" } }),
    ]);
    assert.deepEqual([put.status, del.status], [200, 200]);
    assert.deepEqual(await put.json(), { active: true });
    assert.deepEqual(await del.json(), { active: false });

    const audits = await pool.query(
      `WITH RECURSIVE targets AS (
         SELECT id, action, after_data, btrim(previous_hash) AS previous_hash,
                btrim(event_hash) AS event_hash, hash_chain_version
           FROM audit_event
          WHERE actor_user_id = $1 AND entity_id = $2
            AND action IN ('ADMIN_EVENT_ASSIGNMENT_GRANTED', 'ADMIN_EVENT_ASSIGNMENT_REVOKED')
            AND id <> ALL($3::uuid[])
       ), chain_walk(start_id, current_hash, depth, visited_hashes, cycle_detected) AS (
         SELECT id, event_hash, 0, ARRAY[event_hash], FALSE
           FROM targets
          WHERE hash_chain_version = 2
         UNION ALL
         SELECT walk.start_id, btrim(next.event_hash), walk.depth + 1,
                walk.visited_hashes || btrim(next.event_hash),
                btrim(next.event_hash) = ANY(walk.visited_hashes)
           FROM chain_walk AS walk
           JOIN audit_event AS next
             ON next.hash_chain_version = 2
            AND btrim(next.previous_hash) = walk.current_hash
          WHERE NOT walk.cycle_detected
            AND walk.depth < (SELECT count(*) FROM audit_event WHERE hash_chain_version = 2)
       )
       SELECT targets.*,
              EXISTS (
                SELECT 1 FROM chain_walk
                 WHERE start_id <> targets.id AND current_hash = targets.event_hash AND depth > 0
              ) AS follows_other_target,
              EXISTS (SELECT 1 FROM chain_walk WHERE cycle_detected) AS has_cycle,
              EXISTS (
                SELECT 1
                  FROM chain_walk AS walk
                 WHERE (SELECT count(*) FROM audit_event AS successor
                         WHERE successor.hash_chain_version = 2
                           AND btrim(successor.previous_hash) = walk.current_hash) > 1
              ) AS has_ambiguous_successor
         FROM targets`,
      [adminId, `${eventId}:${delegateId}`, concurrentStart.rows[0].event_ids],
    );
    assert.equal(audits.rowCount, 2, "los dos requests concurrentes deben generar exactamente dos eventos nuevos");
    assert.ok(audits.rows.every((audit) => audit.hash_chain_version === 2), "ambos eventos deben pertenecer a la cadena general v2");
    assert.ok(audits.rows.every((audit) => !audit.has_cycle), "la cadena enlazada no debe contener ciclos");
    assert.ok(audits.rows.every((audit) => !audit.has_ambiguous_successor), "cada hash recorrido debe tener como máximo un sucesor");
    const [grantAudit] = audits.rows.filter((audit) => audit.action === "ADMIN_EVENT_ASSIGNMENT_GRANTED");
    const [revokeAudit] = audits.rows.filter((audit) => audit.action === "ADMIN_EVENT_ASSIGNMENT_REVOKED");
    assert.ok(grantAudit && revokeAudit, "debe existir exactamente una concesión y una revocación concurrentes");
    assert.notEqual(grantAudit.event_hash, revokeAudit.event_hash, "los eventos deben ocupar posiciones distintas en la cadena");
    assert.notEqual(
      grantAudit.follows_other_target,
      revokeAudit.follows_other_target,
      "exactamente uno de los dos hashes debe seguir al otro en la cadena",
    );
    const lastAudit = grantAudit.follows_other_target ? grantAudit : revokeAudit;
    const effective = await pool.query(
      "SELECT is_active FROM admin_event_assignment WHERE user_id = $1 AND event_id = $2",
      [delegateId, eventId],
    );
    assert.equal(effective.rows[0].is_active, lastAudit.action === "ADMIN_EVENT_ASSIGNMENT_GRANTED");
    assert.equal(lastAudit.after_data.active, lastAudit.action === "ADMIN_EVENT_ASSIGNMENT_GRANTED");
    assert.equal(lastAudit.after_data.active, effective.rows[0].is_active);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
