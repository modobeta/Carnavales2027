import { createHash } from "node:crypto";
import { auditEvent, canonicalizeJson } from "../../audit/audit-service.js";
import { getPool } from "../../db/pool.js";
import { emitMonitorEvent } from "../monitor/monitor-event-bus.js";

function requireText(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} debe ser texto no vacío.`);
  }
  return value.trim();
}

function requireUuid(value, name) {
  const text = requireText(value, name);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw new TypeError(`${name} debe ser un UUID válido.`);
  }
  return text;
}

export function computeBallotCanonicalHash({
  ballotId,
  eventId,
  nightId,
  judgeProfileId,
  specialtyId,
  submittedAt,
  scores,
}) {
  const payload = {
    ballotId,
    eventId,
    nightId,
    judgeProfileId,
    specialtyId,
    submittedAt: submittedAt instanceof Date ? submittedAt.toISOString() : String(submittedAt),
    scores: scores.map((s) => ({
      evaluationItemId: s.evaluationItemId,
      evaluationState: s.evaluationState,
      nightScheduleId: s.nightScheduleId,
      rubricId: s.rubricId,
      score: s.score,
    })),
  };

  const canonical = canonicalizeJson(payload);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export async function receiveBallotCustody({
  ballotId,
  eventId,
  nightId,
  notes = null,
  actorUserId,
}) {
  const bId = requireUuid(ballotId, "ballotId");
  const eid = requireUuid(eventId, "eventId");
  const nid = requireUuid(nightId, "nightId");
  const uid = requireText(actorUserId, "actorUserId");

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows: ballotRows } = await client.query(
      `SELECT id, event_id, night_id, judge_profile_id, specialty_id, status, submitted_at
         FROM ballot
        WHERE id = $1 AND event_id = $2
        FOR UPDATE`,
      [bId, eid],
    );

    if (ballotRows.length === 0) {
      throw new Error("BALLOT_NOT_FOUND");
    }

    const ballot = ballotRows[0];

    if (ballot.status !== "SUBMITTED") {
      throw new Error("BALLOT_NOT_SUBMITTED");
    }

    const { rows: existingCustody } = await client.query(
      `SELECT id FROM ballot_custody_log WHERE ballot_id = $1 AND custody_status = 'RECEIVED'`,
      [bId],
    );

    if (existingCustody.length > 0) {
      throw new Error("BALLOT_ALREADY_IN_CUSTODY");
    }

    const { rows: scoreRows } = await client.query(
      `SELECT evaluation_item_id AS "evaluationItemId",
              evaluation_state AS "evaluationState",
              night_schedule_id AS "nightScheduleId",
              rubric_id AS "rubricId",
              score
         FROM ballot_score
        WHERE ballot_id = $1
        ORDER BY evaluation_item_id`,
      [bId],
    );

    const canonicalHash = computeBallotCanonicalHash({
      ballotId: ballot.id,
      eventId: ballot.event_id,
      nightId: ballot.night_id,
      judgeProfileId: ballot.judge_profile_id,
      specialtyId: ballot.specialty_id,
      submittedAt: ballot.submitted_at,
      scores: scoreRows,
    });

    const { rows: custodyRows } = await client.query(
      `INSERT INTO ballot_custody_log (
        ballot_id,
        event_id,
        night_id,
        custody_status,
        canonical_hash,
        received_by_user_id,
        notes
      ) VALUES ($1, $2, $3, 'RECEIVED', $4, $5, $6)
      RETURNING
        id,
        ballot_id AS "ballotId",
        event_id AS "eventId",
        night_id AS "nightId",
        custody_status AS "custodyStatus",
        canonical_hash AS "canonicalHash",
        received_by_user_id AS "receivedByUserId",
        notes,
        received_at AS "receivedAt",
        created_at AS "createdAt"`,
      [bId, eid, nid, canonicalHash, uid, notes ? notes.trim() : null],
    );

    const custodyRecord = custodyRows[0];

    await auditEvent(client, {
      actorUserId: uid,
      action: "BALLOT_CUSTODY_RECEIVED",
      entityType: "ballot_custody_log",
      entityId: custodyRecord.id,
      after: {
        ballotId: bId,
        custodyStatus: "RECEIVED",
        canonicalHash,
      },
    });

    await client.query("COMMIT");

    emitMonitorEvent("BALLOT_CUSTODY_RECEIVED", {
      ballotId: bId,
      eventId: eid,
      nightId: nid,
      custodyStatus: "RECEIVED",
      canonicalHash,
      receivedAt: custodyRecord.receivedAt,
    });

    return custodyRecord;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function listNightCustody({ eventId, nightId }) {
  const eid = requireUuid(eventId, "eventId");
  const nid = requireUuid(nightId, "nightId");

  const { rows } = await getPool().query(
    `SELECT b.id AS "ballotId",
            b.status AS "ballotStatus",
            b.submitted_at AS "submittedAt",
            jp.id AS "judgeProfileId",
            jp.name AS "judgeName",
            s.id AS "specialtyId",
            s.name AS "specialtyName",
            bcl.id AS "custodyId",
            bcl.custody_status AS "custodyStatus",
            bcl.canonical_hash AS "canonicalHash",
            bcl.received_at AS "receivedAt",
            bcl.notes AS "custodyNotes",
            u.id AS "receivedByUserId",
            u.name AS "receivedByName"
       FROM ballot b
       JOIN judge_profile jp ON jp.id = b.judge_profile_id
       JOIN event_specialty s ON s.id = b.specialty_id
       LEFT JOIN ballot_custody_log bcl ON bcl.ballot_id = b.id AND bcl.custody_status = 'RECEIVED'
       LEFT JOIN "user" u ON u.id = bcl.received_by_user_id
      WHERE b.event_id = $1 AND b.night_id = $2
      ORDER BY s.name, jp.name`,
    [eid, nid],
  );

  const results = [];
  for (const row of rows) {
    let integrityStatus = "PENDING_SUBMISSION";

    if (row.ballotStatus === "SUBMITTED") {
      if (!row.custodyStatus) {
        integrityStatus = "PENDING_CUSTODY";
      } else {
        // Re-calculate live hash to verify immutability
        const { rows: scoreRows } = await getPool().query(
          `SELECT evaluation_item_id AS "evaluationItemId",
                  evaluation_state AS "evaluationState",
                  night_schedule_id AS "nightScheduleId",
                  rubric_id AS "rubricId",
                  score
             FROM ballot_score
            WHERE ballot_id = $1
            ORDER BY evaluation_item_id`,
          [row.ballotId],
        );

        const liveHash = computeBallotCanonicalHash({
          ballotId: row.ballotId,
          eventId: eid,
          nightId: nid,
          judgeProfileId: row.judgeProfileId,
          specialtyId: row.specialtyId,
          submittedAt: row.submittedAt,
          scores: scoreRows,
        });

        integrityStatus = liveHash === row.canonicalHash ? "VERIFIED" : "TAMPERED";
      }
    }

    results.push({
      ...row,
      integrityStatus,
    });
  }

  return results;
}
