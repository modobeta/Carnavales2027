import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import test from "node:test";
import { createApp } from "../app.js";
import { closePool, getPool } from "../db/pool.js";
import { migrate } from "../db/migrate.js";
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

test("la API ADMIN gestiona eventos y jornadas, y bloquea eventos OPEN", {
  skip: !process.env.TEST_DATABASE_URL,
}, async (context) => {
  context.after(async () => {
    await closePool();
    restoreDatabaseUrl();
  });
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await migrate();

  const adminId = randomUUID();
  const eventAdminId = randomUUID();
  const pool = getPool();
  await pool.query(
    `INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, $2, $3, true)`,
    [adminId, "Events admin", `${adminId}@example.test`],
  );
  await pool.query("INSERT INTO user_role (user_id, role_code) VALUES ($1, 'ADMIN')", [adminId]);
  await pool.query(
    `INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, 'Events delegate', $2, true)`,
    [eventAdminId, `${eventAdminId}@example.test`],
  );
  const app = createApp({
    getSession: async ({ headers }) => ({
      admin: { user: { id: adminId, email: `${adminId}@example.test`, name: "Events admin", twoFactorEnabled: true } },
      eventAdmin: { user: { id: eventAdminId, email: `${eventAdminId}@example.test`, name: "Events delegate", twoFactorEnabled: true } },
      noTwoFactor: { user: { id: eventAdminId, email: `${eventAdminId}@example.test`, name: "Events delegate", twoFactorEnabled: false } },
    })[headers.get("x-test-session")] ?? null,
  });

  await withServer(app, async (baseUrl) => {
    const anonymous = await fetch(`${baseUrl}/api/v1/events`);
    assert.equal(anonymous.status, 401);

    const createEvent = await fetch(`${baseUrl}/api/v1/events`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-session": "admin" },
      body: JSON.stringify({ name: "Carnavales API" }),
    });
    assert.equal(createEvent.status, 201);
    const event = await createEvent.json();
    assert.deepEqual(event, { id: event.id, name: "Carnavales API", status: "CONFIGURING", active: true });
    assert.deepEqual(
      (await pool.query("SELECT id, name, status, active FROM carnival_event WHERE id = $1", [event.id])).rows,
      [event],
    );
    const createdEventAudit = await pool.query(
      `SELECT actor_user_id AS "actorUserId", action, entity_type AS "entityType", entity_id AS "entityId"
         FROM audit_event WHERE action = 'EVENT_CREATED' AND entity_id = $1`,
      [event.id],
    );
    assert.deepEqual(createdEventAudit.rows, [{
      actorUserId: adminId,
      action: "EVENT_CREATED",
      entityType: "carnival_event",
      entityId: event.id,
    }]);
    const beforeInvalidCreate = await Promise.all([
      pool.query("SELECT id, name, status, active FROM carnival_event ORDER BY id"),
      pool.query("SELECT id, actor_user_id, action, entity_type, entity_id FROM audit_event ORDER BY id"),
    ]);
    const invalidCreate = await fetch(`${baseUrl}/api/v1/events`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-session": "admin" },
      body: JSON.stringify({ name: "  " }),
    });
    assert.equal(invalidCreate.status, 400);
    assert.deepEqual(await invalidCreate.json(), { code: "VALIDATION_ERROR", message: "name debe ser texto no vacío." });
    assert.deepEqual(
      (await pool.query("SELECT id, name, status, active FROM carnival_event ORDER BY id")).rows,
      beforeInvalidCreate[0].rows,
    );
    assert.deepEqual(
      (await pool.query("SELECT id, actor_user_id, action, entity_type, entity_id FROM audit_event ORDER BY id")).rows,
      beforeInvalidCreate[1].rows,
    );
    await pool.query("INSERT INTO admin_event_assignment (user_id, event_id, is_active) VALUES ($1, $2, true)", [eventAdminId, event.id]);

    const beforeDeniedCreate = await Promise.all([
      pool.query("SELECT id, name, status, active FROM carnival_event ORDER BY id"),
      pool.query("SELECT id, actor_user_id, action, entity_type, entity_id FROM audit_event ORDER BY id"),
    ]);
    for (const [session, expectedStatus, expectedBody] of [
      [null, 401, { code: "UNAUTHENTICATED" }],
      ["noTwoFactor", 403, { code: "TWO_FACTOR_REQUIRED" }],
      ["eventAdmin", 403, { code: "ADMIN_REQUIRED" }],
    ]) {
      const denied = await fetch(`${baseUrl}/api/v1/events`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(session ? { "x-test-session": session } : {}) },
        body: JSON.stringify({ name: "No debe crearse" }),
      });
      assert.equal(denied.status, expectedStatus, `${session ?? "anonymous"} must not create an event`);
      assert.deepEqual(await denied.json(), expectedBody);
    }
    assert.deepEqual(
      (await pool.query("SELECT id, name, status, active FROM carnival_event ORDER BY id")).rows,
      beforeDeniedCreate[0].rows,
    );
    assert.deepEqual(
      (await pool.query("SELECT id, actor_user_id, action, entity_type, entity_id FROM audit_event ORDER BY id")).rows,
      beforeDeniedCreate[1].rows,
    );

    const createNight = await fetch(`${baseUrl}/api/v1/events/${event.id}/nights`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-session": "admin" },
      body: JSON.stringify({ name: "Premios", displayOrder: 1, kind: "AWARDS" }),
    });
    assert.equal(createNight.status, 201);

    const getEvent = await fetch(`${baseUrl}/api/v1/events/${event.id}`, {
      headers: { "x-test-session": "admin" },
    });
    assert.equal(getEvent.status, 200);
    assert.equal((await getEvent.json()).id, event.id);
    const listNights = await fetch(`${baseUrl}/api/v1/events/${event.id}/nights`, {
      headers: { "x-test-session": "admin" },
    });
    assert.equal(listNights.status, 200);
    assert.equal((await listNights.json()).length, 1);

    const updateEvent = await fetch(`${baseUrl}/api/v1/events/${event.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-test-session": "admin" },
      body: JSON.stringify({ name: "Carnavales API editado" }),
    });
    assert.equal(updateEvent.status, 200);

    await pool.query("UPDATE night SET kind='COMPETITION' WHERE event_id=$1", [event.id]);
    const { rows: categories } = await pool.query(
      "INSERT INTO event_category(event_id,name,code,display_order) VALUES($1,'Categoría','CAT_API',1) RETURNING id",
      [event.id],
    );
    const { rows: [troupe] } = await pool.query("INSERT INTO event_troupe(event_id,category_id,name) VALUES($1,$2,'Comparsa') RETURNING id", [event.id, categories[0].id]);
    const { rows: specialties } = await pool.query(
      "INSERT INTO event_specialty(event_id,name,code,display_order) VALUES($1,'Baile','BAILE_API',1) RETURNING id",
      [event.id],
    );
    const { rows: rubrics } = await pool.query(
      "INSERT INTO rubric(event_id,name,code,evaluation_target) VALUES($1,'Rubro','RUBRO_API','TROUPE') RETURNING id",
      [event.id],
    );
    await pool.query(
      "INSERT INTO evaluation_item(event_id,rubric_id,specialty_id,name,code) VALUES($1,$2,$3,'Ítem','ITEM_API')",
      [event.id, rubrics[0].id, specialties[0].id],
    );
    const { rows: [night] } = await pool.query("SELECT id FROM night WHERE event_id=$1", [event.id]);
    await pool.query(
      "INSERT INTO night_troupe_schedule(event_id,night_id,event_troupe_id,presentation_order) VALUES($1,$2,$3,1)",
      [event.id, night.id, troupe.id],
    );
    await seedActiveJudge({ client: pool, eventId: event.id, nightId: night.id, specialtyId: specialties[0].id });
    const { rows: [secondTroupe] } = await pool.query(
      "INSERT INTO event_troupe(event_id,category_id,name) VALUES($1,$2,'Comparsa adicional') RETURNING id",
      [event.id, categories[0].id],
    );
    const { rows: [secondSchedule] } = await pool.query(
      "INSERT INTO night_troupe_schedule(event_id,night_id,event_troupe_id,presentation_order) VALUES($1,$2,$3,2) RETURNING id",
      [event.id, night.id, secondTroupe.id],
    );
    const deniedOpenOperationId = randomUUID();
    const eventAdminAssignment = await pool.query(
      "SELECT is_active FROM admin_event_assignment WHERE user_id=$1 AND event_id=$2",
      [eventAdminId, event.id],
    );
    const eventAdminGlobalRole = await pool.query(
      "SELECT 1 FROM user_role WHERE user_id=$1 AND role_code='ADMIN'",
      [eventAdminId],
    );
    assert.deepEqual(eventAdminAssignment.rows, [{ is_active: true }]);
    assert.equal(eventAdminGlobalRole.rowCount, 0);
    const deniedReorderSchedules = await pool.query(
      "SELECT id FROM night_troupe_schedule WHERE event_id=$1 AND night_id=$2 ORDER BY presentation_order,id",
      [event.id, night.id],
    );
    assert.equal(deniedReorderSchedules.rowCount, 2);

    const delegatedRequests = [
      ["POST", `/events/${event.id}/open`, null, { "Idempotency-Key": deniedOpenOperationId }],
      ["GET", `/events/${event.id}/open-operations/${randomUUID()}`, null],
      ["PATCH", `/events/${event.id}/schedule/reorder`, { nightId: night.id, orderedIds: deniedReorderSchedules.rows.map((row) => row.id) }],
      ["DELETE", `/schedule/${secondSchedule.id}`, null],
    ];
    const auditBeforeDenied = await pool.query(
      `SELECT id,actor_user_id AS "actorUserId",action,entity_type AS "entityType",entity_id AS "entityId",
              before_data AS "beforeData",after_data AS "afterData",created_at AS "createdAt"
         FROM audit_event ORDER BY id`,
    );
    const categoriesBeforeDenied = await pool.query(
      "SELECT id,name,code,display_order FROM event_category WHERE event_id=$1 ORDER BY display_order,id",
      [event.id],
    );
    const scheduleBeforeDenied = await pool.query(
      "SELECT id,presentation_order FROM night_troupe_schedule WHERE event_id=$1 ORDER BY presentation_order,id",
      [event.id],
    );
    const openEvidenceBeforeDenied = await pool.query(
      `SELECT c.operation_id AS "operationId",c.event_id AS "eventId",c.intent,c.actor_user_id AS "actorUserId",
              r.status,r.code,r.details,r.event_result AS "eventResult"
         FROM event_open_operation_claim c
         LEFT JOIN event_open_operation_receipt r USING (operation_id)
        WHERE c.event_id=$1 OR c.operation_id=$2`,
      [event.id, deniedOpenOperationId],
    );
    assert.deepEqual(openEvidenceBeforeDenied.rows, []);
    for (const [method, path, body, extraHeaders = {}] of delegatedRequests) {
      const denied = await fetch(`${baseUrl}/api/v1${path}`, {
        method,
        headers: { "x-test-session": "eventAdmin", ...extraHeaders, ...(body ? { "content-type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      assert.equal(denied.status, 403, `${method} ${path}`);
      assert.deepEqual(await denied.json(), { code: "ADMIN_REQUIRED" }, `${method} ${path}`);
    }
    assert.deepEqual(
      (await pool.query(
        `SELECT id,actor_user_id AS "actorUserId",action,entity_type AS "entityType",entity_id AS "entityId",
                before_data AS "beforeData",after_data AS "afterData",created_at AS "createdAt"
           FROM audit_event ORDER BY id`,
      )).rows,
      auditBeforeDenied.rows,
    );
    assert.deepEqual(
      (await pool.query("SELECT id,name,code,display_order FROM event_category WHERE event_id=$1 ORDER BY display_order,id", [event.id])).rows,
      categoriesBeforeDenied.rows,
    );
    assert.deepEqual(
      (await pool.query("SELECT id,presentation_order FROM night_troupe_schedule WHERE event_id=$1 ORDER BY presentation_order,id", [event.id])).rows,
      scheduleBeforeDenied.rows,
    );
    assert.deepEqual(
      (await pool.query(
        `SELECT c.operation_id AS "operationId",c.event_id AS "eventId",c.intent,c.actor_user_id AS "actorUserId",
                r.status,r.code,r.details,r.event_result AS "eventResult"
           FROM event_open_operation_claim c
           LEFT JOIN event_open_operation_receipt r USING (operation_id)
          WHERE c.event_id=$1 OR c.operation_id=$2`,
        [event.id, deniedOpenOperationId],
      )).rows,
      openEvidenceBeforeDenied.rows,
    );

    const adminList = await fetch(`${baseUrl}/api/v1/events`, { headers: { "x-test-session": "admin" } });
    assert.equal(adminList.status, 200);
    assert.ok((await adminList.json()).some((row) => row.id === event.id));
    const adminDetail = await fetch(`${baseUrl}/api/v1/events/${event.id}`, { headers: { "x-test-session": "admin" } });
    assert.equal(adminDetail.status, 200);
    assert.equal((await adminDetail.json()).id, event.id);
    const adminReadiness = await fetch(`${baseUrl}/api/v1/events/${event.id}/readiness`, { headers: { "x-test-session": "admin" } });
    assert.equal(adminReadiness.status, 200);
    assert.ok(Array.isArray((await adminReadiness.json()).missing));
    const adminCategories = await fetch(`${baseUrl}/api/v1/events/${event.id}/categories`, { headers: { "x-test-session": "admin" } });
    assert.equal(adminCategories.status, 200);
    assert.equal((await adminCategories.json()).length, 1);
    const adminCategoryCreate = await fetch(`${baseUrl}/api/v1/events/${event.id}/categories`, {
      method: "POST", headers: { "x-test-session": "admin", "content-type": "application/json" },
      body: JSON.stringify({ name: "Matrix category", code: "MATRIX_CATEGORY" }),
    });
    assert.equal(adminCategoryCreate.status, 201);
    const matrixCategory = await adminCategoryCreate.json();
    assert.deepEqual(matrixCategory, {
      id: matrixCategory.id,
      eventId: event.id,
      name: "Matrix category",
      code: "MATRIX_CATEGORY",
      displayOrder: matrixCategory.displayOrder,
      active: true,
    });
    const createdCategoryState = await pool.query(
      "SELECT id,name,code,display_order FROM event_category WHERE id=$1",
      [matrixCategory.id],
    );
    assert.deepEqual(createdCategoryState.rows, [{
      id: matrixCategory.id,
      name: "Matrix category",
      code: "MATRIX_CATEGORY",
      display_order: matrixCategory.displayOrder,
    }]);
    const adminCategoryUpdate = await fetch(`${baseUrl}/api/v1/categories/${matrixCategory.id}`, {
      method: "PATCH", headers: { "x-test-session": "admin", "content-type": "application/json" },
      body: JSON.stringify({ name: "Matrix category updated" }),
    });
    assert.equal(adminCategoryUpdate.status, 200);
    assert.deepEqual(await adminCategoryUpdate.json(), { ...matrixCategory, name: "Matrix category updated" });
    assert.equal(
      (await pool.query("SELECT name FROM event_category WHERE id=$1", [matrixCategory.id])).rows[0].name,
      "Matrix category updated",
    );
    const schedules = await pool.query("SELECT id FROM night_troupe_schedule WHERE event_id=$1 ORDER BY presentation_order", [event.id]);
    const adminReorder = await fetch(`${baseUrl}/api/v1/events/${event.id}/schedule/reorder`, {
      method: "PATCH", headers: { "x-test-session": "admin", "content-type": "application/json" },
      body: JSON.stringify({ nightId: night.id, orderedIds: schedules.rows.map((row) => row.id) }),
    });
    assert.equal(adminReorder.status, 200);
    const reorderBody = await adminReorder.json();
    assert.deepEqual(reorderBody, {
      changes: [
        { id: schedules.rows[0].id, presentationOrder: 1 },
        { id: schedules.rows[1].id, presentationOrder: 2 },
      ],
    });
    assert.deepEqual(
      (await pool.query("SELECT id,presentation_order AS \"presentationOrder\" FROM night_troupe_schedule WHERE event_id=$1 ORDER BY presentation_order,id", [event.id])).rows,
      reorderBody.changes,
    );
    const adminScheduleDelete = await fetch(`${baseUrl}/api/v1/schedule/${secondSchedule.id}`, {
      method: "DELETE", headers: { "x-test-session": "admin" },
    });
    assert.equal(adminScheduleDelete.status, 200);
    assert.deepEqual(await adminScheduleDelete.json(), { id: secondSchedule.id });
    assert.equal(
      (await pool.query("SELECT count(*)::int AS count FROM night_troupe_schedule WHERE id=$1", [secondSchedule.id])).rows[0].count,
      0,
    );

    const adminOpenOperationId = randomUUID();
    const openEvent = await fetch(`${baseUrl}/api/v1/events/${event.id}/open`, {
      method: "POST",
      headers: { "x-test-session": "admin", "Idempotency-Key": adminOpenOperationId },
    });
    assert.equal(openEvent.status, 200);
    const opened = await openEvent.json();
    assert.deepEqual(opened, {
      id: event.id,
      name: "Carnavales API editado",
      status: "OPEN",
      operation: {
        operationId: adminOpenOperationId,
        eventId: event.id,
        intent: "OPEN_EVENT",
        status: "applied",
        replayed: false,
      },
    });
    const openedState = await pool.query("SELECT id,status,active FROM carnival_event WHERE id=$1", [event.id]);
    assert.deepEqual(openedState.rows, [{ id: event.id, status: "OPEN", active: true }]);
    const operationStatus = await fetch(`${baseUrl}/api/v1/events/${event.id}/open-operations/${opened.operation.operationId}`, {
      headers: { "x-test-session": "admin" },
    });
    assert.equal(operationStatus.status, 200);
    assert.deepEqual(await operationStatus.json(), {
      operationId: adminOpenOperationId,
      eventId: event.id,
      intent: "OPEN_EVENT",
      status: "applied",
      result: { event: { id: event.id, name: "Carnavales API editado", status: "OPEN" } },
    });
    const deniedOperationStatus = await fetch(`${baseUrl}/api/v1/events/${event.id}/open-operations/${opened.operation.operationId}`, {
      headers: { "x-test-session": "eventAdmin" },
    });
    assert.equal(deniedOperationStatus.status, 403);
    assert.deepEqual(await deniedOperationStatus.json(), { code: "ADMIN_REQUIRED" });
    const lockedUpdate = await fetch(`${baseUrl}/api/v1/events/${event.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-test-session": "admin" },
      body: JSON.stringify({ name: "No permitido" }),
    });
    assert.equal(lockedUpdate.status, 409);
    assert.deepEqual(await lockedUpdate.json(), { code: "EVENT_LOCKED" });

    const { rows: auditRows } = await pool.query(
      "SELECT action FROM audit_event WHERE entity_type IN ('carnival_event', 'night') AND entity_id = $1",
      [event.id],
    );
    assert.ok(auditRows.some((row) => row.action === "EVENT_CREATED"));
    await pool.query("DELETE FROM admin_event_assignment WHERE user_id = $1 AND event_id = $2", [eventAdminId, event.id]);
    await pool.query('DELETE FROM "user" WHERE id = $1', [eventAdminId]);
  });
});

test("GET jornadas autoriza ADMIN_EVENT solo para el evento asignado, aunque esté inactivo", {
  skip: !process.env.TEST_DATABASE_URL,
}, async (context) => {
  const original = process.env.DATABASE_URL;
  const adminId = randomUUID();
  const assignedId = randomUUID();
  const otherAssignedId = randomUUID();
  const revokedId = randomUUID();
  const roleOnlyId = randomUUID();
  const eventId = randomUUID();
  const otherEventId = randomUUID();

  context.after(async () => {
    const pool = getPool();
    await pool.query("DELETE FROM admin_event_assignment WHERE user_id = ANY($1::text[])", [[assignedId, otherAssignedId, revokedId, roleOnlyId]]);
    await pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [[adminId, assignedId, otherAssignedId, revokedId, roleOnlyId]]);
    await pool.query("DELETE FROM night WHERE event_id = ANY($1::uuid[])", [[eventId, otherEventId]]);
    await pool.query("DELETE FROM carnival_event WHERE id = ANY($1::uuid[])", [[eventId, otherEventId]]);
    await closePool();
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
  });

  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await migrate();
  const pool = getPool();
  await pool.query(
    `INSERT INTO "user" (id, name, email, "emailVerified")
     VALUES ($1, 'T1 global admin', $6, true), ($2, 'T1 assigned', $7, true),
            ($3, 'T1 other event', $8, true), ($4, 'T1 revoked', $9, true),
            ($5, 'T1 role only', $10, true)`,
    [adminId, assignedId, otherAssignedId, revokedId,
      roleOnlyId, `${adminId}@example.test`, `${assignedId}@example.test`, `${otherAssignedId}@example.test`,
      `${revokedId}@example.test`, `${roleOnlyId}@example.test`],
  );
  await pool.query("INSERT INTO carnival_event (id, name, active) VALUES ($1, 'T1 inactive', false), ($2, 'T1 other', true)", [eventId, otherEventId]);
  await pool.query("INSERT INTO night (event_id, name, display_order, kind) VALUES ($1, 'Jornada privada', 1, 'AWARDS')", [eventId]);
  await pool.query("INSERT INTO user_role (user_id, role_code) VALUES ($1, 'ADMIN')", [adminId]);
  await pool.query("INSERT INTO user_role (user_id, role_code) VALUES ($1, 'JUDGE')", [roleOnlyId]);
  await pool.query(
    `INSERT INTO admin_event_assignment (user_id, event_id, is_active)
     VALUES ($1, $2, true), ($3, $4, true), ($5, $2, false)`,
    [assignedId, eventId, otherAssignedId, otherEventId, revokedId],
  );

  const app = createApp({
    getSession: async ({ headers }) => ({
      admin: { user: { id: adminId, twoFactorEnabled: true } },
      assigned: { user: { id: assignedId, twoFactorEnabled: true } },
      otherAssigned: { user: { id: otherAssignedId, twoFactorEnabled: true } },
      revoked: { user: { id: revokedId, twoFactorEnabled: true } },
      noTwoFactor: { user: { id: assignedId, twoFactorEnabled: false } },
      wrongRole: { user: { id: roleOnlyId, twoFactorEnabled: true } },
    })[headers.get("x-test-session")] ?? null,
  });

  await withServer(app, async (baseUrl) => {
    const target = `${baseUrl}/api/v1/events/${eventId}/nights`;
    const beforeAudit = await pool.query("SELECT count(*)::int AS count FROM audit_event");
    const beforeNights = await pool.query("SELECT id, event_id, name FROM night WHERE event_id = $1", [eventId]);

    const anonymous = await fetch(target);
    assert.equal(anonymous.status, 401);
    assert.deepEqual(await anonymous.json(), { code: "UNAUTHENTICATED" });
    const noTwoFactor = await fetch(target, { headers: { "x-test-session": "noTwoFactor" } });
    assert.equal(noTwoFactor.status, 403);
    assert.deepEqual(await noTwoFactor.json(), { code: "TWO_FACTOR_REQUIRED" });

    const globalAdmin = await fetch(target, { headers: { "x-test-session": "admin" } });
    assert.equal(globalAdmin.status, 200);
    const expected = await globalAdmin.json();
    assert.equal(expected.length, 1);
    assert.equal(expected[0].eventId, eventId);

    const assigned = await fetch(target, { headers: { "x-test-session": "assigned" } });
    assert.equal(assigned.status, 200);
    assert.deepEqual(await assigned.json(), expected);
    for (const session of ["otherAssigned", "revoked", "wrongRole"]) {
      const denied = await fetch(target, { headers: { "x-test-session": session } });
      assert.equal(denied.status, 403, `${session} must not access the event`);
      assert.deepEqual(await denied.json(), { code: "ADMIN_REQUIRED" });
    }

    const malformed = await fetch(`${baseUrl}/api/v1/events/not-a-uuid/nights`, { headers: { "x-test-session": "admin" } });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), { code: "VALIDATION_ERROR" });
    const missing = await fetch(`${baseUrl}/api/v1/events/${randomUUID()}/nights`, { headers: { "x-test-session": "admin" } });
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { code: "EVENT_NOT_FOUND" });

    assert.deepEqual((await pool.query("SELECT id, event_id, name FROM night WHERE event_id = $1", [eventId])).rows, beforeNights.rows);
    const afterAudit = await pool.query("SELECT count(*)::int AS count FROM audit_event");
    assert.equal(afterAudit.rows[0].count, beforeAudit.rows[0].count);
  });
});

test("fallo al insertar EVENT_CREATED no confirma el evento ni deja auditoría parcial", {
  skip: !process.env.TEST_DATABASE_URL,
}, async (context) => {
  const original = process.env.DATABASE_URL;
  const adminId = randomUUID();
  const eventName = `T2 audit failure ${randomUUID()}`;
  let server;
  const pool = (() => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    return getPool();
  })();

  context.after(async () => {
    try {
      await pool.query("DELETE FROM carnival_event WHERE name = $1", [eventName]);
      await pool.query('DELETE FROM "user" WHERE id = $1', [adminId]);
    } finally {
      await closePool();
      if (original === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = original;
    }
  });

  await migrate();
  await pool.query(
    `INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, 'T2 audit failure admin', $2, true)`,
    [adminId, `${adminId}@example.test`],
  );
  await pool.query("INSERT INTO user_role (user_id, role_code) VALUES ($1, 'ADMIN')", [adminId]);

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
  let interceptionInstalled = false;
  const restoreInterception = () => {
    if (connectDescriptor) Object.defineProperty(pool, "connect", connectDescriptor);
    else delete pool.connect;
    for (const restore of restoreClientQueries.splice(0)) restore();
    interceptionInstalled = false;
  };
  const wrapConnectedClient = (client) => {
    const queryDescriptor = Object.getOwnPropertyDescriptor(client, "query");
    const originalQuery = client.query;
    client.query = function (query, ...queryArgs) {
      if (typeof query === "string" && /^\s*INSERT\s+INTO\s+audit_event\b/i.test(query)) {
        injectedAuditFailureCount += 1;
        return Promise.reject(new Error("Injected EVENT_CREATED audit persistence failure"));
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
  interceptionInstalled = true;

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/events`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-session": "admin" },
      body: JSON.stringify({ name: eventName }),
    });
    assert.ok(response.status >= 400, `fallo de auditoría no debe devolver éxito, recibió HTTP ${response.status}`);
    assert.equal(
      injectedAuditFailureCount,
      1,
      `la petición debe alcanzar exactamente una vez INSERT INTO audit_event: HTTP ${response.status} ${await response.clone().text()}`,
    );
  } finally {
    if (interceptionInstalled) restoreInterception();
    if (server) await new Promise((resolve) => server.close(resolve));
  }

  const event = await pool.query("SELECT id FROM carnival_event WHERE name = $1", [eventName]);
  assert.equal(event.rowCount, 0, "el evento debe revertirse junto con la auditoría fallida");
  const audit = await pool.query(
    `SELECT 1 FROM audit_event
      WHERE actor_user_id = $1 AND action = 'EVENT_CREATED' AND entity_type = 'carnival_event'`,
    [adminId],
  );
  assert.equal(audit.rowCount, 0, "no debe quedar un EVENT_CREATED parcial para el ADMIN del fixture");
});

test("PATCH evento permite campos delegados solo al ADMIN_EVENT asignado y reserva active a ADMIN", {
  skip: !process.env.TEST_DATABASE_URL,
}, async (context) => {
  const original = process.env.DATABASE_URL;
  const ids = Object.fromEntries(["admin", "assigned", "other", "revoked", "judge", "target", "otherEvent", "inactive"]
    .map((key) => [key, randomUUID()]));

  context.after(async () => {
    const pool = getPool();
    await pool.query("DELETE FROM admin_event_assignment WHERE user_id = ANY($1::text[])", [[ids.assigned, ids.other, ids.revoked]]);
    await pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [[ids.admin, ids.assigned, ids.other, ids.revoked, ids.judge]]);
    await pool.query("DELETE FROM carnival_event WHERE id = ANY($1::uuid[])", [[ids.target, ids.otherEvent, ids.inactive]]);
    await closePool();
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
  });

  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await migrate();
  const pool = getPool();
  const users = [ids.admin, ids.assigned, ids.other, ids.revoked, ids.judge];
  await pool.query(
    `INSERT INTO "user" (id, name, email, "emailVerified")
     SELECT id, 'T3 fixture', id || '@example.test', true FROM unnest($1::text[]) AS id`,
    [users],
  );
  await pool.query("INSERT INTO user_role (user_id, role_code) VALUES ($1, 'ADMIN'), ($2, 'JUDGE')", [ids.admin, ids.judge]);
  await pool.query(
    "INSERT INTO carnival_event (id, name, active) VALUES ($1, 'T3 target', true), ($2, 'T3 other', true), ($3, 'T3 inactive', false)",
    [ids.target, ids.otherEvent, ids.inactive],
  );
  await pool.query(
    `INSERT INTO admin_event_assignment (user_id, event_id, is_active)
     VALUES ($1, $2, true), ($3, $4, true), ($5, $2, false)`,
    [ids.assigned, ids.target, ids.other, ids.otherEvent, ids.revoked],
  );

  const sessions = {
    admin: { user: { id: ids.admin, twoFactorEnabled: true } },
    assigned: { user: { id: ids.assigned, twoFactorEnabled: true } },
    other: { user: { id: ids.other, twoFactorEnabled: true } },
    revoked: { user: { id: ids.revoked, twoFactorEnabled: true } },
    judge: { user: { id: ids.judge, twoFactorEnabled: true } },
    noTwoFactor: { user: { id: ids.assigned, twoFactorEnabled: false } },
  };
  const app = createApp({ getSession: async ({ headers }) => sessions[headers.get("x-test-session")] ?? null });

  await withServer(app, async (baseUrl) => {
    const request = (eventId, session, body) => fetch(`${baseUrl}/api/v1/events/${eventId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        ...(session ? { "x-test-session": session } : {}),
      },
      body: JSON.stringify(body),
    });
    const delegatedUpdate = await request(ids.target, "assigned", { name: "T3 delegated name" });
    assert.equal(delegatedUpdate.status, 200);
    assert.deepEqual(await delegatedUpdate.json(), {
      id: ids.target, name: "T3 delegated name", status: "CONFIGURING", active: true,
    });
    assert.deepEqual(
      (await pool.query("SELECT id, name, status, active FROM carnival_event WHERE id = $1", [ids.target])).rows,
      [{ id: ids.target, name: "T3 delegated name", status: "CONFIGURING", active: true }],
    );
    const delegatedAudit = await pool.query(
      `SELECT actor_user_id AS "actorUserId", action, entity_type AS "entityType", entity_id AS "entityId"
         FROM audit_event WHERE action = 'EVENT_UPDATED' AND entity_id = $1 ORDER BY id DESC LIMIT 1`,
      [ids.target],
    );
    assert.deepEqual(delegatedAudit.rows, [{
      actorUserId: ids.assigned, action: "EVENT_UPDATED", entityType: "carnival_event", entityId: ids.target,
    }]);

    const beforeActiveDenied = await pool.query("SELECT id, actor_user_id, action, entity_type, entity_id, after_data FROM audit_event ORDER BY id");
    for (const [eventId, active] of [[ids.target, false], [ids.inactive, true]]) {
      const activeDenied = await request(eventId, "assigned", { active });
      assert.equal(activeDenied.status, 403);
      assert.deepEqual(await activeDenied.json(), { code: "ADMIN_REQUIRED" });
    }
    assert.deepEqual(
      (await pool.query("SELECT id, active FROM carnival_event WHERE id = ANY($1::uuid[]) ORDER BY id", [[ids.target, ids.inactive]])).rows,
      [{ id: ids.target, active: true }, { id: ids.inactive, active: false }].sort((a, b) => a.id.localeCompare(b.id)),
    );
    assert.deepEqual(
      (await pool.query("SELECT id, actor_user_id, action, entity_type, entity_id, after_data FROM audit_event ORDER BY id")).rows,
      beforeActiveDenied.rows,
    );

    const beforeAuthorizationDenials = await pool.query("SELECT id, actor_user_id, action, entity_type, entity_id, after_data FROM audit_event ORDER BY id");
    for (const [eventId, session, body, expectedStatus, expectedBody] of [
      [ids.target, null, { name: "anonymous" }, 401, { code: "UNAUTHENTICATED" }],
      [ids.target, "noTwoFactor", { name: "no 2fa" }, 403, { code: "TWO_FACTOR_REQUIRED" }],
      [ids.target, "judge", { name: "wrong role" }, 403, { code: "ADMIN_REQUIRED" }],
      [ids.otherEvent, "assigned", { name: "other event" }, 403, { code: "ADMIN_REQUIRED" }],
      [ids.target, "other", { name: "no assignment" }, 403, { code: "ADMIN_REQUIRED" }],
      [ids.target, "revoked", { name: "revoked" }, 403, { code: "ADMIN_REQUIRED" }],
      [ids.inactive, "assigned", { name: "inactive" }, 403, { code: "ADMIN_REQUIRED" }],
      ["not-a-uuid", "admin", { name: "invalid" }, 400, { code: "VALIDATION_ERROR" }],
      [randomUUID(), "admin", { name: "missing" }, 404, { code: "EVENT_NOT_FOUND" }],
    ]) {
      const denied = await request(eventId, session, body);
      assert.equal(denied.status, expectedStatus);
      assert.deepEqual(await denied.json(), expectedBody);
    }
    assert.deepEqual(
      (await pool.query("SELECT id, actor_user_id, action, entity_type, entity_id, after_data FROM audit_event ORDER BY id")).rows,
      beforeAuthorizationDenials.rows,
    );
    const unmodified = await pool.query("SELECT id, name, active FROM carnival_event WHERE id = ANY($1::uuid[]) ORDER BY id", [[ids.target, ids.otherEvent, ids.inactive]]);
    assert.deepEqual(unmodified.rows, [
      { id: ids.target, name: "T3 delegated name", active: true },
      { id: ids.otherEvent, name: "T3 other", active: true },
      { id: ids.inactive, name: "T3 inactive", active: false },
    ].sort((a, b) => a.id.localeCompare(b.id)));

    const invalidInput = await request(ids.target, "assigned", { name: "   " });
    assert.equal(invalidInput.status, 400);
    assert.equal((await invalidInput.json()).code, "VALIDATION_ERROR");
    const beforeSpoofedRole = await pool.query("SELECT id, actor_user_id, action, entity_type, entity_id, after_data FROM audit_event ORDER BY id");
    const spoofedRole = await request(ids.target, "other", { name: "spoofed", role: "ADMIN", userId: ids.admin });
    assert.equal(spoofedRole.status, 403);
    assert.deepEqual(await spoofedRole.json(), { code: "ADMIN_REQUIRED" });
    assert.equal((await pool.query("SELECT name FROM carnival_event WHERE id = $1", [ids.target])).rows[0].name, "T3 delegated name");
    assert.deepEqual(
      (await pool.query("SELECT id, actor_user_id, action, entity_type, entity_id, after_data FROM audit_event ORDER BY id")).rows,
      beforeSpoofedRole.rows,
    );

    for (const active of [false, true]) {
      const adminToggle = await request(ids.target, "admin", { active });
      assert.equal(adminToggle.status, 200);
      assert.equal((await adminToggle.json()).active, active);
      assert.equal((await pool.query("SELECT active FROM carnival_event WHERE id=$1", [ids.target])).rows[0].active, active);
    }

    const adminInvalid = await request(ids.target, "admin", { active: "false" });
    assert.equal(adminInvalid.status, 400);
    assert.equal((await adminInvalid.json()).code, "VALIDATION_ERROR");
    assert.ok((await pool.query("SELECT id FROM audit_event WHERE entity_id=$1 AND action='EVENT_UPDATED'", [ids.target])).rowCount >= 3);
  });
});

test("POST jornadas permite a ADMIN_EVENT solo crear en eventos asignados activos", {
  skip: !process.env.TEST_DATABASE_URL,
}, async (context) => {
  const original = process.env.DATABASE_URL;
  const ids = Object.fromEntries(["admin", "assigned", "other", "revoked", "judge", "target", "otherEvent", "revokedEvent", "inactiveEvent", "openEvent"]
    .map((key) => [key, randomUUID()]));

  context.after(async () => {
    const pool = getPool();
    await pool.query("DELETE FROM night WHERE event_id = ANY($1::uuid[])", [[ids.target, ids.otherEvent, ids.revokedEvent, ids.inactiveEvent, ids.openEvent]]);
    await pool.query("DELETE FROM admin_event_assignment WHERE user_id = ANY($1::text[])", [[ids.assigned, ids.other, ids.revoked]]);
    await pool.query("DELETE FROM carnival_event WHERE id = ANY($1::uuid[])", [[ids.target, ids.otherEvent, ids.revokedEvent, ids.inactiveEvent, ids.openEvent]]);
    await pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [[ids.admin, ids.assigned, ids.other, ids.revoked, ids.judge]]);
    await closePool();
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
  });

  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await migrate();
  const pool = getPool();
  await pool.query(
    `INSERT INTO "user" (id, name, email, "emailVerified")
     SELECT id, 'T5 fixture', id || '@example.test', true FROM unnest($1::text[]) AS id`,
    [[ids.admin, ids.assigned, ids.other, ids.revoked, ids.judge]],
  );
  await pool.query("INSERT INTO user_role (user_id, role_code) VALUES ($1, 'ADMIN'), ($2, 'JUDGE')", [ids.admin, ids.judge]);
  await pool.query(
    `INSERT INTO carnival_event (id, name, status, active) VALUES
     ($1, 'T5 target', 'CONFIGURING', true), ($2, 'T5 other', 'CONFIGURING', true),
     ($3, 'T5 revoked', 'CONFIGURING', true), ($4, 'T5 inactive', 'CONFIGURING', false),
     ($5, 'T5 open', 'OPEN', true)`,
    [ids.target, ids.otherEvent, ids.revokedEvent, ids.inactiveEvent, ids.openEvent],
  );
  await pool.query(
    `INSERT INTO admin_event_assignment (user_id, event_id, is_active) VALUES
     ($1, $2, true), ($3, $4, true), ($5, $6, false), ($1, $7, true), ($1, $8, true)`,
    [ids.assigned, ids.target, ids.other, ids.otherEvent, ids.revoked, ids.revokedEvent, ids.inactiveEvent, ids.openEvent],
  );
  const sessions = {
    admin: { user: { id: ids.admin, twoFactorEnabled: true } },
    assigned: { user: { id: ids.assigned, twoFactorEnabled: true } },
    other: { user: { id: ids.other, twoFactorEnabled: true } },
    revoked: { user: { id: ids.revoked, twoFactorEnabled: true } },
    judge: { user: { id: ids.judge, twoFactorEnabled: true } },
    noTwoFactor: { user: { id: ids.assigned, twoFactorEnabled: false } },
  };
  const app = createApp({ getSession: async ({ headers }) => sessions[headers.get("x-test-session")] ?? null });

  await withServer(app, async (baseUrl) => {
    const body = { name: "Jornada delegada", displayOrder: 1, kind: "COMPETITION", role: "ADMIN", userId: ids.admin };
    const request = (eventId, session, payload = body) => fetch(`${baseUrl}/api/v1/events/${eventId}/nights`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(session ? { "x-test-session": session } : {}) },
      body: JSON.stringify(payload),
    });
    const beforeAudit = await pool.query("SELECT count(*)::int AS count FROM audit_event");

    const created = await request(ids.target, "assigned");
    assert.equal(created.status, 201);
    const createdNight = await created.json();
    assert.deepEqual(createdNight, {
      id: createdNight.id,
      eventId: ids.target,
      name: "Jornada delegada",
      displayOrder: 1,
      kind: "COMPETITION",
      status: createdNight.status,
      eventDate: null,
    });
    assert.deepEqual(
      (await pool.query("SELECT id, event_id AS \"eventId\", name, display_order AS \"displayOrder\", kind, status, event_date AS \"eventDate\" FROM night WHERE id=$1", [createdNight.id])).rows,
      [createdNight],
    );
    assert.deepEqual(
      (await pool.query(
        `SELECT actor_user_id AS \"actorUserId\", action, entity_type AS \"entityType\", entity_id AS \"entityId\"
           FROM audit_event WHERE action='NIGHT_CREATED' AND entity_id=$1`,
        [createdNight.id],
      )).rows,
      [{ actorUserId: ids.assigned, action: "NIGHT_CREATED", entityType: "night", entityId: createdNight.id }],
    );

    const cases = [
      [ids.otherEvent, "assigned", 403, { code: "ADMIN_REQUIRED" }],
      [ids.target, "other", 403, { code: "ADMIN_REQUIRED" }],
      [ids.revokedEvent, "revoked", 403, { code: "ADMIN_REQUIRED" }],
      [ids.target, "judge", 403, { code: "ADMIN_REQUIRED" }],
      [ids.inactiveEvent, "assigned", 403, { code: "ADMIN_REQUIRED" }],
      [ids.openEvent, "assigned", 409, { code: "EVENT_LOCKED" }],
      [randomUUID(), "admin", 404, { code: "EVENT_NOT_FOUND" }],
      ["not-a-uuid", "admin", 400, { code: "VALIDATION_ERROR" }],
      [ids.target, null, 401, { code: "UNAUTHENTICATED" }],
      [ids.target, "noTwoFactor", 403, { code: "TWO_FACTOR_REQUIRED" }],
      [ids.target, "assigned", 400, { code: "VALIDATION_ERROR", message: "name debe ser texto no vacío." }, { ...body, name: " " }],
    ];
    const countsBeforeDenials = await Promise.all([
      pool.query("SELECT event_id, id, name FROM night WHERE event_id = ANY($1::uuid[]) ORDER BY event_id, id", [[ids.target, ids.otherEvent, ids.revokedEvent, ids.inactiveEvent, ids.openEvent]]),
      pool.query("SELECT id, actor_user_id, action, entity_type, entity_id FROM audit_event ORDER BY id"),
    ]);
    for (const [eventId, session, status, expected, payload] of cases) {
      const denied = await request(eventId, session, payload ?? body);
      assert.equal(denied.status, status, `${session ?? "anonymous"} POST ${eventId}`);
      assert.deepEqual(await denied.json(), expected);
    }
    assert.deepEqual(
      (await pool.query("SELECT event_id, id, name FROM night WHERE event_id = ANY($1::uuid[]) ORDER BY event_id, id", [[ids.target, ids.otherEvent, ids.revokedEvent, ids.inactiveEvent, ids.openEvent]])).rows,
      countsBeforeDenials[0].rows,
    );
    assert.deepEqual(
      (await pool.query("SELECT id, actor_user_id, action, entity_type, entity_id FROM audit_event ORDER BY id")).rows,
      countsBeforeDenials[1].rows,
    );
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM audit_event")).rows[0].count, beforeAudit.rows[0].count + 1);

    const adminCreate = await request(ids.target, "admin", { name: "Jornada ADMIN", displayOrder: 2, kind: "AWARDS" });
    assert.equal(adminCreate.status, 201);
    const adminNight = await adminCreate.json();
    assert.equal(adminNight.eventId, ids.target);
    assert.equal((await pool.query("SELECT actor_user_id FROM audit_event WHERE action='NIGHT_CREATED' AND entity_id=$1", [adminNight.id])).rows[0].actor_user_id, ids.admin);

    const failedNightName = `T5 audit failure ${randomUUID()}`;
    const auditBeforeFailure = await pool.query("SELECT count(*)::int AS count FROM audit_event");
    const connectDescriptor = Object.getOwnPropertyDescriptor(pool, "connect");
    const originalConnect = pool.connect;
    const restoreClientQueries = [];
    let injectedAuditFailureCount = 0;
    pool.connect = (...args) => {
      const callback = args[0];
      const wrapClient = (client) => {
        const queryDescriptor = Object.getOwnPropertyDescriptor(client, "query");
        const originalQuery = client.query;
        client.query = function (query, ...queryArgs) {
          if (typeof query === "string" && /^\s*INSERT\s+INTO\s+audit_event\b/i.test(query)) {
            injectedAuditFailureCount += 1;
            return Promise.reject(new Error("Injected NIGHT_CREATED audit persistence failure"));
          }
          return originalQuery.call(client, query, ...queryArgs);
        };
        restoreClientQueries.push(() => {
          if (queryDescriptor) Object.defineProperty(client, "query", queryDescriptor);
          else delete client.query;
        });
        return client;
      };
      if (typeof callback === "function") {
        return originalConnect.call(pool, (error, client, release) => {
          if (!error) wrapClient(client);
          callback(error, client, release);
        });
      }
      return originalConnect.call(pool).then(wrapClient);
    };
    let failedAuditResponse;
    try {
      failedAuditResponse = await request(ids.target, "admin", { name: failedNightName, displayOrder: 3, kind: "AWARDS" });
    } finally {
      if (connectDescriptor) Object.defineProperty(pool, "connect", connectDescriptor);
      else delete pool.connect;
      for (const restore of restoreClientQueries) restore();
    }
    assert.ok(failedAuditResponse.status >= 400, "un fallo de auditoría no debe responder éxito");
    assert.equal(injectedAuditFailureCount, 1);
    assert.equal((await pool.query("SELECT 1 FROM night WHERE event_id=$1 AND name=$2", [ids.target, failedNightName])).rowCount, 0);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM audit_event")).rows[0].count, auditBeforeFailure.rows[0].count);
  });
});

test("GET /events/:eventId autoriza el detalle exacto por asignación vigente sin mutaciones", {
  skip: !process.env.TEST_DATABASE_URL,
}, async (context) => {
  const original = process.env.DATABASE_URL;
  const ids = Object.fromEntries(["admin", "assigned", "other", "unassigned", "revoked", "judge", "foreignEvent", "missing"]
    .map((key) => [key, randomUUID()]));
  const userIds = [ids.admin, ids.assigned, ids.other, ids.unassigned, ids.revoked, ids.judge];
  const events = ["CONFIGURING", "OPEN", "CLOSED"].flatMap((status) => [true, false].map((active) => ({
    id: randomUUID(), name: `T2 detail ${status} ${active}`, status, active,
  })));
  const [eventA, eventB] = events;
  const eventIds = [...events.map(({ id }) => id), ids.foreignEvent];

  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  const pool = getPool();
  context.after(async () => {
    try {
      await pool.query("DELETE FROM admin_event_assignment WHERE user_id = ANY($1::text[])", [userIds]);
      await pool.query("DELETE FROM carnival_event WHERE id = ANY($1::uuid[])", [eventIds]);
      await pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [userIds]);
    } finally {
      await closePool();
      if (original === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = original;
    }
  });
  await migrate();
  await pool.query(
    `INSERT INTO "user" (id,name,email,"emailVerified")
     SELECT id, 'T2 detail fixture', id || '@example.test', true FROM unnest($1::text[]) AS id`,
    [userIds],
  );
  await pool.query("INSERT INTO user_role (user_id,role_code) VALUES ($1,'ADMIN'),($2,'JUDGE')", [ids.admin, ids.judge]);
  for (const event of events) {
    await pool.query("INSERT INTO carnival_event (id,name,status,active) VALUES ($1,$2,$3,$4)",
      [event.id, event.name, event.status, event.active]);
    await pool.query("INSERT INTO admin_event_assignment (user_id,event_id,is_active) VALUES ($1,$2,true)", [ids.assigned, event.id]);
  }
  await pool.query("INSERT INTO carnival_event (id,name) VALUES ($1,'T2 foreign detail')", [ids.foreignEvent]);
  await pool.query(
    `INSERT INTO admin_event_assignment (user_id,event_id,is_active) VALUES ($1,$2,true),($3,$4,false)`,
    [ids.other, ids.foreignEvent, ids.revoked, eventA.id],
  );
  const sessions = Object.fromEntries(userIds.map((id) => [id, { user: { id, twoFactorEnabled: true } }]));
  sessions.noTwoFactor = { user: { id: ids.assigned, twoFactorEnabled: false } };
  // Better Auth resolves absent/expired sessions to null; the route must preserve that denial.
  sessions.expired = null;
  const app = createApp({ getSession: async ({ headers }) => sessions[headers.get("x-test-session")] ?? null });

  await withServer(app, async (baseUrl) => {
    // node:http permits exercising an untrusted GET body (fetch forbids it).
    const request = async (eventId, session, { body, headers = {} } = {}) => {
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const result = await new Promise((resolve, reject) => {
        const req = httpRequest(`${baseUrl}/api/v1/events/${eventId}?role=ADMIN&userId=${ids.admin}&eventId=${eventA.id}&active=true`, {
          method: "GET",
          headers: {
            ...(session ? { "x-test-session": session } : {}),
            ...(payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {}),
            ...headers,
          },
        }, (res) => {
          let data = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => { data += chunk; });
          res.on("error", reject);
          res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, text: data }));
        });
        req.on("error", reject);
        req.end(payload);
      });
      assert.equal(result.headers["cache-control"], "no-store, private");
      return { status: result.status, body: JSON.parse(result.text), headers: result.headers };
    };
    const expectResponse = async (eventId, session, status, body, options) => {
      const result = await request(eventId, session, options);
      assert.equal(result.status, status, `${session ?? "anonymous"} GET detail ${eventId}`);
      assert.deepEqual(result.body, body);
      return result;
    };
    const snapshot = async () => {
      const queries = [
        "SELECT * FROM carnival_event ORDER BY id",
        "SELECT * FROM admin_event_assignment ORDER BY user_id,event_id",
        "SELECT * FROM night ORDER BY id",
        "SELECT * FROM event_category ORDER BY id",
        "SELECT * FROM ballot ORDER BY id",
        "SELECT * FROM audit_event ORDER BY id",
        "SELECT * FROM event_open_operation_claim ORDER BY operation_id",
        "SELECT * FROM event_open_operation_receipt ORDER BY operation_id",
      ];
      return Promise.all(queries.map(async (sql) => (await pool.query(sql)).rows));
    };
    const before = await snapshot();
    for (const event of events) {
      // ADMIN has no assignment; delegate has no global role. Exact DTO, no projected fields.
      await expectResponse(event.id, ids.admin, 200, event);
      await expectResponse(event.id, ids.assigned, 200, event);
    }
    for (const session of [ids.other, ids.unassigned, ids.revoked, ids.judge]) {
      for (const eventId of [eventA.id, ids.missing]) {
        await expectResponse(eventId, session, 403, { code: "ADMIN_REQUIRED" });
      }
    }
    await expectResponse(ids.foreignEvent, ids.assigned, 403, { code: "ADMIN_REQUIRED" });
    await expectResponse(ids.missing, ids.assigned, 403, { code: "ADMIN_REQUIRED" });
    await expectResponse(ids.missing, ids.admin, 404, { code: "EVENT_NOT_FOUND" });
    for (const eventId of [eventA.id, ids.missing, "not-a-uuid"]) {
      await expectResponse(eventId, null, 401, { code: "UNAUTHENTICATED" });
      await expectResponse(eventId, "expired", 401, { code: "UNAUTHENTICATED" });
      await expectResponse(eventId, "noTwoFactor", 403, { code: "TWO_FACTOR_REQUIRED" });
    }
    for (const session of [ids.admin, ids.assigned, ids.unassigned]) {
      await expectResponse("not-a-uuid", session, 400, { code: "VALIDATION_ERROR" });
    }
    const spoof = {
      body: { role: "ADMIN", roles: ["ADMIN"], userId: ids.admin, eventId: eventA.id, twoFactorEnabled: true },
      headers: { "x-user-id": ids.admin, "x-role": "ADMIN" },
    };
    await expectResponse(ids.foreignEvent, ids.assigned, 403, { code: "ADMIN_REQUIRED" }, spoof);
    await expectResponse(eventA.id, ids.unassigned, 403, { code: "ADMIN_REQUIRED" }, spoof);
    await expectResponse(eventA.id, "noTwoFactor", 403, { code: "TWO_FACTOR_REQUIRED" }, spoof);
    await expectResponse(eventB.id, ids.assigned, 200, eventB, spoof);

    // Repetition/conditional headers and an opening key cannot turn detail into a receipt/replay.
    const first = await expectResponse(eventA.id, ids.assigned, 200, eventA);
    await expectResponse(eventA.id, ids.assigned, 200, eventA, {
      headers: { "Idempotency-Key": randomUUID() },
    });
    assert.deepEqual(await snapshot(), before);

    await pool.query("UPDATE admin_event_assignment SET is_active=false WHERE user_id=$1 AND event_id=$2", [ids.assigned, eventA.id]);
    const afterRevocation = await snapshot();
    await expectResponse(eventA.id, ids.assigned, 403, { code: "ADMIN_REQUIRED" }, {
      headers: { "If-None-Match": first.headers.etag },
    });
    await expectResponse(eventB.id, ids.assigned, 200, eventB);
    await expectResponse(eventA.id, ids.admin, 200, eventA);
    assert.deepEqual(await snapshot(), afterRevocation);

    await pool.query("UPDATE admin_event_assignment SET is_active=true WHERE user_id=$1 AND event_id=$2", [ids.assigned, eventA.id]);
    await pool.query("INSERT INTO admin_event_assignment (user_id,event_id,is_active) VALUES ($1,$2,true)", [ids.admin, eventA.id]);
    await expectResponse(eventA.id, ids.assigned, 200, eventA);
    await expectResponse(eventA.id, ids.admin, 200, eventA);
    await pool.query("UPDATE admin_event_assignment SET is_active=false WHERE user_id=$1 AND event_id=$2", [ids.admin, eventA.id]);
    const beforeFailures = await snapshot();
    await expectResponse(eventA.id, ids.admin, 200, eventA);

    // Fail only the DB read boundary; restore it even if an assertion fails.
    const descriptor = Object.getOwnPropertyDescriptor(pool, "query");
    const originalQuery = pool.query;
    for (const failedSql of [
      "SELECT id, name, status, active FROM carnival_event WHERE id = $1",
      "SELECT role_code FROM user_role WHERE user_id = $1 ORDER BY role_code",
    ]) {
      pool.query = function (sql, ...args) {
        if (sql === failedSql) return Promise.reject(new Error("Injected detail DB failure: internal SQL must not leak"));
        return originalQuery.call(pool, sql, ...args);
      };
      try {
        for (const session of [ids.admin, ids.assigned]) {
          await expectResponse(eventA.id, session, 500, { code: "INTERNAL_ERROR" });
        }
      } finally {
        if (descriptor) Object.defineProperty(pool, "query", descriptor);
        else delete pool.query;
      }
    }
    await expectResponse(eventA.id, ids.assigned, 200, eventA);
    assert.deepEqual(await snapshot(), beforeFailures);
  });
});

test("GET /events limita el catálogo a las asignaciones ADMIN_EVENT vigentes", {
  skip: !process.env.TEST_DATABASE_URL,
}, async (context) => {
  const original = process.env.DATABASE_URL;
  const ids = Object.fromEntries([
    "admin", "assigned", "otherAssigned", "noAssignment", "revoked", "judge",
    "inactiveEvent", "secondEvent", "otherEvent",
  ].map((key) => [key, randomUUID()]));

  context.after(async () => {
    const pool = getPool();
    await pool.query(
      "DELETE FROM admin_event_assignment WHERE user_id = ANY($1::text[])",
      [[ids.assigned, ids.otherAssigned, ids.noAssignment, ids.revoked]],
    );
    await pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [
      [ids.admin, ids.assigned, ids.otherAssigned, ids.noAssignment, ids.revoked, ids.judge],
    ]);
    await pool.query("DELETE FROM carnival_event WHERE id = ANY($1::uuid[])", [
      [ids.inactiveEvent, ids.secondEvent, ids.otherEvent],
    ]);
    await closePool();
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
  });

  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await migrate();
  const pool = getPool();
  await pool.query(
    `INSERT INTO "user"(id,name,email,"emailVerified") VALUES
      ($1,'T1 catalog ADMIN',$7,true), ($2,'T1 assigned',$8,true),
      ($3,'T1 other owner',$9,true), ($4,'T1 unassigned',$10,true),
      ($5,'T1 revoked',$11,true), ($6,'T1 judge',$12,true)`,
    [
      ids.admin, ids.assigned, ids.otherAssigned, ids.noAssignment, ids.revoked, ids.judge,
      `${ids.admin}@example.test`, `${ids.assigned}@example.test`, `${ids.otherAssigned}@example.test`,
      `${ids.noAssignment}@example.test`, `${ids.revoked}@example.test`, `${ids.judge}@example.test`,
    ],
  );
  await pool.query("INSERT INTO user_role(user_id,role_code) VALUES($1,'ADMIN'),($2,'JUDGE')", [ids.admin, ids.judge]);
  await pool.query(
    `INSERT INTO carnival_event(id,name,status,active) VALUES
      ($1,'T1 inactive assigned','CONFIGURING',false),
      ($2,'T1 second assigned','CONFIGURING',true),
      ($3,'T1 other owner','OPEN',true)`,
    [ids.inactiveEvent, ids.secondEvent, ids.otherEvent],
  );
  await pool.query(
    `INSERT INTO admin_event_assignment(user_id,event_id,is_active) VALUES
      ($1,$2,true), ($1,$3,true), ($4,$5,true), ($6,$2,false)`,
    [ids.assigned, ids.inactiveEvent, ids.secondEvent, ids.otherAssigned, ids.otherEvent, ids.revoked],
  );

  const sessions = {
    admin: { user: { id: ids.admin, twoFactorEnabled: true } },
    assigned: { user: { id: ids.assigned, twoFactorEnabled: true } },
    otherAssigned: { user: { id: ids.otherAssigned, twoFactorEnabled: true } },
    noAssignment: { user: { id: ids.noAssignment, twoFactorEnabled: true } },
    revoked: { user: { id: ids.revoked, twoFactorEnabled: true } },
    judge: { user: { id: ids.judge, twoFactorEnabled: true } },
    noTwoFactor: { user: { id: ids.assigned, twoFactorEnabled: false } },
  };
  const app = createApp({
    getSession: async ({ headers }) => sessions[headers.get("x-test-session")] ?? null,
  });

  await withServer(app, async (baseUrl) => {
    const target = `${baseUrl}/api/v1/events`;
    const before = await Promise.all([
      pool.query("SELECT id,name,status,active FROM carnival_event WHERE id=ANY($1::uuid[]) ORDER BY id", [[ids.inactiveEvent, ids.secondEvent, ids.otherEvent]]),
      pool.query("SELECT id,actor_user_id,action,entity_type,entity_id FROM audit_event ORDER BY id"),
    ]);

    const adminResponse = await fetch(target, { headers: { "x-test-session": "admin" } });
    assert.equal(adminResponse.status, 200);
    const adminEvents = await adminResponse.json();
    assert.ok(Array.isArray(adminEvents));
    assert.deepEqual(
      adminEvents.filter(({ id }) => [ids.inactiveEvent, ids.secondEvent, ids.otherEvent].includes(id))
        .map(({ id, name, status, active }) => ({ id, name, status, active }))
        .sort((left, right) => left.id.localeCompare(right.id)),
      [
        { id: ids.inactiveEvent, name: "T1 inactive assigned", status: "CONFIGURING", active: false },
        { id: ids.secondEvent, name: "T1 second assigned", status: "CONFIGURING", active: true },
        { id: ids.otherEvent, name: "T1 other owner", status: "OPEN", active: true },
      ].sort((left, right) => left.id.localeCompare(right.id)),
    );

    const listSql = "SELECT id, name, status, active FROM carnival_event ORDER BY created_at";
    const poolQueryDescriptor = Object.getOwnPropertyDescriptor(pool, "query");
    const originalPoolQuery = pool.query;
    const withListQueryResult = async (listQuery, run) => {
      pool.query = function (query, ...args) {
        if (query === listSql) return listQuery();
        return originalPoolQuery.call(pool, query, ...args);
      };
      try {
        await run();
      } finally {
        if (poolQueryDescriptor) Object.defineProperty(pool, "query", poolQueryDescriptor);
        else delete pool.query;
      }
    };

    await withListQueryResult(
      async () => ({ rows: [], rowCount: 0 }),
      async () => {
        const emptyCatalog = await fetch(target, { headers: { "x-test-session": "admin" } });
        assert.equal(emptyCatalog.status, 200);
        assert.deepEqual(await emptyCatalog.json(), []);
      },
    );
    await withListQueryResult(
      async () => { throw new Error("Injected catalog query failure"); },
      async () => {
        const failedCatalog = await fetch(target, { headers: { "x-test-session": "admin" } });
        assert.equal(failedCatalog.status, 500);
        assert.deepEqual(await failedCatalog.json(), { code: "INTERNAL_ERROR" });
      },
    );

    const assignedResponse = await fetch(`${target}?role=ADMIN&userId=${ids.admin}`, {
      headers: { "x-test-session": "assigned" },
    });
    assert.equal(assignedResponse.status, 200);
    const assignedEvents = await assignedResponse.json();
    assert.deepEqual(
      assignedEvents.map(({ id, name, status, active }) => ({ id, name, status, active }))
        .sort((left, right) => left.id.localeCompare(right.id)),
      [
        { id: ids.inactiveEvent, name: "T1 inactive assigned", status: "CONFIGURING", active: false },
        { id: ids.secondEvent, name: "T1 second assigned", status: "CONFIGURING", active: true },
      ].sort((left, right) => left.id.localeCompare(right.id)),
    );
    assert.equal(assignedEvents.some(({ id }) => id === ids.otherEvent), false);

    await pool.query(
      "UPDATE admin_event_assignment SET is_active = FALSE WHERE user_id = $1",
      [ids.assigned],
    );
    const revokedAfterRequest = await fetch(`${target}?role=ADMIN&userId=${ids.admin}`, {
      headers: { "x-test-session": "assigned" },
    });
    assert.equal(revokedAfterRequest.status, 403);
    assert.deepEqual(await revokedAfterRequest.json(), { code: "ADMIN_REQUIRED" });

    const denials = [
      [null, 401, { code: "UNAUTHENTICATED" }],
      ["noTwoFactor", 403, { code: "TWO_FACTOR_REQUIRED" }],
      ["noAssignment", 403, { code: "ADMIN_REQUIRED" }],
      ["revoked", 403, { code: "ADMIN_REQUIRED" }],
      ["judge", 403, { code: "ADMIN_REQUIRED" }],
    ];
    for (const [session, status, expected] of denials) {
      const response = await fetch(`${target}?role=ADMIN&userId=${ids.admin}`, {
        headers: session ? { "x-test-session": session } : {},
      });
      assert.equal(response.status, status, `${session ?? "anonymous"} GET /events`);
      assert.deepEqual(await response.json(), expected);
    }

    const after = await Promise.all([
      pool.query("SELECT id,name,status,active FROM carnival_event WHERE id=ANY($1::uuid[]) ORDER BY id", [[ids.inactiveEvent, ids.secondEvent, ids.otherEvent]]),
      pool.query("SELECT id,actor_user_id,action,entity_type,entity_id FROM audit_event ORDER BY id"),
    ]);
    assert.deepEqual(after.map(({ rows }) => rows), before.map(({ rows }) => rows));
  });
});
