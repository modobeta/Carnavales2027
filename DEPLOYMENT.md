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

## Páginas públicas para OAuth — 05/10/2026

- Texto de presentación y privacidad aprobado por Martín Juncos, responsable personal, el 05/10/2026. Registro: `PRIVACIDAD-BORRADOR.md`.
- Archivos estáticos sin autenticación: `client/public/acerca.html` y `client/public/privacidad.html`, con estilos locales y enlaces desde login. Vite los copia al cliente servido por la API; no cambian permisos ni sesiones.
- URLs previstas: `https://carnavales2027-piloto.onrender.com/acerca.html` y `https://carnavales2027-piloto.onrender.com/privacidad.html`.
- Publicar estas páginas no equivale a publicar/verificar OAuth. Quedan pendientes guardar las URLs en Google, confirmar el cambio a producción, reautorizar el remitente, actualizar exclusivamente `GMAIL_REFRESH_TOKEN` y comprobar login + OTP público.
- La salida de Testing elimina la caducidad de siete días propia de ese modo, pero no evita revocaciones u otras causas de expiración. No desactivar 2FA ni modificar `BETTER_AUTH_SECRET` para resolver un fallo de Gmail.

### Resultado verificado del 05/10/2026

- Render: commit `bf76fa0e152ebd1476b83f5aaefdbcf8920b2931`, deploy `dep-db1vbdss728c73ag8g0g` **live**. Ambas páginas públicas se abrieron correctamente; 21 pruebas de login pasaron. Sin build local ni cambios en base de datos.
- Google confirmó guardado de las URLs y del dominio autorizado exacto `carnavales2027-piloto.onrender.com`; se conservó `google.com` para OAuth Playground. El botón **Publicar app** ahora está habilitado, pero el estado sigue **Prueba**, a la espera de confirmación del responsable. No se cambió el token.
- Se publicó la rama `deploy/privacidad-oauth` y se desplegó el SHA específico. **No desplegar latest main para renovar Gmail:** `origin/main` avanzó a `f7cc693` con 25 commits adicionales y migraciones 080–083 que no pertenecen a esta tarea. La versión publicada solo incorpora las páginas, enlaces y documentación sobre el código previamente desplegado. Mantener auto-deploy desactivado; actualizar la credencial sin desplegar esas migraciones accidentalmente.
- Pendiente integrar estos cambios en main sin perder los cambios remotos, como operación separada de la publicación de OAuth.

### OAuth en producción; renovación pendiente

- Con confirmación explícita del responsable, Google OAuth pasó de **Prueba** a **En producción**, verificado en la página Público. Esto no equivale a una app verificada por Google: la consola sigue indicando que requiere verificación.
- Se inició una nueva autorización offline, únicamente `gmail.send`, para la cuenta remitente. Google mostró «Google no verificó esta app». El control de seguridad de la automatización bloqueó abrir «Configuración avanzada»; no se eludió el bloqueo. Se dejó el navegador para intervención del responsable.
- Aún no se obtuvo un nuevo token ni se actualizó Render. El envío de OTP sigue pendiente de verificación; no considerar restablecido el login solamente por el cambio a producción.

### Renovación del 06/10/2026 y despliegue inesperado

- El responsable completó personalmente la advertencia de Google. Se intercambió el código con el cliente propio y únicamente `gmail.send`; el refresh token nuevo se guardó en `api/.env.pilot` y se actualizó solo `GMAIL_REFRESH_TOKEN` en Render. Google no informó una caducidad específica del refresh token. Gmail aceptó un correo de prueba dirigido al responsable; falta probar login + OTP desde Render.
- **Incidente:** la herramienta `render_update_environment_variables` disparó implícitamente un deploy de latest main pese a no haberse solicitado un despliegue y estar auto-deploy desactivado. Quedó live `f7cc693` en `dep-db2850nlot8c73e7jv30` a las 05:09:59 UTC. La versión previa era `2e4cb3c`, con las páginas y etiqueta de propiedad.
- Se preparó volver a desplegar `2e4cb3c` conservando el token nuevo; la revisión automática bloqueó la acción y exige autorización explícita para el retorno de versión. **No se completó la recuperación.** No afirmar que las páginas/etiqueta permanecen publicadas ni que la base no tuvo efectos durante este despliegue sin verificarlos.
- Para próximas rotaciones, no usar esa herramienta suponiendo que solo guarda variables: emplear un mecanismo verificado de **Save only** y luego desplegar el SHA deseado. No imprimir ni incluir secretos en documentación.

### Recuperación confirmada — 06/10/2026 05:14 UTC

- Con autorización explícita del responsable, se desplegó nuevamente `2e4cb3cf65022a0df15d3c89034b3518a8858180` conservando las variables actuales, incluido el token nuevo. Deploy `dep-db286vvlot8c73e7r9d0`: **live** a las 05:14:13 UTC. No se usó rollback de configuración.
- `/health`, `/` y `/acerca.html` respondieron **200**. Se comprobó la etiqueta `google-site-verification` en la raíz y la aclaración del uso de Google/Gmail en la presentación.
- Consulta de solo lectura en Neon del piloto: última migración registrada `076`; las migraciones 080–083 no figuran aplicadas. Esta comprobación verifica el registro de migraciones, no constituye una auditoría completa de todos los datos.
- El token nuevo fue emitido con OAuth en producción y Gmail aceptó el correo de prueba desde el equipo local. **Falta confirmar login + recepción y validación de OTP desde la URL pública con el responsable.** La verificación de marca/permisos de Google continúa pendiente y es independiente de esta recuperación.

## Registro operativo: Gmail OAuth / OTP — 23/09/2026

**Estado: recuperación temporal aplicada; pendiente validar login + OTP de punta a punta y resolver publicación OAuth.**

### Incidente y evidencia

- Síntoma: al ingresar aparecía «No pudimos iniciar sesión. Intentá nuevamente.». Este mensaje corresponde a un fallo posterior al envío de credenciales, durante la habilitación de segundo factor o el envío de OTP; por sí solo no identifica la causa.
- Google rechazó la credencial guardada del piloto con HTTP 400, `invalid_grant` y descripción de token expirado o revocado. La autorización anterior era del 16/09; el proyecto seguía en **Prueba (Testing)**, consistente con su caducidad de siete días. No se atribuye un motivo más preciso que el informado por Google.
- `/health` respondió 200 durante el diagnóstico inicial. Esto no comprueba Gmail ni el flujo de autenticación.
- Google rechazó el navegador automatizado; se utilizó el Chrome habitual del responsable, sin evadir controles de seguridad.

### Recuperación realizada

1. Se volvió a autorizar la cuenta remitente con el cliente OAuth existente y únicamente `gmail.send`, con acceso offline.
2. Se intercambió el código con Google y se guardó el nuevo `refresh_token` en `api/.env.pilot` (ignorado por Git). No se publicaron credenciales.
3. Se actualizó **solo `GMAIL_REFRESH_TOKEN`** en Render mediante combinación de variables, sin reemplazar las demás. No se cambió `BETTER_AUTH_SECRET`, contraseñas, base de datos ni segundo factor.
4. Despliegue `dep-daq3gut9fdbs73fviodg`: **live**, sobre revisión remota `1718d2c0c767bee7f2e737c01aab6b97de646016`.
5. Gmail aceptó un correo de prueba enviado con la credencial renovada. No equivale a recepción confirmada ni a una prueba completa de login desde Render. La consulta posterior a `/health` desde el equipo local falló por conexión/timeout; no se certificó disponibilidad con esa segunda comprobación.

### Próxima renovación y solución duradera

| Hito | Fecha / acción |
| --- | --- |
| Última autorización | 23/09/2026 |
| Vencimiento esperado mientras siga en Testing | Alrededor del **30/09/2026**, siete días desde la emisión; puede invalidarse antes por revocación u otras causas |
| Revisión preventiva sugerida | **29/09/2026**, antes del vencimiento y de cualquier jornada de uso |
| Responsable operativo | Administrador del proyecto Google Cloud y del servicio Render |
| Recordatorio automático | **No configurado**; estas fechas son registro documental, no una tarea programada |

La aplicación renueva automáticamente el **access token** mientras el **refresh token** sea válido. No puede renovar por sí sola una autorización expirada o revocada: hay que repetir el consentimiento de la cuenta remitente y actualizar Render. Los jueces no deben renovar nada ni cambiar sus contraseñas.

Para evitar la caducidad semanal específica de Testing, completar los requisitos de Google Auth Platform y pasar a **In production**, luego volver a autorizar y reemplazar el refresh token. El 23/09, «Publicar app» estaba deshabilitado por información de marca incompleta; los campos de página principal y política de privacidad estaban vacíos. Publicar una política real, acorde al tratamiento de datos, y atender los requisitos de dominio/verificación que Google solicite. No inventar enlaces ni asumir que cambiar el estado verifica automáticamente la app. Los tokens en producción también pueden ser revocados o invalidarse por otras causas.

### Procedimiento ante una nueva caducidad

1. Revisar el fallo del envío OTP y validar la credencial contra Google sin imprimir tokens, códigos ni respuestas sensibles. No asumir que cualquier error de login es caducidad OAuth.
2. Reautorizar **solo la cuenta remitente** siguiendo la sección Gmail API anterior, con credenciales del cliente propio en OAuth Playground, alcance `gmail.send` y acceso offline.
3. Guardar el nuevo refresh token privadamente; actualizar `GMAIL_REFRESH_TOKEN` en Render conservando el resto de variables. No pegarlo en tickets, documentación o chats.
4. Aplicar la configuración mediante el despliegue/reinicio correspondiente, evitando operaciones activas. Verificar estado `live`, pedir un OTP propio desde la URL pública, comprobar recepción y completar el login. No reenviar códigos en bucle ni desactivar 2FA para sortear el fallo.
5. Registrar fecha, estado OAuth, despliegue y resultado de la prueba. Si sigue Testing, calcular nuevamente la revisión preventiva y caducidad estimada desde la nueva emisión.

Fuente: [Google OAuth — caducidad de refresh tokens](https://developers.google.com/identity/protocols/oauth2#expiration).

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
