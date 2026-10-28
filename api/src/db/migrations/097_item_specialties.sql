CREATE TABLE evaluation_item_specialty (
  event_id UUID NOT NULL,
  evaluation_item_id UUID NOT NULL,
  specialty_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (evaluation_item_id, specialty_id),
  CONSTRAINT evaluation_item_specialty_item_event_fk
    FOREIGN KEY (evaluation_item_id, event_id) REFERENCES evaluation_item(id, event_id) ON DELETE RESTRICT,
  CONSTRAINT evaluation_item_specialty_specialty_event_fk
    FOREIGN KEY (specialty_id, event_id) REFERENCES event_specialty(id, event_id) ON DELETE RESTRICT
);

INSERT INTO evaluation_item_specialty(event_id, evaluation_item_id, specialty_id)
SELECT event_id, id, specialty_id FROM evaluation_item;

CREATE INDEX evaluation_item_specialty_by_specialty_idx
  ON evaluation_item_specialty(event_id, specialty_id, evaluation_item_id);

CREATE FUNCTION require_active_item_specialty_association() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE enabled BOOLEAN;
BEGIN
  SELECT active INTO enabled FROM event_specialty
   WHERE id = NEW.specialty_id AND event_id = NEW.event_id;
  IF FOUND AND enabled = false THEN
    RAISE EXCEPTION 'SPECIALTY_INACTIVE';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER evaluation_item_specialty_requires_active
BEFORE INSERT OR UPDATE OF specialty_id ON evaluation_item_specialty
FOR EACH ROW EXECUTE FUNCTION require_active_item_specialty_association();

-- Keep direct legacy inserts and the existing primary-specialty column compatible.
CREATE FUNCTION sync_primary_item_specialty() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO evaluation_item_specialty(event_id, evaluation_item_id, specialty_id)
  VALUES(NEW.event_id, NEW.id, NEW.specialty_id)
  ON CONFLICT (evaluation_item_id, specialty_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER evaluation_item_primary_specialty_sync
AFTER INSERT OR UPDATE OF specialty_id ON evaluation_item
FOR EACH ROW EXECUTE FUNCTION sync_primary_item_specialty();
