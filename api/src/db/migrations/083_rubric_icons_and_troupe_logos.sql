-- Spec 029: identidad visual de comparsas y rubros (ícono de rubro + logo de comparsa).
--
-- Decisiones:
--  - El ícono de rubro es una clave del catálogo fijo de la PWA
--    (client/public/icons/rubros). Se almacena el nombre, no el binario,
--    para que el cliente resuelva el asset versionado del repositorio.
--  - El logo de comparsa se guarda como binario en BYTEA con su MIME y un
--    hash SHA-256 del contenido. El hash permite verificar integridad y
--    cachear sin volver a leer el blob completo.
--  - Ninguna regla de negocio existente se modifica: sólo se agregan
--    columnas y una función de apoyo.

ALTER TABLE rubric
  ADD COLUMN IF NOT EXISTS icon VARCHAR(64);

COMMENT ON COLUMN rubric.icon IS
  'Clave del catálogo de íconos de rubro (client/public/icons/rubros). NULL significa que el rubro usa el ícono por defecto de la interfaz.';

ALTER TABLE event_troupe
  ADD COLUMN IF NOT EXISTS logo_data BYTEA,
  ADD COLUMN IF NOT EXISTS logo_mime VARCHAR(64),
  ADD COLUMN IF NOT EXISTS logo_sha256 CHAR(64),
  ADD COLUMN IF NOT EXISTS logo_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN event_troupe.logo_data IS
  'Bytes del logo de la comparsa. Se almacena en PostgreSQL; la API nunca devuelve este campo directamente.';
COMMENT ON COLUMN event_troupe.logo_mime IS
  'MIME del logo (image/png, image/jpeg, image/webp o image/svg+xml).';
COMMENT ON COLUMN event_troupe.logo_sha256 IS
  'SHA-256 hexadecimal de logo_data. Permite verificar integridad y armar respostas cacheables.';

ALTER TABLE event_troupe
  DROP CONSTRAINT IF EXISTS event_troupe_logo_mime_allowed;

ALTER TABLE event_troupe
  ADD CONSTRAINT event_troupe_logo_mime_allowed
    CHECK (logo_mime IS NULL OR logo_mime IN ('image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'));

-- Coherencia del trío logo: no puede haber MIME sin bytes ni hash sin bytes.
ALTER TABLE event_troupe
  DROP CONSTRAINT IF EXISTS event_troupe_logo_consistency;

ALTER TABLE event_troupe
  ADD CONSTRAINT event_troupe_logo_consistency
    CHECK (
      (logo_data IS NULL AND logo_mime IS NULL AND logo_sha256 IS NULL AND logo_updated_at IS NULL)
      OR
      (logo_data IS NOT NULL AND logo_mime IS NOT NULL AND logo_sha256 IS NOT NULL AND logo_updated_at IS NOT NULL)
    );

-- Límite de tamaño en la base: 1 MB, alineado con la validación de la API.
ALTER TABLE event_troupe
  DROP CONSTRAINT IF EXISTS event_troupe_logo_size_limit;

ALTER TABLE event_troupe
  ADD CONSTRAINT event_troupe_logo_size_limit
    CHECK (logo_data IS NULL OR octet_length(logo_data) <= 1048576);

-- Availability guard: abrir un evento exige jurado activo en cada noche de
-- competencia. El alcance es kind='COMPETITION' porque protect_judge_assignment
-- (077) sólo admite asignaciones sobre noches de competencia: exigir jurado en
-- noches AWARDS haría imposible abrir cualquier evento con esas noches.
-- Se mantiene alineado con event-readiness.service.js para que un UPDATE
-- directo de status no pueda esquivar la validación.
CREATE OR REPLACE FUNCTION guard_carnival_event_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'CLOSED' THEN
    RAISE EXCEPTION 'EVENT_LOCKED';
  END IF;

  IF OLD.status = 'OPEN' THEN
    IF NEW.status = 'CLOSED'
       AND NEW.name = OLD.name
       AND NEW.active IS NOT DISTINCT FROM OLD.active
       AND EXISTS (SELECT 1 FROM night WHERE event_id = OLD.id)
       AND NOT EXISTS (
         SELECT 1 FROM night WHERE event_id = OLD.id AND status <> 'CLOSED'
       ) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'EVENT_LOCKED';
  END IF;

  IF NEW.status = 'OPEN' AND OLD.status = 'CONFIGURING' AND (
    NOT EXISTS (SELECT 1 FROM night WHERE event_id = OLD.id AND kind = 'COMPETITION')
    OR NOT EXISTS (SELECT 1 FROM event_troupe WHERE event_id = OLD.id AND active)
    OR NOT EXISTS (SELECT 1 FROM event_specialty WHERE event_id = OLD.id AND active)
    OR NOT EXISTS (SELECT 1 FROM rubric WHERE event_id = OLD.id AND active)
    OR EXISTS (
      SELECT 1 FROM event_troupe t
      LEFT JOIN event_category c ON c.id = t.category_id
      WHERE t.event_id = OLD.id AND t.active AND (c.id IS NULL OR NOT c.active)
    )
    OR EXISTS (
      SELECT 1 FROM rubric r
      WHERE r.event_id = OLD.id AND r.active AND (
        NOT EXISTS (SELECT 1 FROM evaluation_item i WHERE i.rubric_id = r.id AND i.active)
        OR EXISTS (
          SELECT 1 FROM evaluation_item i
          JOIN event_specialty s ON s.id = i.specialty_id
          WHERE i.rubric_id = r.id AND i.active AND NOT s.active
        )
      )
    )
    OR EXISTS (
      SELECT 1
        FROM rubric r
        JOIN evaluation_item ei ON ei.rubric_id = r.id AND ei.active
        JOIN night_troupe_schedule nts ON nts.event_id = r.event_id AND nts.status = 'SCHEDULED'
        JOIN event_troupe et ON et.id = nts.event_troupe_id AND et.active
       WHERE r.event_id = OLD.id AND r.active AND r.evaluation_target = 'NOMINATION'
         AND NOT EXISTS (
           SELECT 1 FROM troupe_nomination tn
            WHERE tn.event_id = r.event_id
              AND tn.event_troupe_id = et.id
              AND tn.rubric_id = r.id
              AND tn.active
         )
    )
    OR EXISTS (
      SELECT 1 FROM night n
      WHERE n.event_id = OLD.id AND n.kind = 'COMPETITION'
        AND NOT EXISTS (
          SELECT 1 FROM night_troupe_schedule s
          WHERE s.event_id = n.event_id AND s.night_id = n.id AND s.status = 'SCHEDULED'
        )
    )
    OR EXISTS (
      SELECT 1 FROM night n
      WHERE n.event_id = OLD.id AND n.kind = 'COMPETITION'
        AND NOT EXISTS (
          SELECT 1 FROM judge_assignment ja
          WHERE ja.event_id = n.event_id
            AND ja.night_id = n.id
            AND ja.status = 'ACTIVE'
        )
    )
  ) THEN
    RAISE EXCEPTION 'EVENT_CONFIGURATION_INCOMPLETE';
  END IF;

  IF OLD.status = 'CONFIGURING' AND NEW.status NOT IN ('CONFIGURING', 'OPEN') THEN
    RAISE EXCEPTION 'EVENT_LOCKED';
  END IF;
  RETURN NEW;
END;
$$;