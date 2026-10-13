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

test("API schedule: programar y quitar comparsas de la jornada", {
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
    `INSERT INTO "user"(id, name, email, "emailVerified") VALUES ($1, 'Admin sched2', $2, true)`,
    [adminId, `${adminId}@example.test`],
  );
  await pool.query("INSERT INTO user_role (user_id, role_code) VALUES ($1, 'ADMIN')", [adminId]);

  const { rows: [event] } = await pool.query(
    "INSERT INTO carnival_event(name) VALUES($1) RETURNING id", ["Schedule Programming Event"],
  );
  const { rows: [night] } = await pool.query(
    "INSERT INTO night(event_id, name, display_order, kind, status) VALUES($1,$2,$3,$4,$5) RETURNING id",
    [event.id, "Noche 1", 1, "COMPETITION", "DRAFT"],
  );
  const { rows: [category] } = await pool.query(
    "INSERT INTO event_category(event_id, name, code, display_order) VALUES($1,$2,$3,$4) RETURNING id",
    [event.id, "Primera", "PRIMERA", 1],
  );
  const { rows: [troupeA] } = await pool.query(
    "INSERT INTO event_troupe(event_id, category_id, name) VALUES($1,$2,$3) RETURNING id",
    [event.id, category.id, "Comparsa A"],
  );
  const { rows: [troupeB] } = await pool.query(
    "INSERT INTO event_troupe(event_id, category_id, name) VALUES($1,$2,$3) RETURNING id",
    [event.id, category.id, "Comparsa B"],
  );

  const app = createApp({ getSession: async ({ headers }) => headers.get("x-test-session") === "admin" ? { user: { id: adminId, twoFactorEnabled: true } } : null });
  await withServer(app, async (baseUrl) => {
    const headers = { "content-type": "application/json", "x-test-session": "admin" };

    const addA = await fetch(`${baseUrl}/api/v1/events/${event.id}/schedule`, {
      method: "POST", headers,
      body: JSON.stringify({ nightId: night.id, troupeId: troupeA.id }),
    });
    assert.equal(addA.status, 201);
    const savedA = await addA.json();
    assert.equal(savedA.presentationOrder, 1);

    const addB = await fetch(`${baseUrl}/api/v1/events/${event.id}/schedule`, {
      method: "POST", headers,
      body: JSON.stringify({ nightId: night.id, troupeId: troupeB.id }),
    });
    assert.equal(addB.status, 201);
    assert.equal((await addB.json()).presentationOrder, 2);

    const duplicate = await fetch(`${baseUrl}/api/v1/events/${event.id}/schedule`, {
      method: "POST", headers,
      body: JSON.stringify({ nightId: night.id, troupeId: troupeA.id }),
    });
    assert.equal(duplicate.status, 409);
    assert.equal((await duplicate.json()).code, "SCHEDULE_CONFLICT");

    const scheduleId = savedA.id;
    const remove = await fetch(`${baseUrl}/api/v1/schedule/${scheduleId}`, { method: "DELETE", headers });
    assert.equal(remove.status, 200);

    const missing = await fetch(`${baseUrl}/api/v1/schedule/${scheduleId}`, { method: "DELETE", headers });
    assert.equal(missing.status, 404);

    const remaining = await pool.query("SELECT COUNT(*)::int AS n FROM night_troupe_schedule WHERE event_id=$1", [event.id]);
    assert.equal(remaining.rows[0].n, 1);
  });
});

test("API troupe creation appends the troupe to every existing night in its event only", {
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
    `INSERT INTO "user"(id, name, email, "emailVerified") VALUES ($1, 'Admin schedule creation', $2, true)`,
    [adminId, `${adminId}@example.test`],
  );
  await pool.query("INSERT INTO user_role (user_id, role_code) VALUES ($1, 'ADMIN')", [adminId]);

  const { rows: [event] } = await pool.query(
    "INSERT INTO carnival_event(name) VALUES($1) RETURNING id", ["Schedule auto-add event"],
  );
  const { rows: [otherEvent] } = await pool.query(
    "INSERT INTO carnival_event(name) VALUES($1) RETURNING id", ["Schedule isolated event"],
  );
  const addNight = async (eventId, name, displayOrder) => {
    const { rows: [night] } = await pool.query(
      "INSERT INTO night(event_id, name, display_order, kind, status) VALUES($1,$2,$3,'COMPETITION','DRAFT') RETURNING id",
      [eventId, name, displayOrder],
    );
    return night;
  };
  const nights = [await addNight(event.id, "Noche A", 1), await addNight(event.id, "Noche B", 2)];
  const otherNight = await addNight(otherEvent.id, "Noche ajena", 1);
  const addCategory = async (eventId, name) => {
    const { rows: [category] } = await pool.query(
      "INSERT INTO event_category(event_id, name, code, display_order) VALUES($1,$2,$3,1) RETURNING id",
      [eventId, name, `${name.replaceAll(" ", "_")}_${randomUUID()}`],
    );
    return category;
  };
  const category = await addCategory(event.id, "Primera");
  const otherCategory = await addCategory(otherEvent.id, "Otra");
  const addTroupe = async (eventId, categoryId, name) => {
    const { rows: [troupe] } = await pool.query(
      "INSERT INTO event_troupe(event_id, category_id, name) VALUES($1,$2,$3) RETURNING id",
      [eventId, categoryId, name],
    );
    return troupe;
  };
  const existingTroupes = [
    await addTroupe(event.id, category.id, "Comparsa A"),
    await addTroupe(event.id, category.id, "Comparsa B"),
  ];
  const otherTroupe = await addTroupe(otherEvent.id, otherCategory.id, "Comparsa ajena");

  const app = createApp({ getSession: async ({ headers }) => headers.get("x-test-session") === "admin" ? { user: { id: adminId, twoFactorEnabled: true } } : null });
  await withServer(app, async (baseUrl) => {
    const headers = { "content-type": "application/json", "x-test-session": "admin" };
    const previousEntries = [];
    for (const night of nights) {
      for (const troupe of existingTroupes) {
        const response = await fetch(`${baseUrl}/api/v1/events/${event.id}/schedule`, {
          method: "POST", headers,
          body: JSON.stringify({ nightId: night.id, troupeId: troupe.id }),
        });
        assert.equal(response.status, 201);
        const entry = await response.json();
        previousEntries.push({ id: entry.id, nightId: night.id, troupeId: troupe.id, presentationOrder: entry.presentationOrder });
      }
    }
    const otherEntryResponse = await fetch(`${baseUrl}/api/v1/events/${otherEvent.id}/schedule`, {
      method: "POST", headers,
      body: JSON.stringify({ nightId: otherNight.id, troupeId: otherTroupe.id }),
    });
    assert.equal(otherEntryResponse.status, 201);
    const otherEntry = await otherEntryResponse.json();

    const { rows: historicalAudit } = await pool.query(
      `SELECT id, actor_user_id, action, entity_type, entity_id, before_data, after_data
         FROM audit_event WHERE after_data->>'eventId'=$1 ORDER BY id`,
      [event.id],
    );

    const createdResponse = await fetch(`${baseUrl}/api/v1/events/${event.id}/troupes`, {
      method: "POST", headers,
      body: JSON.stringify({ name: "Comparsa nueva", categoryId: category.id, actorUserId: randomUUID() }),
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();

    const { rows: resultingEntries } = await pool.query(
      `SELECT id, night_id AS "nightId", event_troupe_id AS "troupeId", presentation_order AS "presentationOrder"
         FROM night_troupe_schedule WHERE event_id=$1 ORDER BY night_id, presentation_order`,
      [event.id],
    );
    assert.equal(resultingEntries.length, nights.length * (existingTroupes.length + 1));
    for (const prior of previousEntries) {
      assert.deepEqual(resultingEntries.find(({ id }) => id === prior.id), prior);
    }
    for (const night of nights) {
      const nightEntries = resultingEntries.filter((entry) => entry.nightId === night.id);
      assert.deepEqual(nightEntries.map((entry) => entry.troupeId), [
        ...existingTroupes.map(({ id }) => id), created.id,
      ]);
      assert.deepEqual(nightEntries.map(({ presentationOrder }) => presentationOrder), [1, 2, 3]);
    }
    const { rows: otherEntries } = await pool.query(
      "SELECT id FROM night_troupe_schedule WHERE event_id=$1 ORDER BY id", [otherEvent.id],
    );
    assert.deepEqual(otherEntries, [{ id: otherEntry.id }]);
    const { rows: scheduledAudits } = await pool.query(
      `SELECT actor_user_id AS "actorUserId", entity_id AS "entityId"
         FROM audit_event
        WHERE action='NIGHT_TROUPE_SCHEDULED' AND after_data->>'troupeId'=$1
        ORDER BY after_data->>'nightId'`,
      [created.id],
    );
    assert.equal(scheduledAudits.length, nights.length);
    assert.deepEqual(scheduledAudits.map(({ actorUserId, entityId }) => ({ actorUserId, entityId })).sort((a, b) => a.entityId.localeCompare(b.entityId)),
      resultingEntries.filter(({ troupeId }) => troupeId === created.id)
        .map(({ id }) => ({ actorUserId: adminId, entityId: id }))
        .sort((a, b) => a.entityId.localeCompare(b.entityId)));
    const { rows: auditAfterCreation } = await pool.query(
      `SELECT id, actor_user_id, action, entity_type, entity_id, before_data, after_data
         FROM audit_event WHERE after_data->>'eventId'=$1 ORDER BY id`,
      [event.id],
    );
    assert.deepEqual(auditAfterCreation.filter(({ id }) => historicalAudit.some((entry) => entry.id === id)), historicalAudit);
  });
});

test("API night creation schedules active troupes in creation order and leaves an empty night unready", {
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
    `INSERT INTO "user"(id, name, email, "emailVerified") VALUES ($1, 'Admin night programming', $2, true)`,
    [adminId, `${adminId}@example.test`],
  );
  await pool.query("INSERT INTO user_role (user_id, role_code) VALUES ($1, 'ADMIN')", [adminId]);

  const { rows: [event] } = await pool.query(
    "INSERT INTO carnival_event(name) VALUES($1) RETURNING id", ["Automatic night schedule"],
  );
  const { rows: [otherEvent] } = await pool.query(
    "INSERT INTO carnival_event(name) VALUES($1) RETURNING id", ["Foreign automatic schedule"],
  );
  const addCategory = async (eventId, name) => {
    const { rows: [category] } = await pool.query(
      "INSERT INTO event_category(event_id, name, code, display_order) VALUES($1,$2,$3,1) RETURNING id",
      [eventId, name, `${name}_${randomUUID()}`],
    );
    return category;
  };
  const category = await addCategory(event.id, "Main");
  const otherCategory = await addCategory(otherEvent.id, "Foreign");
  const addTroupe = async (eventId, categoryId, name, active = true) => {
    const { rows: [troupe] } = await pool.query(
      `INSERT INTO event_troupe(event_id, category_id, name, active, created_at)
       VALUES($1,$2,$3,$4,CURRENT_TIMESTAMP + ($5::integer * INTERVAL '1 second')) RETURNING id`,
      [eventId, categoryId, name, active, addTroupe.sequence++],
    );
    return troupe;
  };
  addTroupe.sequence = 0;
  const createdFirst = await addTroupe(event.id, category.id, "Zulu first");
  const inactive = await addTroupe(event.id, category.id, "Alpha inactive", false);
  const createdSecond = await addTroupe(event.id, category.id, "Beta second");
  await addTroupe(otherEvent.id, otherCategory.id, "Foreign troupe");

  const app = createApp({ getSession: async ({ headers }) => headers.get("x-test-session") === "admin" ? { user: { id: adminId, twoFactorEnabled: true } } : null });
  await withServer(app, async (baseUrl) => {
    const headers = { "content-type": "application/json", "x-test-session": "admin" };
    const createNight = async (eventId, displayOrder, name, actorUserId) => fetch(`${baseUrl}/api/v1/events/${eventId}/nights`, {
      method: "POST", headers,
      body: JSON.stringify({ name, displayOrder, kind: "COMPETITION", ...(actorUserId ? { actorUserId } : {}) }),
    });

    const createdNightResponse = await createNight(event.id, 1, "Noche nueva", randomUUID());
    assert.equal(createdNightResponse.status, 201);
    const createdNight = await createdNightResponse.json();
    const { rows: scheduled } = await pool.query(
      `SELECT s.event_troupe_id AS "troupeId", t.name AS "troupeName", s.presentation_order AS "presentationOrder"
         FROM night_troupe_schedule s JOIN event_troupe t ON t.id=s.event_troupe_id
        WHERE s.night_id=$1 ORDER BY s.presentation_order`,
      [createdNight.id],
    );
    assert.deepEqual(scheduled, [
      { troupeId: createdFirst.id, troupeName: "Zulu first", presentationOrder: 1 },
      { troupeId: createdSecond.id, troupeName: "Beta second", presentationOrder: 2 },
    ]);
    const { rows: scheduleAudits } = await pool.query(
      `SELECT actor_user_id AS "actorUserId", entity_id AS "entityId"
         FROM audit_event WHERE action='NIGHT_TROUPE_SCHEDULED' AND after_data->>'nightId'=$1`,
      [createdNight.id],
    );
    assert.equal(scheduleAudits.length, 2);
    assert.deepEqual(scheduleAudits.map(({ actorUserId }) => actorUserId), [adminId, adminId]);
    const { rows: scheduledRows } = await pool.query(
      "SELECT id FROM night_troupe_schedule WHERE night_id=$1 ORDER BY presentation_order", [createdNight.id],
    );
    assert.deepEqual(scheduleAudits.map(({ entityId }) => entityId).sort(), scheduledRows.map(({ id }) => id).sort());

    const emptyEventResponse = await pool.query("INSERT INTO carnival_event(name) VALUES('No troupes') RETURNING id");
    const emptyEventId = emptyEventResponse.rows[0].id;
    const emptyNightResponse = await createNight(emptyEventId, 1, "Sin comparsas");
    assert.equal(emptyNightResponse.status, 201);
    const emptyNight = await emptyNightResponse.json();
    const { rows: emptyRows } = await pool.query(
      "SELECT id FROM night_troupe_schedule WHERE night_id=$1", [emptyNight.id],
    );
    assert.deepEqual(emptyRows, []);
    const readiness = await fetch(`${baseUrl}/api/v1/events/${emptyEventId}/readiness`, { headers });
    assert.equal(readiness.status, 200);
    const readinessBody = await readiness.json();
    assert.equal(readinessBody.ready, false);
    assert.ok(readinessBody.incompleteSchedules.some(({ nightId }) => nightId === emptyNight.id));
    assert.ok(!scheduled.some(({ troupeId }) => troupeId === inactive.id));

    const { rows: foreignRows } = await pool.query(
      "SELECT COUNT(*)::int AS count FROM night_troupe_schedule WHERE event_id=$1", [otherEvent.id],
    );
    assert.equal(foreignRows[0].count, 0);
  });
});

test("API troupe activity toggles preserve the scheduled row, position, and active-state views", {
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
    `INSERT INTO "user"(id, name, email, "emailVerified") VALUES ($1, 'Admin troupe activity', $2, true)`,
    [adminId, `${adminId}@example.test`],
  );
  await pool.query("INSERT INTO user_role (user_id, role_code) VALUES ($1, 'ADMIN')", [adminId]);
  const { rows: [event] } = await pool.query(
    "INSERT INTO carnival_event(name) VALUES($1) RETURNING id", ["Troupe activity schedule"],
  );
  const { rows: [category] } = await pool.query(
    "INSERT INTO event_category(event_id, name, code, display_order) VALUES($1,$2,$3,1) RETURNING id",
    [event.id, "Activity", `ACT_${randomUUID()}`],
  );
  const { rows: [night] } = await pool.query(
    "INSERT INTO night(event_id, name, display_order, kind, status) VALUES($1,$2,1,'COMPETITION','DRAFT') RETURNING id",
    [event.id, "Noche activity"],
  );
  const addTroupe = async (name) => {
    const { rows: [troupe] } = await pool.query(
      "INSERT INTO event_troupe(event_id, category_id, name) VALUES($1,$2,$3) RETURNING id",
      [event.id, category.id, name],
    );
    return troupe;
  };
  const first = await addTroupe("Comparsa a conservar");
  const second = await addTroupe("Comparsa posterior");

  const app = createApp({ getSession: async ({ headers }) => headers.get("x-test-session") === "admin" ? { user: { id: adminId, twoFactorEnabled: true } } : null });
  await withServer(app, async (baseUrl) => {
    const headers = { "content-type": "application/json", "x-test-session": "admin" };
    const addScheduleEntry = async (troupeId) => fetch(`${baseUrl}/api/v1/events/${event.id}/schedule`, {
      method: "POST", headers, body: JSON.stringify({ nightId: night.id, troupeId }),
    });
    assert.equal((await addScheduleEntry(first.id)).status, 201);
    assert.equal((await addScheduleEntry(second.id)).status, 201);

    const initial = await (await fetch(`${baseUrl}/api/v1/events/${event.id}/schedule?nightId=${night.id}`, { headers })).json();
    const preservedEntry = initial.find(({ troupeId }) => troupeId === first.id);
    assert.ok(preservedEntry);
    assert.deepEqual(initial.map(({ id, presentationOrder }) => ({ id, presentationOrder })), [
      { id: initial[0].id, presentationOrder: 1 },
      { id: initial[1].id, presentationOrder: 2 },
    ]);

    for (const active of [false, true, false, true]) {
      const update = await fetch(`${baseUrl}/api/v1/troupes/${first.id}`, {
        method: "PATCH", headers, body: JSON.stringify({ active }),
      });
      assert.equal(update.status, 200);
      assert.equal((await update.json()).active, active);

      const schedule = await (await fetch(`${baseUrl}/api/v1/events/${event.id}/schedule?nightId=${night.id}`, { headers })).json();
      assert.deepEqual(schedule.map(({ id, troupeId, presentationOrder }) => ({ id, troupeId, presentationOrder })), [
        { id: initial[0].id, troupeId: first.id, presentationOrder: 1 },
        { id: initial[1].id, troupeId: second.id, presentationOrder: 2 },
      ]);
      assert.equal(schedule.filter(({ troupeId }) => troupeId === first.id).length, 1);

      const listedTroupes = await (await fetch(`${baseUrl}/api/v1/events/${event.id}/troupes`, { headers })).json();
      assert.equal(listedTroupes.find(({ id }) => id === first.id)?.active, active);
    }
    assert.equal(preservedEntry.presentationOrder, 1);
  });
});

test("API automatic programming rejects invalid and locked creations without partial rows or audits, and does not backfill", {
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
    `INSERT INTO "user"(id, name, email, "emailVerified") VALUES ($1, 'Admin lifecycle', $2, true)`,
    [adminId, `${adminId}@example.test`],
  );
  await pool.query("INSERT INTO user_role (user_id, role_code) VALUES ($1, 'ADMIN')", [adminId]);

  const events = {};
  for (const [key, status] of [["configuring", "CONFIGURING"], ["open", "OPEN"], ["closed", "CLOSED"]]) {
    const { rows: [event] } = await pool.query(
      "INSERT INTO carnival_event(name, status) VALUES($1, $2) RETURNING id",
      [`Automatic schedule ${key}`, status],
    );
    events[key] = event;
  }
  const configuringEvent = events.configuring;
  {
    const { rows: [category] } = await pool.query(
      "INSERT INTO event_category(event_id, name, code, display_order) VALUES($1,$2,$3,1) RETURNING id",
      [configuringEvent.id, "Category configuring", `CAT_configuring_${randomUUID()}`],
    );
    const { rows: [night] } = await pool.query(
      "INSERT INTO night(event_id, name, display_order, kind) VALUES($1,$2,1,'COMPETITION') RETURNING id",
      [configuringEvent.id, "Night configuring"],
    );
    const { rows: [troupe] } = await pool.query(
      "INSERT INTO event_troupe(event_id, category_id, name) VALUES($1,$2,$3) RETURNING id",
      [configuringEvent.id, category.id, "Troupe configuring"],
    );
    Object.assign(events.configuring, { categoryId: category.id, nightId: night.id, troupeId: troupe.id });
  }

  const app = createApp({ getSession: async ({ headers }) => headers.get("x-test-session") === "admin" ? { user: { id: adminId, twoFactorEnabled: true } } : null });
  await withServer(app, async (baseUrl) => {
    const headers = { "content-type": "application/json", "x-test-session": "admin" };
    const snapshot = async () => Promise.all([
      pool.query("SELECT id,event_id FROM event_troupe WHERE event_id=ANY($1::uuid[]) ORDER BY id", [Object.values(events).map(({ id }) => id)]),
      pool.query("SELECT id,event_id,night_id,event_troupe_id,presentation_order FROM night_troupe_schedule WHERE event_id=ANY($1::uuid[]) ORDER BY id", [Object.values(events).map(({ id }) => id)]),
      pool.query("SELECT action,entity_type,entity_id,after_data FROM audit_event WHERE entity_id=ANY($1::text[]) OR after_data->>'eventId'=ANY($2::text[]) ORDER BY id", [
        Object.values(events).map(({ id }) => id),
        Object.values(events).map(({ id }) => id),
      ]),
    ]);

    // Resources created before this feature are not retrospectively scheduled.
    const preexisting = await pool.query(
      "SELECT id FROM night_troupe_schedule WHERE event_id=$1", [events.configuring.id],
    );
    assert.deepEqual(preexisting.rows, []);

    const before = await snapshot();
    const invalidTroupe = await fetch(`${baseUrl}/api/v1/events/${events.configuring.id}/troupes`, {
      method: "POST", headers,
      body: JSON.stringify({ name: "  ", categoryId: events.configuring.categoryId }),
    });
    assert.equal(invalidTroupe.status, 400);
    assert.equal((await invalidTroupe.json()).code, "VALIDATION_ERROR");
    const invalidNight = await fetch(`${baseUrl}/api/v1/events/${events.configuring.id}/nights`, {
      method: "POST", headers,
      body: JSON.stringify({ name: "  ", displayOrder: 2, kind: "COMPETITION" }),
    });
    assert.equal(invalidNight.status, 400);
    assert.equal((await invalidNight.json()).code, "VALIDATION_ERROR");
    assert.deepEqual((await snapshot()).map(({ rows }) => rows), before.map(({ rows }) => rows));

    for (const key of ["open", "closed"]) {
      const event = events[key];
      const createTroupe = await fetch(`${baseUrl}/api/v1/events/${event.id}/troupes`, {
        method: "POST", headers,
        body: JSON.stringify({ name: `Rejected troupe ${key}`, categoryId: event.categoryId }),
      });
      assert.equal(createTroupe.status, 409, `${key} troupe create`);
      assert.equal((await createTroupe.json()).code, "EVENT_LOCKED");
      const createNight = await fetch(`${baseUrl}/api/v1/events/${event.id}/nights`, {
        method: "POST", headers,
        body: JSON.stringify({ name: `Rejected night ${key}`, displayOrder: 2, kind: "COMPETITION" }),
      });
      assert.equal(createNight.status, 409, `${key} night create`);
      assert.equal((await createNight.json()).code, "EVENT_LOCKED");
    }
    assert.deepEqual((await snapshot()).map(({ rows }) => rows), before.map(({ rows }) => rows));
    assert.deepEqual(
      (await pool.query("SELECT id FROM night_troupe_schedule WHERE event_id=$1", [events.configuring.id])).rows,
      [],
      "rechazos de validación no programan las filas de recursos anteriores",
    );
  });
});

test("API automatic programming rolls back each creation, all schedule rows, and audit evidence after row or audit failure", {
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
    `INSERT INTO "user"(id, name, email, "emailVerified") VALUES ($1, 'Admin schedule rollback', $2, true)`,
    [adminId, `${adminId}@example.test`],
  );
  await pool.query("INSERT INTO user_role (user_id, role_code) VALUES ($1, 'ADMIN')", [adminId]);
  const app = createApp({ getSession: async ({ headers }) => headers.get("x-test-session") === "admin" ? { user: { id: adminId, twoFactorEnabled: true } } : null });
  const { rows: [categoryEvent] } = await pool.query(
    "INSERT INTO carnival_event(name) VALUES('Schedule rollback troupe') RETURNING id",
  );
  const { rows: [category] } = await pool.query(
    "INSERT INTO event_category(event_id,name,code,display_order) VALUES($1,'Rollback','ROLLBACK',1) RETURNING id",
    [categoryEvent.id],
  );
  for (const [index, name] of ["Night one", "Night two"].entries()) {
    await pool.query(
      "INSERT INTO night(event_id,name,display_order,kind) VALUES($1,$2,$3,'COMPETITION')",
      [categoryEvent.id, name, index + 1],
    );
  }
  const { rows: [nightEvent] } = await pool.query(
    "INSERT INTO carnival_event(name) VALUES('Schedule rollback night') RETURNING id",
  );
  const { rows: [nightCategory] } = await pool.query(
    "INSERT INTO event_category(event_id,name,code,display_order) VALUES($1,'Rollback night','ROLLBACK_NIGHT',1) RETURNING id",
    [nightEvent.id],
  );
  for (const name of ["Troupe one", "Troupe two"]) {
    await pool.query(
      "INSERT INTO event_troupe(event_id,category_id,name) VALUES($1,$2,$3)",
      [nightEvent.id, nightCategory.id, name],
    );
  }

  const snapshot = async (eventId) => Promise.all([
    pool.query("SELECT id FROM event_troupe WHERE event_id=$1 ORDER BY id", [eventId]),
    pool.query("SELECT id FROM night WHERE event_id=$1 ORDER BY id", [eventId]),
    pool.query("SELECT id,night_id,event_troupe_id,presentation_order FROM night_troupe_schedule WHERE event_id=$1 ORDER BY id", [eventId]),
    pool.query(
      `SELECT id,actor_user_id,action,entity_type,entity_id,before_data,after_data
         FROM audit_event
        WHERE after_data->>'eventId'=$1 OR entity_id=$1
        ORDER BY id`,
      [eventId],
    ),
  ]);

  for (const [resourceKind, event, failureStage] of [
    ["troupe", categoryEvent, "row"],
    ["troupe", categoryEvent, "audit"],
    ["night", nightEvent, "row"],
    ["night", nightEvent, "audit"],
  ]) {
    const before = await snapshot(event.id);
    const originalConnect = pool.connect;
    const restores = [];
    let scheduleInsertCount = 0;
    let failures = 0;
    const connectMock = context.mock.method(pool, "connect", function (...args) {
      const wrap = (client) => {
        const descriptor = Object.getOwnPropertyDescriptor(client, "query");
        const originalQuery = client.query;
        client.query = async function (query, ...queryArgs) {
          if (typeof query === "string" && /^\s*INSERT\s+INTO\s+night_troupe_schedule\b/i.test(query)) {
            scheduleInsertCount += 1;
            if (failureStage === "row" && scheduleInsertCount === 2) {
              failures += 1;
              throw new Error("Injected schedule row failure");
            }
          }
          if (typeof query === "string" && /^\s*INSERT\s+INTO\s+audit_event\b/i.test(query)
              && queryArgs[0]?.[2] === "NIGHT_TROUPE_SCHEDULED" && failureStage === "audit") {
            failures += 1;
            throw new Error("Injected schedule audit failure");
          }
          return originalQuery.call(client, query, ...queryArgs);
        };
        restores.push(() => {
          if (descriptor) Object.defineProperty(client, "query", descriptor);
          else delete client.query;
        });
        return client;
      };
      if (typeof args[0] === "function") return originalConnect.call(pool, (error, client, release) => args[0](error, error ? client : wrap(client), release));
      return originalConnect.call(pool).then(wrap);
    });

    let response;
    try {
      await withServer(app, async (baseUrl) => {
        const headers = { "content-type": "application/json", "x-test-session": "admin" };
        if (resourceKind === "troupe") {
          response = await fetch(`${baseUrl}/api/v1/events/${event.id}/troupes`, {
            method: "POST", headers,
            body: JSON.stringify({ name: `Rejected automatic troupe ${failureStage}`, categoryId: category.id }),
          });
        } else {
          response = await fetch(`${baseUrl}/api/v1/events/${event.id}/nights`, {
            method: "POST", headers,
            body: JSON.stringify({ name: `Rejected automatic night ${failureStage}`, displayOrder: 1, kind: "COMPETITION" }),
          });
        }
      });
    } finally {
      connectMock.mock.restore();
      for (const restore of restores.reverse()) restore();
    }
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { code: "INTERNAL_ERROR" });
    assert.equal(failures, 1);
    assert.equal(scheduleInsertCount, failureStage === "row" ? 2 : 1);
    assert.deepEqual((await snapshot(event.id)).map(({ rows }) => rows), before.map(({ rows }) => rows));
  }
});

test("concurrent troupe and night creation serialize on the event and leave one valid schedule row", {
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
    `INSERT INTO "user"(id, name, email, "emailVerified") VALUES ($1, 'Concurrent Schedule Admin', $2, true)`,
    [adminId, `${adminId}@example.test`],
  );
  await pool.query("INSERT INTO user_role (user_id, role_code) VALUES ($1, 'ADMIN')", [adminId]);
  const { rows: [event] } = await pool.query("INSERT INTO carnival_event(name) VALUES('Concurrent schedule event') RETURNING id");
  const { rows: [category] } = await pool.query(
    "INSERT INTO event_category(event_id,name,code,display_order) VALUES($1,'Concurrent','CONCURRENT',1) RETURNING id",
    [event.id],
  );
  const app = createApp({ getSession: async ({ headers }) => headers.get("x-test-session") === "admin" ? { user: { id: adminId, twoFactorEnabled: true } } : null });
  const blocker = await pool.connect();
  let requests;
  try {
    await blocker.query("BEGIN");
    await blocker.query("SELECT id FROM carnival_event WHERE id=$1 FOR UPDATE", [event.id]);
    await withServer(app, async (baseUrl) => {
      const headers = { "content-type": "application/json", "x-test-session": "admin" };
      requests = Promise.all([
        fetch(`${baseUrl}/api/v1/events/${event.id}/troupes`, {
          method: "POST", headers,
          body: JSON.stringify({ name: "Concurrent troupe", categoryId: category.id }),
        }),
        fetch(`${baseUrl}/api/v1/events/${event.id}/nights`, {
          method: "POST", headers,
          body: JSON.stringify({ name: "Concurrent night", displayOrder: 1, kind: "COMPETITION" }),
        }),
      ]);

      let waitingTroupeInserts = 0;
      let waitingNightInserts = 0;
      for (let attempt = 0; attempt < 200; attempt += 1) {
        const { rows: [activity] } = await pool.query(
          `SELECT COUNT(*) FILTER (WHERE query ~* '^INSERT\\s+INTO\\s+event_troupe')::int AS troupes,
                  COUNT(*) FILTER (WHERE query ~* '^INSERT\\s+INTO\\s+night')::int AS nights
             FROM pg_stat_activity
            WHERE datname=current_database() AND wait_event_type='Lock'`,
        );
        waitingTroupeInserts = activity.troupes;
        waitingNightInserts = activity.nights;
        if (waitingTroupeInserts === 1 && waitingNightInserts === 1) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.equal(waitingTroupeInserts, 1, "troupe request reached the event lock");
      assert.equal(waitingNightInserts, 1, "night request reached the event lock");
      await blocker.query("COMMIT");

      const [troupeResponse, nightResponse] = await requests;
      assert.equal(troupeResponse.status, 201);
      assert.equal(nightResponse.status, 201);
      const [troupe, night] = await Promise.all([troupeResponse.json(), nightResponse.json()]);
      const { rows } = await pool.query(
        `SELECT event_troupe_id AS "troupeId", presentation_order AS "presentationOrder"
           FROM night_troupe_schedule WHERE event_id=$1 AND night_id=$2`,
        [event.id, night.id],
      );
      assert.deepEqual(rows, [{ troupeId: troupe.id, presentationOrder: 1 }]);
    });
  } catch (error) {
    await blocker.query("ROLLBACK").catch(() => {});
    if (requests) await Promise.allSettled([requests]);
    throw error;
  } finally {
    blocker.release();
  }
});

test("concurrent troupe creations preserve schedule uniqueness and contiguous order without asserting precedence", {
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
    `INSERT INTO "user"(id, name, email, "emailVerified") VALUES ($1, 'Concurrent Admin', $2, true)`,
    [adminId, `${adminId}@example.test`],
  );
  await pool.query("INSERT INTO user_role (user_id, role_code) VALUES ($1, 'ADMIN')", [adminId]);
  const { rows: [event] } = await pool.query(
    "INSERT INTO carnival_event(name) VALUES('Concurrent troupes event') RETURNING id",
  );
  const { rows: [category] } = await pool.query(
    "INSERT INTO event_category(event_id,name,code,display_order) VALUES($1,'Concurrent','CONCURRENT',1) RETURNING id",
    [event.id],
  );
  const { rows: [night] } = await pool.query(
    "INSERT INTO night(event_id,name,display_order,kind) VALUES($1,'Concurrent night',1,'COMPETITION') RETURNING id",
    [event.id],
  );
  const app = createApp({ getSession: async ({ headers }) => headers.get("x-test-session") === "admin" ? { user: { id: adminId, twoFactorEnabled: true } } : null });
  const troupeNames = ["Concurrent 1", "Concurrent 2", "Concurrent 3", "Concurrent 4"];
  const blocker = await pool.connect();
  let requests;
  try {
    await blocker.query("BEGIN");
    await blocker.query("SELECT id FROM carnival_event WHERE id=$1 FOR UPDATE", [event.id]);
    await withServer(app, async (baseUrl) => {
      requests = Promise.all(troupeNames.map((name) => fetch(`${baseUrl}/api/v1/events/${event.id}/troupes`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-test-session": "admin" },
        body: JSON.stringify({ name, categoryId: category.id }),
      })));

      let waitingInserts = 0;
      for (let attempt = 0; attempt < 200; attempt += 1) {
        const { rows: [{ count }] } = await pool.query(
          `SELECT COUNT(*)::int AS count FROM pg_stat_activity
            WHERE datname=current_database() AND wait_event_type='Lock'
              AND query ~* '^INSERT\\s+INTO\\s+event_troupe'`,
        );
        waitingInserts = count;
        if (waitingInserts === troupeNames.length) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.equal(waitingInserts, troupeNames.length, "all troupe inserts reach the event lock before release");
      await blocker.query("COMMIT");

      const responses = await requests;
      assert.deepEqual(responses.map(({ status }) => status), [201, 201, 201, 201]);
    });
  } catch (error) {
    await blocker.query("ROLLBACK").catch(() => {});
    if (requests) await Promise.allSettled([requests]);
    throw error;
  } finally {
    blocker.release();
  }

  const { rows } = await pool.query(
    `SELECT s.event_troupe_id AS "troupeId", s.presentation_order AS "presentationOrder"
       FROM night_troupe_schedule s
       JOIN event_troupe t ON t.id=s.event_troupe_id
      WHERE s.event_id=$1 AND s.night_id=$2 AND t.name=ANY($3::text[])
      ORDER BY s.presentation_order`,
    [event.id, night.id, troupeNames],
  );
  assert.equal(rows.length, troupeNames.length);
  assert.equal(new Set(rows.map(({ troupeId }) => troupeId)).size, troupeNames.length);
  assert.deepEqual(rows.map(({ presentationOrder }) => presentationOrder), [1, 2, 3, 4]);
});
