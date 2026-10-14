import { getPool } from "../../db/pool.js";

function requireText(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) throw new TypeError(`${name} debe ser texto no vacío.`);
  return value.trim();
}

/**
 * Spec 016 — Supervisión de votación por VEEDOR.
 * Devuelve eventos con sus noches competitivas que tienen actividad de votación
 * (planillas o ventana registrada), con conteos agregados por estado de planilla.
 * Nunca expone puntajes, jurados ni comparsas (mínimo privilegio, SVC2-41).
 */
export async function listMonitorEvents() {
  const { rows: events } = await getPool().query(
    "SELECT id, name, status FROM carnival_event ORDER BY created_at",
  );

  const { rows: nights } = await getPool().query(
    `SELECT n.event_id AS "eventId",
            n.id, n.name, n.status,
            n.display_order AS "displayOrder",
            vw.status AS "votingStatus",
            COUNT(b.id) FILTER (WHERE b.status = 'OPEN')::INTEGER AS "open",
            COUNT(b.id) FILTER (WHERE b.status = 'SUBMITTED')::INTEGER AS "submitted",
            COUNT(b.id) FILTER (WHERE b.status = 'REOPENED')::INTEGER AS "reopened",
            COUNT(b.id) FILTER (WHERE b.status = 'REPLACED')::INTEGER AS "replaced"
       FROM night n
       LEFT JOIN voting_window vw ON vw.night_id = n.id
       LEFT JOIN ballot b ON b.night_id = n.id AND b.event_id = n.event_id
      WHERE n.kind = 'COMPETITION'
      GROUP BY n.event_id, n.id, n.name, n.status, n.display_order, vw.status
     HAVING COUNT(b.id) > 0 OR vw.status IS NOT NULL
      ORDER BY n.display_order`,
  );

  const nightsByEvent = new Map();
  for (const night of nights) {
    const open = night.open ?? 0;
    const submitted = night.submitted ?? 0;
    const reopened = night.reopened ?? 0;
    const replaced = night.replaced ?? 0;
    const entry = {
      id: night.id,
      name: night.name,
      status: night.status,
      votingStatus: night.votingStatus ?? "NOT_OPEN",
      counts: { OPEN: open, SUBMITTED: submitted, REOPENED: reopened, REPLACED: replaced },
      total: open + submitted + reopened,
    };
    if (!nightsByEvent.has(night.eventId)) nightsByEvent.set(night.eventId, []);
    nightsByEvent.get(night.eventId).push(entry);
  }

  return events
    .map((event) => ({
      id: event.id,
      name: event.name,
      status: event.status,
      nights: nightsByEvent.get(event.id) ?? [],
    }))
    .filter((event) => event.nights.length > 0);
}

export async function getMonitorNight({ eventId, nightId }) {
  const id = requireText(eventId, "eventId");
  const nid = requireText(nightId, "nightId");
  const { rows: events } = await getPool().query("SELECT id FROM carnival_event WHERE id = $1", [id]);
  if (!events[0]) throw new Error("EVENT_NOT_FOUND");
  const { rows } = await getPool().query(
    `SELECT n.id, n.name, n.status,
            vw.status AS "votingStatus",
            COUNT(b.id) FILTER (WHERE b.status = 'OPEN')::INTEGER AS "open",
            COUNT(b.id) FILTER (WHERE b.status = 'SUBMITTED')::INTEGER AS "submitted",
            COUNT(b.id) FILTER (WHERE b.status = 'REOPENED')::INTEGER AS "reopened",
            COUNT(b.id) FILTER (WHERE b.status = 'REPLACED')::INTEGER AS "replaced"
       FROM night n
       LEFT JOIN voting_window vw ON vw.night_id = n.id
       LEFT JOIN ballot b ON b.night_id = n.id AND b.event_id = n.event_id
      WHERE n.id = $1 AND n.event_id = $2 AND n.kind = 'COMPETITION'
      GROUP BY n.id, n.name, n.status, vw.status`,
    [nid, id],
  );
  if (!rows[0]) throw new Error("NIGHT_NOT_FOUND");
  const night = rows[0];
  const open = night.open ?? 0;
  const submitted = night.submitted ?? 0;
  const reopened = night.reopened ?? 0;
  const replaced = night.replaced ?? 0;
  return {
    id: night.id,
    name: night.name,
    status: night.status,
    votingStatus: night.votingStatus ?? "NOT_OPEN",
    counts: { OPEN: open, SUBMITTED: submitted, REOPENED: reopened, REPLACED: replaced },
    total: open + submitted + reopened,
  };
}

export async function listMonitorJudges({ eventId, nightId }) {
  const id = requireText(eventId, "eventId");
  const nid = requireText(nightId, "nightId");

  const { rows } = await getPool().query(
    `SELECT jp.id AS "judgeProfileId",
            jp.name AS "judgeName",
            jp.email AS "judgeEmail",
            s.id AS "specialtyId",
            s.name AS "specialtyName",
            ja.assignment_type AS "assignmentType",
            ja.status AS "assignmentStatus",
            b.id AS "ballotId",
            b.status AS "ballotStatus",
            b.submitted_at AS "submittedAt",
            COUNT(bs.id)::INTEGER AS "totalScores",
            COUNT(bs.id) FILTER (WHERE bs.evaluation_state <> 'PENDING')::INTEGER AS "resolvedScores",
            COUNT(bs.id) FILTER (WHERE bs.evaluation_state = 'PENDING')::INTEGER AS "pendingScores"
       FROM judge_assignment ja
       JOIN judge_profile jp ON jp.id = ja.judge_profile_id
       JOIN event_specialty s ON s.id = ja.specialty_id
       LEFT JOIN ballot b ON b.judge_profile_id = jp.id AND b.night_id = ja.night_id AND b.status <> 'REPLACED'
       LEFT JOIN ballot_score bs ON bs.ballot_id = b.id
      WHERE ja.event_id = $1 AND ja.night_id = $2
        AND ja.status = 'ACTIVE' AND ja.assignment_type = 'PRIMARY'
      GROUP BY jp.id, jp.name, jp.email, s.id, s.name, ja.assignment_type, ja.status, b.id, b.status, b.submitted_at
      ORDER BY s.name, jp.name`,
    [id, nid],
  );

  return rows.map((row) => {
    const total = row.totalScores ?? 0;
    const resolved = row.resolvedScores ?? 0;
    const progress = total > 0 ? Math.round((resolved / total) * 100) : 0;
    return {
      judgeProfileId: row.judgeProfileId,
      judgeName: row.judgeName,
      judgeEmail: row.judgeEmail,
      specialtyId: row.specialtyId,
      specialtyName: row.specialtyName,
      assignmentType: row.assignmentType,
      assignmentStatus: row.assignmentStatus,
      ballotId: row.ballotId,
      ballotStatus: row.ballotStatus ?? "NOT_STARTED",
      submittedAt: row.submittedAt,
      totalScores: total,
      resolvedScores: resolved,
      pendingScores: row.pendingScores ?? 0,
      progress,
    };
  });
}

export async function listMonitorBallots({ eventId, nightId }) {
  const id = requireText(eventId, "eventId");
  const nid = requireText(nightId, "nightId");

  const { rows: ballotRows } = await getPool().query(
    `SELECT b.id AS "ballotId",
            b.status AS "ballotStatus",
            b.submitted_at AS "submittedAt",
            jp.id AS "judgeProfileId",
            jp.name AS "judgeName",
            s.id AS "specialtyId",
            s.name AS "specialtyName",
            COUNT(bs.id)::INTEGER AS "totalItems",
            COUNT(bs.id) FILTER (WHERE bs.evaluation_state = 'SCORED')::INTEGER AS "scoredItems",
            COUNT(bs.id) FILTER (WHERE bs.evaluation_state = 'NOT_PRESENTED')::INTEGER AS "absentItems",
            COUNT(bs.id) FILTER (WHERE bs.evaluation_state = 'PENDING')::INTEGER AS "pendingItems",
            bcl.custody_status AS "custodyStatus",
            bcl.received_at AS "custodyReceivedAt",
            bcl.canonical_hash AS "custodyHash"
       FROM ballot b
       JOIN judge_profile jp ON jp.id = b.judge_profile_id
       JOIN event_specialty s ON s.id = b.specialty_id
       LEFT JOIN ballot_score bs ON bs.ballot_id = b.id
       LEFT JOIN ballot_custody_log bcl ON bcl.ballot_id = b.id AND bcl.custody_status = 'RECEIVED'
      WHERE b.event_id = $1 AND b.night_id = $2
      GROUP BY b.id, b.status, b.submitted_at, jp.id, jp.name, s.id, s.name,
               bcl.custody_status, bcl.received_at, bcl.canonical_hash
      ORDER BY s.name, jp.name`,
    [id, nid],
  );

  const { rows: troupeScores } = await getPool().query(
    `SELECT bs.ballot_id AS "ballotId",
            et.id AS "troupeId",
            et.name AS "troupeName",
            nts.presentation_order AS "presentationOrder",
            COUNT(bs.id)::INTEGER AS "totalItems",
            COUNT(bs.id) FILTER (WHERE bs.evaluation_state = 'SCORED')::INTEGER AS "scoredItems",
            COUNT(bs.id) FILTER (WHERE bs.evaluation_state = 'NOT_PRESENTED')::INTEGER AS "absentItems",
            COUNT(bs.id) FILTER (WHERE bs.evaluation_state = 'PENDING')::INTEGER AS "pendingItems"
       FROM ballot_score bs
       JOIN ballot b ON b.id = bs.ballot_id
       JOIN night_troupe_schedule nts ON nts.id = bs.night_schedule_id
       JOIN event_troupe et ON et.id = nts.event_troupe_id
      WHERE b.event_id = $1 AND b.night_id = $2
      GROUP BY bs.ballot_id, et.id, et.name, nts.presentation_order
      ORDER BY nts.presentation_order, et.name`,
    [id, nid],
  );

  const troupesByBallot = new Map();
  for (const item of troupeScores) {
    if (!troupesByBallot.has(item.ballotId)) troupesByBallot.set(item.ballotId, []);
    troupesByBallot.get(item.ballotId).push({
      troupeId: item.troupeId,
      troupeName: item.troupeName,
      presentationOrder: item.presentationOrder,
      totalItems: item.totalItems,
      scoredItems: item.scoredItems,
      absentItems: item.absentItems,
      pendingItems: item.pendingItems,
      completed: item.pendingItems === 0,
    });
  }

  return ballotRows.map((ballot) => ({
    ...ballot,
    troupes: troupesByBallot.get(ballot.ballotId) ?? [],
  }));
}
