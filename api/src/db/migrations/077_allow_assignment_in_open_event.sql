-- Permite asignar jurados directamente en un evento en curso (OPEN)
-- si existe vacancia, sin requerir replaced_assignment_id.
CREATE OR REPLACE FUNCTION protect_judge_assignment()
RETURNS trigger AS $$
DECLARE
  event_status TEXT;
  night_kind TEXT;
  night_status TEXT;
  specialty_active BOOLEAN;
  judge_status TEXT;
  quota_limit INTEGER;
  active_assignments INTEGER;
  replaced_status TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'JUDGE_ASSIGNMENT_DELETE_FORBIDDEN';
  END IF;

  IF TG_OP = 'UPDATE' AND (
    NEW.event_id IS DISTINCT FROM OLD.event_id
    OR NEW.night_id IS DISTINCT FROM OLD.night_id
    OR NEW.specialty_id IS DISTINCT FROM OLD.specialty_id
    OR NEW.judge_profile_id IS DISTINCT FROM OLD.judge_profile_id
    OR NEW.assignment_type IS DISTINCT FROM OLD.assignment_type
    OR NEW.replaced_assignment_id IS DISTINCT FROM OLD.replaced_assignment_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'JUDGE_ASSIGNMENT_HISTORY_IMMUTABLE';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'REVOKED' THEN
    RAISE EXCEPTION 'JUDGE_ASSIGNMENT_FINAL';
  END IF;

  SELECT e.status, n.kind, n.status, s.active
    INTO event_status, night_kind, night_status, specialty_active
    FROM carnival_event e
    JOIN night n ON n.id = NEW.night_id AND n.event_id = NEW.event_id
    JOIN event_specialty s ON s.id = NEW.specialty_id AND s.event_id = NEW.event_id
   WHERE e.id = NEW.event_id;
  IF event_status IS NULL THEN
    RAISE EXCEPTION 'INVALID_ASSIGNMENT_REFERENCE';
  END IF;
  IF night_kind <> 'COMPETITION' THEN
    RAISE EXCEPTION 'JUDGE_ASSIGNMENT_COMPETITION_ONLY';
  END IF;
  IF night_status = 'CLOSED' THEN
    RAISE EXCEPTION 'NIGHT_CLOSED';
  END IF;

  IF NEW.status = 'ACTIVE' THEN
    IF event_status NOT IN ('CONFIGURING', 'OPEN') THEN
      RAISE EXCEPTION 'JUDGE_ASSIGNMENT_OPEN_REQUIRES_REPLACEMENT';
    END IF;
    IF NOT specialty_active THEN
      RAISE EXCEPTION 'SPECIALTY_INACTIVE';
    END IF;

    SELECT registration_status INTO judge_status
      FROM judge_profile WHERE id = NEW.judge_profile_id;
    IF judge_status IS DISTINCT FROM 'REGISTERED' THEN
      RAISE EXCEPTION 'JUDGE_NOT_ASSIGNABLE';
    END IF;

    SELECT max_assignments INTO quota_limit
      FROM judge_quota
     WHERE night_id = NEW.night_id AND specialty_id = NEW.specialty_id
     FOR UPDATE;
    IF quota_limit IS NULL THEN
      RAISE EXCEPTION 'JUDGE_QUOTA_REQUIRED';
    END IF;
    SELECT count(*)::INTEGER INTO active_assignments
      FROM judge_assignment
     WHERE night_id = NEW.night_id
       AND specialty_id = NEW.specialty_id
       AND status = 'ACTIVE';
    IF active_assignments >= quota_limit THEN
      RAISE EXCEPTION 'JUDGE_QUOTA_FULL';
    END IF;

    IF NEW.replaced_assignment_id IS NOT NULL THEN
      SELECT status INTO replaced_status
        FROM judge_assignment
       WHERE id = NEW.replaced_assignment_id
         AND event_id = NEW.event_id
         AND night_id = NEW.night_id
         AND specialty_id = NEW.specialty_id;
      IF replaced_status IS DISTINCT FROM 'REVOKED' THEN
        RAISE EXCEPTION 'INVALID_REPLACEMENT';
      END IF;
    END IF;
  ELSIF NEW.status = 'REVOKED' THEN
    IF NEW.revoked_at IS NULL OR NEW.revoked_by IS NULL OR length(trim(coalesce(NEW.reason, ''))) = 0 THEN
      RAISE EXCEPTION 'REVOCATION_REASON_REQUIRED';
    END IF;
    IF event_status NOT IN ('CONFIGURING', 'OPEN') THEN
      RAISE EXCEPTION 'EVENT_LOCKED';
    END IF;
  ELSE
    RAISE EXCEPTION 'INVALID_JUDGE_ASSIGNMENT_STATUS';
  END IF;

  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
