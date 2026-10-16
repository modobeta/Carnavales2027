import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createApp } from "../app.js";
import { closePool, getPool } from "../db/pool.js";
import { migrate } from "../db/migrate.js";

const originalDatabaseUrl = process.env.DATABASE_URL;

function restoreDatabaseUrl() {
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
    return;
  }

  process.env.DATABASE_URL = originalDatabaseUrl;
}

async function withServer(app, run) {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });

  try {
    const address = server.address();
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test("GET /api/v1/me exige sesión 2FA y devuelve roles sin exigir ADMIN", {
  skip: !process.env.TEST_DATABASE_URL,
}, async (context) => {
  context.after(async () => {
    await closePool();
    restoreDatabaseUrl();
  });

  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await migrate();

  const userId = randomUUID();
  const adminId = randomUUID();
  const assignedEventId = randomUUID();
  const inactiveEventId = randomUUID();
  const revokedEventId = randomUUID();
  const otherUserEventId = randomUUID();
  const otherUserId = randomUUID();
  const userWithoutAssignmentsId = randomUUID();
  const pool = getPool();
  await pool.query(
    `INSERT INTO "user" (id, name, email, "emailVerified")
     VALUES ($1, $2, $3, $4), ($5, $6, $7, $8), ($9, $10, $11, $12), ($13, $14, $15, $16)`,
    [
      userId,
      "User without admin",
      `${userId}@example.test`,
      true,
      adminId,
      "Administrator",
      `${adminId}@example.test`,
      true,
      otherUserId,
      "Other user",
      `${otherUserId}@example.test`,
      true,
      userWithoutAssignmentsId,
      "User without assignments",
      `${userWithoutAssignmentsId}@example.test`,
      true,
    ],
  );
  await pool.query(
    "INSERT INTO user_role (user_id, role_code) VALUES ($1, 'ADMIN')",
    [adminId],
  );
  await pool.query(
    `INSERT INTO carnival_event (id, name, active)
     VALUES ($1, 'Assigned event', TRUE), ($2, 'Inactive assigned event', FALSE),
            ($3, 'Revoked event', TRUE), ($4, 'Other user event', TRUE)`,
    [assignedEventId, inactiveEventId, revokedEventId, otherUserEventId],
  );
  await pool.query(
    `INSERT INTO admin_event_assignment (user_id, event_id, is_active)
     VALUES ($1, $2, TRUE), ($1, $3, TRUE), ($1, $4, FALSE), ($5, $6, TRUE)`,
    [userId, assignedEventId, inactiveEventId, revokedEventId, otherUserId, otherUserEventId],
  );

  const sessions = {
    userWithoutTwoFactor: {
      user: { id: userId, email: `${userId}@example.test`, name: "User without admin", twoFactorEnabled: false },
    },
    userWithoutAdmin: {
      user: { id: userId, email: `${userId}@example.test`, name: "User without admin", twoFactorEnabled: true },
    },
    userWithoutAssignments: {
      user: { id: userWithoutAssignmentsId, email: `${userWithoutAssignmentsId}@example.test`, name: "User without assignments", twoFactorEnabled: true },
    },
    admin: {
      user: { id: adminId, email: `${adminId}@example.test`, name: "Administrator", twoFactorEnabled: true },
    },
  };
  const app = createApp({
    getSession: async ({ headers }) => sessions[headers.get("x-test-session")] ?? null,
  });

  await withServer(app, async (baseUrl) => {
    const anonymous = await fetch(`${baseUrl}/api/v1/me`);
    assert.equal(anonymous.status, 401);
    assert.deepEqual(await anonymous.json(), { code: "UNAUTHENTICATED" });

    const missingTwoFactor = await fetch(`${baseUrl}/api/v1/me`, {
      headers: { "x-test-session": "userWithoutTwoFactor" },
    });
    assert.equal(missingTwoFactor.status, 403);
    assert.deepEqual(await missingTwoFactor.json(), { code: "TWO_FACTOR_REQUIRED" });

    const missingRole = await fetch(`${baseUrl}/api/v1/me`, {
      headers: { "x-test-session": "userWithoutAdmin" },
    });
    assert.equal(missingRole.status, 200);
    const missingRolePayload = await missingRole.json();
    missingRolePayload.adminEvents.sort((left, right) => left.name.localeCompare(right.name));
    assert.deepEqual(missingRolePayload, {
      user: {
        id: userId,
        email: `${userId}@example.test`,
        name: "User without admin",
      },
      roles: [],
      judgeProfile: null,
      adminEvents: [
        { id: assignedEventId, name: "Assigned event", status: "CONFIGURING", active: true },
        { id: inactiveEventId, name: "Inactive assigned event", status: "CONFIGURING", active: false },
      ],
    });

    const spoofedCapability = await fetch(
      `${baseUrl}/api/v1/me?userId=${otherUserId}&role=ADMIN&eventId=${otherUserEventId}&adminEvents=all`,
      { headers: { "x-test-session": "userWithoutAdmin", "x-test-user-id": otherUserId } },
    );
    assert.equal(spoofedCapability.status, 200);
    const spoofedCapabilityPayload = await spoofedCapability.json();
    spoofedCapabilityPayload.adminEvents.sort((left, right) => left.name.localeCompare(right.name));
    assert.deepEqual(spoofedCapabilityPayload.adminEvents, missingRolePayload.adminEvents);

    const withoutAssignments = await fetch(`${baseUrl}/api/v1/me`, {
      headers: { "x-test-session": "userWithoutAssignments" },
    });
    assert.equal(withoutAssignments.status, 200);
    assert.deepEqual((await withoutAssignments.json()).adminEvents, []);

    await pool.query(
      "UPDATE admin_event_assignment SET is_active = FALSE WHERE user_id = $1 AND is_active = TRUE",
      [userId],
    );
    const afterRevocation = await fetch(`${baseUrl}/api/v1/me`, {
      headers: { "x-test-session": "userWithoutAdmin" },
    });
    assert.equal(afterRevocation.status, 200);
    assert.deepEqual((await afterRevocation.json()).adminEvents, []);

    const admin = await fetch(`${baseUrl}/api/v1/me`, {
      headers: { "x-test-session": "admin" },
    });
    assert.equal(admin.status, 200);
    assert.deepEqual(await admin.json(), {
      user: {
        id: adminId,
        email: `${adminId}@example.test`,
        name: "Administrator",
      },
      roles: ["ADMIN"],
      judgeProfile: null,
      adminEvents: [],
    });

    const originalQuery = pool.query;
    try {
      pool.query = function queryWithAssignmentFailure(...args) {
        if (typeof args[0] === "string" && args[0].includes("admin_event_assignment")) {
          return Promise.reject(new Error("injected assignment query failure"));
        }
        return originalQuery.apply(this, args);
      };
      const failedCapability = await fetch(`${baseUrl}/api/v1/me`, {
        headers: { "x-test-session": "userWithoutAdmin" },
      });
      assert.equal(failedCapability.status, 500);
      assert.deepEqual(await failedCapability.json(), { code: "INTERNAL_ERROR" });
    } finally {
      pool.query = originalQuery;
    }
  });
});
