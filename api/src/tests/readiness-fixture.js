import { randomUUID } from "node:crypto";

// Explicit fixture prerequisite for tests whose subject is not jury assignment.
// Uses real constraints; never disables guards or fabricates readiness responses.
export async function assignReadinessJury(client, eventId) {
  const id = randomUUID();
  await client.query('INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,\'Fixture judge\',$2,true)', [id, `${id}@example.test`]);
  await client.query("INSERT INTO user_role(user_id,role_code) VALUES($1,'JUDGE')", [id]);
  const { rows: [profile] } = await client.query(
    "INSERT INTO judge_profile(user_id,name,email,document_number,registration_status,created_by) VALUES($1,'Fixture judge',$2,$1,'REGISTERED',$1) RETURNING id", [id, `${id}@example.test`]);
  const { rows: [specialty] } = await client.query("SELECT id FROM event_specialty WHERE event_id=$1 AND active ORDER BY display_order LIMIT 1", [eventId]);
  if (!specialty) throw new Error("Readiness fixture requires an active specialty");
  const { rows: nights } = await client.query("SELECT id FROM night WHERE event_id=$1 AND kind='COMPETITION'", [eventId]);
  for (const night of nights) {
    await client.query("INSERT INTO judge_quota(event_id,night_id,specialty_id,max_assignments) VALUES($1,$2,$3,5) ON CONFLICT (night_id,specialty_id) DO NOTHING", [eventId, night.id, specialty.id]);
    await client.query("INSERT INTO judge_assignment(event_id,night_id,specialty_id,judge_profile_id) VALUES($1,$2,$3,$4)", [eventId, night.id, specialty.id, profile.id]);
  }
}
