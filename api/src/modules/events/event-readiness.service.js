import { auditEvent } from "../../audit/audit-service.js";
import { getPool } from "../../db/pool.js";

const READINESS_MESSAGES = {
  COMPETITION_NIGHT: { ok: "Jornadas de competencia configuradas", fail: "No existe ninguna jornada de competencia configurada" },
  ACTIVE_TROUPE: { ok: "Comparsas activas", fail: "No hay comparsas activas registradas" },
  ACTIVE_SPECIALTY: { ok: "Especialidades activas", fail: "No hay especialidades activas configuradas" },
  ACTIVE_RUBRIC: { ok: "Rubros activos", fail: "No existe ningún rubro activo" },
  INCOMPLETE_TROUPES: { ok: "Comparsas con categoría válida", fail: "Existen comparsas sin categoría activa" },
  INCOMPLETE_RUBRICS: { ok: "Rubros con ítems válidos", fail: "Existen rubros sin ítems puntuables o con especialidades inactivas" },
  INCOMPLETE_NOMINATIONS: { ok: "Participantes nominados cargados", fail: "Faltan participantes nominados en rubros o comparsas" },
  INCOMPLETE_SCHEDULES: { ok: "Orden de pasada completo", fail: "Una o más jornadas no tienen comparsas programadas en el orden de pasada" },
  NIGHTS_WITHOUT_JURY: { ok: "Jurado asignado en todas las jornadas", fail: "Hay jornadas de competencia sin jurado asignado" },
};

function humanLabel(code) {
  return READINESS_MESSAGES[code]?.fail ?? code;
}

/**
 * Noches de competencia sin ningún jurado activo.
 *
 * El alcance es kind='COMPETITION' porque `protect_judge_assignment` sólo admite
 * asignaciones sobre noches de competencia; exigir jurado en noches AWARDS haría
 * imposible abrir cualquier evento que las tenga. La misma condición está en el
 * guard de base de datos (migración 083) para que un UPDATE directo de status no
 * pueda esquivarla.
 */
async function findNightsWithoutJury(client, eventId) {
  const { rows } = await client.query(
    `SELECT n.id AS "nightId", n.name AS "nightName", n.display_order AS "displayOrder"
       FROM night n
      WHERE n.event_id = $1 AND n.kind = 'COMPETITION'
        AND NOT EXISTS (
          SELECT 1 FROM judge_assignment ja
           WHERE ja.event_id = n.event_id AND ja.night_id = n.id AND ja.status = 'ACTIVE'
        )
      ORDER BY n.display_order, n.name`,
    [eventId],
  );
  return rows;
}

export async function getReadiness({ client = getPool(), eventId }) {
  const event = await client.query("SELECT 1 FROM carnival_event WHERE id=$1", [eventId]);
  if (!event.rows[0]) throw new Error("EVENT_NOT_FOUND");
  const missing = [];
  const incompleteTroupes = [];
  const incompleteRubrics = [];
  const incompleteSchedules = [];
  const incompleteNominations = [];
  const scalar = async (sql) => Number((await client.query(sql, [eventId])).rows[0].count);

  if (!await scalar("SELECT COUNT(*) FROM night WHERE event_id=$1 AND kind='COMPETITION'")) missing.push("COMPETITION_NIGHT");
  if (!await scalar("SELECT COUNT(*) FROM event_troupe WHERE event_id=$1 AND active")) missing.push("ACTIVE_TROUPE");
  if (!await scalar("SELECT COUNT(*) FROM event_specialty WHERE event_id=$1 AND active")) missing.push("ACTIVE_SPECIALTY");
  if (!await scalar("SELECT COUNT(*) FROM rubric WHERE event_id=$1 AND active")) missing.push("ACTIVE_RUBRIC");

  const { rows: troupeRows } = await client.query(
    `SELECT t.id, t.name FROM event_troupe t LEFT JOIN event_category c ON c.id = t.category_id
      WHERE t.event_id = $1 AND t.active AND (c.id IS NULL OR NOT c.active)`, [eventId]);
  for (const t of troupeRows) incompleteTroupes.push({ id: t.id, name: t.name });

  const { rows: rubricRows } = await client.query(
    `SELECT r.id, r.name, r.code FROM rubric r
      WHERE r.event_id = $1 AND r.active AND (
        NOT EXISTS (SELECT 1 FROM evaluation_item i WHERE i.rubric_id = r.id AND i.active)
        OR EXISTS (
          SELECT 1 FROM evaluation_item i JOIN event_specialty s ON s.id = i.specialty_id
          WHERE i.rubric_id = r.id AND i.active AND NOT s.active
        )
      )`, [eventId]);
  for (const r of rubricRows) incompleteRubrics.push({ id: r.id, name: r.name, code: r.code });

  const { rows: scheduleRows } = await client.query(
    `SELECT n.id AS "nightId", n.name AS "nightName"
       FROM night n
      WHERE n.event_id = $1 AND n.kind = 'COMPETITION'
        AND NOT EXISTS (
          SELECT 1 FROM night_troupe_schedule s
           WHERE s.night_id = n.id AND s.event_id = n.event_id AND s.status = 'SCHEDULED'
        )
      ORDER BY n.display_order`,
    [eventId],
  );
  for (const row of scheduleRows) incompleteSchedules.push({ nightId: row.nightId, nightName: row.nightName });
  if (incompleteSchedules.length) missing.push("INCOMPLETE_SCHEDULES");

  const { rows: nominationRows } = await client.query(
    `SELECT DISTINCT r.id AS "rubricId", r.name AS "rubricName",
            et.id AS "troupeId", et.name AS "troupeName"
       FROM rubric r
       JOIN evaluation_item ei ON ei.rubric_id = r.id AND ei.active
       JOIN night_troupe_schedule nts ON nts.event_id = r.event_id AND nts.status = 'SCHEDULED'
       JOIN event_troupe et ON et.id = nts.event_troupe_id AND et.active
      WHERE r.event_id = $1 AND r.active AND r.evaluation_target = 'NOMINATION'
        AND NOT EXISTS (
          SELECT 1 FROM troupe_nomination tn
           WHERE tn.event_id = r.event_id AND tn.event_troupe_id = et.id
             AND tn.rubric_id = r.id AND tn.active
        )
      ORDER BY r.name, et.name`,
    [eventId],
  );
  incompleteNominations.push(...nominationRows);
  if (incompleteNominations.length) missing.push("INCOMPLETE_NOMINATIONS");

  const nightsWithoutJury = await findNightsWithoutJury(client, eventId);
  if (nightsWithoutJury.length) missing.push("NIGHTS_WITHOUT_JURY");

  return {
    ready: missing.length === 0 && incompleteTroupes.length === 0 && incompleteRubrics.length === 0 && incompleteNominations.length === 0,
    missing,
    incompleteTroupes,
    incompleteRubrics,
    incompleteSchedules,
    incompleteNominations,
    nightsWithoutJury,
    humanMessages: missing.map((code) => humanLabel(code)),
  };
}

export async function openEvent({ client = null, eventId, actorUserId = null }) {
  const owned = !client;
  const db = client ?? await getPool().connect();
  try {
    if (owned) await db.query("BEGIN");
    let rows;
    await db.query("SAVEPOINT open_event_active_compat");
    try {
      ({ rows } = await db.query("SELECT id,status,active FROM carnival_event WHERE id=$1 FOR UPDATE", [eventId]));
      await db.query("RELEASE SAVEPOINT open_event_active_compat");
    } catch (error) {
      // Compatibilidad con esquemas historicos aislados (pre-075) sin columna active.
      if (error?.code !== "42703") throw error;
      await db.query("ROLLBACK TO SAVEPOINT open_event_active_compat");
      await db.query("RELEASE SAVEPOINT open_event_active_compat");
      ({ rows } = await db.query("SELECT id,status FROM carnival_event WHERE id=$1 FOR UPDATE", [eventId]));
      rows[0] = rows[0] ? { ...rows[0], active: true } : rows[0];
    }
    if (!rows[0]) throw new Error("EVENT_NOT_FOUND");
    if (rows[0].active === false || rows[0].status !== "CONFIGURING") throw new Error("EVENT_LOCKED");
    const readiness = await getReadiness({ client: db, eventId });
    if (!readiness.ready) {
      const error = new Error("EVENT_CONFIGURATION_INCOMPLETE");
      error.readiness = readiness;
      throw error;
    }
    await db.query("SELECT set_config('app.allow_event_open','true',true)");
    const { rows: updated } = await db.query(
      "UPDATE carnival_event SET status='OPEN',updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING id,name,status",
      [eventId]);
    await auditEvent(db, {
      actorUserId,
      action: "EVENT_OPENED",
      entityType: "carnival_event",
      entityId: eventId,
      after: { status: "OPEN" },
    });
    if (owned) await db.query("COMMIT");
    return updated[0];
  } catch (error) {
    if (owned) await db.query("ROLLBACK");
    throw error;
  } finally {
    if (owned) db.release();
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertOperationId(operationId) {
  if (typeof operationId !== "string" || !UUID_PATTERN.test(operationId)) {
    throw new Error("IDEMPOTENCY_KEY_REQUIRED");
  }
}

async function claimOpenOperation({ operationId, eventId, actorUserId }) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const { rows: inserted } = await client.query(
      `INSERT INTO event_open_operation_claim(operation_id,event_id,intent,actor_user_id)
       SELECT $1,$2,'OPEN_EVENT',$3
        WHERE EXISTS (SELECT 1 FROM carnival_event WHERE id=$2)
       ON CONFLICT (operation_id) DO NOTHING
       RETURNING operation_id`,
      [operationId, eventId, actorUserId],
    );
    const { rows } = await client.query(
      "SELECT event_id AS \"eventId\", intent FROM event_open_operation_claim WHERE operation_id=$1",
      [operationId],
    );
    if (!rows[0]) throw new Error("EVENT_NOT_FOUND");
    if (rows[0].eventId !== eventId || rows[0].intent !== "OPEN_EVENT") {
      throw new Error("IDEMPOTENCY_CONFLICT");
    }
    await client.query("COMMIT");
    return { created: inserted.length > 0 };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function mapReceipt(row, operationId, eventId, replayed = false) {
  if (!row) return null;
  if (row.status === "APPLIED") {
    return {
      httpStatus: 200,
      event: row.eventResult,
      operation: { operationId, eventId, intent: "OPEN_EVENT", status: "applied", replayed },
    };
  }
  return {
    httpStatus: 409,
    error: {
      code: row.code,
      ...(row.details ? { details: row.details } : {}),
      operation: { operationId, eventId, intent: "OPEN_EVENT", status: "rejected", replayed },
    },
  };
}

async function getReceipt(client, operationId) {
  const { rows } = await client.query(
    `SELECT status,code,details,event_result AS "eventResult"
       FROM event_open_operation_receipt WHERE operation_id=$1`,
    [operationId],
  );
  return rows[0] ?? null;
}

export async function openEventOperation({ eventId, operationId, actorUserId = null }) {
  assertOperationId(operationId);
  await claimOpenOperation({ operationId, eventId, actorUserId });
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const { rows: claims } = await client.query(
      `SELECT event_id AS "eventId",intent FROM event_open_operation_claim
        WHERE operation_id=$1 FOR UPDATE`,
      [operationId],
    );
    const claim = claims[0];
    if (!claim || claim.eventId !== eventId || claim.intent !== "OPEN_EVENT") {
      throw new Error("IDEMPOTENCY_CONFLICT");
    }
    const existing = mapReceipt(await getReceipt(client, operationId), operationId, eventId, true);
    if (existing) {
      await client.query("COMMIT");
      return existing;
    }

    let terminal;
    try {
      const event = await openEvent({ client, eventId, actorUserId });
      await auditEvent(client, {
        actorUserId,
        action: "EVENT_OPEN_OPERATION_APPLIED",
        entityType: "carnival_event_open_operation",
        entityId: operationId,
        after: { eventId, intent: "OPEN_EVENT", status: "APPLIED" },
      });
      terminal = { status: "APPLIED", eventResult: event };
    } catch (error) {
      if (!["EVENT_CONFIGURATION_INCOMPLETE", "EVENT_LOCKED"].includes(error.message)) throw error;
      terminal = {
        status: "REJECTED",
        code: error.message,
        details: error.readiness ?? null,
      };
      await auditEvent(client, {
        actorUserId,
        action: "EVENT_OPEN_OPERATION_REJECTED",
        entityType: "carnival_event_open_operation",
        entityId: operationId,
        after: { eventId, intent: "OPEN_EVENT", status: "REJECTED", code: error.message },
      });
    }

    await client.query(
      `INSERT INTO event_open_operation_receipt(operation_id,status,code,details,event_result)
       VALUES($1,$2,$3,$4::jsonb,$5::jsonb)`,
      [operationId, terminal.status, terminal.code ?? null,
        terminal.details ? JSON.stringify(terminal.details) : null,
        terminal.eventResult ? JSON.stringify(terminal.eventResult) : null],
    );
    await client.query("COMMIT");
    return mapReceipt(terminal, operationId, eventId, false);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function getOpenEventOperation({ eventId, operationId }) {
  assertOperationId(operationId);
  const client = await getPool().connect();
  try {
    const { rows: claims } = await client.query(
      `SELECT event_id AS "eventId",intent FROM event_open_operation_claim
        WHERE operation_id=$1`,
      [operationId],
    );
    if (!claims[0]) throw new Error("OPEN_OPERATION_NOT_FOUND");
    if (claims[0].eventId !== eventId || claims[0].intent !== "OPEN_EVENT") {
      throw new Error("IDEMPOTENCY_CONFLICT");
    }
    const receipt = await getReceipt(client, operationId);
    if (!receipt) return { operationId, eventId, intent: "OPEN_EVENT", status: "pending" };
    if (receipt.status === "APPLIED") {
      return { operationId, eventId, intent: "OPEN_EVENT", status: "applied", result: { event: receipt.eventResult } };
    }
    return {
      operationId, eventId, intent: "OPEN_EVENT", status: "rejected",
      code: receipt.code,
      ...(receipt.details ? { details: receipt.details } : {}),
    };
  } finally {
    client.release();
  }
}
