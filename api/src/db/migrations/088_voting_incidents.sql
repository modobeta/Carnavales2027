-- Migración 088: Registro de Incidencias Operativas (Veeduría / Supervisión)
-- Permite registrar, categorizar y dar seguimiento a incidencias durante la jornada.

CREATE TABLE voting_incident (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES carnival_event(id) ON DELETE RESTRICT,
  night_id UUID NOT NULL,
  event_troupe_id UUID,
  judge_profile_id UUID REFERENCES judge_profile(id) ON DELETE RESTRICT,
  ballot_id UUID,
  incident_type TEXT NOT NULL CHECK (incident_type IN (
    'INCOMPLETE_BALLOT',
    'UNSCORED_ITEM',
    'ERROR_OMISSION',
    'ABSENT_PARTICIPANT_SCORED',
    'SYNC_FAILURE',
    'PROCEDURE_BREACH',
    'OBSERVATION',
    'OTHER'
  )),
  description TEXT NOT NULL CHECK (length(trim(description)) > 0),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN (
    'OPEN',
    'NOTIFIED',
    'IN_SUBSANATION',
    'RESOLVED',
    'ESCALATED'
  )),
  reported_by_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  resolution_notes TEXT,
  resolved_by_user_id TEXT REFERENCES "user"(id) ON DELETE RESTRICT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT voting_incident_night_event_fk
    FOREIGN KEY (night_id, event_id) REFERENCES night(id, event_id) ON DELETE RESTRICT,
  CONSTRAINT voting_incident_troupe_event_fk
    FOREIGN KEY (event_troupe_id, event_id) REFERENCES event_troupe(id, event_id) ON DELETE RESTRICT,
  CONSTRAINT voting_incident_ballot_event_fk
    FOREIGN KEY (ballot_id, event_id) REFERENCES ballot(id, event_id) ON DELETE RESTRICT,
  CONSTRAINT voting_incident_resolution_consistency CHECK (
    (status <> 'RESOLVED' AND resolved_by_user_id IS NULL AND resolved_at IS NULL)
    OR
    (status = 'RESOLVED' AND resolved_by_user_id IS NOT NULL AND resolved_at IS NOT NULL)
  )
);

COMMENT ON TABLE voting_incident IS
  'Incidencias operativas registradas por veedores durante la supervisión de la jornada.';

CREATE INDEX voting_incident_event_night_idx ON voting_incident (event_id, night_id);
CREATE INDEX voting_incident_status_idx ON voting_incident (status);
CREATE INDEX voting_incident_troupe_idx ON voting_incident (event_troupe_id);
CREATE INDEX voting_incident_judge_idx ON voting_incident (judge_profile_id);

-- Guard contra eliminación física: preservación de evidencia histórica
CREATE OR REPLACE FUNCTION protect_voting_incident_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'CANNOT_DELETE_VOTING_INCIDENT';
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS voting_incident_delete_guard ON voting_incident;
CREATE TRIGGER voting_incident_delete_guard
  BEFORE DELETE ON voting_incident
  FOR EACH ROW EXECUTE FUNCTION protect_voting_incident_delete();
