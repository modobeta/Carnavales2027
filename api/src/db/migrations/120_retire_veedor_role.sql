-- Retire VEEDOR as an operational role while preserving user/profile and invitation evidence.
CREATE TEMP TABLE retired_veedor_users ON COMMIT DROP AS
SELECT user_id
  FROM user_role
 WHERE role_code = 'VEEDOR'
UNION
SELECT op.user_id
  FROM operational_profile op
  JOIN operational_profile_role opr ON opr.operational_profile_id = op.id
 WHERE opr.role_code = 'VEEDOR' AND op.user_id IS NOT NULL;

-- Better Auth owns session schema/migrations; invalidate existing observer sessions if present.
DO $$
BEGIN
  IF to_regclass('public.session') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'session' AND column_name = 'userId'
     ) THEN
    EXECUTE 'DELETE FROM public.session WHERE "userId" IN (SELECT user_id FROM retired_veedor_users)';
  END IF;
END;
$$;

UPDATE role_invitation
   SET status = 'REVOKED', revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP),
       acceptance_claim_id = NULL, acceptance_claimed_at = NULL
 WHERE role_code = 'VEEDOR' AND status = 'PENDING';

UPDATE operational_invitation oi
   SET status = 'REVOKED', revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP),
       revoked_by = COALESCE(revoked_by, oi.created_by),
       acceptance_claim_id = NULL, acceptance_claimed_at = NULL
  FROM operational_profile op
 WHERE oi.operational_profile_id = op.id
   AND oi.status = 'PENDING'
   AND EXISTS (
     SELECT 1 FROM operational_profile_role opr
      WHERE opr.operational_profile_id = op.id AND opr.role_code = 'VEEDOR'
   )
   AND NOT EXISTS (
     SELECT 1 FROM operational_profile_role opr
      WHERE opr.operational_profile_id = op.id AND opr.role_code <> 'VEEDOR'
   );

DELETE FROM user_role WHERE role_code = 'VEEDOR';
DELETE FROM operational_profile_role WHERE role_code = 'VEEDOR';

-- role_invitation keeps a foreign key to app_role for old, already-used invitations.
UPDATE app_role
   SET description = 'Rol retirado; conservado solo para referencias históricas'
 WHERE code = 'VEEDOR';

CREATE OR REPLACE FUNCTION reject_retired_veedor_role()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.role_code = 'VEEDOR' THEN
    RAISE EXCEPTION 'ROLE_RETIRED';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reject_retired_user_role ON user_role;
CREATE TRIGGER reject_retired_user_role
BEFORE INSERT OR UPDATE OF role_code ON user_role
FOR EACH ROW EXECUTE FUNCTION reject_retired_veedor_role();

DROP TRIGGER IF EXISTS reject_retired_profile_role ON operational_profile_role;
CREATE TRIGGER reject_retired_profile_role
BEFORE INSERT OR UPDATE OF role_code ON operational_profile_role
FOR EACH ROW EXECUTE FUNCTION reject_retired_veedor_role();

DROP TRIGGER IF EXISTS reject_retired_role_invitation ON role_invitation;
CREATE TRIGGER reject_retired_role_invitation
BEFORE INSERT OR UPDATE OF role_code ON role_invitation
FOR EACH ROW EXECUTE FUNCTION reject_retired_veedor_role();
