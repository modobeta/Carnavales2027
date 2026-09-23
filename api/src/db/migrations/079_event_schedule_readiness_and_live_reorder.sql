-- No abrir eventos con jornadas competitivas sin comparsas programadas.
-- En eventos OPEN solo se corrige el tramo que aún no comenzó.
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
    RAISE EXCEPTION 'EVENT_LOCKED';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
