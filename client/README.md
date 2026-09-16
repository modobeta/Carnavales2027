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

## Recorrido de acceso para usuarios

En **Votación**, el administrador sigue este orden: evento abierto → **Abrir jornada** (confirmar) → **Abrir votación** (confirmar). La pantalla muestra por separado el estado de jornada y ventana; abrir la jornada no habilita votos por sí solo. Si la ventana está abierta, **Habilitar planillas pendientes** permite generar las de asignaciones nuevas sin reabrir una ventana cerrada. Si no hay planillas, se indica revisar las asignaciones. El cierre requiere confirmación, planillas completas y no permite reapertura. Las reglas y la auditoría existentes de la API siguen siendo la autoridad.

El menú lateral habilita **Resultados** solo cuando `/api/v1/public/events` informa al menos un evento con resultados publicados. Mientras se consulta, si no hay resultados o si la consulta falla, aparece atenuado y sin destino navegable. Se vuelve a comprobar al cambiar de sección, al regresar a la pestaña y cada 60 segundos mientras está visible. El enlace abre dentro de la aplicación y conserva el menú y la sesión. El acceso público directo sigue disponible y muestra un estado vacío o un error con reintento, no una carga indefinida.

Al completar el registro por invitación, ambos campos de contraseña permiten mostrar/ocultar su contenido de forma independiente. Se requieren entre 8 y 128 caracteres, al menos una mayúscula, una minúscula y un número (0–9). Los tres indicadores pasan de rojo/pendiente a verde/cumplido al escribir y vuelven a pendiente si se elimina el requisito. La confirmación debe coincidir. La API también valida estos requisitos; no se modifican contraseñas existentes.

1. Abrir `/#/login` e ingresar **correo y contraseña**. El campo «Email» se envía como `email`; no utilizar un DNI en lugar del correo.
2. Si corresponde, la aplicación habilita el segundo factor y solicita un OTP al backend. El usuario no autoriza Gmail: esa autorización es de la cuenta remitente del servidor.
3. Ingresar los seis dígitos recibidos y pulsar **Verificar código**. El contador de reenvío es una ayuda visual, no reemplaza el límite por cuenta impuesto por la API.
4. La interfaz refresca `/api/v1/me` y deriva al área del rol. Haber recibido el correo no significa que la sesión haya quedado completamente autenticada.

No guardar contraseña, OTP ni cookies de sesión en localStorage. Para recuperar acceso, abrir `/#/forgot-password`; para cambiar contraseña, usar las opciones de `/#/cuenta`. Un enlace de invitación o recuperación es sensible: no incluirlo en logs, capturas ni reportes.

Si la API muestra un error de red al consultar la sesión, no presentarlo como si el usuario careciera de permisos. Mantener estados de carga, error, sesión anónima y segundo factor separados.

## Votación y persistencia

La interfaz vigente trabaja **online**. `JudgeBallotPage` consulta la planilla, guarda cada decisión mediante `PUT` y envía la planilla mediante `POST`; solo muestra confirmación persistida tras la respuesta del servidor.

- `PENDING` bloquea avance/confirmación según el flujo; se respeta el orden de pasada y la inmutabilidad del ítem confirmado.
- Un error de red no equivale a un voto guardado; se mantiene la posibilidad de reintento visible.
- No se aceptan nuevas reaperturas ni se usa caché/outbox para votar sin conexión.
- `ballot-store.js` conserva utilidades históricas y pruebas; `SessionProvider` limpia datos offline del usuario al cambiar/cerrar sesión. Su existencia no habilita el modo offline.

En esta versión, `JudgeHomePage` obtiene planillas y progreso desde `/api/v1/judge/ballots?include=progress`. La API valida `SCORED` 1–10, `NOT_PRESENTED` con 0 y `PENDING` sin nota; las reglas históricas 0–5/sin asignaciones **siguen pendientes de conciliación**. No usar la escala implementada como prueba de aprobación reglamentaria.

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
- El manifest conserva `start_url="/#/"`, pero `App.jsx` no define `#/` como ruta de inicio. No asumir que el arranque instalado equivale a `#/login`; esta discrepancia requiere una corrección aparte.

## Pruebas y despliegue

`vite.config.js` configura Vitest con jsdom y `src/tests/setup.js`. El setup incluye matchers DOM, fake-indexeddb, soporte de Web Crypto y shims de almacenamiento/diálogo cuando faltan. Las pruebas cubren transporte, sesión, permisos, navegación, formularios, planillas, SSE, resultados, tokens y componentes.

Ejecutá `npm test` o los archivos afectados; registrá lo que efectivamente se ejecutó, sin copiar cifras históricas de `docs/`. No hace falta una base PostgreSQL para las pruebas de cliente que usan mocks.

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
| PWA abre ruta inexistente | Discrepancia `start_url=/#/`; usar `/#/login` mientras se resuelve |
| No hay resultados públicos | Verificar liberación y evento seleccionado antes de asumir error de datos |

Para reportar fallas, adjuntar pasos, navegador/dispositivo, rol, hora y códigos HTTP/de dominio. No adjuntar contraseñas, OTP, cookies, tokens ni respuestas con datos personales.

La documentación de decisiones/specs y las instrucciones de agentes se conservan localmente, fuera de la publicación. Las validaciones históricas no equivalen a una comprobación actual; no declarar una funcionalidad validada sin evidencia del código y de las pruebas correspondientes.
