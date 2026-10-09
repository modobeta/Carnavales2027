import { getPool } from "../db/pool.js";
import { withTransaction } from "../db/transaction.js";
import { auditEvent } from "../audit/audit-service.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listActiveAdminEventAssignments({ eventId }) {
  if (typeof eventId !== "string" || !UUID_PATTERN.test(eventId)) {
    throw new Error("INVALID_EVENT_ID");
  }

  const pool = getPool();
  const event = await pool.query("SELECT 1 FROM carnival_event WHERE id = $1", [eventId]);
  if (event.rowCount === 0) throw new Error("EVENT_NOT_FOUND");

  const { rows } = await pool.query(
    `SELECT user_id AS "userId"
       FROM admin_event_assignment
      WHERE event_id = $1 AND is_active = TRUE
      ORDER BY user_id`,
    [eventId],
  );
  return rows;
}

export async function lockAdminEventAssignmentPair(client, { userId, eventId }) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [userId, eventId]);
}

export async function grantAdminEventAssignment({ actorUserId, eventId, userId }) {
  return withTransaction(async (client) => {
    await lockAdminEventAssignmentPair(client, { userId, eventId });

    let rejection = null;
    if (typeof eventId !== "string" || !UUID_PATTERN.test(eventId)) rejection = "VALIDATION_ERROR";
    else if (typeof userId !== "string" || !UUID_PATTERN.test(userId)) rejection = "VALIDATION_ERROR";

    let previousActive = null;
    if (!rejection) {
      const event = await client.query("SELECT 1 FROM carnival_event WHERE id = $1", [eventId]);
      if (event.rowCount === 0) rejection = "EVENT_NOT_FOUND";
    }
    if (!rejection) {
      const user = await client.query('SELECT 1 FROM "user" WHERE id = $1', [userId]);
      if (user.rowCount === 0) rejection = "USER_NOT_FOUND";
    }
    if (!rejection) {
      const current = await client.query(
        "SELECT is_active FROM admin_event_assignment WHERE event_id = $1 AND user_id = $2",
        [eventId, userId],
      );
      previousActive = current.rows[0]?.is_active ?? null;
      await client.query(
        `INSERT INTO admin_event_assignment (user_id, event_id, is_active)
         VALUES ($1, $2, TRUE)
         ON CONFLICT (user_id, event_id) DO UPDATE SET is_active = TRUE
         WHERE admin_event_assignment.is_active = FALSE`,
        [userId, eventId],
      );
    }

    await auditEvent(client, {
      actorUserId,
      action: "ADMIN_EVENT_ASSIGNMENT_GRANTED",
      entityType: "admin_event_assignment",
      entityId: `${eventId}:${userId}`,
      before: { active: previousActive },
      after: rejection ? { active: false, outcome: "rejected", reason: rejection } : { active: true },
    });

    return rejection ? { error: rejection } : { active: true };
  });
}

export async function revokeAdminEventAssignment({ actorUserId, eventId, userId }) {
  return withTransaction(async (client) => {
    await lockAdminEventAssignmentPair(client, { userId, eventId });

    let rejection = null;
    if (typeof eventId !== "string" || !UUID_PATTERN.test(eventId)) rejection = "VALIDATION_ERROR";
    else if (typeof userId !== "string" || !UUID_PATTERN.test(userId)) rejection = "VALIDATION_ERROR";

    let previousActive = null;
    if (!rejection) {
      const event = await client.query("SELECT 1 FROM carnival_event WHERE id = $1", [eventId]);
      if (event.rowCount === 0) rejection = "EVENT_NOT_FOUND";
    }
    if (!rejection) {
      const user = await client.query('SELECT 1 FROM "user" WHERE id = $1', [userId]);
      if (user.rowCount === 0) rejection = "USER_NOT_FOUND";
    }
    if (!rejection) {
      const current = await client.query(
        "SELECT is_active FROM admin_event_assignment WHERE event_id = $1 AND user_id = $2",
        [eventId, userId],
      );
      previousActive = current.rows[0]?.is_active ?? null;
      if (previousActive === true) {
        await client.query(
          `UPDATE admin_event_assignment
              SET is_active = FALSE
            WHERE event_id = $1 AND user_id = $2 AND is_active = TRUE`,
          [eventId, userId],
        );
      }
    }

    await auditEvent(client, {
      actorUserId,
      action: "ADMIN_EVENT_ASSIGNMENT_REVOKED",
      entityType: "admin_event_assignment",
      entityId: `${eventId}:${userId}`,
      before: { active: previousActive },
      after: rejection ? { active: false, outcome: "rejected", reason: rejection } : { active: false },
    });

    return rejection ? { error: rejection } : { active: false };
  });
}
