# Flujo de colaboración con Git y Pull Requests

## Ramas del proyecto

- **`main`**: rama estable asociada a producción. No se trabaja ni se hace push directamente sobre ella.
- **`developer`**: rama de integración compartida. Los cambios cotidianos se incorporan aquí mediante Pull Request (PR).
- **Ramas de tarea**: ramas breves creadas desde `developer`, una por cambio. Nunca se crea una rama de tarea desde `main`, salvo que el responsable indique expresamente una corrección urgente de producción.

El recorrido habitual es:

```text
main ──(actualización inicial)──> developer ──> feat/fix/docs/... ──PR──> developer
                                                                  developer estable ──PR──> main
```

`developer` no publica automáticamente en Render. El despliegue de producción sigue siendo manual y requiere el procedimiento de [despliegue y respaldo](despliegue-y-respaldo.md).

## Preparación única por el administrador

Antes de pedir al equipo que use este flujo:

1. Crear `developer` desde el `main` vigente en GitHub. Si se hace localmente, actualizar `main` y publicar la rama:

   ```bash
   git fetch origin
   git switch main
   git pull --ff-only origin main
   git switch -c developer
   git push -u origin developer
   ```

2. En GitHub, configurar reglas de protección para **ambas** ramas (`main` y `developer`): requerir Pull Request, exigir el check `verify` exitoso y actualizado, impedir force-push y borrado, y no permitir bypass ordinario. Requerir al menos una aprobación independiente cuando haya otra persona disponible para revisar.
3. En `main`, exigir aprobación antes del merge. En `developer`, exigir también CI; una aprobación ayuda a revisar cambios, pero puede ajustarse al tamaño del equipo.
4. Mantener Render conectado a `main` y el Auto-Deploy apagado. CI valida código en una base descartable; no ejecuta migraciones sobre Neon ni autoriza el despliegue.

La protección de ramas se configura en GitHub, no en este workflow. El workflow solo publica los resultados de CI que pueden convertirse en checks requeridos.

## Pasos para cada colaborador

### 1. Actualizar `developer`

Al comenzar una tarea:

```bash
git fetch origin
git switch developer
git pull --ff-only origin developer
```

Si todavía no existe la rama local:

```bash
git switch --track origin/developer
```

No iniciar desde una copia vieja de `main`, otra rama de colaborador ni una rama de trabajo anterior.

### 2. Crear una rama específica

Crearla desde `developer` actualizado y trabajar solo en ella:

```bash
git switch -c feat/filtros-jurado
```

Prefijos sugeridos:

| Prefijo | Uso | Ejemplo |
| --- | --- | --- |
| `feat/` | Funcionalidad nueva | `feat/filtros-jurado` |
| `fix/` | Corrección | `fix/apertura-votacion` |
| `docs/` | Documentación | `docs/guia-colaboradores` |
| `test/` | Cobertura de pruebas | `test/permisos-admin` |
| `refactor/` | Reorganización sin cambiar comportamiento | `refactor/servicio-resultados` |

Una rama debe resolver una tarea acotada. Si aparecen tareas independientes, separar ramas y PRs. Para una corrección urgente de producción, coordinar primero con quien mantiene el release: no derivar unilateralmente una rama de `main` que después deje `developer` atrasada.

### 3. Hacer cambios y commits

Antes de editar, leer `AGENTS.md`, las instrucciones del módulo (`api/AGENTS.md` o `client/AGENTS.md`), la documentación aplicable y las pruebas existentes. Si una regla de negocio está ambigua o pendiente, consultar; no inventarla.

Hacer commits frecuentes cuando haya un avance coherente. Usar mensajes breves en formato convencional:

```text
feat(jurado): agregar filtros por estado
fix(votacion): validar apertura de jornada
docs: explicar flujo de Pull Requests
test(api): cubrir permisos de administrador
```

Antes de cada commit, inspeccionar qué se va a guardar:

```bash
git status
git diff
git diff --check
```

Nunca incluir `.env`, credenciales, tokens, códigos OTP, dumps, datos personales de producción, `node_modules` ni artefactos generados. Si una credencial se sube, avisar enseguida para tratarla como incidente; borrar el archivo en un commit posterior no la vuelve secreta.

### 4. Validar y publicar la rama

Ejecutar pruebas relevantes según `docs/plan-de-pruebas.md`. API tests solo contra una base descartable; nunca contra Neon. Para cambios de cliente, usar `npm test --prefix client`; el build de cliente lo ejecuta CI y no se hace localmente según `client/AGENTS.md`.

Subir la rama:

```bash
git push -u origin feat/filtros-jurado
```

Crear en GitHub un PR con:

- **base:** `developer`
- **compare:** la rama de tarea
- título que describa el cambio;
- problema y solución, alcance, pruebas ejecutadas y riesgos;
- migraciones/impacto en datos o permisos, si aplica;
- capturas antes/después para cambios visuales.

El PR no debe mezclar tareas independientes ni cambios generados que no correspondan.

### 5. Resolver CI y revisión

Esperar el check **`verify`** en verde y la revisión requerida. Si hay observaciones, corregir en la misma rama y volver a subir; el PR se actualiza solo. No saltar checks, no fusionar con conflictos y no cerrar un PR fallido como si estuviera aprobado.

Si `developer` avanzó mientras la rama estaba abierta, actualizarla con `origin/developer` antes del merge. Para una rama propia no compartida puede usarse rebase; si otras personas trabajan sobre esa rama, coordinar y no reescribir su historial compartido.

Una vez aprobada, fusionar el PR a `developer` con el método habilitado en GitHub y borrar la rama de tarea. No hacer push directo a `developer`.

## Promoción de `developer` a producción (`main`)

Cuando el equipo decida que el conjunto integrado está listo:

1. Confirmar qué PRs/cambios incluye `developer` y que estén completos.
2. Abrir un PR **de `developer` hacia `main`**. No abrir PRs individuales de colaboradores directamente a `main` para cambios ordinarios.
3. Esperar `verify` verde y una aprobación independiente. Resolver comentarios antes del merge.
4. Fusionar con el método aprobado para la rama de release y conservar `developer` para seguir integrando trabajo.
5. El merge a `main` no implica publicar: seguir el runbook de respaldo, validación de migraciones y deploy manual de Render.

No hacer merge de `main` hacia `developer` automáticamente por rutina: la dirección normal de promoción es `developer` → `main`. Si una corrección urgente se hace primero en `main`, debe volver a integrarse cuidadosamente en `developer` para evitar que se pierda o se repita.

## Comandos útiles

Ver rama y archivos modificados:

```bash
git status --short --branch
git diff --stat
```

Actualizar una rama propia con cambios recientes de `developer` (solo si no es una rama compartida):

```bash
git fetch origin
git switch feat/filtros-jurado
git rebase origin/developer
```

Si aparecen conflictos, resolverlos archivo por archivo, ejecutar pruebas, y continuar con `git rebase --continue`. Si hay dudas, detenerse y pedir ayuda; no usar comandos destructivos para descartar cambios ajenos.

## Qué hace y qué no hace CI

El workflow `Pilot checks` corre para pushes a `main` y `developer`, y para todo PR cuyo destino sea cualquiera de esas dos ramas. Conserva además triggers de push heredados para `feat/piloto-produccion` e `integration/**`; no son el flujo habitual de nuevas tareas. El job `verify` comprueba enlaces Markdown, instala dependencias, ejecuta migraciones dos veces y pruebas sobre PostgreSQL descartable, prueba y construye el cliente. Un resultado verde no significa que Render se haya desplegado ni que Neon haya sido modificado.
