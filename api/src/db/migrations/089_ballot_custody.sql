-- Migración 089: Registro de Custodia de Planillas (Veeduría / Supervisión)
-- Registra la recepción formal y verificación de integridad criptográfica de planillas presentadas.

CREATE TABLE ballot_custody_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ballot_id UUID NOT NULL,
  event_id UUID NOT NULL,
  night_id UUID NOT NULL,
  custody_status TEXT NOT NULL DEFAULT 'RECEIVED' CHECK (custody_status IN (
    'RECEIVED',
    'VERIFIED',
    'TRANSFERRED',
    'AUDITED'
  )),
  canonical_hash TEXT NOT NULL CHECK (length(canonical_hash) = 64),
  received_by_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  notes TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ballot_custody_ballot_event_fk
    FOREIGN KEY (ballot_id, event_id) REFERENCES ballot(id, event_id) ON DELETE RESTRICT,
  CONSTRAINT ballot_custody_night_event_fk
    FOREIGN KEY (night_id, event_id) REFERENCES night(id, event_id) ON DELETE RESTRICT,
  CONSTRAINT ballot_custody_one_per_status UNIQUE (ballot_id, custody_status)
);

COMMENT ON TABLE ballot_custody_log IS
  'Evidencia inmutable de recepción y custodia de planillas por parte de veedores.';

CREATE INDEX ballot_custody_event_night_idx ON ballot_custody_log (event_id, night_id);
CREATE INDEX ballot_custody_ballot_idx ON ballot_custody_log (ballot_id);

-- Guard contra eliminación y modificación: append-only estricto
CREATE OR REPLACE FUNCTION protect_ballot_custody_log()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'CANNOT_DELETE_BALLOT_CUSTODY_LOG';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'CANNOT_UPDATE_BALLOT_CUSTODY_LOG';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS ballot_custody_log_guard ON ballot_custody_log;
CREATE TRIGGER ballot_custody_log_guard
  BEFORE UPDATE OR DELETE ON ballot_custody_log
  FOR EACH ROW EXECUTE FUNCTION protect_ballot_custody_log();
