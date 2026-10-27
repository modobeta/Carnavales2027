# Flujos y pantallas

**Navegación:** hash routing manual en `client/src/App.jsx`; la URL pública comparte origen con la API. Los enlaces siguientes son rutas de cliente, no endpoints HTTP. Autoridad de rol: backend; guards de React solo orientan la UI.

| Flujo | Pantallas / rutas | Condición y salida |
| --- | --- | --- |
| Acceso | `#/login`, `#/forgot-password`, `#/reset-password`, `#/cuenta` | Correo/clave → OTP → sesión; error no debe mostrar secreto |
| Invitaciones | `#/invitations/accept`, `#/invitations/role/accept`, `#/invitations/operational/accept` | Token válido y contraseña segura; no registrar rol desde cliente |
| Preparación admin | `#/admin/home`, `#/admin/events`, `#/admin/competencia`, `#/admin/users`, `#/admin/judges`, `#/admin/assignments` | Rubros → comparsas y participantes → jurados y especialidades → evaluación → revisión; cambios sensibles con confirmación |
| Operación admin | `#/admin/voting` | Abrir/cerrar votación con evento/jornada listos; inspección sin voto de prueba |
| Jurado | `#/judge/assignment`, `#/judge`, `#/judge/ballot` | Elegir asignación activa; puntuar ítems; `submit` solo completo; errores de red permiten reintento manual |
| Fiscalización | `#/veedor`, `#/admin/penalties` | Monitoreo e incidencias/custodia; penalizaciones según rol |
| Escrutinio | `#/admin/results`, `#/admin/record`, `#/resultados` | Calcular internamente → liberar por rol autorizado → portal público/acta |

`#/admin/competencia` admite parámetros de paso/pestaña; `#/judge/ballot` usa `ballotId`/`troupeId`. El selector de evento conserva permisos vigentes; elegir otro evento no concede un rol nuevo. La UI de administración global actual difiere de documentación histórica sobre `ADMIN_EVENT`.

## Recorridos de uso

1. **Ingresar:** abrir `#/login`, escribir correo y contraseña, completar el OTP recibido. Si se olvidó la clave, usar `#/forgot-password`; un enlace de invitación conduce al formulario específico. Nunca compartir códigos ni enlaces de acceso.
2. **Preparar la competencia (ADMIN):** crear y revisar evento y jornadas. En Competencia, el recorrido implementado comienza por **Rubros**: crear el catálogo sin necesitar ítems ni especialidades. Luego, en **Comparsas**, usar **Participantes** para cargar nombres en los rubros correspondientes; configurar **Jurados y especialidades** y, en **Evaluación**, agregar ítems a esos mismos rubros. Los ítems se comparten entre los participantes del rubro de todas las comparsas. **Revisión final** consulta los faltantes oficiales antes de abrir el evento y luego la votación de la jornada. Las acciones sensibles piden confirmación; un error de readiness requiere resolver el faltante, no saltar la validación. Ver [recorrido y enlaces de los cinco pasos](../client/README.md#navegación-y-preparación-de-la-competencia-admin).
3. **Votar (JUDGE):** elegir una jornada/especialidad asignada, abrir la planilla y seleccionar la comparsa. Completar cada ítem puntuable con nota 1–10 o «No se presentó» según corresponda. Esperar la confirmación del servidor de cada decisión; si falla la red, reintentar manualmente. La confirmación final de la planilla solo corresponde cuando está completa; las decisiones confirmadas no se editan por el flujo ordinario.
4. **Supervisar y cerrar:** el veedor sigue el estado desde `#/veedor`; administración controla la ventana de votación. Comisario gestiona penalizaciones en su pantalla, y escrutinio/escribanía consultan resultados internos, liberan el snapshot y certifican acta según sus roles. El público solo accede a resultados ya liberados desde `#/resultados`.

Para incidencias, permisos y límites de cada paso, consultar [matriz de permisos](matriz-de-permisos.md), [reglas](reglas-de-negocio.md) y los README de [cliente](../client/README.md) y [API](../api/README.md). Este recorrido explica la interfaz actual; no resuelve las reglas reglamentarias pendientes.

## Estados obligatorios para describir/probar

Carga, vacío, error recuperable, permiso denegado, conexión caída, operación en curso y éxito confirmado por servidor. En PWA, diferenciar versión nueva disponible de planilla abierta: no forzar recarga mientras se vota. Para detalles de interacción consultar [`client/README.md`](../client/README.md) y pruebas de pantallas.
