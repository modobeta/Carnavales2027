ALTER TABLE ballot_score
  ADD COLUMN nomination_id UUID REFERENCES troupe_nomination(id) ON DELETE RESTRICT;

ALTER TABLE ballot_score
  DROP CONSTRAINT ballot_score_one_per_item_schedule;

CREATE UNIQUE INDEX ballot_score_one_per_item_schedule_troupe_idx
  ON ballot_score (ballot_id, evaluation_item_id, night_schedule_id)
  WHERE nomination_id IS NULL;

CREATE UNIQUE INDEX ballot_score_one_per_item_schedule_nomination_idx
  ON ballot_score (ballot_id, evaluation_item_id, night_schedule_id, nomination_id)
  WHERE nomination_id IS NOT NULL;

CREATE INDEX ballot_score_nomination_idx ON ballot_score (nomination_id);

CREATE OR REPLACE FUNCTION validate_ballot_score_integrity()
RETURNS trigger AS $$
DECLARE
  ballot_status TEXT;
  ballot_specialty UUID;
  ballot_night UUID;
  item_specialty UUID;
  item_rubric UUID;
  rubric_target TEXT;
  schedule_night UUID;
  schedule_troupe UUID;
  nomination_event UUID;
  nomination_troupe UUID;
  nomination_rubric UUID;
BEGIN
  SELECT b.status, b.specialty_id, b.night_id
    INTO ballot_status, ballot_specialty, ballot_night
    FROM ballot b
   WHERE b.id = NEW.ballot_id AND b.event_id = NEW.event_id;
  IF ballot_status IS NULL THEN
    RAISE EXCEPTION 'INVALID_BALLOT_REFERENCE';
  END IF;

  SELECT ei.specialty_id, ei.rubric_id, r.evaluation_target
    INTO item_specialty, item_rubric, rubric_target
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
    SELECT tn.event_id, tn.event_troupe_id, tn.rubric_id
      INTO nomination_event, nomination_troupe, nomination_rubric
      FROM troupe_nomination tn
     WHERE tn.id = NEW.nomination_id;
    IF rubric_target IS DISTINCT FROM 'NOMINATION'
       OR nomination_event IS DISTINCT FROM NEW.event_id
       OR nomination_troupe IS DISTINCT FROM schedule_troupe
       OR nomination_rubric IS DISTINCT FROM NEW.rubric_id THEN
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
