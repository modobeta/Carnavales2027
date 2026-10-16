# Guía de estilos — Portal Carnaval (`styles.md`)

## 1. Objetivo

Este documento define los lineamientos visuales y de experiencia de usuario (UX/UI) del portal de votación de comparsas de carnaval.

Todos los componentes, pantallas y modificaciones de la interfaz deben respetar estas reglas para garantizar una experiencia coherente, accesible y fácil de utilizar.

El diseño debe priorizar:

- La claridad y la facilidad de uso.
- La consistencia visual entre todas las secciones.
- La accesibilidad desde celulares, tablets y computadoras.
- La identificación rápida de acciones y estados.
- La prevención de errores durante las votaciones.
- La transparencia y la confianza en el registro de puntuaciones.

El sistema se utiliza durante eventos en vivo, frecuentemente al aire libre y de noche. Por eso, la legibilidad, el contraste y la facilidad de interacción son requisitos fundamentales.

---

## 2. Paleta de colores

### 2.1. Colores principales

| Elemento | Color | Código HEX |
|---|---|---|
| Fondo principal | degradado vertical Azul petróleo y violeta lavanda | `#01B2D4`; `#5e46be`|
| 
| Tarjetas y paneles | lavanda | `#5e46be` |

### Reglas de aplicación

- Utilizar `#01B2D4` como fondo principal de la interfaz.
- Utilizar `#243A53` para superficies del tema oscuro, áreas secundarias y elementos que necesiten distinguirse del fondo principal.
- Utilizar `#FCD102` como color de fondo de tarjetas, paneles y agrupaciones de contenido.
- Mantener una jerarquía visual clara entre el fondo, las tarjetas y los controles.
- Evitar introducir colores adicionales sin una justificación funcional.
- No utilizar todos los colores con la misma intensidad en una misma pantalla.
- Verificar el contraste entre cada color de fondo y su contenido.

**Importante:** cuando dos elementos contiguos utilicen colores similares, diferenciarlos mediante bordes, espaciado, elevación u otro recurso visual accesible.

---

## 3. Paleta de botones

Los botones deben tener colores consistentes según su función. El color debe ayudar al usuario a comprender la acción, pero nunca ser el único indicador de su significado.

### 3.1. Botón principal

- **Color:** `#d22b8f`
- **Uso:** acciones principales, como iniciar sesión, continuar o guardar avances.
- Debe destacar sobre el fondo en el que aparece.
- Si el fondo también es `#036B8B`, utilizar una variante con suficiente contraste.

### 3.2. Botón secundario

- **Color:** `#DF3CB5`
- **Uso:** acciones alternativas, navegación secundaria y opciones complementarias.
- Sobre tarjetas del mismo color, utilizar una variante diferenciada, un borde o un estilo alternativo.

### 3.3. Botón terciario

- **Color:** `#243A53`
- **Uso:** filtros, controles auxiliares y acciones de menor prioridad.
- No debe competir visualmente con el botón principal.

### 3.4. Botón de edición

- **Color:** `#A500B5`
- **Uso:** editar usuarios, comparsas, rubros, configuraciones y otros registros.
- Debe comunicar que la acción modifica información existente.

### 3.5. Botón de éxito

- **Color:** `#2BC100`
- **Uso:** acciones explícitamente relacionadas con un estado exitoso, cuando corresponda.
- Puede utilizarse para indicar una operación exitosa, pero no debe reemplazar los mensajes que confirman el resultado de una operación.
- No utilizarlo indiscriminadamente para todos los botones de guardado.

### 3.6. Botón de advertencia

- **Color:** `#FF6F00`
- **Uso:** acciones que requieren precaución o atención especial.
- No utilizarlo como color predeterminado de edición ni de navegación.

### 3.7. Botón destructivo

- **Color principal:** `#DC2626`
- **Color hover:** `#B91C1C`
- **Uso:** eliminar usuarios, comparsas, rubros, registros y otros elementos.

Reglas:

- Utilizar etiquetas explícitas, como «Eliminar comparsa» o «Eliminar usuario».
- Acompañar el botón con un icono cuando aporte claridad.
- Solicitar confirmación antes de ejecutar eliminaciones importantes.
- No utilizar el rojo para guardar, editar o navegar.
- Diferenciar las acciones destructivas de las acciones normales incluso cuando no se perciba el color.

### 3.8. Reglas generales para botones

- Utilizar una única acción principal claramente destacada por grupo de acciones.
- Evitar que varios botones compitan por la atención al mismo tiempo.
- Mantener tamaños, bordes, tipografía y espaciado consistentes.
- Definir estados `hover`, `focus`, `active`, `disabled` y `loading`.
- No depender de efectos `hover` para revelar acciones esenciales en dispositivos táctiles.
- Evitar envíos duplicados mediante clics repetidos.
- Mostrar indicadores de carga cuando una operación tarde en completarse.
- Utilizar texto claro y específico en lugar de etiquetas ambiguas.
- Verificar el contraste de los textos sobre todos los colores de los botones.

---

## 4. Modales y mensajes del sistema

Los modales deben mantener una estructura consistente en todas las secciones.

### 4.1. Modal informativo o de confirmación

- **Color:** `#A500B5`
- **Uso:** información relevante, solicitudes de confirmación y decisiones que requieren la atención del usuario.
- Debe explicar claramente qué acción se está por realizar.
- Debe incluir botones con etiquetas explícitas.

### 4.2. Modal de éxito

- **Color:** `#2BC100`
- **Uso:** informar que una operación se completó correctamente.
- Ejemplos: cambios guardados, configuración actualizada o registro creado.
- No mostrarlo hasta que el sistema confirme que la operación terminó correctamente.

### 4.3. Modal de advertencia

- **Color:** `#FF6F00`
- **Uso:** cambios pendientes, acciones riesgosas, errores recuperables y situaciones que requieren atención.
- Debe explicar las consecuencias de la acción cuando corresponda.

### 4.4. Reglas de comportamiento

- Incorporar modales donde sean necesarios para guardar cambios, advertir sobre modificaciones o confirmar acciones importantes.
- Evitar abrir múltiples modales simultáneamente.
- Permitir cancelar una acción cuando sea posible.
- No cerrar automáticamente un modal si esto puede provocar pérdida de información.
- No mostrar mensajes de éxito antes de recibir confirmación del servidor.
- Mantener los mensajes breves, claros y comprensibles.
- Adaptar los modales a la altura y anchura disponibles en celulares y tablets.
- Si el contenido es extenso, permitir desplazamiento interno.
- No utilizar un color como único medio para comunicar el tipo de mensaje.

Los modales informativos no deben convertirse en una interrupción innecesaria para cada acción menor. Para operaciones rutinarias, utilizar mensajes de estado discretos cuando resulte más adecuado.

---

## 5. Tarjetas y paneles

Las tarjetas deben utilizar `#341244` como color de superficie principal.

Reglas:

- Agrupar información relacionada.
- Utilizar títulos descriptivos y jerarquías visuales claras.
- Mantener espaciados internos consistentes.
- Evitar acumular demasiadas acciones en una misma tarjeta.
- Diferenciar visualmente elementos seleccionados, pendientes, completados y deshabilitados.
- Mantener un contraste adecuado entre el contenido y el fondo.
- Utilizar bordes, separaciones o elevación cuando sea necesario distinguir tarjetas contiguas.
- Evitar sombras excesivas y decoraciones que dificulten la lectura.

Las tarjetas interactivas deben comunicar que pueden seleccionarse o abrirse. Las tarjetas informativas no deben parecer botones si no ejecutan una acción.

---

## 6. Tipografía y legibilidad

- Priorizar la legibilidad por encima de los efectos decorativos.
- Utilizar una jerarquía tipográfica consistente para títulos, subtítulos, etiquetas y contenido.
- Utilizar aproximadamente `16px` como tamaño base para el texto principal.
- Evitar textos secundarios excesivamente pequeños.
- Mantener una tipografía sencilla y legible.
- Utilizar textos breves en botones y mensajes.
- Evitar bloques extensos de texto en pantallas destinadas a tareas rápidas.
- Mantener suficiente interlineado y separación entre elementos.

La tipografía debe ser cómoda de leer desde una tablet o un celular durante el evento.

---

## 7. Formularios y controles

- Utilizar etiquetas visibles y descriptivas.
- No depender exclusivamente de los placeholders para explicar los campos.
- Indicar qué campos son obligatorios.
- Mostrar errores cerca del campo correspondiente.
- Conservar los datos ingresados cuando ocurra un error recuperable.
- Evitar formularios innecesariamente extensos.
- Mantener áreas táctiles cómodas.
- Comunicar claramente los estados de validación.
- No utilizar únicamente colores para indicar errores o campos válidos.

### Selectores de color

Los selectores de color para comparsas deben permitir:

- Seleccionar un color visualmente.
- Introducir un código HEX.
- Ver una vista previa del color elegido.
- Editar o restablecer la selección.
- Identificar el color seleccionado sin depender únicamente de la percepción visual.

---

## 8. Diseño adaptable y accesibilidad

La interfaz debe funcionar correctamente en celulares, tablets y computadoras.

### Reglas generales

- Priorizar el uso táctil en las pantallas de votación.
- Utilizar áreas táctiles de aproximadamente `44–48px` como mínimo recomendado.
- Evitar que los modales excedan la pantalla disponible.
- Mantener los botones importantes visibles y fáciles de alcanzar.
- Evitar acciones que dependan exclusivamente de `hover`.
- Mantener una navegación por teclado adecuada.
- Proporcionar indicadores visibles de foco.
- Utilizar etiquetas descriptivas para controles e iconos interactivos.
- Comprobar la legibilidad en condiciones de iluminación variables.

### Contraste

Verificar el contraste de textos, iconos, bordes y estados interactivos según las pautas WCAG 2.2 AA.

Como referencia:

- Texto normal: contraste mínimo de `4.5:1`.
- Texto grande: contraste mínimo de `3:1`.
- Componentes de interfaz y elementos gráficos necesarios: contraste mínimo de `3:1` respecto de los colores adyacentes, cuando corresponda.

No asumir que una combinación es accesible solo porque visualmente parece contrastante. Comprobarla con una herramienta de contraste.

Si una combinación no cumple los requisitos, ajustar el color del texto o del componente sin modificar innecesariamente la identidad visual.

---

## 9. Estados y retroalimentación

Toda operación importante debe comunicar su estado de manera clara.

Estados principales:

- **Pendiente:** la acción todavía no se completó.
- **En proceso:** la operación se está ejecutando.
- **Guardado localmente:** los datos están almacenados en el dispositivo, pero pueden no haberse sincronizado.
- **Sincronizando:** el sistema está intentando enviar los datos al servidor.
- **Guardado y sincronizado:** el servidor confirmó que los datos se almacenaron correctamente.
- **Error:** la operación no pudo completarse.
- **Confirmado:** la acción final fue registrada y no puede modificarse desde la interfaz.

Cuando una operación falle:

- Explicar qué ocurrió.
- Informar si los datos ingresados se conservaron.
- Proporcionar una acción para reintentar cuando sea posible.
- No indicar que se guardaron datos si el servidor no confirmó el registro.

---

## 10. Reglas específicas de las votaciones

Las pantallas de votación requieren especial cuidado porque registran puntuaciones oficiales durante un evento en vivo.

### Guardado y confirmación

- Diferenciar claramente entre guardar avances y confirmar definitivamente una planilla.
- Advertir al jurado antes de confirmar y cerrar la planilla.
- Explicar que, después de la confirmación definitiva, los votos no pueden modificarse.
- No permitir editar votos confirmados desde la interfaz.
- Utilizar etiquetas explícitas, como «Guardar avance» y «Confirmar y cerrar planilla».
- No utilizar únicamente el color para distinguir estas acciones.

### Conectividad

Si se implementa el guardado sin conexión:

- Informar cuándo los datos se guardaron localmente.
- Diferenciar los datos locales de los confirmados por el servidor.
- Mostrar el estado de sincronización.
- Evitar indicar que una planilla fue recibida oficialmente mientras no exista confirmación del servidor.
- Proteger los datos locales y evitar duplicaciones al recuperar la conexión.

### Seguridad y transparencia

- No mostrar resultados parciales o acumulados a usuarios sin autorización.
- Informar cuando la sesión no esté disponible por restricciones de fecha u horario.
- Comunicar errores de forma comprensible.
- No permitir que la apariencia de la interfaz contradiga las reglas reales de votación.
- Registrar y validar en el servidor las acciones críticas, sin depender exclusivamente de las restricciones visuales del frontend.

---

## 11. Consistencia entre secciones

Antes de crear un componente o modificar uno existente:

1. Comprobar si ya existe un componente equivalente.
2. Reutilizar los estilos y patrones existentes.
3. Respetar la paleta de colores definida.
4. Mantener el mismo comportamiento para acciones equivalentes.
5. Comprobar el diseño en diferentes tamaños de pantalla.
6. Verificar contraste, legibilidad y estados interactivos.
7. Evitar introducir colores o estilos arbitrarios.
8. No duplicar componentes cuando sea posible reutilizar los existentes.

Los cambios deben mantener la coherencia entre las pantallas de jurados, comisarios y administradores, respetando las diferencias funcionales de cada rol.

---

## 12. Instrucciones para futuras modificaciones

Este archivo debe utilizarse como referencia principal para implementar o modificar los estilos del portal.

- No rediseñar componentes existentes sin una necesidad concreta.
- No cambiar arbitrariamente la paleta de colores.
- No introducir nuevos colores sin una justificación funcional.
- No alterar las reglas de votación para resolver un problema meramente visual.
- Priorizar accesibilidad, claridad y seguridad sobre la decoración.
- Si una regla visual entra en conflicto con una acción crítica, priorizar que el usuario comprenda sus consecuencias.
- Si una combinación de colores no cumple los requisitos de contraste, proponer una variante accesible y coherente con la paleta.
- Comprobar que las modificaciones no rompan el diseño adaptable ni los componentes existentes.

**Objetivo final:** mantener una interfaz profesional, consistente y accesible que facilite el trabajo de jurados, comisarios y administradores, reduzca errores y contribuya a la transparencia del proceso de votación.
