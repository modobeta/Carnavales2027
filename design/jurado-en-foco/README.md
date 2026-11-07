# Jurado en foco — propuesta para revisión

**Estado: propuesta aprobada e integrada en la aplicación.** Estos archivos conservan la maqueta aislada utilizada para la revisión; no son el código de producción.

Abrí `index.html` directamente en el navegador. No requiere servidor, dependencias ni credenciales. La barra superior pertenece a la presentación: permite recorrer inicio, evaluación, revisión y consulta final, y probar estados de ejemplo. El menú de cuenta permite comparar tema oscuro y claro.

## Decisiones propuestas

- Cabecera compacta persistente: evento, noche, fecha, estado, especialidad y conexión. Identidad secundaria, sin avatar; tema dentro del menú de cuenta. El selector real de evento y la salida de sesión se conservarán al integrar; no se simulan sus efectos en esta maqueta.
- Inicio con una acción principal y progreso general. Columna secundaria para próximas y puntuadas/evaluadas; no confundir una comparsa puntuada con una planilla presentada.
- Evaluación en escritorio con navegación lateral y un ítem por vez. Comparsa e ítem dominan; progreso local, notas y ausencia como decisiones distintas. El ícono del ítem sigue grande y sin fondo.
- Si rubro y especialidad coinciden, no repetirlos. Cuando sean distintos, se deberá conservar el rubro como contexto secundario; los detalles reglamentarios y sujetos individuales existentes no se eliminan al integrar.
- Revisión con las dos comparsas y cierre explícito de **toda** la planilla. La confirmación de nota conserva comparsa, ítem y decisión porque esa repetición previene errores.
- Puntuaciones y cierre confirmados son de solo lectura. Errores y desconexión nunca se representan como confirmaciones exitosas.

## Límites

Los nombres, ítems y notas son datos ilustrativos, no nuevas reglas aprobadas. La maqueta no hace requests, no persiste decisiones y no comparte estado con la aplicación. Las confirmaciones solo alteran datos en memoria y se pierden al recargar. Recuperación de conexión y errores se simulan desde la presentación.

La propuesta muestra una noche y una especialidad para explicar la jerarquía. La integración debe conservar selección de evento/contexto, asignaciones múltiples, participantes, casos vacíos y permisos existentes; no limitar el dominio a estos datos.

## Integración

La integración conserva el selector de evento, las asignaciones, el ícono grande del ítem y la consulta de planillas confirmadas. `JudgeHeader` agrupa identidad, tema y salida sin modificar la cabecera de otros roles. `judge-focus.css` limita los estilos al Jurado y consume los colores centralizados en `tokens.css`.

`JudgeBallotReview` agrega la revisión previa al modal de cierre de toda la planilla. El parámetro opcional `review=1` permite abrir esa revisión desde el inicio, pero solo cuando no quedan puntuaciones pendientes; no envía votos ni cierra por sí solo. API, claves de idempotencia y autoridad del servidor se conservan.

Refinamiento posterior, exclusivo del inicio (`#/judge`): cabecera con nombre/rol y menú a la izquierda, noche/fecha larga al centro y evento con LED de conexión a la derecha; especialidad y estado quedan debajo del evento. Nombre, noche y evento usan rosa de la paleta, con variante según tema; los desplegables usan flechas pequeñas. La barra cuenta comparsas completamente puntuadas, no ítems ni cierres; llegar al total no implica que la planilla esté presentada. La evaluación conserva su cabecera compacta y fecha numérica.

Al integrar, ejecutar `npm test --prefix client` y verificar estados de puntuación/cierre, idempotencia, timeout y reintento con las pruebas reales. No ejecutar build, según `client/AGENTS.md`.

## Validación realizada sobre la maqueta (etapa previa)

- Sintaxis de JavaScript: `node --check design/jurado-en-foco/prototype.js`.
- 21 comprobaciones del flujo simulado en Chrome: selección, cancelación, confirmación, bloqueo, continuidad, revisión/cierre, vacío, desconexión y reintento. Sin fallos.
- 54 combinaciones de pantalla/escenario, tema claro/oscuro y anchos de 320, 390 y 1440 px, sin desbordamiento horizontal. Controles de puntuación de al menos 48 × 48 px en esos anchos.
- Teclado: Enter abre el modal, foco dentro del diálogo y Escape vuelve al control sin confirmar; salto al contenido conserva la pantalla.
- Contraste medido: texto principal y secundario superior a 4.5:1; tinta negra sobre rosa 4.91:1; barra vacía, bordes de las notas y foco superiores a 3:1. Esto no constituye una auditoría completa de accesibilidad.
- Recursos locales sin requests HTTP/API y sin advertencias/errores en consola durante las comprobaciones.

En esa etapa no se ejecutaron las pruebas del cliente ni build porque no había cambios en la aplicación.

## Validación de la integración

- Suite del cliente: incluye contexto/roles, confirmaciones, errores, ausencia, bloqueo e idempotencia. Se agregaron regresiones para revisión, foco y pérdida de conexión durante las confirmaciones de nota y cierre.
- Componentes reales montados en un fixture temporal con fetch aislado, sin backend ni votos reales: inicio, evaluación, revisión y consulta en ambos temas, a 320, 390 y 1440 px. Revisados recortes de descendientes además del overflow del documento.
- Sin build ni cambios de API o base de datos.
