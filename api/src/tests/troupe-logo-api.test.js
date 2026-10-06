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

test("Spec 029: ciclo de vida del logo de comparsa y permisos", {
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
  const judgeId = randomUUID();
  await pool.query(
    `INSERT INTO "user"(id, name, email, "emailVerified")
     VALUES ($1, 'Admin logo', $2, true), ($3, 'Judge logo', $4, true)`,
    [adminId, `${adminId}@example.test`, judgeId, `${judgeId}@example.test`],
  );
  await pool.query("INSERT INTO user_role (user_id, role_code) VALUES ($1, 'ADMIN')", [adminId]);
  await pool.query("INSERT INTO user_role (user_id, role_code) VALUES ($1, 'JUDGE')", [judgeId]);

  const { rows: [event] } = await pool.query(
    "INSERT INTO carnival_event(name) VALUES($1) RETURNING id",
    ["Evento logo"],
  );
  const { rows: [category] } = await pool.query(
    "INSERT INTO event_category(event_id, name, code, display_order) VALUES($1,$2,$3,$4) RETURNING id",
    [event.id, "Comparsa", "COMPARSA", 1],
  );
  const { rows: [troupe] } = await pool.query(
    "INSERT INTO event_troupe(event_id, category_id, name) VALUES($1,$2,$3) RETURNING id",
    [event.id, category.id, "Ara Bera"],
  );

  const app = createApp({
    getSession: async ({ headers }) => {
      const role = headers.get("x-test-session");
      if (role === "admin") return { user: { id: adminId, twoFactorEnabled: true } };
      if (role === "judge") return { user: { id: judgeId, twoFactorEnabled: true } };
      return null;
    },
  });

  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);

  await withServer(app, async (baseUrl) => {
    const put = (body, session) => fetch(`${baseUrl}/api/v1/troupes/${troupe.id}/logo`, {
      method: "PUT",
      headers: { "content-type": "image/png", "x-test-session": session },
      body,
    });

    // El jurado no puede escribir el logo.
    assert.equal((await put(png, "judge")).status, 403);

    // Contenido inválido rechazado por la firma de bytes, no por el Content-Type.
    assert.equal((await put(Buffer.from("no-es-imagen"), "admin")).status, 400);

    // Alta válida como ADMIN.
    const upload = await put(png, "admin");
    assert.equal(upload.status, 200);
    const uploaded = await upload.json();
    assert.equal(uploaded.hasLogo, true);
    assert.match(uploaded.logoSha256, /^[0-9a-f]{64}$/);

    // El listado expone metadatos, nunca los bytes.
    const listed = await (await fetch(`${baseUrl}/api/v1/events/${event.id}/troupes`, {
      headers: { "x-test-session": "admin" },
    })).json();
    assert.equal(listed[0].hasLogo, true);
    assert.equal(listed[0].logoSha256, uploaded.logoSha256);
    assert.equal(listed[0].logoData, undefined);

    // Lectura operativa (jurado) con ETag y cache privado.
    const read = await fetch(`${baseUrl}/api/v1/troupes/${troupe.id}/logo`, {
      headers: { "x-test-session": "judge" },
    });
    assert.equal(read.status, 200);
    assert.equal(read.headers.get("content-type"), "image/png");
    assert.equal(read.headers.get("etag"), `"${uploaded.logoSha256}"`);
    assert.match(read.headers.get("cache-control"), /private/);
    assert.deepEqual(Buffer.from(await read.arrayBuffer()), png);

    const cached = await fetch(`${baseUrl}/api/v1/troupes/${troupe.id}/logo`, {
      headers: { "x-test-session": "judge", "if-none-match": `"${uploaded.logoSha256}"` },
    });
    assert.equal(cached.status, 304);

    // Baja del logo.
    const removed = await fetch(`${baseUrl}/api/v1/troupes/${troupe.id}/logo`, {
      method: "DELETE",
      headers: { "x-test-session": "admin" },
    });
    assert.equal(removed.status, 200);
    assert.equal((await removed.json()).hasLogo, false);

    const afterDelete = await fetch(`${baseUrl}/api/v1/troupes/${troupe.id}/logo`, {
      headers: { "x-test-session": "judge" },
    });
    assert.equal(afterDelete.status, 404);
  });
});
