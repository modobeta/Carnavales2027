ALTER TABLE carnival_event
  DROP CONSTRAINT carnival_event_status_check;

ALTER TABLE carnival_event
  ADD CONSTRAINT carnival_event_status_check
  CHECK (status IN ('CONFIGURING', 'OPEN', 'CLOSED'));

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
    NOT EXISTS (
      SELECT 1 FROM night
       WHERE event_id = OLD.id AND kind = 'COMPETITION'
    )
    OR NOT EXISTS (
      SELECT 1 FROM event_troupe
       WHERE event_id = OLD.id AND active
    )
    OR NOT EXISTS (
      SELECT 1 FROM event_specialty
       WHERE event_id = OLD.id AND active
    )
    OR NOT EXISTS (
      SELECT 1 FROM rubric
       WHERE event_id = OLD.id AND active
    )
    OR EXISTS (
      SELECT 1
        FROM event_troupe t
        LEFT JOIN event_category c ON c.id = t.category_id
       WHERE t.event_id = OLD.id
         AND t.active
         AND (c.id IS NULL OR NOT c.active)
    )
    OR EXISTS (
      SELECT 1
        FROM rubric r
       WHERE r.event_id = OLD.id
         AND r.active
         AND (
           NOT EXISTS (
             SELECT 1 FROM evaluation_item i
              WHERE i.rubric_id = r.id AND i.active
           )
           OR EXISTS (
             SELECT 1
               FROM evaluation_item i
               JOIN event_specialty s ON s.id = i.specialty_id
              WHERE i.rubric_id = r.id
                AND i.active
                AND NOT s.active
           )
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

CREATE OR REPLACE FUNCTION require_night_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  event_status TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT status INTO event_status FROM carnival_event WHERE id = OLD.event_id FOR UPDATE;
    IF event_status IS DISTINCT FROM 'CONFIGURING' THEN
      RAISE EXCEPTION 'EVENT_LOCKED';
    END IF;
    RETURN OLD;
  END IF;

  SELECT status INTO event_status FROM carnival_event WHERE id = NEW.event_id FOR UPDATE;
  IF event_status IS NULL THEN
    RAISE EXCEPTION 'EVENT_NOT_FOUND';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF event_status IS DISTINCT FROM 'CONFIGURING' THEN
      RAISE EXCEPTION 'EVENT_LOCKED';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.event_id IS DISTINCT FROM NEW.event_id THEN
    RAISE EXCEPTION 'EVENT_REASSIGNMENT_FORBIDDEN';
  END IF;
  IF OLD.status = 'CLOSED' THEN
    RAISE EXCEPTION 'NIGHT_CLOSED';
  END IF;
  IF event_status = 'CONFIGURING' THEN
    IF NEW.status NOT IN ('DRAFT', 'OPEN', 'CLOSED') THEN
      RAISE EXCEPTION 'INVALID_NIGHT_STATUS';
    END IF;
    RETURN NEW;
  END IF;

  IF event_status = 'OPEN'
     AND NEW.name = OLD.name
     AND NEW.display_order = OLD.display_order
     AND NEW.event_date IS NOT DISTINCT FROM OLD.event_date
     AND NEW.kind = OLD.kind THEN
    IF OLD.status = 'OPEN' AND NEW.status = 'CLOSED' THEN
      RETURN NEW;
    END IF;
    IF OLD.status = 'DRAFT' AND NEW.status = 'CLOSED' AND OLD.kind = 'AWARDS' THEN
      RETURN NEW;
    END IF;
    IF OLD.status = 'DRAFT' AND NEW.status = 'OPEN' THEN
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION 'EVENT_LOCKED';
END;
$$;
