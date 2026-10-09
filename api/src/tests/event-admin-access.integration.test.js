import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { hasEventAdminAccess } from "../auth/event-admin-access.js";
import { closePool, getPool } from "../db/pool.js";
import { migrate } from "../db/migrate.js";

const originalDatabaseUrl = process.env.DATABASE_URL;

test("el resolvedor consulta asignaciones y roles vigentes en PostgreSQL", {
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

    const globalAdminId = randomUUID();
    const assignedAdminId = randomUUID();
    const inactiveAdminId = randomUUID();
    const eventId = randomUUID();
    const otherEventId = randomUUID();

    for (const [userId, name] of [
      [globalAdminId, "Admin global de integración"],
      [assignedAdminId, "Admin por evento de integración"],
      [inactiveAdminId, "Admin con asignación inactiva de integración"],
    ]) {
      await client.query(
        `INSERT INTO "user" (id, name, email, "emailVerified")
         VALUES ($1, $2, $3, true)`,
        [userId, name, `${userId}@example.test`],
      );
    }
    await client.query(
      "INSERT INTO carnival_event (id, name) VALUES ($1, 'Evento prueba resolver'), ($2, 'Otro evento prueba resolver')",
      [eventId, otherEventId],
    );
    await client.query("INSERT INTO user_role (user_id, role_code) VALUES ($1, 'ADMIN')", [globalAdminId]);
    await client.query(
      `INSERT INTO admin_event_assignment (user_id, event_id, is_active)
       VALUES ($1, $2, TRUE), ($3, $2, FALSE)`,
      [assignedAdminId, eventId, inactiveAdminId],
    );

    assert.equal(await hasEventAdminAccess({ userId: globalAdminId, eventId, db: client }), true);
    assert.equal(await hasEventAdminAccess({ userId: assignedAdminId, eventId, db: client }), true);
    assert.equal(await hasEventAdminAccess({ userId: assignedAdminId, eventId: otherEventId, db: client }), false);
    assert.equal(await hasEventAdminAccess({ userId: inactiveAdminId, eventId, db: client }), false);
    assert.equal(await hasEventAdminAccess({ userId: randomUUID(), eventId, db: client }), false);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});
