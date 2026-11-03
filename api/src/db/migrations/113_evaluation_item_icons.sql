-- Íconos de ítem puntuable.
--
-- Decisión:
--  - El ícono de ítem es una clave del catálogo fijo de la PWA
--    (client/public/icons/items). Se almacena la clave, no el binario, para que
--    el cliente resuelva el asset versionado del repositorio.
--  - NULL significa que el ítem no tiene ícono; no se modifica ninguna regla de
--    negocio ni cálculo existente.

ALTER TABLE evaluation_item
  ADD COLUMN IF NOT EXISTS icon VARCHAR(64);

COMMENT ON COLUMN evaluation_item.icon IS
  'Clave del catálogo de íconos de ítem (client/public/icons/items). NULL significa que el ítem no tiene ícono.';
