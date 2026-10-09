# API — Carnavales 2027

Backend HTTP de la plataforma. Implementa autenticación, autorización, configuración del carnaval, votación, supervisión, penalizaciones, resultados y actas sobre PostgreSQL.

[Proyecto](../README.md) · [Cliente](../client/README.md)

Para instrucciones destinadas a usuarios, consultar la [guía de uso](../README.md#guía-de-uso). Para la infraestructura y el traslado de datos, consultar [DEPLOYMENT.md](../DEPLOYMENT.md). Este documento describe el backend implementado, no redefine el reglamento.

## Stack y requisitos

- JavaScript ESM sobre Node.js (`package.json`: `>=20`; para trabajar también con el cliente, respetar `^20.19.0 || >=22.12.0`).
- Express 5, Better Auth **1.6.27**, `pg`, dotenv, Helmet, express-rate-limit y Nodemailer.
- PostgreSQL con permisos para aplicar las migraciones y habilitar `pgcrypto`; piloto y CI utilizan PostgreSQL 18 y Node 22.
- npm y herramientas PostgreSQL 18 para backup/restore; Bash solo para los scripts históricos, no para `scripts/pilot-data.js`.

No se usa ORM ni hay paso de compilación del backend: Node ejecuta `src/server.js` directamente.

## Instalación y ejecución local

Desde `api/`, con la base de desarrollo ya creada:

```powershell
npm ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

Editá `.env` antes de seguir. No reemplaces un archivo existente ni uses las credenciales de ejemplo como credenciales operativas.

```powershell
npm run auth:migrate
npm run db:migrate
npm run dev
```

Detenete ante cualquier error. `auth:migrate` debe preceder a `db:migrate`. El servidor escucha en `PORT` o `3000`; `npm start` lo inicia sin modo watch. El frontend se ejecuta por separado y el proxy Vite atiende `/api` durante el desarrollo.

## Variables de entorno

Fuente inicial: [`.env.example`](.env.example). Los entrypoints que importan `dotenv/config` cargan `.env` desde el directorio de ejecución; ejecutá estos comandos dentro de `api/`. Las variables ya definidas en el proceso prevalecen sobre `.env`.

### Conexión y servidor

| Variable | Uso / valor por defecto |
| --- | --- |
| `DATABASE_URL` | Obligatoria para PostgreSQL; no confundir con la base de tests |
| `TEST_DATABASE_URL` | Obligatoria para `npm test` y `npm run db:test`; debe ser descartable |
| `PORT` | Puerto HTTP; `3000` si no se define un valor numérico utilizable |
| `NODE_ENV` | Definir explícitamente `development`, `test` o `production` según el contexto |
| `DB_POOL_MAX` | Máximo de conexiones por pool; `10` |
| `DB_STATEMENT_TIMEOUT` | Timeout SQL en ms; `5000` |
| `DB_CONNECTION_TIMEOUT_MS` | Timeout de conexión en ms; `3000` |
| `DB_IDLE_IN_TRANSACTION_TIMEOUT` | Timeout de transacción inactiva en ms; `10000` |
| `TRUST_PROXY` | Confianza de proxy; **el código usa `1` si falta**. La plantilla local usa `0` |

Los timeouts aceptan enteros no negativos; el pool exige un entero positivo y vuelve al valor por defecto si es inválido. Las variables de timeout se leen en `src/db/pool.js`, aunque no figuren en la plantilla.

`TRUST_PROXY` admite `0`/`false`, una cantidad de saltos o una lista de IP/CIDR/alias confiables. Rechaza `true` y redes globales `/0`. En acceso directo local, usá `0`; detrás de un proxy, configurá la topología real, no una confianza indiscriminada.

### Autenticación y correo

| Variable | Uso / valor por defecto |
| --- | --- |
| `BETTER_AUTH_SECRET` | Secreto aleatorio de autenticación; obligatorio, fuera del repositorio |
| `BETTER_AUTH_URL` | URL base de autenticación; local: `http://localhost:3000` |
| `FRONTEND_URL` | Origen permitido y base de enlaces; local: `http://localhost:5173` |
| `JUDGE_INVITATION_TTL_HOURS` | Vigencia de invitaciones de jurados y perfiles operativos; `72` horas |
| `EMAIL_PROVIDER` | `console` solo fuera de producción; `smtp` o `gmail`. El piloto Render usa `gmail` |
| `EMAIL_FROM` | Remitente obligatorio para SMTP/Gmail; en Gmail, cuenta autorizada o alias permitido |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` | Obligatorios con `EMAIL_PROVIDER=gmail`; solo backend, nunca `VITE_*` |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` | Credenciales y servidor requeridos para SMTP |
| `SMTP_PORT` | Puerto SMTP; `587` |
| `SMTP_SECURE` | TLS directo si vale exactamente `true`; de lo contrario `false` |

En desarrollo, `console` expone el OTP y los datos de recuperación/invitación en la terminal: tratá esos logs como sensibles. En producción ese proveedor se rechaza. OTP, invitaciones y recuperación comparten `src/email/delivery.js`: un fallo de SMTP/Gmail devuelve `EMAIL_DELIVERY_FAILED`, sin imprimir códigos, enlaces sensibles ni respuestas del proveedor. No existe fallback de producción a consola.

Gmail usa OAuth para renovar el access token y enviar MIME por HTTPS. No configurar un access token temporal como refresh token, ni una contraseña SMTP como client secret. No hay reenvío automático ante timeout ambiguo: el mensaje podría haberse enviado. Los pasos de autorización y los errores `redirect_uri_mismatch`/`access_denied` están en [correo y diagnóstico](#correo-y-diagnóstico).

El registro libre por `/api/auth/sign-up/email` está bloqueado. Las cuentas se crean mediante los circuitos administrativos, invitaciones, seed local o bootstrap autorizado. Better Auth mantiene las sesiones; `user_role` mantiene los roles de dominio y los middlewares consultan esos permisos.

### Seed, bootstrap y pruebas de límites

| Variables | Uso |
| --- | --- |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_NAME` | Identidad ADMIN obligatoria del fixture integral |
| `SEED_DEMO_PASSWORD` | Contraseña común de las cuentas ficticias, 8–128 caracteres |
| `SEED_ADMIN_PASSWORD` | Respaldo si `SEED_DEMO_PASSWORD` no está definida; una cadena vacía no activa el respaldo |
| `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_PASSWORD` | Primer administrador de producción; solo para el bootstrap |
| `ENABLE_RATE_LIMIT_TESTS` | Permite ejercitar los limitadores con `NODE_ENV=test`; control interno de pruebas |

## Scripts disponibles

Todos se ejecutan desde `api/`.

| Comando | Efecto |
| --- | --- |
| `npm run dev` | Node con `--watch` |
| `npm start` | Servidor sin watch |
| `npm run auth:migrate` | Migraciones Better Auth mediante CLI fijada en `auth@1.6.27` |
| `npm run db:migrate` | Migraciones SQL propias, incrementales |
| `npm run seed:event:full` | Fixture integral, solo desarrollo/pruebas |
| `npm run bootstrap:admin` | Primer ADMIN, solo producción y una vez |
| `npm test` | Tests HTTP, DB y sorteo; archivos serializados con `--test-concurrency=1` |
| `npm run db:test` | Tests de persistencia en `src/db/tests/` |
| `npm run audit:verify` | Verifica la cadena **general** de auditoría en `DATABASE_URL` |
| `npm run db:backup -- <archivo.dump>` | Backup con Bash/`pg_dump`; requiere `DATABASE_URL` exportada |
| `npm run db:restore -- <archivo.dump> <URL-destino>` | Restauración **destructiva**; ver advertencias antes de usar |

`pretest` y `predb:test` comprueban que exista `TEST_DATABASE_URL`. No hay scripts de build, lint o typecheck en este paquete.

## Base de datos

- `src/db/migrate.js` ordena los archivos SQL, usa advisory lock, aplica cada migración en una transacción y registra versión/checksum SHA-256 en `schema_migrations`.
- **No editar migraciones aplicadas:** el runner rechaza cambios con `MIGRATION_CHECKSUM_MISMATCH`. Agregá una nueva migración incremental.
- El árbol contiene versiones desde `001` hasta `086`, sin archivo `071`: son 85 archivos SQL, no 86. No renumerarlos para eliminar el salto.
- Las tablas incluyen roles, eventos/jornadas, catálogos de competencia, perfiles e invitaciones, asignaciones, planillas/puntajes, ventanas de votación, penalizaciones, liberaciones, snapshots y actas.
- Triggers y restricciones protegen historia, pertenencia al evento, cambios de estado e inmutabilidad. No son validaciones opcionales que pueda reemplazar el cliente.
- `src/db/transaction.js` centraliza transacciones con reintentos limitados para deadlock `40P01` y difusión de eventos después del commit. Los módulos también contienen wrappers transaccionales propios: seguí el patrón del flujo afectado.

### Evento integral de desarrollo

Después de las migraciones, configurá `NODE_ENV=development` o `test`, las variables `SEED_ADMIN_*` de identidad y la contraseña común. Ejecutá:

```powershell
npm run seed:event:full
```

`src/db/seeds/full-event.*` define datos ficticios: tres jornadas competitivas, siete comparsas, tres especialidades, 36 rubros (25 nominativos y 11 aleatorios), 77 nominaciones con nombres marcados `DEMO PLACEHOLDER`, nueve jurados y cuentas ADMIN/ESCRIBANO/VEEDOR. Esas nominaciones existen solo para que el seed sintético cumpla readiness; no representan integrantes ni participantes oficiales. El evento queda activo, `CONFIGURING`, sin votación abierta, votos, resultados ni penalizaciones. Las planillas se crean al abrir las jornadas, no durante el seed.

La programación usa fechas y orden simulados; conserva timestamp completo y zona `America/Argentina/Cordoba`, incluso al pasar la medianoche. No reutilizar estos datos como calendario oficial.

El seed ejecuta las migraciones de dominio, pero no sustituye la preparación inicial de Better Auth. Evita duplicar el fixture y rechaza deriva, conflictos de identidad y eventos iniciados/inactivos. **Reejecutarlo puede cambiar contraseñas y revocar sesiones del fixture.** No es una restauración ni elimina datos para reparar conflictos. Las identidades usan transacciones propias: la configuración del evento es transaccional, no toda la ejecución como una sola unidad.

### Administrador inicial de producción

Operación explícita, nunca parte automática del desarrollo:

1. Preparar ambas familias de migraciones contra el destino autorizado.
2. Configurar `NODE_ENV=production`, autenticación, un proveedor real de correo (`gmail` en el piloto) y `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_PASSWORD` en el entorno seguro.
3. Ejecutar `npm run bootstrap:admin` desde `api/`.
4. Completar el segundo factor antes de usar las rutas administrativas y retirar las credenciales de bootstrap del entorno cuando ya no sean necesarias.

El script usa bloqueo y `bootstrap_state`; rechaza un bootstrap repetido o un email existente. No se debe eludir ese control ni reutilizar el seed de pruebas en producción.

## Organización del código

| Ruta | Responsabilidad |
| --- | --- |
| `src/server.js` | dotenv, Better Auth, listener HTTP y apagado de servidor/pool |
| `src/app.js` | Factoría Express, Helmet, límite JSON de 100 KB, rate limiting, origen, routers y errores |
| `src/auth/` | Cuentas, sesión, segundo factor, roles e invitaciones autorizadas |
| `src/config/trust-proxy.js` | Validación de proxies confiables |
| `src/routes/` | Contratos HTTP y traducción de errores en `http-errors.js` |
| `src/modules/` | Servicios por dominio; algunos módulos incorporan controllers |
| `src/audit/` | Sanitización, JSON canónico y hashes de auditoría general/ceremonial |
| `src/db/` | Pool, transacciones, migraciones, seed y tests SQL |
| `src/scripts/`, `scripts/` | Comandos Node y herramientas Bash operativas |
| `src/tests/` | Pruebas HTTP, permisos, seguridad y regresiones |

## Superficies HTTP

La fuente exacta de métodos y payloads es `src/routes/*.routes.js`; la tabla agrupa las rutas principales, no reemplaza sus contratos.

| Base / recurso | Uso y acceso |
| --- | --- |
| `GET /health` | Liveness público; no consulta DB |
| `/api/auth/*` | Sesión, contraseña, segundo factor y recuperación de Better Auth |
| `/api/v1/me` | Sesión operativa, usuario y roles con 2FA |
| `GET /api/v1/events` | Catálogo global para ADMIN o limitado a asignaciones activas de ADMIN_EVENT; requiere sesión y 2FA. |
| `GET /api/v1/events/:eventId` | Detalle para ADMIN global o ADMIN_EVENT con asignación vigente al evento exacto, incluidos inactivos; sesión y 2FA. |
| `GET /api/v1/events/:eventId/readiness` | Preparación oficial para ADMIN global o ADMIN_EVENT con asignación vigente exacta, incluidos inactivos; sesión y 2FA; solo lectura. |
| `GET /api/v1/events/:eventId/categories` | Listado para ADMIN global o ADMIN_EVENT con asignación activa al evento exacto, incluidos inactivos; sesión y 2FA; admite `?eligible=true`. |
| `POST /api/v1/events/:eventId/categories` | Alta para ADMIN global o ADMIN_EVENT con asignación vigente al evento exacto activo; sesión y 2FA; conserva guardas de configuración. |
| `PATCH /api/v1/categories/:categoryId` | Actualización para ADMIN global o ADMIN_EVENT con asignación vigente al evento propietario persistido y activo; sesión y 2FA; conserva guardas y campos de categoría. |
| `GET /api/v1/events/:eventId/troupes` | Listado para ADMIN global o ADMIN_EVENT con asignación activa al evento exacto, incluso inactivo; sesión y 2FA; metadatos de categoría y logo, sin bytes. |
| `POST /api/v1/events/:eventId/troupes` | Alta para ADMIN global o ADMIN_EVENT con asignación vigente al evento exacto activo; sesión y 2FA; categoría activa del mismo evento y guardas de configuración. |
| `PATCH /api/v1/troupes/:troupeId` | Actualización para ADMIN global o ADMIN_EVENT con asignación vigente al evento propietario persistido y activo; sesión y 2FA; conserva pertenencia de categoría y guardas existentes. |
| `PUT /api/v1/troupes/:troupeId/logo` | Carga binaria para ADMIN global o ADMIN_EVENT con asignación vigente al evento propietario persistido y activo; sesión y 2FA; conserva validación de contenido, MIME, límite y SHA-256. |
| `DELETE /api/v1/troupes/:troupeId/logo` | Elimina el logo para ADMIN global o ADMIN_EVENT con asignación vigente al evento propietario persistido y activo; sesión y 2FA; operación y auditoría atómicas. |
| `/api/v1/events/:eventId`, catálogos y `/schedule` | Configuración; en general ADMIN + 2FA. `GET` detalle/readiness/jornadas, `POST` jornadas y `PATCH` evento/jornada, `DELETE` jornada admiten el alcance delegado descrito abajo. |
| `DELETE /api/v1/events/:eventId` | Baja lógica global; requiere ADMIN + sesión y 2FA |
| `/api/v1/users`, `/judges`, `/operational-profiles` | Gestión administrativa de identidades y permisos |
| `/api/v1/judge-invitations`, `/operational-invitations`, `/invitations` | Inspección/aceptación por secreto o token según el circuito |
| `/api/v1/events/:eventId/judge-assignments` | Asignaciones y cupos; administración |
| `GET /api/v1/events/:eventId/admin-assignments` | Consulta de delegaciones ADMIN_EVENT vigentes; ADMIN global + sesión y 2FA |
| `PUT /api/v1/events/:eventId/admin-assignments/:userId` | Concesión/reactivación de ADMIN_EVENT; ADMIN global + sesión y 2FA |
| `DELETE /api/v1/events/:eventId/admin-assignments/:userId` | Revocación de ADMIN_EVENT; ADMIN global + sesión y 2FA |
| `POST /api/v1/events/:eventId/open` | Apertura idempotente de evento; ADMIN + 2FA; requiere `Idempotency-Key` UUID |
| `GET /api/v1/events/:eventId/open-operations/:operationId` | Consulta de resultado de apertura (applied/rejected/pending); ADMIN + 2FA |
| `/api/v1/events/:eventId/nights/:nightId/voting/*` | Apertura/cierre ADMIN; consulta de estado autorizada |
| `/api/v1/judge/assignments`, `/judge/ballots`, `/judge/session-status` | Asignaciones, planillas y estado de fin del evento del jurado habilitado |
| `/api/v1/monitor/*` | Monitor y stream SSE; ADMIN o VEEDOR registrado, con 2FA |
| `/api/v1/events/:eventId/penalties` | Penalizaciones; ADMIN o COMISARIO, con 2FA |
| `/api/v1/events/:eventId/results` | Consulta de resultados; ADMIN, SCRUTINEER o ESCRIBANO |
| `/api/v1/events/:eventId/results/release` | Liberación; SCRUTINEER o ESCRIBANO, con 2FA |
| `/api/v1/events/:eventId/scrutiny-record` | Consulta/certificación según permisos de escrutinio |
| `/api/v1/public/events`, `/public/events/:eventId/results`, `/public/stream` | Portal público de resultados liberados |

`GET /api/v1/events/:eventId/categories` requiere sesión y 2FA; `ADMIN` conserva lectura global con o sin asignación, mientras que `ADMIN_EVENT` debe tener una asignación activa al evento exacto, incluso si está inactivo. Devuelve HTTP 200 con una lista directa de `{ "id", "eventId", "name", "code", "displayOrder", "active" }`, ordenada por `displayOrder`; `?eligible=true` limita la lista a categorías activas. Query, body y cabeceras con identidad, rol o evento no cambian la autorización ni el evento de la ruta. Sin sesión devuelve HTTP 401 `UNAUTHENTICATED`; sin 2FA HTTP 403 `TWO_FACTOR_REQUIRED`; sin ADMIN ni asignación exacta vigente HTTP 403 `ADMIN_REQUIRED`, sin confirmar existencia o detalles del evento ajeno. Para ADMIN, un evento inexistente conserva HTTP 404 `EVENT_NOT_FOUND`. Es una lectura sin mutaciones ni auditoría de modificación.

`POST /api/v1/events/:eventId/categories` requiere sesión y 2FA. `ADMIN` conserva alcance global con o sin asignación (también si tiene ambos roles); `ADMIN_EVENT` requiere asignación activa vigente al evento exacto de la ruta y que ese evento esté activo. La autorización se reevalúa en cada solicitud dentro de la misma transacción que el alta y `CATEGORY_CREATED`, con actor de sesión. Revocar una asignación deniega la siguiente alta en ese evento sin afectar otras asignaciones ni el alcance global ADMIN. Body, query y cabeceras con `eventId`, identidad, rol o permisos no sustituyen la ruta ni conceden acceso; un `client` enviado por el cliente tampoco sustituye la conexión transaccional.

El payload conserva `name` (texto no vacío), `code` (texto no vacío, opcional: si es falsy se genera desde el nombre, sin acentos, en mayúsculas, separadores `_` y hasta 64 caracteres) y `displayOrder` (entero positivo, opcional: siguiente orden del evento). Nombre y código se recortan; código y orden deben ser únicos por evento. Devuelve HTTP 201 con el objeto directo `{ "id", "eventId", "name", "code", "displayOrder", "active" }` (`active: true`). Se conservan `requireConfiguringEvent` y las restricciones persistentes: tanto ADMIN como ADMIN_EVENT requieren un evento en `CONFIGURING` y activo para esta alta; no se agrega una regla nueva de lifecycle.

Sin sesión (también vencida) responde HTTP 401 `UNAUTHENTICATED`; sin 2FA, HTTP 403 `TWO_FACTOR_REQUIRED`; sin permiso vigente exacto o con evento inactivo para ADMIN_EVENT, HTTP 403 `ADMIN_REQUIRED`, igual para evento ajeno e inexistente, sin revelar detalles. Para ADMIN, evento inexistente conserva HTTP 404 `EVENT_NOT_FOUND`. Campos inválidos o UUID inválido autorizado responden HTTP 400 `VALIDATION_ERROR` (con `message` para validaciones de texto/orden); duplicados, HTTP 409 `RESOURCE_CONFLICT`; guardas de configuración, HTTP 409 `EVENT_LOCKED`; fallos inesperados, HTTP 500 `INTERNAL_ERROR`. Rechazos y fallos de alta/auditoría no dejan categoría ni auditoría parcial. Las delegaciones de categorías son específicas de cada ruta; las demás rutas administrativas conservan sus permisos actuales.

`PATCH /api/v1/categories/:categoryId` requiere sesión y 2FA. `ADMIN` conserva alcance global con o sin asignación y prevalece si también tiene acceso ADMIN_EVENT. Para `ADMIN_EVENT`, la API resuelve el evento propietario desde la categoría persistida identificada por el **ID de ruta** y exige asignación activa exacta y evento activo en cada solicitud. La categoría se bloquea mientras se autoriza y actualiza; evento y asignación se revalidan/bloquean dentro del mismo cliente transaccional. Body, query y cabeceras con `eventId`, `categoryId`, identidad, rol o permisos no cambian propietario, recurso ni actor; tampoco un `client` del body reemplaza la conexión. Revocar A impide el siguiente PATCH delegado a A sin afectar B ni ADMIN global.

El payload admite los campos opcionales `name`, `code` (textos no vacíos, recortados), `displayOrder` (entero positivo) y `active` (booleano). Los omitidos conservan su valor; PATCH **no genera** un código desde el nombre. Código y orden siguen siendo únicos por evento. Devuelve HTTP 200 con el objeto directo `{ "id", "eventId", "name", "code", "displayOrder", "active" }`. `active` aquí es la actividad de la categoría, no del evento: el delegado autorizado puede desactivarla y reactivarla. PostgreSQL sigue exigiendo evento en `CONFIGURING`; `OPEN`/`CLOSED` devuelven HTTP 409 `EVENT_LOCKED` para actores autorizados. A diferencia del POST, ADMIN conserva la actualización de categorías en un evento inactivo en configuración, sin exigir reactivar ese evento.

Sin sesión (incluida vencida), HTTP 401 `UNAUTHENTICATED`; sin 2FA, HTTP 403 `TWO_FACTOR_REQUIRED`. Sin permiso exacto vigente o con evento inactivo para ADMIN_EVENT, HTTP 403 `ADMIN_REQUIRED`, también para categoría ajena o inexistente, sin divulgar existencia ni detalles antes de autorizar. ADMIN conserva HTTP 404 `CATEGORY_NOT_FOUND` para ID inexistente y HTTP 400 `VALIDATION_ERROR` para UUID inválido. Campos inválidos autorizados devuelven HTTP 400 `VALIDATION_ERROR` con `message`; duplicados, HTTP 409 `RESOURCE_CONFLICT`; fallos inesperados, HTTP 500 `INTERNAL_ERROR`. La actualización y `CATEGORY_UPDATED`, con actor de sesión, se confirman en la misma transacción; denegaciones y fallos de escritura/auditoría no dejan cambios ni evidencia parcial. Solo este PATCH se delega antes del catch-all ADMIN; comparsas, logos, apertura y programación mantienen sus permisos independientes.

`GET /api/v1/events/:eventId/troupes` requiere sesión y 2FA. `ADMIN` conserva alcance global con o sin asignación y prevalece si también tiene acceso ADMIN_EVENT. `ADMIN_EVENT` requiere asignación activa al evento exacto de la ruta, incluso si ese evento tiene `active=false`; el permiso se consulta en servidor en cada solicitud. Revocar A impide la siguiente lectura delegada de A sin afectar una asignación independiente a B ni ADMIN global. Identidad, rol, permisos o `eventId` en body/query/cabeceras no conceden acceso ni sustituyen el evento de ruta.

Devuelve HTTP 200 con una lista directa ordenada por `name`, con los campos exactos `{ "id", "eventId", "categoryId", "name", "active", "brandColor", "hasLogo", "logoSha256", "categoryName", "categoryCode", "categoryActive" }`. Incluye comparsas y categorías inactivas: sus indicadores no son la actividad del evento. Sin color/logo conserva `brandColor: null`, `hasLogo: false`, `logoSha256: null`; nunca devuelve bytes ni `logoData`. Un evento autorizado sin comparsas devuelve `[]`. No admite nuevos filtros, paginación ni parámetros de consulta (tampoco aplica `eligible` del listado de categorías).

Sin sesión (incluida vencida), HTTP 401 `UNAUTHENTICATED`; sin 2FA, HTTP 403 `TWO_FACTOR_REQUIRED`; sin ADMIN ni asignación exacta vigente, HTTP 403 `ADMIN_REQUIRED`, igual para evento ajeno o inexistente, sin divulgar detalles. ADMIN conserva HTTP 404 `EVENT_NOT_FOUND` para evento inexistente y HTTP 400 `VALIDATION_ERROR` para UUID inválido. Un fallo inesperado devuelve HTTP 500 `INTERNAL_ERROR`, nunca una lista vacía sustituta. Es una lectura sin escrituras ni auditoría de modificación. GET/POST/PATCH de comparsas y PUT/DELETE de logo se delegan por ruta antes del catch-all según sus políticas específicas. GET del logo conserva su acceso operativo con sesión y 2FA, incluido Jurado.

`POST /api/v1/events/:eventId/troupes` requiere sesión y 2FA. `ADMIN` conserva alcance global con o sin asignación y prevalece si también tiene acceso ADMIN_EVENT. `ADMIN_EVENT` exige asignación activa vigente al evento exacto de la **ruta** y evento activo. La API reevalúa el permiso en cada solicitud y bloquea evento/asignación durante la escritura delegada. Revocar A impide la siguiente alta en A sin afectar una asignación independiente a B ni ADMIN global. Body, query y cabeceras con `eventId`, identidad, rol o permisos no autorizan ni desplazan el evento de ruta; un `client` enviado tampoco sustituye la conexión transaccional.

El payload admite `name` (texto no vacío, recortado), `categoryId` (UUID de categoría activa del mismo evento) y `brandColor` opcional (`#RRGGBB`, recortado y conservando mayúsculas/minúsculas; omitido, nulo o vacío se guarda como `null`). No acepta categoría como texto libre. Campos de control como `active`, `id` o metadatos/bytes de logo no modifican los valores iniciales. Devuelve HTTP 201 con el objeto directo `{ "id", "eventId", "categoryId", "name", "active", "brandColor", "hasLogo", "logoSha256", "categoryName", "categoryCode", "categoryActive" }`: `active: true`, `hasLogo: false`, `logoSha256: null`, sin bytes. Se conservan las guardas del servicio y PostgreSQL: evento activo en `CONFIGURING` para ambos actores, categoría activa y FK compuesta categoría/evento. Tener asignación a ambos eventos no permite una relación cruzada.

Sin sesión (incluida vencida), HTTP 401 `UNAUTHENTICATED`; sin 2FA, HTTP 403 `TWO_FACTOR_REQUIRED`. Sin permiso exacto vigente o con evento inactivo para ADMIN_EVENT, HTTP 403 `ADMIN_REQUIRED`, igual para evento ajeno e inexistente y antes de validar los campos de negocio. ADMIN conserva HTTP 404 `EVENT_NOT_FOUND` para evento inexistente. UUID/campos inválidos autorizados devuelven HTTP 400 `VALIDATION_ERROR` (con `message` para texto/color); categoría inexistente o referencia cruzada, HTTP 409 `INVALID_REFERENCE`; categoría inactiva, HTTP 409 `CATEGORY_INACTIVE`; evento no configurable (`OPEN`/`CLOSED`, o inactivo para ADMIN), HTTP 409 `EVENT_LOCKED`; fallo inesperado, HTTP 500 `INTERNAL_ERROR`. Autorización, alta y `TROUPE_CREATED` con actor de sesión comparten la misma transacción; rechazos y fallos de alta/auditoría no dejan comparsa, relación ni evidencia parcial. PATCH y escrituras de logo mantienen sus permisos independientes.

`PATCH /api/v1/troupes/:troupeId` requiere sesión y 2FA. `ADMIN` conserva alcance global con o sin asignación y prevalece si también tiene acceso ADMIN_EVENT. Para `ADMIN_EVENT`, la API obtiene el evento propietario desde la comparsa persistida identificada por el **ID de ruta** y exige asignación activa exacta y evento activo en cada solicitud. Bloquea la comparsa mientras autoriza y actualiza; revalida/bloquea evento y asignación en la misma transacción. Body, query y cabeceras con `eventId`, `troupeId`, identidad, rol o permisos no autorizan ni cambian recurso, propietario o actor; un `client` enviado tampoco reemplaza la conexión transaccional. Revocar A deniega el siguiente PATCH delegado a A sin afectar B ni ADMIN global.

El payload admite los campos opcionales `name` (texto no vacío, recortado), `categoryId` (UUID de categoría del mismo evento), `active` (booleano de la comparsa, no del evento) y `brandColor` (`#RRGGBB`, recortado y conservando mayúsculas/minúsculas). Los omitidos conservan su valor; color nulo o vacío lo elimina. Devuelve HTTP 200 con el objeto directo `{ "id", "eventId", "categoryId", "name", "active", "brandColor", "hasLogo", "logoSha256" }`, sin metadatos de categoría ni bytes del logo; no modifica el logo. La FK categoría/evento impide relaciones cruzadas incluso con ambas asignaciones. Se conservan los triggers: una categoría nueva debe estar activa; con la categoría original inactiva se permite mantener la comparsa inactiva o desactivarla, pero no reactivarla. `OPEN`/`CLOSED` siguen bloqueando UPDATE con HTTP 409 `EVENT_LOCKED`. A diferencia del POST, ADMIN conserva PATCH en evento inactivo en `CONFIGURING`; el delegado no puede mutar ese evento.

Sin sesión (incluida vencida), HTTP 401 `UNAUTHENTICATED`; sin 2FA, HTTP 403 `TWO_FACTOR_REQUIRED`. Sin permiso exacto vigente o con evento inactivo para ADMIN_EVENT, HTTP 403 `ADMIN_REQUIRED`, igual para comparsa ajena, inexistente o ID inválido, antes de validar campos. ADMIN conserva HTTP 404 `TROUPE_NOT_FOUND` para ID inexistente con campos válidos y HTTP 400 `VALIDATION_ERROR` para UUID inválido; las validaciones de campos previas al UPDATE mantienen su precedencia. Campos inválidos autorizados devuelven HTTP 400 `VALIDATION_ERROR` (con `message` para texto/booleano/color); categoría inexistente o referencia cruzada, HTTP 409 `INVALID_REFERENCE`; categoría inactiva no admisible, HTTP 409 `CATEGORY_INACTIVE`; fallo inesperado, HTTP 500 `INTERNAL_ERROR`. Autorización, actualización y `TROUPE_UPDATED` con actor de sesión comparten la transacción; rechazos y fallos de UPDATE/auditoría no dejan cambios ni evidencia parcial. Este PATCH se delega antes del catch-all; PUT/DELETE de logo tienen las políticas independientes siguientes y GET de logo conserva acceso operativo con sesión y 2FA.

`PUT /api/v1/troupes/:troupeId/logo` requiere sesión y 2FA. `ADMIN` conserva alcance global con o sin asignación, también si tiene ambos accesos, y puede cargar logos en eventos inactivos en `CONFIGURING`. `ADMIN_EVENT` requiere asignación vigente exacta y evento activo: el propietario se obtiene de la comparsa persistida identificada por el **ID de ruta**. La comparsa se bloquea y evento/asignación se revalidan y bloquean en la misma transacción que el binario y `TROUPE_LOGO_UPDATED`, con actor de sesión. Revocar A deniega el siguiente PUT delegado a A sin afectar B ni ADMIN. Identidad, rol, permisos, `eventId`, `troupeId`, actor o `client` enviados en body/query/cabeceras no conceden acceso ni sustituyen ruta, propietario, conexión o actor. La actividad de la comparsa no es la del evento: una comparsa inactiva admite la carga autorizada.

El cuerpo es el archivo binario, no JSON ni multipart. Conserva el límite de **1048576 bytes** y la detección por firma de PNG, JPEG, WebP o SVG; no implica decodificación completa de la imagen. Si se declara `Content-Type`, debe coincidir exactamente con el MIME detectado; sin cabecera se utiliza el detectado. Se almacenan los bytes, MIME, SHA-256 de esos bytes y fecha de actualización. Devuelve HTTP 200 con `{ "id", "eventId", "name", "hasLogo": true, "logoSha256" }`, sin bytes. No modifica categoría, nombre ni actividad. Los triggers existentes siguen bloqueando PUT en `OPEN`/`CLOSED` con HTTP 409 `EVENT_LOCKED` para actores autorizados; no se agrega una regla de lifecycle.

Sin sesión (incluida vencida), HTTP 401 `UNAUTHENTICATED`; sin 2FA, HTTP 403 `TWO_FACTOR_REQUIRED`. Sin permiso exacto vigente o con evento inactivo para ADMIN_EVENT, HTTP 403 `ADMIN_REQUIRED`, igual para comparsa ajena, inexistente o ID inválido, sin divulgar detalles. El parser binario mantiene HTTP 413 `PAYLOAD_TOO_LARGE` al superar el límite antes de la autorización transaccional. Una carga autorizada vacía, no binaria, con firma inválida o MIME incompatible devuelve HTTP 400 `VALIDATION_ERROR` con `message`. ADMIN conserva HTTP 404 `TROUPE_NOT_FOUND` para ID inexistente y carga válida, y HTTP 400 `VALIDATION_ERROR` para UUID inválido; la validación del contenido precede al UPDATE y a esos errores de recurso. Fallos inesperados devuelven HTTP 500 `INTERNAL_ERROR`. Rechazos y fallos de UPDATE/auditoría no dejan bytes, hash, metadatos ni evidencia parcial.

`DELETE /api/v1/troupes/:troupeId/logo` requiere sesión y 2FA. `ADMIN` conserva alcance global con o sin asignación y prevalece cuando tiene ambos accesos, incluso en evento inactivo en `CONFIGURING`. `ADMIN_EVENT` requiere asignación vigente exacta y evento activo: el propietario se resuelve desde la comparsa persistida identificada por **`:troupeId` de ruta**, no desde body/query/cabeceras. Identidad, rol, permisos, `userId`, `actor`, `actorUserId`, `client`, `troupeId` o `eventId` enviados por el cliente no autorizan ni sustituyen propietario, ruta, conexión o actor, aun con asignaciones a ambos eventos. Una comparsa inactiva admite eliminación autorizada; no se confunde su actividad con la del evento. Revocar A deniega el siguiente DELETE delegado a A sin afectar B ni ADMIN.

No requiere payload ni clave de idempotencia. Devuelve HTTP 200 con el objeto directo `{ "id", "eventId", "name", "hasLogo": false }`, sin `logoSha256` ni bytes. Pone en `null` bytes, MIME, SHA-256 y fecha del logo; actualiza `updated_at` sin modificar los demás campos de la comparsa. Si no hay logo o se repite DELETE, conserva HTTP 200 y genera una nueva auditoría por cada solicitud aceptada: no introduce deduplicación. La comparsa se bloquea y evento/asignación se revalidan y bloquean en la misma transacción que la eliminación y `TROUPE_LOGO_DELETED`, atribuido al actor de sesión. Las guardas persistentes siguen rechazando UPDATE en `OPEN`/`CLOSED` con HTTP 409 `EVENT_LOCKED` para ambos actores autorizados.

Sin sesión (incluida vencida), HTTP 401 `UNAUTHENTICATED`; sin 2FA, HTTP 403 `TWO_FACTOR_REQUIRED`. Sin permiso exacto vigente, asignación revocada o evento inactivo para ADMIN_EVENT, HTTP 403 `ADMIN_REQUIRED`, igual para comparsa ajena, inexistente o ID inválido, sin divulgar detalles. ADMIN conserva HTTP 404 `TROUPE_NOT_FOUND` para ID inexistente y HTTP 400 `VALIDATION_ERROR` para UUID inválido. Fallos inesperados devuelven HTTP 500 `INTERNAL_ERROR`; rechazos y fallos tras UPDATE o durante auditoría no dejan cambios en logo/metadatos ni evidencia parcial. Solo esta ruta DELETE se delega antes del catch-all: los demás prefijos y rutas excluidas mantienen sus permisos.

`GET /api/v1/troupes/:troupeId/logo` permanece fuera de esta delegación: sesión y 2FA, incluido Jurado sin asignación administrativa, bytes exactos con su `Content-Type`, ETag entre comillas basado en SHA-256 y `Cache-Control: private, max-age=86400`; ETag coincidente devuelve 304 sin cuerpo. Conserva `nosniff` y CSP de aislamiento SVG. Sin logo responde HTTP 404 `TROUPE_LOGO_NOT_FOUND`; comparsa inexistente, HTTP 404 `TROUPE_NOT_FOUND`.

Los errores usan códigos de dominio traducidos por `http-errors.js`; los inesperados devuelven `INTERNAL_ERROR`. Las rutas privadas no deben cachearse. Las respuestas públicas de resultados son una excepción explícita: usan caché corta y ETag; el stream usa `no-cache`.

Los contratos actuales no tienen un único envoltorio universal: hay objetos, listas y errores `{ code, ... }` según la ruta. Consultar el handler y sus tests antes de implementar consumidores; no suponer `{ data }` o `{ error }` para todos los endpoints.

`GET /api/v1/events` requiere sesión autenticada y 2FA vigente. `ADMIN` conserva el catálogo global; `ADMIN_EVENT` recibe únicamente los eventos con asignación activa vigente, incluidos los inactivos. Devuelve HTTP 200 con una lista directa de `{ "id", "name", "status", "active" }` en el orden existente; una lista legítimamente vacía sigue siendo `[]`. Una cuenta sin ADMIN global ni asignaciones activas —también después de revocar la última— recibe HTTP 403 `{ "code": "ADMIN_REQUIRED" }`, no un catálogo vacío. Sin sesión devuelve HTTP 401 `UNAUTHENTICATED`; sin 2FA HTTP 403 `TWO_FACTOR_REQUIRED`. Los roles e identidades de query/body no otorgan acceso. Es una lectura privada y no modifica datos ni genera auditoría de modificación.

El tipo reglamentario de un rubro es `NOMINATIVE` (Nominativo) o `RANDOM` (Aleatorio). Los rubros con `evaluationTarget: "NOMINATION"` requieren nominados antes de abrir el evento. ADMIN puede gestionarlos mientras el evento está en configuración con `POST /api/v1/rubrics/:rubricId/nominations` (`eventTroupeId`, `displayName`) y `PATCH /api/v1/nominations/:nominationId` (`active`). Para rubros `RANDOM` se permiten hasta tres nominados activos por comparsa; los nombres activos no se pueden duplicar dentro del mismo rubro y comparsa. Cada nominado genera decisiones independientes en las planillas. Los votos de resultados se acumulan por nominado para el ranking del rubro; solo los rubros `NOMINATIVE` aportan al total de Comparsa Ganadora y, si tienen varios nominados, se toma el puntaje más alto de esa comparsa para ese rubro. Los rubros `RANDOM` quedan fuera de ese total.

`GET /api/v1/events/:eventId` exige sesión y 2FA vigentes antes de validar el UUID y resolver permisos desde el servidor en cada solicitud. `ADMIN` conserva acceso global con o sin asignación; `ADMIN_EVENT` solo accede con asignación activa al evento exacto, también inactivo y en cualquiera de sus estados (`CONFIGURING`, `OPEN`, `CLOSED`). Devuelve HTTP 200 con el objeto directo `{ "id", "name", "status", "active" }` persistido, sin readiness ni recibos de apertura. El único input es el UUID de la ruta; no incorpora filtros ni parámetros de consulta, y los roles, identidades o eventos enviados por query/body no conceden permisos ni cambian el recurso solicitado. Sin sesión (incluida vencida) responde HTTP 401 `{ "code": "UNAUTHENTICATED" }`; sin 2FA, HTTP 403 `TWO_FACTOR_REQUIRED`; UUID mal formado, HTTP 400 `VALIDATION_ERROR`. Sin asignación exacta vigente ni ADMIN global responde HTTP 403 `ADMIN_REQUIRED`, incluso para un UUID válido inexistente, sin confirmar existencia; ADMIN recibe HTTP 404 `EVENT_NOT_FOUND` si no existe. Un fallo inesperado responde HTTP 500 `INTERNAL_ERROR`, nunca datos sustitutos. Los errores mantienen `{ "code": "..." }`. Una revocación impide la siguiente lectura delegada de ese evento sin afectar otras asignaciones ni el alcance ADMIN. Conserva `Cache-Control: no-store, private`: es solo lectura, sin escrituras ni auditoría de modificación, no necesita `Idempotency-Key` y no abre, reproduce ni resuelve operaciones de apertura inciertas. Readiness, apertura y consulta de operaciones conservan sus permisos independientes.

`GET /api/v1/events/:eventId/readiness` valida sesión y 2FA antes del UUID y resuelve el permiso en servidor en cada solicitud: `ADMIN` mantiene alcance global con o sin delegación; `ADMIN_EVENT` requiere asignación activa al evento exacto, también si está inactivo. Un rol especializado por sí solo no concede acceso. El único input es el UUID de ruta: query, body y cabeceras de identidad/rol/permisos no conceden acceso ni seleccionan otro evento; no se añaden filtros, búsqueda ni métricas.

Devuelve HTTP 200 con el objeto directo oficial completo: `ready`, `missing`, `incompleteTroupes` (`id`, `name`), `incompleteRubrics` (`id`, `name`, `code`), `incompleteSchedules` (`nightId`, `nightName`), `incompleteNominations` (`rubricId`, `rubricName`, `troupeId`, `troupeName`), `nightsWithoutJury` (`nightId`, `nightName`, `displayOrder`) y `humanMessages`. Conserva las reglas de preparación existentes: `missing` o `humanMessages` vacíos no bastan para `ready: true` si hay detalles incompletos. No agrega `eventId`, lifecycle, porcentajes ni cobertura de jurado por especialidad. El resultado no sustituye estado/actividad ni garantiza una apertura futura.

Los errores de readiness mantienen `{ "code": "..." }`: HTTP 401 `UNAUTHENTICATED` sin sesión o con sesión vencida; HTTP 403 `TWO_FACTOR_REQUIRED` sin 2FA; HTTP 400 `VALIDATION_ERROR` por UUID mal formado después de esos controles; HTTP 403 `ADMIN_REQUIRED` sin ADMIN global ni asignación exacta vigente, incluso para UUID válido inexistente, sin confirmar existencia ni divulgar detalles. ADMIN recibe HTTP 404 `EVENT_NOT_FOUND` ante evento inexistente. Fallos inesperados devuelven HTTP 500 `INTERNAL_ERROR`, nunca preparación favorable ni bloqueos vacíos sustitutos. Revocar A deniega la siguiente lectura delegada de A sin afectar B ni el alcance ADMIN global. Conserva `Cache-Control: no-store, private`, también en errores: es un GET sin escrituras de dominio/evidencia ni auditoría de modificación, no requiere `Idempotency-Key`, no abre, reproduce ni consulta recibos de apertura. Apertura, lookup y catálogos/configuración conservan sus permisos independientes.

Las escrituras de `/api/v1` verifican `Origin` contra `FRONTEND_URL`; en producción rechazan ausencia de cualquiera. No hay configuración CORS general para operar el cliente arbitrariamente desde otro origen.

`GET /api/v1/events/:eventId/nights` requiere sesión y 2FA vigentes. `ADMIN` global conserva acceso; `ADMIN_EVENT` solo puede consultar jornadas del evento con asignación activa exacta, incluso cuando ese evento esté inactivo. La respuesta exitosa conserva el contrato existente: una lista directa con `id`, `eventId`, `name`, `displayOrder`, `kind`, `status` y `eventDate`, ordenada por `displayOrder`. UUID mal formado devuelve HTTP 400 `{ "code": "VALIDATION_ERROR" }`; evento inexistente para ADMIN devuelve HTTP 404 `{ "code": "EVENT_NOT_FOUND" }`. Sin sesión responde HTTP 401 `UNAUTHENTICATED`; sin 2FA o sin rol/asignación autorizante responde HTTP 403 (`TWO_FACTOR_REQUIRED` o `ADMIN_REQUIRED`). La falta o revocación de asignación y una asignación a otro evento no divulgan jornadas. Esta lectura permite consultar un evento asignado inactivo, pero no concede permiso para mutarlo; no modifica datos ni genera auditoría de modificación.

`POST /api/v1/events` requiere sesión autenticada, 2FA vigente y rol global `ADMIN`; una asignación activa `ADMIN_EVENT` no autoriza la creación. Con `name` no vacío devuelve HTTP 201 con `{ "id", "name", "status", "active" }` (estado inicial `CONFIGURING`, activo) y confirma el alta junto con `EVENT_CREATED` en la misma transacción, con el actor de la sesión. Un nombre vacío o solo espacios responde HTTP 400 `{ "code": "VALIDATION_ERROR", "message": "name debe ser texto no vacío." }`, sin alta ni auditoría parcial. Sin sesión responde HTTP 401 `UNAUTHENTICATED`; sin 2FA o rol global ADMIN devuelve HTTP 403 (`TWO_FACTOR_REQUIRED` o `ADMIN_REQUIRED`), sin crear evento ni evento de auditoría.

`PATCH /api/v1/events/:eventId` requiere sesión y 2FA vigentes. `ADMIN` global conserva los campos y validaciones existentes, incluido cambiar `active` en ambas direcciones mientras el evento admita la operación. `ADMIN_EVENT` solo puede modificar los campos existentes distintos de `active` en el evento exacto con asignación vigente y mientras el evento esté activo; incluir `active` en el payload se deniega incluso si su valor coincide con el estado actual. Las escrituras aceptadas usan la transacción existente y registran `EVENT_UPDATED` con el actor de la sesión. La respuesta exitosa es el evento `{ "id", "name", "status", "active" }`; input/UUID inválido devuelve HTTP 400 `VALIDATION_ERROR`, evento inexistente para ADMIN devuelve HTTP 404 `EVENT_NOT_FOUND`, y evento inactivo, evento ajeno o asignación ausente/revocada para ADMIN_EVENT devuelve HTTP 403 `ADMIN_REQUIRED`. Sin sesión responde HTTP 401 `UNAUTHENTICATED`; sin 2FA responde HTTP 403 `TWO_FACTOR_REQUIRED`. Las restricciones de estado actuales conservan HTTP 409 `EVENT_LOCKED`.

`DELETE /api/v1/events/:eventId` permanece detrás del catch-all administrativo y requiere sesión autenticada, 2FA vigente y rol global `ADMIN`; `ADMIN_EVENT` no puede eliminar eventos, aunque tenga una asignación activa, ni puede elevar permisos enviando identidad o rol en el request. Si el evento activo está en `CONFIGURING` y no tiene historia bloqueante, devuelve HTTP 200 `{ "id", "active": false }`: es una baja lógica, conserva el evento y sus recursos relacionados y confirma `EVENT_DELETED` con el actor de la sesión en la misma transacción. Evento inexistente o ya inactivo devuelve HTTP 404 `EVENT_NOT_FOUND`; estado incompatible devuelve HTTP 409 `EVENT_LOCKED`; ballots, asignaciones, cupos, penalizaciones, actas o resultados bloqueantes devuelven HTTP 409 con el código `EVENT_HAS_*` aplicable. Las denegaciones de sesión, 2FA o rol responden HTTP 401 `UNAUTHENTICATED` o HTTP 403 (`TWO_FACTOR_REQUIRED` / `ADMIN_REQUIRED`) sin mutar el evento ni sus dependencias ni añadir auditoría de eliminación.

`POST /api/v1/events/:eventId/nights` requiere sesión y 2FA vigentes. `ADMIN` global conserva la creación; `ADMIN_EVENT` solo puede crear en el evento exacto con asignación vigente y activo. La asignación autoriza el alcance, pero no sustituye las guardas existentes: el servicio acepta únicamente eventos activos en `CONFIGURING` y valida los campos `name` (texto no vacío), `displayOrder` (entero positivo), `kind` (texto no vacío) y `eventDate` (opcional, nullable). La respuesta HTTP 201 contiene `{ "id", "eventId", "name", "displayOrder", "kind", "status", "eventDate" }`; `NIGHT_CREATED` y la jornada se confirman en la misma transacción con el actor derivado de la sesión. UUID inválido devuelve HTTP 400 `VALIDATION_ERROR`; campos inválidos, HTTP 400 `VALIDATION_ERROR` con el mensaje de validación; evento inexistente para ADMIN, HTTP 404 `EVENT_NOT_FOUND`; evento cuyo estado no permite configurar, HTTP 409 `EVENT_LOCKED`. Sin sesión responde HTTP 401 `UNAUTHENTICATED`; sin 2FA, HTTP 403 `TWO_FACTOR_REQUIRED`; asignación ausente, ajena, revocada o evento inactivo para `ADMIN_EVENT`, HTTP 403 `ADMIN_REQUIRED`, sin crear jornada ni auditoría parcial. Los roles o identidades enviados en el body no alteran autorización. La ruta delegable se resuelve antes del catch-all administrativo; las demás rutas anidadas bajo `/events` conservan su protección original.

`PATCH /api/v1/nights/:nightId` requiere sesión y 2FA vigentes. `ADMIN` global conserva la actualización existente; `ADMIN_EVENT` solo puede actualizar si la jornada persistida pertenece a un evento activo con asignación vigente a ese usuario. La pertenencia se resuelve desde `nightId` dentro de la transacción; un `eventId` enviado en el body no concede ni limita acceso. La respuesta HTTP 200 conserva `{ "id", "eventId", "name", "displayOrder", "kind", "status", "eventDate" }`; la actualización y `NIGHT_UPDATED` se confirman en la misma transacción, atribuidos a la sesión. Se mantienen las validaciones de campos y estados del servicio: UUID o campos inválidos responden HTTP 400 `VALIDATION_ERROR`; una jornada inexistente para ADMIN responde HTTP 404 `NIGHT_NOT_FOUND`; evento ajeno, inactivo o asignación ausente/revocada para `ADMIN_EVENT` responde HTTP 403 `ADMIN_REQUIRED`. Sin sesión responde HTTP 401 `UNAUTHENTICATED`; sin 2FA o rol autorizante, HTTP 403 (`TWO_FACTOR_REQUIRED` / `ADMIN_REQUIRED`). El cierre de una jornada de competencia en evento `OPEN` requiere ventana de votación `CLOSED`; si no, devuelve HTTP 409 `VOTING_WINDOW_NOT_CLOSED`. El cierre final conserva la actualización/cierre del evento y su auditoría dentro de la transacción. La ruta delegable se registra antes del catch-all administrativo; no modifica los permisos de las demás rutas.

`DELETE /api/v1/nights/:nightId` requiere sesión y 2FA vigentes. `ADMIN` global conserva el alcance global; `ADMIN_EVENT` solo puede eliminar una jornada cuyo evento propietario se resuelve desde la base de datos, esté activo y tenga asignación vigente para ese usuario. Una eliminación permitida devuelve HTTP 200 `{ "id" }`, borra físicamente solo si el evento continúa en `CONFIGURING` y la jornada carece de historia, y confirma `NIGHT_DELETED` con el actor de la sesión en la misma transacción. UUID inválido devuelve HTTP 400 `VALIDATION_ERROR`; jornada inexistente devuelve HTTP 404 `NIGHT_NOT_FOUND`; evento en estado incompatible devuelve HTTP 409 `EVENT_LOCKED`; programación, planilla, asignación, cupo, penalización o ventana de votación bloqueante devuelve HTTP 409 `NIGHT_HAS_HISTORY`. Para `ADMIN_EVENT`, evento ajeno, asignación ausente/revocada o evento inactivo responde HTTP 403 `ADMIN_REQUIRED` sin cambios ni divulgación; fallo de auditoría revierte la eliminación y no produce una respuesta exitosa. Sin sesión responde HTTP 401 `UNAUTHENTICATED` y sin 2FA HTTP 403 `TWO_FACTOR_REQUIRED`. La ruta delegable se registra antes del catch-all; las demás rutas protegidas conservan su alcance.

La apertura del evento mantiene `POST /api/v1/events/:eventId/open`, pero requiere un UUID en la cabecera `Idempotency-Key`. Reintentar la misma intención con la misma clave devuelve el resultado registrado; reutilizarla para otro evento responde `409 IDEMPOTENCY_CONFLICT`. La apertura conserva el objeto de evento como raíz de la respuesta exitosa y agrega `operation`. La falta o invalidez de clave devuelve `400 IDEMPOTENCY_KEY_REQUIRED` sin efecto. Los resultados inciertos se consultan con `GET /api/v1/events/:eventId/open-operations/:operationId`: aplicado y rechazado son terminales, `pending` no lo es, y `404 OPEN_OPERATION_NOT_FOUND` solo informa que no se encontró una reclamación. Ambos endpoints requieren sesión, 2FA y ADMIN vigentes. La evidencia de intención y resultado se conserva append-only sin vencimiento; los rechazos de readiness incluyen los detalles observados al decidir. Triggers de PostgreSQL bloquean `UPDATE`, `DELETE` y `TRUNCATE` sobre ambas tablas de evidencia; un propietario de tabla o superusuario con capacidad para alterar/deshabilitar los triggers puede eludir esa defensa, por lo que el rol de ejecución de producción no debe ser superusuario y su separación respecto del propietario del esquema debe controlarse en el despliegue.

`GET /api/v1/events/:eventId/admin-assignments` requiere sesión autenticada, 2FA vigente y rol global `ADMIN`; `ADMIN_EVENT` no habilita la consulta. Devuelve HTTP 200 con una lista directa de `{ "userId": "..." }`, limitada a las asignaciones activas del evento solicitado. Un evento existente sin asignaciones devuelve `[]`; un UUID mal formado devuelve HTTP 400 `{ "code": "VALIDATION_ERROR" }` y un evento inexistente HTTP 404 `{ "code": "EVENT_NOT_FOUND" }`. La ausencia de sesión devuelve 401 `UNAUTHENTICATED`; 2FA ausente o rol insuficiente devuelve 403 (`TWO_FACTOR_REQUIRED` o `ADMIN_REQUIRED`). La lectura no modifica asignaciones ni genera eventos de auditoría.

`PUT /api/v1/events/:eventId/admin-assignments/:userId` requiere la misma sesión, 2FA vigente y rol global `ADMIN`; `ADMIN_EVENT` no autoriza la operación. Sobre evento y cuenta existentes devuelve HTTP 200 `{ "active": true }`, creando o reactivando la asignación exacta; repetirlo cuando ya está activa es éxito sin cambiar el estado efectivo. Identificadores mal formados devuelven HTTP 400 `{ "code": "VALIDATION_ERROR" }`; evento o cuenta inexistentes devuelven HTTP 404 (`EVENT_NOT_FOUND` o `USER_NOT_FOUND`). Cada solicitud que supera autorización genera un evento de auditoría, incluso los rechazos posteriores y las repeticiones sin cambios; los rechazos de sesión, 2FA o rol no generan auditoría de dominio. La asignación no añade ni modifica roles en `user_role`; el acceso delegado se limita al evento asignado.

`DELETE /api/v1/events/:eventId/admin-assignments/:userId` requiere la misma sesión, 2FA vigente y rol global `ADMIN`; `ADMIN_EVENT` no autoriza la operación. Sobre evento y cuenta existentes devuelve HTTP 200 `{ "active": false }`, revocando únicamente la asignación de esa pareja; repetirlo con una asignación inactiva o ausente es éxito idempotente sin cambiar el estado efectivo. Identificadores mal formados devuelven HTTP 400 `{ "code": "VALIDATION_ERROR" }`; evento o cuenta inexistentes devuelven HTTP 404 (`EVENT_NOT_FOUND` o `USER_NOT_FOUND`). Cada solicitud que supera autorización genera auditoría, incluidos no-op y rechazos funcionales; denegaciones de sesión, 2FA o rol no generan auditoría de dominio. No modifica `user_role` ni asignaciones de otros eventos; un ADMIN puede revocar su propia delegación `ADMIN_EVENT` y conserva su rol y alcance global `ADMIN`. PUT y DELETE simultáneos para la misma pareja se serializan: el estado final corresponde a la última operación en el orden serializado y ambas quedan auditadas. Si falla la auditoría, la mutación no se confirma y la API no responde éxito.

## Invariantes y tiempo real

La escala vigente para esta versión es `SCORED` entero 1–10, `NOT_PRESENTED` con 0 y `PENDING` sin puntuación. Las asignaciones se gestionan por jornada y especialidad; la API valida que la planilla corresponda a una asignación activa y a comparsas de esa jornada.

- Guardar una decisión online la confirma; el cliente no debe presentarla como persistida antes de la respuesta. `PENDING` no es un cero válido ni una omisión aceptada.
- Se preservan completitud, inmutabilidad por ítem, pertenencia del jurado y precedencia de pasada. No existe un flujo habilitado de nuevas reaperturas.
- Guardado y submit admiten UUID en `Idempotency-Key` o `X-Idempotency-Key`; un replay se indica con `Idempotency-Replay`. El endpoint histórico `/sync` sigue en el backend, pero eso no habilita operación offline de la interfaz.
- ADMIN no obtiene liberación, sorteo o certificación por ser administrador: se requiere el rol específico SCRUTINEER/ESCRIBANO.
- `monitor-event-bus.js` usa EventEmitter y AsyncLocalStorage: los cambios transaccionales se notifican post-commit y se descartan con rollback. Las alertas explícitas de intentos fallidos pueden emitirse inmediatamente.
- SSE interno filtra datos de votos/identidad; SSE público solo notifica actualizaciones de snapshot. Ambos envían heartbeat cada 25 segundos y limpian la suscripción al desconectarse.
- El bus es local al proceso: no hay pub/sub distribuido ni replay persistente SSE. El proxy de producción debe permitir streaming sin buffering; varias réplicas requieren resolver esa limitación antes de prometer actualizaciones consistentes.

## Pruebas

`npm test` incluye tests HTTP, persistencia y sorteo. `npm run db:test` repite el subconjunto de DB. Algunas pruebas directas se omiten sin `TEST_DATABASE_URL`; una salida sin fallos con tests omitidos no demuestra cobertura.

Usá una terminal exclusiva de pruebas y una base ya creada, **aislada y descartable**. El guard solo comprueba presencia de la variable, no que el destino sea seguro. Los tests crean/modifican datos y algunos ejercitan migraciones o deshabilitan triggers dentro de escenarios controlados.

```powershell
# Desde api/. Reemplazar únicamente con la URL de la base descartable.
$env:DATABASE_URL = "postgres://USER:PASSWORD@localhost:5432/carnavales2027_v2_test"
$env:TEST_DATABASE_URL = $env:DATABASE_URL
$env:NODE_ENV = "test"
npm run auth:migrate
npm run db:migrate
npm test
npm run audit:verify
```

Definí también `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` y `FRONTEND_URL` de pruebas en esa terminal o en el `.env` local. Detenete si un paso falla y cerrá esa terminal al terminar para no reutilizar accidentalmente sus destinos. No ejecutar estas instrucciones contra la base operativa.

Usá `EMAIL_PROVIDER=console` en esa terminal para no enviar correo real. `npm run db:test` es útil para ejecutar solo el subconjunto de DB, pero no hace falta repetirlo inmediatamente después de `npm test`.

Para un caso puntual sin DB cuyo código no la requiera, por ejemplo desde `api/`: `node --test src/tests/health.test.js`. Para pruebas integradas, preferí los scripts con su guard. **No ejecutar builds como validación.**

## Backup y restauración

### Procedimiento preferido del piloto

Desde `api/`, con PostgreSQL 18 en `PATH` o `PG_BIN` apuntando a su directorio `bin`:

```powershell
# Windows: ajustar a la instalación real.
$env:PG_BIN = "C:\Program Files\PostgreSQL\18\bin"
# El archivo seleccionado identifica explícitamente el origen.
node scripts/pilot-data.js backup .env.pilot backups/piloto-AAAAMMDD.dump
```

El script genera un dump custom, SHA-256 e inventario de cantidades/huellas por tabla. Detener escrituras para evitar que cambie el inventario durante la captura. Elegir un nombre nuevo por respaldo: no sobrescribir evidencia anterior.

Para restaurar, preparar un archivo privado de entorno que apunte a **otra base vacía**, verificar y autorizar el destino, y recién entonces ejecutar:

```powershell
node scripts/pilot-data.js restore .env.destino-vacio backups/piloto-AAAAMMDD.dump
```

Restore exige checksum válido y destino sin objetos de aplicación; usa una transacción, omite propietarios/ACL y compara el inventario. No hace `DROP`, seed ni bootstrap. Usar conexión directa Neon para migraciones/restauración según el runbook; no asumir que cualquier operación administrativa funciona mediante el pooler.

Los backups pueden contener datos personales, hashes y material cifrado. Mantenerlos privados, con acceso restringido y una copia segura fuera del servidor efímero; `.gitignore` evita commits accidentales, **no cifra archivos ni controla OneDrive**. Conservar el secreto compatible con cada respaldo por un canal seguro. Ensayar restauración en un destino descartable; leer el archivo con `pg_restore --list` no prueba una restauración completa.

### Scripts históricos: no usarlos para el traslado del piloto

Los scripts Bash no cargan `.env`: requieren variables exportadas/argumentos. Usan `pg_dump`, `pg_restore`, `psql`, `sha256sum` y utilidades Unix; PowerShell solo no reemplaza ese entorno. Guardá los dumps fuera del repositorio: pueden contener datos personales y credenciales almacenadas.

- Backup: `npm run db:backup -- <ruta.dump>` crea un dump custom comprimido y su archivo `.sha256`.
- Restore: `npm run db:restore -- <ruta.dump> <URL-destino>` termina conexiones, **elimina la base destino**, la vuelve a crear e importa el dump. Requiere autorización explícita, destino verificado y ventana de mantenimiento cuando corresponda.
- **Limitación actual:** `restore.sh` continúa si falta el checksum o si su validación falla, y extrae/interpola el nombre de base desde la URL. No usarlo con entradas no confiables ni asumir que el checksum aborta la restauración. Verificarlo por separado antes de autorizar cualquier ejecución.
- Después de una restauración autorizada, validar datos y cadena general con `audit:verify`; ese comando por sí solo no certifica todos los hashes de actas, snapshots y cadena ceremonial.

El runbook versionado es [DEPLOYMENT.md](../DEPLOYMENT.md). Este README no autoriza una restauración sobre un destino real.

## Autenticación, permisos y límites

El selector de evento del cliente utiliza los endpoints existentes según el rol: `/events`, `/penalties/events`, `/results/events`, `/monitor/events` o las asignaciones activas de `/judge/profile`. No introduce permisos nuevos. `GET /api/v1/judge/ballots`, tanto normal como `?include=progress`, incluye `eventId` para separar las planillas por evento sin depender del nombre. La API sigue validando la identidad y pertenencia de cada planilla.

Las tres aceptaciones de invitación (jurado, perfil operativo y rol) validan la contraseña antes de reclamar la invitación o crear la cuenta: entre 8 y 128 caracteres, una mayúscula, una minúscula (incluidas letras Unicode) y un dígito 0–9. La política está en `src/auth/registration-password.js`; el incumplimiento devuelve el error de validación habitual (HTTP 400). Esta regla no altera el login ni las claves existentes.

El flujo de la interfaz es correo/contraseña → desafío 2FA → envío OTP → verificación → `/api/v1/me`. El campo visual «Email» corresponde al contrato de `/api/auth/sign-in/email`, que recibe `email` y `password`. En el primer ingreso puede requerirse habilitar el segundo factor antes de verificarlo.

Las sesiones usan cookies de Better Auth, no un JWT administrado manualmente por el frontend. La identidad y los roles se obtienen del servidor; no aceptar roles enviados en el body. La contraseña se verifica mediante hash; no se recupera en texto claro desde la base. La sesión renovable tiene un plazo de respaldo de un año; la PWA del Jurado consulta su estado periódicamente para mantenerla activa durante el evento. No hay cierre por inactividad. Cuando todas las jornadas de los eventos asignados están cerradas, `/api/v1/judge/session-status` revoca la sesión del servidor y el cliente vuelve al login.

El cierre de una jornada de competencia requiere que su ventana de votación ya esté cerrada. Al cerrar la última jornada, el evento pasa a `CLOSED` y queda inmutable. Las jornadas de premiación también deben cerrarse para completar el evento.

La apertura del evento valida en `/api/v1/events/:eventId/readiness` que cada jornada de competencia tenga al menos una comparsa programada en el orden de pasada. La respuesta incluye `missing: ["INCOMPLETE_SCHEDULES"]` e `incompleteSchedules` con las jornadas sin programación; PostgreSQL repite la misma validación al cambiar el evento a `OPEN`. Cada entrada tiene un puesto único y positivo por las restricciones de base de datos. Una vez abierto, el reorden requiere motivo y auditoría. La comparsa actualmente en pista y las comparsas con decisiones de voto registradas conservan su posición; solo se puede ordenar el tramo restante.

Para rubros activos cuyo `evaluationTarget` es `NOMINATION`, readiness también comprueba que cada comparsa activa programada tenga al menos una nominación activa. Informa `missing: ["INCOMPLETE_NOMINATIONS"]` y los pares pendientes en `incompleteNominations`; una validación PostgreSQL equivalente impide saltarse el control al abrir el evento directamente en la base. Al generar planillas se crea una puntuación separada por cada nominación activa.

| Control | Configuración actual |
| --- | --- |
| Auth sensible por IP | 300 solicitudes / 15 minutos; lecturas `GET`/`HEAD` de `get-session` excluidas de ese contador |
| Auth general y API general | Contadores independientes de 300 / minuto |
| Login por cuenta | 10 intentos / 15 minutos; claves derivadas sin correo en claro |
| Envío OTP por cuenta | 3 / 15 minutos |
| Intentos OTP | 5 por código y bloqueo nativo tras 10 fallos acumulados por cuenta |
| Better Auth interno | 100 / minuto por IP/ruta en login y segundo factor |
| Invitaciones | Protección colectiva y adicional por token |

Los contadores de la aplicación son por proceso y se reinician con él; el bloqueo nativo de segundo factor se persiste en DB. Consultar `rate-limiter.js`, `identity-limiter.js` y `auth.js` antes de cambiarlos. El objetivo de Wi-Fi compartida no autoriza a desactivar la protección.

## Correo y diagnóstico

Para el piloto, autorizar solamente `https://www.googleapis.com/auth/gmail.send` con la cuenta remitente. Los destinatarios de OTP no deben autorizar Google ni agregarse todos como usuarios de prueba de OAuth.

| Error | Comprobación |
| --- | --- |
| `redirect_uri_mismatch` | Registrar exactamente `https://developers.google.com/oauthplayground` en el cliente OAuth usado, sin barra final |
| `access_denied` en Testing | Agregar la cuenta remitente exacta en Google Auth Platform → Público → Usuarios de prueba |
| `invalid_grant` al renovar | Revisar revocación/caducidad y volver a autorizar; no generar tokens en bucle |
| `EMAIL_DELIVERY_FAILED` | Proveedor, remitente autorizado, Gmail API habilitada, credenciales y cuotas; no imprimir la respuesta sensible del proveedor |
| OTP no recibido | Verificar Spam, dirección y límites; aceptación de Gmail no garantiza recepción en bandeja principal |

En Testing, el refresh token para este permiso caduca a los siete días. Revisar los requisitos de publicación/verificación antes de uso continuado. Nunca pedir contraseñas, OTP o tokens por tickets públicos. Detalles y referencias oficiales: [DEPLOYMENT.md](../DEPLOYMENT.md#correo-sin-brevo-gmail-api-por-https).

## Operación de producción y recuperación

`validateProductionConfig` exige correo válido, conexión PostgreSQL con TLS (`sslmode=require` o `verify-full`), secreto de al menos 32 caracteres y ambos orígenes HTTPS idénticos, sin rutas extra, credenciales, query ni fragmento. Cumplir longitud **no hace seguro un secreto de ejemplo**: generar uno aleatorio para una instalación nueva.

En el piloto, el secreto Better Auth ya fue rotado con recifrado y auditoría. Usar la configuración privada actual del destino, no el valor de `.env.example` ni el `.env` de otra base. No ejecutar seeds ni `bootstrap:admin` sobre las cuentas importadas.

El servidor en producción sirve `client/dist`; sin ese artefacto no está listo para entregar la aplicación. La compilación del frontend se realiza en el despliegue de Render, no al iniciar Node. `/health` es liveness y no prueba disponibilidad de Neon, correo, roles ni integridad de votos.

Para ejecutar un comando operativo con `.env.pilot`, seleccionarlo explícitamente en una terminal dedicada:

```powershell
$env:DOTENV_CONFIG_PATH = ".env.pilot"
npm run audit:verify
Remove-Item Env:DOTENV_CONFIG_PATH
```

Variables ya exportadas prevalecen: revisar el destino sin imprimir credenciales. `.env.pilot` no es cargado por su nombre automáticamente. No reutilizar esa terminal para tests.

### Rotación del secreto Better Auth

Una rotación es una operación de mantenimiento, no una edición aislada de `.env`:

1. Pausar escrituras y respaldar base/configuración compatible.
2. Inventariar campos cifrados según la versión instalada; en el piloto se recifraron `twoFactor.secret` y `twoFactor.backupCodes`.
3. Revisar tokens de proveedores si existen, vencer sesiones/desafíos vigentes y conservar evidencia; no borrar votos ni historia.
4. Ensayar descifrado/recifrado y rollback; aplicar en transacción con evidencia auditable.
5. Activar la clave nueva en todos los procesos del destino y verificar rechazo de la anterior, auditoría y login + OTP.

No hay un comando general de rotación versionado en `package.json`. Los artefactos privados de una intervención no forman parte del clon ni deben reutilizarse ciegamente.

### Auditoría y actas: alcance real

`audit:verify` recalcula la cadena general v2 y comprueba su cabecera. No certifica por sí solo cadenas ceremoniales históricas, todos los snapshots ni archivos exportados. Ejecutarlo sin escrituras concurrentes para evitar comparar lecturas tomadas en momentos diferentes.

El acta implementada persiste un payload JSON y SHA-256 canónico (`scrutiny-record-service.js`). Imprimirlo o guardarlo como PDF no implica que ese hash corresponda a los bytes del PDF. Mantener esta diferencia explícita al definir documentos oficiales.
