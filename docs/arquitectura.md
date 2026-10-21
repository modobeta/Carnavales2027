# Arquitectura implementada

**Corte:** 20/10/2026 (`7c45056`). No existe un workspace npm raíz: `api/` y `client/` tienen manifiestos/lockfiles independientes.

```text
Navegador React 19 / Vite 7 / PWA
  ├─ hash routes, contextos, API client, caché de contexto
  └─ HTTPS mismo origen
       ├─ /api/auth/*     Better Auth, cookies de sesión, 2FA
       ├─ /api/v1/*       Express 5: middlewares → rutas → servicios → pg
       ├─ /health         salud HTTP
       └─ dist/           cliente servido por Express en producción
                                │
                         PostgreSQL (Neon)
                         migraciones SQL, constraints/triggers,
                         votos, roles, auditoría, snapshots
```

**Correo:** API envía OTP, invitaciones y recuperación por Gmail API HTTPS en el piloto; SMTP es alternativa local/configurable. Render aloja un único proceso Node en plan Free. SSE para monitor/resultados usa bus en memoria: no hay distribución entre réplicas. Ver `api/src/app.js`, `api/src/server.js`, `api/src/email/`, `api/src/modules/monitor/` y `client/src/App.jsx`.

## Límites y flujo crítico

1. La UI pide una acción y muestra estado online; nunca es autoridad de permisos o voto.
2. Middleware verifica sesión, 2FA, rol y contexto. Servicio valida estado de evento, asignación/planilla y reglas.
3. PostgreSQL aplica claves/constraints/triggers; operaciones críticas usan transacción, idempotencia y auditoría.
4. La respuesta aceptada por API confirma. En offline/timeout, la UI permite reintento manual; IndexedDB no confirma ni reenvía automáticamente el flujo principal.
5. Resultados internos se calculan; el portal público lee versiones/snapshots liberados.

## Configuración y despliegue

`render.yaml` describe intención, pero el servicio actual se creó directamente y editar ese archivo **no actualiza** el Dashboard. Render usa rama `main`, `autoDeploy` desactivado; instala API/cliente, genera `client/dist` y arranca API. No ejecuta migraciones al iniciar. Ver [despliegue](despliegue-y-respaldo.md) y [decisión de despliegue](decisiones.md).

## Deuda/limitaciones conocidas

No hay contrato OpenAPI generado ni ERD versionado. PWA online-first, no votación offline. El hash de acta implementada cubre JSON canónico, no bytes de PDF. El reglamento global y la política de retención definitiva siguen pendientes. La arquitectura no garantiza operación real por el solo hecho de que el piloto esté en línea.
