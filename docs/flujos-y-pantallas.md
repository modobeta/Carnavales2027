# Flujos y pantallas

**Navegación:** hash routing manual en `client/src/App.jsx`; la URL pública comparte origen con la API. Los enlaces siguientes son rutas de cliente, no endpoints HTTP. Autoridad de rol: backend; guards de React solo orientan la UI.

| Flujo | Pantallas / rutas | Condición y salida |
| --- | --- | --- |
| Acceso | `#/login`, `#/forgot-password`, `#/reset-password`, `#/cuenta` | Correo/clave → OTP → sesión; error no debe mostrar secreto |
| Invitaciones | `#/invitations/accept`, `#/invitations/role/accept`, `#/invitations/operational/accept` | Token válido y contraseña segura; no registrar rol desde cliente |
| Preparación admin | `#/admin/home`, `#/admin/events`, `#/admin/competencia`, `#/admin/users`, `#/admin/judges` | Eventos/jornadas y asistente de Competencia: Rubros → Especialidades → Evaluación → Comparsas → Revisión final. Los pasos se pueden abrir directamente; la revisión de la API decide si se puede abrir el evento. Cambios sensibles con confirmación. |
| Operación admin | `#/admin/voting` | Abrir/cerrar votación con evento/jornada listos; inspección sin voto de prueba |
| Jurado | `#/judge/assignment`, `#/judge`, `#/judge/ballot` | Elegir asignación activa; puntuar ítems; `submit` solo completo; errores de red permiten reintento manual |
| Fiscalización | `#/veedor`, `#/admin/penalties` | Monitoreo e incidencias/custodia; penalizaciones según rol |
| Escrutinio | `#/admin/results`, `#/admin/record`, `#/resultados` | Calcular internamente → liberar por rol autorizado → portal público/acta |

`#/admin/competencia` admite parámetros de paso/pestaña; `#/judge/ballot` usa `ballotId`/`troupeId`. El selector de evento conserva permisos vigentes; elegir otro evento no concede un rol nuevo. La UI de administración global actual difiere de documentación histórica sobre `ADMIN_EVENT`.

## Recorridos de uso

1. **Ingresar:** abrir `#/login`, escribir correo y contraseña, completar el OTP recibido. Si se olvidó la clave, usar `#/forgot-password`; un enlace de invitación conduce al formulario específico. Nunca compartir códigos ni enlaces de acceso.
2. **Preparar y comenzar (ADMIN):** crear el evento y sus jornadas en `#/admin/events`; la sección **Preparar y comenzar** consulta la readiness oficial y ofrece accesos directos a la sección que resuelve cada faltante. La configuración detallada continúa en `#/admin/competencia`: **Rubros**, **Especialidades**, **Evaluación**, **Comparsas** y **Revisión final**. En la tabla de jornadas, **Preparar jurados** abre la gestión de asignaciones en el contexto de esa jornada; las asignaciones quedan ligadas a la jornada y especialidad. Se pueden preparar jornadas futuras aunque el evento ya esté abierto; la falta de jurados en una jornada futura no bloquea abrir la jornada elegida. La API —no los indicadores visuales— determina si se puede abrir el evento.
3. **Iniciar y operar votación (ADMIN):** desde `#/admin/voting`, elegir la jornada. Control de votación se enfoca en modo de habilitación de comparsas, estado/progreso de planillas y apertura o cierre de la ventana; la gestión de jurados se realiza desde **Jornadas**. Si la jornada sigue pendiente, **Abrir jornada y votación** solicita confirmación; la API exige al menos un jurado titular activo antes de cambiar esa jornada a abierta. Luego abre la ventana de votación; son estados distintos y cada uno se consulta por separado. Si la jornada ya está abierta pero la ventana no, **Abrir votación** vuelve a validar que haya jurados titulares activos y abre solo la ventana. Una vez abierta la jornada no se admiten altas nuevas de jurados; los reemplazos/revocaciones siguen sujetos a que no exista una planilla confirmada. Cerrar la ventana es definitivo y no permite reapertura. En Control de votación, cada jornada nueva usa por defecto **una comparsa por vez**; ADMIN puede elegir **todas antes de comenzar** únicamente antes de abrir la ventana. En modo manual, la API impide habilitar la siguiente hasta que no queden puntuaciones pendientes en las planillas de la comparsa activa.
4. **Votar (JUDGE):** elegir una jornada/especialidad asignada, abrir la planilla y seleccionar la comparsa. Completar cada ítem puntuable con nota 1–10 o «No se presentó» según corresponda. Esperar la confirmación del servidor de cada decisión; si falla la red, reintentar manualmente. La confirmación final de la planilla solo corresponde cuando está completa; las decisiones confirmadas no se editan por el flujo ordinario.
5. **Supervisar y cerrar:** el veedor sigue el estado desde `#/veedor`; administración controla la ventana de votación. Comisario gestiona penalizaciones en su pantalla, y escrutinio/escribanía consultan resultados internos, liberan el snapshot y certifican acta según sus roles. El público solo accede a resultados ya liberados desde `#/resultados`.

Para incidencias, permisos y límites de cada paso, consultar [matriz de permisos](matriz-de-permisos.md), [reglas](reglas-de-negocio.md) y los README de [cliente](../client/README.md) y [API](../api/README.md). Este recorrido explica la interfaz actual; no resuelve las reglas reglamentarias pendientes.

## Estados obligatorios para describir/probar

Carga, vacío, error recuperable, permiso denegado, conexión caída, operación en curso y éxito confirmado por servidor. En PWA, diferenciar versión nueva disponible de planilla abierta: no forzar recarga mientras se vota. Para detalles de interacción consultar [`client/README.md`](../client/README.md) y pruebas de pantallas.
