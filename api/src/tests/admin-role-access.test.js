import assert from "node:assert/strict";
import test from "node:test";
import { hasAdminRole } from "../auth/admin-role-access.js";

const userId = "11111111-1111-4111-8111-111111111111";

function createDb({ users = [], globalAdmins = [], assignments = [] } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, values) {
      calls.push({ sql, values });
      const queriedUserId = values[0];
      return { rows: [{ allowed: users.includes(queriedUserId) && globalAdmins.includes(queriedUserId) }] };
    },
  };
}

test("ADMIN global tiene acceso sin depender de asignaciones", async () => {
  const db = createDb({ users: [userId], globalAdmins: [userId] });

  assert.equal(await hasAdminRole({ userId, db }), true);
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].values, [userId]);
});

test("una asignación ADMIN_EVENT activa o inactiva no concede el rol ADMIN", async () => {
  const db = createDb({
    users: [userId],
    assignments: [
      { userId, eventId: "22222222-2222-4222-8222-222222222222", isActive: true },
      { userId, eventId: "33333333-3333-4333-8333-333333333333", isActive: false },
    ],
  });

  assert.equal(await hasAdminRole({ userId, db }), false);
});

test("identidad inválida no concede acceso y no consulta la base", async () => {
  const db = createDb();

  assert.equal(await hasAdminRole({ db }), false);
  assert.equal(await hasAdminRole({ userId: 123, db }), false);
  assert.equal(db.calls.length, 0);
});

test("usa la base inyectada y el identificador como parámetro, sin confiar en rol del caller", async () => {
  const db = createDb({ users: [userId], globalAdmins: [userId] });

  assert.equal(await hasAdminRole({ userId, role: "ADMIN", db }), true);
  assert.deepEqual(db.calls[0].values, [userId]);
  assert.match(db.calls[0].sql, /\$1/);
  assert.doesNotMatch(db.calls[0].sql, new RegExp(userId));
});
