# Convenciones de código

**Fuente:** `AGENTS.md`, `api/AGENTS.md`, `client/AGENTS.md` y código vigente. No es un mandato de migrar el stack.

| Tema | Convención actual |
| --- | --- |
| Lenguaje | JavaScript ESM en API, JSX/JavaScript en cliente. Usar TypeScript solo si se incorpora formalmente; no describirlo como stack actual. |
| API | Ruta HTTP delgada → servicio de caso de uso → `pg`/transacción; autorización desde sesión, nunca del body. Reutilizar `sendKnownError`/códigos estables. |
| Cliente | Componentes/hook/contextos; acceso HTTP centralizado en `client/src/api/`; rutas hash en `App.jsx`; CSS propio con tokens. |
| Persistencia | SQL estructural solo en migración versionada. No editar archivos ya aplicados. Restricciones DB + validación API para operaciones críticas. |
| Votos | IDs estables por operación, idempotencia, no editar confirmados, auditar transiciones. |
| Pruebas | Comportamiento/negativos/permisos antes que detalles de implementación; DB test aislada. |
| Git | Commits convencionales pequeños, sin atribución automática; nunca `.env`, secretos, dumps o artefactos generados. |

## Antes de modificar una pantalla o endpoint

Leer reglas pertinentes y tests actuales; ubicar ruta, servicio, datos y errores; distinguir regla aprobada de comportamiento actual. Mantener contrato/README/docs sincronizados. Ejecutar `git diff --check`, prueba focalizada y controles proporcionados al riesgo. El repositorio pide **no ejecutar build local del cliente** (`client/AGENTS.md`); CI sí ejecuta `npm run build --prefix client`. No usar tests de API contra Neon ni bases con datos reales.

## Documentación

Evitar copiar inventarios enteros del código a múltiples páginas. Actualizar la página propietaria (véase `docs/README.md`) y dejar enlaces desde README/módulos. Toda afirmación operacional debe llevar fecha/commit o describirse como procedimiento; una validación histórica no equivale a una prueba recién ejecutada.
