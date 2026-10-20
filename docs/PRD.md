# PRD — producto y alcance

**Estado:** borrador de síntesis para revisión del responsable; no es un reglamento general aprobado. **Base:** `AGENTS.md`, README de módulos, UI/API y spec 029. Corte: 20/10/2026.

## Problema y objetivo

Administrar una competencia de comparsas y registrar puntuaciones verificables sin perder trazabilidad por fallas de red, cambios de asignación o acciones concurrentes. La herramienta reúne configuración, jurados, votación, supervisión, penalizaciones, escrutinio, actas y publicación de resultados. Prioridad: integridad de votos > evidencia/auditoría > reglas confirmadas > permisos > compatibilidad > UX (`AGENTS.md`).

## Usuarios y resultados esperados

| Actor | Necesidad | Evidencia de solución |
| --- | --- | --- |
| Administrador (`ADMIN`) | Configurar evento, jornadas, comparsas, rubros, jurados y operación | Cambios validados y auditados; apertura bloqueada si faltan requisitos |
| Jurado (`JUDGE`) | Evaluar solo asignaciones activas | Nota aceptada por API o reintento claro; planilla completa antes de confirmar |
| Veedor (`VEEDOR`) | Seguir jornada y registrar incidencias/custodia según permisos | Panel de monitoreo y evidencia persistente |
| Comisario (`COMISARIO`) | Gestionar penalizaciones | Penalización y anulación auditables |
| Escrutinio/escribanía (`SCRUTINEER`, `ESCRIBANO`) | Calcular, liberar y certificar resultados | Snapshot liberado y acta verificable |
| Público | Consultar resultados liberados | Portal público sin acceso a borradores |

Los nombres funcionales «fiscal/escribano» del `AGENTS.md` no equivalen automáticamente a un único código de rol: la implementación distingue `VEEDOR`, `COMISARIO`, `SCRUTINEER` y `ESCRIBANO`. Ver [matriz](matriz-de-permisos.md).

## Alcance implementado

- Alta/configuración de eventos y jornadas, participantes, rubros/ítems/criterios, nominaciones, orden, jurados/cupos/asignaciones.
- Acceso con correo/contraseña y OTP; invitaciones; rutas por rol y selección de evento.
- Votación online-first, decisión `NOT_PRESENTED`, confirmación y controles de propiedad/contexto.
- Monitoreo SSE, incidentes, custodia, penalizaciones, resultados, sorteo ceremonial implementado y actas.
- Portal público de resultados **solo después de liberación**.

## Requisitos no funcionales y límites

API como autoridad de negocio; PostgreSQL como integridad final. Idempotencia para reintentos; auditoría append-only; no confirmar votos localmente ante desconexión. El piloto actual corre en Render Free + Neon y tiene limitaciones de suspensión, instancia única y despliegue manual. La [spec 029](../specs/029-piloto-produccion/spec.md) contempla hasta 30 usuarios como objetivo de prueba, **no garantía de capacidad ni autorización de votación real**.

## Decisiones pendientes del producto

Falta reglamento integral aprobado (desempates, impugnaciones, votos fuera de término, excepciones), criterios legales de retención y responsable formal de aprobación para uso real. El sorteo ceremonial existente es **implementación**, no aprobación global de todos los desempates. Registrar decisiones en [decisiones](decisiones.md) y criterios comprobables en [historias](historias-y-aceptacion.md) antes de cambiar código.
