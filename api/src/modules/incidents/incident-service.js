import { auditEvent } from "../../audit/audit-service.js";
import { getPool } from "../../db/pool.js";
import { emitMonitorEvent } from "../monitor/monitor-event-bus.js";

const VALID_INCIDENT_TYPES = new Set([
  "INCOMPLETE_BALLOT",
  "UNSCORED_ITEM",
  "ERROR_OMISSION",
  "ABSENT_PARTICIPANT_SCORED",
  "SYNC_FAILURE",
  "PROCEDURE_BREACH",
  "OBSERVATION",
  "OTHER",
]);

const VALID_INCIDENT_STATUSES = new Set([
  "OPEN",
  "NOTIFIED",
  "IN_SUBSANATION",
  "RESOLVED",
  "ESCALATED",
]);

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

function optionalUuid(value, name) {
  if (value === null || value === undefined || value === "") return null;
  return requireUuid(value, name);
}

export async function createIncident({
  eventId,
  nightId,
  eventTroupeId = null,
  judgeProfileId = null,
  ballotId = null,
  incidentType,
  description,
  actorUserId,
}) {
  const eid = requireUuid(eventId, "eventId");
  const nid = requireUuid(nightId, "nightId");
  const uid = requireText(actorUserId, "actorUserId");
  const desc = requireText(description, "description");
  const type = requireText(incidentType, "incidentType").toUpperCase();

  if (!VALID_INCIDENT_TYPES.has(type)) {
    throw new Error("INVALID_INCIDENT_TYPE");
  }

  const troupeId = optionalUuid(eventTroupeId, "eventTroupeId");
  const judgeId = optionalUuid(judgeProfileId, "judgeProfileId");
  const bId = optionalUuid(ballotId, "ballotId");

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `INSERT INTO voting_incident (
        event_id,
        night_id,
        event_troupe_id,
        judge_profile_id,
        ballot_id,
        incident_type,
        description,
        status,
        reported_by_user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'OPEN', $8)
      RETURNING
        id,
        event_id AS "eventId",
        night_id AS "nightId",
        event_troupe_id AS "eventTroupeId",
        judge_profile_id AS "judgeProfileId",
        ballot_id AS "ballotId",
        incident_type AS "incidentType",
        description,
        status,
        reported_by_user_id AS "reportedByUserId",
        created_at AS "createdAt",
        updated_at AS "updatedAt"`,
      [eid, nid, troupeId, judgeId, bId, type, desc, uid],
    );

    const created = rows[0];

    await auditEvent(client, {
      actorUserId: uid,
      action: "VOTING_INCIDENT_REPORTED",
      entityType: "voting_incident",
      entityId: created.id,
      after: {
        eventId: eid,
        nightId: nid,
        incidentType: type,
        description: desc,
        eventTroupeId: troupeId,
        judgeProfileId: judgeId,
        ballotId: bId,
        status: "OPEN",
      },
    });

    await client.query("COMMIT");

    emitMonitorEvent("INCIDENT_REPORTED", {
      incidentId: created.id,
      eventId: eid,
      nightId: nid,
      incidentType: type,
      status: "OPEN",
    });

    return created;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function listIncidents({ eventId, nightId = null, status = null }) {
  const eid = requireUuid(eventId, "eventId");
  const nid = optionalUuid(nightId, "nightId");
  const stat = status ? requireText(status, "status").toUpperCase() : null;

  if (stat && !VALID_INCIDENT_STATUSES.has(stat)) {
    throw new Error("INVALID_INCIDENT_STATUS");
  }

  const { rows } = await getPool().query(
    `SELECT vi.id,
            vi.event_id AS "eventId",
            vi.night_id AS "nightId",
            vi.event_troupe_id AS "eventTroupeId",
            et.name AS "troupeName",
            vi.judge_profile_id AS "judgeProfileId",
            jp.name AS "judgeName",
            s.name AS "specialtyName",
            vi.ballot_id AS "ballotId",
            vi.incident_type AS "incidentType",
            vi.description,
            vi.status,
            vi.reported_by_user_id AS "reportedByUserId",
            u1.name AS "reportedByName",
            vi.resolution_notes AS "resolutionNotes",
            vi.resolved_by_user_id AS "resolvedByUserId",
            u2.name AS "resolvedByName",
            vi.resolved_at AS "resolvedAt",
            vi.created_at AS "createdAt",
            vi.updated_at AS "updatedAt"
       FROM voting_incident vi
       LEFT JOIN event_troupe et ON et.id = vi.event_troupe_id
       LEFT JOIN judge_profile jp ON jp.id = vi.judge_profile_id
       LEFT JOIN ballot b ON b.id = vi.ballot_id
       LEFT JOIN event_specialty s ON s.id = b.specialty_id
       JOIN "user" u1 ON u1.id = vi.reported_by_user_id
       LEFT JOIN "user" u2 ON u2.id = vi.resolved_by_user_id
      WHERE vi.event_id = $1
        AND ($2::UUID IS NULL OR vi.night_id = $2)
        AND ($3::TEXT IS NULL OR vi.status = $3)
      ORDER BY vi.created_at DESC`,
    [eid, nid, stat],
  );

  return rows;
}

export async function updateIncidentStatus({
  incidentId,
  eventId,
  status,
  resolutionNotes = null,
  actorUserId,
}) {
  const incId = requireUuid(incidentId, "incidentId");
  const eid = requireUuid(eventId, "eventId");
  const uid = requireText(actorUserId, "actorUserId");
  const nextStatus = requireText(status, "status").toUpperCase();

  if (!VALID_INCIDENT_STATUSES.has(nextStatus)) {
    throw new Error("INVALID_INCIDENT_STATUS");
  }

  if (nextStatus === "RESOLVED") {
    if (!resolutionNotes || typeof resolutionNotes !== "string" || resolutionNotes.trim().length === 0) {
      throw new Error("RESOLUTION_NOTES_REQUIRED");
    }
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows: currentRows } = await client.query(
      `SELECT * FROM voting_incident WHERE id = $1 AND event_id = $2 FOR UPDATE`,
      [incId, eid],
    );

    if (currentRows.length === 0) {
      throw new Error("INCIDENT_NOT_FOUND");
    }

    const current = currentRows[0];
    const isResolved = nextStatus === "RESOLVED";
    const cleanNotes = resolutionNotes ? resolutionNotes.trim() : (isResolved ? "" : current.resolution_notes);

    const { rows: updatedRows } = await client.query(
      `UPDATE voting_incident
          SET status = $1,
              resolution_notes = $2,
              resolved_by_user_id = $3,
              resolved_at = $4,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $5 AND event_id = $6
        RETURNING
          id,
          event_id AS "eventId",
          night_id AS "nightId",
          event_troupe_id AS "eventTroupeId",
          judge_profile_id AS "judgeProfileId",
          ballot_id AS "ballotId",
          incident_type AS "incidentType",
          description,
          status,
          reported_by_user_id AS "reportedByUserId",
          resolution_notes AS "resolutionNotes",
          resolved_by_user_id AS "resolvedByUserId",
          resolved_at AS "resolvedAt",
          created_at AS "createdAt",
          updated_at AS "updatedAt"`,
      [
        nextStatus,
        cleanNotes,
        isResolved ? uid : null,
        isResolved ? new Date().toISOString() : null,
        incId,
        eid,
      ],
    );

    const updated = updatedRows[0];

    await auditEvent(client, {
      actorUserId: uid,
      action: "VOTING_INCIDENT_STATUS_UPDATED",
      entityType: "voting_incident",
      entityId: incId,
      before: {
        status: current.status,
        resolutionNotes: current.resolution_notes,
        resolvedByUserId: current.resolved_by_user_id,
      },
      after: {
        status: nextStatus,
        resolutionNotes: cleanNotes,
        resolvedByUserId: isResolved ? uid : null,
      },
    });

    await client.query("COMMIT");

    emitMonitorEvent("INCIDENT_UPDATED", {
      incidentId: incId,
      eventId: eid,
      nightId: updated.nightId,
      status: nextStatus,
    });

    return updated;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
