# Historias y criterios de aceptación

**Estado:** historias de referencia derivadas de comportamiento confirmado/implementado; no reemplazan el reglamento. Cada cambio debe vincular un test y, cuando corresponda, una decisión funcional.

| ID | Historia | Criterios verificables | Fuente/prueba |
| --- | --- | --- | --- |
| H-01 | Como administrador quiero preparar evento/jornadas para abrir una competencia completa | Readiness informa faltantes; no se abre si falta programación o nominaciones exigidas; apertura idempotente y auditada | `api/src/modules/events/event-readiness.service.js`, `api/src/tests/readiness-api.test.js` |
| H-02 | Como administrador quiero asignar jurados por jornada/especialidad | Solo asignaciones válidas; en `OPEN` no reemplazar si hay planilla presentada; error controlado | `api/src/modules/judges/assignment-service.js`, pruebas de asignaciones |
| H-03 | Como jurado quiero votar una nota | API confirma solo 1–10 o `NOT_PRESENTED`/0, con asignación, noche y comparsa válidas; clave idempotente evita doble voto | `api/src/routes/voting.routes.js`, `api/src/tests/voting-api.test.js` |
| H-04 | Como jurado quiero completar mi planilla | `submit` bloqueado mientras falten decisiones; una planilla presentada no admite edición ordinaria | `api/src/modules/ballots/ballot-service.js`, pruebas de votación |
| H-05 | Como jurado quiero recuperarme de una caída de red | La UI no muestra confirmación falsa; puedo reintentar manualmente y el servidor reconoce replay equivalente | `client/src/pages/JudgeBallotPage.jsx`, pruebas JudgeBallot |
| H-06 | Como veedor quiero seguir la votación | Monitor lee contexto de su jornada, incidencias y custodia con sesión/OTP/rol; no puede emitir votos | `api/src/routes/monitor.routes.js` |
| H-07 | Como comisario quiero registrar/anular penalización | Cambios auditables, inmutabilidad de campos confirmados y validación de jornada/comparsa | `api/src/routes/penalties.routes.js` |
| H-08 | Como escrutinio/escribanía quiero publicar resultado/acta | Publicación requiere roles permitidos y estado listo; público solo ve snapshot liberado; evidencia no se sobrescribe | `api/src/routes/results.routes.js`, `scrutiny-records.routes.js` |
| H-09 | Como usuario quiero entrar de forma segura | Correo/contraseña más 2FA; recursos privados devuelven 401/403 sin autorización | `api/src/app.js`, pruebas auth/authz |
| H-10 | Como público quiero consultar resultados | Portal no muestra borradores; resultados liberados visibles sin login | `api/src/routes/public.routes.js`, `client/src/pages/PublicResultsPage.jsx` |

## Aceptación pendiente

No hay criterios aprobados para resolver impugnaciones, votos fuera de término, reglamento completo de desempate y uso oficial real del piloto. Antes de implementar historias en esas áreas: documentar regla, autoridad aprobadora, estados, error/acción de recuperación y casos negativos.
