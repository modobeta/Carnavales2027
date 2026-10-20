---
name: documentacion-carnavales
description: Actualiza documentación de Carnavales2027 a partir de código, migraciones, pruebas y reglas aprobadas, sin inventar reglamento ni exponer secretos.
---

# Mantener documentación de Carnavales2027

Usar cuando cambien producto, API, datos, interfaz, seguridad o despliegue de este repositorio. No sustituye `AGENTS.md` ni otorga permiso para publicar.

1. Leer `AGENTS.md`, el AGENTS del módulo afectado y `docs/README.md`. Consultar solo las specs aplicables; la 029 cubre piloto, no reglas generales.
2. Identificar commit y diff. Cotejar rutas/servicios/migraciones/tests para hechos implementados. Distinguir en el texto: **confirmado por regla**, **implementado** y **pendiente de aprobación**.
3. Actualizar la página propietaria de `docs/`; ajustar README/AGENTS/MEMORY solo si su resumen quedó obsoleto. Enlazar, no duplicar tablas enteras. Registrar fecha/SHA solo para observaciones históricas, no como promesa del estado actual.
4. Validar enlaces relativos, nombres de scripts/rutas, `git diff --check`, ausencia de secretos/PII y que los nuevos archivos no estén ignorados. Para cambios solo Markdown, no correr suites pesadas sin motivo; para cambios de código, aplicar plan de pruebas.
5. Si falta una regla reglamentaria o legal, documentar el bloqueo y pedir decisión; no completar con inferencias. Nunca poner credenciales, OTP, conexiones, dumps ni datos reales en docs.

Para detalles usar `docs/{PRD,reglas-de-negocio,matriz-de-permisos,contrato-api,despliegue-y-respaldo,decisiones}.md` según el área.
