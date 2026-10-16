export async function hasAdminRole({ userId, db } = {}) {
  if (typeof userId !== "string" || userId.trim() === "") return false;
  if (!db || typeof db.query !== "function") {
    throw new TypeError("db debe proporcionar query().");
  }

  const { rows } = await db.query(
    `SELECT EXISTS (
       SELECT 1 FROM user_role
        WHERE user_id = $1 AND role_code = 'ADMIN'
     ) AS allowed`,
    [userId],
  );

  return rows[0]?.allowed === true;
}
