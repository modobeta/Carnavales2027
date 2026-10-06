-- Keep the database opening guard aligned with event-readiness.service.js.
-- A direct status update must not bypass nomination readiness.
CREATE OR REPLACE FUNCTION guard_carnival_event_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'CLOSED' THEN
    RAISE EXCEPTION 'EVENT_LOCKED';
  END IF;

  IF OLD.status = 'OPEN' THEN
    IF NEW.status = 'CLOSED'
       AND NEW.name = OLD.name
       AND NEW.active IS NOT DISTINCT FROM OLD.active
       AND EXISTS (SELECT 1 FROM night WHERE event_id = OLD.id)
       AND NOT EXISTS (
         SELECT 1 FROM night WHERE event_id = OLD.id AND status <> 'CLOSED'
       ) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'EVENT_LOCKED';
  END IF;

  IF NEW.status = 'OPEN' AND OLD.status = 'CONFIGURING' AND (
    NOT EXISTS (SELECT 1 FROM night WHERE event_id = OLD.id AND kind = 'COMPETITION')
    OR NOT EXISTS (SELECT 1 FROM event_troupe WHERE event_id = OLD.id AND active)
    OR NOT EXISTS (SELECT 1 FROM event_specialty WHERE event_id = OLD.id AND active)
    OR NOT EXISTS (SELECT 1 FROM rubric WHERE event_id = OLD.id AND active)
    OR EXISTS (
      SELECT 1 FROM event_troupe t
      LEFT JOIN event_category c ON c.id = t.category_id
      WHERE t.event_id = OLD.id AND t.active AND (c.id IS NULL OR NOT c.active)
    )
    OR EXISTS (
      SELECT 1 FROM rubric r
      WHERE r.event_id = OLD.id AND r.active AND (
        NOT EXISTS (SELECT 1 FROM evaluation_item i WHERE i.rubric_id = r.id AND i.active)
        OR EXISTS (
          SELECT 1 FROM evaluation_item i
          JOIN event_specialty s ON s.id = i.specialty_id
          WHERE i.rubric_id = r.id AND i.active AND NOT s.active
        )
      )
    )
    OR EXISTS (
      SELECT 1
        FROM rubric r
        JOIN evaluation_item ei ON ei.rubric_id = r.id AND ei.active
        JOIN night_troupe_schedule nts ON nts.event_id = r.event_id AND nts.status = 'SCHEDULED'
        JOIN event_troupe et ON et.id = nts.event_troupe_id AND et.active
       WHERE r.event_id = OLD.id AND r.active AND r.evaluation_target = 'NOMINATION'
         AND NOT EXISTS (
           SELECT 1 FROM troupe_nomination tn
            WHERE tn.event_id = r.event_id
              AND tn.event_troupe_id = et.id
              AND tn.rubric_id = r.id
              AND tn.active
         )
    )
    OR EXISTS (
      SELECT 1 FROM night n
      WHERE n.event_id = OLD.id AND n.kind = 'COMPETITION'
        AND NOT EXISTS (
          SELECT 1 FROM night_troupe_schedule s
          WHERE s.event_id = n.event_id AND s.night_id = n.id AND s.status = 'SCHEDULED'
        )
    )
  ) THEN
    RAISE EXCEPTION 'EVENT_CONFIGURATION_INCOMPLETE';
  END IF;

  IF OLD.status = 'CONFIGURING' AND NEW.status NOT IN ('CONFIGURING', 'OPEN') THEN
    RAISE EXCEPTION 'EVENT_LOCKED';
  END IF;
  RETURN NEW;
END;
$$;

-- Validate the active nomination and its configured subject type when new
-- ballot evidence is created. Existing rows remain readable and untouched.
CREATE OR REPLACE FUNCTION validate_ballot_score_integrity()
RETURNS TRIGGER AS $$
DECLARE
  ballot_status TEXT;
  ballot_specialty UUID;
  ballot_night UUID;
  item_specialty UUID;
  item_rubric UUID;
  rubric_target TEXT;
  expected_subject_type TEXT;
  schedule_night UUID;
  schedule_troupe UUID;
  nomination_event UUID;
  nomination_troupe UUID;
  nomination_rubric UUID;
  nomination_subject_type TEXT;
  nomination_active BOOLEAN;
BEGIN
  SELECT b.status, b.specialty_id, b.night_id
    INTO ballot_status, ballot_specialty, ballot_night
    FROM ballot b
   WHERE b.id = NEW.ballot_id AND b.event_id = NEW.event_id;
  IF ballot_status IS NULL THEN
    RAISE EXCEPTION 'INVALID_BALLOT_REFERENCE';
  END IF;

  SELECT ei.specialty_id, ei.rubric_id, r.evaluation_target, r.expected_subject_type
    INTO item_specialty, item_rubric, rubric_target, expected_subject_type
    FROM evaluation_item ei
    JOIN rubric r ON r.id = ei.rubric_id AND r.event_id = ei.event_id
   WHERE ei.id = NEW.evaluation_item_id AND ei.event_id = NEW.event_id;
  IF item_specialty IS DISTINCT FROM ballot_specialty THEN
    RAISE EXCEPTION 'BALLOT_SCORE_SPECIALTY_MISMATCH';
  END IF;
  IF item_rubric IS DISTINCT FROM NEW.rubric_id THEN
    RAISE EXCEPTION 'BALLOT_SCORE_RUBRIC_MISMATCH';
  END IF;

  SELECT nts.night_id, nts.event_troupe_id
    INTO schedule_night, schedule_troupe
    FROM night_troupe_schedule nts
   WHERE nts.id = NEW.night_schedule_id AND nts.event_id = NEW.event_id;
  IF schedule_night IS DISTINCT FROM ballot_night THEN
    RAISE EXCEPTION 'BALLOT_SCORE_NIGHT_MISMATCH';
  END IF;

  IF NEW.nomination_id IS NULL AND rubric_target = 'NOMINATION' AND TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'BALLOT_SCORE_NOMINATION_REQUIRED';
  ELSIF NEW.nomination_id IS NOT NULL THEN
    SELECT tn.event_id, tn.event_troupe_id, tn.rubric_id, tn.subject_type, tn.active
      INTO nomination_event, nomination_troupe, nomination_rubric, nomination_subject_type, nomination_active
      FROM troupe_nomination tn
     WHERE tn.id = NEW.nomination_id;
    IF rubric_target IS DISTINCT FROM 'NOMINATION'
       OR nomination_event IS DISTINCT FROM NEW.event_id
       OR nomination_troupe IS DISTINCT FROM schedule_troupe
       OR nomination_rubric IS DISTINCT FROM NEW.rubric_id THEN
      RAISE EXCEPTION 'BALLOT_SCORE_NOMINATION_MISMATCH';
    END IF;
    IF TG_OP = 'INSERT'
       AND (nomination_active IS DISTINCT FROM TRUE
         OR nomination_subject_type IS DISTINCT FROM expected_subject_type) THEN
      RAISE EXCEPTION 'BALLOT_SCORE_NOMINATION_MISMATCH';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.nomination_id IS DISTINCT FROM OLD.nomination_id THEN
    RAISE EXCEPTION 'BALLOT_SCORE_NOMINATION_IMMUTABLE';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'DRAFT' AND ballot_status = 'SUBMITTED'
     AND (NEW.status IS DISTINCT FROM 'LOCKED'
       OR NEW.score IS DISTINCT FROM OLD.score
       OR NEW.requires_subsanation IS DISTINCT FROM OLD.requires_subsanation
       OR NEW.subsidized_score IS DISTINCT FROM OLD.subsidized_score) THEN
    RAISE EXCEPTION 'BALLOT_SCORE_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
