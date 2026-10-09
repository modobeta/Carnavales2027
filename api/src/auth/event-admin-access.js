const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function hasEventAdminAccess({ userId, eventId, db } = {}) {
  if (typeof userId !== "string" || userId.trim() === "" || typeof eventId !== "string" || !uuidPattern.test(eventId)) {
    return false;
  }
  if (!db || typeof db.query !== "function") {
    throw new TypeError("db debe proporcionar query().");
  }

  const { rows } = await db.query(
    `SELECT (
       EXISTS (SELECT 1 FROM "user" WHERE id = $1)
       AND EXISTS (SELECT 1 FROM carnival_event WHERE id = $2)
       AND (
         EXISTS (
           SELECT 1 FROM user_role
            WHERE user_id = $1 AND role_code = 'ADMIN'
         )
         OR EXISTS (
           SELECT 1 FROM admin_event_assignment
            WHERE user_id = $1 AND event_id = $2 AND is_active = TRUE
         )
       )
     ) AS allowed`,
    [userId, eventId],
  );

  return rows[0]?.allowed === true;
}
