CREATE OR REPLACE FUNCTION validate_ballot_score_integrity()
RETURNS trigger AS $$
DECLARE
  ballot_status TEXT;
  ballot_specialty UUID;
  ballot_night UUID;
  item_rubric UUID;
  schedule_night UUID;
BEGIN
  SELECT b.status, b.specialty_id, b.night_id
    INTO ballot_status, ballot_specialty, ballot_night
    FROM ballot b
   WHERE b.id = NEW.ballot_id AND b.event_id = NEW.event_id;
  IF ballot_status IS NULL THEN
    RAISE EXCEPTION 'INVALID_BALLOT_REFERENCE';
  END IF;

  SELECT rubric_id INTO item_rubric
    FROM evaluation_item
   WHERE id = NEW.evaluation_item_id AND event_id = NEW.event_id;
  IF NOT EXISTS (
    SELECT 1 FROM evaluation_item_specialty
     WHERE evaluation_item_id=NEW.evaluation_item_id
       AND event_id=NEW.event_id AND specialty_id=ballot_specialty
  ) THEN
    RAISE EXCEPTION 'BALLOT_SCORE_SPECIALTY_MISMATCH';
  END IF;
  IF item_rubric IS DISTINCT FROM NEW.rubric_id THEN
    RAISE EXCEPTION 'BALLOT_SCORE_RUBRIC_MISMATCH';
  END IF;

  SELECT night_id INTO schedule_night
    FROM night_troupe_schedule
   WHERE id = NEW.night_schedule_id AND event_id = NEW.event_id;
  IF schedule_night IS DISTINCT FROM ballot_night THEN
    RAISE EXCEPTION 'BALLOT_SCORE_NIGHT_MISMATCH';
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
