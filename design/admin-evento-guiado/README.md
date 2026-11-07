# Preparación guiada del evento — propuesta ADMIN

**Distribución aprobada e integrada en `#/admin/prepare`.** Esta carpeta conserva la maqueta de referencia; la aplicación reutiliza los editores y contratos reales, no los datos simulados de la maqueta.

Abrir `index.html` directamente en el navegador. El selector superior permite ver inicio vacío, preparación en curso, revisión lista, faltante y error. Es una maqueta autónoma: no hace requests ni guarda en navegador/base de datos. Los formularios solo modifican datos en memoria y se pierden al recargar.

## Alcance acordado

Terminar con el **evento listo para abrir**. Las asignaciones de jurados y la apertura de jornada/ventana de votación quedan fuera del asistente y se gestionan después por jornada. No se abren automáticamente eventos ni votaciones.

## Jerarquía propuesta

- Cabecera persistente: identidad/rol y menú de cuenta a la izquierda; evento y estado una sola vez al centro; Mis eventos a la derecha. Se conserva lo guardado y se consulta antes de descartar borradores; no se promete guardar al salir. Navegación administrativa accesible desde menú, sin repetirla en cada bloque.
- Cuatro etapas: **Evento → Evaluación → Comparsas → Revisión**. La primera incluye datos y jornadas; evaluación divide rubros/especialidades/ítems; comparsas divide alta/programación/participantes cuando corresponde.
- Una tarea principal visible. Opciones secundarias en disclosures; confirmaciones sensibles conservadas. Resumen complementario discreto, sin métricas o estado repetidos en varias tarjetas.
- Barra por etapas completas, no por páginas visitadas. Visitar una etapa o presionar Atrás no marca avances. El último tramo depende de revisión válida, no de llegar al final.
- Revisión con siguiente acción concreta y faltantes secundarios desplegables. Un error de revisión nunca equivale a evento listo.

## Evidencia y límites de la maqueta

Se verificaron `AdminHomePage`, `EventConfigurationPage`, `AdminCompetenciaPage`, `NightForm` y `readiness-presentation.js`. Hoy la creación inicial solo guarda nombre; configuración/jornadas y preparación de competencia se reparten entre rutas. La API de readiness ya distingue bloqueos de preparación de advertencias de jurados diferidas a jornada.

Los formularios son **muestras de jerarquía**, no contratos completos: la maqueta modela un rubro, una especialidad, un ítem, una comparsa y un participante opcional. El tipo «Comparsa» y demás nombres son ejemplos, no reglas de categoría aprobadas. La rama participante ilustra divulgación progresiva; no reemplaza el modelo de sujetos/nominaciones ni su cardinalidad real. No determina clasificación reglamentaria, escalas ni requisitos nuevos.

La revisión de la maqueta es simulada. Una implementación debe consumir la readiness oficial, conservar error/pendiente/no disponible y no calcular autorización de apertura a partir de contadores locales.

## Condiciones para integrar después de aprobación

- Reutilizar endpoints, validaciones, campos y capacidades actuales: múltiples rubros, jerarquías de ítems, especialidades, tipos, comparsas, jornadas, nominaciones, logos y programación. No recortar capacidades por simplificar su presentación.
- Guardar y continuar confirma el paso solo con respuesta aceptada; preservar entradas ante error, bloquear doble envío y permitir retomar desde datos persistidos. Navegar no equivale a guardar. Manejar explícitamente cambios sin guardar al salir/cambiar contexto.
- Mantener confirmaciones para modificaciones sensibles, creación/edición de jornada y guardado de programación según reglas actuales; conservar protección de historial, RBAC y auditoría.
- El evento nuevo debe quedar seleccionado y conducir al siguiente paso, sin regresar al catálogo por defecto. No crear un evento en cada avance ni confundir borrador con apertura.
- Conservar navegación directa a secciones para editar eventos existentes, sin forzar un asistente lineal en la operación. La finalización no debe exigir jurados de jornadas futuras ni reemplazar la confirmación de apertura existente.
- Aislar cabecera/estilos del área ADMIN; no modificar el Jurado ya ajustado. React/CSS propio, sin nuevas dependencias ni build.

## Validación prevista

En la maqueta: avance real frente a navegación, confirmaciones/cancelaciones, revisión con faltantes/error, ambas variantes de destinatario, tema claro/oscuro, teclado y viewport de escritorio/celular.

Al integrar: pruebas del cliente (`npm.cmd test --prefix client` en este entorno Windows), guardado/reanudación, rechazo/conflicto/red, cambio de evento, permisos y apertura explícita con readiness válida. No ejecutar build.

### Comprobaciones realizadas sobre la maqueta

- 25 comprobaciones de comportamiento en Chrome, sin fallos: navegación frente a guardado, creación de calendario, cancelación de confirmaciones, evaluación, programación, rama de participante, revisión, faltantes y reintento.
- 120 combinaciones de escenario/etapa/tema/ancho (320, 390 y 1440 px), sin overflow ni elementos fuera de pantalla. Navegar no modificó el progreso guardado.
- Teclado: Enter abre confirmación; foco dentro del diálogo; Escape devuelve foco, conserva la entrada y no avanza el progreso.
- Sintaxis JS, JSON y whitespace verificados. Consola sin errores; no requests HTTP/API.

Las comprobaciones anteriores corresponden solo a la maqueta. La integración añade pruebas de creación, doble envío, error/reintento, confirmaciones, borradores, navegación interna, permisos y readiness; además se revisa la aplicación real en Chrome con API simulada aislada, sin tocar datos reales. No se ejecuta build.
