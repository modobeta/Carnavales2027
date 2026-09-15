# API — Carnavales2027_v2

Backend HTTP de la plataforma. Implementa autenticación, autorización, configuración del carnaval, votación, supervisión, penalizaciones, resultados y actas sobre PostgreSQL.

[Proyecto](../README.md) · [Cliente](../client/README.md)

## Stack y requisitos

- JavaScript ESM sobre Node.js (`package.json`: `>=20`; para trabajar también con el cliente, respetar `^20.19.0 || >=22.12.0`).
- Express 5, Better Auth **1.6.27**, `pg`, dotenv, Helmet, express-rate-limit y Nodemailer.
- PostgreSQL con permisos para aplicar las migraciones y habilitar `pgcrypto`; CI utiliza PostgreSQL 16.
- npm; Bash y herramientas PostgreSQL solo para backup/restore.

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
| `EMAIL_PROVIDER` | `console` para desarrollo; configurar `smtp` en producción |
| `EMAIL_FROM` | Remitente requerido para SMTP |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` | Credenciales y servidor requeridos para SMTP |
| `SMTP_PORT` | Puerto SMTP; `587` |
| `SMTP_SECURE` | TLS directo si vale exactamente `true`; de lo contrario `false` |

En desarrollo, `console` expone el OTP y los datos de recuperación/invitación en la terminal: tratá esos logs como sensibles. La entrega OTP e invitaciones rechaza el proveedor de consola en producción. El callback de recuperación todavía imprime el token si `EMAIL_PROVIDER` no es `smtp`: **configurá SMTP antes de operar y no lo interpretes como un fallback seguro**.

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
- El árbol contiene versiones desde `001` hasta `076`, sin archivo `071`: son 75 archivos SQL, no 76. No renumerarlos para eliminar el salto.
- Las tablas incluyen roles, eventos/jornadas, catálogos de competencia, perfiles e invitaciones, asignaciones, planillas/puntajes, ventanas de votación, penalizaciones, liberaciones, snapshots y actas.
- Triggers y restricciones protegen historia, pertenencia al evento, cambios de estado e inmutabilidad. No son validaciones opcionales que pueda reemplazar el cliente.
- `src/db/transaction.js` centraliza transacciones con reintentos limitados para deadlock `40P01` y difusión de eventos después del commit. Los módulos también contienen wrappers transaccionales propios: seguí el patrón del flujo afectado.

### Evento integral de desarrollo

Después de las migraciones, configurá `NODE_ENV=development` o `test`, las variables `SEED_ADMIN_*` de identidad y la contraseña común. Ejecutá:

```powershell
npm run seed:event:full
```

`src/db/seeds/full-event.*` define datos ficticios: tres jornadas competitivas, siete comparsas, tres especialidades, 36 rubros (25 nominativos y 11 aleatorios), nueve jurados y cuentas ADMIN/ESCRIBANO/VEEDOR. El evento queda activo, `CONFIGURING`, con readiness válido y sin votación abierta, votos, resultados ni penalizaciones. Las planillas se crean al abrir las jornadas, no durante el seed.

La programación usa fechas y orden simulados; conserva timestamp completo y zona `America/Argentina/Cordoba`, incluso al pasar la medianoche. No reutilizar estos datos como calendario oficial.

El seed ejecuta las migraciones de dominio, pero no sustituye la preparación inicial de Better Auth. Evita duplicar el fixture y rechaza deriva, conflictos de identidad y eventos iniciados/inactivos. **Reejecutarlo puede cambiar contraseñas y revocar sesiones del fixture.** No es una restauración ni elimina datos para reparar conflictos. Las identidades usan transacciones propias: la configuración del evento es transaccional, no toda la ejecución como una sola unidad.

### Administrador inicial de producción

Operación explícita, nunca parte automática del desarrollo:

1. Preparar ambas familias de migraciones contra el destino autorizado.
2. Configurar `NODE_ENV=production`, autenticación, SMTP y `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_PASSWORD` en el entorno seguro.
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
| `/api/v1/events`, catálogos y `/schedule` | Configuración y readiness; ADMIN + 2FA |
| `/api/v1/users`, `/judges`, `/operational-profiles` | Gestión administrativa de identidades y permisos |
| `/api/v1/judge-invitations`, `/operational-invitations`, `/invitations` | Inspección/aceptación por secreto o token según el circuito |
| `/api/v1/events/:eventId/judge-assignments` | Asignaciones y cupos; administración |
| `/api/v1/events/:eventId/nights/:nightId/voting/*` | Apertura/cierre ADMIN; consulta de estado autorizada |
| `/api/v1/judge/assignments`, `/judge/ballots` | Asignaciones y planillas del jurado habilitado |
| `/api/v1/monitor/*` | Monitor y stream SSE; ADMIN o VEEDOR registrado, con 2FA |
| `/api/v1/events/:eventId/penalties` | Penalizaciones; ADMIN o COMISARIO, con 2FA |
| `/api/v1/events/:eventId/results` | Consulta de resultados; ADMIN, SCRUTINEER o ESCRIBANO |
| `/api/v1/events/:eventId/results/release` | Liberación; SCRUTINEER o ESCRIBANO, con 2FA |
| `/api/v1/events/:eventId/scrutiny-record` | Consulta/certificación según permisos de escrutinio |
| `/api/v1/public/events`, `/public/events/:eventId/results`, `/public/stream` | Portal público de resultados liberados |

Los errores usan códigos de dominio traducidos por `http-errors.js`; los inesperados devuelven `INTERNAL_ERROR`. Las rutas privadas no deben cachearse. Las respuestas públicas de resultados son una excepción explícita: usan caché corta y ETag; el stream usa `no-cache`.

Las escrituras de `/api/v1` verifican `Origin` contra `FRONTEND_URL`; en producción rechazan ausencia de cualquiera. No hay configuración CORS general para operar el cliente arbitrariamente desde otro origen.

## Invariantes y tiempo real

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
npm run db:test
npm run audit:verify
```

Definí también `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` y `FRONTEND_URL` de pruebas en esa terminal o en el `.env` local. Detenete si un paso falla y cerrá esa terminal al terminar para no reutilizar accidentalmente sus destinos. No ejecutar estas instrucciones contra la base operativa.

Para un caso puntual sin DB cuyo código no la requiera, por ejemplo desde `api/`: `node --test src/tests/health.test.js`. Para pruebas integradas, preferí los scripts con su guard. **No ejecutar builds como validación.**

## Backup y restauración

Los scripts Bash no cargan `.env`: requieren variables exportadas/argumentos. Usan `pg_dump`, `pg_restore`, `psql`, `sha256sum` y utilidades Unix; PowerShell solo no reemplaza ese entorno. Guardá los dumps fuera del repositorio: pueden contener datos personales y credenciales almacenadas.

- Backup: `npm run db:backup -- <ruta.dump>` crea un dump custom comprimido y su archivo `.sha256`.
- Restore: `npm run db:restore -- <ruta.dump> <URL-destino>` termina conexiones, **elimina la base destino**, la vuelve a crear e importa el dump. Requiere autorización explícita, destino verificado y ventana de mantenimiento cuando corresponda.
- **Limitación actual:** `restore.sh` continúa si falta el checksum o si su validación falla, y extrae/interpola el nombre de base desde la URL. No usarlo con entradas no confiables ni asumir que el checksum aborta la restauración. Verificarlo por separado antes de autorizar cualquier ejecución.
- Después de una restauración autorizada, validar datos y cadena general con `audit:verify`; ese comando por sí solo no certifica todos los hashes de actas, snapshots y cadena ceremonial.

El runbook interno se conserva únicamente en la copia local, fuera de la publicación. Tener presentes estas limitaciones verificadas en los scripts: este README no autoriza ni ejecuta restauraciones.
