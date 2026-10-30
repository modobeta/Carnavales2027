CREATE OR REPLACE FUNCTION guard_carnival_event_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'CLOSED' THEN RAISE EXCEPTION 'EVENT_LOCKED'; END IF;

  IF OLD.status = 'OPEN' THEN
    IF NEW.status = 'CLOSED' AND NEW.name=OLD.name AND NEW.active IS NOT DISTINCT FROM OLD.active
       AND EXISTS (SELECT 1 FROM night WHERE event_id=OLD.id)
       AND NOT EXISTS (SELECT 1 FROM night WHERE event_id=OLD.id AND status<>'CLOSED') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'EVENT_LOCKED';
  END IF;

  IF NEW.status='OPEN' AND OLD.status='CONFIGURING' AND (
    NOT EXISTS (SELECT 1 FROM night WHERE event_id=OLD.id AND kind='COMPETITION')
    OR NOT EXISTS (SELECT 1 FROM event_troupe WHERE event_id=OLD.id AND active)
    OR NOT EXISTS (SELECT 1 FROM event_specialty WHERE event_id=OLD.id AND active)
    OR NOT EXISTS (SELECT 1 FROM rubric WHERE event_id=OLD.id AND active)
    OR EXISTS (
      SELECT 1 FROM event_troupe t LEFT JOIN event_category c ON c.id=t.category_id
       WHERE t.event_id=OLD.id AND t.active AND (c.id IS NULL OR NOT c.active)
    )
    OR EXISTS (
      SELECT 1 FROM rubric r WHERE r.event_id=OLD.id AND r.active AND (
        NOT EXISTS (SELECT 1 FROM evaluation_item i WHERE i.rubric_id=r.id AND i.active)
        OR EXISTS (
          SELECT 1 FROM evaluation_item i
          JOIN evaluation_item_specialty eis ON eis.evaluation_item_id=i.id AND eis.event_id=i.event_id
          JOIN event_specialty s ON s.id=eis.specialty_id AND s.event_id=eis.event_id
          WHERE i.rubric_id=r.id AND i.active AND NOT s.active
        )
      )
    )
    OR EXISTS (
      SELECT 1 FROM rubric r
      JOIN evaluation_item ei ON ei.rubric_id=r.id AND ei.active
      JOIN night_troupe_schedule nts ON nts.event_id=r.event_id AND nts.status='SCHEDULED'
      JOIN event_troupe et ON et.id=nts.event_troupe_id AND et.active
      WHERE r.event_id=OLD.id AND r.active AND r.evaluation_target='NOMINATION'
        AND NOT EXISTS (
          SELECT 1 FROM troupe_nomination tn
           WHERE tn.event_id=r.event_id AND tn.event_troupe_id=et.id AND tn.rubric_id=r.id AND tn.active
        )
    )
    OR EXISTS (
      SELECT 1 FROM night n WHERE n.event_id=OLD.id AND n.kind='COMPETITION'
        AND NOT EXISTS (
          SELECT 1 FROM night_troupe_schedule s
           WHERE s.event_id=n.event_id AND s.night_id=n.id AND s.status='SCHEDULED'
        )
    )
    OR EXISTS (
      SELECT 1 FROM night n WHERE n.event_id=OLD.id AND n.kind='COMPETITION'
        AND NOT EXISTS (
          SELECT 1 FROM judge_assignment ja
           WHERE ja.event_id=n.event_id AND ja.night_id=n.id AND ja.status='ACTIVE'
        )
    )
  ) THEN
    RAISE EXCEPTION 'EVENT_CONFIGURATION_INCOMPLETE';
  END IF;

  IF OLD.status='CONFIGURING' AND NEW.status NOT IN ('CONFIGURING','OPEN') THEN
    RAISE EXCEPTION 'EVENT_LOCKED';
  END IF;
  RETURN NEW;
END;
$$;
