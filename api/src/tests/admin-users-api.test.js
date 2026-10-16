import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createApp } from "../app.js";
import { getPool, closePool } from "../db/pool.js";
import { migrate } from "../db/migrate.js";

test("ADMIN emite invitaciones de rol seguro; ADMIN solo puede aceptarse en una cuenta nueva", {
  skip: !process.env.TEST_DATABASE_URL,
}, async (context) => {
  const original = process.env.DATABASE_URL;
  context.after(async () => {
    await closePool();
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
  });
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await migrate();

  const adminId = randomUUID();
  const invitedUserId = randomUUID();
  const invitedAdminId = randomUUID();
  const existingUserId = randomUUID();
  const email = `comisario-${randomUUID()}@example.test`;
  const adminEmail = `admin-${randomUUID()}@example.test`;
  const existingAdminEmail = `existing-admin-${randomUUID()}@example.test`;
  const lateAdminEmail = `late-admin-${randomUUID()}@example.test`;
  const lateAdminId = randomUUID();
  let lateAdminInvitationId;
  const revokedAdminEmail = `revoked-admin-${randomUUID()}@example.test`;
  const revokedAdminId = randomUUID();
  let revokedAdminInvitationId;
  const pool = getPool();
  let releaseConcurrentCreate;
  let notifyConcurrentCreate;
  const concurrentCreateStarted = new Promise((resolve) => { notifyConcurrentCreate = resolve; });
  const concurrentCreateCanFinish = new Promise((resolve) => { releaseConcurrentCreate = resolve; });
  let concurrentCreateCalls = 0;
  await pool.query(
    `INSERT INTO "user"(id, name, email, "emailVerified")
     VALUES ($1, 'Admin', $2, true)`,
    [adminId, `${adminId}@example.test`],
  );
  await pool.query("INSERT INTO user_role(user_id, role_code) VALUES($1, 'ADMIN')", [adminId]);
  await pool.query(
    `INSERT INTO "user"(id, name, email, "emailVerified") VALUES ($1, 'Existing JUDGE', $2, true)`,
    [existingUserId, existingAdminEmail],
  );
  await pool.query("INSERT INTO user_role(user_id, role_code) VALUES($1, 'JUDGE')", [existingUserId]);

  const app = createApp({
    getSession: async ({ headers }) => headers.get("x-test-session") === "admin"
      ? { user: { id: adminId, twoFactorEnabled: true } }
      : null,
    createUser: async ({ email: invitedEmail, name }) => {
      if (invitedEmail === adminEmail) {
        await pool.query(
          `INSERT INTO "user"(id, name, email, "emailVerified") VALUES ($1, $2, $3, false)`,
          [invitedAdminId, name, invitedEmail],
        );
        return { user: { id: invitedAdminId }, created: true };
      }
      if (invitedEmail === existingAdminEmail) {
        return { user: { id: existingUserId }, created: false };
      }
      if (invitedEmail === lateAdminEmail) {
        await pool.query(
          `INSERT INTO "user"(id, name, email, "emailVerified") VALUES ($1, $2, $3, false)`,
          [lateAdminId, name, invitedEmail],
        );
        await pool.query(
          `UPDATE role_invitation
              SET created_at = clock_timestamp() - INTERVAL '73 hours',
                  expires_at = clock_timestamp() - INTERVAL '1 minute'
            WHERE id = $1`,
          [lateAdminInvitationId],
        );
        return {
          user: { id: lateAdminId },
          created: true,
          rollback: async () => { await pool.query(`DELETE FROM "user" WHERE id = $1`, [lateAdminId]); },
        };
      }
      if (invitedEmail === revokedAdminEmail) {
        await pool.query(
          `INSERT INTO "user"(id, name, email, "emailVerified") VALUES ($1, $2, $3, false)`,
          [revokedAdminId, name, invitedEmail],
        );
        await pool.query(
          `UPDATE role_invitation SET status = 'REVOKED', revoked_at = clock_timestamp()
            WHERE id = $1`,
          [revokedAdminInvitationId],
        );
        return {
          user: { id: revokedAdminId },
          created: true,
          rollback: async () => { await pool.query(`DELETE FROM "user" WHERE id = $1`, [revokedAdminId]); },
        };
      }
      const isConcurrent = invitedEmail.startsWith("concurrent-");
      if (isConcurrent) {
        concurrentCreateCalls += 1;
        notifyConcurrentCreate();
        await concurrentCreateCanFinish;
      }
      const id = invitedEmail === email ? invitedUserId : randomUUID();
      await pool.query(
        `INSERT INTO "user"(id, name, email, "emailVerified")
         VALUES ($1, $2, $3, false)`,
        [id, name, invitedEmail],
      );
      return { id };
    },
  });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const adminHeaders = {
      "content-type": "application/json",
      "x-test-session": "admin",
    };
    const usersResponse = await fetch(`${base}/api/v1/users`, { headers: adminHeaders });
    assert.equal(usersResponse.status, 200);
    const listedUsers = await usersResponse.json();
    assert.ok(listedUsers.every((user) => Array.isArray(user.roles)
      && typeof user.isPrimaryAdmin === "boolean"));
    const primaryAdmin = listedUsers.find((user) => user.isPrimaryAdmin);
    if (primaryAdmin) {
      const primaryRoleBefore = await pool.query(
        "SELECT role_code FROM user_role WHERE user_id = $1 AND role_code = 'ADMIN'",
        [primaryAdmin.id],
      );
      const primaryRevokeResponse = await fetch(
        `${base}/api/v1/users/${primaryAdmin.id}/roles/admin`,
        { method: "DELETE", headers: adminHeaders },
      );
      assert.equal(primaryRevokeResponse.status, 409);
      assert.deepEqual(await primaryRevokeResponse.json(), { code: "PRIMARY_ADMIN_PROTECTED" });
      const primaryRoleAfter = await pool.query(
        "SELECT role_code FROM user_role WHERE user_id = $1 AND role_code = 'ADMIN'",
        [primaryAdmin.id],
      );
      assert.deepEqual(primaryRoleAfter.rows, primaryRoleBefore.rows);
    }

    const inviteResponse = await fetch(`${base}/api/v1/users/invitations`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ email, roleCode: "COMISARIO" }),
    });
    assert.equal(inviteResponse.status, 201);
    const invitation = await inviteResponse.json();
    assert.match(invitation.token, /^[A-Za-z0-9_-]{43}$/);

    const { rows: invitationRows } = await pool.query(
      "SELECT token_hash, status FROM role_invitation WHERE id = $1",
      [invitation.id],
    );
    assert.equal(invitationRows[0].status, "PENDING");
    assert.notEqual(invitationRows[0].token_hash, invitation.token);
    const { rows: tokenColumns } = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'role_invitation' AND column_name = 'token'",
    );
    assert.equal(tokenColumns.length, 0);

    const inspectResponse = await fetch(`${base}/api/v1/invitations/role/inspect`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: invitation.token }),
    });
    assert.equal(inspectResponse.status, 200);
    const inspection = await inspectResponse.json();
    assert.match(inspection.maskedEmail, /^c\*+@example\.test$/);
    assert.equal(inspection.roleCode, "COMISARIO");
    assert.equal(inspection.expiresAt, invitation.expiresAt);

    const acceptResponse = await fetch(`${base}/api/v1/invitations/role/accept`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: invitation.token, password: "Password-de-prueba1" }),
    });
    assert.equal(acceptResponse.status, 201);
    assert.deepEqual(await acceptResponse.json(), { userId: invitedUserId, roleCode: "COMISARIO" });

    const { rows: roles } = await pool.query(
      "SELECT role_code FROM user_role WHERE user_id = $1",
      [invitedUserId],
    );
    assert.deepEqual(roles, [{ role_code: "COMISARIO" }]);
    const { rows: audit } = await pool.query(
      "SELECT action, after_data AS after FROM audit_event WHERE actor_user_id = $1",
      [invitedUserId],
    );
    assert.deepEqual(audit, [{ action: "USER_ROLE_GRANTED", after: { roleCode: "COMISARIO", fromInvitation: invitation.id } }]);

    const reusedResponse = await fetch(`${base}/api/v1/invitations/role/accept`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: invitation.token, password: "Password-de-prueba1" }),
    });
    assert.equal(reusedResponse.status, 400);
    assert.deepEqual(await reusedResponse.json(), { code: "INVITATION_INVALID" });

    const adminInvitationResponse = await fetch(`${base}/api/v1/users/invitations`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ email: adminEmail, roleCode: "ADMIN" }),
    });
    assert.equal(adminInvitationResponse.status, 201);
    const adminInvitation = await adminInvitationResponse.json();
    assert.equal(adminInvitation.roleCode, "ADMIN");
    const { rows: adminInvitationAudit } = await pool.query(
      "SELECT action, after_data AS after FROM audit_event WHERE entity_type = 'role_invitation' AND entity_id = $1",
      [adminInvitation.id],
    );
    assert.equal(adminInvitationAudit[0].action, "ADMIN_INVITATION_CREATED");
    assert.equal(adminInvitationAudit[0].after.roleCode, "ADMIN");
    assert.equal("token" in adminInvitationAudit[0].after, false);
    const adminAcceptance = await fetch(`${base}/api/v1/invitations/role/accept`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: adminInvitation.token, password: "Password-de-prueba1" }),
    });
    assert.equal(adminAcceptance.status, 201);
    assert.deepEqual(await adminAcceptance.json(), { userId: invitedAdminId, roleCode: "ADMIN" });
    const { rows: invitedAdminRoles } = await pool.query(
      "SELECT role_code FROM user_role WHERE user_id = $1 ORDER BY role_code",
      [invitedAdminId],
    );
    assert.deepEqual(invitedAdminRoles, [{ role_code: "ADMIN" }]);
    const { rows: adminGrantAudit } = await pool.query(
      "SELECT action, after_data AS after FROM audit_event WHERE actor_user_id = $1",
      [invitedAdminId],
    );
    assert.deepEqual(adminGrantAudit, [{
      action: "USER_ROLE_GRANTED",
      after: { roleCode: "ADMIN", fromInvitation: adminInvitation.id },
    }]);

    const existingAdminInvitationResponse = await fetch(`${base}/api/v1/users/invitations`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ email: existingAdminEmail, roleCode: "ADMIN" }),
    });
    assert.equal(existingAdminInvitationResponse.status, 201);
    const existingAdminInvitation = await existingAdminInvitationResponse.json();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const existingAdminAcceptance = await fetch(`${base}/api/v1/invitations/role/accept`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: existingAdminInvitation.token, password: "Password-de-prueba1" }),
      });
      assert.equal(existingAdminAcceptance.status, 400);
      assert.deepEqual(await existingAdminAcceptance.json(), { code: "INVITATION_INVALID" });
    }
    const { rows: existingUserRoles } = await pool.query(
      "SELECT role_code FROM user_role WHERE user_id = $1 ORDER BY role_code",
      [existingUserId],
    );
    assert.deepEqual(existingUserRoles, [{ role_code: "JUDGE" }]);
    const { rows: existingAdminGrantAudit } = await pool.query(
      "SELECT id FROM audit_event WHERE actor_user_id = $1 AND action = 'USER_ROLE_GRANTED'",
      [existingUserId],
    );
    assert.equal(existingAdminGrantAudit.length, 0);

    const lateAdminInvitationResponse = await fetch(`${base}/api/v1/users/invitations`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ email: lateAdminEmail, roleCode: "ADMIN" }),
    });
    assert.equal(lateAdminInvitationResponse.status, 201);
    const lateAdminInvitation = await lateAdminInvitationResponse.json();
    lateAdminInvitationId = lateAdminInvitation.id;
    const lateAdminAcceptance = await fetch(`${base}/api/v1/invitations/role/accept`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: lateAdminInvitation.token, password: "Password-de-prueba1" }),
    });
    assert.equal(lateAdminAcceptance.status, 201);
    assert.deepEqual(await lateAdminAcceptance.json(), { userId: lateAdminId, roleCode: "ADMIN" });
    assert.deepEqual(await pool.query(
      "SELECT role_code FROM user_role WHERE user_id = $1 ORDER BY role_code",
      [lateAdminId],
    ).then(({ rows }) => rows), [{ role_code: "ADMIN" }]);

    const revokedAdminInvitationResponse = await fetch(`${base}/api/v1/users/invitations`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ email: revokedAdminEmail, roleCode: "ADMIN" }),
    });
    assert.equal(revokedAdminInvitationResponse.status, 201);
    const revokedAdminInvitation = await revokedAdminInvitationResponse.json();
    revokedAdminInvitationId = revokedAdminInvitation.id;
    const revokedAdminAcceptance = await fetch(`${base}/api/v1/invitations/role/accept`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: revokedAdminInvitation.token, password: "Password-de-prueba1" }),
    });
    assert.equal(revokedAdminAcceptance.status, 400);
    assert.deepEqual(await revokedAdminAcceptance.json(), { code: "INVITATION_INVALID" });
    assert.equal((await pool.query(`SELECT 1 FROM "user" WHERE id = $1`, [revokedAdminId])).rowCount, 0);
    assert.equal((await pool.query(
      "SELECT 1 FROM audit_event WHERE entity_id = $1 AND action = 'USER_ROLE_GRANTED'",
      [revokedAdminId],
    )).rowCount, 0);

    const invalidRoleResponse = await fetch(`${base}/api/v1/users/invitations`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ email: `judge-${randomUUID()}@example.test`, roleCode: "JUDGE" }),
    });
    assert.equal(invalidRoleResponse.status, 400);
    assert.deepEqual(await invalidRoleResponse.json(), { code: "INVALID_OPERATIONAL_ROLE" });

    const escribanoResponse = await fetch(`${base}/api/v1/users/invitations`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ email: `escribano-${randomUUID()}@example.test`, roleCode: "ESCRIBANO" }),
    });
    assert.equal(escribanoResponse.status, 201);
    assert.equal((await escribanoResponse.json()).roleCode, "ESCRIBANO");

    const expiredResponse = await fetch(`${base}/api/v1/users/invitations`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ email: `expired-${randomUUID()}@example.test`, roleCode: "VEEDOR" }),
    });
    const expiredInvitation = await expiredResponse.json();
    await pool.query(
      `UPDATE role_invitation
          SET created_at = clock_timestamp() - INTERVAL '73 hours',
              expires_at = clock_timestamp() - INTERVAL '1 minute'
        WHERE id = $1`,
      [expiredInvitation.id],
    );
    const inspectExpired = await fetch(`${base}/api/v1/invitations/role/inspect`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: expiredInvitation.token }),
    });
    assert.equal(inspectExpired.status, 400);
    assert.deepEqual(await inspectExpired.json(), { code: "INVITATION_INVALID" });

    const concurrentResponse = await fetch(`${base}/api/v1/users/invitations`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ email: `concurrent-${randomUUID()}@example.test`, roleCode: "SCRUTINEER" }),
    });
    const concurrentInvitation = await concurrentResponse.json();
    const firstAcceptance = fetch(`${base}/api/v1/invitations/role/accept`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: concurrentInvitation.token, password: "Password-de-prueba1" }),
    });
    await concurrentCreateStarted;
    const losingAcceptance = await fetch(`${base}/api/v1/invitations/role/accept`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: concurrentInvitation.token, password: "Password-de-prueba1" }),
    });
    releaseConcurrentCreate();
    const winningAcceptance = await firstAcceptance;
    assert.equal(winningAcceptance.status, 201);
    assert.equal(losingAcceptance.status, 400);
    assert.deepEqual(await losingAcceptance.json(), { code: "INVITATION_INVALID" });
    assert.equal(concurrentCreateCalls, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
