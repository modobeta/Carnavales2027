# Memoria operativa del repositorio

**Propósito:** contexto breve para la próxima sesión; no es un registro de credenciales, transcripciones ni sustituto de `docs/`. Actualizar cuando cambien stack, reglas, deployment o pendientes. Corte: 20/10/2026 (`7c45056`).

## Fuentes y límites

- `AGENTS.md` y los AGENTS de `api/`/`client/`: invariantes e instrucciones.
- `docs/README.md`: índice y estados (confirmado, implementado, pendiente).
- Spec 029: solo piloto Render/Neon/Gmail; no reglamento de votación real.
- No guardar secretos, URLs de conexión, OTP, dumps o PII aquí.

## Arquitectura y comandos

API Node/Express/Better Auth/pg (`api/`); cliente React/Vite/JSX/CSS/PWA (`client/`); PostgreSQL con SQL versionado. Auth migrate antes de db migrate. Tests API solo sobre DB descartable; cliente `npm test --prefix client`; CI también construye cliente. `client/AGENTS.md` prohíbe build local.

## Producción piloto y riesgo principal

Render servicio `srv-dal5pcv40ujc739l5r30` despliega manualmente `main`; Auto Deploy off. Último corte comprobado: 20/10/2026, `7c45056`, migraciones 090/095 aplicadas a Neon, 0 votaciones abiertas, backup restaurado/ensayado, HTTP público sano. **Volver a verificar** antes de afirmar estado presente. Render no migra al arrancar; CI no verifica datos productivos. Ver `docs/despliegue-y-respaldo.md`.

## Pendientes de producto/operación

Reglamento global (desempates, impugnaciones, votos tardíos, excepciones), política legal de retención, prueba post-release de login+OTP/roles y gate automatizado antes de considerar auto deploy. No transformar el comportamiento actual en regla aprobada. Último backup de release permanece privado fuera del repo; la ubicación/hash históricos constan en el runbook, no reutilizarlo como respaldo actual.
