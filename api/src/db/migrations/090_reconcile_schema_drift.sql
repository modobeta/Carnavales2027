-- 090 reconcile schema drift detected in seeded/restored databases where some
-- migrations are recorded applied in schema_migrations but their DDL effects
-- are missing. Confirmed missing: 072 (deferrable schedule order constraint)
-- and 073 (permissive event-delete policy). This migration is idempotent and
-- safe to run when the effects are already present, so it is a no-op on a
-- database that already applied 072/073/074/079 correctly.

-- 072_schedule_order_deferrable: the schedule reorder flow relies on
-- SET CONSTRAINTS ... DEFERRED, so the constraint must be deferrable.
DO $$
DECLARE
  v_deferrable boolean;
BEGIN
  SELECT condeferrable INTO v_deferrable
    FROM pg_constraint
   WHERE conname = 'schedule_night_order_unique'
     AND conrelid = 'public.night_troupe_schedule'::regclass;

  IF v_deferrable IS TRUE THEN
    RETURN;
  END IF;

  IF v_deferrable IS NOT NULL THEN
    ALTER TABLE night_troupe_schedule DROP CONSTRAINT schedule_night_order_unique;
  END IF;

  ALTER TABLE night_troupe_schedule
    ADD CONSTRAINT schedule_night_order_unique
      UNIQUE (night_id, presentation_order) DEFERRABLE INITIALLY IMMEDIATE;
END $$;

-- 074/079_schedule_reorder_guard: restore the permissive reorder guard that
-- replaced the blanket schedule_requires_configuring_event veto from 019. The
-- trigger swap from 074 is missing in drifted databases, leaving OPEN events
-- unable to reorder (EVENT_LOCKED). 079 refined the function with the frozen
-- prefix rule; recreate both the function and the trigger.
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

DROP TRIGGER IF EXISTS schedule_requires_configuring_event ON night_troupe_schedule;
DROP TRIGGER IF EXISTS schedule_reorder_guard ON night_troupe_schedule;
CREATE TRIGGER schedule_reorder_guard
BEFORE INSERT OR UPDATE OR DELETE ON night_troupe_schedule
FOR EACH ROW EXECUTE FUNCTION schedule_reorder_guard();

-- 073_event_delete_policy: restore the specific delete guards that replaced the
-- blanket prevent_carnival_event_delete() block from 017.
CREATE OR REPLACE FUNCTION prevent_carnival_event_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM ballot WHERE event_id = OLD.id) THEN
    RAISE EXCEPTION 'EVENT_HAS_BALLOTS';
  END IF;
  IF EXISTS (SELECT 1 FROM judge_assignment WHERE event_id = OLD.id) THEN
    RAISE EXCEPTION 'EVENT_HAS_ASSIGNMENTS';
  END IF;
  IF EXISTS (SELECT 1 FROM judge_quota WHERE event_id = OLD.id) THEN
    RAISE EXCEPTION 'EVENT_HAS_QUOTAS';
  END IF;
  IF EXISTS (SELECT 1 FROM troupe_penalty WHERE event_id = OLD.id) THEN
    RAISE EXCEPTION 'EVENT_HAS_PENALTIES';
  END IF;
  IF EXISTS (SELECT 1 FROM official_scrutiny_record WHERE event_id = OLD.id) THEN
    RAISE EXCEPTION 'EVENT_HAS_SCRUTINY_RECORD';
  END IF;
  IF EXISTS (SELECT 1 FROM results_release WHERE event_id = OLD.id) THEN
    RAISE EXCEPTION 'EVENT_HAS_RESULTS';
  END IF;
  IF EXISTS (SELECT 1 FROM results_snapshot WHERE event_id = OLD.id) THEN
    RAISE EXCEPTION 'EVENT_HAS_RESULTS';
  END IF;
  RETURN OLD;
END;
$$;
