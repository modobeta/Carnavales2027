CREATE OR REPLACE FUNCTION sync_primary_item_specialty()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM evaluation_item_specialty
     WHERE evaluation_item_id=NEW.id AND event_id=NEW.event_id AND specialty_id=NEW.specialty_id
  ) THEN
    INSERT INTO evaluation_item_specialty(event_id, evaluation_item_id, specialty_id)
    VALUES(NEW.event_id, NEW.id, NEW.specialty_id);
  END IF;
  RETURN NEW;
END;
$$;
