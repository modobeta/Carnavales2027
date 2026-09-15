# Piloto gratuito — Render + Neon + Gmail API

Repositorio: modobeta/Carnavales2027. Un proceso Node 22, cliente/API del mismo origen, PostgreSQL 18. Piloto hasta 30 usuarios; no certifica operación de una votación real.

## Preparación privada

1. Crear Neon Free PostgreSQL18 en AWS US East (N. Virginia), base vacía. Usar conexión **directa** con TLS (sslmode=require o verify-full); no pooler para migraciones y restauración.
2. Autorizar una cuenta Gmail del responsable mediante OAuth y Gmail API (ver sección siguiente). EMAIL_FROM debe ser esa cuenta o un alias ya autorizado en Gmail. No se necesita dominio propio. Las cuotas se comparten con el uso normal de esa cuenta.
3. Crear api/.env.pilot (ignorado): DATABASE_URL de Neon, las tres variables GMAIL_* y EMAIL_FROM autorizado. Nunca copiar este archivo a Git.
4. Transferir BETTER_AUTH_SECRET del entorno origen de forma privada para conservar datos cifrados de Better Auth. No reemplazarlo sin un procedimiento de rotación. Nunca copiar secretos al Blueprint.
5. Guardar backups fuera de Git y con acceso restringido. No usar api/scripts/restore.sh para este traslado: elimina la base destino y no aborta correctamente ante checksum inválido.

## Correo sin Brevo: Gmail API por HTTPS

1. En Google Cloud, crear o seleccionar un proyecto propio y habilitar **Gmail API**.
2. Configurar Google Auth Platform: nombre, contacto y audiencia. Solicitar únicamente **https://www.googleapis.com/auth/gmail.send**. Solo el remitente autoriza OAuth; los participantes no necesitan autorizar Google ni usar Gmail.
3. Crear un cliente OAuth de tipo aplicación web con URI de redirección **https://developers.google.com/oauthplayground**.
4. Abrir [OAuth Playground](https://developers.google.com/oauthplayground/). Marcar **Use your own OAuth credentials** y cargar Client ID y Client Secret privados. Solicitar acceso offline, autorizar gmail.send con la cuenta remitente e intercambiar el código por tokens.
5. Guardar Client ID, Client Secret y **refresh_token** en GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET y GMAIL_REFRESH_TOKEN. El access_token temporal no se configura: el servidor lo renueva automáticamente.
6. En estado OAuth **Testing**, estos refresh tokens caducan a los siete días. Para uso continuado revisar **In production** y los requisitos de verificación aplicables a una integración que solo usa la cuenta del responsable. Volver a autorizar tras cambiar de estado. No asumir aprobación automática ni ausencia de verificaciones de seguridad de Google.
7. Configurar EMAIL_FROM con la cuenta autorizada. Una vez desplegado, solicitar un OTP propio y comprobar recepción. Comprobar también invitaciones y recuperación; la aceptación por la API no garantiza entrega en bandeja principal.

No configurar contraseñas de Gmail ni permisos para leer el buzón. No compartir tokens por chat, capturas ni Git. Los fallos de OAuth, cuota y envío devuelven un error genérico sin imprimir códigos ni respuestas del proveedor. No hay reintentos automáticos de envío ante timeouts ambiguos.

Referencias: [envío MIME](https://developers.google.com/workspace/gmail/api/guides/sending), [OAuth y caducidad](https://developers.google.com/identity/protocols/oauth2), [límites de Gmail](https://support.google.com/mail/answer/22839?hl=es). Gmail personal puede bloquear envíos al superar 500 diarios; no es una capacidad reservada ni garantizada. Confirmar restricciones en la cuenta antes del piloto.

## Backup y restauración en destino vacío

Detener escrituras locales antes del backup final. Conservar la base local y el dump.

Desde api, con PostgreSQL18 en PATH (o PG_BIN apuntando a su carpeta bin):

```bash
node scripts/pilot-data.js backup .env backups/pilot.dump
node scripts/pilot-data.js restore .env.pilot backups/pilot.dump
```

El backup genera SHA-256 e inventario de cantidades/huellas por tabla. Restore exige checksum correcto y base vacía, usa una sola transacción, omite propietarios/ACL y compara el inventario. No ejecuta DROP ni seeds/bootstrap. Un destino restaurado nunca se sobrescribe: crear otro destino vacío para repetir.

Ensayar primero contra una base de pruebas vacía. Comparar identidades, configuración, migraciones, restricciones, índices y auditoría; comprobar que el administrador existente puede iniciar sesión. Capturar otro backup antes de cada actualización y al terminar cada jornada de pruebas; guardar fuera del alojamiento efímero.

## Render

Publicar los cambios revisados en main manualmente y conectar render.yaml al repositorio. No hay despliegue automático. Región Virginia, plan Free, una instancia.

- Build: npm ci --prefix api && npm ci --prefix client --include=dev && npm run build --prefix client
- Start: npm start --prefix api
- Health: /health (liveness, sin consultas periódicas a Neon).
- NODE_ENV=production, TRUST_PROXY=1, DB_POOL_MAX=5, DB_CONNECTION_TIMEOUT_MS=10000, EMAIL_PROVIDER=gmail.
- Configurar DATABASE_URL, BETTER_AUTH_SECRET, GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET y GMAIL_REFRESH_TOKEN, EMAIL_FROM privadamente.
- BETTER_AUTH_URL y FRONTEND_URL: mismo origen HTTPS asignado por Render, sin rutas ni fragmentos.
- VITE_API_URL se deja sin definir: cliente, cookies y SSE usan el mismo origen.
- La aplicación no instala seeds, no crea ADMIN ni ejecuta migraciones al arrancar.

Antes del primer arranque, con la conexión directa de Neon cargada solo para ese proceso y datos ya restaurados, revisar y ejecutar auth:migrate y db:migrate si hay pendientes; validar audit:verify. Render Free no tiene preDeployCommand. Nunca migrar desde el build. Las migraciones aplicadas no se editan.

## Pruebas y cierre

CI Node22/Postgres18: migraciones aisladas, suite API/BD, auditoría, cliente/build. Lint y typecheck no configurados. No usar base operativa para pruebas.

Comprobar en URL pública: login+OTP, límite por cuenta sin bloquear otras cuentas, 30 sesiones/IP compartida, invitación, recuperación, roles, SSE, reconexión, reinicio, HTTPS/cookies/CSP y actualización de dos builds. Probar fallo de Gmail API y cuota agotada; no reenviar en bucle.

Límites: IP sensible 300/15min; API y auth general 300/min independientes; login 10/cuenta/15min; OTP 3 envíos/cuenta/15min; bloqueo nativo tras 10 fallos acumulados por cuenta; máximo adicional de 5 intentos por código; token de invitación 10/15min. Los límites en memoria reinician al reiniciar el servidor; la protección OTP nativa persiste en BD.

## Publicación manual de la revisión

Desde la raíz, revisar y preparar únicamente los archivos del piloto (sin `git add -f`):

```bash
git diff --check
git add .gitignore README.md DEPLOYMENT.md render.yaml .github/workflows/ci.yml specs/029-piloto-produccion
git add api/.env.example api/scripts/pilot-data.js api/src/app.js api/src/server.js api/src/web-client.js api/src/config/production.js
git add api/src/email api/src/auth/auth.js api/src/auth/identity-limiter.js api/src/auth/rate-limiter.js api/src/auth/two-factor.js
git add api/src/db/transaction.js api/src/modules/judges/invitation-delivery.js api/src/modules/monitor/monitor-event-bus.js api/src/modules/results/results-service.js
git add api/src/tests/auth-session-rate-limiting.test.js api/src/tests/pilot.test.js api/src/tests/pilot-auth.test.js api/src/tests/email-gmail.test.js
git add client/package.json client/public/sw.js client/scripts/build-service-worker.js client/src/tests/service-worker-update.test.js
git diff --cached --stat
git diff --cached
git commit -m "feat: prepare free pilot with Render Neon and Gmail API"
git push -u origin feat/piloto-produccion
gh pr create --base main --head feat/piloto-produccion --title "Preparar piloto gratuito con Gmail API" --body-file specs/029-piloto-produccion/pr.md
```

Revisar CI y hacer merge manualmente. Solo cuando `render.yaml` esté en `main`, abrir [crear Blueprint en Render](https://dashboard.render.com/blueprint/new?repo=https://github.com/modobeta/Carnavales2027), cargar los secretos y aplicar. La opción manual evita despliegues posteriores por cada push; la creación inicial del Blueprint sí inicia un despliegue. Restaurar Neon y preparar las variables antes de crear el servicio.

## Actualización y recuperación

- No desplegar durante una operación activa. Backup verificado antes de migraciones; desplegar un commit revisado.
- Ante fallo de código sin cambio incompatible de esquema, volver al último commit funcional desde Render.
- Ante fallo de datos, detener escrituras y restaurar un backup verificado en **otra base vacía**, comprobarlo y cambiar DATABASE_URL. Nunca sobrescribir la base dañada ni eliminar la copia local para intentar reparar.
- El worker nuevo espera a que se cierren las pestañas anteriores. No recargar automáticamente una planilla con acciones pendientes.
- Render Free suspende por inactividad y tiene filesystem efímero. Neon y Gmail API imponen cuotas. No agregar servicios pagos ni monitores que evadan la suspensión.
- Tras el corte, Neon es la base operativa del piloto; no mantener dos instalaciones escribiendo por separado esperando sincronización.
