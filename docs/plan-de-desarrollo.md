# Plan de desarrollo y mantenimiento

**Estado:** propuesta de secuencia, no cronograma aprobado ni autorización de despliegue. Corte 20/10/2026.

## Línea base

El piloto público ejecuta `main` `7c45056` con Render Free + Neon; Auto Deploy está desactivado deliberadamente. CI `Pilot checks` corre migración/pruebas sobre PostgreSQL descartable y build cliente. El registro de operación está en [despliegue](despliegue-y-respaldo.md); no usar este plan como señal de que una release nueva ya fue validada.

## Orden recomendado

1. **Reglamento y gobierno:** aprobar reglas que faltan (desempate, impugnación, voto tardío, excepciones, retención). Asignar propietario y criterios de aceptación; actualizar [PRD](PRD.md) y [decisiones](decisiones.md).
2. **Contrato verificable:** inventariar todos los endpoints, cuerpos, status y ejemplos desde tests/rutas y publicar un OpenAPI probado automáticamente. Consolidar matriz de roles con negativos.
3. **Calidad funcional:** pruebas para concurrencia/idempotencia/inmutabilidad, bordes de jornada, PWA offline/reintento y flujo completo por rol. No probar sobre eventos reales.
4. **Operación segura:** automatizar gate de no votación activa, backup verificable, restauración de ensayo y migraciones antes de cualquier despliegue automático. En el plan Free no hay pre-deploy command; no activar «On Commit» por sí solo.
5. **Preparación para uso real:** ejercicio integral con responsables, dispositivos/red representativos, simulacro de contingencia y aprobación funcional/legal explícita.

## Para cada cambio

Issue/historia con regla y dueño → diseño de API/DB/UI y riesgo → tests negativos → implementación mínima → CI → revisión de diff/documentación → release controlada → smoke y registro de commit/backup. Si aparece un conflicto entre código y reglamento, detener la publicación del flujo afectado y resolverlo con la autoridad correspondiente.
