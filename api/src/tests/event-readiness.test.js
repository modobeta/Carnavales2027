import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { getReadiness, openEvent } from "../modules/events/event-readiness.service.js";
import { closePool, getPool } from "../db/pool.js";
import { migrate } from "../db/migrate.js";
import { createEvent, createNight } from "../modules/events/event-service.js";
import { seedActiveJudge } from "./helpers/judge-fixture.js";

test("readiness exige que todos los ítems activos usen especialidades activas antes de abrir", { skip: !process.env.TEST_DATABASE_URL }, async (context) => {
  const original = process.env.DATABASE_URL;
  context.after(async () => {
    await closePool();
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
  });
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await migrate();
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    const event = await createEvent({ client, name: "Ready" });
    const empty = await getReadiness({ client, eventId: event.id });
    assert.ok(empty.missing.includes("COMPETITION_NIGHT"));
    await client.query("SAVEPOINT direct_incomplete_open");
    await assert.rejects(
      () => client.query("UPDATE carnival_event SET status='OPEN' WHERE id=$1", [event.id]),
      /EVENT_CONFIGURATION_INCOMPLETE/,
    );
    await client.query("ROLLBACK TO SAVEPOINT direct_incomplete_open");

    const night = await createNight({ client, eventId: event.id, name: "Noche", displayOrder: 1, kind: "COMPETITION" });
    const { rows: categories } = await client.query(
      `INSERT INTO event_category(event_id, name, code, display_order)
       VALUES($1, 'Cat', 'CAT', 1) RETURNING id`,
      [event.id],
    );
    const { rows: [troupe] } = await client.query(
      "INSERT INTO event_troupe(event_id, category_id, name) VALUES($1, $2, 'Troupe') RETURNING id",
      [event.id, categories[0].id],
    );
    const unscheduled = await getReadiness({ client, eventId: event.id });
    assert.ok(unscheduled.missing.includes("INCOMPLETE_SCHEDULES"));
    await client.query(
      "INSERT INTO night_troupe_schedule(event_id, night_id, event_troupe_id, presentation_order) VALUES($1,$2,$3,1)",
      [event.id, night.id, troupe.id],
    );
    const { rows: specialties } = await client.query(
      `INSERT INTO event_specialty(event_id, name, code, display_order)
       VALUES ($1, 'Spec activa', 'SPEC', 1), ($1, 'Spec a desactivar', 'SPEC_OFF', 2)
       RETURNING id, code`,
      [event.id],
    );
    const { rows: rubrics } = await client.query(
      `INSERT INTO rubric(event_id, name, code, evaluation_target)
       VALUES($1, 'Rub', 'RUB', 'TROUPE') RETURNING id`,
      [event.id],
    );
    const { rows: inactiveRubrics } = await client.query(
      `INSERT INTO rubric(event_id, name, code, evaluation_target, active)
       VALUES($1, 'Rub inactivo', 'RUB_OFF', 'TROUPE', false) RETURNING id`,
      [event.id],
    );
    const activeSpecialty = specialties.find(({ code }) => code === "SPEC");
    const disabledSpecialty = specialties.find(({ code }) => code === "SPEC_OFF");
    await client.query(
      `INSERT INTO evaluation_item(event_id, rubric_id, specialty_id, name, code)
       VALUES ($1, $2, $3, 'Item válido', 'ITEM'),
              ($1, $2, $4, 'Item inválido', 'ITEM_OFF')`,
      [event.id, rubrics[0].id, activeSpecialty.id, disabledSpecialty.id],
    );
    await client.query("UPDATE event_specialty SET active = false WHERE id = $1", [disabledSpecialty.id]);

    const incomplete = await getReadiness({ client, eventId: event.id });
    assert.deepEqual(incomplete.incompleteRubrics.map(({ code }) => code), ["RUB"]);

    await client.query("UPDATE event_specialty SET active = true WHERE id = $1", [disabledSpecialty.id]);
    const { rows: [nominationRubric] } = await client.query(
      `INSERT INTO rubric(event_id, name, code, evaluation_target, expected_subject_type)
       VALUES($1, 'Rubro nominativo', 'NOMINATION_READY', 'NOMINATION', 'PERSON') RETURNING id`,
      [event.id],
    );
    await client.query(
      `INSERT INTO evaluation_item(event_id, rubric_id, specialty_id, name, code)
       VALUES($1, $2, $3, 'Participante', 'PARTICIPANTE')`,
      [event.id, nominationRubric.id, activeSpecialty.id],
    );
    const missingNomination = await getReadiness({ client, eventId: event.id });
    assert.ok(missingNomination.missing.includes("INCOMPLETE_NOMINATIONS"));
    assert.equal(missingNomination.incompleteNominations.length, 1);
    await client.query("SAVEPOINT direct_open_without_nomination");
    await client.query("SELECT set_config('app.allow_event_open', 'true', true)");
    await assert.rejects(
      () => client.query("UPDATE carnival_event SET status='OPEN' WHERE id=$1", [event.id]),
      /EVENT_CONFIGURATION_INCOMPLETE/,
    );
    await client.query("ROLLBACK TO SAVEPOINT direct_open_without_nomination");
    await client.query(
      `INSERT INTO troupe_nomination(event_id, event_troupe_id, rubric_id, subject_type, display_name)
       VALUES($1, $2, $3, 'PERSON', 'Participante')`,
      [event.id, troupe.id, nominationRubric.id],
    );
    const withoutJury = await getReadiness({ client, eventId: event.id });
    assert.deepEqual(withoutJury.missing, ["NIGHTS_WITHOUT_JURY"]);
    await assert.rejects(() => openEvent({ client, eventId: event.id }), /EVENT_CONFIGURATION_INCOMPLETE/);
    await client.query("SAVEPOINT missing_jury_guard");
    await client.query("SELECT set_config('app.allow_event_open','true',true)");
    await assert.rejects(() => client.query("UPDATE carnival_event SET status='OPEN' WHERE id=$1", [event.id]), /EVENT_CONFIGURATION_INCOMPLETE/);
    await client.query("ROLLBACK TO SAVEPOINT missing_jury_guard");
    // Awards nights cannot have assignments and must not prevent opening.
    await client.query("INSERT INTO night(event_id,name,display_order,kind) VALUES($1,'Awards',99,'AWARDS')", [event.id]);
    await seedActiveJudge({ client, eventId: event.id, nightId: night.id, specialtyId: activeSpecialty.id });
    const ready = await getReadiness({ client, eventId: event.id });
    assert.equal(ready.ready, true);
    await client.query("SAVEPOINT direct_ready_open");
    await assert.rejects(
      () => client.query("UPDATE carnival_event SET status='OPEN' WHERE id=$1", [event.id]),
      /EVENT_OPEN_REQUIRES_SERVICE/,
    );
    await client.query("ROLLBACK TO SAVEPOINT direct_ready_open");
    const opened = await openEvent({ client, eventId: event.id });
    assert.equal(opened.status, "OPEN");
    const deleteAttempts = [
      ["night", "event_id=$1", [event.id]],
      ["event_troupe", "event_id=$1", [event.id]],
      ["evaluation_item", "event_id=$1", [event.id]],
      ["rubric", "id=$1", [inactiveRubrics[0].id]],
    ];
    for (const [table, predicate, parameters] of deleteAttempts) {
      await client.query("SAVEPOINT locked_delete");
      await assert.rejects(
        () => client.query(`DELETE FROM ${table} WHERE ${predicate}`, parameters),
        /EVENT_LOCKED/,
      );
      await client.query("ROLLBACK TO SAVEPOINT locked_delete");
    }
    await client.query("SAVEPOINT reopen_event");
    await assert.rejects(
      () => client.query("UPDATE carnival_event SET status='CONFIGURING' WHERE id=$1", [event.id]),
      /EVENT_LOCKED/,
    );
    await client.query("ROLLBACK TO SAVEPOINT reopen_event");
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});

test("apertura y escrituras de configuración se serializan con el mismo bloqueo", { skip: !process.env.TEST_DATABASE_URL }, async (context) => {
  const original = process.env.DATABASE_URL;
  context.after(async () => {
    await closePool();
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
  });
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await migrate();

  const pool = getPool();
  const event = await createEvent({ name: "Ready concurrente" });
  await createNight({ eventId: event.id, name: "Noche", displayOrder: 1, kind: "COMPETITION" });
  const { rows: categories } = await pool.query(
    "INSERT INTO event_category(event_id,name,code,display_order) VALUES($1,'Cat','CAT_CONCURRENT',1) RETURNING id",
    [event.id],
  );
  await pool.query("INSERT INTO event_troupe(event_id,category_id,name) VALUES($1,$2,'Troupe')", [event.id, categories[0].id]);
  const { rows: specialties } = await pool.query(
    "INSERT INTO event_specialty(event_id,name,code,display_order) VALUES($1,'Spec','SPEC_CONCURRENT',1) RETURNING id",
    [event.id],
  );
  const { rows: rubrics } = await pool.query(
    "INSERT INTO rubric(event_id,name,code,evaluation_target) VALUES($1,'Completo','COMPLETE_CONCURRENT','TROUPE') RETURNING id",
    [event.id],
  );
  await pool.query(
    "INSERT INTO evaluation_item(event_id,rubric_id,specialty_id,name,code) VALUES($1,$2,$3,'Item','ITEM_CONCURRENT')",
    [event.id, rubrics[0].id, specialties[0].id],
  );

  const writer = await pool.connect();
  try {
    await writer.query("BEGIN");
    await writer.query(
      "INSERT INTO rubric(event_id,name,code,evaluation_target) VALUES($1,'Incompleto','INCOMPLETE_CONCURRENT','TROUPE')",
      [event.id],
    );

    let openingSettled = false;
    const opening = openEvent({ eventId: event.id }).then(
      (value) => { openingSettled = true; return { value }; },
      (error) => { openingSettled = true; return { error }; },
    );
    await delay(50);
    assert.equal(openingSettled, false, "la apertura debe esperar la transacción de configuración");

    await writer.query("COMMIT");
    const result = await opening;
    assert.equal(result.error?.message, "EVENT_CONFIGURATION_INCOMPLETE");
    assert.ok(result.error?.readiness.incompleteRubrics.some(({ code }) => code === "INCOMPLETE_CONCURRENT"));
    const stored = await pool.query("SELECT status FROM carnival_event WHERE id=$1", [event.id]);
    assert.equal(stored.rows[0].status, "CONFIGURING");
  } finally {
    await writer.query("ROLLBACK");
    writer.release();
  }
});
