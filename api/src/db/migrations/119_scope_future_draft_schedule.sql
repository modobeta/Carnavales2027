CREATE OR REPLACE FUNCTION schedule_reorder_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  current_status TEXT;
  frozen_through INTEGER;
BEGIN
  SELECT status INTO current_status
    FROM carnival_event
   WHERE id = COALESCE(NEW.event_id, OLD.event_id)
     FOR UPDATE;

  IF current_status IS DISTINCT FROM 'CONFIGURING' AND current_status IS DISTINCT FROM 'OPEN' THEN
    RAISE EXCEPTION 'EVENT_LOCKED';
  END IF;

  IF TG_OP = 'UPDATE'
     AND current_status = 'OPEN'
     AND (OLD.event_id IS DISTINCT FROM NEW.event_id
       OR OLD.night_id IS DISTINCT FROM NEW.night_id
       OR OLD.event_troupe_id IS DISTINCT FROM NEW.event_troupe_id
       OR OLD.status IS DISTINCT FROM NEW.status) THEN
    RAISE EXCEPTION 'EVENT_LOCKED';
  END IF;

  IF TG_OP = 'UPDATE' AND current_status = 'OPEN'
     AND OLD.presentation_order IS DISTINCT FROM NEW.presentation_order THEN
    SELECT GREATEST(
      COALESCE((
        SELECT MAX(s.presentation_order)
          FROM night_troupe_schedule s
         WHERE s.event_id = OLD.event_id AND s.night_id = OLD.night_id
           AND EXISTS (
             SELECT 1 FROM ballot b
             JOIN ballot_score bs ON bs.ballot_id = b.id
             WHERE b.event_id = s.event_id AND b.night_id = s.night_id
               AND b.status <> 'REPLACED' AND bs.night_schedule_id = s.id
               AND bs.evaluation_state <> 'PENDING'
           )
      ), 0),
      COALESCE((
        SELECT MIN(s.presentation_order)
          FROM night_troupe_schedule s
         WHERE s.event_id = OLD.event_id AND s.night_id = OLD.night_id
           AND EXISTS (
             SELECT 1 FROM ballot b
             JOIN ballot_score bs ON bs.ballot_id = b.id
             WHERE b.event_id = s.event_id AND b.night_id = s.night_id
               AND b.status <> 'REPLACED' AND bs.night_schedule_id = s.id
               AND bs.evaluation_state = 'PENDING'
           )
      ), 0)
    )::INTEGER INTO frozen_through;
    IF OLD.presentation_order <= frozen_through OR NEW.presentation_order <= frozen_through THEN
      RAISE EXCEPTION 'NIGHT_REORDER_STARTED_TROUPES';
    END IF;
  END IF;

  IF TG_OP <> 'UPDATE' AND current_status IS DISTINCT FROM 'CONFIGURING' THEN
    IF TG_OP = 'INSERT' AND current_status = 'OPEN'
       AND current_setting('app.allow_future_draft_night_schedule', true) = 'true'
       AND EXISTS (SELECT 1 FROM night WHERE id = NEW.night_id AND event_id = NEW.event_id AND status = 'DRAFT') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'EVENT_LOCKED';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
