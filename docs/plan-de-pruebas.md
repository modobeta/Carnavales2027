# Plan de pruebas

**Objetivo:** demostrar comportamiento, seguridad e integridad sin alterar datos reales. CI existente: `.github/workflows/ci.yml`.

| Nivel | Comando/medio | Casos prioritarios |
| --- | --- | --- |
| API + PostgreSQL descartable | `npm test --prefix api` con `TEST_DATABASE_URL` y `DATABASE_URL` de **la misma base descartable**, tras `npm run auth:migrate --prefix api` y `npm run db:migrate --prefix api` | Votos 1–10/ausente, ownership, permisos 401/403, replay idempotente, concurrencia, inmutabilidad, cierres, resultados, actas |
| Auditoría | `npm run audit:verify --prefix api` contra base de prueba/restauración | Cadena íntegra, cabecera, evidencia conservada |
| Cliente | `npm test --prefix client` | Login/OTP UI, guards, carga/error/empty, PWA/reintento manual, planilla y filtros, responsive/accesibilidad |
| CI | `Pilot checks` / job `verify` en GitHub Actions | Instala dependencias, migra DB test dos veces (la segunda sin pendientes), prueba API+cliente, audita, construye cliente y comprueba enlaces relativos de Markdown y diff limpio |
| Release | Backup+SHA-256, restauración en DB vacía, ensayo de migraciones dos pasadas, smoke público | No votación activa, `main` fijo, Render LIVE mismo SHA, `/health`, assets, login+OTP, roles y datos sin votos de prueba |

**Nunca** ejecutar suites destructivas contra Neon/una copia con valor operativo; `api/src/scripts/assert-test-database-url.js` es una defensa, no permiso para apuntar a producción. Las pruebas manuales de jurado deben usar un evento de ensayo identificado o ser solo lectura.

## Matriz mínima de regresión

- Autenticación: contraseña incorrecta, OTP incorrecto/vencido, sesión expirada, límites 429.
- Autorización: cada rol permitido y denegado; usuario con múltiples roles; evento/asignación ajenos.
- Votación: item padre/hijo, `NOT_PRESENTED`, duplicado equivalente/diferente, timeout sin falso éxito, dos requests concurrentes, planilla incompleta/completa, cierre.
- Administración: readiness incompleto, operación repetida, borrado con historial, reorden del tramo congelado, última cuenta ADMIN protegida.
- Resultados/evidencia: snapshot público solo liberado, penalización/anulación, acta/hash, cadena de auditoría.
- PWA: versión nueva sin interrumpir planilla; reconexión sin cola automática de votos.

## Registro

Anotar SHA, fecha, entorno **sin secretos**, comandos ejecutados, cantidad de tests, fallas preexistentes/regresiones y evidencia de restauración. No afirmar «pasó» por una ejecución anterior. Ver [despliegue](despliegue-y-respaldo.md).
