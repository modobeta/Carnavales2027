# AGENTS.md — Client

Estas reglas complementan el `AGENTS.md` de la raíz y aplican a `client/`.

## Responsabilidad

El cliente contiene las interfaces de Jurado, Fiscal, Escribano y Administrador.

El Jurado es PWA responsive y opera **online-first**: si no hay conexión/API disponible, no se confirman votos ni cierres.

## Stack

- React + TypeScript + Vite.
- React Router.
- Tailwind.
- TanStack Query.
- Service Worker / Manifest.
- IndexedDB con Dexie para cache de sesión/contexto y compatibilidad técnica legacy.

## Jurado

Después del login, el jurado elige una noche creada por Administración.

La pantalla debe mostrar:

- noche, fecha, estado e identidad del jurado;
- conexión simple (`Con conexión` / `Sin conexión`);
- pestañas de comparsas de la noche elegida;
- rubros/subrubros;
- puntajes 0–5;
- progreso y cierre de comparsa.

### Confirmación de voto

Flujo vigente:

```text
seleccionar nota -> modal -> generar operationUuid -> POST /jurado/votos -> bloquear si servidor acepta
```

Reglas:

- una nota confirmada por servidor es inmutable;
- si hay timeout, red caída o API inaccesible, no bloquear como confirmado;
- mostrar error claro y permitir reintento manual;
- si el backend responde replay idempotente equivalente o `VOTE_ALREADY_CONFIRMED`, refrescar contexto y dejar el voto bloqueado según servidor;
- no disparar cola global, intervalos de sync ni reintentos automáticos por foco/online.

### Cierre de comparsa

Flujo vigente:

```text
modal -> operationUuid -> POST /jurado/comparsas/:id/cerrar -> bloquear si servidor acepta
```

No habilitar cierre si faltan ítems confirmados o si no hay conexión.

## Conectividad

Evitar health checks agresivos. No consultar `/health` en login solo para pintar estado.

React Query debe evitar retries automáticos y refetch por foco salvo necesidad explícita.

`navigator.onLine` sirve para UX inmediata, pero la autoridad final es la respuesta real de la API.

## IndexedDB y sync legacy

IndexedDB ya no es la cola crítica activa del flujo del Jurado.

Puede usarse para:

- cache de sesión/contexto;
- recuperación visual tras reload;
- compatibilidad con repositorios/tablas existentes.

`POST /jurado/sync/reconcile` puede permanecer por compatibilidad técnica, pero no debe usarse desde el flujo principal de voto/cierre.

## Admin

Admin gestiona usuarios, noches, comparsas, rubros/ítems y orden de comparsas por noche.

Toda acción sensible de modificar, borrar, abrir/cerrar o guardar orden debe tener modal de confirmación antes de llamar a la API.

## Fiscal y Escribano

- Fiscal/Supervisión: panel operativo por noche, progreso, eventos, resultados y penalizaciones.
- Escribano: panel operativo de consulta, actas, certificación, penalizaciones, auditoría e integridad.

No reintroducir asignaciones/reemplazos en la UI visible salvo pedido explícito.

## API y seguridad

Centralizar HTTP en la capa `api/`; no dispersar `fetch` en componentes.

Nunca incluir secretos en `VITE_*`, bundle JS, service worker, IndexedDB ni localStorage.

La UI mejora experiencia, pero no autoriza: el backend deriva permisos desde sesión.

## Accesibilidad y UX

Priorizar controles táctiles amplios, labels accesibles, foco visible, contraste alto, modales accesibles y mensajes que no dependan solo del color.

## Testing

Priorizar:

- selector de nota;
- modal de confirmación;
- bloqueo post-confirmación por servidor;
- timeout/red sin confirmación falsa;
- reintento manual;
- replay idempotente;
- cambio de noche/comparsa;
- admin CRUD con confirmaciones.

No ejecutar build por regla del proyecto.
