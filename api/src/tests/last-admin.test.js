import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { deleteUser, grantRole, revokeRole } from "../auth/role-service.js";
import { closePool, getPool } from "../db/pool.js";
import { migrate } from "../db/migrate.js";
import { listUsers } from "../modules/users/user-service.js";

const originalDatabaseUrl = process.env.DATABASE_URL;

function restoreDatabaseUrl() {
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
    return;
  }

  process.env.DATABASE_URL = originalDatabaseUrl;
}

test("el último ADMIN no puede perder su rol ni eliminarse, pero sí puede hacerlo si existe otro", {
  skip: !process.env.TEST_DATABASE_URL,
}, async (context) => {
  context.after(async () => {
    await closePool();
    restoreDatabaseUrl();
  });

  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await migrate();

  const client = await getPool().connect();
  const firstAdminId = randomUUID();
  const secondAdminId = randomUUID();
  const thirdAdminId = randomUUID();

  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role = 'replica'");
    await client.query("DELETE FROM user_role WHERE role_code = 'ADMIN'");
    await client.query("DELETE FROM bootstrap_state");
    await client.query("SET LOCAL session_replication_role = 'origin'");
    await client.query(
      `INSERT INTO "user" (id, name, email, "emailVerified")
       VALUES ($1, $2, $3, $4), ($5, $6, $7, $8), ($9, $10, $11, $12)`,
      [
        firstAdminId,
        "First admin",
        `${firstAdminId}@example.test`,
        true,
        secondAdminId,
        "Second admin",
        `${secondAdminId}@example.test`,
        true,
        thirdAdminId,
        "Third admin",
        `${thirdAdminId}@example.test`,
        true,
      ],
    );
    await client.query(
      `INSERT INTO bootstrap_state(singleton, initial_admin_user_id) VALUES (true, $1)`,
      [firstAdminId],
    );
    await grantRole({ client, userId: firstAdminId, roleCode: "ADMIN" });

    await client.query("SAVEPOINT direct_role_removal");
    await assert.rejects(
      () => client.query(
        "DELETE FROM user_role WHERE user_id = $1 AND role_code = 'ADMIN'",
        [firstAdminId],
      ),
        /PRIMARY_ADMIN_PROTECTED/,
    );
    await client.query("ROLLBACK TO SAVEPOINT direct_role_removal");

    await client.query(
      "INSERT INTO app_role (code, description) VALUES ('OPERATOR', 'Test-only role')",
    );
    await client.query("SAVEPOINT direct_role_update");
    await assert.rejects(
      () => client.query(
        "UPDATE user_role SET role_code = 'OPERATOR' WHERE user_id = $1 AND role_code = 'ADMIN'",
        [firstAdminId],
      ),
        /PRIMARY_ADMIN_PROTECTED/,
    );
    await client.query("ROLLBACK TO SAVEPOINT direct_role_update");

    await client.query("SAVEPOINT direct_user_deletion");
    await assert.rejects(
      () => client.query('DELETE FROM "user" WHERE id = $1', [firstAdminId]),
      /PRIMARY_ADMIN_PROTECTED/,
    );
    await client.query("ROLLBACK TO SAVEPOINT direct_user_deletion");

    await assert.rejects(
      () => revokeRole({ client, userId: firstAdminId, roleCode: "ADMIN" }),
      /PRIMARY_ADMIN_PROTECTED/,
    );
    const { rows: rejectedAuditRows } = await client.query(
      `SELECT action, after_data
       FROM audit_event
       WHERE entity_type = 'user_role'
         AND entity_id = $1
         AND action = 'USER_ROLE_REVOKE_REJECTED'
       LIMIT 1`,
      [firstAdminId],
    );
    assert.deepEqual(rejectedAuditRows, [{
      action: "USER_ROLE_REVOKE_REJECTED",
      after_data: { roleCode: "ADMIN", reason: "PRIMARY_ADMIN_PROTECTED" },
    }]);

    const listedUsers = await listUsers({ client });
    assert.equal(listedUsers.find((user) => user.id === firstAdminId).isPrimaryAdmin, true);
    assert.equal(listedUsers.find((user) => user.id === secondAdminId).isPrimaryAdmin, false);

    await assert.rejects(
      () => deleteUser({ client, userId: firstAdminId }),
      /PRIMARY_ADMIN_PROTECTED/,
    );
    const { rows: rejectedUserDeletionAudits } = await client.query(
      `SELECT action, after_data
       FROM audit_event
       WHERE entity_type = 'user'
         AND entity_id = $1
         AND action = 'USER_DELETE_REJECTED'
       LIMIT 1`,
      [firstAdminId],
    );
    assert.deepEqual(rejectedUserDeletionAudits, [{
      action: "USER_DELETE_REJECTED",
      after_data: { reason: "PRIMARY_ADMIN_PROTECTED" },
    }]);

    await grantRole({ client, userId: secondAdminId, roleCode: "ADMIN" });
    await grantRole({ client, userId: thirdAdminId, roleCode: "ADMIN" });
    const revocation = await revokeRole({ client, userId: secondAdminId, roleCode: "ADMIN" });
    assert.deepEqual(revocation, { removed: true });
    assert.deepEqual(await deleteUser({ client, userId: secondAdminId }), { deleted: true });
    assert.deepEqual(await deleteUser({ client, userId: thirdAdminId }), { deleted: true });

    const { rows: remainingRoles } = await client.query(
      `SELECT user_id
       FROM user_role
       WHERE role_code = 'ADMIN'
         AND user_id = ANY($1::text[])
       ORDER BY user_id`,
      [[firstAdminId, secondAdminId, thirdAdminId]],
    );
    assert.deepEqual(remainingRoles, [{ user_id: firstAdminId }]);

    await client.query("SAVEPOINT without_bootstrap");
    await client.query("SET LOCAL session_replication_role = 'replica'");
    await client.query("DELETE FROM bootstrap_state");
    await client.query("SET LOCAL session_replication_role = 'origin'");
    await assert.rejects(
      () => revokeRole({ client, userId: firstAdminId, roleCode: "ADMIN" }),
      /LAST_ADMIN_REQUIRED/,
    );
    await client.query("ROLLBACK TO SAVEPOINT without_bootstrap");
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});

test("la revocación concurrente no puede retirar el ADMIN principal mientras se concede otro", {
  skip: !process.env.TEST_DATABASE_URL,
}, async (context) => {
  const original = process.env.DATABASE_URL;
  context.after(async () => {
    await closePool();
    restoreDatabaseUrl();
    if (original !== undefined) process.env.DATABASE_URL = original;
  });

  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await migrate();
  const pool = getPool();
  const { rows: primaryRows } = await pool.query(
    `SELECT u.id
       FROM bootstrap_state bs
       JOIN "user" u ON u.id = bs.initial_admin_user_id
       JOIN user_role ur ON ur.user_id = u.id AND ur.role_code = 'ADMIN'
      WHERE bs.singleton = true`,
  );
  if (primaryRows.length === 0) {
    context.skip("La base no tiene un ADMIN inicial configurado.");
    return;
  }

  const primaryAdminId = primaryRows[0].id;
  const candidateAdminId = randomUUID();
  await pool.query(
    `INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, 'Concurrent admin', $2, true)`,
    [candidateAdminId, `${candidateAdminId}@example.test`],
  );

  try {
    const outcomes = await Promise.allSettled([
      grantRole({ userId: candidateAdminId, roleCode: "ADMIN" }),
      revokeRole({ userId: primaryAdminId, roleCode: "ADMIN" }),
    ]);
    assert.equal(outcomes[0].status, "fulfilled");
    assert.equal(outcomes[1].status, "rejected");
    assert.equal(outcomes[1].reason.message, "PRIMARY_ADMIN_PROTECTED");

    const { rows: primaryRoleRows } = await pool.query(
      "SELECT role_code FROM user_role WHERE user_id = $1 AND role_code = 'ADMIN'",
      [primaryAdminId],
    );
    assert.deepEqual(primaryRoleRows, [{ role_code: "ADMIN" }]);
  } finally {
    await deleteUser({ userId: candidateAdminId });
  }
});
