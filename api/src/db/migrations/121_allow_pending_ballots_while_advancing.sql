CREATE OR REPLACE FUNCTION guard_manual_voting_release()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  current_mode TEXT;
  current_release_order INTEGER;
  current_window_status TEXT;
BEGIN
  IF NEW.evaluation_state = OLD.evaluation_state
     OR NEW.evaluation_state NOT IN ('SCORED', 'NOT_PRESENTED') THEN
    RETURN NEW;
  END IF;

  SELECT n.voting_release_mode, nts.release_order, w.status
    INTO current_mode, current_release_order, current_window_status
    FROM night n
    JOIN ballot b ON b.night_id = n.id AND b.event_id = n.event_id
    JOIN night_troupe_schedule nts
      ON nts.id = NEW.night_schedule_id
     AND nts.night_id = n.id
     AND nts.event_id = n.event_id
    LEFT JOIN voting_window w ON w.night_id = n.id AND w.event_id = n.event_id
   WHERE b.id = NEW.ballot_id;

  IF current_mode = 'MANUAL' AND current_window_status = 'OPEN'
     AND current_release_order IS NULL THEN
    RAISE EXCEPTION 'TROUPE_NOT_RELEASED';
  END IF;

  RETURN NEW;
END;
$$;
