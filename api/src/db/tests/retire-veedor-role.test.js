import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getPool, closePool } from "../pool.js";
import { migrate } from "../migrate.js";

const originalDatabaseUrl = process.env.DATABASE_URL;

async function assertRejectedQuery(client, query, pattern) {
  await client.query("SAVEPOINT expected_rejection");
  try {
    await assert.rejects(query(), pattern);
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT expected_rejection");
    await client.query("RELEASE SAVEPOINT expected_rejection");
  }
}

function restoreDatabaseUrl() {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
}

test("retirar VEEDOR invalida sesiones y revoca asignaciones/invitaciones sin borrar perfiles", {
  skip: !process.env.TEST_DATABASE_URL,
}, async (context) => {
  context.after(async () => {
    await closePool();
    restoreDatabaseUrl();
  });
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await migrate();

  const pool = getPool();
  const client = await pool.connect();
  const adminId = randomUUID();
  const veedorId = randomUUID();
  const registeredProfileId = randomUUID();
  const invitedProfileId = randomUUID();
  const sessionId = randomUUID();
  const roleInvitationId = randomUUID();
  const operationalInvitationId = randomUUID();
  const secretHash = randomUUID().replaceAll("-", "").padEnd(64, "a").slice(0, 64);
  const migrationSql = await readFile(new URL("../migrations/120_retire_veedor_role.sql", import.meta.url), "utf8");

  try {
    await client.query("BEGIN");
    await client.query("DROP TRIGGER reject_retired_user_role ON user_role");
    await client.query("DROP TRIGGER reject_retired_profile_role ON operational_profile_role");
    await client.query("DROP TRIGGER reject_retired_role_invitation ON role_invitation");
    await client.query(
      `INSERT INTO "user" (id, name, email, "emailVerified") VALUES
       ($1, 'Retirement admin', $2, true), ($3, 'Former observer', $4, true)`,
      [adminId, `${adminId}@example.test`, veedorId, `${veedorId}@example.test`],
    );
    await client.query("INSERT INTO user_role(user_id, role_code) VALUES ($1, 'ADMIN'), ($2, 'VEEDOR')", [adminId, veedorId]);
    await client.query(
      `INSERT INTO operational_profile(id, user_id, name, email, document_number, registration_status, created_by)
       VALUES ($1, $2, 'Former observer', $3, $4, 'REGISTERED', $5),
              ($6, NULL, 'Invited observer', $7, $8, 'INVITED', $5)`,
      [registeredProfileId, veedorId, `${veedorId}@example.test`, `RET-${veedorId}`, adminId,
        invitedProfileId, `invited-${invitedProfileId}@example.test`, `RET-${invitedProfileId}`],
    );
    await client.query(
      "INSERT INTO operational_profile_role(operational_profile_id, role_code) VALUES ($1, 'VEEDOR'), ($2, 'VEEDOR')",
      [registeredProfileId, invitedProfileId],
    );
    await client.query(
      `INSERT INTO session(id, "expiresAt", token, "createdAt", "updatedAt", "userId")
       VALUES ($1, CURRENT_TIMESTAMP + interval '1 day', $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $3)`,
      [sessionId, randomUUID(), veedorId],
    );
    await client.query(
      `INSERT INTO role_invitation(id, email, role_code, token_hash, expires_at, created_by)
       VALUES ($1, $2, 'VEEDOR', $3, CURRENT_TIMESTAMP + interval '1 day', $4)`,
      [roleInvitationId, `${veedorId}@example.test`, secretHash, adminId],
    );
    await client.query(
      `INSERT INTO operational_invitation(id, operational_profile_id, secret_hash, expires_at, created_by)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP + interval '1 day', $4)`,
      [operationalInvitationId, invitedProfileId, secretHash.split("").reverse().join(""), adminId],
    );

    await client.query(migrationSql);

    assert.deepEqual(
      (await client.query('SELECT id FROM "user" WHERE id = $1', [veedorId])).rows,
      [{ id: veedorId }],
      "la cuenta se conserva",
    );
    assert.deepEqual(
      (await client.query("SELECT role_code FROM user_role WHERE user_id = $1", [veedorId])).rows,
      [],
      "el rol deja de estar asignado",
    );
    assert.deepEqual(
      (await client.query("SELECT id, user_id FROM operational_profile WHERE id = ANY($1::uuid[]) ORDER BY id", [[registeredProfileId, invitedProfileId]])).rows,
      [{ id: invitedProfileId, user_id: null }, { id: registeredProfileId, user_id: veedorId }].sort((a, b) => a.id.localeCompare(b.id)),
      "los perfiles y su vínculo de identidad se conservan",
    );
    assert.equal((await client.query("SELECT count(*)::int AS count FROM operational_profile_role WHERE role_code='VEEDOR'")).rows[0].count, 0);
    assert.equal((await client.query("SELECT count(*)::int AS count FROM session WHERE id=$1", [sessionId])).rows[0].count, 0);
    assert.deepEqual(
      (await client.query("SELECT status, revoked_at IS NOT NULL AS revoked FROM role_invitation WHERE id=$1", [roleInvitationId])).rows,
      [{ status: "REVOKED", revoked: true }],
    );
    assert.deepEqual(
      (await client.query("SELECT status, revoked_at IS NOT NULL AS revoked, revoked_by FROM operational_invitation WHERE id=$1", [operationalInvitationId])).rows,
      [{ status: "REVOKED", revoked: true, revoked_by: adminId }],
    );
    assert.equal((await client.query("SELECT count(*)::int AS count FROM app_role WHERE code='VEEDOR'")).rows[0].count, 1);
    await assertRejectedQuery(
      client,
      () => client.query("INSERT INTO user_role(user_id, role_code) VALUES ($1, 'VEEDOR')", [veedorId]),
      /ROLE_RETIRED/,
    );
    await assertRejectedQuery(
      client,
      () => client.query("INSERT INTO operational_profile_role(operational_profile_id, role_code) VALUES ($1, 'VEEDOR')", [registeredProfileId]),
      /ROLE_RETIRED/,
    );
    await assertRejectedQuery(
      client,
      () => client.query("UPDATE role_invitation SET role_code = 'VEEDOR' WHERE id = $1", [roleInvitationId]),
      /ROLE_RETIRED/,
    );
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
  }
});
