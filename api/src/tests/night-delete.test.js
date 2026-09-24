import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createApp } from "../app.js";
import { closePool, getPool } from "../db/pool.js";
import { migrate } from "../db/migrate.js";

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

test("DELETE /nights/:nightId borra solo jornadas sin historial y respeta evento abierto", {
  skip: !process.env.TEST_DATABASE_URL,
}, async (context) => {
  context.after(async () => {
    await closePool();
    restoreDatabaseUrl();
  });
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await migrate();

  const adminId = randomUUID();
  const pool = getPool();
  await pool.query(
    `INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, $2, $3, true)`,
    [adminId, "Night delete admin", `${adminId}@example.test`],
  );
  await pool.query("INSERT INTO user_role (user_id, role_code) VALUES ($1, 'ADMIN')", [adminId]);
  const app = createApp({
    getSession: async ({ headers }) => headers.get("x-test-session") === "admin"
      ? { user: { id: adminId, email: `${adminId}@example.test`, name: "Night delete admin", twoFactorEnabled: true } }
      : null,
  });
  const headers = { "content-type": "application/json", "x-test-session": "admin" };

  await withServer(app, async (baseUrl) => {
    const createEvent = await fetch(`${baseUrl}/api/v1/events`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Evento borrado jornadas" }),
    });
    assert.equal(createEvent.status, 201);
    const event = await createEvent.json();

    const createNight = await fetch(`${baseUrl}/api/v1/events/${event.id}/nights`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Limpia", displayOrder: 1, kind: "COMPETITION" }),
    });
    assert.equal(createNight.status, 201);
    const cleanNight = await createNight.json();

    // Jornada inexistente → 404.
    const missing = await fetch(`${baseUrl}/api/v1/nights/${randomUUID()}`, {
      method: "DELETE",
      headers: { "x-test-session": "admin" },
    });
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).code, "NIGHT_NOT_FOUND");

    // Jornada limpia → 200 y desaparece del listado.
    const remove = await fetch(`${baseUrl}/api/v1/nights/${cleanNight.id}`, {
      method: "DELETE",
      headers: { "x-test-session": "admin" },
    });
    assert.equal(remove.status, 200);
    assert.equal((await remove.json()).id, cleanNight.id);
    const listAfter = await fetch(`${baseUrl}/api/v1/events/${event.id}/nights`, {
      headers: { "x-test-session": "admin" },
    });
    assert.deepEqual((await listAfter.json()).map((night) => night.id), []);

    // Jornada con comparsa programada → 409 NIGHT_HAS_HISTORY.
    const createNight2 = await fetch(`${baseUrl}/api/v1/events/${event.id}/nights`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Programada", displayOrder: 1, kind: "COMPETITION" }),
    });
    assert.equal(createNight2.status, 201);
    const busyNight = await createNight2.json();
    const { rows: categories } = await pool.query(
      "INSERT INTO event_category(event_id,name,code,display_order) VALUES($1,'Tipo','TIPO_DEL',1) RETURNING id",
      [event.id],
    );
    const { rows: [troupe] } = await pool.query(
      "INSERT INTO event_troupe(event_id,category_id,name) VALUES($1,$2,'Comparsa') RETURNING id",
      [event.id, categories[0].id],
    );
    const program = await fetch(`${baseUrl}/api/v1/events/${event.id}/schedule`, {
      method: "POST",
      headers,
      body: JSON.stringify({ nightId: busyNight.id, troupeId: troupe.id }),
    });
    assert.equal(program.status, 201);
    const blocked = await fetch(`${baseUrl}/api/v1/nights/${busyNight.id}`, {
      method: "DELETE",
      headers: { "x-test-session": "admin" },
    });
    assert.equal(blocked.status, 409);
    assert.equal((await blocked.json()).code, "NIGHT_HAS_HISTORY");

    // Evento abierto → 409 EVENT_LOCKED aunque la jornada esté limpia.
    const createNight3 = await fetch(`${baseUrl}/api/v1/events/${event.id}/nights`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Otra", displayOrder: 2, kind: "COMPETITION" }),
    });
    assert.equal(createNight3.status, 201);
    const { rows: specialties } = await pool.query(
      "INSERT INTO event_specialty(event_id,name,code,display_order) VALUES($1,'Baile','BAILE_DEL',1) RETURNING id",
      [event.id],
    );
    const { rows: rubrics } = await pool.query(
      "INSERT INTO rubric(event_id,name,code,evaluation_target) VALUES($1,'Rubro','RUBRO_DEL','TROUPE') RETURNING id",
      [event.id],
    );
    await pool.query(
      "INSERT INTO evaluation_item(event_id,rubric_id,specialty_id,name,code) VALUES($1,$2,$3,'Ítem','ITEM_DEL')",
      [event.id, rubrics[0].id, specialties[0].id],
    );
    const program2 = await fetch(`${baseUrl}/api/v1/events/${event.id}/schedule`, {
      method: "POST",
      headers,
      body: JSON.stringify({ nightId: busyNight.id, troupeId: troupe.id }),
    });
    assert.ok([201, 409].includes(program2.status));
    const openEvent = await fetch(`${baseUrl}/api/v1/events/${event.id}/open`, {
      method: "POST",
      headers: { "x-test-session": "admin" },
    });
    assert.equal(openEvent.status, 200);
    const lockedDelete = await fetch(`${baseUrl}/api/v1/nights/${busyNight.id}`, {
      method: "DELETE",
      headers: { "x-test-session": "admin" },
    });
    assert.equal(lockedDelete.status, 409);
    assert.equal((await lockedDelete.json()).code, "EVENT_LOCKED");
  });
});
