-- Spec 027/E1: preserve historical rubric classifications (GENERAL, CALCULATED, SPECIAL)
-- from 066_competition_module.sql while documenting that new rubrics must use
-- NOMINATIVE or RANDOM under the current 2027 regulation. Existing rows keep
-- their legacy value; the check constraint is only enforced on INSERT/UPDATE so
-- migrations and historical data remain compatible without silent remapping.
--
-- This migration intentionally does NOT remove legacy values from the domain.
-- Any future transition must be approved and applied as an explicit data move.
ALTER TABLE rubric
  DROP CONSTRAINT IF EXISTS rubric_rubric_type_check,
  ADD CONSTRAINT rubric_rubric_type_check
    CHECK (rubric_type IN ('NOMINATIVE', 'RANDOM', 'GENERAL', 'CALCULATED', 'SPECIAL'));

COMMENT ON COLUMN rubric.rubric_type IS
  'Classification of the rubric. Current 2027 regulation creates NOMINATIVE (participates in Best Troupe) or RANDOM (awarded separately). Legacy values GENERAL, CALCULATED and SPECIAL are preserved for historical rubrics and remain interoperable; do not silently remap them.';
