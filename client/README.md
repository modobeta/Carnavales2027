# Cliente — Carnavales 2027

Aplicación React para administración, jurados, supervisión, comisariato, escrutinio y consulta pública de resultados.

[Proyecto](../README.md) · [API](../api/README.md)

**Piloto:** https://carnavales2027-piloto.onrender.com/#/login. Usuarios y responsables de operación pueden comenzar por la [guía de uso](../README.md#guía-de-uso); este documento explica además cómo mantener la interfaz.

> El stack que sigue está comprobado en `package.json` y el código. Algunas instrucciones históricas locales describen otra arquitectura y otro flujo de puntuación. Consultar las [diferencias pendientes](../README.md#diferencias-funcionales-pendientes-de-conciliación): no cambiar reglas de negocio para hacerlas coincidir con una captura o un README.

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
| `#/admin/home` | Inicio operativo; resumen de eventos activos y accesos directos (ADMIN o ADMIN_EVENT vigente) |
| `#/admin/events` | Catálogo de eventos y gestión de jornadas (ADMIN) |
| `#/admin/competencia?step=...` | Asistente de preparación de competencia en 4 pasos (ADMIN) |
| `#/admin/judges`, `#/admin/assignments` | Personas/jurados y asignaciones (ADMIN) |
| `#/admin/voting` | Control de votación por jornada y mesa (ADMIN) |
| `#/admin/penalties` | Penalizaciones; ADMIN o COMISARIO |
| `#/admin/results`, `#/admin/record` | Resultados y acta; ADMIN, SCRUTINEER o ESCRIBANO |
| `#/judge`, `#/judge/assignment` | Inicio y asignaciones del jurado |
| `#/judge/ballot?ballotId=...&troupeId=...` | Planilla; JUDGE. El parámetro `troupeId` identifica aquí la entrada de programación (`nightScheduleId`) |
| `#/veedor` | Supervisión; ADMIN o VEEDOR, sujeta a autorización de la API |
| `#/resultados?eventId=...` | Portal público; selección de evento opcional |

No hay ruta vigente `#/home`: tras conservar un `returnTo` restringido del jurado, el login deriva por precedencia a ADMIN, ADMIN_EVENT vigente, JUDGE, COMISARIO, SCRUTINEER/ESCRIBANO y VEEDOR. ADMIN_EVENT llega solo a `#/admin/home`; las demás rutas mantienen sus guardias. Tener acceso de lectura a resultados no autoriza todas sus acciones; liberar, sortear y certificar corresponden a SCRUTINEER/ESCRIBANO en la API, no a ADMIN por sí solo.

`SessionProvider` consulta `/api/v1/me` y distingue `loading`, `authenticated`, `anonymous`, `second-factor-required` y `error`. El estado siempre expone `adminEvents` como array: en una sesión autenticada propaga los eventos informados por `/me` (o `[]` si el campo falta), y en los demás estados se normaliza a `[]`. Las guardias de interfaz ofrecen navegación y mensajes; **la seguridad la impone el backend**. La selección de evento en localStorage es una preferencia, no un permiso.

## Recorrido de acceso para usuarios

Durante la votación, el jurado ve dos barras: progreso de la comparsa que está consultando y total de puntuaciones completadas de su planilla. **Confirmar votación** permanece bloqueado hasta completar todas las puntuaciones y recibir confirmación de la API (incluidas decisiones «No se presentó»). Llegar al 100 % de una comparsa no habilita el cierre si faltan otras. El cierre conserva su confirmación explícita y validación en servidor.

La cabecera muestra nombre, roles en español y evento activo. **Evento activo** cambia el contexto compartido de trabajo y recuerda la selección por usuario. Los jueces eligen únicamente entre sus eventos con asignaciones activas, aun antes de abrir la votación; sus planillas/progreso se filtran por `eventId`. Cambiar de evento desde una planilla vuelve a **Mi panel**. Administradores, comisarios, escrutadores/escribanos y veedores conservan el acceso que sus endpoints ya autorizaban (Supervisión lista eventos con actividad). En `#/admin/home`, una cuenta sin ADMIN con `adminEvents` no vacío en `/me` (ADMIN_EVENT vigente) carga su catálogo desde `/api/v1/events`, que la API limita a sus asignaciones; los eventos inactivos se ocultan por defecto. En las demás pantallas, incluidas las de jurado, penalizaciones, resultados y supervisión, cada rol conserva su propio catálogo aunque la cuenta tenga además ADMIN_EVENT. La capacidad se toma solo de `/me`: una respuesta vacía o un rechazo del catálogo no se interpreta como falta de permiso. El selector no concede permisos ni reemplaza las validaciones de la API. Ante errores se bloquea la selección y se ofrece reintento.

### Navegación y preparación de la competencia (ADMIN)

El panel administrativo organiza la gestión en momentos claros de uso. Una cuenta sin ADMIN con ADMIN_EVENT vigente solo accede a **Inicio**; las demás pantallas de esta sección siguen reservadas a ADMIN y responden con el rechazo controlado de su guardia aunque se abran por URL directa. Su cabecera la identifica como «Administrador de evento» (junto a sus otros roles) y su menú ofrece **Inicio** más los enlaces de los roles que la cuenta tenga; no muestra las secciones de Preparación, En vivo, Finalización ni Usuarios. Un Jurado sin otra capacidad no tiene menú lateral; si además es ADMIN_EVENT, el menú aparece para poder volver a Inicio, salvo en las pantallas de votación (`#/judge/*`).

1. **Inicio (`#/admin/home`)**: Vista ejecutiva de eventos activos con accesos rápidos para continuar la preparación de competencia o ingresar a la mesa de control según el estado de cada evento. Admite ADMIN y ADMIN_EVENT vigente.
2. **Eventos y jornadas (`#/admin/events`)**: Gestión de alta, edición y estado de eventos y sus jornadas correspondientes.
3. **Preparación del evento (`#/admin/competencia`)**: Asistente secuencial de cuatro pasos con navegación superior e inferior:
   - **Paso 1 — Participantes / Comparsas (`?step=participantes`)**: Configuración de tipos de participación (categorías), alta y edición de comparsas (con carga y remoción de logos y colores distintivos) y orden de pasada por jornada.
   - **Paso 2 — Jurados y especialidades (`?step=jurados`)**: Selector de jornada para asignaciones, tabla con estado de cobertura de puestos («Completa», «Falta 1 jurado», «Sin asignar»), modal accesible para asignar o reemplazar titulares y suplentes, y acceso a gestión de especialidades.
   - **Paso 3 — Evaluación (`?step=rubros`)**: Panel de dos columnas que sitúa a la izquierda el selector vertical de especialidades y a la derecha los rubros correspondientes. Cada rubro expone sus criterios de puntuación desplegables en fila («Ver criterios ▾»), identifica rubros compartidos entre especialidades e incluye diálogo de confirmación que advierte el impacto en todas las especialidades antes de guardar modificaciones.
   - **Paso 4 — Revisión final (`?step=revision`)**: Si el evento está en preparación (`CONFIGURING`), valida los bloqueos oficiales de readiness informados por la API y, una vez satisfechos, habilita el botón «Abrir competencia» con confirmación accesible (`ConfirmDialog`) y persistencia de idempotencia antes del envío. Si el evento ya está abierto (`OPEN`), muestra un banner informativo con accesos directos a «Control de votación» y «Resultados», junto a un resumen ejecutivo en cuatro tarjetas (Comparsas, Jurados, Evaluación y Jornadas).
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

La suite del cliente (`npm test`) cuenta con **493 pruebas pasando en 64 suites de test**, incluyendo la verificación completa de los design tokens (`src/tests/tokens.test.js`, 45 tests), identidad visual y branding WebP/PNG, y las cuatro etapas del asistente de preparación de competencia. No hace falta una base PostgreSQL para las pruebas de cliente, ya que operan sobre mocks de API y entorno DOM aislado.

En el piloto, **Express sirve el bundle `client/dist` y `/api` desde un mismo servicio Render HTTPS**; no se despliega una segunda aplicación estática. La configuración vive en [render.yaml](../render.yaml) y la [guía de despliegue](../DEPLOYMENT.md). `npm run preview` es una vista previa local, no el servidor productivo ni un reemplazo del backend.

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
