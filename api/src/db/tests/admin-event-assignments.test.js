import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { closePool, getPool } from "../pool.js";
import { migrate } from "../migrate.js";

const originalDatabaseUrl = process.env.DATABASE_URL;

test("la asignación ADMIN_EVENT persiste el estado efectivo de una pareja exacta", {
  skip: !process.env.TEST_DATABASE_URL,
}, async (context) => {
  context.after(async () => {
    await closePool();
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
  });

  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await migrate();

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const userId = randomUUID();
    const eventId = randomUUID();
    const otherEventId = randomUUID();
    await client.query(
      `INSERT INTO "user" (id, name, email, "emailVerified")
       VALUES ($1, 'Admin por evento', $2, true)`,
      [userId, `${userId}@example.test`],
    );
    await client.query(
      "INSERT INTO carnival_event (id, name) VALUES ($1, 'Evento asignado'), ($2, 'Otro evento')",
      [eventId, otherEventId],
    );

    const { rows: beforeAssignment } = await client.query(
      `SELECT is_active FROM admin_event_assignment
        WHERE user_id = $1 AND event_id = $2`,
      [userId, eventId],
    );
    assert.deepEqual(beforeAssignment, []);

    await client.query(
      `INSERT INTO admin_event_assignment (user_id, event_id)
       VALUES ($1, $2)`,
      [userId, eventId],
    );

    const { rows: exactPair } = await client.query(
      `SELECT is_active FROM admin_event_assignment
        WHERE user_id = $1 AND event_id = $2`,
      [userId, eventId],
    );
    assert.deepEqual(exactPair, [{ is_active: true }]);

    const { rows: differentEvent } = await client.query(
      `SELECT is_active FROM admin_event_assignment
        WHERE user_id = $1 AND event_id = $2 AND is_active`,
      [userId, otherEventId],
    );
    assert.deepEqual(differentEvent, []);

    await client.query(
      `UPDATE admin_event_assignment SET is_active = false
        WHERE user_id = $1 AND event_id = $2`,
      [userId, eventId],
    );
    const { rows: retired } = await client.query(
      `SELECT is_active FROM admin_event_assignment
        WHERE user_id = $1 AND event_id = $2 AND is_active`,
      [userId, eventId],
    );
    assert.deepEqual(retired, []);
    const { rows: retainedState } = await client.query(
      `SELECT is_active FROM admin_event_assignment
        WHERE user_id = $1 AND event_id = $2`,
      [userId, eventId],
    );
    assert.deepEqual(retainedState, [{ is_active: false }]);

    await client.query("SAVEPOINT invalid_assignment_user");
    await assert.rejects(
      () => client.query(
        "INSERT INTO admin_event_assignment (user_id, event_id) VALUES ($1, $2)",
        [randomUUID(), otherEventId],
      ),
      { code: "23503" },
    );
    await client.query("ROLLBACK TO SAVEPOINT invalid_assignment_user");

    await client.query("SAVEPOINT invalid_assignment_event");
    await assert.rejects(
      () => client.query(
        "INSERT INTO admin_event_assignment (user_id, event_id) VALUES ($1, $2)",
        [userId, randomUUID()],
      ),
      { code: "23503" },
    );
    await client.query("ROLLBACK TO SAVEPOINT invalid_assignment_event");

    await client.query("SAVEPOINT duplicate_assignment_pair");
    await assert.rejects(
      () => client.query(
        "INSERT INTO admin_event_assignment (user_id, event_id) VALUES ($1, $2)",
        [userId, eventId],
      ),
      { code: "23505" },
    );
    await client.query("ROLLBACK TO SAVEPOINT duplicate_assignment_pair");
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});
