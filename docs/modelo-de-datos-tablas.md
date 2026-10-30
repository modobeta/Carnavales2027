# Referencia de tablas PostgreSQL

**Estado:** referencia generada desde `information_schema` de la base de desarrollo local, cotejada contra `api/src/db/migrations/`: las 106 migraciones aplicadas coinciden con los archivos del repo en el commit `90b7cdd` (29/10/2026). Es una foto de ese estado; si cambian las migraciones, regenerar. No es un ERD de producción ni reemplaza el [mapa lógico](modelo-de-datos.md), que conserva las reglas de integridad y evolución.

**Totales:** 48 tablas, 394 columnas, 95 claves foráneas (128 relaciones columna-tabla distintas).

Las descripciones funcionales describen lo que la tabla sostiene en el código y en las migraciones. No son reglamento aprobado: cualquier regla de negocio sigue su fuente en [reglas de negocio](reglas-de-negocio.md).

## Mapa por grupo

| Grupo | Tablas | Responsabilidad |
|---|---:|---|
| Identidad | 8 | Better Auth, roles y administrador inicial protegido. |
| Configuración | 11 | Evento, jornadas, participantes, evaluación y orden de presentación. |
| Personas | 9 | Perfiles de jurado y operativos, invitaciones, cupos y asignaciones. |
| Votación | 5 | Ventanas, planillas, puntuaciones y envíos idempotentes. |
| Supervisión | 3 | Incidentes, custodia de planillas y penalizaciones. |
| Resultados | 4 | Liberación, publicación y actas; compatibilidad histórica. |
| Evidencia | 6 | Auditoría encadenada por hash y apertura idempotente. |
| Operación | 2 | Historial SQL y seed controlado. |

---

## Identidad

Better Auth, roles y administrador inicial protegido.

### `user`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `id` | text | no | PK |  |
| `name` | text | no |  |  |
| `email` | text | no |  |  |
| `emailVerified` | boolean | no |  |  |
| `image` | text | sí |  |  |
| `createdAt` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |
| `updatedAt` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |
| `twoFactorEnabled` | boolean | sí |  |  |

**Referenciada por:** `account` (`userId`); `admin_event_assignment` (`user_id`); `ballot` (`replaced_by`); `ballot_custody_log` (`received_by_user_id`); `bootstrap_state` (`initial_admin_user_id`); `judge_assignment` (`revoked_by`); `judge_invitation` (`created_by`); `judge_invitation` (`revoked_by`); `judge_profile` (`created_by`); `judge_profile` (`user_id`); `official_scrutiny_record` (`certified_by`); `operational_invitation` (`created_by`); `operational_invitation` (`revoked_by`); `operational_profile` (`created_by`); `operational_profile` (`user_id`); `results_release` (`released_by`); `role_invitation` (`created_by`); `session` (`userId`); `troupe_penalty` (`applied_by_user_id`); `troupe_penalty` (`revoked_by_user_id`); `twoFactor` (`userId`); `user_role` (`user_id`); `voting_incident` (`resolved_by_user_id`); `voting_incident` (`reported_by_user_id`)

### `account`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `id` | text | no | PK |  |
| `accountId` | text | no |  |  |
| `providerId` | text | no |  |  |
| `userId` | text | no | FK |  |
| `accessToken` | text | sí |  |  |
| `refreshToken` | text | sí |  |  |
| `idToken` | text | sí |  |  |
| `accessTokenExpiresAt` | timestamp with time zone | sí |  |  |
| `refreshTokenExpiresAt` | timestamp with time zone | sí |  |  |
| `scope` | text | sí |  |  |
| `password` | text | sí |  |  |
| `createdAt` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |
| `updatedAt` | timestamp with time zone | no |  |  |

**Referencia a:** `userId` → `user`

### `session`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `id` | text | no | PK |  |
| `expiresAt` | timestamp with time zone | no |  |  |
| `token` | text | no |  |  |
| `createdAt` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |
| `updatedAt` | timestamp with time zone | no |  |  |
| `ipAddress` | text | sí |  |  |
| `userAgent` | text | sí |  |  |
| `userId` | text | no | FK |  |

**Referencia a:** `userId` → `user`

### `verification`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `id` | text | no | PK |  |
| `identifier` | text | no |  |  |
| `value` | text | no |  |  |
| `expiresAt` | timestamp with time zone | no |  |  |
| `createdAt` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |
| `updatedAt` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |

### `twoFactor`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `id` | text | no | PK |  |
| `secret` | text | no |  |  |
| `backupCodes` | text | no |  |  |
| `userId` | text | no | FK |  |
| `verified` | boolean | sí |  |  |
| `failedVerificationCount` | integer | sí |  |  |
| `lockedUntil` | timestamp with time zone | sí |  |  |

**Referencia a:** `userId` → `user`

### `app_role`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `code` | text | no | PK |  |
| `description` | text | no |  |  |

**Referenciada por:** `operational_profile_role` (`role_code`); `role_invitation` (`role_code`); `user_role` (`role_code`)

### `user_role`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `user_id` | text | no | PK, FK |  |
| `role_code` | text | no | PK, FK |  |
| `created_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |

**Referencia a:** `role_code` → `app_role`; `user_id` → `user`

### `bootstrap_state`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `singleton` | boolean | no | PK | `true` |
| `initial_admin_user_id` | text | no | FK |  |
| `completed_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |

**Referencia a:** `initial_admin_user_id` → `user`

---

## Configuración

Evento, jornadas, participantes, evaluación y orden de presentación.

### `carnival_event`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` |
| `name` | text | no |  |  |
| `status` | text | no |  | `'CONFIGURING'::text` |
| `created_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |
| `active` | boolean | no |  | `true` |

**Referenciada por:** `admin_event_assignment` (`event_id`); `ballot` (`event_id`); `ballot_score_subsanation` (`event_id`); `configuration_seed` (`event_id`); `event_category` (`event_id`); `event_open_operation_claim` (`event_id`); `event_specialty` (`event_id`); `event_troupe` (`event_id`); `judge_assignment` (`event_id`); `judge_quota` (`event_id`); `legacy_nomination_scope` (`event_id`); `night` (`event_id`); `night_troupe_schedule` (`event_id`); `official_scrutiny_record` (`event_id`); `results_release` (`event_id`); `results_snapshot` (`event_id`); `rubric` (`event_id`); `troupe_nomination` (`event_id`); `troupe_penalty` (`event_id`); `voting_incident` (`event_id`); `voting_window` (`event_id`)

### `night`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `id` | uuid | no | PK, FK | `gen_random_uuid()` |
| `event_id` | uuid | no | FK |  |
| `name` | text | no |  |  |
| `display_order` | integer | no |  |  |
| `event_date` | date | sí |  |  |
| `kind` | text | no |  |  |
| `status` | text | no |  | `'DRAFT'::text` |
| `created_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |
| `voting_release_mode` | text | no |  | `'ALL'::text` |
| `active_schedule_id` | uuid | sí | FK |  |

**Referencia a:** `event_id` → `carnival_event`; (`active_schedule_id`, `id`, `event_id`) → `night_troupe_schedule`

**Referenciada por:** `ballot` (`night_id`, `event_id`); `ballot_custody_log` (`night_id`, `event_id`); `judge_assignment` (`night_id`, `event_id`); `judge_quota` (`night_id`, `event_id`); `night_troupe_schedule` (`night_id`, `event_id`); `troupe_penalty` (`night_id`, `event_id`); `voting_incident` (`night_id`, `event_id`); `voting_window` (`night_id`)

### `event_category`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` |
| `event_id` | uuid | no | FK |  |
| `name` | text | no |  |  |
| `code` | text | no |  |  |
| `display_order` | integer | no |  |  |
| `active` | boolean | no |  | `true` |
| `created_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |

**Referencia a:** `event_id` → `carnival_event`

**Referenciada por:** `event_troupe` (`category_id`, `event_id`)

### `event_troupe`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` |
| `event_id` | uuid | no | FK |  |
| `category_id` | uuid | no | FK |  |
| `name` | text | no |  |  |
| `active` | boolean | no |  | `true` |
| `created_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |
| `brand_color` | character varying | sí |  |  |
| `logo_data` | bytea | sí |  |  |
| `logo_mime` | character varying | sí |  |  |
| `logo_sha256` | character | sí |  |  |
| `logo_updated_at` | timestamp with time zone | sí |  |  |

**Referencia a:** `event_id` → `carnival_event`; (`category_id`, `event_id`) → `event_category`

**Referenciada por:** `legacy_nomination_scope` (`event_troupe_id`); `night_troupe_schedule` (`event_troupe_id`, `event_id`); `troupe_nomination` (`event_troupe_id`, `event_id`); `troupe_penalty` (`event_troupe_id`, `event_id`); `voting_incident` (`event_troupe_id`, `event_id`)

### `event_specialty`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` |
| `event_id` | uuid | no | FK |  |
| `name` | text | no |  |  |
| `code` | text | no |  |  |
| `display_order` | integer | no |  |  |
| `active` | boolean | no |  | `true` |
| `created_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |

**Referencia a:** `event_id` → `carnival_event`

**Referenciada por:** `ballot` (`specialty_id`, `event_id`); `evaluation_item` (`specialty_id`, `event_id`); `evaluation_item_specialty` (`specialty_id`, `event_id`); `judge_assignment` (`specialty_id`, `event_id`); `judge_quota` (`specialty_id`, `event_id`)

### `rubric`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` |
| `event_id` | uuid | no | FK |  |
| `name` | text | no |  |  |
| `code` | text | no |  |  |
| `evaluation_target` | text | no |  |  |
| `expected_subject_type` | text | sí |  |  |
| `active` | boolean | no |  | `true` |
| `created_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |
| `rubric_type` | text | no |  | `'NOMINATIVE'::text` |
| `resolution_method` | text | no |  | `'JURY'::text` |
| `evaluation_objective` | text | sí |  |  |
| `icon` | character varying | sí |  |  |

**Referencia a:** `event_id` → `carnival_event`

**Referenciada por:** `ballot_score` (`rubric_id`, `event_id`); `evaluation_item` (`rubric_id`, `event_id`); `legacy_nomination_scope` (`rubric_id`); `rubric_criterion` (`rubric_id`, `event_id`); `troupe_nomination` (`rubric_id`, `event_id`)

### `evaluation_item`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` |
| `event_id` | uuid | no | FK |  |
| `rubric_id` | uuid | no | FK |  |
| `specialty_id` | uuid | no | FK |  |
| `name` | text | no |  |  |
| `code` | text | no |  |  |
| `active` | boolean | no |  | `true` |
| `created_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |
| `display_order` | integer | no |  | `0` |
| `required` | boolean | no |  | `true` |
| `allow_not_presented` | boolean | no |  | `true` |

**Referencia a:** (`specialty_id`, `event_id`) → `event_specialty`; (`rubric_id`, `event_id`) → `rubric`

**Referenciada por:** `ballot_score` (`evaluation_item_id`, `event_id`); `evaluation_item_specialty` (`evaluation_item_id`, `event_id`); `rubric_criterion` (`scoring_item_id`, `rubric_id`, `event_id`)

### `evaluation_item_specialty`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `event_id` | uuid | no | FK |  |
| `evaluation_item_id` | uuid | no | PK, FK |  |
| `specialty_id` | uuid | no | PK, FK |  |
| `created_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |

**Referencia a:** (`evaluation_item_id`, `event_id`) → `evaluation_item`; (`specialty_id`, `event_id`) → `event_specialty`

### `rubric_criterion`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` |
| `event_id` | uuid | no | FK |  |
| `rubric_id` | uuid | no | FK |  |
| `description` | text | no |  |  |
| `display_order` | integer | no |  |  |
| `active` | boolean | no |  | `true` |
| `created_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |
| `scoring_item_id` | uuid | sí | FK |  |

**Referencia a:** (`scoring_item_id`, `rubric_id`, `event_id`) → `evaluation_item`; (`rubric_id`, `event_id`) → `rubric`

### `troupe_nomination`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` |
| `event_id` | uuid | no | FK |  |
| `event_troupe_id` | uuid | no | FK |  |
| `rubric_id` | uuid | no | FK |  |
| `subject_type` | text | no |  |  |
| `display_name` | text | no |  |  |
| `active` | boolean | no |  | `true` |
| `created_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |

**Referencia a:** `event_id` → `carnival_event`; (`event_troupe_id`, `event_id`) → `event_troupe`; (`rubric_id`, `event_id`) → `rubric`

**Referenciada por:** `ballot_score` (`nomination_id`)

### `night_troupe_schedule`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` |
| `event_id` | uuid | no | FK |  |
| `night_id` | uuid | no | FK |  |
| `event_troupe_id` | uuid | no | FK |  |
| `presentation_order` | integer | no |  |  |
| `status` | text | no |  | `'SCHEDULED'::text` |
| `created_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |
| `scheduled_at` | timestamp with time zone | sí |  |  |
| `scheduled_timezone` | text | sí |  |  |
| `order_source` | text | sí |  |  |
| `release_order` | integer | sí |  |  |

**Referencia a:** `event_id` → `carnival_event`; (`event_troupe_id`, `event_id`) → `event_troupe`; (`night_id`, `event_id`) → `night`

**Referenciada por:** `ballot_score` (`night_schedule_id`, `event_id`); `night` (`active_schedule_id`, `id`, `event_id`)

---

## Personas

Perfiles de jurado y operativos, invitaciones, cupos y asignaciones.

### `judge_profile`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` |
| `user_id` | text | sí | FK |  |
| `name` | text | no |  |  |
| `email` | text | no |  |  |
| `document_number` | text | no |  |  |
| `registration_status` | text | no |  | `'INVITED'::text` |
| `created_by` | text | no | FK |  |
| `created_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |

**Referencia a:** `created_by` → `user`; `user_id` → `user`

**Referenciada por:** `ballot` (`judge_profile_id`); `judge_assignment` (`judge_profile_id`); `judge_invitation` (`judge_profile_id`); `voting_incident` (`judge_profile_id`)

### `judge_invitation`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` |
| `judge_profile_id` | uuid | no | FK |  |
| `secret_hash` | character | no |  |  |
| `status` | text | no |  | `'PENDING'::text` |
| `expires_at` | timestamp with time zone | no |  |  |
| `created_by` | text | no | FK |  |
| `created_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |
| `used_at` | timestamp with time zone | sí |  |  |
| `revoked_at` | timestamp with time zone | sí |  |  |
| `revoked_by` | text | sí | FK |  |
| `delivery_status` | text | no |  | `'PENDING'::text` |
| `sent_at` | timestamp with time zone | sí |  |  |
| `acceptance_claim_id` | uuid | sí |  |  |
| `acceptance_claimed_at` | timestamp with time zone | sí |  |  |

**Referencia a:** `judge_profile_id` → `judge_profile`; `created_by` → `user`; `revoked_by` → `user`

### `judge_quota`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` |
| `event_id` | uuid | no | FK |  |
| `night_id` | uuid | no | FK |  |
| `specialty_id` | uuid | no | FK |  |
| `max_assignments` | integer | no |  |  |
| `created_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |

**Referencia a:** `event_id` → `carnival_event`; (`specialty_id`, `event_id`) → `event_specialty`; (`night_id`, `event_id`) → `night`

### `judge_assignment`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` |
| `event_id` | uuid | no | FK |  |
| `night_id` | uuid | no | FK |  |
| `specialty_id` | uuid | no | FK |  |
| `judge_profile_id` | uuid | no | FK |  |
| `assignment_type` | text | no |  | `'PRIMARY'::text` |
| `status` | text | no |  | `'ACTIVE'::text` |
| `reason` | text | sí |  |  |
| `replaced_assignment_id` | uuid | sí | FK |  |
| `revoked_at` | timestamp with time zone | sí |  |  |
| `revoked_by` | text | sí | FK |  |
| `created_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |
| `standby_for_assignment_id` | uuid | sí | FK |  |

**Referencia a:** `event_id` → `carnival_event`; (`specialty_id`, `event_id`) → `event_specialty`; `replaced_assignment_id` → `judge_assignment`; `standby_for_assignment_id` → `judge_assignment`; `judge_profile_id` → `judge_profile`; (`night_id`, `event_id`) → `night`; `revoked_by` → `user`

**Referenciada por:** `ballot` (`judge_assignment_id`, `event_id`); `judge_assignment` (`replaced_assignment_id`); `judge_assignment` (`standby_for_assignment_id`)

### `operational_profile`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` |
| `user_id` | text | sí | FK |  |
| `name` | text | no |  |  |
| `email` | text | no |  |  |
| `document_number` | text | no |  |  |
| `registration_status` | text | no |  | `'INVITED'::text` |
| `created_by` | text | no | FK |  |
| `created_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |

**Referencia a:** `created_by` → `user`; `user_id` → `user`

**Referenciada por:** `operational_invitation` (`operational_profile_id`); `operational_profile_role` (`operational_profile_id`)

### `operational_profile_role`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `operational_profile_id` | uuid | no | PK, FK |  |
| `role_code` | text | no | PK, FK |  |
| `granted_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |

**Referencia a:** `role_code` → `app_role`; `operational_profile_id` → `operational_profile`

### `operational_invitation`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` |
| `operational_profile_id` | uuid | no | FK |  |
| `secret_hash` | character | no |  |  |
| `status` | text | no |  | `'PENDING'::text` |
| `expires_at` | timestamp with time zone | no |  |  |
| `created_by` | text | no | FK |  |
| `created_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |
| `used_at` | timestamp with time zone | sí |  |  |
| `revoked_at` | timestamp with time zone | sí |  |  |
| `revoked_by` | text | sí | FK |  |
| `acceptance_claim_id` | uuid | sí |  |  |
| `acceptance_claimed_at` | timestamp with time zone | sí |  |  |
| `delivery_status` | text | no |  | `'PENDING'::text` |
| `sent_at` | timestamp with time zone | sí |  |  |

**Referencia a:** `operational_profile_id` → `operational_profile`; `created_by` → `user`; `revoked_by` → `user`

### `role_invitation`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `id` | text | no | PK | `gen_random_uuid()` |
| `email` | text | no |  |  |
| `role_code` | text | no | FK |  |
| `expires_at` | timestamp with time zone | no |  |  |
| `created_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |
| `created_by` | text | no | FK |  |
| `token_hash` | character | no |  |  |
| `status` | text | no |  | `'PENDING'::text` |
| `used_at` | timestamp with time zone | sí |  |  |
| `revoked_at` | timestamp with time zone | sí |  |  |
| `acceptance_claim_id` | uuid | sí |  |  |
| `acceptance_claimed_at` | timestamp with time zone | sí |  |  |

**Referencia a:** `role_code` → `app_role`; `created_by` → `user`

### `admin_event_assignment`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `user_id` | text | no | PK, FK |  |
| `event_id` | uuid | no | PK, FK |  |
| `is_active` | boolean | no |  | `true` |

**Referencia a:** `event_id` → `carnival_event`; `user_id` → `user`

---

## Votación

Ventanas, planillas, puntuaciones y envíos idempotentes.

### `voting_window`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `night_id` | uuid | no | PK, FK |  |
| `event_id` | uuid | no | FK |  |
| `status` | text | no |  |  |
| `opened_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |
| `closed_at` | timestamp with time zone | sí |  |  |

**Referencia a:** `event_id` → `carnival_event`; `night_id` → `night`

### `ballot`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` |
| `event_id` | uuid | no | FK |  |
| `night_id` | uuid | no | FK |  |
| `judge_assignment_id` | uuid | no | FK |  |
| `judge_profile_id` | uuid | no | FK |  |
| `specialty_id` | uuid | no | FK |  |
| `status` | text | no |  | `'OPEN'::text` |
| `opened_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |
| `submitted_at` | timestamp with time zone | sí |  |  |
| `reopened_at` | timestamp with time zone | sí |  |  |
| `reopen_count` | integer | no |  | `0` |
| `max_reopens` | integer | no |  | `1` |
| `created_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |
| `revision` | bigint | no |  | `0` |
| `replaced_at` | timestamp with time zone | sí |  |  |
| `replaced_by` | text | sí | FK |  |
| `replacement_reason` | text | sí |  |  |

**Referencia a:** `event_id` → `carnival_event`; (`specialty_id`, `event_id`) → `event_specialty`; (`judge_assignment_id`, `event_id`) → `judge_assignment`; `judge_profile_id` → `judge_profile`; (`night_id`, `event_id`) → `night`; `replaced_by` → `user`

**Referenciada por:** `ballot_audit_log` (`ballot_id`, `event_id`); `ballot_custody_log` (`ballot_id`, `event_id`); `ballot_score` (`ballot_id`, `event_id`); `ballot_score_subsanation` (`ballot_id`); `ballot_sync_operation` (`ballot_id`); `voting_incident` (`ballot_id`, `event_id`)

### `ballot_score`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` |
| `ballot_id` | uuid | no | FK |  |
| `event_id` | uuid | no | FK |  |
| `evaluation_item_id` | uuid | no | FK |  |
| `rubric_id` | uuid | no | FK |  |
| `night_schedule_id` | uuid | no | FK |  |
| `score` | integer | sí |  |  |
| `requires_subsanation` | boolean | no |  | `false` |
| `subsidized_score` | integer | sí |  |  |
| `status` | text | no |  | `'DRAFT'::text` |
| `locked_at` | timestamp with time zone | sí |  |  |
| `created_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |
| `evaluation_state` | text | no |  | `'PENDING'::text` |
| `nomination_id` | uuid | sí | FK |  |

**Referencia a:** (`ballot_id`, `event_id`) → `ballot`; (`evaluation_item_id`, `event_id`) → `evaluation_item`; (`night_schedule_id`, `event_id`) → `night_troupe_schedule`; (`rubric_id`, `event_id`) → `rubric`; `nomination_id` → `troupe_nomination`

**Referenciada por:** `ballot_score_subsanation` (`ballot_score_id`)

### `ballot_score_subsanation`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` |
| `ballot_score_id` | uuid | no | FK |  |
| `ballot_id` | uuid | no | FK |  |
| `event_id` | uuid | no | FK |  |
| `score` | integer | no |  | `5` |
| `recorded_by` | text | no |  |  |
| `reason` | text | no |  |  |
| `created_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |

**Referencia a:** `ballot_id` → `ballot`; `ballot_score_id` → `ballot_score`; `event_id` → `carnival_event`

### `ballot_sync_operation`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `actor_user_id` | text | no | PK |  |
| `ballot_id` | uuid | no | PK, FK |  |
| `operation_id` | uuid | no | PK |  |
| `operation_type` | text | no |  |  |
| `content_hash` | text | no |  |  |
| `applied_revision` | bigint | no |  |  |
| `created_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |

**Referencia a:** `ballot_id` → `ballot`

---

## Supervisión

Incidentes, custodia de planillas y penalizaciones.

### `voting_incident`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` |
| `event_id` | uuid | no | FK |  |
| `night_id` | uuid | no | FK |  |
| `event_troupe_id` | uuid | sí | FK |  |
| `judge_profile_id` | uuid | sí | FK |  |
| `ballot_id` | uuid | sí | FK |  |
| `incident_type` | text | no |  |  |
| `description` | text | no |  |  |
| `status` | text | no |  | `'OPEN'::text` |
| `reported_by_user_id` | text | no | FK |  |
| `resolution_notes` | text | sí |  |  |
| `resolved_by_user_id` | text | sí | FK |  |
| `resolved_at` | timestamp with time zone | sí |  |  |
| `created_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |

**Referencia a:** (`ballot_id`, `event_id`) → `ballot`; `event_id` → `carnival_event`; (`event_troupe_id`, `event_id`) → `event_troupe`; `judge_profile_id` → `judge_profile`; (`night_id`, `event_id`) → `night`; `resolved_by_user_id` → `user`; `reported_by_user_id` → `user`

### `ballot_custody_log`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` |
| `ballot_id` | uuid | no | FK |  |
| `event_id` | uuid | no | FK |  |
| `night_id` | uuid | no | FK |  |
| `custody_status` | text | no |  | `'RECEIVED'::text` |
| `canonical_hash` | text | no |  |  |
| `received_by_user_id` | text | no | FK |  |
| `notes` | text | sí |  |  |
| `received_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |
| `created_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |

**Referencia a:** (`ballot_id`, `event_id`) → `ballot`; (`night_id`, `event_id`) → `night`; `received_by_user_id` → `user`

### `troupe_penalty`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` |
| `event_id` | uuid | no | FK |  |
| `night_id` | uuid | no | FK |  |
| `event_troupe_id` | uuid | no | FK |  |
| `reason` | text | no |  |  |
| `penalty_points` | integer | no |  |  |
| `status` | text | no |  | `'APPLIED'::text` |
| `applied_by_user_id` | text | no | FK |  |
| `revoked_by_user_id` | text | sí | FK |  |
| `revocation_reason` | text | sí |  |  |
| `created_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |
| `updated_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |

**Referencia a:** `event_id` → `carnival_event`; (`event_troupe_id`, `event_id`) → `event_troupe`; (`night_id`, `event_id`) → `night`; `applied_by_user_id` → `user`; `revoked_by_user_id` → `user`

---

## Resultados

Liberación, publicación y actas; compatibilidad histórica.

### `results_release`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `event_id` | uuid | no | PK, FK |  |
| `released_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |
| `released_by` | text | no | FK |  |

**Referencia a:** `event_id` → `carnival_event`; `released_by` → `user`

### `results_snapshot`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` |
| `event_id` | uuid | no | FK |  |
| `version` | integer | no |  | `1` |
| `snapshot_hash` | character varying | no |  |  |
| `payload` | jsonb | no |  |  |
| `created_at` | timestamp with time zone | no |  | `now()` |

**Referencia a:** `event_id` → `carnival_event`

### `official_scrutiny_record`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` |
| `event_id` | uuid | no | FK |  |
| `record_number` | text | no |  |  |
| `certified_by` | text | no | FK |  |
| `certified_role` | text | no |  |  |
| `record_hash` | character | no |  |  |
| `payload` | jsonb | no |  |  |
| `created_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |

**Referencia a:** `event_id` → `carnival_event`; `certified_by` → `user`

### `legacy_nomination_scope`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `event_id` | uuid | no | PK, FK |  |
| `rubric_id` | uuid | no | PK, FK |  |
| `event_troupe_id` | uuid | no | PK, FK |  |

**Referencia a:** `event_id` → `carnival_event`; `event_troupe_id` → `event_troupe`; `rubric_id` → `rubric`

---

## Evidencia

Auditoría encadenada por hash y apertura idempotente.

### `audit_event`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` |
| `actor_user_id` | text | sí |  |  |
| `action` | text | no |  |  |
| `entity_type` | text | no |  |  |
| `entity_id` | text | no |  |  |
| `before_data` | jsonb | no |  | `'{}'::jsonb` |
| `after_data` | jsonb | no |  | `'{}'::jsonb` |
| `created_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |
| `hash_chain_version` | smallint | sí |  |  |
| `previous_hash` | character | sí |  |  |
| `event_hash` | character | sí |  |  |

### `ballot_audit_log`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `id` | uuid | no | PK | `gen_random_uuid()` |
| `ballot_id` | uuid | no | FK |  |
| `event_id` | uuid | no | FK |  |
| `action` | text | no |  |  |
| `actor_id` | text | no |  |  |
| `reason` | text | sí |  |  |
| `details` | jsonb | sí |  |  |
| `created_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |

**Referencia a:** (`ballot_id`, `event_id`) → `ballot`

### `general_audit_hash_chain_head`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `singleton` | boolean | no | PK | `true` |
| `last_audit_event_id` | uuid | sí |  |  |
| `last_hash` | character | no |  | `repeat('0'::text, 64)` |
| `updated_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |

### `ceremonial_draw_hash_chain_head`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `singleton` | boolean | no | PK | `true` |
| `last_audit_event_id` | uuid | sí |  |  |
| `last_hash` | character | no |  | `repeat('0'::text, 64)` |
| `updated_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |

### `event_open_operation_claim`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `operation_id` | uuid | no | PK |  |
| `event_id` | uuid | no | FK |  |
| `intent` | text | no |  |  |
| `actor_user_id` | text | sí |  |  |
| `created_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |

**Referencia a:** `event_id` → `carnival_event`

**Referenciada por:** `event_open_operation_receipt` (`operation_id`)

### `event_open_operation_receipt`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `operation_id` | uuid | no | PK, FK |  |
| `status` | text | no |  |  |
| `code` | text | sí |  |  |
| `details` | jsonb | sí |  |  |
| `event_result` | jsonb | sí |  |  |
| `created_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |

**Referencia a:** `operation_id` → `event_open_operation_claim`

---

## Operación

Historial SQL y seed controlado.

### `schema_migrations`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `version` | text | no | PK |  |
| `filename` | text | no |  |  |
| `checksum` | text | no |  |  |
| `applied_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |

### `configuration_seed`

| Columna | Tipo | Nulo | Clave | Default |
|---|---|---|---|---|
| `seed_key` | text | no | PK |  |
| `event_id` | uuid | no | FK |  |
| `initialized_at` | timestamp with time zone | no |  | `CURRENT_TIMESTAMP` |

**Referencia a:** `event_id` → `carnival_event`

