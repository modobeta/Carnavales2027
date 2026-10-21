# UI/UX Design Brief — Carnavales 2027

**Estado:** propuesta de dirección para diseñar y revisar la interfaz; no aprueba reglas de competencia ni ordena un rediseño inmediato. **Base verificada:** cliente del commit `7c45056`, `client/AGENTS.md`, [`sistema-de-diseno.md`](sistema-de-diseno.md), [`flujos-y-pantallas.md`](flujos-y-pantallas.md) y [`client/STYLES.md`](../client/STYLES.md). Corte: 20/10/2026. Antes de implementar, contrastar con el código vigente.

## Encargo y resultado buscado

Diseñar una experiencia coherente para configurar la competencia, votar, supervisar y consultar resultados. Debe sentirse **festiva en la identidad** y **sobria en las tareas críticas**: la decoración nunca debe ocultar el estado real de un voto, una planilla, una jornada o un resultado. El éxito no se mide solo por atractivo visual, sino por menos errores, menos dudas y recuperación clara ante fallas de red.

### Personas y contexto de uso

| Persona | Tarea principal | Contexto que condiciona el diseño |
| --- | --- | --- |
| Jurado | Elegir asignación, evaluar ítems y confirmar planilla | Celular/tablet, evento en vivo, posibles cortes de conectividad, presión de tiempo |
| Administración | Configurar evento y abrir/cerrar votación | Formularios y tablas extensas, varios pasos dependientes, acciones con impacto irreversible |
| Veedor y comisario | Seguir jornada, registrar incidencias y penalizaciones autorizadas | Necesidad de lectura rápida, trazabilidad y distinción entre observación y acción |
| Escrutinio y escribanía | Revisar resultados internos, liberar y certificar | Precisión, separación de funciones y evidencia verificable |
| Público | Ver resultados liberados | Acceso sin sesión, lectura clara en móvil y ausencia de borradores |

Los permisos efectivos se consultan en la [matriz](matriz-de-permisos.md). Un rol visible en la interfaz no concede acceso por sí mismo: la API autoriza.

## Principios de diseño

1. **Estado verdadero antes que sensación de velocidad.** «Confirmado» significa aceptado por la API o replay idempotente equivalente. Offline, timeout y error no se presentan como guardado oficial ni disparan una cola automática de votos.
2. **Una acción principal por contexto.** La jerarquía debe distinguir navegar, guardar, confirmar y destruir. Las acciones sensibles explican consecuencia y piden confirmación antes de llamar a la API.
3. **Progreso visible y accionable.** Mostrar qué comparsa/rubro/ítem se evalúa, cuánto falta y dónde están los faltantes; no esconderlos en listas interminables.
4. **Orientación constante.** Nombre del evento, jornada, especialidad y rol en las pantallas que los necesitan. Cambiar de evento conserva solo permisos existentes.
5. **Legibilidad en condiciones reales.** Tipografía, foco, contraste y áreas táctiles deben soportar uso nocturno/exterior y pantallas pequeñas. El significado no depende únicamente del color o de un ícono.
6. **Evidencia sin ambigüedad.** Separar datos internos de resultados públicos; mostrar fecha/estado de publicación cuando corresponda. No sugerir que un borrador o una pantalla cacheada es un acta oficial.

## Dirección visual

- **Identidad:** la marca Carnaval usa el logo, acentos cian/magenta/violeta y el degradado existente. Aplicarla con más presencia en acceso y portal público; bajar el ruido decorativo en planillas, tablas y decisiones críticas.
- **Superficies:** usar el lenguaje de tarjetas y paneles oscuros/lavanda existente. Los documentos/actas usan la superficie de papel definida por tokens; no trasladar esa estética a toda la operación.
- **Tipografía:** Inter con alternativas de sistema, escala semántica `--text-*`; texto base legible y títulos breves. Evitar condensar datos críticos en microtexto.
- **Color funcional:** acciones y estados con tokens semánticos (`--action-*`, `--success-*`, `--warning-*`, `--danger-*`, `--surface-*`, `--text-*`). No copiar códigos HEX desde capturas ni crear una paleta paralela. La fuente implementada es `client/src/styles/tokens.css`.
- **Iconografía y movimiento:** íconos acompañados de nombre accesible; animación discreta que comunica transición, no retrasa una acción. Respetar `prefers-reduced-motion`, mayor contraste y menor transparencia ya contemplados por CSS.

[`client/STYLES.md`](../client/STYLES.md) conserva lineamientos útiles, pero tiene referencias cromáticas y textos condicionales de «guardado local/sincronización» que no describen el flujo online-first actual. Si contradice `client/AGENTS.md`, tokens o comportamiento probado, **no** convertirlo en requisito de una pantalla nueva; resolver la discrepancia antes de cambiar código. Ver [reglas de negocio](reglas-de-negocio.md).

## Arquitectura de información y pantallas prioritarias

| Área | Prioridad de diseño | Señal de buena resolución |
| --- | --- | --- |
| Acceso, OTP, recuperación e invitaciones | Distinguir pasos, errores y vencimiento; nunca mostrar secretos completos | El usuario sabe qué falta y cómo retomar sin reiniciar toda la tarea |
| Inicio/Competencia de ADMIN | Agrupar preparación por dependencias y mostrar faltantes de readiness | Puede encontrar el siguiente paso sin probar botones que «no hacen nada» |
| Apertura/cierre de votación | Estado actual, requisitos, alcance de la acción y confirmación explícita | No se confunde evento abierto con ventana de votación abierta |
| Selección y planilla del JUDGE | Contexto de jornada/comparsa, notas, «No se presentó», faltantes y dos niveles de progreso cuando apliquen | No hay duda entre ítem pendiente, operación en curso y decisión aceptada |
| Monitor e incidencias | Estado de jornada, eventos recientes y acceso a detalle | El rol distingue supervisar de modificar votos o resultados |
| Penalizaciones, escrutinio y acta | Origen/estado de datos, confirmaciones y evidencia | Liberar/certificar se separa visualmente de consultar un cálculo |
| Resultados públicos | Contenido solo liberado, jerarquía de comparsas/rubros, vacío explícito | Sin resultados publicados no aparece un menú que promete contenido inexistente |

Las rutas actuales están en [flujos y pantallas](flujos-y-pantallas.md); este brief no crea rutas nuevas.

## Patrones de interacción obligatorios para las propuestas

- **Estados por operación:** inicial, carga, vacío, listo, validación, guardando, éxito confirmado por servidor, error recuperable, sin conexión, permiso denegado y sesión vencida. Documentar qué conserva la pantalla y cuál es el siguiente paso en cada estado.
- **Voto:** seleccionar nota → revisar/confirmar según el flujo actual → esperar respuesta → bloquear solo al confirmar el servidor. Ante timeout, informar que el estado es incierto y ofrecer reintento manual con la misma operación idempotente; no afirmar éxito local.
- **Planilla:** botón «Confirmar votación» solo habilitado cuando el backend/estado vigente permiten completar; progreso por comparsa y total de puntuaciones cuando corresponde. Los faltantes deben poder localizarse sin perder el contexto de la comparsa actual.
- **Resultados:** navegación interna, sin abrir otra pestaña para una sección de la aplicación. Si no hay publicación, enlace deshabilitado con motivo legible, no un «Cargando...» indefinido.
- **Formularios y modales:** etiquetas visibles, errores junto al campo, datos conservados tras error recuperable, foco inicial/retorno y cierre seguro. No confirmar antes de respuesta de API. Reutilizar `Button`, `Dialog`, `ProgressBar`, `StatusPill`, `PageShell` y otros componentes existentes antes de crear variantes.
- **Navegación adaptable:** admin puede usar menú lateral/rail en escritorio; en móvil debe quedar alcanzable sin cubrir la tarea. El jurado conserva una superficie de trabajo despejada. No esconder funciones esenciales solo detrás de hover.

## Adaptación y accesibilidad

Diseñar y revisar al menos móvil estrecho, tablet y escritorio; probar además texto ampliado, nombres largos, tabla ancha, teclado y lectores de pantalla. Reorganizar tarjetas/columnas para usar el ancho disponible sin perder orden de lectura. Las tablas amplias pueden desplazarse **dentro de su contenedor**, no forzar desplazamiento horizontal de toda la página. Usar el mínimo táctil de `--touch-target-min` (48 px), foco visible y mensajes textuales además del color. Contrastar texto, controles y estados contra cada superficie; el script `client/scripts/contrast-check.mjs` es una verificación parcial, no una certificación integral de accesibilidad.

## Entregables para una iteración de diseño

1. Mapa de tareas por rol y wireframes de los flujos prioritarios, en móvil y escritorio (tablet donde cambie la disposición).
2. Pantallas de referencia con estados de éxito, faltantes, error de red, sesión vencida, vacío y permiso denegado; especificar copys y acciones de recuperación.
3. Inventario de componentes reutilizados/variantes nuevas y mapeo a tokens; propuesta de ajuste a `client/STYLES.md` si hay discrepancias.
4. Prototipo revisable con administración y jurado sobre datos de prueba, sin emitir votos en eventos reales.
5. Handoff con rutas afectadas, comportamiento esperado, criterios de aceptación y casos de prueba. Registrar cualquier regla de negocio pendiente como bloqueo, no como decisión de diseño.

## Criterios de revisión

- Un jurado puede identificar evento, jornada, comparsa, ítem, progreso y estado de **cada** decisión sin interpretar solo el color.
- Una caída de red o timeout nunca se representa como voto confirmado; existe acción clara para reintentar manualmente.
- Abrir/cerrar, liberar, certificar, borrar y otras acciones sensibles muestran alcance/consecuencia y requieren confirmación donde lo exigen las reglas.
- La interfaz no presenta resultados internos como públicos ni permite inferir permisos por visibilidad de menú.
- Los estados, modales, tablas y navegación funcionan con tacto, teclado, tamaño de texto ampliado y anchos de pantalla representativos; no se recorta contenido esencial.
- El diseño usa tokens y componentes existentes o justifica una variante nueva; pruebas visuales/funcionales se planifican en [plan de pruebas](plan-de-pruebas.md).

**Fuera del brief:** aprobar reglamento, modificar permisos, habilitar voto offline, definir retención legal o autorizar producción real. Esas decisiones pertenecen a [PRD](PRD.md), [reglas](reglas-de-negocio.md) y [decisiones](decisiones.md).
