# Carnavales 2027

Plataforma de gestión y votación de Carnavales de Goya 2027. Reúne configuración de competencia, jurados, planillas, supervisión, penalizaciones, escrutinio y consulta pública de resultados.

Esta guía está dirigida a desarrolladores, responsables de operación y usuarios. Describe el código de esta copia; no reemplaza la aprobación del reglamento ni certifica que el piloto pueda usarse para una votación real.

## Por dónde empezar

- **Usuarios:** [guía de uso](#guía-de-uso) y [problemas frecuentes](#problemas-frecuentes).
- **Desarrolladores:** [puesta en marcha](#puesta-en-marcha-local), [API](api/README.md) y [cliente](client/README.md).
- **Operación:** [despliegue](#despliegue-y-límites-operativos), [estado del piloto](#estado-del-piloto-al-16092026) y [procedimiento de despliegue y recuperación](DEPLOYMENT.md).

## Estado del piloto al 16/09/2026

**URL:** https://carnavales2027-piloto.onrender.com — [ingresar](https://carnavales2027-piloto.onrender.com/#/login) · [resultados públicos](https://carnavales2027-piloto.onrender.com/#/resultados).

| Componente | Estado comprobado |
| --- | --- |
| Render | Servicio Node 22 Free en Virginia, una instancia, despliegue manual desde `main` |
| Neon | PostgreSQL 18, TLS verificado, 75 migraciones coincidentes en la revisión previa al despliegue |
| Gmail API | OAuth y entrega real de correo comprobados; el login público aceptó credenciales y solicitó el envío de OTP |
| Acceso completo | Falta registrar la comprobación final del OTP y el ingreso al panel desde la URL pública; no confundir envío con login completo |
| Better Auth | Secreto de ejemplo reemplazado mediante rotación y recifrado; sesión anterior vencida y evidencia de auditoría preservada |
| Salud | `/health` respondió 200; el health check HTTP de Render a `/health` todavía debe configurarse en el Dashboard |

El servicio se creó directamente por Render MCP, **no como Blueprint vinculado**. `render.yaml` es la referencia de infraestructura: editarlo no actualiza automáticamente ese servicio. Los resultados de pruebas anteriores son evidencia histórica, no una nueva ejecución de las suites.

### Diferencias funcionales pendientes de conciliación

Hay instrucciones históricas que no coinciden con esta implementación:

- Las reglas históricas indican notas **0–5** y selección de noche sin asignaciones. El código actual usa asignaciones/planillas; `ballot-service.js` acepta `SCORED` **1–10**, `NOT_PRESENTED` con 0 y `PENDING` sin nota.
- El stack real es JavaScript/JSX, navegación hash y CSS propio, aunque algunas instrucciones locales describen TypeScript, React Router y Tailwind.
- El acta implementada verifica un payload JSON canónico con SHA-256. No equivale a generar un PDF oficial cuyo hash corresponda a los bytes del archivo.

Estas diferencias **no constituyen una modificación aprobada del reglamento**. Antes de una votación real, responsables funcionales y técnicos deben conciliarlas y actualizar especificaciones, implementación y pruebas. Esta documentación no modifica las reglas ni habilita excepciones.

## Organización

El proyecto contiene dos paquetes npm independientes: no hay `package.json` ni workspace npm en la raíz.

```text
api/       API HTTP, autenticación, reglas de negocio, PostgreSQL y pruebas
client/    Aplicación React, estilos, recursos PWA y pruebas de interfaz
```

| Área | Tecnología verificada | Documentación |
| --- | --- | --- |
| API | Node.js, Express 5, Better Auth 1.6.27, `pg`, Nodemailer | [README API](api/README.md) |
| Cliente | React 19, Vite 7, JavaScript/JSX, CSS propio | [README cliente](client/README.md) |
| Persistencia | PostgreSQL, extensión `pgcrypto`, migraciones SQL | [Base de datos](api/README.md#base-de-datos) |
| Pruebas | `node:test`, Vitest, Testing Library, jsdom | [Validación](#validación) |

Las versiones exactas instalables están en los dos `package-lock.json`.

## Funcionalidades presentes

- Eventos y jornadas; categorías, comparsas, especialidades, rubros, ítems, criterios y orden de pasada.
- Padrón de jurados, invitaciones, perfiles operativos, cupos, asignaciones y suplencias priorizadas.
- Acceso con contraseña y segundo factor por correo; registro público deshabilitado.
- Planillas online, confirmación por ítem, control de completitud y avance por orden de pasada.
- Apertura/cierre administrativo y supervisión de progreso con SSE, sin divulgar puntajes individuales en el monitor.
- Penalizaciones, consolidación de resultados, desempate ceremonial y actas oficiales con hash e impresión.
- Portal público de snapshots de resultados liberados, con actualización SSE.

**PWA no significa votación offline.** Existe infraestructura histórica de caché/sincronización, pero la planilla vigente guarda en el servidor y no usa una cola offline. Tampoco se habilitan nuevas reaperturas.

## Requisitos

- Node compatible con `^20.19.0 || >=22.12.0`, requisito de Vite y su plugin React en el lockfile. Los manifiestos de ambos paquetes solo declaran `>=20`, que no alcanza para describir el requisito del cliente.
- npm y PostgreSQL disponible. Para reproducir el entorno del piloto, usá Node 22 y PostgreSQL 18; CI también usa esas versiones.
- Una base local de desarrollo y otra **aislada y descartable** para pruebas; permisos para las migraciones y `pgcrypto`.
- Para el respaldo del piloto: herramientas PostgreSQL 18 (`pg_dump`, `pg_restore`) y el script Node documentado en la [API](api/README.md#backup-y-restauración). Bash solo es necesario para herramientas históricas.

## Puesta en marcha local

Los ejemplos de terminal usan PowerShell. Ejecutá cada comando desde la carpeta indicada y detenete si alguno falla.

### 1. Instalar dependencias

Desde la raíz:

```powershell
npm --prefix api ci
npm --prefix client ci
```

### 2. Configurar la API y preparar la base

Creá previamente la base de desarrollo. Copiá la plantilla **solo si todavía no existe** `api/.env`:

Podés crearla con pgAdmin o, con PostgreSQL iniciado y sus herramientas en `PATH`, ejecutar `createdb --host=localhost --username=postgres carnavales2027_dev`. El comando solicita la contraseña del usuario PostgreSQL si el servidor la requiere; ese usuario de base no es una cuenta de la aplicación.

```powershell
if (!(Test-Path api/.env)) { Copy-Item api/.env.example api/.env }
```

Editá `api/.env`: configurá `DATABASE_URL`, un `BETTER_AUTH_SECRET` aleatorio, `BETTER_AUTH_URL=http://localhost:3000`, `FRONTEND_URL=http://localhost:5173` y `TRUST_PROXY=0`. Para entrega local de códigos usá `EMAIL_PROVIDER=console`. No compartas secretos ni credenciales reales.

Para **una base nueva**, podés generar el secreto con `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"` y guardarlo privadamente. No ejecutar este paso para reemplazar la clave de una base importada. La conexión tiene forma `postgresql://USUARIO:CONTRASEÑA@localhost:5432/carnavales2027_dev`; codificá los caracteres especiales de usuario/contraseña como componentes de URL.

La plantilla `.env.example` de la raíz es orientativa: los entrypoints Node cargan el `.env` del directorio de ejecución. Trabajá desde `api/` para los scripts de backend.

```powershell
cd api
npm run auth:migrate
npm run db:migrate
```

**El orden importa:** primero las tablas de Better Auth; después las migraciones de dominio, que las referencian.

### 3. Crear datos de prueba, si los necesitás

En `api/.env`, definí `NODE_ENV=development`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_NAME` y `SEED_DEMO_PASSWORD` (8–128 caracteres; también puede usarse `SEED_ADMIN_PASSWORD` como respaldo). Desde `api/`:

```powershell
npm run seed:event:full
```

Este es el único seed público. Genera un evento ficticio con tres jornadas, siete comparsas, nueve jurados y accesos ADMIN/ESCRIBANO/VEEDOR. Queda en `CONFIGURING`, sin votos ni planillas anticipadas: las planillas se crean al abrir la votación. Fechas, personas y horarios del fixture **no son datos oficiales**.

El seed rechaza producción y configuraciones alteradas o ya iniciadas. Su repetición puede sincronizar contraseñas y revocar sesiones de las cuentas del fixture; no es una operación de solo lectura. El alta inicial de producción usa otro procedimiento: [bootstrap administrativo](api/README.md#administrador-inicial-de-producción).

### 4. Iniciar ambos procesos

Terminal de API, desde `api/`:

```powershell
npm run dev
```

Otra terminal, desde la raíz:

```powershell
cd client
npm run dev
```

- Cliente: `http://localhost:5173/#/login` (verificá el puerto informado por Vite).
- API: `http://localhost:3000`; `GET /health` devuelve `{ "status": "ok" }`. Este endpoint no comprueba PostgreSQL.
- Vite redirige `/api` a `http://localhost:3000`.
- Completá el segundo factor del usuario para acceder a las áreas operativas. Con el proveedor local, el OTP se entrega en la terminal de la API.

## Roles y separación de funciones

| Rol | Responsabilidad principal |
| --- | --- |
| `ADMIN` | Configuración, accesos, asignaciones, apertura/cierre y supervisión |
| `JUDGE` | Evaluación de las planillas de su asignación habilitada |
| `VEEDOR` | Supervisión, con perfil operativo registrado |
| `COMISARIO` | Gestión de penalizaciones, también accesible a ADMIN |
| `SCRUTINEER`, `ESCRIBANO` | Liberación de resultados, sorteo ceremonial y certificación de actas |

ADMIN puede consultar resultados y actas, pero **el rol ADMIN por sí solo no autoriza** liberarlos, realizar el sorteo ni certificar. La API verifica los permisos; ocultar un botón en el cliente no sustituye esa autorización.

## Validación

```powershell
# Desde client/: pruebas de interfaz, sin build
npm test
```

En API, `npm test` y `npm run db:test` exigen `TEST_DATABASE_URL`. Prepará una base descartable con ambas familias de migraciones según la [guía de pruebas](api/README.md#pruebas). Los tests escriben datos: no deben apuntar a desarrollo operativo ni producción.

No hay scripts de lint ni de typecheck configurados. El piloto incorpora `.github/workflows/ci.yml` para pruebas API/PostgreSQL 18 y cliente/build en Node 22. La evidencia histórica está en `specs/029-piloto-produccion/validation.md`; no representa pruebas ejecutadas en cada actualización documental.

La regla de trabajo local es **no ejecutar builds después de cambios**: usar pruebas apropiadas. El build remoto del despliegue y el declarado por CI son pasos distintos, no una instrucción para compilar localmente.

## Guía de uso

### Ingreso y cuenta

1. Abrí `/#/login` en un navegador actualizado, con acceso a internet y al correo de tu cuenta.
2. Ingresá **correo y contraseña**. El campo **Email** envía el correo a Better Auth; no existe allí una búsqueda por DNI.
3. Ingresá el código de seis dígitos enviado a tu correo y pulsá **Verificar código**. No compartas ese código ni tu contraseña.
4. El sistema abre el área correspondiente a tus roles. Si falta un permiso o perfil, pedí al administrador que revise el acceso; no crees otra cuenta para evitar el control.

No hay registro libre ni una contraseña universal del proyecto. El responsable entrega la invitación o acceso inicial por un canal privado. La contraseña queda almacenada como hash en la base; las variables de seed/bootstrap no son un directorio de contraseñas vigentes.

La recuperación está en `/#/forgot-password`; el enlace recibido permite definir una contraseña nueva. `/#/cuenta` contiene las opciones de cuenta. Cerrá sesión al terminar, especialmente en dispositivos compartidos.

### Administración: preparar una prueba

1. Seleccionar o crear un evento y sus jornadas.
2. Completar categorías, comparsas, especialidades, rubros/ítems y criterios; revisar las nominaciones cuando correspondan.
3. Configurar personas, perfiles, invitaciones y los roles necesarios. En la implementación actual, revisar cupos/asignaciones de jurados.
4. Ordenar las pasadas por jornada y verificar fechas, horarios y pertenencia al evento.
5. Revisar los bloqueos de preparación (*readiness*) antes de abrir la votación. No omitir controles mediante cambios directos en la base.
6. Abrir la ventana de votación, supervisar avance y cerrar mediante el flujo administrativo autorizado.

Las confirmaciones sensibles deben revisarse antes de aceptarlas. Si el servidor rechaza borrar un recurso con historia, no forzar el borrado: protege evidencia y dependencias.

### Jurado: evaluar

1. Ingresar y comprobar que el perfil y las planillas habilitadas correspondan a la jornada/especialidad asignada en esta versión.
2. Abrir la comparsa disponible según el orden de pasada y revisar cada ítem.
3. Registrar la decisión y esperar la confirmación del servidor. Una decisión confirmada no se edita como un formulario común.
4. Resolver los pendientes y confirmar el envío de la planilla cuando corresponda. Un pendiente no equivale a una nota cero.
5. Si se corta internet o hay timeout, revisar el estado al recuperar conexión y usar el reintento ofrecido; no asumir que el voto quedó guardado ni crear otra operación por fuera del flujo.

Si faltan planillas, revisar con Administración el perfil, asignación y apertura. Una anomalía se comunica a los responsables para tratamiento auditable; nunca se corrige silenciosamente por SQL.

### Supervisión, penalizaciones y resultados

- **VEEDOR:** revisar progreso y alertas del monitor; el monitor no muestra notas individuales.
- **COMISARIO/ADMIN:** gestionar penalizaciones con motivo y controles del flujo, sin eliminar evidencia previa para representar una anulación.
- **SCRUTINEER/ESCRIBANO:** revisar escrutinio, ejecutar únicamente los mecanismos de desempate implementados y autorizados, liberar resultados y certificar actas según permisos.
- **Público:** consultar `/#/resultados` sin cuenta; solo aparecen los eventos/resultados publicados, no la votación privada en curso.

La impresión de un acta desde el navegador no agrega por sí misma una firma digital ni un hash sobre el PDF generado.

## Problemas frecuentes

| Síntoma | Qué revisar |
| --- | --- |
| La primera carga tarda | El alojamiento gratuito puede estar suspendido por inactividad; esperar sin reenviar votos ni disparar solicitudes en bucle |
| No llega el OTP | Cuenta correcta, Spam, vencimiento y límite de reenvíos; el operador revisa Gmail OAuth/cuotas y errores de entrega sin registrar códigos |
| «Correo o contraseña incorrectos» | Usar el correo de la cuenta; recuperar contraseña si corresponde. No probar claves repetidamente |
| Error 429 | Respetar `Retry-After` y esperar; refrescar o cambiar de dispositivo no soluciona un bloqueo por cuenta |
| No aparecen planillas | Perfil registrado, roles, asignaciones y ventana abierta en esta implementación |
| No aparecen resultados públicos | Deben estar liberados; no significa necesariamente que se hayan perdido datos |
| Interfaz antigua tras un despliegue | Finalizar acciones pendientes, cerrar todas las pestañas/ventanas de la PWA y volver a abrir online |
| La PWA abre «Página no encontrada» | Abrir `/#/login`; existe una discrepancia conocida entre el `start_url` del manifest y las rutas |
| Falla la conexión a PostgreSQL | En desarrollo, servicio/host/puerto y base correcta; en piloto, URL Neon, TLS y credenciales. No ejecutar seed para «reparar» una conexión |

Al reportar un problema, incluir fecha/hora, rol, pantalla, pasos, código de error y `requestId` si existe. Ocultar contraseñas, OTP, tokens, cookies, URLs de conexión y datos personales en capturas/logs.

## Despliegue y límites operativos

- En producción Express sirve `client/dist` y `/api` bajo el mismo origen HTTPS, con CSP diferenciada.
- Configurá HTTPS, las URL reales, Gmail API y el proxy de Render; conservá privadamente BETTER_AUTH_SECRET al trasladar los datos cifrados.
- El bus SSE vive en memoria de un proceso. El piloto usa una instancia y `render.yaml` con despliegue manual, sin distribución de eventos entre réplicas.
- Consultá el procedimiento de respaldo y restauración conservadora en [DEPLOYMENT.md](DEPLOYMENT.md). No ejecutar restauraciones sin autorización y destino verificado.

### Configuración efectiva del servicio actual

El comando de inicio configurado en Render deriva ambos orígenes de la URL asignada por la plataforma:

```sh
BETTER_AUTH_URL="$RENDER_EXTERNAL_URL" FRONTEND_URL="$RENDER_EXTERNAL_URL" npm start --prefix api
```

Render instala ambos paquetes y genera el cliente con el comando de build de `render.yaml`. No ejecuta seeds, bootstrap ni migraciones al arrancar. Un push a GitHub **no despliega** este servicio: revisar el commit y activar el despliegue manual cuando corresponda. Si se incorpora un dominio propio, revisar también ese comando, las URL, cookies y enlaces de correo.

`api/.env` corresponde al desarrollo local; `api/.env.pilot` es una configuración privada del piloto, no distribuida por Git. Tener un archivo `.env.pilot` no hace que `npm start` lo cargue automáticamente. No copiar la configuración local sobre Render ni usar la base Neon operativa para tests.

El piloto gratuito contempla hasta 30 usuarios como objetivo de prueba, no como garantía de capacidad. Hay suspensión por inactividad, almacenamiento efímero en Render y cuotas de Neon/Gmail. OAuth de Google en **Testing** hace caducar el refresh token a los siete días para este permiso; revisar el estado OAuth antes de una operación continuada. No mantener servicios artificialmente activos para evadir límites del plan.

### Antes de cada actualización

1. Revisar cambios, pruebas y compatibilidad de esquema; resolver discrepancias funcionales antes de una votación real.
2. Acordar una ventana sin escrituras y guardar un backup verificado fuera del servidor efímero.
3. Aplicar solo migraciones pendientes con el destino y secreto correctos, en un paso controlado.
4. Desplegar un commit identificado; verificar `/health`, interfaz, login + OTP, permisos y flujo afectado.
5. Probar reconexión/SSE y actualización PWA sin interrumpir planillas abiertas.

Ante fallos de datos, restaurar en **otra base vacía**, verificarla y recién después cambiar la conexión. No sobrescribir la base original. Una rotación de Better Auth necesita recifrado y revisión de sesiones: no alcanza con reemplazar la variable.

## Trabajo de desarrollo

- Leer los README del módulo, sus instrucciones locales y especificaciones disponibles; declarar los conflictos en vez de resolverlos silenciosamente.
- Mantener cambios acotados, validación en API/DB, control de roles y evidencia de operaciones sensibles.
- Agregar pruebas de comportamiento para integridad, idempotencia, concurrencia y fallas de conexión cuando corresponda.
- No modificar migraciones aplicadas ni agregar dependencias sin necesidad concreta.
- Documentar cambios de variables, contratos y comportamiento en el mismo cambio.
- Revisar `git diff --check` y los archivos preparados antes del commit. Usar commits convencionales sin atribución automática; nunca publicar `.env`, dumps, tokens ni artefactos de recuperación.

## Alcance de publicación

Se conservan código, recursos, migraciones, herramientas operativas, pruebas, manifiestos/lockfiles npm, README y plantillas `.env.example`. Las pruebas y sus configuraciones permiten mantener los comandos del proyecto reproducibles.

La documentación histórica `docs/`, `specs/`, los `AGENTS.md` y la automatización local permanecen excluidos mediante `.gitignore`. El plan del piloto autoriza dos excepciones acotadas: `specs/029-piloto-produccion/` y `.github/workflows/ci.yml`. También se excluyen secretos, dependencias instaladas, generados y backups de base de datos.

Revisá siempre el contenido preparado para commit: `.gitignore` no detecta secretos dentro de código ni deja de versionar archivos que ya estuvieran registrados. No uses `git add -f` para eludir estas exclusiones.

No se incluye un archivo de licencia en este árbol; los paquetes npm están marcados como privados.


## Piloto gratuito

Configuracion y traslado conservando datos: [DEPLOYMENT.md](DEPLOYMENT.md).
Registro del incidente Gmail/OTP del 23/09/2026 y procedimiento de renovación: [mantenimiento OAuth](DEPLOYMENT.md#registro-operativo-gmail-oauth--otp--23092026). Mientras siga en Testing, revisar antes del 30/09/2026; no hay recordatorio automático configurado.
Contrato aprobado: [Spec 029](specs/029-piloto-produccion/spec.md).
El workflow del piloto y esta spec son excepciones versionadas a las exclusiones locales.
