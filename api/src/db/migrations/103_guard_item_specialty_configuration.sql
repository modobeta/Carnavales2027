CREATE FUNCTION require_configuring_item_specialty()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  target_event_id UUID;
  current_status TEXT;
BEGIN
  target_event_id := CASE WHEN TG_OP='DELETE' THEN OLD.event_id ELSE NEW.event_id END;
  SELECT status INTO current_status FROM carnival_event WHERE id=target_event_id FOR UPDATE;
  IF current_status IS DISTINCT FROM 'CONFIGURING' THEN
    RAISE EXCEPTION 'EVENT_LOCKED';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER evaluation_item_specialty_requires_configuring
BEFORE INSERT OR UPDATE OR DELETE ON evaluation_item_specialty
FOR EACH ROW EXECUTE FUNCTION require_configuring_item_specialty();
