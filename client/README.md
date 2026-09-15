# Cliente — Carnavales2027_v2

Aplicación React para administración, jurados, supervisión, comisariato, escrutinio y consulta pública de resultados.

[Proyecto](../README.md) · [API](../api/README.md)

## Stack

- React 19 y React DOM, JavaScript ESM/JSX.
- Vite 7 con `@vitejs/plugin-react`.
- CSS propio, tokens semánticos y estilos por área; sin Tailwind ni librería externa de componentes.
- Navegación por hash implementada en `src/App.jsx`; no usa React Router.
- Estado mediante hooks/contextos; no hay Redux ni una biblioteca externa de consultas.
- Vitest, Testing Library, jsdom y fake-indexeddb para pruebas.

El lockfile fija versiones compatibles con **Node `^20.19.0 || >=22.12.0`** por Vite/plugin-react. El `>=20` del manifiesto es menos restrictivo que esas dependencias.

## Inicio local

Prepará e iniciá la [API](../api/README.md) en `http://localhost:3000`. Desde `client/`:

```powershell
npm ci
npm run dev
```

Abrí `http://localhost:5173/#/login`, verificando el puerto anunciado por Vite. `vite.config.js` redirige `/api` a `http://localhost:3000`. Si cambiás puertos, mantené alineados el proxy, `BETTER_AUTH_URL` y `FRONTEND_URL` de la API.

Para navegar por las áreas privadas necesitás una cuenta creada por un flujo admitido y completar el segundo factor. Los datos ficticios se preparan con el seed de API; no hay un seed del cliente ni un login simulado de producción.

## Comandos

| Comando desde `client/` | Uso |
| --- | --- |
| `npm run dev` | Servidor Vite de desarrollo |
| `npm test` | Suite completa con `vitest run` |
| `npm test -- src/tests/http.test.js` | Ejemplo de prueba puntual |
| `npm run preview` | Vista previa de un bundle previamente generado; no inicia la API |
| `npm run build` | Script existente de Vite para generar el bundle |

**No ejecutar builds después de cambios**, según las reglas del proyecto. La tabla documenta el script existente, no lo incorpora a la validación local. No hay scripts de lint o typecheck.

## Conexión y entorno

No se necesita un `.env` del cliente para el flujo local estándar y no hay `client/.env.example` en el árbol.

`src/api/http.js` implementa `apiRequest` y `ApiError`:

- Usa rutas `/api/...` y permite un prefijo opcional mediante `import.meta.env.VITE_API_URL` (vacío por defecto).
- Envía cookies con `credentials: "include"`, pide `cache: "no-store"` y configura JSON.
- Normaliza errores HTTP y errores de red (`NETWORK_ERROR`); una respuesta 204 devuelve `null`.

**`VITE_API_URL` no configura toda la aplicación.** `PublicResultsPage.jsx` usa `fetch` relativo y el portal/monitor construyen `EventSource` con rutas relativas. Cambiar solo esa variable no habilita un despliegue frontend/API en orígenes distintos. El diseño actual necesita servir el cliente y enrutar `/api` bajo el mismo origen; la API tampoco configura CORS general para ese escenario separado.

Nunca coloques secretos en variables `VITE_*`: sus valores forman parte del cliente entregado al navegador.

## Estructura

| Archivo/directorio | Responsabilidad |
| --- | --- |
| `index.html`, `src/main.jsx` | Documento base, montaje React, StrictMode, SessionProvider y registro PWA |
| `src/App.jsx` | Resolución de rutas hash, shell y capas visuales |
| `src/api/http.js` | Transporte JSON y errores |
| `src/auth/` | Sesión, guardias de rol y aterrizaje por permisos |
| `src/context/AdminEventContext.jsx` | Evento activo administrativo compartido; selección persistida en localStorage |
| `src/pages/` | Pantallas de acceso, administración, jurado, monitor y resultados |
| `src/features/` | Formularios, readiness, asignaciones, penalizaciones y sorteo ceremonial |
| `src/components/` | Botones, diálogos, drawers, headers, shell, estados, progreso y navegación |
| `src/i18n/errors.js` | Traducción de códigos de API a mensajes de interfaz |
| `src/index.css`, `src/styles/` | Entrada de estilos, tokens y reglas por dominio |
| `src/offline/ballot-store.js` | Persistencia IndexedDB histórica; no es el flujo operativo de votación |
| `src/pwa/`, `public/` | Registro del service worker, manifest e iconos |
| `src/tests/` y archivos `*.test.*` cercanos | Pruebas transversales y colocadas junto a componentes/features |

## Rutas y roles

Las rutas se abren como fragmentos (`/#/...`). La resolución real está en `App.jsx`; la prioridad de aterrizaje está en `auth/role-routes.js`.

| Ruta hash | Pantalla / acceso |
| --- | --- |
| `#/login` | Acceso y segundo factor; ruta por defecto si no hay hash |
| `#/forgot-password`, `#/reset-password?token=...` | Recuperación de contraseña |
| `#/invitations/accept?secret=...` | Aceptación de invitación de jurado |
| `#/invitations/role/accept?token=...` | Aceptación de rol auxiliar |
| `#/invitations/operational/accept?secret=...` | Aceptación de perfil operativo |
| `#/invitations/accepted` | Confirmación de aceptación de jurado |
| `#/cuenta` | Cuenta y cambio de contraseña; su pantalla usa el estado de sesión |
| `#/admin/home`, `#/admin/events`, `#/admin/competencia` | Inicio, eventos y competencia; ADMIN |
| `#/admin/judges`, `#/admin/assignments`, `#/admin/voting` | Personas/jurados, asignaciones y votación; ADMIN |
| `#/admin/penalties` | Penalizaciones; ADMIN o COMISARIO |
| `#/admin/results`, `#/admin/record` | Resultados y acta; ADMIN, SCRUTINEER o ESCRIBANO |
| `#/judge`, `#/judge/assignment` | Inicio y asignaciones del jurado |
| `#/judge/ballot?ballotId=...&troupeId=...` | Planilla; JUDGE. El parámetro `troupeId` identifica aquí la entrada de programación (`nightScheduleId`) |
| `#/veedor` | Supervisión; ADMIN o VEEDOR, sujeta a autorización de la API |
| `#/resultados?eventId=...` | Portal público; selección de evento opcional |

No hay ruta vigente `#/home`: el login deriva al inicio propio del rol. Tener acceso de lectura a resultados no autoriza todas sus acciones; liberar, sortear y certificar corresponden a SCRUTINEER/ESCRIBANO en la API, no a ADMIN por sí solo.

`SessionProvider` consulta `/api/v1/me` y distingue `loading`, `authenticated`, `anonymous`, `second-factor-required` y `error`. Las guardias de interfaz ofrecen navegación y mensajes; **la seguridad la impone el backend**. La selección de evento en localStorage es una preferencia, no un permiso.

## Votación y persistencia

La interfaz vigente trabaja **online**. `JudgeBallotPage` consulta la planilla, guarda cada decisión mediante `PUT` y envía la planilla mediante `POST`; solo muestra confirmación persistida tras la respuesta del servidor.

- `PENDING` bloquea avance/confirmación según el flujo; se respeta el orden de pasada y la inmutabilidad del ítem confirmado.
- Un error de red no equivale a un voto guardado; se mantiene la posibilidad de reintento visible.
- No se aceptan nuevas reaperturas ni se usa caché/outbox para votar sin conexión.
- `ballot-store.js` conserva utilidades históricas y pruebas; `SessionProvider` limpia datos offline del usuario al cambiar/cerrar sesión. Su existencia no habilita el modo offline.

## Diseño y accesibilidad

`App.jsx` distingue `data-layer="brand"` para acceso, invitaciones y portal público, y `data-layer="instrument"` para operación. La base visual vive en `styles/tokens.css`; `index.css` compone los estilos y conserva reglas globales. Hay hojas de administración, competencia, jurado, penalizaciones, escrutinio y ceremonia: comprobá sus imports reales antes de editar una hoja suponiendo que afecta una pantalla.

Reutilizá `Button`, `Dialog`, `ConfirmDialog`, `EntityDrawer`, `PageShell`, `PageHeader`, `StatusPill` y `ProgressBar`. Los diálogos usan `<dialog>` nativo y mecanismos de foco/etiquetado. Preservá teclado, nombres accesibles, foco visible, feedback de carga/error y operación táctil; los tests jsdom no reemplazan la comprobación responsive en navegador.

## Tiempo real y PWA

- `VeedorMonitorPage` escucha `/api/v1/monitor/stream` y el portal público `/api/v1/public/stream`; ambas pantallas tienen fallback por consultas periódicas ante fallas del canal.
- Las suscripciones y temporizadores deben limpiarse al desmontar. El monitor representa progreso, no puntajes individuales.
- `register-service-worker.js` no registra el worker en modo desarrollo. Fuera de ese modo registra `/sw.js` al cargar la página.
- El worker cachea el shell y recursos estáticos del mismo origen; excluye `/api/` y métodos distintos de GET. **No proporciona votación offline.**
- El manifest usa iconos PNG de 192/512 y SVG. Las rutas de recursos y worker son absolutas desde `/`; un despliegue en subcarpeta requiere adaptar estas referencias.
- El manifest conserva `start_url="/#/"`, pero `App.jsx` no define `#/` como ruta de inicio. No asumir que el arranque instalado equivale a `#/login`; esta discrepancia requiere una corrección aparte.

## Pruebas y despliegue

`vite.config.js` configura Vitest con jsdom y `src/tests/setup.js`. El setup incluye matchers DOM, fake-indexeddb, soporte de Web Crypto y shims de almacenamiento/diálogo cuando faltan. Las pruebas cubren transporte, sesión, permisos, navegación, formularios, planillas, SSE, resultados, tokens y componentes.

Ejecutá `npm test` o los archivos afectados; registrá lo que efectivamente se ejecutó, sin copiar cifras históricas de `docs/`. No hace falta una base PostgreSQL para las pruebas de cliente que usan mocks.

Para servir el bundle existente, se necesita hosting estático con HTTPS y proxy `/api` a la API. `npm run preview` es una vista previa local, no una configuración de despliegue productivo. No hay configuración de hosting específica en esta carpeta.

La documentación de decisiones/specs y las instrucciones de agentes se conservan localmente, fuera de la publicación. Las validaciones históricas no equivalen a una comprobación actual; no declarar una funcionalidad validada sin evidencia del código y de las pruebas correspondientes.
