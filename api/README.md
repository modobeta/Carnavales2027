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

Los contratos actuales no tienen un único envoltorio universal: hay objetos, listas y errores `{ code, ... }` según la ruta. Consultar el handler y sus tests antes de implementar consumidores; no suponer `{ data }` o `{ error }` para todos los endpoints.

Las escrituras de `/api/v1` verifican `Origin` contra `FRONTEND_URL`; en producción rechazan ausencia de cualquiera. No hay configuración CORS general para operar el cliente arbitrariamente desde otro origen.

## Invariantes y tiempo real

**Discrepancia funcional pendiente:** `ballot-service.js` implementa `SCORED` entero 1–10, `NOT_PRESENTED` con 0 y `PENDING` sin puntuación. Las reglas históricas de la raíz dicen 0–5 y ausencia de asignaciones, mientras el backend actual valida asignaciones. Documentar este comportamiento no lo convierte en reglamento aprobado: conciliar antes de una votación real.

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

Las sesiones usan cookies de Better Auth, no un JWT administrado manualmente por el frontend. La identidad y los roles se obtienen del servidor; no aceptar roles enviados en el body. La contraseña se verifica mediante hash; no se recupera en texto claro desde la base.

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
