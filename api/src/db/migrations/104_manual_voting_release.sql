ALTER TABLE night
  ADD COLUMN voting_release_mode TEXT NOT NULL DEFAULT 'ALL'
    CHECK (voting_release_mode IN ('MANUAL', 'ALL')),
  ADD COLUMN active_schedule_id UUID;

-- The ADD COLUMN default preserves all existing nights without updating rows
-- through operational night guards. New nights default to MANUAL.
ALTER TABLE night ALTER COLUMN voting_release_mode SET DEFAULT 'MANUAL';

ALTER TABLE night_troupe_schedule
  ADD COLUMN release_order INTEGER CHECK (release_order IS NULL OR release_order > 0),
  ADD CONSTRAINT schedule_id_night_event_unique UNIQUE (id, night_id, event_id);

CREATE UNIQUE INDEX schedule_release_order_unique
  ON night_troupe_schedule (night_id, release_order)
  WHERE release_order IS NOT NULL;

ALTER TABLE night
  ADD CONSTRAINT night_active_schedule_fk
    FOREIGN KEY (active_schedule_id, id, event_id)
    REFERENCES night_troupe_schedule (id, night_id, event_id)
    ON DELETE RESTRICT;

-- Existing voting windows keep their previous behavior and remain writable.
UPDATE night_troupe_schedule s
   SET release_order = s.presentation_order
  FROM voting_window w
 WHERE w.night_id = s.night_id
   AND w.event_id = s.event_id
   AND w.status = 'OPEN'
   AND s.status = 'SCHEDULED';

CREATE FUNCTION guard_manual_voting_release()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  current_mode TEXT;
  current_schedule UUID;
BEGIN
  IF NEW.evaluation_state = OLD.evaluation_state
     OR NEW.evaluation_state NOT IN ('SCORED', 'NOT_PRESENTED') THEN
    RETURN NEW;
  END IF;

  SELECT n.voting_release_mode, n.active_schedule_id
    INTO current_mode, current_schedule
    FROM night n
    JOIN ballot b ON b.night_id = n.id AND b.event_id = n.event_id
   WHERE b.id = NEW.ballot_id;

  IF current_mode = 'MANUAL' AND current_schedule IS DISTINCT FROM NEW.night_schedule_id THEN
    RAISE EXCEPTION 'TROUPE_NOT_RELEASED';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER ballot_score_manual_release_guard
BEFORE UPDATE OF evaluation_state ON ballot_score
FOR EACH ROW EXECUTE FUNCTION guard_manual_voting_release();
