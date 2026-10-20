# Sistema de diseño implementado

Para el objetivo de experiencia, personas, pantallas prioritarias y entregables, ver el [UI/UX Design Brief](ui-ux-design-brief.md). Esta página describe el sistema visual **implementado**, no una propuesta de rediseño.

**Fuente detallada:** [`client/STYLES.md`](../client/STYLES.md); tokens reales en `client/src/styles/tokens.css` y estilos por área en `client/src/styles/`. Esta página es mapa y reglas de mantenimiento, no otra paleta independiente.

- Stack: CSS propio y variables semánticas; no Tailwind ni librería de componentes. Tipografía Inter con alternativas del sistema.
- Capas: marca para acceso/identidad y superficie operativa para lectura de planillas. Usar tokens (`--text-*`, `--space-*`, `--radius-*`, `--touch-target-*`, colores de estado), no hex repetidos en componentes.
- Controles táctiles: mínimo 48 px previsto en tokens; foco visible, contraste y mensaje textual además de color. `client/scripts/contrast-check.mjs` comprueba combinaciones críticas; no demuestra por sí solo conformidad integral WCAG.
- Acciones sensibles: diálogo de confirmación antes de mutar; estado de proceso, error y recuperación claramente visibles. En votación distinguir pendiente, guardando, aceptado por API y error; jamás pintar «confirmado» por caché/offline.
- Adaptación: paneles y planillas ocupan ancho disponible; columnas se reorganizan para móvil sin perder orden de lectura ni controles accesibles.
- Branding PWA: `client/public/icons/logo.webp`, `client/public/manifest.webmanifest`, `client/index.html` y `client/public/sw.js`. Tras release, la pestaña vieja puede necesitar cierre/reapertura; no interrumpir planilla abierta.

## Cómo cambiar un patrón

Revisar tokens y `STYLES.md`, reutilizar componentes en `client/src/components/`, probar estado normal/error/carga/teclado/móvil y ejecutar las pruebas pertinentes. Si se crea un patrón nuevo, actualizar primero/siempre `STYLES.md` y pruebas de contraste/estructura donde correspondan.
