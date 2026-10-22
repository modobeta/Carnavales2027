import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createApp } from "../app.js";
import { closePool, getPool } from "../db/pool.js";
import { migrate } from "../db/migrate.js";

test("GET /users filtra por rol, búsqueda y límite sin exponer LIKE comodines", {
  skip: !process.env.TEST_DATABASE_URL,
}, async (context) => {
  const original = process.env.DATABASE_URL;
  context.after(async () => {
    await closePool();
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
  });
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await migrate();

  const adminId = randomUUID();
  const candidateId = randomUUID();
  const token = randomUUID().slice(0, 8);
  const pool = getPool();
  await pool.query(
    `INSERT INTO "user"(id,name,email,"emailVerified")
     VALUES($1,'Admin Filtro',$2,true),($3,$4,$5,true)`,
    [adminId, `${adminId}@example.test`, candidateId, `Candidata ${token}`, `${candidateId}@example.test`],
  );
  await pool.query("INSERT INTO user_role(user_id,role_code) VALUES($1,'ADMIN')", [adminId]);
  await pool.query("INSERT INTO user_role(user_id,role_code) VALUES($1,'VEEDOR')", [candidateId]);

  const app = createApp({
    getSession: async ({ headers }) => ({
      admin: { user: { id: adminId, twoFactorEnabled: true } },
    })[headers.get("x-test-session")] ?? null,
  });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  try {
    const base = `http://127.0.0.1:${server.address().port}/api/v1/users`;
    const headers = { "x-test-session": "admin" };
    const get = (query) => fetch(`${base}${query}`, { headers });

    const admins = await get("?role=ADMIN");
    assert.equal(admins.status, 200);
    const adminIds = (await admins.json()).map((user) => user.id);
    assert.ok(adminIds.includes(adminId));
    assert.ok(!adminIds.includes(candidateId));

    const search = await get(`?excludeRole=ADMIN&q=${token}`);
    assert.equal(search.status, 200);
    const candidates = await search.json();
    assert.deepEqual(candidates.map((user) => user.id), [candidateId]);
    assert.deepEqual(candidates[0].roles, ["VEEDOR"]);

    const limited = await get(`?q=${token}&limit=1`);
    assert.equal((await limited.json()).length, 1);

    const literalPercent = await get("?q=%25%25");
    assert.equal(literalPercent.status, 200);
    assert.deepEqual(await literalPercent.json(), []);

    for (const query of ["?role=admin", "?q=a", "?limit=0", "?limit=51", "?limit=abc", "?excludeRole=A-B"]) {
      const response = await get(query);
      assert.equal(response.status, 400, query);
      assert.deepEqual(await response.json(), { code: "VALIDATION_ERROR" });
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
