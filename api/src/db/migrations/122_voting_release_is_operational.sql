-- Putting a troupe on the runway is an operational marker, not permission to vote.
-- Judges may score any scheduled troupe in their open ballot; ballot completeness
-- and submission checks remain enforced by the API and database constraints.
DROP TRIGGER IF EXISTS ballot_score_manual_release_guard ON ballot_score;
DROP FUNCTION IF EXISTS guard_manual_voting_release();
