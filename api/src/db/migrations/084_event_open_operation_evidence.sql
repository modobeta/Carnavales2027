CREATE TABLE event_open_operation_claim (
  operation_id UUID PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES carnival_event(id) ON DELETE RESTRICT,
  intent TEXT NOT NULL CHECK (intent = 'OPEN_EVENT'),
  actor_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX event_open_operation_claim_event_idx
  ON event_open_operation_claim(event_id, created_at);

CREATE TABLE event_open_operation_receipt (
  operation_id UUID PRIMARY KEY REFERENCES event_open_operation_claim(operation_id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('APPLIED', 'REJECTED')),
  code TEXT,
  details JSONB,
  event_result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (status = 'APPLIED' AND code IS NULL AND details IS NULL AND event_result IS NOT NULL)
    OR (status = 'REJECTED' AND code IS NOT NULL AND event_result IS NULL)
  )
);

CREATE FUNCTION reject_event_open_operation_evidence_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'EVENT_OPEN_OPERATION_EVIDENCE_IMMUTABLE';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER event_open_operation_claim_immutable
BEFORE UPDATE OR DELETE ON event_open_operation_claim
FOR EACH ROW EXECUTE FUNCTION reject_event_open_operation_evidence_mutation();

CREATE TRIGGER event_open_operation_receipt_immutable
BEFORE UPDATE OR DELETE ON event_open_operation_receipt
FOR EACH ROW EXECUTE FUNCTION reject_event_open_operation_evidence_mutation();
