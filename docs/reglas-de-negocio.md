# Reglas de negocio

**Estado:** reglas confirmadas por `AGENTS.md` y comportamiento implementado señalado aparte. Este texto no crea nuevas excepciones reglamentarias.

## Confirmadas

| Área | Regla | Fuente |
| --- | --- | --- |
| Asignación | Jurado elige jornada competitiva y especialidad con asignación activa; API valida pertenencia de jornada/comparsa | `AGENTS.md` §2; `api/src/modules/judges/` |
| Cambio de jurado | En evento `OPEN`, solo revocar/reemplazar asignación sin planilla confirmada; la evidencia presentada se conserva | `AGENTS.md` §2 |
| Notas | `SCORED` admite enteros 1–10; `NOT_PRESENTED` se registra con 0; `PENDING` aún no es voto | `AGENTS.md` §2; `api/src/modules/ballots/ballot-service.js` |
| Ítems | Padre con hijos no recibe nota manual; suma de hijos. Hoja sin hijos es puntuable | `AGENTS.md` §2 |
| Confirmación | Puntuación confirmada inmutable; no editar/borrar por CRUD común | `AGENTS.md` §2; migraciones de planillas |
| Totales | Suma de puntuaciones; no descarte automático de máxima/mínima; penalizaciones confirmadas descuentan | `AGENTS.md` §2 |
| Borrado | Bloquear eliminación física de recursos con votos, sesiones, cierres, actas, auditoría u otra historia | `AGENTS.md` §2; guards de DB/API |
| Conectividad | Guardado online-first; timeout/offline no confirma localmente; reintento manual | `AGENTS.md` §5; `client/AGENTS.md` |
| Evidencia | Votos, cierres, penalizaciones y acciones sensibles auditables; registros append-only | `AGENTS.md` §7 |
| Documentos | Hash SHA-256 sobre bytes exactos del archivo si un archivo se declara oficial; nueva versión no sobrescribe | `AGENTS.md` §8 |

## Implementado que requiere cotejo reglamentario

La API exige readiness antes de abrir evento, programación por jornada, nominaciones completas en rubros aplicables, ventana de votación y planilla completa para `submit`. El cierre de jornada requiere ventana cerrada. El orden de pasada de un evento abierto permite ajustar solo el tramo aún no iniciado con motivo y auditoría. Hay sorteo ceremonial y acta con payload JSON canónico; **no afirmar que equivale al hash de un PDF oficial**. Fuentes: `api/README.md` §§ Modelo de administración/Invariantes, `api/src/modules/` y migraciones 072–095.

## Pendiente de definición por responsable

- Reglamento general de desempates y cuándo interviene cada criterio.
- Procedimiento de impugnación/subsanación y autoridades responsables.
- Votos tardíos y contingencia si se cierra una jornada con una planilla incompleta.
- Excepciones reglamentarias y criterios de retención definitiva.

Hasta su aprobación, no implementar una decisión nueva por inferencia. Priorizar preservación de evidencia y señalar el bloqueo.
