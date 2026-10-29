# Modelo de datos PostgreSQL

**Estado:** mapa lógico verificado contra migraciones SQL y una restauración aislada de Neon al 20/10/2026. No es un ERD completo; para columnas/constraints exactos leer `api/src/db/migrations/` y consultar `pg_catalog` de la versión desplegada. Hay 47 tablas públicas incluyendo `schema_migrations` en el corte.

```text
carnival_event ─┬─ night ─┬─ night_troupe_schedule ─┐
                │         ├─ voting_window          │
                │         └─ judge_quota             │
                ├─ event_troupe ─ troupe_nomination   │
                ├─ event_specialty ─┐
                │                   ├─ evaluation_item_specialty ─ evaluation_item ─ rubric
                └─ rubric ─ evaluation_item
                │                         └─ rubric_criterion
                ├─ judge_assignment ─ ballot ─ ballot_score ─┘
                ├─ troupe_penalty
                ├─ results_release / results_snapshot
                └─ official_scrutiny_record
user ─ account / session / twoFactor / user_role / judge_profile
```

| Grupo | Tablas principales | Responsabilidad |
| --- | --- | --- |
| Identidad | `user`, `account`, `session`, `verification`, `twoFactor`, `app_role`, `user_role`, `bootstrap_state` | Better Auth, roles y administrador inicial protegido |
| Configuración | `carnival_event`, `night`, `event_category`, `event_troupe`, `event_specialty`, `rubric`, `evaluation_item`, `evaluation_item_specialty`, `rubric_criterion`, `troupe_nomination`, `night_troupe_schedule` | Evento, jornadas, participantes, evaluación y orden; cada ítem puede asociarse a varias especialidades |
| Personas | `judge_profile`, `judge_invitation`, `judge_quota`, `judge_assignment`, `operational_profile`, `operational_profile_role`, `operational_invitation`, `role_invitation`, `admin_event_assignment` | Invitaciones y asignaciones; `ADMIN_EVENT` histórico no implica permiso global |
| Votación | `voting_window`, `ballot`, `ballot_score`, `ballot_score_subsanation`, `ballot_sync_operation` | Ventanas, planillas, decisiones y trazabilidad; sync legacy no es cola PWA activa |
| Supervisión | `voting_incident`, `ballot_custody_log`, `troupe_penalty` | Incidentes, custodia y sanciones |
| Resultados | `results_release`, `results_snapshot`, `official_scrutiny_record`, `legacy_nomination_scope` | Liberación, publicación y actas; compatibilidad histórica |
| Evidencia | `audit_event`, `ballot_audit_log`, `general_audit_hash_chain_head`, `ceremonial_draw_hash_chain_head`, `event_open_operation_claim`, `event_open_operation_receipt` | Auditoría/cadenas y apertura idempotente |
| Operación | `schema_migrations`, `configuration_seed` | Historial SQL y seed controlado |

## Integridad y evolución

Las relaciones efectivas son FKs de PostgreSQL; no inferir cascadas de un diagrama simplificado. Votos, cierres, auditoría y actas deben preservarse, por eso borrados administrativos fallan cuando hay historial. `evaluation_item_specialty` define la pertenencia vigente de cada ítem a una o más especialidades; las migraciones 097–100 alinean las validaciones de puntuación y preservan sus otros guardas, 101–102 mantienen readiness y la 103 restringe cambios de asociaciones a eventos `CONFIGURING`; cada especialidad mantiene planillas/puntuaciones independientes. El runner `api/src/db/migrate.js` ordena migraciones, usa advisory lock y registra SHA-256; no editar SQL aplicado. La última migración propia del corte es `103_guard_item_specialty_configuration.sql` (la numeración no implica que existan todos los números; 096 ya existe en el historial desplegado para otra migración). `084` admite solo un checksum histórico exacto de finales de línea; no es permiso para alterar migraciones.

Para ampliar este documento: generar un ERD desde una base **descartable** restaurada, nunca desde producción para probar escrituras. Añadir cardinalidades y columnas a partir de `pg_constraint`/migraciones, no de suposiciones.
