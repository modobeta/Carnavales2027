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

test("Módulo VEEDOR: supervisión, incidencias y custodia criptográfica", {
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
  const veedorId = randomUUID();
  const judgeUserId = randomUUID();
  const unauthorizedId = randomUUID();

  await pool.query(
    `INSERT INTO "user"(id, name, email, "emailVerified")
     VALUES ($1, 'Admin', $2, true),
            ($3, 'Veedor Principal', $4, true),
            ($5, 'Judge Test', $6, true),
            ($7, 'Comisario', $8, true)`,
    [
      adminId, `admin-${adminId}@example.test`,
      veedorId, `veedor-${veedorId}@example.test`,
      judgeUserId, `judge-${judgeUserId}@example.test`,
      unauthorizedId, `unauth-${unauthorizedId}@example.test`,
    ],
  );

  await pool.query("INSERT INTO user_role (user_id, role_code) VALUES ($1, 'ADMIN')", [adminId]);
  await pool.query("INSERT INTO user_role (user_id, role_code) VALUES ($1, 'VEEDOR')", [veedorId]);
  await pool.query("INSERT INTO user_role (user_id, role_code) VALUES ($1, 'COMISARIO')", [unauthorizedId]);

  const { rows: [veedorProfile] } = await pool.query(
    `INSERT INTO operational_profile(name, email, document_number, user_id, registration_status, created_by)
     VALUES ($1, $2, $3, $4, 'REGISTERED', $5) RETURNING id`,
    ["Veedor Principal", `veedor-${veedorId}@example.test`, `DOC-V-${randomUUID()}`, veedorId, adminId],
  );
  await pool.query(
    "INSERT INTO operational_profile_role (operational_profile_id, role_code) VALUES ($1, 'VEEDOR')",
    [veedorProfile.id],
  );

  const { rows: [judgeProfile] } = await pool.query(
    `INSERT INTO judge_profile(name, email, document_number, user_id, registration_status, created_by)
     VALUES ($1, $2, $3, $4, 'REGISTERED', $5) RETURNING id`,
    ["Jurado Baile", `judge-${judgeUserId}@example.test`, `DOC-J-${randomUUID()}`, judgeUserId, adminId],
  );

  // Evento, Noche, Categoria, Comparsa, Especialidad, Rubro, Ítem
  const { rows: [event] } = await pool.query(
    "INSERT INTO carnival_event(name) VALUES($1) RETURNING id", ["Carnaval Goya 2027"],
  );
  const { rows: [category] } = await pool.query(
    "INSERT INTO event_category(event_id, name, code, display_order) VALUES($1, $2, $3, $4) RETURNING id",
    [event.id, "Comparsas Mayores", "MAYORES", 1],
  );
  const { rows: [night] } = await pool.query(
    "INSERT INTO night(event_id, name, display_order, kind, status) VALUES($1,$2,$3,$4,$5) RETURNING id",
    [event.id, "Noche 1 - Competencia", 1, "COMPETITION", "OPEN"],
  );
  const { rows: [troupe] } = await pool.query(
    "INSERT INTO event_troupe(event_id, category_id, name) VALUES($1,$2,$3) RETURNING id",
    [event.id, category.id, "Poramba"],
  );
  const { rows: [schedule] } = await pool.query(
    "INSERT INTO night_troupe_schedule(event_id, night_id, event_troupe_id, presentation_order) VALUES($1,$2,$3,$4) RETURNING id",
    [event.id, night.id, troupe.id, 1],
  );
  const { rows: [specialty] } = await pool.query(
    "INSERT INTO event_specialty(event_id, name, code, display_order) VALUES($1,$2,$3,$4) RETURNING id",
    [event.id, "Danza y Coreografía", "BAILE", 1],
  );
  const { rows: [rubric] } = await pool.query(
    "INSERT INTO rubric(event_id, name, code, evaluation_target) VALUES($1,$2,$3,$4) RETURNING id",
    [event.id, "Coreografía General", "COREO", "TROUPE"],
  );
  const { rows: [item] } = await pool.query(
    "INSERT INTO evaluation_item(event_id, rubric_id, specialty_id, name, code) VALUES($1,$2,$3,$4,$5) RETURNING id",
    [event.id, rubric.id, specialty.id, "Coordinación", "COORD"],
  );

  await pool.query(
    "INSERT INTO judge_quota(event_id, night_id, specialty_id, max_assignments) VALUES($1,$2,$3,$4)",
    [event.id, night.id, specialty.id, 3],
  );

  const { rows: [assignment] } = await pool.query(
    `INSERT INTO judge_assignment(event_id, night_id, specialty_id, judge_profile_id, assignment_type, status)
     VALUES($1,$2,$3,$4,'PRIMARY','ACTIVE') RETURNING id`,
    [event.id, night.id, specialty.id, judgeProfile.id],
  );

  const { rows: [ballot] } = await pool.query(
    `INSERT INTO ballot (event_id, night_id, judge_assignment_id, judge_profile_id, specialty_id, status)
     VALUES ($1,$2,$3,$4,$5,'OPEN') RETURNING id`,
    [event.id, night.id, assignment.id, judgeProfile.id, specialty.id],
  );

  await pool.query(
    `INSERT INTO ballot_score (ballot_id, event_id, evaluation_item_id, rubric_id, night_schedule_id, score, evaluation_state)
     VALUES ($1,$2,$3,$4,$5,9,'SCORED')`,
    [ballot.id, event.id, item.id, rubric.id, schedule.id],
  );

  const app = createApp({
    getSession: async ({ headers }) => {
      const role = headers.get("x-test-session");
      if (role === "admin") return { user: { id: adminId, twoFactorEnabled: true } };
      if (role === "veedor") return { user: { id: veedorId, twoFactorEnabled: true } };
      if (role === "unauthorized") return { user: { id: unauthorizedId, twoFactorEnabled: true } };
      return null;
    },
  });

  await withServer(app, async (baseUrl) => {
    // 1. Permisos RBAC: unauthorized role recibe 403
    const forbiddenRes = await fetch(`${baseUrl}/api/v1/monitor/events/${event.id}/nights/${night.id}/judges`, {
      headers: { "x-test-session": "unauthorized" },
    });
    assert.equal(forbiddenRes.status, 403);

    // 2. Veedor supervisa jurados
    const judgesRes = await fetch(`${baseUrl}/api/v1/monitor/events/${event.id}/nights/${night.id}/judges`, {
      headers: { "x-test-session": "veedor" },
    });
    assert.equal(judgesRes.status, 200);
    const judges = await judgesRes.json();
    assert.equal(judges.length, 1);
    assert.equal(judges[0].judgeName, "Jurado Baile");
    assert.equal(judges[0].specialtyName, "Danza y Coreografía");
    assert.equal(judges[0].totalScores, 1);
    assert.equal(judges[0].resolvedScores, 1);
    assert.equal(judges[0].progress, 100);
    // Verificar que NO expone notas individuales (secreto del voto)
    assert.equal(judges[0].score, undefined);
    assert.equal(judges[0].scores, undefined);

    // 3. Veedor supervisa planillas
    const ballotsRes = await fetch(`${baseUrl}/api/v1/monitor/events/${event.id}/nights/${night.id}/ballots`, {
      headers: { "x-test-session": "veedor" },
    });
    assert.equal(ballotsRes.status, 200);
    const ballots = await ballotsRes.json();
    assert.equal(ballots.length, 1);
    assert.equal(ballots[0].ballotStatus, "OPEN");
    assert.equal(ballots[0].troupes.length, 1);
    assert.equal(ballots[0].troupes[0].troupeName, "Poramba");
    assert.equal(ballots[0].troupes[0].scoredItems, 1);
    assert.equal(ballots[0].score, undefined);

    // 4. Registrar incidencia: validaciones
    const badTypeRes = await fetch(`${baseUrl}/api/v1/monitor/events/${event.id}/nights/${night.id}/incidents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-session": "veedor" },
      body: JSON.stringify({ incidentType: "INVALID_TYPE", description: "Test" }),
    });
    assert.equal(badTypeRes.status, 400);

    // 5. Registrar incidencia válida
    const createIncRes = await fetch(`${baseUrl}/api/v1/monitor/events/${event.id}/nights/${night.id}/incidents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-session": "veedor" },
      body: JSON.stringify({
        incidentType: "UNSCORED_ITEM",
        description: "El jurado omitió evaluar un rubro reglamentario.",
        eventTroupeId: troupe.id,
        judgeProfileId: judgeProfile.id,
        ballotId: ballot.id,
      }),
    });
    assert.equal(createIncRes.status, 201);
    const createdIncident = await createIncRes.json();
    assert.equal(createdIncident.status, "OPEN");
    assert.equal(createdIncident.incidentType, "UNSCORED_ITEM");

    // 6. Listar incidencias
    const listIncRes = await fetch(`${baseUrl}/api/v1/monitor/events/${event.id}/nights/${night.id}/incidents`, {
      headers: { "x-test-session": "veedor" },
    });
    assert.equal(listIncRes.status, 200);
    const incidents = await listIncRes.json();
    assert.equal(incidents.length, 1);
    assert.equal(incidents[0].id, createdIncident.id);
    assert.equal(incidents[0].troupeName, "Poramba");
    assert.equal(incidents[0].judgeName, "Jurado Baile");

    // 7. Modificar estado de incidencia: transición a IN_SUBSANATION
    const updateIncRes = await fetch(`${baseUrl}/api/v1/monitor/events/${event.id}/incidents/${createdIncident.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-test-session": "veedor" },
      body: JSON.stringify({ status: "IN_SUBSANATION" }),
    });
    assert.equal(updateIncRes.status, 200);
    const inSubsan = await updateIncRes.json();
    assert.equal(inSubsan.status, "IN_SUBSANATION");

    // 8. Resolver incidencia sin notas falla con 400
    const failResolveRes = await fetch(`${baseUrl}/api/v1/monitor/events/${event.id}/incidents/${createdIncident.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-test-session": "veedor" },
      body: JSON.stringify({ status: "RESOLVED" }),
    });
    assert.equal(failResolveRes.status, 400);

    // 9. Resolver incidencia con notas de resolución
    const resolveRes = await fetch(`${baseUrl}/api/v1/monitor/events/${event.id}/incidents/${createdIncident.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-test-session": "veedor" },
      body: JSON.stringify({
        status: "RESOLVED",
        resolutionNotes: "El jurado completó la planilla formalmente según el acta número 12.",
      }),
    });
    assert.equal(resolveRes.status, 200);
    const resolved = await resolveRes.json();
    assert.equal(resolved.status, "RESOLVED");
    assert.equal(resolved.resolvedByUserId, veedorId);
    assert(resolved.resolvedAt);

    // 10. Guard contra DELETE en voting_incident (inmutabilidad/preservación de evidencia)
    await assert.rejects(
      async () => {
        await pool.query("DELETE FROM voting_incident WHERE id = $1", [createdIncident.id]);
      },
      /CANNOT_DELETE_VOTING_INCIDENT/,
    );

    // 11. Custodia de planilla: Falla si está en OPEN (no confirmada/presentada)
    const custodyOpenRes = await fetch(
      `${baseUrl}/api/v1/monitor/events/${event.id}/nights/${night.id}/ballots/${ballot.id}/custody`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-test-session": "veedor" },
        body: JSON.stringify({ notes: "Recepción de prueba" }),
      },
    );
    assert.equal(custodyOpenRes.status, 409);

    // Simular que el jurado presenta y confirma la planilla
    await pool.query("UPDATE ballot SET status = 'SUBMITTED', submitted_at = CURRENT_TIMESTAMP WHERE id = $1", [ballot.id]);

    // 12. Recepción formal de custodia por el veedor
    const custodySuccessRes = await fetch(
      `${baseUrl}/api/v1/monitor/events/${event.id}/nights/${night.id}/ballots/${ballot.id}/custody`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-test-session": "veedor" },
        body: JSON.stringify({ notes: "Planilla recibida formalmente en corsódromo sin observaciones." }),
      },
    );
    assert.equal(custodySuccessRes.status, 201);
    const custodyRecord = await custodySuccessRes.json();
    assert.equal(custodyRecord.custodyStatus, "RECEIVED");
    assert.equal(custodyRecord.canonicalHash.length, 64);

    // 13. Reintento de custodia: 409 BALLOT_ALREADY_IN_CUSTODY
    const custodyDuplicateRes = await fetch(
      `${baseUrl}/api/v1/monitor/events/${event.id}/nights/${night.id}/ballots/${ballot.id}/custody`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-test-session": "veedor" },
        body: JSON.stringify({ notes: "Intento duplicado" }),
      },
    );
    assert.equal(custodyDuplicateRes.status, 409);

    // 14. Listar custodia y verificar integridad criptográfica
    const custodyListRes = await fetch(
      `${baseUrl}/api/v1/monitor/events/${event.id}/nights/${night.id}/custody`,
      {
        headers: { "x-test-session": "veedor" },
      },
    );
    assert.equal(custodyListRes.status, 200);
    const custodyList = await custodyListRes.json();
    assert.equal(custodyList.length, 1);
    assert.equal(custodyList[0].integrityStatus, "VERIFIED");
    assert.equal(custodyList[0].canonicalHash, custodyRecord.canonicalHash);

    // 15. Guard append-only en ballot_custody_log contra UPDATE o DELETE
    await assert.rejects(
      async () => {
        await pool.query("DELETE FROM ballot_custody_log WHERE id = $1", [custodyRecord.id]);
      },
      /CANNOT_DELETE_BALLOT_CUSTODY_LOG/,
    );

    await assert.rejects(
      async () => {
        await pool.query("UPDATE ballot_custody_log SET notes = 'Alterado' WHERE id = $1", [custodyRecord.id]);
      },
      /CANNOT_UPDATE_BALLOT_CUSTODY_LOG/,
    );
  });
});
