# Privacidad y retención

**Estado:** inventario técnico y preguntas abiertas, **no asesoramiento legal ni plazo de conservación aprobado**. Texto público vigente: [`client/public/privacidad.html`](../client/public/privacidad.html). Borrador histórico: [`PRIVACIDAD-BORRADOR.md`](historico/PRIVACIDAD-BORRADOR.md). No cambiar la política pública sin revisión del responsable.

| Datos | Finalidad implementada | Ubicación/control |
| --- | --- | --- |
| Identidad, correo, documento si se solicita | Cuenta, roles, contacto | PostgreSQL; acceso por rol/contexto |
| Credenciales, sesión, OTP | Autenticación y recuperación | Better Auth/servidor; no almacenar en docs/logs |
| Asignaciones, planillas, votos, penalizaciones, actas | Competencia, cómputo y evidencia | Neon; votos confirmados inmutables |
| Auditoría e IP técnica | Seguridad, trazabilidad | DB/logs con acceso restringido |
| Contexto/caché PWA | UX/recuperación visual | Navegador; no confirma votos |
| Correo saliente | OTP, invitaciones, recuperación | Gmail API con `gmail.send`; Google procesa destinatario/contenido enviado |

Render aloja API/cliente; Neon, la base; Gmail, envío de mensajes. Resultados **liberados** se hacen públicos. No documentar tokens o PII real en issues, pruebas o backups versionados. Backups privados fuera del servidor efímero y del repositorio, con acceso mínimo; restaurar solo en destino autorizado.

## Lo que aún debe decidirse

Plazos por categoría (cuenta, sesiones, OTP, auditoría, votos/actas, backups y logs), base jurídica, responsable de aprobación, ubicación/acceso, eliminación segura y respuesta a solicitudes de acceso/corrección/supresión compatible con evidencia inmutable. La política pública actual **no promete** borrado automático de votos/auditoría. No inventar números de días ni ejecutar purgas hasta tener decisión legal/funcional y migración/procedimiento verificable.
