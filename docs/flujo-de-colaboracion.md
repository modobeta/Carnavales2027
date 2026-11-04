# Flujo de colaboración con Git y Pull Requests

## Ramas del proyecto

- **`main`**: rama estable asociada a producción. No se trabaja ni se hace push directamente sobre ella.
- **`developer`**: rama de integración compartida. Los colaboradores con permiso de escritura pueden hacer commits y push directamente. CI corre después de cada push, pero no lo bloquea antes de entrar.
- **Ramas de tarea**: opcionales para cambios grandes, riesgosos o que puedan chocar con trabajo simultáneo. Siempre parten de `developer`, nunca de `main`, salvo una corrección urgente de producción coordinada con el responsable.

El recorrido habitual es:

```text
main ──(actualización inicial)──> developer ──commits/push directos──> developer
                                     └── rama de tarea opcional ──PR──┘
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

2. Proteger **`main`** en GitHub: requerir Pull Request, aprobación y check `verify` exitoso y actualizado; impedir force-push y borrado, sin bypass ordinario.
3. Dejar **`developer` sin protección de rama** para permitir push directo. Limitar el permiso de escritura del repositorio a colaboradores de confianza y coordinar los cambios simultáneos. El workflow ejecuta CI tras cada push a `developer`, aunque un resultado rojo no revierte ese push.
4. Mantener Render conectado a `main` y el Auto-Deploy apagado. CI valida código en una base descartable; no ejecuta migraciones sobre Neon ni autoriza el despliegue.

La protección de `main` se configura en GitHub, no en este workflow. El workflow publica resultados de CI; el equipo no debe promover `developer` a `main` si su último estado está en rojo.

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

### 2. Elegir cómo trabajar

Para una tarea acotada, se puede trabajar **directamente en `developer`** después de actualizarla. Avisar al equipo qué archivos o flujo se van a tocar cuando haya riesgo de solapamiento.

Si el cambio es grande o conviene aislarlo, crear una rama **opcional** desde `developer` actualizado:

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

Cada rama opcional debe resolver una tarea acotada. Para una corrección urgente de producción, coordinar primero con quien mantiene el release: no derivar unilateralmente una rama de `main` que después deje `developer` atrasada.

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

### 4. Validar y subir el trabajo

Ejecutar pruebas relevantes según `docs/plan-de-pruebas.md`. API tests solo contra una base descartable; nunca contra Neon. Para cambios de cliente, usar `npm test --prefix client`; el build de cliente lo ejecuta CI y no se hace localmente según `client/AGENTS.md`.

Si trabajaste directamente en `developer`, verificar que tus commits locales no incluyen cambios ajenos y subirlos sin forzar:

```bash
git status --short --branch
git fetch origin
git rebase origin/developer
git push origin developer
```

El rebase anterior es solo para **commits locales que todavía no publicaste**. Si aparece un conflicto o el push es rechazado porque alguien avanzó la rama, detenerse, resolverlo con cuidado, repetir pruebas y volver a intentar. Nunca usar `git push --force` sobre `developer`, aunque GitHub lo permita.

Si usaste una rama de tarea, subirla:

```bash
git push -u origin feat/filtros-jurado
```

En ese caso, podés crear un PR con:

- **base:** `developer`
- **compare:** la rama de tarea
- título que describa el cambio;
- problema y solución, alcance, pruebas ejecutadas y riesgos;
- migraciones/impacto en datos o permisos, si aplica;
- capturas antes/después para cambios visuales.

El PR opcional no debe mezclar tareas independientes ni cambios generados que no correspondan.

### 5. Resolver CI

Después de un push directo a `developer`, revisar el check **`verify`** en GitHub Actions. Si falla, avisar al equipo y corregirlo con un nuevo commit antes de seguir integrando cambios o preparar un release: CI no deshace un push fallido.

Si `developer` avanzó mientras la rama estaba abierta, actualizarla con `origin/developer` antes del merge. Para una rama propia no compartida puede usarse rebase; si otras personas trabajan sobre esa rama, coordinar y no reescribir su historial compartido.

Si se abrió un PR de rama de tarea, esperar CI verde, resolver observaciones y fusionarlo a `developer` con el método habilitado en GitHub. Borrar la rama de tarea cuando ya no se necesite.

## Promoción de `developer` a producción (`main`)

Cuando el equipo decida que el conjunto integrado está listo:

1. Confirmar qué commits/PRs incluye `developer`, que estén completos y que su último CI esté verde.
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

El workflow `Pilot checks` corre **después** de pushes a `main` y `developer`, y en todo PR cuyo destino sea cualquiera de esas dos ramas. Conserva además triggers de push heredados para `feat/piloto-produccion` e `integration/**`; no son el flujo habitual de nuevas tareas. El job `verify` comprueba enlaces Markdown, instala dependencias, ejecuta migraciones dos veces y pruebas sobre PostgreSQL descartable, prueba y construye el cliente. Un resultado verde en `developer` no significa que `main` haya cambiado, que Render se haya desplegado ni que Neon haya sido modificado.
