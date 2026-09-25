# Graph Report - Carnavales2027  (2026-09-25)

## Corpus Check
- 57 files · ~197,575 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1438 nodes · 4126 edges · 127 communities (64 shown, 63 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 79 edges (avg confidence: 0.86)
- Token cost: unavailable (extraction host did not expose token usage)

## Community Hubs (Navigation)
- Event and Rubric Configuration
- Audit Hash Chain
- React Application Shell
- Ballot and Voting Services
- Authorization Middleware
- Database Migration Runner
- Judge Session Context
- Accessible Admin Components
- HTTP and App Navigation
- Admin UX Messages
- Event and Specialty Schema
- Full Event Seed Data
- Client Dependencies
- Event Lifecycle Migration
- Client API and Forms
- API Middleware and Rate Limits
- Category and Troupe Schema
- Judge Profile Services
- PostgreSQL Connection Pool
- Event Readiness UI
- Operational Profiles
- Database Module Tests
- Better Auth Configuration
- User and Role Schema
- Offline Ballot Storage
- Registration and Invitations
- Results Publication
- Ballot Subsanation
- Role Management
- Operations Scripts
- Ballot Database Schema
- Ceremonial Draw UI
- Project and Deployment Docs
- Credential Account Services
- Email Delivery
- Configuration Immutability
- Rubric Criteria Integrity
- PWA Service Worker
- Production Configuration
- Public Results Tests
- UX Error Messages
- Event Configuration Guards
- Admin Results UI
- API Package Metadata
- API Dependencies
- Pilot Backup and Restore
- HTTP Server Lifecycle
- Identity and OTP Limits
- Judge Profile Schema
- Official Scrutiny Record
- Judge Assignment UI
- Judge Invitation Schema
- Pilot Delivery Planning
- Append-only Audit Schema
- Schedule Reordering Tests
- Ballot Integration Tests
- Bootstrap Admin State
- Judge History Guards
- Ballot Deletion Guards
- Legacy Offline Sync
- Results Snapshots
- Carnival App Icon
- Specialty Schema
- Ballot Triggers
- Score Evaluation Guards
- Schedule Timestamps
- Error Formatting
- Audit and Vote Invariants
- Transactional Vote Processing
- Backup and Restore
- Event Opening Guards
- Night Operational Status
- Voting Windows
- Rubric Criteria Guards
- Service Worker Precache
- API HTTP and SSE
- Roles and Permissions
- Database Backup Script
- Database Restore Script
- Ceremonial Draw Audit Chain
- General Audit Hash Chain
- Schedule Reorder Guard
- Scoring Scale
- Audit Records
- PostgreSQL Extensions
- Judge PWA Instructions
- Admin Action Confirmation
- Client HTML Shell
- Carnival Icon Concept
- Native Dialog Handling
- Render Service Blueprint

## God Nodes (most connected - your core abstractions)
1. `getPool()` - 148 edges
2. `apiRequest()` - 75 edges
3. `closePool()` - 71 edges
4. `migrate()` - 63 edges
5. `vitest` - 56 edges
6. `@testing-library/react` - 48 edges
7. `createApp()` - 47 edges
8. `auditEvent()` - 46 edges
9. `react` - 42 edges
10. `createEventsRouter()` - 36 edges

## Surprising Connections (you probably didn't know these)
- `Invariantes e idempotencia de votos` --semantically_similar_to--> `Confirmación online de votos`  [INFERRED] [semantically similar]
  api/README.md → .planning/2026-09-23-revisar-y-corregir-hallazgos-de-carnaval/findings.md
- `Votación online y persistencia` --semantically_similar_to--> `Confirmación online de votos`  [INFERRED] [semantically similar]
  client/README.md → .planning/2026-09-23-revisar-y-corregir-hallazgos-de-carnaval/findings.md
- `Invariantes e idempotencia de votos` --semantically_similar_to--> `Inmutabilidad y auditoría de votos`  [INFERRED] [semantically similar]
  api/README.md → .planning/2026-09-23-revisar-y-corregir-hallazgos-de-carnaval/findings.md
- `PWA y caché del shell` --semantically_similar_to--> `PWA offline solo para shell`  [INFERRED] [semantically similar]
  client/README.md → .planning/2026-09-23-revisar-y-corregir-hallazgos-de-carnaval/findings.md
- `Backup y restauración de API` --semantically_similar_to--> `Backup y restauración en destino vacío`  [INFERRED] [semantically similar]
  api/README.md → DEPLOYMENT.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Free pilot delivery system** — render_yaml_web_service, specs_029_piloto_produccion_spec_pilot_requirements [INFERRED 0.85]
- **Stack de despliegue del piloto: Render, Neon y Gmail API** — deployment_piloto_gratuito_render_neon_gmail_api, deployment_piloto_render, deployment_piloto_neon_postgresql, deployment_piloto_gmail_api [EXTRACTED 1.00]
- **Flujo de voto confirmado online** — _planning_2026_09_23_revisar_y_corregir_hallazgos_de_carnaval_findings_votacion_online, api_readme_integridad_de_votos, client_readme_votacion_online [INFERRED 0.95]

## Communities (127 total, 63 thin omitted)

### Community 0 - "Event and Rubric Configuration"
Cohesion: 0.08
Nodes (77): getReadiness(), humanLabel(), createNight(), DELETE_BLOCKERS, deleteEvent(), deleteNight(), getEvent(), listEvents() (+69 more)

### Community 1 - "Audit Hash Chain"
Cohesion: 0.08
Nodes (56): auditCeremonialDraw(), canonicalizeJson(), GENESIS_HASH, hashAuditEvent(), hashCeremonialDraw(), requireText(), validateAuditData(), withTransaction() (+48 more)

### Community 2 - "React Application Shell"
Cohesion: 0.06
Nodes (25): App(), RequireAdmin(), RequireAnyRole(), RequirePenaltiesRole(), RequireResultsRole(), RequireRole(), RequireVotingObserverRole(), getDefaultRouteForRoles() (+17 more)

### Community 3 - "Ballot and Voting Services"
Cohesion: 0.12
Nodes (49): requireJudge(), auditBallot(), closeVoting(), createBallotsForNight(), getBallot(), getVotingStatus(), incrementBallotRevision(), listJudgeBallots() (+41 more)

### Community 4 - "Authorization Middleware"
Cohesion: 0.09
Nodes (35): requireAdmin(), ALLOWED_ROLES, requireCeremonialDrawAccess(), requirePenaltiesAccess(), requireReleaseAccess(), requireResultsAccess(), requireScrutinyCertificationAccess(), requireVotingObserver() (+27 more)

### Community 5 - "Database Migration Runner"
Cohesion: 0.10
Nodes (12): checksum(), __dirname, ensureMigrationTable(), getMigrationStatus(), loadMigrations(), main(), migrate(), migrationsDirectory (+4 more)

### Community 6 - "Judge Session Context"
Cohesion: 0.08
Nodes (26): isSessionEndedError(), redirectToLoginExpired(), SESSION_ENDED_CODES, SessionContext, SessionProvider(), useSession(), client_src_index, getPendingItems() (+18 more)

### Community 7 - "Accessible Admin Components"
Cohesion: 0.11
Nodes (17): Button(), Dialog(), DialogFooter(), EntityDrawer(), ProgressBar(), STATUS_LABELS, StatusPill(), Toast() (+9 more)

### Community 8 - "HTTP and App Navigation"
Cohesion: 0.10
Nodes (17): AppNavigation(), ROLE_LABELS, PublicResultsLink(), AdminEventContext, AdminEventProvider(), readStoredEventId(), storeEventId(), Probe() (+9 more)

### Community 9 - "Admin UX Messages"
Cohesion: 0.09
Nodes (26): UX_ERROR_HINTS, UX_FIELD_LABELS, UX_STATUS_LABELS, uxErrorHint(), uxFieldLabel(), uxStatusLabel(), ConfigurationProgress(), EventStatusBanner() (+18 more)

### Community 10 - "Event and Specialty Schema"
Cohesion: 0.10
Nodes (26): carnival_event, night, night_event_id_idx, event_specialty, configuration_seed, require_configuring_event(), judge_assignment, judge_assignment_active_judge_night_uq (+18 more)

### Community 11 - "Full Event Seed Data"
Cohesion: 0.14
Nodes (27): NOMINATIVE_RUBRICS, RANDOM_RUBRICS, SCALE_REFERENCE, findFixture(), FULL_AUXILIARIES, FULL_CATEGORY, FULL_EVENT, FULL_JUDGES (+19 more)

### Community 12 - "Client Dependencies"
Cohesion: 0.06
Nodes (28): dependencies, react, react-dom, devDependencies, fake-indexeddb, jsdom, @testing-library/jest-dom, @testing-library/react (+20 more)

### Community 13 - "Event Lifecycle Migration"
Cohesion: 0.08
Nodes (26): guard_carnival_event_update(), require_night_change(), carnival_event, evaluation_item, event_category, event_specialty, event_troupe, night (+18 more)

### Community 14 - "Client API and Forms"
Cohesion: 0.20
Nodes (14): apiRequest(), PageShell(), isRegistrationPasswordValid(), RegistrationPasswordFields(), requirements, AcceptJudgeInvitationPage(), AcceptOperationalInvitationPage(), AcceptRoleInvitationPage() (+6 more)

### Community 15 - "API Middleware and Rate Limits"
Cohesion: 0.15
Nodes (11): createApp(), createAuthGeneralRateLimiter(), createAuthRateLimiter(), createGeneralApiRateLimiter(), createInvitationRateLimiter(), isSessionRead(), shouldSkipRateLimit(), createRequireSession() (+3 more)

### Community 16 - "Category and Troupe Schema"
Cohesion: 0.11
Nodes (18): event_category, event_category_no_delete, event_troupe, event_troupe_requires_active_category, require_active_troupe_category(), evaluation_item, evaluation_item_requires_active_specialty, require_active_item_specialty() (+10 more)

### Community 17 - "Judge Profile Services"
Cohesion: 0.24
Nodes (21): acceptInvitation(), createJudge(), deliverInvitation(), getJudgeProfileByUserId(), hashSecret(), inspectInvitation(), inTransaction(), invitationHours() (+13 more)

### Community 18 - "PostgreSQL Connection Pool"
Cohesion: 0.17
Nodes (11): getConnectionString(), getConnectionTimeout(), getIdleInTransactionTimeout(), getPool(), getPoolMax(), getStatementTimeout(), poolsByConnectionString, openEvent() (+3 more)

### Community 19 - "Event Readiness UI"
Cohesion: 0.13
Nodes (15): ConfirmDialog(), EventReadinessPanel(), READINESS_LABELS, KIND_OPTIONS, NIGHT_KIND_LABELS, NightForm(), nightKindLabel(), AdminEventsPage() (+7 more)

### Community 20 - "Operational Profiles"
Cohesion: 0.24
Nodes (21): auditEvent(), ensureProfile(), acceptOperationalInvitation(), createOperationalProfile(), deliverInvitation(), hashSecret(), inspectOperationalInvitation(), inTransaction() (+13 more)

### Community 21 - "Database Module Tests"
Cohesion: 0.17
Nodes (3): createEvent(), ref_node_assert, ref_node_test

### Community 22 - "Better Auth Configuration"
Cohesion: 0.15
Nodes (7): createAuth(), getTrustedOrigins(), requireEnvironment(), originalEnvironment, originalEnvironment, originalEnvironment, better-auth

### Community 23 - "User and Role Schema"
Cohesion: 0.14
Nodes (17): app_role, "user", user_role, user_role_role_code_idx, role_invitation, role_invitation_token_idx, "user", role_invitation_token_hash_uq (+9 more)

### Community 24 - "Offline Ballot Storage"
Cohesion: 0.29
Nodes (16): cacheBallot(), clearBallotOperations(), clearUserOfflineData(), decrypt(), encrypt(), enqueueOperation(), getBallotOperations(), getCachedBallot() (+8 more)

### Community 25 - "Registration and Invitations"
Cohesion: 0.18
Nodes (10): requireRegistrationPassword(), acceptRoleInvitation(), getInvitationByToken(), hashToken(), inTransaction(), inviteOperationalUser(), listOperationalUsers(), maskEmail() (+2 more)

### Community 26 - "Results Publication"
Cohesion: 0.17
Nodes (15): protect_results_release(), results_release, results_release_guard, "user", check_troupe_penalty_night_competition(), protect_troupe_penalty_delete(), protect_troupe_penalty_mutation(), "user" (+7 more)

### Community 27 - "Ballot Subsanation"
Cohesion: 0.14
Nodes (12): ballot_score_subsanation, ballot_score_subsanation_ballot_idx, ballot_score_subsanation_guard, ballot_audit_log_guard, ballot_integrity_guard, ballot_score_integrity_guard, protect_ballot_audit_log(), validate_ballot_integrity() (+4 more)

### Community 28 - "Role Management"
Cohesion: 0.27
Nodes (12): canRemoveAdminRole(), deleteUser(), grantRole(), grantRoleWithClient(), requireText(), revokeRole(), revokeRoleWithClient(), runTransaction() (+4 more)

### Community 29 - "Operations Scripts"
Cohesion: 0.14
Nodes (14): scripts, audit:verify, auth:migrate, bootstrap:admin, db:backup, db:migrate, db:restore, db:test (+6 more)

### Community 30 - "Ballot Database Schema"
Cohesion: 0.19
Nodes (9): ballot, ballot_event_night_idx, ballot_judge_idx, ballot_audit_ballot_idx, ballot_audit_log, protect_ballot_score_subsanation(), validate_ballot_score_integrity(), prevent_event_category_delete() (+1 more)

### Community 31 - "Ceremonial Draw UI"
Cohesion: 0.23
Nodes (10): CeremonialDrawModal(), drawErrorMessage(), getTroupeName(), errorMock, executeMock, loadRecordedMock, props, normalizeSeconds() (+2 more)

### Community 32 - "Project and Deployment Docs"
Cohesion: 0.19
Nodes (13): API — Carnavales 2027, Correo y diagnóstico de OTP, Cliente — Carnavales 2027, Publicación y despliegue manual, Gmail API para correo OTP, Piloto gratuito con Render, Neon y Gmail API, Neon PostgreSQL del piloto, OAuth y refresh token de Gmail (+5 more)

### Community 33 - "Credential Account Services"
Cohesion: 0.42
Nodes (11): createCredentialUser(), createOrVerifyCredentialUser(), getAuthContext(), requirePassword(), requireText(), revokeUserSessions(), setCredentialPassword(), findUser() (+3 more)

### Community 34 - "Email Delivery"
Cohesion: 0.26
Nodes (7): createEmailDelivery(), createGmailDelivery(), createInvitationDelivery(), invitationUrl(), requireEnvironment(), env, nodemailer

### Community 35 - "Configuration Immutability"
Cohesion: 0.24
Nodes (10): carnival_event_no_delete, category_requires_configuring_event, evaluation_item_requires_configuring_event, night_requires_configuring_event, require_configuring_event(), rubric_requires_configuring_event, specialty_requires_configuring_event, require_configuring_event (+2 more)

### Community 36 - "Rubric Criteria Integrity"
Cohesion: 0.25
Nodes (9): nomination_requires_configuring_event, rubric_criterion, rubric_criterion_requires_configuring_event, rubric_criterion_rubric_id_idx, schedule_requires_configuring_event, require_configuring_event, assign_evaluation_item_display_order(), rubric_criterion_unassigned_idx (+1 more)

### Community 37 - "PWA Service Worker"
Cohesion: 0.27
Nodes (7): buildServiceWorker(), walk(), ref_node_fs, ref_node_os, ref_node_path, ref_node_url, ref_node_vm

### Community 38 - "Production Configuration"
Cohesion: 0.24
Nodes (10): Escala de puntuación 1–10, Findings & Decisions: Hallazgos y decisiones, Inmutabilidad y auditoría de votos, PWA offline solo para shell, Confirmación online de votos, Registro de progreso de correcciones, Plan de tareas: revisar y corregir hallazgos, Invariantes e idempotencia de votos (+2 more)

### Community 39 - "Public Results Tests"
Cohesion: 0.31
Nodes (8): validateProductionConfig(), invalidTrustProxy(), isTrustedNetwork(), readTrustProxy(), trustedAliases, required(), validateEmailConfig(), ref_node_net

### Community 40 - "UX Error Messages"
Cohesion: 0.24
Nodes (3): mockEventsList, MockEventSource, mockReleasedResults

### Community 41 - "Event Configuration Guards"
Cohesion: 0.36
Nodes (8): category_requires_configuring_event, evaluation_item_requires_configuring_event, night_requires_configuring_event, require_configuring_event(), rubric_requires_configuring_event, specialty_requires_configuring_event, require_configuring_event, troupe_requires_configuring_event

### Community 43 - "Admin Results UI"
Cohesion: 0.28
Nodes (7): AdminResultsPage(), nameFor(), apiRequestMock, event, missingDraw, tieError, useSessionMock

### Community 44 - "API Package Metadata"
Cohesion: 0.25
Nodes (7): engines, node, name, private, type, version, express-rate-limit

### Community 45 - "API Dependencies"
Cohesion: 0.25
Nodes (8): dependencies, better-auth, dotenv, express, express-rate-limit, helmet, nodemailer, pg

### Community 46 - "Pilot Backup and Restore"
Cohesion: 0.39
Nodes (6): backupDatabase(), fingerprint(), restoreDatabase(), runPg(), dotenv, ref_node_child_process

### Community 47 - "HTTP Server Lifecycle"
Cohesion: 0.29
Nodes (6): auth, app, gracefulShutdown(), server, mountWebClient(), helmet

### Community 48 - "Identity and OTP Limits"
Cohesion: 0.46
Nodes (5): createIdentityBudget(), createOtpSendLimiter(), identityMiddleware(), skipIdentityLimits(), smtp

### Community 49 - "Judge Profile Schema"
Cohesion: 0.32
Nodes (6): judge_profile, judge_profile_document_uq, judge_profile_email_uq, judge_profile_history_guard, "user", protect_judge_profile_history

### Community 50 - "Official Scrutiny Record"
Cohesion: 0.36
Nodes (7): check_official_scrutiny_record_preconditions(), official_scrutiny_record, official_scrutiny_record_event_idx, official_scrutiny_record_mutation_guard, official_scrutiny_record_precondition_guard, protect_official_scrutiny_record_mutation(), "user"

### Community 52 - "Judge Invitation Schema"
Cohesion: 0.43
Nodes (6): judge_invitation, judge_invitation_delete_guard, judge_invitation_pending_uq, judge_invitation_profile_created_idx, prevent_judge_invitation_delete(), "user"

### Community 53 - "Pilot Delivery Planning"
Cohesion: 0.38
Nodes (7): Pilot checks workflow, Pilot constraints and security clarifications, Pilot delivery plan, Pilot pull request description, Spec 029 pilot requirements, Pilot delivery tasks, Historical pilot validation evidence

### Community 54 - "Append-only Audit Schema"
Cohesion: 0.40
Nodes (4): audit_event, audit_event_append_only, prevent_audit_event_mutation(), audit_event_one_ceremonial_draw_per_event

### Community 56 - "Schedule Reordering Tests"
Cohesion: 0.53
Nodes (4): seedEvent(), seedNight(), seedSchedule(), seedTroupe()

### Community 58 - "Bootstrap Admin State"
Cohesion: 0.50
Nodes (4): bootstrap_state, bootstrap_state_append_only, prevent_bootstrap_state_mutation(), "user"

### Community 60 - "Ballot Deletion Guards"
Cohesion: 0.40
Nodes (4): ballot_guard, ballot_score_guard, protect_ballot, protect_ballot_score

### Community 61 - "Legacy Offline Sync"
Cohesion: 0.60
Nodes (4): ballot_sync_operation, ballot_sync_operation_ballot_idx, ballot_sync_operation_guard, protect_ballot_sync_operation()

### Community 62 - "Results Snapshots"
Cohesion: 0.60
Nodes (4): guard_results_snapshot_immutable(), idx_results_snapshot_event_latest, results_snapshot, trg_results_snapshot_immutable

### Community 64 - "Carnival App Icon"
Cohesion: 0.40
Nodes (5): Carnaval App Icon, Pink Gold and Teal Carnival Gradient, Carnival Mask and Shield, Dark Rounded Square Background, Central Feather Crown

### Community 66 - "Ballot Triggers"
Cohesion: 0.50
Nodes (3): ballot_guard, protect_ballot(), protect_ballot

### Community 68 - "Schedule Timestamps"
Cohesion: 0.67
Nodes (3): guard_schedule_timestamp(), zz_schedule_timestamp_guard, pg_timezone_names

### Community 71 - "Audit and Vote Invariants"
Cohesion: 0.67
Nodes (3): Append-only auditability, Project instructions, Vote integrity and immutability

### Community 72 - "Transactional Vote Processing"
Cohesion: 0.67
Nodes (3): API as functional and security authority, Idempotent vote operations, Transactional audit events

### Community 73 - "Backup and Restore"
Cohesion: 0.67
Nodes (3): Backup y restauración de API, Backup y restauración en destino vacío, SHA-256 e inventario de backup

## Knowledge Gaps
- **176 isolated node(s):** `OPERATIONAL_ROLES`, `operationalRoles`, `GENESIS_HASH`, `ALLOWED_ROLES`, `emitter` (+171 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 416 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **63 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `vitest` connect `React Application Shell` to `PWA Service Worker`, `Judge Session Context`, `Accessible Admin Components`, `HTTP and App Navigation`, `Admin UX Messages`, `Error Formatting`, `Admin Results UI`, `Client Dependencies`, `UX Error Messages`, `Client API and Forms`, `Event Readiness UI`, `Offline Ballot Storage`, `Ballot Integration Tests`, `Ceremonial Draw UI`?**
  _High betweenness centrality (0.246) - this node is a cross-community bridge._
- **Why does `getPool()` connect `PostgreSQL Connection Pool` to `Event and Rubric Configuration`, `Audit Hash Chain`, `Ballot and Voting Services`, `Authorization Middleware`, `Database Migration Runner`, `API Middleware and Rate Limits`, `Judge Profile Services`, `Operational Profiles`, `Database Module Tests`, `Better Auth Configuration`, `Registration and Invitations`, `Role Management`, `Credential Account Services`, `Event Deletion Tests`, `Schedule Reordering Tests`, `SSE and Post-commit Tests`, `Penalty API Tests`, `Authorization Tests`, `Night Deletion Tests`, `Public Results API Tests`, `Results API Tests`, `Ceremonial Draw Results Tests`?**
  _High betweenness centrality (0.087) - this node is a cross-community bridge._
- **Why does `react` connect `Accessible Admin Components` to `React Application Shell`, `Judge Session Context`, `HTTP and App Navigation`, `Admin UX Messages`, `Admin Results UI`, `Client Dependencies`, `Client API and Forms`, `Event Readiness UI`, `Judge Assignment UI`, `Ceremonial Draw UI`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Are the 16 inferred relationships involving `apiRequest()` (e.g. with `AdminHomePage.test.jsx` and `AcceptJudgeInvitationPage.test.jsx`) actually correct?**
  _`apiRequest()` has 16 INFERRED edges - model-reasoned connections that need verification._
- **What connects `OPERATIONAL_ROLES`, `operationalRoles`, `GENESIS_HASH` to the rest of the system?**
  _176 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Event and Rubric Configuration` be split into smaller, more focused modules?**
  _Cohesion score 0.07934175727299442 - nodes in this community are weakly interconnected._
- **Should `Audit Hash Chain` be split into smaller, more focused modules?**
  _Cohesion score 0.08370221327967807 - nodes in this community are weakly interconnected._