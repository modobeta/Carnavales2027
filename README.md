# Carnavales2027_v2

Plataforma de gestión y votación de Carnavales de Goya 2027. Reúne configuración de competencia, jurados, planillas, supervisión, penalizaciones, escrutinio y consulta pública de resultados.

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
- npm y PostgreSQL disponible. CI usa PostgreSQL 16.
- Una base local de desarrollo y otra **aislada y descartable** para pruebas; permisos para las migraciones y `pgcrypto`.
- Para backup/restore: Bash y herramientas PostgreSQL; ver las advertencias del [README API](api/README.md#backup-y-restauración).

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

```powershell
if (!(Test-Path api/.env)) { Copy-Item api/.env.example api/.env }
```

Editá `api/.env`: configurá `DATABASE_URL`, un `BETTER_AUTH_SECRET` aleatorio, `BETTER_AUTH_URL=http://localhost:3000`, `FRONTEND_URL=http://localhost:5173` y `TRUST_PROXY=0`. Para entrega local de códigos usá `EMAIL_PROVIDER=console`. No compartas secretos ni credenciales reales.

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

No hay scripts de lint ni de typecheck configurados. La copia local conserva un workflow CI, pero `.github/` está excluida de la publicación: este repositorio no incorpora ese workflow ni ejecuta CI automáticamente por él. **La regla de trabajo local es no ejecutar builds después de cambios.** Las validaciones históricas no demuestran que una revisión concreta haya pasado sus pruebas.

## Despliegue y límites operativos

- La API no sirve el cliente estático. El hosting debe servir el frontend y enrutar `/api` hacia Node bajo el mismo origen para el funcionamiento actual de HTTP y SSE.
- Configurá HTTPS, las URL reales, SMTP y los proxies confiables; no copies secretos de desarrollo a producción.
- El bus SSE vive en memoria de un proceso. No hay distribución de eventos entre réplicas ni configuración de despliegue automatizado en este árbol.
- Consultá las [advertencias de restauración](api/README.md#backup-y-restauración). El runbook de piloto pertenece a la documentación local no publicada. No ejecutar restauraciones sin autorización y destino verificado.

## Alcance de publicación

Se conservan código, recursos, migraciones, herramientas operativas, pruebas, manifiestos/lockfiles npm, README y plantillas `.env.example`. Las pruebas y sus configuraciones permiten mantener los comandos del proyecto reproducibles.

Por decisión del propietario, `docs/`, `specs/`, todos los `AGENTS.md` y `.github/` permanecen locales y están excluidos mediante `.gitignore`; no se necesitan para ejecutar la aplicación. Un clon del repositorio no incluirá la trazabilidad interna, las instrucciones de agentes ni el workflow local. También se excluyen secretos, dependencias instaladas, generados y backups de base de datos.

Revisá siempre el contenido preparado para commit: `.gitignore` no detecta secretos dentro de código ni deja de versionar archivos que ya estuvieran registrados. No uses `git add -f` para eludir estas exclusiones.

No se incluye un archivo de licencia en este árbol; los paquetes npm están marcados como privados.

