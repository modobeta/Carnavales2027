-- Preserve troupe-level voting only for nomination scopes that were already OPEN
-- without nominees at the moment this migration runs. Never invent participant identities.
CREATE TABLE legacy_nomination_scope (
  event_id UUID NOT NULL REFERENCES carnival_event(id) ON DELETE RESTRICT,
  rubric_id UUID NOT NULL REFERENCES rubric(id) ON DELETE RESTRICT,
  event_troupe_id UUID NOT NULL REFERENCES event_troupe(id) ON DELETE RESTRICT,
  PRIMARY KEY (event_id, rubric_id, event_troupe_id)
);

INSERT INTO legacy_nomination_scope (event_id, rubric_id, event_troupe_id)
SELECT DISTINCT e.id, r.id, et.id
  FROM carnival_event e
  JOIN rubric r ON r.event_id=e.id AND r.active AND r.evaluation_target='NOMINATION'
  JOIN night_troupe_schedule s ON s.event_id=e.id AND s.status='SCHEDULED'
  JOIN event_troupe et ON et.id=s.event_troupe_id AND et.active
 WHERE e.status='OPEN'
   AND NOT EXISTS (
      SELECT 1 FROM troupe_nomination tn
       WHERE tn.event_id=e.id AND tn.rubric_id=r.id
         AND tn.event_troupe_id=et.id AND tn.active
   );

CREATE OR REPLACE FUNCTION prevent_legacy_nomination_scope_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'LEGACY_NOMINATION_SCOPE_IMMUTABLE';
END;
$$;
CREATE TRIGGER legacy_nomination_scope_immutable
BEFORE UPDATE OR DELETE ON legacy_nomination_scope
FOR EACH ROW EXECUTE FUNCTION prevent_legacy_nomination_scope_change();

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

  IF NEW.nomination_id IS NULL AND rubric_target = 'NOMINATION' AND TG_OP = 'INSERT'
     AND NOT EXISTS (
       SELECT 1 FROM legacy_nomination_scope l
       WHERE l.event_id = NEW.event_id AND l.rubric_id = NEW.rubric_id
         AND l.event_troupe_id = schedule_troupe
     ) THEN
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
