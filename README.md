# Carnavales 2027

Aplicación web de gestión y votación de comparsas: configuración de eventos/jornadas, jurados y planillas, supervisión, penalizaciones, escrutinio, actas y resultados públicos. El jurado usa una PWA **online-first**: un voto solo queda confirmado cuando lo acepta la API. La [aplicación piloto](https://carnavales2027-piloto.onrender.com/) no constituye por sí sola habilitación para una votación real.

**Estado documentado:** 20/10/2026, commit `7c45056` LIVE en Render tras migraciones SQL 090/095. Es una foto histórica, no garantía del estado actual; consultar [despliegue y respaldo](docs/despliegue-y-respaldo.md) antes de actualizar.

## Elegí tu punto de entrada

- **Usuarios y responsables:** [flujos y pantallas](docs/flujos-y-pantallas.md), [reglas de negocio](docs/reglas-de-negocio.md), [privacidad](docs/privacidad-y-retencion.md).
- **Desarrollo:** [mapa de documentación](docs/README.md), [API](api/README.md), [cliente](client/README.md), [arquitectura](docs/arquitectura.md), [modelo de datos](docs/modelo-de-datos.md), [contrato HTTP](docs/contrato-api.md).
- **Operación:** [plan de pruebas](docs/plan-de-pruebas.md), [seguridad](docs/seguridad.md), [despliegue y respaldo](docs/despliegue-y-respaldo.md).
- **Agentes/colaboradores:** leer [AGENTS.md](AGENTS.md) y el `AGENTS.md` del módulo antes de cambiar comportamiento. [MEMORY.md](MEMORY.md) es el resumen durable, sin secretos.

La [spec 029](specs/029-piloto-produccion/spec.md) aprueba únicamente el piloto de infraestructura. **No hay reglamento general completo aprobado** en este repositorio; ver pendientes en [PRD](docs/PRD.md) y [decisiones](docs/decisiones.md). La implementación de desempates/actas no equivale a aprobación reglamentaria universal.

## Organización y stack

| Carpeta | Responsabilidad | Stack verificado |
| --- | --- | --- |
| `api/` | Express, Better Auth, reglas, PostgreSQL, migraciones y pruebas | Node.js, JavaScript ESM, Express 5, `pg` |
| `client/` | React/PWA, rutas hash, pantallas y pruebas | React 19, Vite 7, JavaScript/JSX, CSS propio |
| `docs/` | Producto, contratos, operación y decisiones | Markdown, vinculado a código/specs |
| `specs/` | Iniciativas aprobadas dentro de su alcance | Actualmente spec 029 versionada |

No hay `package.json` ni workspace npm en la raíz. Las versiones exactas están en `api/package-lock.json` y `client/package-lock.json`. Roles efectivos: `ADMIN`, `JUDGE`, `VEEDOR`, `COMISARIO`, `SCRUTINEER`, `ESCRIBANO`; la [matriz](docs/matriz-de-permisos.md) distingue lectura, escritura y separación de funciones. `ADMIN_EVENT` histórico no concede administración global actual.

## Puesta en marcha local (PowerShell)

Requisitos: Node 22 recomendado (Vite requiere `^20.19.0 || >=22.12.0`), npm y PostgreSQL con permisos para crear extensiones/migrar. Crear una base de **desarrollo** y otra **descartable** para tests. No usar Neon para pruebas.

```powershell
npm --prefix api ci
npm --prefix client ci
if (!(Test-Path api/.env)) { Copy-Item api/.env.example api/.env }
```

Completar `api/.env` con `DATABASE_URL` local, `BETTER_AUTH_SECRET` nuevo (no cambiar el de una base importada), `BETTER_AUTH_URL=http://localhost:3000`, `FRONTEND_URL=http://localhost:5173`, `TRUST_PROXY=0` y `EMAIL_PROVIDER=console` para desarrollo. No versionar ese archivo.

```powershell
cd api
npm run auth:migrate
npm run db:migrate
npm run dev
# En otra terminal, desde client/: npm run dev
```

El orden de migración importa: Better Auth antes de las tablas del dominio. Cliente en `http://localhost:5173/#/login` (o puerto anunciado por Vite), API en `http://localhost:3000`; Vite proxifica `/api`. `GET /health` solo verifica que responde el proceso, no la base ni el correo. Un fixture integral de desarrollo existe con `npm run seed:event:full` desde `api/`; usarlo **solo en desarrollo/pruebas, nunca en producción**. Detalles en los README de cada módulo.

## Validación y trabajo

- Cliente: `npm test --prefix client`. Por `client/AGENTS.md`, **no ejecutar build local** para validar cambios; CI sí lo ejecuta.
- API: `npm test --prefix api` solo con `DATABASE_URL` y `TEST_DATABASE_URL` apuntando a una base descartable ya migrada; ver [plan de pruebas](docs/plan-de-pruebas.md).
- CI: `.github/workflows/ci.yml` instala, migra y prueba en PostgreSQL descartable; el resultado de CI **no** aplica migraciones a Neon.
- Tras un cambio, revisar tests pertinentes, `git diff --check`, contratos/docs afectados y secretos ausentes. Commits convencionales, sin atribución automática.

## Producción piloto

Render Free sirve cliente y API bajo el mismo HTTPS; Neon conserva PostgreSQL y Gmail API envía correo transaccional. `autoDeploy` está **apagado**. Un push a `main` no publica: hay que fijar commit, descartar votación activa, respaldar/restaurar Neon, ensayar/aplicar migraciones y desplegar manualmente. No pulsar «Deploy latest commit» sin ese gate. Ver [runbook vigente](docs/despliegue-y-respaldo.md); el [archivo histórico](docs/historico/README.md) conserva antecedentes, no instrucciones actuales.

Si una PWA abierta sigue mostrando la versión anterior, cerrar/reabrir la pestaña **cuando no haya planilla en curso**. No forzar actualización durante votación. Si falla el código, un rollback de Render no revierte la base: conservar Neon y recuperar datos solo en otra base vacía.
