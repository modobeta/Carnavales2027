CREATE OR REPLACE FUNCTION prevent_last_admin_removal()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  remaining_admin_count INTEGER;
  primary_admin_id TEXT;
BEGIN
  IF OLD.role_code = 'ADMIN' THEN
    PERFORM pg_advisory_xact_lock(hashtext('carnavales2027_v2_last_admin'));

    SELECT initial_admin_user_id INTO primary_admin_id
    FROM bootstrap_state
    WHERE singleton = true;

    IF OLD.user_id = primary_admin_id THEN
      RAISE EXCEPTION 'PRIMARY_ADMIN_PROTECTED';
    END IF;

    IF TG_OP = 'DELETE' THEN
      SELECT COUNT(*) INTO remaining_admin_count
      FROM user_role
      WHERE role_code = 'ADMIN'
        AND user_id <> OLD.user_id;

      IF remaining_admin_count = 0 THEN
        RAISE EXCEPTION 'LAST_ADMIN_REQUIRED';
      END IF;
    ELSIF NEW.role_code <> 'ADMIN' OR NEW.user_id <> OLD.user_id THEN
      SELECT COUNT(*) INTO remaining_admin_count
      FROM user_role
      WHERE role_code = 'ADMIN'
        AND user_id <> OLD.user_id;

      IF remaining_admin_count = 0 THEN
        RAISE EXCEPTION 'LAST_ADMIN_REQUIRED';
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_primary_admin_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  primary_admin_id TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('carnavales2027_v2_last_admin'));
  SELECT initial_admin_user_id INTO primary_admin_id
  FROM bootstrap_state
  WHERE singleton = true;

  IF OLD.id = primary_admin_id THEN
    RAISE EXCEPTION 'PRIMARY_ADMIN_PROTECTED';
  END IF;

  RETURN OLD;
END;
$$;

CREATE TRIGGER user_prevent_primary_admin_deletion
BEFORE DELETE ON "user"
FOR EACH ROW
EXECUTE FUNCTION prevent_primary_admin_deletion();
