import assert from "node:assert/strict";
import test from "node:test";
import { hasEventAdminAccess } from "../auth/event-admin-access.js";

const userId = "11111111-1111-4111-8111-111111111111";
const eventId = "22222222-2222-4222-8222-222222222222";
const otherEventId = "33333333-3333-4333-8333-333333333333";

function createDb({ users = [], events = [], globalAdmins = [], assignments = [] } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, values) {
      calls.push({ sql, values });
      const [queriedUserId, queriedEventId] = values;
      const exists = users.includes(queriedUserId) && events.includes(queriedEventId);
      const isGlobalAdmin = globalAdmins.includes(queriedUserId);
      const hasActiveAssignment = assignments.some((assignment) =>
        assignment.userId === queriedUserId
        && assignment.eventId === queriedEventId
        && assignment.isActive,
      );
      return { rows: [{ allowed: exists && (isGlobalAdmin || hasActiveAssignment) }] };
    },
  };
}

test("ADMIN global tiene acceso al evento existente aunque no tenga asignación", async () => {
  const db = createDb({ users: [userId], events: [eventId], globalAdmins: [userId] });

  assert.equal(await hasEventAdminAccess({ userId, eventId, db }), true);
  assert.equal(db.calls.length, 1);
});

test("ADMIN global conserva acceso aunque tenga una asignación inactiva", async () => {
  const db = createDb({
    users: [userId],
    events: [eventId],
    globalAdmins: [userId],
    assignments: [{ userId, eventId, isActive: false }],
  });

  assert.equal(await hasEventAdminAccess({ userId, eventId, db }), true);
});

test("ADMIN_EVENT solo tiene acceso a la pareja exacta activa", async () => {
  const db = createDb({
    users: [userId],
    events: [eventId, otherEventId],
    assignments: [{ userId, eventId, isActive: true }],
  });

  assert.equal(await hasEventAdminAccess({ userId, eventId, db }), true);
  assert.equal(await hasEventAdminAccess({ userId, eventId: otherEventId, db }), false);
});

test("asignación inactiva o ausente no concede permiso", async () => {
  const db = createDb({
    users: [userId],
    events: [eventId],
    assignments: [{ userId, eventId, isActive: false }],
  });

  assert.equal(await hasEventAdminAccess({ userId, eventId, db }), false);
});

test("una resolución posterior a la revocación efectiva devuelve false", async () => {
  const assignment = { userId, eventId, isActive: true };
  const db = createDb({ users: [userId], events: [eventId], assignments: [assignment] });

  assert.equal(await hasEventAdminAccess({ userId, eventId, db }), true);
  assignment.isActive = false;
  assert.equal(await hasEventAdminAccess({ userId, eventId, db }), false);
});

test("usuario con ADMIN y ADMIN_EVENT conserva el alcance global", async () => {
  const db = createDb({
    users: [userId],
    events: [eventId],
    globalAdmins: [userId],
    assignments: [{ userId, eventId, isActive: false }],
  });

  assert.equal(await hasEventAdminAccess({ userId, eventId, db }), true);
});

test("identidad, evento ausente, inválido o inexistente no concede permiso", async () => {
  const db = createDb({ users: [userId], events: [eventId], globalAdmins: [userId] });

  assert.equal(await hasEventAdminAccess({ eventId, db }), false);
  assert.equal(await hasEventAdminAccess({ userId, db }), false);
  assert.equal(await hasEventAdminAccess({ userId: 123, eventId, db }), false);
  assert.equal(await hasEventAdminAccess({ userId, eventId: "not-a-uuid", db }), false);
  assert.equal(db.calls.length, 0);
  assert.equal(await hasEventAdminAccess({ userId, eventId: otherEventId, db }), false);
  assert.equal(db.calls.length, 1);
});

test("acepta cualquier UUID sintácticamente válido como evento, sin inferir su versión", async () => {
  const db = createDb();

  assert.equal(await hasEventAdminAccess({ userId, eventId: "00000000-0000-0000-0000-000000000000", db }), false);
  assert.equal(db.calls.length, 1);
});

test("usa el db inyectado con parámetros separados, sin tomar un rol del caller", async () => {
  const db = createDb({ users: [userId], events: [eventId], globalAdmins: [userId] });

  assert.equal(await hasEventAdminAccess({ userId, eventId, db }), true);
  assert.deepEqual(db.calls[0].values, [userId, eventId]);
  assert.match(db.calls[0].sql, /\$1/);
  assert.match(db.calls[0].sql, /\$2/);
  assert.doesNotMatch(db.calls[0].sql, new RegExp(userId));
});
