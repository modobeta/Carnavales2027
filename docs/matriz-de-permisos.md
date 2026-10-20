# Matriz de permisos efectiva

**Estado:** lectura del middleware/rutas al 20/10/2026. No concede permisos nuevos. En rutas privadas se requieren sesión y 2FA; la API, no la visibilidad del menú, decide el acceso. Una persona puede tener varios roles; para publicar resultados o certificar acta, `ADMIN` **no sustituye** el rol de escrutinio/escribanía.

| Operación / API | ADMIN | JUDGE | VEEDOR | COMISARIO | SCRUTINEER | ESCRIBANO |
| --- | --- | --- | --- | --- | --- | --- |
| Configurar evento, jornada, comparsas, rubros y asignaciones | Sí | No | No | No | No | No |
| Abrir/cerrar votación | Sí | No | No | No | No | No |
| Ver estado/monitor de votación | Sí | No | Sí¹ | No | No | No |
| Leer/emitir puntuación propia | No | Sí² | No | No | No | No |
| Leer/gestionar penalizaciones | Sí | No | No | Sí | No | No |
| Leer resultados internos | Sí | No | No | No | Sí | Sí |
| Liberar resultados | No³ | No | No | No | Sí | Sí |
| Certificar acta / sorteo ceremonial | No³ | No | No | No | Sí | Sí |
| Consultar resultados públicos liberados | Sí | Sí | Sí | Sí | Sí | Sí |

¹ `VEEDOR` requiere además perfil operativo registrado según `require-voting-observer.js`. ² Solo asignación y planilla propias válidas. ³ Si la persona posee también `SCRUTINEER`/`ESCRIBANO`, revisar la guarda concreta: el middleware comprueba esos roles; un `ADMIN` sin ellos recibe 403.

**Códigos adicionales:** `ADMIN_EVENT` aparece en datos/cliente histórico, pero la administración vigente comprueba `ADMIN` global (`api/src/auth/require-admin.js`, `admin-role-access.js`); no atribuir a `ADMIN_EVENT` permisos operativos actuales. Los roles funcionales citados en documentos viejos pueden no coincidir con estos códigos.

**Fuente de verdad técnica:** `api/src/auth/require-*.js`, `api/src/routes/{events,voting,monitor,penalties,results,scrutiny-records,users}.routes.js`, `client/src/auth/role-routes.js`. Si se modifica una guarda, actualizar esta tabla y probar 401/403/ownership.
