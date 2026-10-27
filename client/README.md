# Cliente — Carnavales 2027

Aplicación React para administración, jurados, supervisión, comisariato, escrutinio y consulta pública de resultados.

[Proyecto](../README.md) · [API](../api/README.md) · [Documentación](../docs/README.md)

**Piloto:** https://carnavales2027-piloto.onrender.com/#/login. Usuarios y responsables de operación pueden comenzar por [flujos y pantallas](../docs/flujos-y-pantallas.md); este documento explica además cómo mantener la interfaz.

> El stack que sigue está comprobado en `package.json` y el código. Algunas instrucciones históricas locales describen otra arquitectura y otro flujo de puntuación. Consultar [reglas de negocio](../docs/reglas-de-negocio.md) y [decisiones pendientes](../docs/decisiones.md): no cambiar reglas de negocio para hacerlas coincidir con una captura o un README.

## Stack

- React 19 y React DOM, JavaScript ESM/JSX.
- Vite 7 con `@vitejs/plugin-react`.
- Anime.js 4 (ESM) para transiciones de entrada y esperas; las animaciones son cosméticas y se desactivan con `prefers-reduced-motion`.
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
| `npm run build` | Genera bundle con Vite y después versiona `sw.js` mediante `scripts/build-service-worker.js` |

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
| `src/components/` | Botones, diálogos, drawers, headers, shell, estados, progreso, navegación y componentes de carga/movimiento |
| `src/motion/` | Hooks de Anime.js, scopes y detección de `prefers-reduced-motion` |
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
| `#/admin/home` | Inicio global; catálogo, creación y gestión de eventos (ADMIN) |
| `#/admin/events` | Configuración global de eventos y jornadas (ADMIN) |
| `#/admin/competencia?step=...` | Preparación completa de la competencia (ADMIN) |
| `#/admin/judges`, `#/admin/assignments` | Personas/jurados y asignaciones (ADMIN) |
| `#/admin/voting` | Control de votación por jornada y mesa (ADMIN) |
| `#/admin/penalties` | Penalizaciones; ADMIN o COMISARIO |
| `#/admin/results`, `#/admin/record` | Resultados y acta; ADMIN, SCRUTINEER o ESCRIBANO |
| `#/judge`, `#/judge/assignment` | Inicio y asignaciones del jurado |
| `#/judge/ballot?ballotId=...&troupeId=...` | Planilla; JUDGE. El parámetro `troupeId` identifica aquí la entrada de programación (`nightScheduleId`) |
| `#/veedor` | Supervisión; ADMIN o VEEDOR, sujeta a autorización de la API |
| `#/resultados?eventId=...` | Portal público; selección de evento opcional |

No hay ruta vigente `#/home`: el login conserva un `returnTo` restringido del jurado y luego deriva según los roles de la sesión: ADMIN, JUDGE, COMISARIO, SCRUTINEER/ESCRIBANO y VEEDOR. `adminEvents` de `/me` no concede acceso administrativo ni cambia el destino. Todas las rutas de administración requieren ADMIN, también al abrirlas directamente. Tener acceso de lectura a resultados no autoriza todas sus acciones; liberar, sortear y certificar corresponden a SCRUTINEER/ESCRIBANO en la API, no a ADMIN por sí solo.

`SessionProvider` consulta `/api/v1/me` y distingue `loading`, `authenticated`, `anonymous`, `second-factor-required` y `error`. Conserva `adminEvents` como array por compatibilidad de respuesta, pero ese campo no se usa para autorización, navegación ni catálogo. Las guardias de interfaz ofrecen navegación y mensajes; **la seguridad la impone el backend**. La selección de evento en localStorage es una preferencia, no un permiso.

En `#/admin/users`, ADMIN puede crear una invitación con el rol `ADMIN` para una cuenta nueva. La pantalla muestra un enlace de aceptación para compartir; al aceptar, la persona define su contraseña y recibe solo ADMIN. La lista identifica al administrador principal mediante `isPrimaryAdmin` de la API y no ofrece revocar su rol. No existe una acción de eliminación de usuarios en esta pantalla; la API protege igualmente la cuenta ante solicitudes directas.

## Recorrido de acceso para usuarios

Durante la votación, el jurado ve dos barras: progreso de la comparsa que está consultando y total de puntuaciones completadas de su planilla. **Confirmar votación** permanece bloqueado hasta completar todas las puntuaciones y recibir confirmación de la API (incluidas decisiones «No se presentó»). Llegar al 100 % de una comparsa no habilita el cierre si faltan otras. El cierre conserva su confirmación explícita y validación en servidor.

La cabecera muestra nombre, roles en español y evento activo. **Evento activo** cambia el contexto compartido de trabajo y recuerda la selección por usuario. Los jueces eligen únicamente entre sus eventos con asignaciones activas, aun antes de abrir la votación; sus planillas/progreso se filtran por `eventId`. Cambiar de evento desde una planilla vuelve a **Mi panel**. ADMIN carga el catálogo global de `/api/v1/events` con o sin asignaciones; los demás roles conservan el catálogo que autorizan sus endpoints (Supervisión lista eventos con actividad). El selector ofrece contexto de trabajo y no concede permisos. Ante errores se bloquea la selección y se ofrece reintento.

### Navegación y preparación de la competencia (ADMIN)

El panel administrativo está reservado a ADMIN global. Las cuentas con otros roles no acceden a administración por tener `adminEvents` en `/me`; sus menús y catálogos siguen dependiendo de sus roles propios. ADMIN puede operar sobre todos los eventos mediante las rutas administrativas y el backend valida cada operación y el estado del evento. Un Jurado sin ADMIN no tiene menú lateral dentro de `#/judge/*`; una cuenta ADMIN + JUDGE conserva navegación administrativa y de jurado.

1. **Inicio (`#/admin/home`)**: Vista ejecutiva global con eventos activos, creación, reactivación y acciones de gestión. Incluye resumen de jornadas, comparsas, jurados y rubros cuando están disponibles.
2. **Eventos y jornadas (`#/admin/events`)**: Gestión global de alta, edición y estado de eventos, jornadas y apertura. Guardar el nombre del evento, agregar o editar una jornada y otras acciones sensibles requieren confirmación explícita; los cambios aparecen solo cuando la API los acepta (la programación automática de comparsas la hace el servidor). El borrado y el cierre de jornadas se rigen por las validaciones de estado e historial del backend. El panel muestra requisitos de apertura y operaciones pendientes para ADMIN.
3. **Preparación del evento (`#/admin/competencia`)**: Asistente de cinco pasos con navegación superior e inferior:
   - **Paso 1 — Rubros (`?step=catalogo`, entrada por defecto)**: Crear el catálogo indicando si cada rubro evalúa comparsas o participantes nominados. No requiere especialidades ni ítems. Conserva edición, desactivación e historial; **Configurar ítems en Evaluación** abre el rubro existente en su especialidad. El estado de este paso comprueba `ACTIVE_RUBRIC`; los ítems pendientes se reflejan en Evaluación.
   - **Paso 2 — Comparsas (`?step=participantes`)**: Tipos de participación (categorías), comparsas, logos, colores y orden de pasada por jornada. El botón **Participantes** de cada comparsa abre sus nominaciones agrupadas por los rubros existentes: **Agregar participante → escribir el nombre → Confirmar y agregar**, en un único modal. Permite desactivar/reactivar con confirmación, señala faltantes según readiness y conserva el límite de tres activos en rubros aleatorios. Solo permite cambios con evento en `CONFIGURING` y comparsa activa; en los demás casos es de consulta. Si faltan rubros de nominación activos, orienta hacia Rubros.
   - **Paso 3 — Jurados y especialidades (`?step=jurados`)**: Gestión de especialidades, selector de jornada, cobertura de puestos y modal accesible para asignar o reemplazar titulares y suplentes.
   - **Paso 4 — Evaluación (`?step=rubros`, enlace compatible)**: Selector de especialidades e ítems de los rubros existentes. **Crear ítem en [rubro]** permite agregar puntuables con su especialidad; se muestran los participantes activos del rubro. Los ítems pertenecen al rubro y se comparten entre sus participantes de distintas comparsas. Se conservan criterios descriptivos, edición, nominaciones e historial, con confirmación del impacto antes de modificar. La creación del rubro y la de sus ítems son operaciones separadas.
   - **Paso 5 — Revisión final (`?step=revision`)**: Valida los bloqueos oficiales de readiness de la API y habilita «Abrir competencia» con confirmación e idempotencia cuando el servidor lo permite. Si está abierto, ofrece accesos a Control de votación y Resultados y el resumen de preparación.
   - El alta de rubros conserva borradores ante rechazos inequívocos y bloquea el reenvío ante resultados inciertos (red, 5xx o respuesta sin ID). Los comprobantes aceptados permanecen accesibles aunque falle la relectura. Las rutas y pestañas administrativas no se limitan por asignaciones de evento.
   - **Errores de carga:** si falla la carga inicial del resumen de la preparación, de comparsas, tipos de participación, especialidades, Evaluación, orden de pasada o del padrón de jurados, se muestra el error con «Reintentar» en lugar de una lista vacía o un «0», para todos los roles.
4. **Control de votación (`#/admin/voting`)**: Administración operativa por jornada. Sigue el orden: evento abierto → **Abrir jornada** (confirmar) → **Abrir votación** (confirmar). Muestra por separado el estado de jornada y ventana; abrir la jornada no habilita votos por sí solo. Si la ventana está abierta, **Habilitar planillas pendientes** genera planillas para asignaciones nuevas sin reabrir ventanas cerradas. El cierre requiere confirmación, planillas completas y no permite reapertura.

El menú lateral habilita **Resultados** solo cuando `/api/v1/public/events` informa al menos un evento con resultados publicados. Mientras se consulta, si no hay resultados o si la consulta falla, aparece atenuado y sin destino navegable. Se vuelve a comprobar al cambiar de sección, al regresar a la pestaña y cada 60 segundos mientras está visible. El enlace abre dentro de la aplicación y conserva el menú y la sesión. El acceso público directo sigue disponible y muestra un estado vacío o un error con reintento, no una carga indefinida.

Al completar el registro por invitación, ambos campos de contraseña permiten mostrar/ocultar su contenido de forma independiente. Se requieren entre 8 y 128 caracteres, al menos una mayúscula, una minúscula y un número (0–9). Los tres indicadores pasan de rojo/pendiente a verde/cumplido al escribir y vuelven a pendiente si se elimina el requisito. La confirmación debe coincidir. La API también valida estos requisitos; no se modifican contraseñas existentes.

1. Abrir `/#/login` e ingresar **correo y contraseña**. El campo «Email» se envía como `email`; no utilizar un DNI en lugar del correo.
2. Si corresponde, la aplicación habilita el segundo factor y solicita un OTP al backend. El usuario no autoriza Gmail: esa autorización es de la cuenta remitente del servidor.
3. Ingresar los seis dígitos recibidos y pulsar **Verificar código**. El contador de reenvío es una ayuda visual, no reemplaza el límite por cuenta impuesto por la API.
4. La interfaz refresca `/api/v1/me` y deriva al área del rol. Haber recibido el correo no significa que la sesión haya quedado completamente autenticada.

No guardar contraseña, OTP ni cookies de sesión en localStorage. Para recuperar acceso, abrir `/#/forgot-password`; para cambiar contraseña, usar las opciones de `/#/cuenta`. Un enlace de invitación o recuperación es sensible: no incluirlo en logs, capturas ni reportes.

La PWA no cierra la sesión por inactividad. Mientras el Jurado está autenticado consulta `/api/v1/judge/session-status` cada cinco minutos; cuando todas las jornadas de sus eventos asignados están cerradas, termina la sesión y vuelve al login.

Si la API muestra un error de red al consultar la sesión, no presentarlo como si el usuario careciera de permisos. Mantener estados de carga, error, sesión anónima y segundo factor separados.

## Votación y persistencia

La interfaz vigente trabaja **online**. `JudgeBallotPage` consulta la planilla, guarda cada decisión mediante `PUT` y envía la planilla mediante `POST`; solo muestra confirmación persistida tras la respuesta del servidor.

- `PENDING` bloquea avance/confirmación según el flujo; se respeta el orden de pasada y la inmutabilidad del ítem confirmado.
- Un error de red no equivale a un voto guardado; se mantiene la posibilidad de reintento visible.
- No se aceptan nuevas reaperturas ni se usa caché/outbox para votar sin conexión.
- `ballot-store.js` conserva utilidades históricas y pruebas; `SessionProvider` limpia datos offline del usuario al cambiar/cerrar sesión. Su existencia no habilita el modo offline.

En esta versión, `JudgeHomePage` obtiene planillas y progreso desde `/api/v1/judge/ballots?include=progress`. La API valida `SCORED` 1–10, `NOT_PRESENTED` con 0 y `PENDING` sin nota. Las asignaciones administrativas se hacen por jornada y especialidad; cada voto confirmado sigue siendo inmutable.

Ante un timeout, no habilitar edición de un ítem potencialmente confirmado ni disparar una cola automática. Recuperar estado del servidor y respetar el mecanismo de reintento/idempotencia del flujo. Un error de carga no debe mostrarse como una lista vacía exitosa.

## Diseño y accesibilidad

`App.jsx` distingue `data-layer="brand"` para acceso, invitaciones y portal público, y `data-layer="instrument"` para operación. La base visual vive en `styles/tokens.css`; `index.css` compone los estilos y conserva reglas globales. Hay hojas de administración, competencia, jurado, penalizaciones, escrutinio y ceremonia: comprobá sus imports reales antes de editar una hoja suponiendo que afecta una pantalla.

Reutilizá `Button`, `Dialog`, `ConfirmDialog`, `EntityDrawer`, `PageShell`, `PageHeader`, `StatusPill` y `ProgressBar`. Los diálogos usan `<dialog>` nativo y mecanismos de foco/etiquetado. Preservá teclado, nombres accesibles, foco visible, feedback de carga/error y operación táctil; los tests jsdom no reemplazan la comprobación responsive en navegador.

## Tiempo real y PWA

- `VeedorMonitorPage` escucha `/api/v1/monitor/stream` y el portal público `/api/v1/public/stream`; ambas pantallas tienen fallback por consultas periódicas ante fallas del canal.
- Las suscripciones y temporizadores deben limpiarse al desmontar. El monitor representa progreso, no puntajes individuales.
- `register-service-worker.js` no registra el worker en modo desarrollo. Fuera de ese modo registra `/sw.js` al cargar la página.
- El worker cachea el shell y recursos estáticos del mismo origen; excluye `/api`, `/api/`, `/health` y métodos distintos de GET. **No proporciona votación offline.**
- El build genera un identificador derivado del contenido y la lista de precache. El HTML usa red primero con respaldo de caché; los recursos precacheados usan caché. No publicar directamente el template `public/sw.js` con sus marcadores sin reemplazar.
- Un worker nuevo espera a que se cierren los clientes anteriores; no usa activación forzada para interrumpir planillas. Para actualizar, terminar operaciones, cerrar todas las pestañas/ventanas de la aplicación y volver a abrir online.
- El manifest usa iconos PNG de 192/512 y SVG. Las rutas de recursos y worker son absolutas desde `/`; un despliegue en subcarpeta requiere adaptar estas referencias.
- El manifest abre `/#/login`, la ruta de inicio reconocida por `App.jsx`.

## Pruebas y despliegue

`vite.config.js` configura Vitest con jsdom y `src/tests/setup.js`. El setup incluye matchers DOM, fake-indexeddb, soporte de Web Crypto y shims de almacenamiento/diálogo cuando faltan. Las pruebas cubren transporte, sesión, permisos, navegación, formularios, planillas, SSE, resultados, tokens y componentes.

La suite del cliente (`npm test`) cuenta con **576 pruebas pasando en 71 archivos**, incluyendo la verificación completa de los design tokens (`src/tests/tokens.test.js`, 45 tests), identidad visual y branding WebP/PNG, y las cuatro etapas del asistente de preparación de competencia. No hace falta una base PostgreSQL para las pruebas de cliente, ya que operan sobre mocks de API y entorno DOM aislado.

En el piloto, **Express sirve el bundle `client/dist` y `/api` desde un mismo servicio Render HTTPS**; no se despliega una segunda aplicación estática. La configuración vive en [render.yaml](../render.yaml); la [guía vigente](../docs/despliegue-y-respaldo.md) y el [antecedente histórico](../docs/historico/DEPLOYMENT.md) explican el despliegue. `npm run preview` es una vista previa local, no el servidor productivo ni un reemplazo del backend.

En producción, no definir `VITE_API_URL` para el despliegue estándar. Mantener sesiones, fetch y SSE en el mismo origen. Las URL absolutas del manifest/worker asumen publicación desde `/`, no desde una subcarpeta.

## Cómo trabajar en una pantalla

1. Identificar la ruta en `App.jsx`, el rol permitido y el contrato backend antes de modificar formularios o estados.
2. Reutilizar transporte, componentes y tokens existentes; no agregar un router, framework CSS o estado global para un cambio aislado.
3. Tratar carga, éxito, vacío, error, timeout y permiso insuficiente como estados distintos. Deshabilitar envíos duplicados mientras hay una operación en curso.
4. Confirmar operaciones sensibles en modal antes de llamar a la API y conservar identificadores de idempotencia cuando el contrato los use.
5. Limpiar `EventSource`, listeners y timers; evitar respuestas obsoletas cuando cambia el evento o se desmonta el componente.
6. Añadir pruebas de comportamiento y verificar teclado, foco, tamaño táctil y viewport móvil. No asumir que una hoja CSS tiene efecto sin revisar sus imports.
7. Ejecutar tests afectados, revisar el diff y actualizar documentación si cambia el flujo. No ejecutar builds locales como comprobación posterior al cambio.

### Comprobación manual del piloto

- Abrir la URL pública y comprobar que recursos y API usan HTTPS sin errores de CSP o contenido mixto.
- Probar correo/contraseña, entrega OTP, verificación y aterrizaje por rol; revisar errores sin capturar tokens.
- Comprobar que una cuenta no acceda a acciones fuera de sus permisos, incluso invocando la API directamente en pruebas autorizadas.
- Ensayar desconexión y recuperación en un escenario de pruebas, sin emitir votos ficticios en un concurso operativo.
- Verificar actualización de PWA sin perder una acción pendiente; la instalación depende del navegador y no convierte la votación en offline.

Al 16/09/2026 se verificó la carga pública, `/health` y la transición de login a solicitud de OTP. La verificación final del OTP y acceso al panel debe registrarse por separado; no se declara completada con esa evidencia parcial.

## Problemas frecuentes del cliente

| Síntoma | Diagnóstico inicial |
| --- | --- |
| HTML visible, pero API falla | Backend disponible, proxy Vite local y origen correcto; `preview` no inicia Express |
| 403 al guardar | Rol, 2FA, contexto y header `Origin`; no solucionar desactivando autorización |
| 429 al ingresar o reenviar | Esperar el tiempo del servidor; el contador visual no amplía el presupuesto de la API |
| Pantalla vieja | Worker anterior activo en otra pestaña; completar acciones y cerrar todas antes de reabrir |
| PWA abre una ruta inexistente | Confirmar que se instaló la versión más reciente de la aplicación y volver a abrir `/#/login` |
| No hay resultados públicos | Verificar liberación y evento seleccionado antes de asumir error de datos |

Para reportar fallas, adjuntar pasos, navegador/dispositivo, rol, hora y códigos HTTP/de dominio. No adjuntar contraseñas, OTP, cookies, tokens ni respuestas con datos personales.

La documentación de decisiones/specs y las instrucciones de agentes se conservan localmente, fuera de la publicación. Las validaciones históricas no equivalen a una comprobación actual; no declarar una funcionalidad validada sin evidencia del código y de las pruebas correspondientes.
### Faltantes anteriores en votación

En la planilla del jurado, **Faltantes anteriores** aparece únicamente cuando existe al menos un ítem anterior al visible que sigue sin votar, incluidos los de la misma comparsa. Excluye el actual, los siguientes y los ya resueltos (nota o «No se presentó»). El contador usa el mismo filtro y cada entrada permite volver al ítem. Que no aparezca el botón significa que no hay faltantes anteriores; no significa que se haya completado toda la votación.

### Actualización de la configuración

Los tipos de participación, comparsas, rubros e ítems se actualizan después de guardar, sin recargar la página. Los selectores relacionados y el resumen se refrescan con la misma revisión de datos. Las respuestas de consultas anteriores se descartan para no ocultar altas recientes.

El orden de pasada conserva la jornada seleccionada al actualizar catálogos. Agregar, quitar o reordenar una comparsa invalida las lecturas anteriores del cronograma. Las pruebas `AdminCompetenciaRefresh.test.jsx` cubren altas y respuestas demoradas; no cambian reglas de votación ni contratos de API.
