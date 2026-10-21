# Seguridad y controles

**Estado:** controles de código al 20/10/2026; no es auditoría formal ni certificación de seguridad.

## Fronteras

El navegador es no confiable. Express/servicios obtienen identidad de sesión Better Auth y aplican 2FA, rol, evento y propiedad. PostgreSQL protege relaciones/estados finales. El portal `/api/v1/public` solo expone resultados liberados. TLS en Render/Neon; secretos solo en entorno privado, nunca `VITE_*`, logs, cliente ni documentación.

## Controles existentes

- Correo/contraseña y OTP; cookies de sesión gestionadas por Better Auth; registro público deshabilitado.
- Rate limiting de login, OTP, auth y API; revisar valores efectivos en `api/src/security/` y `api/README.md`, no desactivarlos por Wi-Fi compartida.
- CORS/origen confiable, CSP diferenciada para frontend/API, límite de body y `Cache-Control: no-store, private` por defecto en API; rutas públicas de resultados tienen caché breve/ETag.
- Guardas por rol: `api/src/auth/require-*.js`; restricción de acceso a planilla, evento y asignación en servicios. Frontend guards no reemplazan API.
- Auditoría de operaciones sensibles, cadena SHA-256 y prohibición de secretos/OTP en logs; voto confirmado inmutable.
- Migraciones SQL con checksum y bloqueo asesor; administradores inicial/último protegidos por DB.

## Riesgos operativos

Gmail OAuth en modo Testing puede caducar/revocarse; monitorizar entrega antes del evento. Render Free duerme por inactividad y almacenamiento local es efímero; backups fuera de la instancia. SSE en memoria no escala a varias instancias. No considerar un `200 /health` como prueba de login, correo, DB y flujos por rol. El release automático sin migraciones/backup/no-votación activa está deshabilitado por decisión documentada.

## Respuesta a incidente

Preservar logs/evidencia sin tokens, limitar escrituras si hay riesgo para votos, identificar commit y base, tomar snapshot antes de corregir. Rollback de código no deshace migraciones ni efectos persistentes. Si hay daño de datos, restaurar **en otra base vacía**, verificar y decidir cambio de conexión; jamás sobrescribir Neon a ciegas. Tratar divulgación de credencial como incidente y rotar por procedimiento específico (Better Auth puede requerir recifrado).

## Pendiente

Revisión externa de seguridad, política formal de retención/acceso, pruebas de carga/red real, procedimiento aprobado de incidentes durante votación y verificación Google OAuth estable. No afirmar que estén completos.
