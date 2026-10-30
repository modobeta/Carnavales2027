# Documentación de Carnavales 2027

Esta carpeta separa **reglas confirmadas**, **comportamiento implementado** y **decisiones pendientes**. Corte de revisión: 20/10/2026, código `7c45056`. Si el código avanza, cotejarlo antes de usar estas páginas como descripción actual.

| Necesidad | Documento |
| --- | --- |
| Visión y alcance | [PRD](PRD.md), [historias y aceptación](historias-y-aceptacion.md) |
| Dominio y acceso | [Reglas de negocio](reglas-de-negocio.md), [matriz de permisos](matriz-de-permisos.md) |
| Implementación | [Arquitectura](arquitectura.md), [modelo de datos](modelo-de-datos.md), [referencia de tablas](modelo-de-datos-tablas.md), [contrato API](contrato-api.md) |
| Interfaz | [UI/UX Design Brief](ui-ux-design-brief.md), [sistema de diseño](sistema-de-diseno.md), [flujos y pantallas](flujos-y-pantallas.md) |
| Desarrollo | [Estilo de código](code-style.md), [plan de desarrollo](plan-de-desarrollo.md), [plan de pruebas](plan-de-pruebas.md) |
| Operación y gobierno | [Seguridad](seguridad.md), [privacidad y retención](privacidad-y-retencion.md), [despliegue y respaldo](despliegue-y-respaldo.md), [decisiones](decisiones.md) |
| Antecedentes fechados | [Archivo histórico](historico/README.md) — no usar como fuente del estado actual |

## Jerarquía y estado

1. `AGENTS.md`, `api/AGENTS.md` y `client/AGENTS.md` fijan instrucciones e invariantes del proyecto.
2. Una spec aprobada aplica **solo a su iniciativa**. La [spec 029](../specs/029-piloto-produccion/spec.md) aprueba el piloto, no un reglamento integral.
3. Esta documentación describe producto y código. «Implementado» no significa «reglamentariamente aprobado»; «pendiente» no debe convertirse en regla por inferencia.
4. `README.md`, `api/README.md` y `client/README.md` son guías de entrada; el código, las migraciones y las pruebas determinan el comportamiento efectivo.

No guardar contraseñas, OTP, tokens, URLs con credenciales, dumps ni datos personales de producción aquí o en `MEMORY.md`. Los documentos antiguos están organizados en el [archivo histórico](historico/README.md): sirven como antecedentes fechados, no sustituyen las guías vigentes ni demuestran el estado actual.
