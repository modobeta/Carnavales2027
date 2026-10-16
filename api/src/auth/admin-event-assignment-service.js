import { getPool } from "../db/pool.js";

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
