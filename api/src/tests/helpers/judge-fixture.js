import { randomUUID } from "node:crypto";

/**
 * Siembra un jurado activo (perfil REGISTERED + cupo + asignación) para una
 * jornada de competencia.
 *
 * La migración 083 exige al menos un jurado activo por jornada de competencia
 * para poder abrir el evento, tanto en el servicio de readiness como en el
 * trigger de base. Los tests que abren eventos necesitan este fixture.
 *
 * Recibe un `client` (pool o cliente de transacción) para poder ejecutarse
 * dentro de una transacción de test.
 */
export async function seedActiveJudge({
  client,
  eventId,
  nightId,
  specialtyId,
  maxAssignments = 3,
  adminId = null,
}) {
  const userId = randomUUID();
  const creatorId = adminId ?? randomUUID();

  await client.query(
    `INSERT INTO "user"(id, name, email, "emailVerified")
     VALUES ($1, 'Judge Fixture', $2, true), ($3, 'Admin Fixture', $4, true)
     ON CONFLICT (id) DO NOTHING`,
    [userId, `judge-${userId}@example.test`, creatorId, `admin-${creatorId}@example.test`],
  );

  const { rows: [profile] } = await client.query(
    `INSERT INTO judge_profile(name, email, document_number, registration_status, created_by, user_id)
     VALUES ('Judge Fixture', $1, $2, 'REGISTERED', $3, $4) RETURNING id`,
    [`judge-${userId}@example.test`, `DOC-${randomUUID()}`, creatorId, userId],
  );

  await client.query(
    `INSERT INTO judge_quota(event_id, night_id, specialty_id, max_assignments)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (night_id, specialty_id)
     DO UPDATE SET max_assignments = GREATEST(judge_quota.max_assignments, EXCLUDED.max_assignments)`,
    [eventId, nightId, specialtyId, maxAssignments],
  );

  const { rows: [assignment] } = await client.query(
    `INSERT INTO judge_assignment(event_id, night_id, specialty_id, judge_profile_id, assignment_type)
     VALUES ($1, $2, $3, $4, 'PRIMARY') RETURNING id`,
    [eventId, nightId, specialtyId, profile.id],
  );

  return { userId, adminId: creatorId, profileId: profile.id, assignmentId: assignment.id };
}
