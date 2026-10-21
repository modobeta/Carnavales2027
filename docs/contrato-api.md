# Contrato HTTP de referencia

**Estado:** inventario operativo, no OpenAPI exhaustivo. Fuente final: `api/src/app.js`, `api/src/routes/*.routes.js`, servicios y pruebas. Base pública `/api/v1`; auth de Better Auth en `/api/auth/*`; `/health` responde `{ "status": "ok" }`. La API y el frontend comparten origen HTTPS en Render.

## Convenciones comprobadas

- Las rutas privadas requieren cookie de sesión Better Auth, segundo factor completado y guarda de rol/contexto. No enviar `role` o `userId` como prueba de autorización.
- JSON de error actual: `{ "code": "..." }`, a veces con `message` o detalles específicos. La forma ejemplar `{error:{...}}` de `api/AGENTS.md` **no es el contrato implementado**. `api/src/routes/http-errors.js` y cada ruta determinan status/código.
- `400` validación, `401` sin sesión, `403` rol/contexto, `404` inexistente, `409` conflicto/estado, `413` payload grande, `422` algunos parámetros de negocio, `429` límites, `500` interno sin stack/SQL.
- En `PUT /judge/ballots/:ballotId/scores/:scoreId` y `POST /judge/ballots/:ballotId/submit`, enviar `Idempotency-Key` (o `X-Idempotency-Key`) estable por operación; replay equivalente devuelve `Idempotency-Replay: true`. No crear nueva clave para reintentar la **misma** operación.
- Respuestas de lectura/escritura usan formas específicas del recurso; no asumir un wrapper `{data,meta}` universal. API v1 manda `Cache-Control: no-store, private` por defecto; las rutas públicas de eventos/resultados lo sobrescriben con caché público breve y ETag en snapshots.

## Endpoints relevantes

| Método y ruta | Acceso | Uso |
| --- | --- | --- |
| `GET /health` | Público | Salud del proceso |
| `POST /api/auth/sign-in/email` y flujos `/api/auth/*` | Auth/rate limit | Login, sesión, OTP, recuperación; contrato Better Auth más configuración local |
| `GET /api/v1/me` | Sesión + 2FA | Identidad y roles efectivos |
| `GET /api/v1/public/events` | Público | Eventos con publicación consultable |
| `GET /api/v1/public/events/:eventId/results` | Público | Snapshot liberado, nunca borrador |
| `GET /api/v1/public/stream` | Público | Actualizaciones SSE de resultados |
| `GET/POST /api/v1/events`, `GET/PATCH /api/v1/events/:eventId` | ADMIN | Catálogo/configuración |
| `GET /api/v1/events/:eventId/readiness`, `POST /api/v1/events/:eventId/open` | ADMIN | Validar/abrir evento |
| `GET/POST /api/v1/events/:eventId/nights`; `PATCH/DELETE /api/v1/nights/:nightId` | ADMIN | Jornadas; borrado condicionado a historial |
| `GET/POST /api/v1/events/:eventId/judge-assignments` | ADMIN | Asignaciones; `GET /api/v1/judge/assignments` es del jurado |
| `POST /api/v1/events/:eventId/nights/:nightId/voting/open` y `POST /api/v1/events/:eventId/nights/:nightId/voting/close` | ADMIN | Ventana de votación |
| `GET /api/v1/judge/ballots`, `GET /api/v1/judge/ballots/:ballotId` | JUDGE propio | Planillas |
| `PUT /api/v1/judge/ballots/:ballotId/scores/:scoreId` | JUDGE propio | Confirmar decisión idempotente |
| `POST /api/v1/judge/ballots/:ballotId/submit` | JUDGE propio | Confirmar planilla completa |
| `GET /api/v1/monitor/events/:eventId/nights/:nightId` | ADMIN/VEEDOR habilitado | Monitoreo de jornada |
| `GET/POST /api/v1/events/:eventId/penalties` | ADMIN/COMISARIO | Penalizaciones |
| `GET /api/v1/events/:eventId/results` | ADMIN/SCRUTINEER/ESCRIBANO | Resultado interno |
| `POST /api/v1/events/:eventId/results/release` | SCRUTINEER/ESCRIBANO | Liberación pública |
| `GET/POST /api/v1/events/:eventId/scrutiny-record` | Lectura por roles de resultados; emisión SCRUTINEER/ESCRIBANO | Acta |

`events.routes.js` contiene más endpoints para categorías, comparsas, logos, especialidades, rubros, criterios, nominaciones y orden; `monitor.routes.js` añade incidencias/custodia. Antes de integrar un cliente, consultar esos archivos y pruebas de API para el cuerpo y status exactos. Si se necesita contrato completo para terceros, generar/validar OpenAPI desde las rutas y tests, no inventar payloads aquí.
