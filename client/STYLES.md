# styles.md — Sistema de diseño de Carnaval2027

## 1. Objetivo

Definir un sistema visual coherente, moderno, accesible y fácil de utilizar en todo el portal de Carnaval2027.

La aplicación se utiliza en vivo durante los corsos, desde notebooks, tablets y celulares, incluso de noche y por personas con diferentes niveles de experiencia tecnológica.

Prioridades:
- Claridad y rapidez de interacción.
- Prevención de errores durante la votación.
- Diseño responsive.
- Accesibilidad y contraste adecuado.
- Consistencia visual en todas las secciones.
- Separación entre presentación visual y lógica de negocio.

## 2. Paleta cromática oficial

Utilizar los cinco colores oficiales sin modificarlos ni reemplazarlos por aproximaciones.

| Color | HEX | Uso principal |
|---|---|---|
| Rosa 1 | `#E91683` | Identidad, acciones principales y destacados |
| Rosa 2 | `#C70F6F` | Hover/profundidad de rosa y elementos de énfasis |
| Azul violáceo | `#3F51B5` | Navegación y acciones secundarias |
| Verde oliva | `#8BC34A` | Confirmaciones y estados positivos |
| Rojo coral | `#FF5252` | Errores y acciones destructivas |
| Amarillo anaranjado | `#FFC107` | Advertencias y resaltados |

### Fondos y superficies

- Tema claro: degradado en diagonal con los siguientes colores: `#FFFFFF`, `#FF5252`, `#E91E63`
- Tema oscuro: degradado en diagonal con los siguientes colores: `#000000`, `#14000A`, `#650838`
- Tarjetas tema claro: superficies con matiz rosado muy tenue (`#FFF5FA`), bordes sutiles derivados de los rosas oficiales.
- Tarjetas tema oscuro: superficies con matiz rosado muy oscuro (`#14000A`), bordes discretos derivados de los rosas oficiales.
- Modales: superficies coherentes con el tema activo, con los mismos matices rosados.
- Bordes, separadores: derivados de los dos rosas oficiales con transparencia para mantener sutileza.
- Sombras: discretas para separar sin generar grandes bloques saturados.

Los tonos neutros son funcionales y no constituyen colores adicionales de marca. Los dos rosas oficiales (`#E91683`, `#C70F6F`) se utilizan para acentos, acciones principales y detalles destacados.

Tarjetas: nuevo estilo rosa

Las tarjetas adoptan una identidad visual basada en los dos rosas oficiales (`#E91683`, `#C70F6F`).

No utilizar el rosa intenso como fondo sólido de todas las tarjetas, ya que puede dificultar la lectura y generar demasiada saturación visual.

Tema claro

Fondo de tarjeta: matiz rosado muy suave `#FFF5FA`.

Borde: rosa oficial con transparencia (`rgba(233, 22, 131, 0.25-0.35)`), preferentemente fino y discreto.

Encabezados: rosa oficial `#E91683` cuando el contraste del texto sea suficiente (usar texto negro `#000000`).

Títulos y contenido: negro o gris muy oscuro.

Sombras: suaves, para separar las tarjetas del fondo blanco.

Radio de borde: ligeramente redondeado y consistente en toda la aplicación.

Los matices claros predominan en las superficies; los tonos más intensos se reservan para bordes, encabezados, iconos y detalles destacados.

Tema oscuro

Fondo general: negro `#000000`.

Fondo de tarjeta: matiz rosado muy oscuro `#14000A`.

Bordes y detalles: rosas oficiales con transparencia (`rgba(233, 22, 131, 0.38-0.7)`), discretos.

Títulos y contenido: blanco o gris muy claro.

Sombras: moderadas y discretas, sin depender exclusivamente de ellas para separar las tarjetas.

El tema oscuro debe mantener una apariencia elegante y legible, sin convertir todas las tarjetas en grandes bloques de rosa intenso. Los dos rosas oficiales se utilizan para énfasis y elementos interactivos.

Jerarquía de tarjetas

Tarjetas informativas: fondo rosa claro y borde discreto.

Tarjetas seleccionadas: borde rosa más destacado y un indicador visual adicional.

Tarjetas interactivas: cambio sutil de sombra o borde al pasar el cursor o recibir el foco.

Tarjetas importantes: pueden incluir una franja o encabezado rosa oficial.

Tarjetas de comparsas: conservar sus colores configurables propios, sin reemplazarlos por el rosa de la interfaz.

No aplicar simultáneamente fondos intensos, bordes gruesos, sombras fuertes y efectos luminosos a una misma tarjeta.

## 3. Contraste y accesibilidad cromática

**Esta sección es obligatoria para todos los componentes de la aplicación.**

No utilizar automáticamente texto blanco sobre todos los colores oficiales. La legibilidad tiene prioridad sobre la apariencia.

### 3.1. Combinaciones recomendadas

| Fondo | Texto recomendado | Contraste aproximado | Evaluación |
|---|---|---:|---|
| Rosa `#E91683` | Negro `#000000` | 4,4:1 | Adecuado para texto grande; verificar texto normal |
| Azul `#3F51B5` | Blanco `#FFFFFF` | 6,9:1 | Cumple WCAG AA |
| Verde `#8BC34A` | Negro `#000000` | 9,9:1 | Cumple WCAG AA |
| Rojo `#FF5252` | Negro `#000000` | 6,8:1 | Cumple WCAG AA |
| Amarillo `#FFC107` | Negro `#000000` | 12,9:1 | Cumple WCAG AA |

Los valores son aproximados y deben verificarse con una herramienta de contraste durante la implementación.

**Regla especial para el rosa:** el texto negro sobre `#E91683` puede quedar ligeramente por debajo del mínimo de 4,5:1 para texto normal. No utilizar esta combinación para texto pequeño sin comprobarla. Si no cumple, mantener el rosa oficial y utilizar una de estas alternativas:

- Usar texto blanco o negro únicamente después de verificar el contraste real.
- Reservar el rosa para fondos de elementos grandes o decorativos.
- Utilizar texto oscuro sobre una superficie blanca o neutra dentro del componente.
- Emplear el rosa en bordes, iconos o indicadores y mantener el texto sobre una superficie neutra.

No modificar el HEX oficial para solucionar un problema de contraste.

### 3.2. Requisitos WCAG

Aplicar como referencia WCAG 2.2 nivel AA:

- Texto normal: contraste mínimo de 4,5:1.
- Texto grande: contraste mínimo de 3:1.
- Componentes interactivos e indicadores visuales esenciales: contraste mínimo de 3:1 respecto de los colores adyacentes relevantes.
- Foco de teclado claramente visible.
- Estados de error, éxito y advertencia identificables sin depender exclusivamente del color.

Comprobar el contraste en los estados normal, hover, presionado, seleccionado, deshabilitado y foco, así como en ambos temas.

No asumir que una combinación es accesible simplemente porque utiliza colores oficiales.

## 4. Uso semántico de los colores

### Rosa 1 — `#E91683`

Color principal de identidad.

Utilizar para botones principales, navegación activa, encabezados de tarjetas y elementos destacados. Evitar grandes superficies rosas innecesarias.

### Rosa 2 — `#C70F6F`

Color complementario para profundidad.

Utilizar para estados hover de elementos rosas, bordes de énfasis y detalles que requieran mayor definición. Trabaja en conjunto con Rosa 1 para mantener la identidad visual.

### Azul violáceo — `#3F51B5`

Color secundario.

Utilizar para navegación, acciones complementarias, consultas y controles de edición no destructivos.

### Verde oliva — `#8BC34A`

Color de éxito.

Utilizar para indicar guardados exitosos, operaciones completadas y confirmaciones. Acompañar siempre con texto o iconografía.

### Rojo coral — `#FF5252`

Color de riesgo.

Utilizar para errores, eliminaciones y advertencias de pérdida de datos. Las operaciones irreversibles deben tener confirmación explícita.

### Amarillo anaranjado — `#FFC107`

Color de atención.

Utilizar para avisos importantes, advertencias y cambios pendientes. Acompañar con mensajes que expliquen qué sucede y cómo proceder.

## 5. Botones

Todos los botones deben compartir dimensiones, tipografía, espaciado y comportamiento consistentes.

- Principal: rosa 1 (`#E91683`).
- Principal hover: rosa 2 (`#C70F6F`).
- Secundario: azul violáceo.
- Confirmación: verde oliva.
- Cancelación: estilo neutro o azul violáceo.
- Eliminación: rojo coral.
- Advertencia: amarillo anaranjado.

### Contraste de los botones

- Azul violáceo: texto blanco.
- Verde oliva: texto negro.
- Rojo coral: texto negro.
- Amarillo anaranjado: texto negro.
- Rosa 1: texto negro (`#000000`) sobre `#E91683` (verificado). Para casos con texto pequeño, preferir texto oscuro sobre superficie neutra si el contraste no es suficiente.
- Rosa 2: utilizar para hover/profundidad, manteniendo la tinta adecuada según el fondo.

Las combinaciones indicadas deben validarse con los valores HEX definitivos.

### Apariencia y comportamiento

- Bordes ligeramente redondeados.
- Sombras y luces sutiles para aportar profundidad.
- Estados visibles de foco, hover, pulsación, carga y deshabilitado.
- Transiciones breves.
- Objetivos táctiles de aproximadamente 44 × 44 píxeles CSS o mayores cuando sea posible.
- Etiquetas concretas: «Guardar», «Confirmar voto», «Cancelar» y «Eliminar».

No utilizar el rojo para cancelar operaciones comunes si no existe un riesgo real.

## 6. Tarjetas y contenedores

- Usar superficies neutras.
- Mantener jerarquía entre títulos, descripciones y acciones.
- Aplicar sombras discretas.
- Evitar bordes de colores intensos en todas las tarjetas.
- Reservar los colores oficiales para elementos que necesiten destacar.
- Mantener las tarjetas de comparsas diferenciadas mediante sus colores configurables, sin confundirlos con la paleta de la interfaz.

## 7. Modales y diálogos

Todos los modales deben seguir un patrón consistente.

### Creación y edición

- Título descriptivo.
- Campos etiquetados.
- Validaciones claras.
- Acción principal para guardar.
- Acción secundaria para cancelar.
- Advertencia cuando existan cambios sin guardar.

### Confirmación

- Describir la operación y sus consecuencias.
- Utilizar botones con etiquetas explícitas.
- Permitir cancelar sin ejecutar la acción.
- No depender únicamente de un cambio de color para comunicar el riesgo.

### Eliminación

- Utilizar rojo coral para destacar la acción destructiva.
- Explicar qué elemento se eliminará.
- Informar sobre posibles consecuencias.
- Utilizar «Eliminar» en lugar de «Aceptar».
- No ejecutar la operación antes de la confirmación.

### Contraste

- Tema claro: superficies blancas.
- Tema oscuro: superficies negras o tonos oscuros diferenciados.
- Texto legible y controles con contraste suficiente.
- Superposición que separe el diálogo del contenido de fondo.
- Foco visible y navegación por teclado.

## 8. Formularios

- Etiquetas visibles.
- Campos obligatorios identificados.
- Errores junto al campo correspondiente.
- Mensajes que expliquen cómo corregir los errores.
- Valores introducidos conservados ante errores de validación.
- Bordes y estados de foco visibles.
- Contraste comprobado en ambos temas.

Los datos introducidos y las validaciones existentes deben conservar su comportamiento.

## 9. Pantalla del jurado

La pantalla de votación tiene máxima prioridad operativa.

- Identificar claramente la comparsa, el rubro y el elemento evaluado.
- Facilitar la selección de puntuaciones.
- Diferenciar las opciones seleccionadas.
- Mostrar el progreso y los criterios pendientes.
- Explicar las restricciones de horario o estado.
- Confirmar el guardado correcto.
- Solicitar confirmación antes de cerrar definitivamente una planilla.
- Evitar animaciones y notificaciones distractoras.

Los estados de guardado, error y confirmación deben distinguirse por color, texto e iconografía.

Ningún cambio visual puede modificar los puntajes, los permisos, las validaciones o las reglas de confirmación de votos.

## 10. Pantalla del administrador

- Organizar las secciones mediante títulos y separadores visibles.
- Mantener consistencia en tablas, tarjetas, formularios y modales.
- Diferenciar acciones principales y secundarias.
- Identificar claramente creación, edición y eliminación.
- Mostrar estados de carga, guardado y error.
- Mantener los permisos administrativos existentes.
- No exponer resultados parciales del jurado como consecuencia de cambios visuales.

## 11. Tema claro y oscuro

### Tema claro

- Fondo general: `#FFFFFF`.
- Texto principal: negro o gris muy oscuro.
- Superficies: blanco con matices rosados muy suaves (`#FFF5FA`).
- Tarjetas: `#FFF5FA` con bordes sutiles derivados de los rosas oficiales.
- Bordes: derivados de los rosas oficiales con transparencia.
- Colores oficiales: acciones, estados y destacados utilizando ambos rosas.

### Tema oscuro

- Fondo general: `#000000`.
- Texto principal: blanco o gris muy claro.
- Superficies: negro con matices rosados oscuros.
- Tarjetas: `#14000A` con bordes discretos derivados de los rosas oficiales.
- Bordes: derivados de los rosas oficiales con transparencia.
- Colores oficiales: conservar los HEX originales, utilizarlos para énfasis.

El tema oscuro no debe limitarse a invertir colores. Revisar por separado tarjetas, campos, menús, modales, textos secundarios, foco y estados interactivos.

Verificar todas las combinaciones de contraste en ambos temas.

## 12. Animaciones y efectos visuales

Se permiten luces, sombras, transiciones y animaciones discretas.

- Mantener tiempos breves.
- Evitar retrasos en las acciones.
- No impedir la interacción durante animaciones decorativas.
- Evitar movimientos constantes que distraigan.
- Respetar la preferencia de movimiento reducido.
- No mostrar una operación como exitosa antes de recibir la confirmación real del sistema.

Los efectos visuales deben ser independientes de la lógica de guardado y confirmación.

## 13. Implementación técnica

1. Centralizar colores y valores visuales mediante variables CSS.
2. Utilizar variables semánticas para fondos, textos, botones, errores y estados.
3. Evitar repetir códigos HEX en múltiples componentes.
4. Mantener separados los estilos y la lógica de negocio.
5. Reutilizar componentes existentes.
6. No duplicar componentes para resolver diferencias de apariencia.
7. Conservar validaciones, permisos y reglas de votación.
8. Comprobar el diseño responsive.
9. Probar estados de carga, error, foco, selección y deshabilitado.
10. Ejecutar las pruebas existentes y corregir las regresiones.
11. Verificar el contraste con una herramienta automatizada y realizar comprobaciones visuales.
12. Probar los componentes en tema claro y oscuro.

## 14. Criterio final

La identidad visual de Carnaval2027 debe respetar la paleta oficial compuesta por dos rosas (`#E91683`, `#C70F6F`), azul violáceo (`#3F51B5`), verde oliva (`#8BC34A`), rojo coral (`#FF5252`) y amarillo anaranjado (`#FFC107`), con los dos temas: blanco con matices rosados y negro con matices rosados oscuros.

El rosa identifica la marca; el azul organiza las acciones complementarias; el verde comunica éxito; el rojo identifica acciones destructivas o errores; y el amarillo señala advertencias.

**La paleta oficial no debe modificarse para corregir problemas de accesibilidad.** Se debe adaptar el texto, la superficie, los bordes y la composición del componente para obtener un contraste adecuado.

La prioridad es que los jurados puedan votar con rapidez, claridad y confianza, sin errores ni confusiones. La estética debe reforzar la transparencia y la fiabilidad del sistema.
