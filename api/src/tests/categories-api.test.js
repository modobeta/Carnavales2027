import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import test from "node:test";
import { createApp } from "../app.js";
import { closePool, getPool } from "../db/pool.js";
import { migrate } from "../db/migrate.js";
import { seedActiveJudge } from "./helpers/judge-fixture.js";

async function withServer(app, run) {
  const server = await new Promise((resolve) => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
  try { await run(`http://127.0.0.1:${server.address().port}`); } finally { await new Promise((resolve) => server.close(resolve)); }
}

function getWithBody(url, headers, body) {
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method: "GET",
      headers: { ...headers, "content-type": "application/json", "content-length": Buffer.byteLength(body) },
    }, (response) => {
      let payload = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { payload += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, json: async () => JSON.parse(payload) }));
    });
    request.on("error", reject);
    request.end(body);
  });
}

test("API ADMIN administra categorías y participaciones sin texto libre", { skip: !process.env.TEST_DATABASE_URL }, async (context) => {
  const original = process.env.DATABASE_URL;
  context.after(async () => { await closePool(); if (original === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = original; });
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await migrate();
  const adminId = randomUUID();
  const pool = getPool();
  await pool.query(`INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, 'Category admin', $2, true)`, [adminId, `${adminId}@example.test`]);
  await pool.query("INSERT INTO user_role (user_id, role_code) VALUES ($1, 'ADMIN')", [adminId]);
  const app = createApp({ getSession: async ({ headers }) => headers.get("x-test-session") === "admin" ? { user: { id: adminId, twoFactorEnabled: true } } : null });
  await withServer(app, async (baseUrl) => {
    const headers = { "content-type": "application/json", "x-test-session": "admin" };
    const eventResponse = await fetch(`${baseUrl}/api/v1/events`, { method: "POST", headers, body: JSON.stringify({ name: "Evento categorías API" }) });
    const event = await eventResponse.json();
    const categoryResponse = await fetch(`${baseUrl}/api/v1/events/${event.id}/categories`, { method: "POST", headers, body: JSON.stringify({ name: "Primera", code: "PRIMERA", displayOrder: 1 }) });
    assert.equal(categoryResponse.status, 201);
    const category = await categoryResponse.json();
    const troupeResponse = await fetch(`${baseUrl}/api/v1/events/${event.id}/troupes`, { method: "POST", headers, body: JSON.stringify({ name: "Comparsa API", categoryId: category.id }) });
    assert.equal(troupeResponse.status, 201);
    const troupe = await troupeResponse.json();
    assert.equal(troupe.categoryName, "Primera");
    const listedTroupes = await fetch(`${baseUrl}/api/v1/events/${event.id}/troupes`, { headers });
    assert.equal(listedTroupes.status, 200);
    assert.equal((await listedTroupes.json()).length, 1);
    const updatedTroupe = await fetch(`${baseUrl}/api/v1/troupes/${troupe.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ name: "Comparsa editada", categoryId: category.id, active: false }),
    });
    assert.equal(updatedTroupe.status, 200);
    assert.equal((await updatedTroupe.json()).active, false);
    const invalidTroupe = await fetch(`${baseUrl}/api/v1/events/${event.id}/troupes`, { method: "POST", headers, body: JSON.stringify({ name: "Texto libre", category: "Primera" }) });
    assert.equal(invalidTroupe.status, 400);
    const updatedCategory = await fetch(`${baseUrl}/api/v1/categories/${category.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ name: "Primera editada", code: "PRIMERA_EDITADA", displayOrder: 2, active: false }),
    });
    assert.equal(updatedCategory.status, 200);
    assert.equal((await updatedCategory.json()).name, "Primera editada");
    const generatedCategoryResponse = await fetch(`${baseUrl}/api/v1/events/${event.id}/categories`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Categoría juvenil", displayOrder: 3 }),
    });
    assert.equal(generatedCategoryResponse.status, 201);
    assert.equal((await generatedCategoryResponse.json()).code, "CATEGORIA_JUVENIL");
    const deactivateWithInactiveCategory = await fetch(`${baseUrl}/api/v1/troupes/${troupe.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ active: false }),
    });
    assert.equal(deactivateWithInactiveCategory.status, 200);
    const reactivateWithInactiveCategory = await fetch(`${baseUrl}/api/v1/troupes/${troupe.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ active: true }),
    });
    assert.equal(reactivateWithInactiveCategory.status, 409);
    assert.deepEqual(await reactivateWithInactiveCategory.json(), { code: "CATEGORY_INACTIVE" });
    const eligible = await fetch(`${baseUrl}/api/v1/events/${event.id}/categories?eligible=true`, { headers });
    assert.deepEqual((await eligible.json()).map(({ code }) => code), ["CATEGORIA_JUVENIL"]);

    const duplicate = await fetch(`${baseUrl}/api/v1/events/${event.id}/categories`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Duplicada", code: "PRIMERA_EDITADA", displayOrder: 4 }),
    });
    assert.equal(duplicate.status, 409);
    assert.equal((await duplicate.json()).code, "RESOURCE_CONFLICT");

    const autoOrder = await fetch(`${baseUrl}/api/v1/events/${event.id}/categories`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Sin orden", code: "SIN_ORDEN" }),
    });
    assert.equal(autoOrder.status, 201);
    assert.equal((await autoOrder.json()).displayOrder, 4);

    const missingEvent = await fetch(`${baseUrl}/api/v1/events/${randomUUID()}/categories`, { headers });
    assert.equal(missingEvent.status, 404);
    assert.deepEqual(await missingEvent.json(), { code: "EVENT_NOT_FOUND" });

    const malformed = await fetch(`${baseUrl}/api/v1/events`, { method: "POST", headers, body: "{" });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), { code: "VALIDATION_ERROR" });
  });
});

test("Spec 036 T4: GET comparsas limita lectura al evento asignado sin alterar contrato ni persistencia", {
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
  const pool = getPool();
  const users = ["admin", "assignedAdmin", "assigned", "other", "judge", "unassigned"];
  const ids = Object.fromEntries([...users, "target", "otherEvent", "inactive", "empty", "alpha", "zulu"]
    .map((key) => [key, randomUUID()]));
  await pool.query(
    `INSERT INTO "user" (id,name,email,"emailVerified")
     SELECT id, '036 T4 fixture', id || '@example.test', true FROM unnest($1::text[]) AS id`,
    [users.map((key) => ids[key])],
  );
  await pool.query("INSERT INTO user_role (user_id,role_code) VALUES ($1,'ADMIN'),($2,'ADMIN'),($3,'JUDGE')",
    [ids.admin, ids.assignedAdmin, ids.judge]);
  const categories = {};
  const expected = {};
  for (const key of ["target", "otherEvent", "inactive", "empty"]) {
    await pool.query("INSERT INTO carnival_event (id,name) VALUES ($1,$2)", [ids[key], `036 T4 ${key}`]);
    const { rows: [category] } = await pool.query(
      `INSERT INTO event_category (event_id,name,code,display_order)
       VALUES ($1,'Primera','PRIMERA',1) RETURNING id`, [ids[key]],
    );
    categories[key] = category.id;
    expected[key] = [];
    if (key === "otherEvent" || key === "inactive") {
      const troupeId = randomUUID();
      await pool.query("INSERT INTO event_troupe (id,event_id,category_id,name) VALUES ($1,$2,$3,$4)",
        [troupeId, ids[key], category.id, `Comparsa ${key}`]);
      expected[key] = [{ id: troupeId, eventId: ids[key], categoryId: category.id, name: `Comparsa ${key}`,
        active: true, brandColor: null, hasLogo: false, logoSha256: null,
        categoryName: "Primera", categoryCode: "PRIMERA", categoryActive: true }];
    }
  }
  const { rows: [inactiveCategory] } = await pool.query(
    `INSERT INTO event_category (event_id,name,code,display_order)
     VALUES ($1,'Segunda','SEGUNDA',2) RETURNING id`, [ids.target],
  );
  const logo = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>');
  const logoHash = createHash("sha256").update(logo).digest("hex");
  // Insert reverse alphabetical order; activity is independent for event, troupe and category.
  await pool.query(
    `INSERT INTO event_troupe (id,event_id,category_id,name,active,brand_color,logo_data,logo_mime,logo_sha256,logo_updated_at)
     VALUES ($1,$2,$3,'Zulu',false,'#123ABC',$4,'image/svg+xml',$5,CURRENT_TIMESTAMP)`,
    [ids.zulu, ids.target, inactiveCategory.id, logo, logoHash],
  );
  await pool.query("INSERT INTO event_troupe (id,event_id,category_id,name) VALUES ($1,$2,$3,'Alpha')",
    [ids.alpha, ids.target, categories.target]);
  await pool.query("UPDATE event_category SET active=false WHERE id=$1", [inactiveCategory.id]);
  await pool.query("UPDATE carnival_event SET active=false WHERE id=$1", [ids.inactive]);
  expected.target = [
    { id: ids.alpha, eventId: ids.target, categoryId: categories.target, name: "Alpha", active: true,
      brandColor: null, hasLogo: false, logoSha256: null, categoryName: "Primera", categoryCode: "PRIMERA", categoryActive: true },
    { id: ids.zulu, eventId: ids.target, categoryId: inactiveCategory.id, name: "Zulu", active: false,
      brandColor: "#123ABC", hasLogo: true, logoSha256: logoHash, categoryName: "Segunda", categoryCode: "SEGUNDA", categoryActive: false },
  ];
  await pool.query(
    `INSERT INTO admin_event_assignment (user_id,event_id,is_active) VALUES
     ($1,$2,true),($1,$3,true),($1,$4,true),($5,$2,true),($6,$7,true)`,
    [ids.assigned, ids.target, ids.inactive, ids.empty, ids.assignedAdmin, ids.other, ids.otherEvent],
  );
  const sessions = Object.fromEntries(users.map((key) => [key, { user: { id: ids[key], twoFactorEnabled: true } }]));
  sessions.noTwoFactor = { user: { id: ids.assigned, twoFactorEnabled: false } };
  // "expired" simulates the session provider rejecting an expired session, not a full login.
  const app = createApp({ getSession: async ({ headers }) => sessions[headers.get("x-test-session")] ?? null });
  await withServer(app, async (baseUrl) => {
    const request = (eventId, session, query = "", headers = {}, body) => {
      const url = `${baseUrl}/api/v1/events/${eventId}/troupes${query}`;
      const allHeaders = { ...(session ? { "x-test-session": session } : {}), ...headers };
      return body === undefined ? fetch(url, { headers: allHeaders }) : getWithBody(url, allHeaders, JSON.stringify(body));
    };
    const snapshot = async () => (await Promise.all([
      pool.query("SELECT * FROM carnival_event ORDER BY id"),
      pool.query("SELECT * FROM event_category ORDER BY id"),
      pool.query("SELECT * FROM event_troupe ORDER BY id"),
      pool.query("SELECT * FROM admin_event_assignment ORDER BY user_id,event_id"),
      pool.query("SELECT * FROM user_role ORDER BY user_id,role_code"),
      pool.query("SELECT * FROM audit_event ORDER BY id"),
      pool.query("SELECT * FROM general_audit_hash_chain_head"),
    ])).map(({ rows }) => rows);
    const assertResponse = async (response, status, body) => {
      assert.equal(response.status, status);
      assert.deepEqual(await response.json(), body);
    };
    const initial = await snapshot();
    // RED anchor: ADMIN catch-all currently returns 403 instead of the required 200.
    await assertResponse(await request(ids.target, "assigned"), 200, expected.target);

    await context.test("ADMIN global prevalece con/sin asignación; delegado lee solo el evento exacto incluso inactivo o vacío", async () => {
      for (const session of ["admin", "assignedAdmin"]) {
        for (const key of ["target", "otherEvent", "inactive", "empty"]) {
          await assertResponse(await request(ids[key], session), 200, expected[key]);
        }
      }
      for (const key of ["inactive", "empty"]) await assertResponse(await request(ids[key], "assigned"), 200, expected[key]);
      // No new filtering, pagination or eligible semantics for this list.
      await assertResponse(await request(ids.target, "assigned", "?eligible=true&active=true&limit=1&offset=1"), 200, expected.target);
    });

    await context.test("sesión, 2FA y permiso exacto preceden datos; mantiene errores ADMIN y no divulga eventos ajenos", async () => {
      for (const [eventId, session, status, code] of [
        [ids.target, null, 401, "UNAUTHENTICATED"], [ids.target, "expired", 401, "UNAUTHENTICATED"],
        [ids.target, "noTwoFactor", 403, "TWO_FACTOR_REQUIRED"], [ids.target, "judge", 403, "ADMIN_REQUIRED"],
        [ids.target, "unassigned", 403, "ADMIN_REQUIRED"], [ids.target, "other", 403, "ADMIN_REQUIRED"],
        [ids.otherEvent, "assigned", 403, "ADMIN_REQUIRED"], [randomUUID(), "assigned", 403, "ADMIN_REQUIRED"],
        ["not-a-uuid", "assigned", 403, "ADMIN_REQUIRED"], [randomUUID(), "admin", 404, "EVENT_NOT_FOUND"],
        ["not-a-uuid", "admin", 400, "VALIDATION_ERROR"],
      ]) await assertResponse(await request(eventId, session), status, { code });
    });

    await context.test("spoof de identidad, roles, permisos y evento en body/query/headers no concede ni desplaza alcance", async () => {
      const spoof = (eventId) => ({ eventId, userId: ids.admin, actorUserId: ids.admin, role: "ADMIN", permissions: ["ADMIN"] });
      const headers = { "x-role": "ADMIN", "x-user-id": ids.admin, "x-permissions": "ADMIN", "x-event-id": ids.target };
      const query = `?eventId=${ids.target}&role=ADMIN&userId=${ids.admin}&permissions=ADMIN`;
      for (const session of ["assigned", "judge", "unassigned"]) {
        await assertResponse(await request(ids.otherEvent, session, query, headers, spoof(ids.target)), 403, { code: "ADMIN_REQUIRED" });
      }
      await assertResponse(await request(ids.target, "assigned", `?eventId=${ids.inactive}&role=ADMIN&userId=${ids.admin}`, {
        ...headers, "x-event-id": ids.inactive,
      }, spoof(ids.inactive)), 200, expected.target);
    });

    await context.test("listado autorizado no amplía catálogos globales ni cambia GET logo operativo", async () => {
      for (const [method, path, body, type = "application/json"] of [
        ["GET", `/events/${ids.target}/specialties`],
      ]) {
        const response = await fetch(`${baseUrl}/api/v1${path}`, {
          method, headers: { "x-test-session": "assigned", "content-type": type }, ...(body ? { body } : {}),
        });
        await assertResponse(response, 403, { code: "ADMIN_REQUIRED" });
      }
      const read = await fetch(`${baseUrl}/api/v1/troupes/${ids.zulu}/logo`, { headers: { "x-test-session": "judge" } });
      assert.equal(read.status, 200);
      assert.equal(read.headers.get("content-type"), "image/svg+xml");
      assert.equal(read.headers.get("etag"), `"${logoHash}"`);
      assert.deepEqual(Buffer.from(await read.arrayBuffer()), logo);
    });

    await context.test("fallo de lectura DB es 500 sin datos sustitutos, distinto de lista legítimamente vacía", async () => {
      const originalQuery = pool.query;
      const failure = context.mock.method(pool, "query", function (query, ...args) {
        // Only inject the list storage failure; session, permission and event lookup use real PostgreSQL.
        if (typeof query === "string" && /FROM event_troupe t\b/.test(query)) throw new Error("Injected troupe list storage failure");
        return originalQuery.call(this, query, ...args);
      });
      try {
        for (const session of ["assigned", "admin"]) {
          await assertResponse(await request(ids.empty, session), 500, { code: "INTERNAL_ERROR" });
        }
      } finally { failure.mock.restore(); }
      await assertResponse(await request(ids.empty, "assigned"), 200, []);
    });
    // Full rows include logo bytes/timestamps and audit/hash-chain contents, not just counts.
    assert.deepEqual(await snapshot(), initial);

    await context.test("revocación y cambio de rol rigen al siguiente request sin afectar otra asignación ni ADMIN", async () => {
      await pool.query("UPDATE admin_event_assignment SET is_active=false WHERE user_id=ANY($1::text[]) AND event_id=$2",
        [[ids.assigned, ids.assignedAdmin], ids.target]);
      const afterRevocation = await snapshot();
      await assertResponse(await request(ids.target, "assigned"), 403, { code: "ADMIN_REQUIRED" });
      await assertResponse(await request(ids.inactive, "assigned"), 200, expected.inactive);
      for (const session of ["admin", "assignedAdmin"]) await assertResponse(await request(ids.target, session), 200, expected.target);
      assert.deepEqual(await snapshot(), afterRevocation);
      await pool.query("DELETE FROM user_role WHERE user_id=$1 AND role_code='ADMIN'", [ids.assignedAdmin]);
      const afterRoleChange = await snapshot();
      await assertResponse(await request(ids.target, "assignedAdmin", "?role=ADMIN"), 403, { code: "ADMIN_REQUIRED" });
      assert.deepEqual(await snapshot(), afterRoleChange);
    });
  });
});

test("Spec 036 T5: POST comparsas autoriza el evento de ruta y conserva pertenencia, contrato y atomicidad", {
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
  const pool = getPool();
  const users = ["admin", "assignedAdmin", "assigned", "other", "judge", "unassigned"];
  const ids = Object.fromEntries([...users, "target", "otherEvent", "inactive", "lifecycle"]
    .map((key) => [key, randomUUID()]));
  await pool.query(
    `INSERT INTO "user" (id,name,email,"emailVerified")
     SELECT id, '036 T5 fixture', id || '@example.test', true FROM unnest($1::text[]) AS id`,
    [users.map((key) => ids[key])],
  );
  await pool.query("INSERT INTO user_role (user_id,role_code) VALUES ($1,'ADMIN'),($2,'ADMIN'),($3,'JUDGE')",
    [ids.admin, ids.assignedAdmin, ids.judge]);
  const categories = {};
  for (const key of ["target", "otherEvent", "inactive", "lifecycle"]) {
    await pool.query("INSERT INTO carnival_event (id,name,active) VALUES ($1,$2,$3)",
      [ids[key], `036 T5 ${key}`, key !== "inactive"]);
    const { rows: [category] } = await pool.query(
      `INSERT INTO event_category (event_id,name,code,display_order)
       VALUES ($1,'Primera','PRIMERA',1) RETURNING id`, [ids[key]],
    );
    categories[key] = category.id;
  }
  const { rows: [inactiveCategory] } = await pool.query(
    `INSERT INTO event_category (event_id,name,code,display_order,active)
     VALUES ($1,'Inactiva','INACTIVA',2,false) RETURNING id`, [ids.target],
  );
  await pool.query(
    `INSERT INTO admin_event_assignment (user_id,event_id,is_active) VALUES
     ($1,$2,true),($1,$3,true),($1,$4,true),($5,$2,true),($6,$7,true)`,
    [ids.assigned, ids.target, ids.inactive, ids.lifecycle, ids.assignedAdmin, ids.other, ids.otherEvent],
  );
  const sessions = Object.fromEntries(users.map((key) => [key, { user: { id: ids[key], twoFactorEnabled: true } }]));
  sessions.noTwoFactor = { user: { id: ids.assigned, twoFactorEnabled: false } };
  // Session provider injection only; an expired session resolves to null, as in the existing API tests.
  const app = createApp({ getSession: async ({ headers }) => sessions[headers.get("x-test-session")] ?? null });
  await withServer(app, async (baseUrl) => {
    const request = (eventId, session, payload = { name: "Nueva", categoryId: categories.target }, query = "", headers = {}) => fetch(
      `${baseUrl}/api/v1/events/${eventId}/troupes${query}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(session ? { "x-test-session": session } : {}), ...headers },
        body: JSON.stringify(payload),
      },
    );
    const snapshot = async () => (await Promise.all([
      pool.query("SELECT * FROM carnival_event ORDER BY id"),
      pool.query("SELECT * FROM event_category ORDER BY id"),
      pool.query("SELECT * FROM event_troupe ORDER BY id"),
      pool.query("SELECT * FROM admin_event_assignment ORDER BY user_id,event_id"),
      pool.query("SELECT * FROM user_role ORDER BY user_id,role_code"),
      pool.query("SELECT * FROM audit_event ORDER BY id"),
      pool.query("SELECT * FROM general_audit_hash_chain_head"),
    ])).map(({ rows }) => rows);
    const assertCreated = async (key, session, payload, expected = {}, query, headers) => {
      const response = await request(ids[key], session, { name: "Nueva", categoryId: categories[key], ...payload }, query, headers);
      assert.equal(response.status, 201);
      const troupe = await response.json();
      assert.match(troupe.id, /^[0-9a-f-]{36}$/);
      assert.deepEqual(troupe, {
        id: troupe.id, eventId: ids[key], categoryId: categories[key], name: "Nueva", active: true,
        brandColor: null, hasLogo: false, logoSha256: null,
        categoryName: "Primera", categoryCode: "PRIMERA", categoryActive: true, ...expected,
      });
      assert.deepEqual((await pool.query(
        `SELECT id,event_id AS "eventId",category_id AS "categoryId",name,active,brand_color AS "brandColor",
                logo_data AS "logoData",logo_mime AS "logoMime",logo_sha256 AS "logoSha256",logo_updated_at AS "logoUpdatedAt"
           FROM event_troupe WHERE id=$1`, [troupe.id],
      )).rows, [{ id: troupe.id, eventId: ids[key], categoryId: categories[key], name: troupe.name,
        active: true, brandColor: troupe.brandColor, logoData: null, logoMime: null, logoSha256: null, logoUpdatedAt: null }]);
      assert.deepEqual((await pool.query(
        `SELECT actor_user_id AS "actorUserId",action,entity_type AS "entityType",after_data AS "after"
           FROM audit_event WHERE entity_id=$1`, [troupe.id],
      )).rows, [{ actorUserId: ids[session], action: "TROUPE_CREATED", entityType: "event_troupe", after: troupe }]);
      return troupe;
    };
    const assertRejected = async (eventId, session, status, expected, payload, query, headers) => {
      const before = await snapshot();
      const response = await request(eventId, session, payload, query, headers);
      assert.equal(response.status, status, `${session} POST ${eventId} ${JSON.stringify(payload)}`);
      assert.deepEqual(await response.json(), expected);
      assert.deepEqual(await snapshot(), before);
    };

    // RED anchor: ADMIN-only catch-all rejects an assigned delegate with 403 instead of 201.
    await assertCreated("target", "assigned", { name: " Comparsa delegada ", brandColor: " #aB12Ef " },
      { name: "Comparsa delegada", brandColor: "#aB12Ef" });

    await context.test("ADMIN global con/sin asignación prevalece y conserva las guardas de evento inactivo", async () => {
      for (const session of ["admin", "assignedAdmin"]) {
        await assertCreated("otherEvent", session);
        await assertRejected(ids.inactive, session, 409, { code: "EVENT_LOCKED" });
      }
      await pool.query("UPDATE admin_event_assignment SET is_active=false WHERE user_id=$1", [ids.assignedAdmin]);
      await assertCreated("target", "assignedAdmin");
    });

    await context.test("sesión/2FA y permiso exacto preceden validaciones y rechazan sin divulgar ni mutar", async () => {
      for (const [eventId, session, status, code] of [
        [ids.target, null, 401, "UNAUTHENTICATED"], [ids.target, "expired", 401, "UNAUTHENTICATED"],
        [ids.target, "noTwoFactor", 403, "TWO_FACTOR_REQUIRED"], [ids.target, "judge", 403, "ADMIN_REQUIRED"],
        [ids.target, "unassigned", 403, "ADMIN_REQUIRED"], [ids.target, "other", 403, "ADMIN_REQUIRED"],
        [ids.otherEvent, "assigned", 403, "ADMIN_REQUIRED"], [ids.inactive, "assigned", 403, "ADMIN_REQUIRED"],
        [randomUUID(), "assigned", 403, "ADMIN_REQUIRED"], ["not-a-uuid", "assigned", 403, "ADMIN_REQUIRED"],
        [randomUUID(), "admin", 404, "EVENT_NOT_FOUND"], ["not-a-uuid", "admin", 400, "VALIDATION_ERROR"],
      ]) await assertRejected(eventId, session, status, { code }, { name: " ", categoryId: randomUUID() });
      for (const session of ["assigned", "judge", "unassigned"]) {
        await assertRejected(ids.otherEvent, session, 403, { code: "ADMIN_REQUIRED" }, {
          name: "No autorizada", categoryId: categories.otherEvent, eventId: ids.target, client: {},
          userId: ids.admin, actorUserId: ids.admin, role: "ADMIN", permissions: ["ADMIN"],
        }, `?eventId=${ids.target}&userId=${ids.admin}&role=ADMIN&permissions=ADMIN`, {
          "x-event-id": ids.target, "x-user-id": ids.admin, "x-role": "ADMIN", "x-permissions": "ADMIN",
        });
      }
    });

    await context.test("categoría ajena/inactiva/inexistente y campos inválidos conservan rechazo atómico", async () => {
      for (const session of ["assigned", "admin"]) {
        for (const [payload, status, expected] of [
          [{ categoryId: categories.otherEvent }, 409, { code: "INVALID_REFERENCE" }],
          [{ categoryId: inactiveCategory.id }, 409, { code: "CATEGORY_INACTIVE" }],
          [{ categoryId: randomUUID() }, 409, { code: "INVALID_REFERENCE" }],
          [{ categoryId: "not-a-uuid" }, 400, { code: "VALIDATION_ERROR" }],
          [{ categoryId: null }, 400, { code: "VALIDATION_ERROR", message: "categoryId debe ser texto no vacío." }],
          [{ categoryId: undefined, category: "Primera" }, 400, { code: "VALIDATION_ERROR", message: "categoryId debe ser texto no vacío." }],
          [{ name: " " }, 400, { code: "VALIDATION_ERROR", message: "name debe ser texto no vacío." }],
          [{ name: 42 }, 400, { code: "VALIDATION_ERROR", message: "name debe ser texto no vacío." }],
          ...["red", "#FFF", "#GGGGGG", "123ABC"].map((brandColor) => [
            { brandColor }, 400, { code: "VALIDATION_ERROR", message: "brandColor debe tener formato #RRGGBB." },
          ]),
          [{ brandColor: 123 }, 400, { code: "VALIDATION_ERROR", message: "brandColor debe ser texto #RRGGBB o nulo." }],
        ]) await assertRejected(ids.target, session, status, expected, { name: "Nueva", categoryId: categories.target, ...payload });
        for (const brandColor of [undefined, null, "", "  "]) await assertCreated("target", session, { brandColor });
      }
    });

    await context.test("ruta/client y actor de sesión prevalecen sobre spoof aun con ambos eventos asignados", async () => {
      for (const [index, session] of ["assigned", "assigned", "admin"].entries()) {
        if (index === 1) await pool.query("INSERT INTO admin_event_assignment(user_id,event_id,is_active) VALUES ($1,$2,true)",
          [ids.assigned, ids.otherEvent]);
        const beforeOther = (await pool.query("SELECT * FROM event_troupe WHERE event_id=$1 ORDER BY id", [ids.otherEvent])).rows;
        await assertCreated("target", session, {
          eventId: ids.otherEvent, client: index === 1 ? {} : null, userId: ids.other, actorUserId: ids.other,
          role: "ADMIN", permissions: ["ADMIN"], active: false, id: randomUUID(),
          logoData: "ignored", logoSha256: "ignored", hasLogo: true,
        }, {}, `?eventId=${ids.otherEvent}&userId=${ids.other}&role=ADMIN&permissions=ADMIN`, {
          "x-event-id": ids.otherEvent, "x-user-id": ids.other, "x-role": "ADMIN", "x-permissions": "ADMIN",
        });
        // Permission for both events never permits a cross-event category link.
        await assertRejected(ids.target, session, 409, { code: "INVALID_REFERENCE" }, {
          name: "Cruzada", categoryId: categories.otherEvent, eventId: ids.otherEvent, client: null,
        });
        assert.deepEqual((await pool.query("SELECT * FROM event_troupe WHERE event_id=$1 ORDER BY id", [ids.otherEvent])).rows, beforeOther);
      }
      await assertCreated("otherEvent", "assigned");
    });

    await context.test("fallos después del INSERT real y durante auditoría revierten alta, evidencia y cabecera hash", async () => {
      for (const stage of ["insert", "audit"]) {
        const before = await snapshot();
        const originalConnect = pool.connect;
        const restores = [];
        let insertedId;
        let failures = 0;
        // Inject only at the storage boundary; authorization, SQL writes and rollback remain real.
        const connectMock = context.mock.method(pool, "connect", function (...args) {
          const wrap = (client) => {
            const descriptor = Object.getOwnPropertyDescriptor(client, "query");
            const originalQuery = client.query;
            client.query = async function (query, ...queryArgs) {
              const isInsert = typeof query === "string" && /^\s*INSERT\s+INTO\s+event_troupe\b/i.test(query);
              const isAudit = typeof query === "string" && /^\s*INSERT\s+INTO\s+audit_event\b/i.test(query);
              if (stage === "audit" && isAudit) {
                failures += 1;
                throw new Error("Injected TROUPE_CREATED audit failure");
              }
              const result = await originalQuery.call(client, query, ...queryArgs);
              if (isInsert) {
                insertedId = result.rows[0].id;
                if (stage === "insert") {
                  failures += 1;
                  throw new Error("Injected TROUPE_CREATED failure after INSERT");
                }
              }
              return result;
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
          response = await request(ids.target, "assigned", { name: "Rollback", categoryId: categories.target, client: null, actorUserId: ids.admin });
        } finally {
          connectMock.mock.restore();
          for (const restore of restores.reverse()) restore();
        }
        assert.equal(response.status, 500);
        assert.deepEqual(await response.json(), { code: "INTERNAL_ERROR" });
        assert.equal(failures, 1);
        assert.ok(insertedId, "INSERT real antes de cada fallo");
        assert.deepEqual(await snapshot(), before);
      }
    });

    await context.test("revocación y cambio de rol rigen al próximo request sin afectar otra asignación ni ADMIN", async () => {
      await pool.query("UPDATE admin_event_assignment SET is_active=false WHERE user_id=$1 AND event_id=$2", [ids.assigned, ids.target]);
      await assertRejected(ids.target, "assigned", 403, { code: "ADMIN_REQUIRED" });
      await assertCreated("otherEvent", "assigned");
      await assertCreated("target", "admin");
      await pool.query("DELETE FROM user_role WHERE user_id=$1 AND role_code='ADMIN'", [ids.assignedAdmin]);
      await assertRejected(ids.target, "assignedAdmin", 403, { code: "ADMIN_REQUIRED" }, { role: "ADMIN" });
    });

    await context.test("evento activo OPEN/CLOSED sigue bloqueado por lifecycle para ADMIN y delegado", async () => {
      const eventId = ids.lifecycle;
      const { rows: [night] } = await pool.query("INSERT INTO night(event_id,name,display_order,kind,status) VALUES ($1,'Noche',1,'COMPETITION','OPEN') RETURNING id", [eventId]);
      const troupe = await assertCreated("lifecycle", "assigned");
      const { rows: [specialty] } = await pool.query("INSERT INTO event_specialty(event_id,name,code,display_order) VALUES ($1,'Baile','BAILE',1) RETURNING id", [eventId]);
      const { rows: [rubric] } = await pool.query("INSERT INTO rubric(event_id,name,code,evaluation_target) VALUES ($1,'Rubro','RUBRO','TROUPE') RETURNING id", [eventId]);
      await pool.query("INSERT INTO evaluation_item(event_id,rubric_id,specialty_id,name,code) VALUES ($1,$2,$3,'Item','ITEM')", [eventId, rubric.id, specialty.id]);
      await pool.query("INSERT INTO night_troupe_schedule(event_id,night_id,event_troupe_id,presentation_order) VALUES ($1,$2,$3,1)", [eventId, night.id, troupe.id]);
      await seedActiveJudge({ client: pool, eventId, nightId: night.id, specialtyId: specialty.id });
      const opened = await fetch(`${baseUrl}/api/v1/events/${eventId}/open`, {
        method: "POST", headers: { "x-test-session": "admin", "Idempotency-Key": randomUUID() },
      });
      assert.equal(opened.status, 200);
      assert.equal((await opened.json()).status, "OPEN");
      for (const status of ["OPEN", "CLOSED"]) {
        if (status === "CLOSED") {
          await pool.query("UPDATE night SET status='CLOSED' WHERE id=$1", [night.id]);
          await pool.query("UPDATE carnival_event SET status='CLOSED' WHERE id=$1", [eventId]);
        }
        assert.deepEqual((await pool.query("SELECT active,status FROM carnival_event WHERE id=$1", [eventId])).rows, [{ active: true, status }]);
        for (const session of ["assigned", "admin"]) await assertRejected(eventId, session, 409, { code: "EVENT_LOCKED" }, { name: "Bloqueada", categoryId: categories.lifecycle });
        await assertRejected(eventId, "other", 403, { code: "ADMIN_REQUIRED" });
      }
    });
  });
});

test("Spec 036 T6: PATCH comparsa autoriza propietario persistido y conserva contrato, guardas y atomicidad", {
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
  const pool = getPool();
  const users = ["admin", "assignedAdmin", "assigned", "other", "judge", "unassigned", "veedor", "escribano", "comisario", "scrutineer"];
  const ids = Object.fromEntries([...users, "target", "otherEvent", "inactive", "lifecycle"]
    .map((key) => [key, randomUUID()]));
  await pool.query(
    `INSERT INTO "user" (id,name,email,"emailVerified")
     SELECT id, '036 T6 fixture', id || '@example.test', true FROM unnest($1::text[]) AS id`,
    [users.map((key) => ids[key])],
  );
  for (const [key, role] of [["admin", "ADMIN"], ["assignedAdmin", "ADMIN"], ["judge", "JUDGE"],
    ["veedor", "VEEDOR"], ["escribano", "ESCRIBANO"], ["comisario", "COMISARIO"], ["scrutineer", "SCRUTINEER"]]) {
    await pool.query("INSERT INTO user_role (user_id,role_code) VALUES ($1,$2)", [ids[key], role]);
  }
  const categories = {};
  const troupes = {};
  const logo = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>');
  const logoHash = createHash("sha256").update(logo).digest("hex");
  for (const key of ["target", "otherEvent", "inactive", "lifecycle"]) {
    await pool.query("INSERT INTO carnival_event (id,name,active) VALUES ($1,$2,$3)",
      [ids[key], `036 T6 ${key}`, key !== "inactive"]);
    const { rows: [category] } = await pool.query(
      `INSERT INTO event_category (event_id,name,code,display_order)
       VALUES ($1,'Primera','PRIMERA',1) RETURNING id`, [ids[key]],
    );
    categories[key] = category.id;
    const troupeId = randomUUID();
    await pool.query(
      `INSERT INTO event_troupe (id,event_id,category_id,name,brand_color,logo_data,logo_mime,logo_sha256,logo_updated_at)
       VALUES ($1,$2,$3,'Original','#123ABC',$4,'image/svg+xml',$5,CURRENT_TIMESTAMP)`,
      [troupeId, ids[key], category.id, logo, logoHash],
    );
    troupes[key] = { id: troupeId, eventId: ids[key], categoryId: category.id, name: "Original", active: true,
      brandColor: "#123ABC", hasLogo: true, logoSha256: logoHash };
  }
  const { rows: [secondCategory] } = await pool.query(
    `INSERT INTO event_category (event_id,name,code,display_order)
     VALUES ($1,'Segunda','SEGUNDA',2) RETURNING id`, [ids.target],
  );
  const { rows: [inactiveCategory] } = await pool.query(
    `INSERT INTO event_category (event_id,name,code,display_order,active)
     VALUES ($1,'Inactiva','INACTIVA',3,false) RETURNING id`, [ids.target],
  );
  await pool.query(
    `INSERT INTO admin_event_assignment (user_id,event_id,is_active) VALUES
     ($1,$2,true),($1,$3,true),($1,$4,true),($5,$2,true),($6,$7,true)`,
    [ids.assigned, ids.target, ids.inactive, ids.lifecycle, ids.assignedAdmin, ids.other, ids.otherEvent],
  );
  const sessions = Object.fromEntries(users.map((key) => [key, { user: { id: ids[key], twoFactorEnabled: true } }]));
  sessions.noTwoFactor = { user: { id: ids.assigned, twoFactorEnabled: false } };
  // Inject only the session provider, including its null result for an expired session.
  const app = createApp({ getSession: async ({ headers }) => sessions[headers.get("x-test-session")] ?? null });
  await withServer(app, async (baseUrl) => {
    const request = (troupeId, session, payload = { name: "Editada" }, query = "", headers = {}) => fetch(
      `${baseUrl}/api/v1/troupes/${troupeId}${query}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", ...(session ? { "x-test-session": session } : {}), ...headers },
        body: JSON.stringify(payload),
      },
    );
    const snapshot = async () => (await Promise.all([
      pool.query("SELECT * FROM carnival_event ORDER BY id"),
      pool.query("SELECT * FROM event_category ORDER BY id"),
      pool.query("SELECT * FROM event_troupe ORDER BY id"),
      pool.query("SELECT * FROM admin_event_assignment ORDER BY user_id,event_id"),
      pool.query("SELECT * FROM user_role ORDER BY user_id,role_code"),
      pool.query("SELECT * FROM audit_event ORDER BY id"),
      pool.query("SELECT * FROM general_audit_hash_chain_head"),
    ])).map(({ rows }) => rows);
    const assertUpdated = async (key, session, payload, changes = {}, query, headers) => {
      const beforeAudit = (await pool.query("SELECT id FROM audit_event WHERE entity_id=$1", [troupes[key].id])).rows;
      const beforeLogo = (await pool.query("SELECT logo_data,logo_mime,logo_sha256,logo_updated_at FROM event_troupe WHERE id=$1", [troupes[key].id])).rows;
      const response = await request(troupes[key].id, session, payload, query, headers);
      assert.equal(response.status, 200);
      const expected = { ...troupes[key], ...changes };
      assert.deepEqual(await response.json(), expected);
      assert.deepEqual((await pool.query(
        `SELECT id,event_id AS "eventId",category_id AS "categoryId",name,active,brand_color AS "brandColor",
                (logo_data IS NOT NULL) AS "hasLogo",logo_sha256 AS "logoSha256" FROM event_troupe WHERE id=$1`, [expected.id],
      )).rows, [expected]);
      assert.deepEqual((await pool.query("SELECT logo_data,logo_mime,logo_sha256,logo_updated_at FROM event_troupe WHERE id=$1", [expected.id])).rows, beforeLogo);
      const audits = (await pool.query(
        `SELECT id,actor_user_id AS "actorUserId",action,entity_type AS "entityType",after_data AS "after"
         FROM audit_event WHERE entity_id=$1`, [expected.id],
      )).rows.filter(({ id }) => !beforeAudit.some((row) => row.id === id));
      assert.equal(audits.length, 1);
      assert.deepEqual(audits[0], { id: audits[0].id, actorUserId: ids[session], action: "TROUPE_UPDATED", entityType: "event_troupe", after: expected });
      troupes[key] = expected;
    };
    const assertRejected = async (troupeId, session, status, expected, payload, query, headers) => {
      const before = await snapshot();
      const response = await request(troupeId, session, payload, query, headers);
      assert.equal(response.status, status, `${session} PATCH ${troupeId} ${JSON.stringify(payload)}`);
      assert.deepEqual(await response.json(), expected);
      assert.deepEqual(await snapshot(), before);
    };

    // RED anchor: the ADMIN-only catch-all returns 403 instead of the delegated 200.
    await assertUpdated("target", "assigned", { name: " Editada ", categoryId: secondCategory.id, brandColor: " #aB12Ef ", active: false },
      { name: "Editada", categoryId: secondCategory.id, brandColor: "#aB12Ef", active: false });

    await context.test("active de comparsa y color opcional conservan semántica sin alterar evento ni logo", async () => {
      await assertUpdated("target", "assigned", { active: true }, { active: true });
      await assertUpdated("target", "assigned", {});
      for (const brandColor of [null, "", "  "]) {
        await assertUpdated("target", "assigned", { brandColor: "#123ABC" }, { brandColor: "#123ABC" });
        await assertUpdated("target", "assigned", { brandColor }, { brandColor: null });
      }
      await assertUpdated("target", "assigned", { name: "Sin color" }, { name: "Sin color" });
      assert.deepEqual((await pool.query("SELECT active,status FROM carnival_event WHERE id=$1", [ids.target])).rows,
        [{ active: true, status: "CONFIGURING" }]);
    });

    await context.test("ADMIN global con/sin asignación prevalece incluso en evento inactivo", async () => {
      for (const session of ["admin", "assignedAdmin"]) {
        await assertUpdated("otherEvent", session, { name: session }, { name: session });
        await assertUpdated("inactive", session, { active: false }, { active: false });
        await assertUpdated("inactive", session, { active: true }, { active: true });
      }
      await pool.query("UPDATE admin_event_assignment SET is_active=false WHERE user_id=$1", [ids.assignedAdmin]);
      await assertUpdated("target", "assignedAdmin", { name: "Global vigente" }, { name: "Global vigente" });
    });

    await context.test("sesión/2FA y permisos exactos preceden campos; ajeno e inexistente no divulgan ni mutan", async () => {
      for (const [key, session, status, code] of [
        ["target", null, 401, "UNAUTHENTICATED"], ["target", "expired", 401, "UNAUTHENTICATED"],
        ["target", "noTwoFactor", 403, "TWO_FACTOR_REQUIRED"], ["target", "other", 403, "ADMIN_REQUIRED"],
        ["otherEvent", "assigned", 403, "ADMIN_REQUIRED"], ["inactive", "assigned", 403, "ADMIN_REQUIRED"],
        ...["unassigned", "judge", "veedor", "escribano", "comisario", "scrutineer"].map((session) => ["target", session, 403, "ADMIN_REQUIRED"]),
      ]) await assertRejected(troupes[key].id, session, status, { code }, { name: " ", active: true });
      for (const troupeId of [randomUUID(), "not-a-uuid"]) await assertRejected(troupeId, "assigned", 403, { code: "ADMIN_REQUIRED" });
      await assertRejected(randomUUID(), "admin", 404, { code: "TROUPE_NOT_FOUND" });
      await assertRejected("not-a-uuid", "admin", 400, { code: "VALIDATION_ERROR" });
      // Unlike POST, text validation precedes UPDATE (and its missing-resource/UUID result).
      for (const troupeId of [randomUUID(), "not-a-uuid"]) await assertRejected(troupeId, "admin", 400,
        { code: "VALIDATION_ERROR", message: "name debe ser texto no vacío." }, { name: " " });
      for (const session of ["assigned", "judge", "unassigned"]) {
        await assertRejected(troupes.otherEvent.id, session, 403, { code: "ADMIN_REQUIRED" }, {
          name: "Prohibida", eventId: ids.target, troupeId: troupes.target.id, client: {},
          userId: ids.admin, actorUserId: ids.admin, role: "ADMIN", permissions: ["ADMIN"],
        }, `?eventId=${ids.target}&troupeId=${troupes.target.id}&role=ADMIN&userId=${ids.admin}&permissions=ADMIN`, {
          "x-event-id": ids.target, "x-troupe-id": troupes.target.id, "x-user-id": ids.admin, "x-role": "ADMIN", "x-permissions": "ADMIN",
        });
      }
    });

    await context.test("campos inválidos y categorías ajenas/inactivas/inexistentes no dejan cambios parciales", async () => {
      for (const session of ["assigned", "admin"]) {
        for (const [payload, status, expected] of [
          [{ categoryId: categories.otherEvent }, 409, { code: "INVALID_REFERENCE" }],
          [{ categoryId: inactiveCategory.id }, 409, { code: "CATEGORY_INACTIVE" }],
          [{ categoryId: randomUUID() }, 409, { code: "INVALID_REFERENCE" }],
          [{ categoryId: "not-a-uuid" }, 400, { code: "VALIDATION_ERROR" }],
          ...[null, ""].map((categoryId) => [{ categoryId }, 400, { code: "VALIDATION_ERROR", message: "categoryId debe ser texto no vacío." }]),
          ...[null, " ", 42].map((name) => [{ name }, 400, { code: "VALIDATION_ERROR", message: "name debe ser texto no vacío." }]),
          ...[null, "false", 0].map((active) => [{ active }, 400, { code: "VALIDATION_ERROR", message: "active debe ser booleano." }]),
          ...["red", "#FFF", "#GGGGGG", "123ABC"].map((brandColor) => [{ brandColor }, 400, { code: "VALIDATION_ERROR", message: "brandColor debe tener formato #RRGGBB." }]),
          [{ brandColor: 123 }, 400, { code: "VALIDATION_ERROR", message: "brandColor debe ser texto #RRGGBB o nulo." }],
        ]) await assertRejected(troupes.target.id, session, status, expected, payload);
      }
      await assertUpdated("target", "assigned", { active: false }, { active: false });
      await pool.query("UPDATE event_category SET active=false WHERE id=$1", [secondCategory.id]);
      await assertUpdated("target", "assigned", { name: "Inactiva conservada" }, { name: "Inactiva conservada" });
      await assertRejected(troupes.target.id, "assigned", 409, { code: "CATEGORY_INACTIVE" }, { active: true });
      await assertUpdated("target", "assigned", { categoryId: categories.target, active: true }, { categoryId: categories.target, active: true });
    });

    await context.test("ruta, cliente transaccional y actor de sesión prevalecen aun asignado a ambos eventos", async () => {
      for (const [index, session] of ["assigned", "assigned", "admin"].entries()) {
        if (index === 1) await pool.query("INSERT INTO admin_event_assignment(user_id,event_id,is_active) VALUES ($1,$2,true)", [ids.assigned, ids.otherEvent]);
        const beforeOther = (await pool.query("SELECT * FROM event_troupe WHERE event_id=$1 ORDER BY id", [ids.otherEvent])).rows;
        await assertUpdated("target", session, {
          name: `Ruta ${index}`, eventId: ids.otherEvent, troupeId: troupes.otherEvent.id, client: index === 1 ? {} : null,
          userId: ids.other, actorUserId: ids.other, actor: ids.other, role: "ADMIN", permissions: ["ADMIN"],
          logoData: "ignored", logoSha256: "ignored", hasLogo: false,
        }, { name: `Ruta ${index}` }, `?eventId=${ids.otherEvent}&troupeId=${troupes.otherEvent.id}&role=ADMIN&userId=${ids.other}&permissions=ADMIN`, {
          "x-event-id": ids.otherEvent, "x-troupe-id": troupes.otherEvent.id, "x-user-id": ids.other, "x-role": "ADMIN", "x-permissions": "ADMIN",
        });
        await assertRejected(troupes.target.id, session, 409, { code: "INVALID_REFERENCE" }, {
          categoryId: categories.otherEvent, eventId: ids.otherEvent, troupeId: troupes.otherEvent.id, client: null,
        });
        assert.deepEqual((await pool.query("SELECT * FROM event_troupe WHERE event_id=$1 ORDER BY id", [ids.otherEvent])).rows, beforeOther);
      }
    });

    await context.test("fallos después de UPDATE real y durante auditoría revierten datos, evidencia y cabecera hash", async () => {
      for (const stage of ["update", "audit"]) {
        const before = await snapshot();
        const originalConnect = pool.connect;
        const restores = [];
        let updatedRow;
        let failures = 0;
        // Fail at the storage boundary only: authorization, UPDATE and rollback use real PostgreSQL.
        const connectMock = context.mock.method(pool, "connect", function (...args) {
          const wrap = (client) => {
            const descriptor = Object.getOwnPropertyDescriptor(client, "query");
            const originalQuery = client.query;
            client.query = async function (query, ...queryArgs) {
              const isUpdate = typeof query === "string" && /^\s*UPDATE\s+event_troupe\b/i.test(query);
              const isAudit = typeof query === "string" && /^\s*INSERT\s+INTO\s+audit_event\b/i.test(query);
              if (stage === "audit" && isAudit) {
                failures += 1;
                throw new Error("Injected TROUPE_UPDATED audit failure");
              }
              const result = await originalQuery.call(client, query, ...queryArgs);
              if (isUpdate) {
                updatedRow = result.rows[0];
                if (stage === "update") {
                  failures += 1;
                  throw new Error("Injected TROUPE_UPDATED failure after UPDATE");
                }
              }
              return result;
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
          response = await request(troupes.target.id, "assigned", { name: "Debe revertirse", client: null, actorUserId: ids.admin });
        } finally {
          connectMock.mock.restore();
          for (const restore of restores.reverse()) restore();
        }
        assert.equal(response.status, 500);
        assert.deepEqual(await response.json(), { code: "INTERNAL_ERROR" });
        assert.equal(failures, 1);
        assert.deepEqual(updatedRow, { ...troupes.target, name: "Debe revertirse" }, "UPDATE real previo al fallo");
        assert.deepEqual(await snapshot(), before);
      }
    });

    await context.test("revocación y cambio de rol rigen al siguiente request sin afectar otra asignación ni ADMIN", async () => {
      await pool.query("UPDATE admin_event_assignment SET is_active=false WHERE user_id=$1 AND event_id=$2", [ids.assigned, ids.target]);
      await assertRejected(troupes.target.id, "assigned", 403, { code: "ADMIN_REQUIRED" });
      await assertUpdated("otherEvent", "assigned", { name: "Independiente" }, { name: "Independiente" });
      await assertUpdated("target", "admin", { name: "Global" }, { name: "Global" });
      await assertUpdated("target", "assignedAdmin", { name: "Global sin delegación" }, { name: "Global sin delegación" });
      await pool.query("DELETE FROM user_role WHERE user_id=$1 AND role_code='ADMIN'", [ids.assignedAdmin]);
      await assertRejected(troupes.target.id, "assignedAdmin", 403, { code: "ADMIN_REQUIRED" }, { role: "ADMIN" });
    });

    await context.test("evento activo OPEN/CLOSED conserva bloqueo persistente de PATCH para ambos actores", async () => {
      const eventId = ids.lifecycle;
      const { rows: [night] } = await pool.query("INSERT INTO night(event_id,name,display_order,kind,status) VALUES ($1,'Noche',1,'COMPETITION','OPEN') RETURNING id", [eventId]);
      const { rows: [specialty] } = await pool.query("INSERT INTO event_specialty(event_id,name,code,display_order) VALUES ($1,'Baile','BAILE',1) RETURNING id", [eventId]);
      const { rows: [rubric] } = await pool.query("INSERT INTO rubric(event_id,name,code,evaluation_target) VALUES ($1,'Rubro','RUBRO','TROUPE') RETURNING id", [eventId]);
      await pool.query("INSERT INTO evaluation_item(event_id,rubric_id,specialty_id,name,code) VALUES ($1,$2,$3,'Item','ITEM')", [eventId, rubric.id, specialty.id]);
      await pool.query("INSERT INTO night_troupe_schedule(event_id,night_id,event_troupe_id,presentation_order) VALUES ($1,$2,$3,1)", [eventId, night.id, troupes.lifecycle.id]);
      await seedActiveJudge({ client: pool, eventId, nightId: night.id, specialtyId: specialty.id });
      const opened = await fetch(`${baseUrl}/api/v1/events/${eventId}/open`, {
        method: "POST", headers: { "x-test-session": "admin", "Idempotency-Key": randomUUID() },
      });
      assert.equal(opened.status, 200);
      assert.equal((await opened.json()).status, "OPEN");
      for (const status of ["OPEN", "CLOSED"]) {
        if (status === "CLOSED") {
          await pool.query("UPDATE night SET status='CLOSED' WHERE id=$1", [night.id]);
          await pool.query("UPDATE carnival_event SET status='CLOSED' WHERE id=$1", [eventId]);
        }
        assert.deepEqual((await pool.query("SELECT active,status FROM carnival_event WHERE id=$1", [eventId])).rows, [{ active: true, status }]);
        for (const session of ["assigned", "admin"]) await assertRejected(troupes.lifecycle.id, session, 409, { code: "EVENT_LOCKED" });
        await assertRejected(troupes.lifecycle.id, "other", 403, { code: "ADMIN_REQUIRED" });
      }
    });
  });
});

test("POST categorías limita el alta al evento de ruta con permiso vigente y auditoría atómica", {
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
  const pool = getPool();
  const ids = Object.fromEntries([
    "admin", "assignedAdmin", "assigned", "other", "judge", "unassigned",
    "target", "otherEvent", "inactive", "open", "closed",
  ].map((key) => [key, randomUUID()]));
  await pool.query(
    `INSERT INTO "user" (id, name, email, "emailVerified")
     SELECT id, '036 T2 fixture', id || '@example.test', true FROM unnest($1::text[]) AS id`,
    [[ids.admin, ids.assignedAdmin, ids.assigned, ids.other, ids.judge, ids.unassigned]],
  );
  await pool.query("INSERT INTO user_role (user_id, role_code) VALUES ($1, 'ADMIN'), ($2, 'ADMIN'), ($3, 'JUDGE')", [ids.admin, ids.assignedAdmin, ids.judge]);
  await pool.query(
    `INSERT INTO carnival_event (id, name, status, active) VALUES
     ($1, '036 T2 target', 'CONFIGURING', true), ($2, '036 T2 other', 'CONFIGURING', true),
     ($3, '036 T2 inactive', 'CONFIGURING', false), ($4, '036 T2 open', 'OPEN', true),
     ($5, '036 T2 closed', 'CLOSED', true)`,
    [ids.target, ids.otherEvent, ids.inactive, ids.open, ids.closed],
  );
  await pool.query(
    `INSERT INTO admin_event_assignment (user_id, event_id, is_active) VALUES
     ($1, $2, true), ($1, $3, true), ($1, $4, true), ($1, $5, true), ($6, $2, true), ($7, $8, true)`,
    [ids.assigned, ids.target, ids.inactive, ids.open, ids.closed, ids.assignedAdmin, ids.other, ids.otherEvent],
  );
  const sessions = Object.fromEntries(["admin", "assignedAdmin", "assigned", "other", "judge", "unassigned"]
    .map((key) => [key, { user: { id: ids[key], twoFactorEnabled: true } }]));
  sessions.noTwoFactor = { user: { id: ids.assigned, twoFactorEnabled: false } };
  const app = createApp({ getSession: async ({ headers }) => sessions[headers.get("x-test-session")] ?? null });

  await withServer(app, async (baseUrl) => {
    const request = (eventId, session, payload = { name: "Nueva categoría" }, query = "", extraHeaders = {}) => fetch(
      `${baseUrl}/api/v1/events/${eventId}/categories${query}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(session ? { "x-test-session": session } : {}), ...extraHeaders },
        body: JSON.stringify(payload),
      },
    );
    const snapshot = async () => (await Promise.all([
      pool.query("SELECT * FROM event_category ORDER BY id"),
      pool.query("SELECT * FROM audit_event ORDER BY id"),
      pool.query("SELECT * FROM general_audit_hash_chain_head"),
    ])).map(({ rows }) => rows);
    const assertCreated = async (response, actor, eventId, expected) => {
      assert.equal(response.status, 201);
      const category = await response.json();
      assert.match(category.id, /^[0-9a-f-]{36}$/);
      assert.deepEqual(category, { id: category.id, eventId, active: true, ...expected });
      assert.deepEqual((await pool.query(
        'SELECT id, event_id AS "eventId", name, code, display_order AS "displayOrder", active FROM event_category WHERE id=$1',
        [category.id],
      )).rows, [category]);
      assert.deepEqual((await pool.query(
        `SELECT actor_user_id AS "actorUserId", action, entity_type AS "entityType", after_data AS "after"
         FROM audit_event WHERE entity_id=$1`, [category.id],
      )).rows, [{ actorUserId: actor, action: "CATEGORY_CREATED", entityType: "event_category", after: category }]);
      return category;
    };

    // RED anchor: the former ADMIN catch-all rejects this authorized delegate.
    await assertCreated(await request(ids.target, "assigned", { name: " Categoría juvenil ", displayOrder: 3 }),
      ids.assigned, ids.target, { name: "Categoría juvenil", code: "CATEGORIA_JUVENIL", displayOrder: 3 });

    await context.test("ADMIN conserva alcance global con y sin asignación; prevalece sobre ADMIN_EVENT", async () => {
      for (const [index, session] of ["admin", "assignedAdmin"].entries()) {
        await assertCreated(await request(ids.otherEvent, session, { name: `Global ${index}`, code: ` GLOBAL_${index} ` }),
          ids[session], ids.otherEvent, { name: `Global ${index}`, code: `GLOBAL_${index}`, displayOrder: index + 1 });
      }
      await pool.query("UPDATE admin_event_assignment SET is_active=false WHERE user_id=$1", [ids.assignedAdmin]);
      await assertCreated(await request(ids.target, "assignedAdmin", { name: "Global tras revocación" }),
        ids.assignedAdmin, ids.target, { name: "Global tras revocación", code: "GLOBAL_TRAS_REVOCACION", displayOrder: 4 });
    });

    await context.test("rechaza sesión/2FA/permisos, evento ajeno/inactivo y validaciones sin efectos ni divulgación", async () => {
      const before = await snapshot();
      const cases = [
        [ids.target, null, 401, { code: "UNAUTHENTICATED" }],
        [ids.target, "expired", 401, { code: "UNAUTHENTICATED" }],
        [ids.target, "noTwoFactor", 403, { code: "TWO_FACTOR_REQUIRED" }],
        [ids.target, "judge", 403, { code: "ADMIN_REQUIRED" }],
        [ids.target, "unassigned", 403, { code: "ADMIN_REQUIRED" }],
        [ids.target, "other", 403, { code: "ADMIN_REQUIRED" }],
        [ids.otherEvent, "assigned", 403, { code: "ADMIN_REQUIRED" }],
        [randomUUID(), "assigned", 403, { code: "ADMIN_REQUIRED" }],
        [ids.inactive, "assigned", 403, { code: "ADMIN_REQUIRED" }],
        [ids.inactive, "admin", 409, { code: "EVENT_LOCKED" }],
        [ids.open, "assigned", 409, { code: "EVENT_LOCKED" }],
        [ids.closed, "assigned", 409, { code: "EVENT_LOCKED" }],
        [ids.open, "admin", 409, { code: "EVENT_LOCKED" }],
        [randomUUID(), "admin", 404, { code: "EVENT_NOT_FOUND" }],
        ["not-a-uuid", "admin", 400, { code: "VALIDATION_ERROR" }],
        [ids.target, "assigned", 400, { code: "VALIDATION_ERROR", message: "name debe ser texto no vacío." }, { name: " " }],
        [ids.target, "assigned", 400, { code: "VALIDATION_ERROR", message: "code debe ser texto no vacío." }, { name: "Valid", code: " " }],
        [ids.target, "assigned", 400, { code: "VALIDATION_ERROR", message: "displayOrder debe ser entero positivo." }, { name: "Valid", displayOrder: 0 }],
        [ids.target, "assigned", 400, { code: "VALIDATION_ERROR", message: "displayOrder debe ser entero positivo." }, { name: "Valid", displayOrder: 1.5 }],
        [ids.target, "assigned", 409, { code: "RESOURCE_CONFLICT" }, { name: "Duplicada", code: "CATEGORIA_JUVENIL" }],
        [ids.target, "assigned", 409, { code: "RESOURCE_CONFLICT" }, { name: "Duplicada orden", displayOrder: 3 }],
      ];
      for (const [eventId, session, status, expected, payload] of cases) {
        const response = await request(eventId, session, payload);
        assert.equal(response.status, status, `${session} POST ${eventId} ${JSON.stringify(payload)}`);
        assert.deepEqual(await response.json(), expected);
      }
      const spoofed = await request(ids.otherEvent, "assigned", {
        name: "No autorizada", eventId: ids.target, userId: ids.admin, actorUserId: ids.admin,
        role: "ADMIN", permissions: ["ADMIN"], client: {},
      }, `?eventId=${ids.target}&role=ADMIN&userId=${ids.admin}&permissions=ADMIN`, {
        "x-role": "ADMIN", "x-user-id": ids.admin, "x-event-id": ids.target, "x-permissions": "ADMIN",
      });
      assert.equal(spoofed.status, 403);
      assert.deepEqual(await spoofed.json(), { code: "ADMIN_REQUIRED" });
      assert.deepEqual(await snapshot(), before);
    });

    await context.test("body/query no desplazan eventId/client ni actor, incluso con asignación a ambos eventos", async () => {
      for (const [index, session] of ["assigned", "assigned", "admin"].entries()) {
        if (index === 1) await pool.query(
          "INSERT INTO admin_event_assignment (user_id,event_id,is_active) VALUES ($1,$2,true)",
          [ids.assigned, ids.otherEvent],
        );
        const beforeOther = (await pool.query("SELECT * FROM event_category WHERE event_id=$1 ORDER BY id", [ids.otherEvent])).rows;
        await assertCreated(await request(ids.target, session, {
          name: `Ruta ${index}`, eventId: ids.otherEvent, client: null, actorUserId: ids.other,
          userId: ids.other, role: "ADMIN", permissions: ["ADMIN"], active: false,
        }, `?eventId=${ids.otherEvent}&userId=${ids.other}&role=ADMIN`, { "x-user-id": ids.other, "x-role": "ADMIN" }),
        ids[session], ids.target, { name: `Ruta ${index}`, code: `RUTA_${index}`, displayOrder: 5 + index });
        assert.deepEqual((await pool.query("SELECT * FROM event_category WHERE event_id=$1 ORDER BY id", [ids.otherEvent])).rows, beforeOther);
      }
    });

    await context.test("fallos de alta y auditoría revierten categoría, evidencia y cabecera hash", async () => {
      for (const failingTable of ["event_category", "audit_event"]) {
        const before = await snapshot();
        const originalConnect = pool.connect;
        const restoreQueries = [];
        let failures = 0;
        let insertedCategoryId;
        // Inject only persistence failure; authorization and real PostgreSQL transaction remain intact.
        const connectMock = context.mock.method(pool, "connect", function (...args) {
          const wrap = (client) => {
            const descriptor = Object.getOwnPropertyDescriptor(client, "query");
            const originalQuery = client.query;
            client.query = async function (query, ...queryArgs) {
              if (typeof query === "string" && new RegExp(`^\\s*INSERT\\s+INTO\\s+${failingTable}\\b`, "i").test(query)) {
                failures += 1;
                throw new Error(`Injected CATEGORY_CREATED ${failingTable} failure`);
              }
              const result = await originalQuery.call(client, query, ...queryArgs);
              if (typeof query === "string" && /^\s*INSERT\s+INTO\s+event_category\b/i.test(query)) insertedCategoryId = result.rows[0].id;
              return result;
            };
            restoreQueries.push(() => {
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
          response = await request(ids.target, "assigned", { name: `Rollback ${failingTable}`, client: null, actorUserId: ids.admin });
        } finally {
          connectMock.mock.restore();
          for (const restore of restoreQueries.reverse()) restore();
        }
        assert.equal(response.status, 500);
        assert.deepEqual(await response.json(), { code: "INTERNAL_ERROR" });
        assert.equal(failures, 1);
        if (failingTable === "audit_event") assert.ok(insertedCategoryId, "alta real antes de fallo de auditoría");
        assert.deepEqual(await snapshot(), before);
      }
    });

    await context.test("revocación y cambio de rol se aplican al próximo request sin afectar otro acceso", async () => {
      await pool.query("UPDATE admin_event_assignment SET is_active=false WHERE user_id=$1 AND event_id=$2", [ids.assigned, ids.target]);
      const before = await snapshot();
      const revoked = await request(ids.target, "assigned");
      assert.equal(revoked.status, 403);
      assert.deepEqual(await revoked.json(), { code: "ADMIN_REQUIRED" });
      assert.deepEqual(await snapshot(), before);
      await assertCreated(await request(ids.otherEvent, "assigned", { name: "Independiente" }),
        ids.assigned, ids.otherEvent, { name: "Independiente", code: "INDEPENDIENTE", displayOrder: 3 });
      await assertCreated(await request(ids.target, "admin", { name: "Global vigente" }),
        ids.admin, ids.target, { name: "Global vigente", code: "GLOBAL_VIGENTE", displayOrder: 8 });
      await pool.query("DELETE FROM user_role WHERE user_id=$1 AND role_code='ADMIN'", [ids.assignedAdmin]);
      const beforeRoleDenial = await snapshot();
      const removedRole = await request(ids.target, "assignedAdmin", { name: "Rol revocado", role: "ADMIN" });
      assert.equal(removedRole.status, 403);
      assert.deepEqual(await removedRole.json(), { code: "ADMIN_REQUIRED" });
      assert.deepEqual(await snapshot(), beforeRoleDenial);
    });
  });
});

test("PATCH categoría autoriza por propietario persistido y conserva contrato, guardas y atomicidad", {
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
  const pool = getPool();
  const users = ["admin", "assignedAdmin", "assigned", "other", "judge", "unassigned"];
  const ids = Object.fromEntries([...users, "target", "otherEvent", "inactive", "lifecycle"]
    .map((key) => [key, randomUUID()]));
  await pool.query(
    `INSERT INTO "user" (id, name, email, "emailVerified")
     SELECT id, '036 T3 fixture', id || '@example.test', true FROM unnest($1::text[]) AS id`,
    [users.map((key) => ids[key])],
  );
  await pool.query("INSERT INTO user_role (user_id, role_code) VALUES ($1, 'ADMIN'), ($2, 'ADMIN'), ($3, 'JUDGE')",
    [ids.admin, ids.assignedAdmin, ids.judge]);
  const categories = {};
  for (const key of ["target", "otherEvent", "inactive", "lifecycle"]) {
    await pool.query("INSERT INTO carnival_event (id,name,active) VALUES ($1,$2,$3)",
      [ids[key], `036 T3 ${key}`, key !== "inactive"]);
    const { rows: [category] } = await pool.query(
      `INSERT INTO event_category (event_id,name,code,display_order)
       VALUES ($1,'Original','ORIGINAL',1)
       RETURNING id, event_id AS "eventId", name, code, display_order AS "displayOrder", active`, [ids[key]],
    );
    categories[key] = category;
  }
  await pool.query("INSERT INTO event_category (event_id,name,code,display_order) VALUES ($1,'Otra','OTHER',2)", [ids.target]);
  await pool.query(
    `INSERT INTO admin_event_assignment (user_id,event_id,is_active) VALUES
     ($1,$2,true),($1,$3,true),($1,$4,true),($5,$2,true),($6,$7,true)`,
    [ids.assigned, ids.target, ids.inactive, ids.lifecycle, ids.assignedAdmin, ids.other, ids.otherEvent],
  );
  const sessions = Object.fromEntries(users.map((key) => [key, { user: { id: ids[key], twoFactorEnabled: true } }]));
  sessions.noTwoFactor = { user: { id: ids.assigned, twoFactorEnabled: false } };
  const app = createApp({ getSession: async ({ headers }) => sessions[headers.get("x-test-session")] ?? null });

  await withServer(app, async (baseUrl) => {
    const request = (categoryId, session, payload = { name: "Editada" }, query = "", extraHeaders = {}) => fetch(
      `${baseUrl}/api/v1/categories/${categoryId}${query}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", ...(session ? { "x-test-session": session } : {}), ...extraHeaders },
        body: JSON.stringify(payload),
      },
    );
    const snapshot = async () => (await Promise.all([
      pool.query("SELECT * FROM event_category ORDER BY id"),
      pool.query("SELECT * FROM carnival_event ORDER BY id"),
      pool.query("SELECT * FROM event_troupe ORDER BY id"),
      pool.query("SELECT * FROM audit_event ORDER BY id"),
      pool.query("SELECT * FROM general_audit_hash_chain_head"),
    ])).map(({ rows }) => rows);
    const assertUpdated = async (key, session, payload, options = {}) => {
      const beforeAudit = (await pool.query("SELECT id FROM audit_event WHERE entity_id=$1", [categories[key].id])).rows;
      const response = await request(categories[key].id, session, payload, options.query, options.headers);
      assert.equal(response.status, 200);
      const expected = { ...categories[key], ...options.expected };
      assert.deepEqual(await response.json(), expected);
      assert.deepEqual((await pool.query(
        'SELECT id, event_id AS "eventId", name, code, display_order AS "displayOrder", active FROM event_category WHERE id=$1',
        [expected.id],
      )).rows, [expected]);
      const audits = (await pool.query(
        `SELECT id, actor_user_id AS "actorUserId", action, entity_type AS "entityType", after_data AS "after"
         FROM audit_event WHERE entity_id=$1`, [expected.id],
      )).rows.filter(({ id }) => !beforeAudit.some((row) => row.id === id));
      assert.equal(audits.length, 1);
      assert.deepEqual(audits[0], {
        id: audits[0].id, actorUserId: ids[session], action: "CATEGORY_UPDATED", entityType: "event_category", after: expected,
      });
      categories[key] = expected;
    };
    const assertRejected = async (categoryId, session, status, expected, payload, query, headers) => {
      const before = await snapshot();
      const response = await request(categoryId, session, payload, query, headers);
      assert.equal(response.status, status, `${session} PATCH ${categoryId} ${JSON.stringify(payload)}`);
      assert.deepEqual(await response.json(), expected);
      assert.deepEqual(await snapshot(), before);
    };

    // RED anchor: the ADMIN-only catch-all rejects the assigned delegate (403 instead of 200).
    await assertUpdated("target", "assigned", { name: " Editada ", code: " EDITADA ", displayOrder: 3, active: false }, {
      expected: { name: "Editada", code: "EDITADA", displayOrder: 3, active: false },
    });

    await context.test("active de categoría es editable en ambas direcciones sin cambiar el evento", async () => {
      await assertUpdated("target", "assigned", { active: true }, { expected: { active: true } });
      await assertUpdated("target", "assigned", {}, { expected: {} });
      assert.deepEqual((await pool.query("SELECT active,status FROM carnival_event WHERE id=$1", [ids.target])).rows,
        [{ active: true, status: "CONFIGURING" }]);
    });

    await context.test("ADMIN con y sin asignación mantiene alcance global, incluso sobre evento inactivo", async () => {
      for (const session of ["admin", "assignedAdmin"]) {
        await assertUpdated("otherEvent", session, { name: session }, { expected: { name: session } });
        await assertUpdated("inactive", session, { active: false }, { expected: { active: false } });
        await assertUpdated("inactive", session, { active: true }, { expected: { active: true } });
      }
      await pool.query("UPDATE admin_event_assignment SET is_active=false WHERE user_id=$1", [ids.assignedAdmin]);
      await assertUpdated("target", "assignedAdmin", { name: "Global vigente" }, { expected: { name: "Global vigente" } });
    });

    await context.test("sesión/2FA y permisos exactos rechazan sin divulgar ni mutar, antes de validar campos", async () => {
      for (const [key, session, status, code] of [
        ["target", null, 401, "UNAUTHENTICATED"],
        ["target", "expired", 401, "UNAUTHENTICATED"],
        ["target", "noTwoFactor", 403, "TWO_FACTOR_REQUIRED"],
        ["target", "judge", 403, "ADMIN_REQUIRED"],
        ["target", "unassigned", 403, "ADMIN_REQUIRED"],
        ["target", "other", 403, "ADMIN_REQUIRED"],
        ["otherEvent", "assigned", 403, "ADMIN_REQUIRED"],
        ["inactive", "assigned", 403, "ADMIN_REQUIRED"],
      ]) await assertRejected(categories[key].id, session, status, { code }, { name: " ", active: true });
      await assertRejected(randomUUID(), "assigned", 403, { code: "ADMIN_REQUIRED" });
      await assertRejected("not-a-uuid", "unassigned", 403, { code: "ADMIN_REQUIRED" });
      await assertRejected(randomUUID(), "admin", 404, { code: "CATEGORY_NOT_FOUND" });
      await assertRejected("not-a-uuid", "admin", 400, { code: "VALIDATION_ERROR" });
      await assertRejected(categories.otherEvent.id, "assigned", 403, { code: "ADMIN_REQUIRED" }, {
        name: "No permitida", eventId: ids.target, categoryId: categories.target.id, client: {},
        role: "ADMIN", userId: ids.admin, actorUserId: ids.admin, permissions: ["ADMIN"],
      }, `?eventId=${ids.target}&categoryId=${categories.target.id}&role=ADMIN&userId=${ids.admin}&permissions=ADMIN`, {
        "x-event-id": ids.target, "x-category-id": categories.target.id,
        "x-role": "ADMIN", "x-user-id": ids.admin, "x-permissions": "ADMIN",
      });
    });

    await context.test("validaciones y constraints conservan errores sin mutación ni auditoría parcial", async () => {
      for (const session of ["assigned", "admin"]) {
        for (const [payload, status, expected] of [
          [{ name: " " }, 400, { code: "VALIDATION_ERROR", message: "name debe ser texto no vacío." }],
          [{ code: "" }, 400, { code: "VALIDATION_ERROR", message: "code debe ser texto no vacío." }],
          [{ code: null }, 400, { code: "VALIDATION_ERROR", message: "code debe ser texto no vacío." }],
          [{ displayOrder: 0 }, 400, { code: "VALIDATION_ERROR", message: "displayOrder debe ser entero positivo." }],
          [{ displayOrder: 1.5 }, 400, { code: "VALIDATION_ERROR", message: "displayOrder debe ser entero positivo." }],
          [{ active: "false" }, 400, { code: "VALIDATION_ERROR", message: "active debe ser booleano." }],
          [{ active: null }, 400, { code: "VALIDATION_ERROR", message: "active debe ser booleano." }],
          [{ code: "OTHER" }, 409, { code: "RESOURCE_CONFLICT" }],
          [{ displayOrder: 2 }, 409, { code: "RESOURCE_CONFLICT" }],
        ]) await assertRejected(categories.target.id, session, status, expected, payload);
      }
    });

    await context.test("ruta y client prevalecen sobre spoof, también si ambos eventos están asignados", async () => {
      for (const [index, session] of ["assigned", "assigned", "admin"].entries()) {
        if (index === 1) await pool.query("INSERT INTO admin_event_assignment(user_id,event_id,is_active) VALUES ($1,$2,true)",
          [ids.assigned, ids.otherEvent]);
        const beforeOther = (await pool.query("SELECT * FROM event_category WHERE id=$1", [categories.otherEvent.id])).rows;
        await assertUpdated("target", session, {
          name: `Ruta ${index}`, eventId: ids.otherEvent, categoryId: categories.otherEvent.id,
          client: index === 1 ? {} : null, userId: ids.other, actorUserId: ids.other, role: "ADMIN", permissions: ["ADMIN"],
        }, {
          expected: { name: `Ruta ${index}` },
          query: `?categoryId=${categories.otherEvent.id}&eventId=${ids.otherEvent}&role=ADMIN&userId=${ids.other}`,
          headers: { "x-user-id": ids.other, "x-role": "ADMIN", "x-event-id": ids.otherEvent },
        });
        assert.deepEqual((await pool.query("SELECT * FROM event_category WHERE id=$1", [categories.otherEvent.id])).rows, beforeOther);
      }
    });

    await context.test("fallos de UPDATE/auditoría revierten actualización real y evidencia", async () => {
      for (const stage of ["update", "audit"]) {
        const before = await snapshot();
        const originalConnect = pool.connect;
        const restores = [];
        let failures = 0;
        let updatedRow;
        // Only inject a persistence failure; all authorization, writes and rollback use real PostgreSQL.
        const connectMock = context.mock.method(pool, "connect", function (...args) {
          const wrap = (client) => {
            const descriptor = Object.getOwnPropertyDescriptor(client, "query");
            const originalQuery = client.query;
            client.query = async function (query, ...queryArgs) {
              const isUpdate = typeof query === "string" && /^\s*UPDATE\s+event_category\b/i.test(query);
              const isAudit = typeof query === "string" && /^\s*INSERT\s+INTO\s+audit_event\b/i.test(query);
              if (stage === "audit" && isAudit) {
                failures += 1;
                throw new Error("Injected CATEGORY_UPDATED audit failure");
              }
              const result = await originalQuery.call(client, query, ...queryArgs);
              if (isUpdate) {
                updatedRow = result.rows[0];
                if (stage === "update") {
                  failures += 1;
                  throw new Error("Injected CATEGORY_UPDATED failure after UPDATE");
                }
              }
              return result;
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
          response = await request(categories.target.id, "assigned", { name: "Debe revertirse", client: null, actorUserId: ids.admin });
        } finally {
          connectMock.mock.restore();
          for (const restore of restores.reverse()) restore();
        }
        assert.equal(response.status, 500);
        assert.deepEqual(await response.json(), { code: "INTERNAL_ERROR" });
        assert.equal(failures, 1);
        assert.deepEqual(updatedRow, { ...categories.target, name: "Debe revertirse" }, "UPDATE real previo al fallo");
        assert.deepEqual(await snapshot(), before);
      }
    });

    await context.test("revocación y cambios de rol se reevalúan sin afectar otro evento ni ADMIN", async () => {
      await pool.query("UPDATE admin_event_assignment SET is_active=false WHERE user_id=$1 AND event_id=$2", [ids.assigned, ids.target]);
      await assertRejected(categories.target.id, "assigned", 403, { code: "ADMIN_REQUIRED" });
      await assertUpdated("otherEvent", "assigned", { name: "Independiente" }, { expected: { name: "Independiente" } });
      await assertUpdated("target", "admin", { name: "Global" }, { expected: { name: "Global" } });
      await pool.query("DELETE FROM user_role WHERE user_id=$1 AND role_code='ADMIN'", [ids.assignedAdmin]);
      await assertRejected(categories.target.id, "assignedAdmin", 403, { code: "ADMIN_REQUIRED" }, { role: "ADMIN" });
    });

    await context.test("guardas persistentes de OPEN/CLOSED siguen aplicando a ambos actores sin divulgar a ajenos", async () => {
      const eventId = ids.lifecycle;
      // Minimal ready fixture, without disabling constraints or triggers.
      const { rows: [night] } = await pool.query("INSERT INTO night(event_id,name,display_order,kind,status) VALUES ($1,'Noche',1,'COMPETITION','OPEN') RETURNING id", [eventId]);
      const { rows: [troupe] } = await pool.query("INSERT INTO event_troupe(event_id,category_id,name) VALUES ($1,$2,'Comparsa') RETURNING id", [eventId, categories.lifecycle.id]);
      const { rows: [specialty] } = await pool.query("INSERT INTO event_specialty(event_id,name,code,display_order) VALUES ($1,'Baile','BAILE',1) RETURNING id", [eventId]);
      const { rows: [rubric] } = await pool.query("INSERT INTO rubric(event_id,name,code,evaluation_target) VALUES ($1,'Rubro','RUBRO','TROUPE') RETURNING id", [eventId]);
      await pool.query("INSERT INTO evaluation_item(event_id,rubric_id,specialty_id,name,code) VALUES ($1,$2,$3,'Item','ITEM')", [eventId, rubric.id, specialty.id]);
      await pool.query("INSERT INTO night_troupe_schedule(event_id,night_id,event_troupe_id,presentation_order) VALUES ($1,$2,$3,1)", [eventId, night.id, troupe.id]);
      await seedActiveJudge({ client: pool, eventId, nightId: night.id, specialtyId: specialty.id });
      const opened = await fetch(`${baseUrl}/api/v1/events/${eventId}/open`, {
        method: "POST", headers: { "x-test-session": "admin", "Idempotency-Key": randomUUID() },
      });
      assert.equal(opened.status, 200);
      assert.equal((await opened.json()).status, "OPEN");
      for (const status of ["OPEN", "CLOSED"]) {
        if (status === "CLOSED") {
          await pool.query("UPDATE night SET status='CLOSED' WHERE id=$1", [night.id]);
          await pool.query("UPDATE carnival_event SET status='CLOSED' WHERE id=$1", [eventId]);
        }
        for (const session of ["assigned", "admin"]) {
          await assertRejected(categories.lifecycle.id, session, 409, { code: "EVENT_LOCKED" });
        }
        await assertRejected(categories.lifecycle.id, "other", 403, { code: "ADMIN_REQUIRED" });
      }
    });
  });
});

test("GET categorías autoriza ADMIN global y ADMIN_EVENT solo para asignaciones vigentes", {
  skip: !process.env.TEST_DATABASE_URL,
}, async (context) => {
  const original = process.env.DATABASE_URL;
  const adminId = randomUUID();
  const assignedAdminId = randomUUID();
  const assignedId = randomUUID();
  const revokedId = randomUUID();
  const roleOnlyId = randomUUID();
  const activeEventId = randomUUID();
  const otherEventId = randomUUID();
  const inactiveEventId = randomUUID();

  context.after(async () => {
    const pool = getPool();
    await pool.query("DELETE FROM admin_event_assignment WHERE user_id = ANY($1::text[])", [[adminId, assignedAdminId, assignedId, revokedId, roleOnlyId]]);
    await pool.query("DELETE FROM event_category WHERE event_id = ANY($1::uuid[])", [[activeEventId, otherEventId, inactiveEventId]]);
    await pool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [[adminId, assignedAdminId, assignedId, revokedId, roleOnlyId]]);
    await pool.query("DELETE FROM carnival_event WHERE id = ANY($1::uuid[])", [[activeEventId, otherEventId, inactiveEventId]]);
    await closePool();
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
  });

  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await migrate();
  const pool = getPool();
  await pool.query(
    `INSERT INTO "user" (id, name, email, "emailVerified")
     VALUES ($1, 'T1 global admin', $6, true), ($2, 'T1 assigned global admin', $7, true),
            ($3, 'T1 assigned event admin', $8, true), ($4, 'T1 revoked event admin', $9, true),
            ($5, 'T1 role only', $10, true)`,
    [adminId, assignedAdminId, assignedId, revokedId, roleOnlyId,
      `${adminId}@example.test`, `${assignedAdminId}@example.test`, `${assignedId}@example.test`,
      `${revokedId}@example.test`, `${roleOnlyId}@example.test`],
  );
  await pool.query(
    "INSERT INTO carnival_event (id, name, active) VALUES ($1, 'T1 active assigned', true), ($2, 'T1 unassigned', true), ($3, 'T1 inactive assigned', false)",
    [activeEventId, otherEventId, inactiveEventId],
  );
  const { rows: categories } = await pool.query(
    `INSERT INTO event_category (event_id, name, code, display_order, active)
     VALUES ($1, 'Inactive first', 'T1_INACTIVE', 1, false), ($1, 'Active second', 'T1_ACTIVE', 2, true),
            ($2, 'Private other category', 'T1_OTHER', 1, true), ($3, 'Inactive event category', 'T1_INACTIVE_EVENT', 1, true)
     RETURNING id, event_id AS "eventId", name, code, display_order AS "displayOrder", active`,
    [activeEventId, otherEventId, inactiveEventId],
  );
  await pool.query("INSERT INTO user_role (user_id, role_code) VALUES ($1, 'ADMIN'), ($2, 'ADMIN'), ($3, 'JUDGE')", [adminId, assignedAdminId, roleOnlyId]);
  await pool.query(
    `INSERT INTO admin_event_assignment (user_id, event_id, is_active)
     VALUES ($1, $2, true), ($1, $3, true), ($4, $2, true), ($5, $2, false)`,
    [assignedId, activeEventId, inactiveEventId, assignedAdminId, revokedId],
  );

  const app = createApp({
    getSession: async ({ headers }) => ({
      admin: { user: { id: adminId, twoFactorEnabled: true } },
      assignedAdmin: { user: { id: assignedAdminId, twoFactorEnabled: true } },
      assigned: { user: { id: assignedId, twoFactorEnabled: true } },
      revoked: { user: { id: revokedId, twoFactorEnabled: true } },
      roleOnly: { user: { id: roleOnlyId, twoFactorEnabled: true } },
      noTwoFactor: { user: { id: assignedId, twoFactorEnabled: false } },
    })[headers.get("x-test-session")] ?? null,
  });

  await withServer(app, async (baseUrl) => {
    const beforeAudit = await pool.query("SELECT count(*)::int AS count FROM audit_event");
    const activeUrl = `${baseUrl}/api/v1/events/${activeEventId}/categories`;
    const inactiveUrl = `${baseUrl}/api/v1/events/${inactiveEventId}/categories`;
    const otherUrl = `${baseUrl}/api/v1/events/${otherEventId}/categories`;
    const expectedActive = categories.filter(({ eventId }) => eventId === activeEventId)
      .sort((left, right) => left.displayOrder - right.displayOrder);
    const expectedInactive = categories.filter(({ eventId }) => eventId === inactiveEventId);

    const anonymous = await fetch(activeUrl);
    assert.equal(anonymous.status, 401);
    assert.deepEqual(await anonymous.json(), { code: "UNAUTHENTICATED" });
    const noTwoFactor = await fetch(activeUrl, { headers: { "x-test-session": "noTwoFactor" } });
    assert.equal(noTwoFactor.status, 403);
    assert.deepEqual(await noTwoFactor.json(), { code: "TWO_FACTOR_REQUIRED" });

    for (const session of ["admin", "assignedAdmin"]) {
      const globalRead = await fetch(otherUrl, { headers: { "x-test-session": session } });
      assert.equal(globalRead.status, 200, `${session} retains global ADMIN access`);
      assert.deepEqual(await globalRead.json(), categories.filter(({ eventId }) => eventId === otherEventId));
    }
    const missingForAdmin = await fetch(`${baseUrl}/api/v1/events/${randomUUID()}/categories`, { headers: { "x-test-session": "admin" } });
    assert.equal(missingForAdmin.status, 404);
    assert.deepEqual(await missingForAdmin.json(), { code: "EVENT_NOT_FOUND" });

    const assignedRead = await fetch(activeUrl, { headers: { "x-test-session": "assigned" } });
    assert.equal(assignedRead.status, 200);
    assert.deepEqual(await assignedRead.json(), expectedActive);
    const eligibleRead = await fetch(`${activeUrl}?eligible=true`, { headers: { "x-test-session": "assigned" } });
    assert.equal(eligibleRead.status, 200);
    assert.deepEqual(await eligibleRead.json(), expectedActive.filter(({ active }) => active));
    const inactiveRead = await fetch(inactiveUrl, { headers: { "x-test-session": "assigned" } });
    assert.equal(inactiveRead.status, 200);
    assert.deepEqual(await inactiveRead.json(), expectedInactive);

    const hiddenAssignedEvent = await fetch(otherUrl, { headers: { "x-test-session": "assigned" } });
    assert.equal(hiddenAssignedEvent.status, 403);
    assert.deepEqual(await hiddenAssignedEvent.json(), { code: "ADMIN_REQUIRED" });
    const hiddenMissingEvent = await fetch(`${baseUrl}/api/v1/events/${randomUUID()}/categories`, { headers: { "x-test-session": "assigned" } });
    assert.equal(hiddenMissingEvent.status, 403);
    assert.deepEqual(await hiddenMissingEvent.json(), { code: "ADMIN_REQUIRED" });
    const roleOnly = await fetch(activeUrl, { headers: { "x-test-session": "roleOnly" } });
    assert.equal(roleOnly.status, 403);
    assert.deepEqual(await roleOnly.json(), { code: "ADMIN_REQUIRED" });
    const revokedBeforeRead = await fetch(activeUrl, { headers: { "x-test-session": "revoked" } });
    assert.equal(revokedBeforeRead.status, 403);
    assert.deepEqual(await revokedBeforeRead.json(), { code: "ADMIN_REQUIRED" });

    const spoofedQueryAndHeaders = await fetch(
      `${otherUrl}?userId=${adminId}&role=ADMIN&eventId=${activeEventId}`,
      { headers: { "x-test-session": "assigned", "x-user-id": adminId, "x-role": "ADMIN", "x-event-id": activeEventId } },
    );
    assert.equal(spoofedQueryAndHeaders.status, 403);
    assert.deepEqual(await spoofedQueryAndHeaders.json(), { code: "ADMIN_REQUIRED" });
    const spoofedBody = await getWithBody(otherUrl, {
      "x-test-session": "assigned",
      "x-user-id": adminId,
      "x-role": "ADMIN",
      "x-event-id": activeEventId,
    }, JSON.stringify({ userId: adminId, role: "ADMIN", eventId: activeEventId, permissions: ["ADMIN"] }));
    assert.equal(spoofedBody.status, 403);
    assert.deepEqual(await spoofedBody.json(), { code: "ADMIN_REQUIRED" });

    await pool.query("UPDATE admin_event_assignment SET is_active = false WHERE user_id = $1 AND event_id = $2", [assignedId, activeEventId]);
    const revokedAfterRead = await fetch(activeUrl, { headers: { "x-test-session": "assigned" } });
    assert.equal(revokedAfterRead.status, 403);
    assert.deepEqual(await revokedAfterRead.json(), { code: "ADMIN_REQUIRED" });
    const independentAssignment = await fetch(inactiveUrl, { headers: { "x-test-session": "assigned" } });
    assert.equal(independentAssignment.status, 200);
    assert.deepEqual(await independentAssignment.json(), expectedInactive);

    const afterAudit = await pool.query("SELECT count(*)::int AS count FROM audit_event");
    assert.equal(afterAudit.rows[0].count, beforeAudit.rows[0].count);
  });
});
