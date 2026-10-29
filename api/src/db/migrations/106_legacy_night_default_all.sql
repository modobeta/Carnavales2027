-- Keep direct legacy writers compatible; application-created nights set
-- MANUAL explicitly in createNight().
ALTER TABLE night ALTER COLUMN voting_release_mode SET DEFAULT 'ALL';
