# Memoria del Proyecto: Carnavales 2027

## 🎯 Propósito y Contexto
- Plataforma web para configurar, operar y supervisar la competencia de comparsas de carnaval, registrar planillas de jurados, gestionar penalizaciones, resultados y actas, y publicar resultados liberados.
- Usuarios: administración (`ADMIN`), jurados (`JUDGE`), supervisión (`VEEDOR`), comisariato (`COMISARIO`), escrutinio (`SCRUTINEER`) y escribanos (`ESCRIBANO`). Los nombres conceptuales en documentos pueden diferir de los roles concretos de API; verificar permisos por endpoint.
- Prioridades del dominio: integridad e inmutabilidad del voto, trazabilidad/auditoría, RBAC server-side, idempotencia, resiliencia y operación sencilla durante el evento.
- **No habilita por sí solo una votación real.** La Spec 029 define un piloto público que explícitamente no habilita votación real.

## 🛠️ Stack Tecnológico y Arquitectura
- Dos paquetes npm separados; no existe `package.json` en la raíz.
- Backend: JavaScript ESM, Node.js (`>=20` en manifest; el stack cliente requiere `^20.19.0 || >=22.12.0`; CI/piloto usan Node 22), Express 5, Better Auth 1.6.27, `pg` y PostgreSQL. PostgreSQL 18 y `pgcrypto` se usan en CI/piloto. Sin ORM ni build del backend.
- Frontend: React 19 + React DOM, JavaScript/JSX, Vite 7, CSS propio, Vitest 3, Testing Library y jsdom. Navegación por hash propia; no usa React Router, Tailwind ni una biblioteca externa de queries.
- Backend: monolito modular. `api/src/app.js` configura Express/seguridad/límites/origen y monta routers; rutas aplican sesión/2FA/RBAC y delegan en módulos de dominio; servicios consultan PostgreSQL. `api/src/db/transaction.js` agrupa transacciones y difunde eventos del monitor después del commit; hay SSE para supervisión/resultados.
- En producción Express sirve `client/dist` y la API bajo el mismo origen. El cliente usa `apiRequest` con cookies de sesión, `no-store` y errores normalizados. La PWA cachea el shell/recursos, pero **no permite votar offline**.

## 🗂️ Estructura del Proyecto y Flujo de Datos
- `api/src/routes/`: contratos HTTP y adaptación request/response.
- `api/src/modules/`: dominios de ballots, events, judges, monitor, operational-profiles, penalties, results, rubrics, schedule, scrutiny-records, specialties, troupes y users.
- `api/src/auth/`: Better Auth, sesión, 2FA, identidad, rate limits y permisos.
- `api/src/db/`: pool PostgreSQL, transacciones, migraciones versionadas, seeds y pruebas.
- `api/src/audit/`, `api/src/email/`, `api/src/scripts/`: auditoría, entrega de correo y tareas operativas.
- `client/src/`: `App.jsx`/rutas hash, páginas, features, componentes, contextos, auth, API, estilos, PWA, offline legacy y tests.
- `specs/`: especificaciones por iniciativa. `specs/029-piloto-produccion/` contiene spec, plan, tareas y evidencia del piloto; no es la especificación general del dominio.
- `README.md`, `api/README.md`, `client/README.md`, `DEPLOYMENT.md`, `render.yaml` y `.github/workflows/ci.yml`: contexto de implementación, operación, despliegue e integración continua. `docs/` no existe actualmente.
- Flujo típico: navegador → `client/src/api/http.js` (`apiRequest`, cookies incluidas) → middleware/router Express → sesión, 2FA y RBAC → módulo de dominio → PostgreSQL mediante `pg`/transacción. Tras commit se publican eventos SSE; el cliente confirma una operación solo tras respuesta del servidor.

## 📜 Convenciones y Reglas del Código
- Mantener JavaScript ESM según el código actual; no migrar a TypeScript, router, CSS framework, ORM ni dependencia nueva sin necesidad y aprobación.
- API es autoridad funcional; PostgreSQL es autoridad final de integridad. No confiar en roles/identidades del cliente. Parametrizar SQL, validar contexto y usar transacciones para operaciones relacionadas.
- Una nota válida es 1–10; `NOT_PRESENTED` vale 0 y `PENDING` no tiene nota. Votos confirmados son inmutables; usar idempotency keys/UUID para reintentos y nunca editar evidencia silenciosamente.
- Operación de jurado online-first: timeout/red caída no confirma localmente; ofrecer reintento manual y evitar colas o retries automáticos agresivos.
- Auditoría append-only, sin secretos. Las acciones administrativas sensibles requieren confirmación; la autorización siempre se valida en API.
- Migraciones SQL: agregar una migración incremental; no editar migraciones ya aplicadas (el runner valida checksum). `auth:migrate` precede a `db:migrate`.
- Pruebas: API `npm test --prefix api` exige `TEST_DATABASE_URL` y debe apuntar a una base aislada/descartable; el guard comprueba presencia, no seguridad del destino. Cliente `npm test --prefix client` ejecuta Vitest. No hay scripts lint/typecheck. No ejecutar builds locales después de cambios; CI/despliegue tienen pasos de build propios.
- Antes de cambios funcionales leer `AGENTS.md`, el AGENT del módulo, README/código y una spec aprobada que corresponda al alcance. El README documenta discrepancias, no aprueba cambios de reglas. Si falta una regla, hay conflicto o está pendiente —especialmente desempates, impugnaciones y votos fuera de término— detenerse y preguntar; no inferir.
- No están disponibles como documentos independientes la especificación funcional general, reglamento completo, ERD, API completa, matriz de permisos ni especificación offline/seguridad/auditoría. Mantener esa brecha visible; no inventar su contenido.

## 🚀 Estado Actual y Próximos Pasos
- Según README/código, hay áreas de configuración de eventos/jornadas, comparsas y rubros; cuentas/invitaciones/2FA; asignaciones; planillas online; apertura/cierre; supervisión SSE; penalizaciones; resultados, actas y portal público de resultados liberados. Esto describe funcionalidad presente, **no certifica que cada flujo esté operativo al 100%**.
- **Actualizado al 2026-10-14 a partir de los registros y pruebas verificadas.** Se completó la modernización y rediseño de UX de la administración:
  - Unificación de Inicio (`#/admin/home`) para contexto operativo y accesos rápidos, y Eventos (`#/admin/events`) para gestión de catálogo.
  - Asistente de preparación del evento en cuatro etapas guiadas (`#/admin/competencia`): Paso 1 (Participantes y comparsas con logos/colores y orden de pasada), Paso 2 (Jurados y especialidades con cálculo de cobertura y modal accesible), Paso 3 (Evaluación en dos columnas con criterios desplegables y trazabilidad de rubros compartidos) y Paso 4 (Revisión final con verificación oficial de readiness, apertura de competencia con `ConfirmDialog` e idempotencia, y resumen ejecutivo con enlace a Control de votación).
  - La suite de pruebas de interfaz del cliente cuenta con **490/490 pruebas aprobadas en 63 suites** de Vitest (`npm test`), incluyendo 45 pruebas de design tokens (`tokens.test.js`).
  - La iniciativa más reciente en backend, Spec 037 (programación automática de comparsas), marca T1–T6 completadas con reviewer final aprobado (310/310 tests de API).
- Estado SDD: Spec 035 (catálogo y readiness), Spec 036 (categorías, comparsas y logos) y Spec 037 (programación automática) cuentan con cierre técnico aprobado. Spec 034 (eventos y jornadas) y Spec 030 (rediseño UX/UI) tienen tareas completadas y verificadas.
- El piloto de Spec 029 sigue pendiente: `tasks.md` marca T07 en curso (configuración privada Neon/Gmail/Render, publicación manual, corte y verificación pública). README registra al 2026-09-16 que aún faltaba documentar la comprobación completa de OTP e ingreso al panel público. Estos datos son evidencia histórica y deben verificarse de nuevo antes de afirmar el estado actual del servicio.
- Antes de declarar el piloto listo: completar T07 con responsables/credenciales autorizadas; ejecutar CI en GitHub; confirmar despliegue manual, correo real/OTP/login completo, cookies/HTTPS, comportamiento PWA y recorridos públicos; registrar evidencia actual. No publicar ni realizar cortes automáticamente.
- Conciliar documentación funcional/reglamento/roles/permisos con implementación antes de una votación real; el README raíz lista diferencias funcionales pendientes.
- El acta implementada verifica hash SHA-256 de payload JSON canónico; esto **no equivale** al requisito de hash sobre bytes de un PDF oficial. Resolver formalmente antes de afirmar certificación documental completa.
- No afirmar que “todo funciona al 100%” basándose en validaciones históricas, CI configurado o existencia de pantallas. Reportar qué comando/entorno/flujo se verificó y cuándo.

## ⚠️ Decisiones de Diseño y Lecciones Aprendidas
- API y cliente se despliegan en un solo origen; cookies, SSE, proxy y rutas absolutas de PWA dependen de ello. `VITE_API_URL` por sí solo no habilita un frontend separado.
- La PWA no es una cola offline de votos: IndexedDB ballot-store es legado; el voto requiere respuesta del servidor. No reintroducir sincronización automática.
- Mejoras post-commit/SSE no deben revertir escrituras ya confirmadas; rollback descarta eventos y solo tras commit se difunden. La transacción reintenta deadlocks limitadamente.
- Se preserva la evidencia: inmutabilidad de votos y penalizaciones, auditoría append-only, migraciones checksum y no sobrescritura de actas previas.
- Un `GET /health` 200 solo prueba liveness HTTP, no conectividad/configuración de PostgreSQL ni autenticación completa.
- La configuración en `render.yaml` es referencia: el servicio Render existente se creó manualmente y no está vinculado al Blueprint; editar el YAML no actualiza por sí solo el despliegue.
- README y AGENTS pueden describir estados diferentes: README refleja implementación y advierte discrepancias; reglas normativas del `AGENTS.md` raíz/spec aprobada no se cambian para ajustarlas a una implementación o captura.
