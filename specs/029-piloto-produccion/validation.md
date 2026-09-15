# Validación del piloto — 2026-09-15

## Resultados comprobados

| Comando o comprobación | Estado | Evidencia y alcance |
| --- | --- | --- |
| Suite API con `node --test --test-concurrency=1` sobre las tres carpetas del script npm | Aprobado | 199 pruebas, 0 fallos, 0 omitidas; Node 22.19.0, PostgreSQL 18, base local nueva terminada en `_test`. |
| Repetición focalizada de `pilot-auth`, `two-factor`, `email-gmail` y `pilot` tras ampliación OTP | Aprobado | 14 pruebas; 30 cuentas completan login/OTP por una IP; cuarto envío devuelve 429 sin invalidar el código anterior; diez fallos guardan bloqueo por cuenta en BD. |
| `npm.cmd test --prefix client` | Aprobado | 316 pruebas en 49 archivos. |
| `npm.cmd run build --prefix client` | Aprobado | Vite compila cliente y genera SW versionado por contenido. |
| `git diff --check` | Aprobado | Sin errores de espacios; Git informa conversión habitual LF/CRLF. |
| Blueprint contra esquema JSON oficial Render | Aprobado | PyYAML y Ajv 2020; `autoDeployTrigger: "off"` explícitamente textual. CLI Render no instalada. |
| `node scripts/pilot-data.js restore .env.pilot-current-test backups/pilot-20260915.dump` | Aprobado | PostgreSQL 18; 41 tablas coinciden con inventario; SHA-256 `8dbe6e16f81cd72d3ff54e694bd280b3582170682497263d06405978348abfd7`. Destino vacío y local. |
| Comparación de origen y copia restaurada previamente | Aprobado | 497 restricciones, 107 índices y 75 migraciones/checksums coinciden. No se escribieron datos en el origen. |
| `verifyAuditChain` con pools explícitos | Aprobado | Copia restaurada: 1 evento; base aislada después de suite: 167 eventos. |
| Chromium local sobre cliente compilado servido por Express | Aprobado | 1366×900 y 390×844, sin errores JS ni desbordamiento horizontal móvil. Auth simulada en esta comprobación visual. |
| Actualización real del SW entre dos builds locales | Aprobado | Nuevo worker espera al cliente anterior; activa al cerrar pestaña; elimina caché previa y abre interfaz offline. No demuestra votos offline ni despliegue público. |

El sandbox inicialmente bloqueó procesos hijos con `spawn EPERM`. Las ejecuciones posteriores usaron permisos revisados; no se cambió la política de PowerShell. Se empleó Playwright/Chromium instalado como alternativa local a la CLI `agent-browser`, no disponible. Artefactos y secretos permanecen en rutas ignoradas.

## Advertencias y bloqueos

| Estado | Pendiente |
| --- | --- |
| Advertencia | Gmail se probó con respuestas HTTP simuladas, incluyendo concurrencia, OAuth revocado, cuota y fallos. No se enviaron correos reales. |
| Advertencia | CI está escrito y sus gates locales pasan; falta ejecución en GitHub. Sin scripts lint/typecheck. |
| Advertencia | Gmail OAuth Testing emite tokens que caducan en siete días. Revisar autorización del remitente y requisitos de Google. |
| Bloqueo | Falta `api/.env.pilot` con destino Neon y credenciales Gmail privadas. El usuario confirma cuentas Render y Neon. |
| Bloqueo | Cambios sin commit/push/merge por la instrucción de publicación manual. Render no puede desplegar esta revisión desde main. |
| Bloqueo | Sin corte definitivo, importación a Neon ni URL pública. No se verificaron entrega real, cookies HTTPS, proxy real, reinicio Render ni recorridos públicos. |

No se declara el piloto publicado. Pasos, comandos de Git y plantilla de PR en `DEPLOYMENT.md`.
