# Registro de decisiones y pendientes

Las decisiones aquí resumen evidencia existente; **no** aprueban por sí mismas reglas nuevas. Para cada cambio futuro, registrar fecha, responsable, alternativas, impacto y prueba. Fuentes principales: `AGENTS.md`, spec 029, código/CI, [archivo histórico de despliegue](historico/DEPLOYMENT.md) y README.

| ID | Decisión/estado | Motivo y límite |
| --- | --- | --- |
| D-01 | Votación jurado online-first | Confirmación solo de API o replay idempotente; offline/timeout permite reintento manual. `AGENTS.md` §5, `client/AGENTS.md`. |
| D-02 | API/DB autoridades de integridad | UI no autoriza; validación por sesión/contexto y restricciones de PostgreSQL. `AGENTS.md` §§3,6. |
| D-03 | SQL versionado e inmutable | `schema_migrations` con checksum; excepción 084 solo por finales de línea históricos verificados. `api/src/db/migrate.js`. |
| D-04 | Piloto Render Free + Neon + Gmail API | Spec 029 aprobó piloto sin habilitar votación real ni reglamento completo. Una instancia, mismo origen, correo por `gmail.send`. |
| D-05 | Despliegue manual | `autoDeploy` off porque migraciones, respaldo y ausencia de votación requieren gate que CI actual no cubre. `render.yaml`, [runbook](despliegue-y-respaldo.md). |
| D-06 | Preservar evidencia | Voto confirmado y auditoría no se editan/borran ordinariamente; backup se restaura en base nueva, no sobre Neon. `AGENTS.md`. |
| D-07 | Roles de implementación | `ADMIN` global, `JUDGE`, `COMISARIO`, `SCRUTINEER`, `ESCRIBANO`; `ADMIN_EVENT` histórico no concede administración actual. VEEDOR retirado: se conservan cuentas e historial, se revocan invitaciones pendientes y se invalidan sesiones. Supervisión/custodia quedan para ADMIN. Guardas de API. |
| D-08 | Un ítem puede asociarse a varias especialidades y cada una lo evalúa con puntuaciones independientes | Aprobado por el usuario el 2026-10-28 (opción 1). Persistencia `evaluation_item_specialty`; planillas filtradas por especialidad; pruebas en `api/src/db/tests/ballots.test.js` y `client/src/features/evaluation-presentation.test.js`. |
| D-09 | Habilitación secuencial sin bloquear planillas pendientes | Aprobado por el usuario el 2026-11-09: ADMIN puede habilitar comparsas en orden aunque existan planillas pendientes; cada jurado puede volver a cualquier comparsa ya habilitada. Comparsas aún no habilitadas permanecen bloqueadas y cierre/envío de planilla sigue requiriendo completar los ítems. No cambia la inmutabilidad ni la confirmación online de votos. Verificación: `voting-api.test.js`, suites de Jurado/Admin. |
| D-10 | Pista operativa y revisión opcional | Aprobado por el usuario el 2026-11-09: la puesta en pista no es requisito para votar y solo registra el estado operativo del desfile; jurados pueden puntuar cualquier comparsa incluida en su planilla abierta. La revisión aparte es opcional y el cierre sigue requiriendo todas las puntuaciones confirmadas, con resumen en la confirmación final. No cambia la inmutabilidad ni la confirmación online de votos. D-10 reemplaza el bloqueo de puntuación de D-09. |

## Sin resolver (requiere responsable)

Reglamento general de desempates/impugnaciones/votos tardíos/excepciones; alcance oficial del acta y hash de PDF; plazos de retención y solicitudes de supresión; autorización para votación real; diseño de pipeline automático seguro. No marcar estas filas como «aprobadas» por el hecho de documentarlas.
