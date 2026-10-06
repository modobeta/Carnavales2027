# Integración y validación de cambios remotos — 06/10/2026

Revisión de `origin/main` en `f7cc69300206607fbd0cf3ebb18cb39280ead62a`, comparada con la rama local de recuperación (`9164e47`, código publicado `2e4cb3c`). La revisión inicial se conserva debajo como antecedente. Posteriormente se integraron ambos trabajos en `integration/estilos-privacidad-20261006` (merge `0618efb`); no se publicó en Render ni se modificó Neon.

## Hallazgos de la revisión inicial

1. **No es un cambio exclusivamente visual.** Los 25 commits remotos incluyen 77 archivos, migraciones 080–083, puntuaciones por nominado, cambios de resultados y requisitos de apertura. Por ejemplo, `results-service.js` consulta `ballot_score.nomination_id`, creado en 080, y 083 agrega iconos/logos. En la última consulta del piloto la migración máxima era 076. No desplegar ese backend sin revisar y probar previamente las migraciones sobre una base de pruebas/restauración, con backup y plan de recuperación.
2. **Main no contiene las páginas ni la etiqueta de verificación de Google.** Se verificó su ausencia en el árbol remoto (`client/public/acerca.html`, `privacidad.html` y meta de `client/index.html`). Un despliegue directo de main las retiraría. La integración debe conservar los commits de `deploy/privacidad-oauth`; no copiar credenciales al repositorio.

## Defectos reproducidos

### P2 — Prueba de paleta desincronizada

`client/src/tests/tokens.test.js:20` espera `--palette-card: #9c27b0;`, mientras `client/src/styles/tokens.css` define `#691578`. El test falla sobre main actualizado. Antes de corregirlo, conservar la intención del diseño de los desarrolladores: si el violeta oscuro es el valor final, actualizar la expectativa y verificar contraste, no volver al color anterior solo para hacer pasar la prueba.

### P2 — ConfirmDialog pierde la indicación de procesamiento

En `client/src/components/ConfirmDialog.jsx:39-45` se pasa `disabled={confirming}` y `busyText`, pero falta `busy={confirming}`. `Button.jsx` solo muestra el texto de procesamiento y `aria-busy` cuando `busy` es verdadero. Resultado: el botón queda deshabilitado con la leyenda original durante el guardado; se perdió el feedback que tenía la implementación anterior. Una prueba focalizada en la copia temporal reprodujo la ausencia de «Procesando…». Corregir la prop e incorporar cobertura permanente.

## Cambios visuales identificados

- Paleta violeta, acciones de confirmación/cancelación y modales turquesa.
- Estilos de legibilidad, ajuste de textos largos y tablas.
- Mayor presencia de encabezados del menú lateral.
- Ajustes de ancho de planillas de consulta y nuevos iconos de rubros.

## Verificación realizada

- Copia temporal aislada con `git worktree`, sin modificar la rama de trabajo ni Render.
- Comando: `npm.cmd test -- src/tests/tokens.test.js src/tests/pwa-metadata.test.js src/components/AdminUxInteraction.test.jsx src/tests/AdminAssignmentsPage.test.jsx src/tests/AdminCompetenciaPage.test.jsx src/tests/JudgeBallotPage.test.jsx src/tests/JudgeBallotPageV3.test.jsx` desde el cliente de la copia.
- Resultado: **145 pasaron, 1 falló**, en 7 archivos. Falla de paleta detallada arriba.
- Prueba adicional temporal de ConfirmDialog: **1 falló**, reproduciendo el defecto de procesamiento.
- Se reutilizaron las dependencias locales del cliente mediante junction; no se instalaron dependencias ni se hizo build.
- No se ejecutaron pruebas de backend/migraciones ni revisión visual en dispositivos. Esta es una revisión focalizada, no una certificación de todos los cambios funcionales.

## Recomendación inicial (atendida por la integración)

Preparar una rama de integración que preserve privacidad/verificación y todos los aportes remotos, corregir ambos defectos y volver a probar. Separar la aprobación de los cambios de puntuación/resultados y el despliegue de migraciones de la publicación visual. El sitio productivo permanece en `2e4cb3c` con Gmail renovado y login confirmado por el responsable.

La copia de revisión está en `%TEMP%/carnavales-review-20261006`, detached en `f7cc693`. Contiene una prueba de reproducción no versionada `client/src/components/ReviewConfirmDialog.test.jsx` y una junction a las dependencias locales del cliente. No eliminar recursivamente la junction junto con su destino.

## Integración realizada

- Merge de main remoto conservando páginas de privacidad/presentación, enlaces del login y meta de Google.
- ConfirmDialog vuelve a mostrar procesamiento y aria-busy, bloqueando doble confirmación; prueba de regresión permanente.
- Expectativa de paleta actualizada a #691578, sin revertir los estilos de colaboradores.
- Fixtures de apertura ahora cargan jurados reales con cuotas/asignaciones. Se mantienen las validaciones en servicio y DB. Pruebas negativas cubren apertura sin jurado, y las noches AWARDS no requieren asignaciones imposibles.
- Prueba de migraciones incluye 083. La prueba histórica de 067 usa su guard de la época, no el servicio moderno contra un esquema sin judge_assignment.
- proxy-addr actualizado de 2.0.7 a 2.0.8, sin actualización general de dependencias. Aviso [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h): confianza IPv6 mal configurada puede aceptar IPs IPv4 ajenas; prueba de regresión agregada. No se constató explotación ni exposición del piloto (TRUST_PROXY por defecto es un salto).

## Evidencia de validación de la integración

- Cliente: `npm.cmd test --prefix client`, **56 archivos, 387 pruebas aprobadas**. Sin build local, respetando client/AGENTS.md.
- API: `npm.cmd test` con DOTENV_CONFIG_PATH aislado y PostgreSQL18.3, **206 pruebas aprobadas, 0 fallas y 0 omitidas**. Corrida inicial detectó fixtures obsoletos, no se ocultaron fallas ni se eliminaron controles para hacerla pasar.
- Auditoría local posterior a la suite: `npm.cmd run audit:verify`, **360 eventos verificados**, cadena íntegra.
- Dependencias API: `npm.cmd update proxy-addr --prefix api --ignore-scripts`, auditoría resultante **0 vulnerabilidades**.
- PostgreSQL **18.3 local, puerto 5433**: instalación limpia de Better Auth + 82 archivos numerados 001–083 (no existe 071); segunda ejecución aplica cero cambios. También se comprobó instalación limpia en PostgreSQL17.2, sin usarla como sustituto de 18.
- Nueva `api/src/db/tests/upgrade-076.test.js`: crea DB aislada, aplica archivos originales hasta076 y registra checksums, genera evento OPEN, planilla SUBMITTED, puntuaciones históricas generales/nominativas y auditoría. Upgrade077–083 conserva todos esos registros y los tipos de rubro; nomination_id histórico queda NULL; cadena auditable válida; replay vacío; editar/borrar puntuaciones confirmadas sigue rechazado.
- El test de upgrade conserva la DB sintética como evidencia, como los tests de seed existentes. No usa ni copia datos personales de Neon. No equivale a restaurar un backup del piloto.
- No se modificaron archivos de migraciones existentes. Respecto al commit productivo `2e4cb3c` solo se agregaron 080–083; Neon estaba en 076, por lo que el despliegue debe considerar 077–083.

### Reproducción segura

Desde api, con un archivo privado local ignorado `.env.integration-validation`: DATABASE_URL y TEST_DATABASE_URL deben apuntar a la misma base de pruebas aislada; EMAIL_PROVIDER=console y secretos de prueba, nunca Gmail/Neon reales. Crear antes tablas de Better Auth y aplicar migraciones.

```powershell
$env:DOTENV_CONFIG_PATH='.env.integration-validation'
npm.cmd test
npm.cmd run audit:verify
```

No ejecutar la suite contra una base operativa: genera datos y bases adicionales de evidencia. Para pruebas usar un rol local autorizado a CREATE DATABASE.

## Pendientes antes de publicar

1. Subir la rama y abrir PR a main para ejecutar CI Node22/Postgres18 y **build en CI** (el workflow no corre por push a integration/* solamente). No se ejecutó build local ni revisión visual multidispositivo.
2. Confirmar alcance funcional de los cambios remotos de nominados/resultados, no presentarlos como exclusivamente CSS.
3. Backup/snapshot actualizado de Neon, restauración de prueba con datos reales bajo acceso restringido y comprobación de checksums desde el mismo checkout/entorno del despliegue. El runner calcula SHA256 de bytes: no normalizar finales de línea ni reescribir migraciones históricas.
4. Aplicar 077–083 por el runner versionado durante una ventana controlada, verificar auditoría y desplegar el SHA integrado aprobado, no latest main a ciegas. No usar rollback SQL destructivo; conservar evidencia y plan de recuperación del backup, evitando perder votos nuevos.
5. Smoke público: login+OTP, privacidad/meta, asignación/apertura, votación, nominados y resultados. Mantener Gmail renovado y secretos existentes.

Producción permanece sin cambios en esta tarea. No llamar a actualización de variables Render como si fuera guardado inocuo: previamente disparó un despliegue implícito de latest main, aun con autoDeploy desactivado.

## CI y restauración del respaldo — 06/10/2026

- Rama integrada publicada: `integration/estilos-privacidad-20261006`, SHA `ee1062b94b72a6d18020daa31dfe65a45ed78cea`. [GitHub Actions 37458901374](https://github.com/modobeta/Carnavales2027/actions/runs/37458901374): **success**. Pasaron instalación, migraciones, pruebas API/cliente, auditoría, build del cliente y verificación del diff en Node 22/PostgreSQL 18. El workflow ahora admite push de `integration/**`; no hubo merge ni deploy.
- Origen del respaldo: Neon PostgreSQL 18.6, migración máxima `076`. Se usó conexión directa (no pooler), TLS `verify-full`, transacción `REPEATABLE READ READ ONLY` y snapshot exportado para que inventario y `pg_dump` correspondan a la misma captura. El dump custom se hizo con `pg_dump` 18.3. [Neon recomienda la conexión directa para `pg_dump`](https://neon.com/docs/guides/export-neon-postgres-compatible).
- Respaldo privado fuera de OneDrive y Git: `%LOCALAPPDATA%/Carnavales2027/backups/20261006-integration/carnavales_restore_test_20261006_1791287443944.dump`, **434.761 bytes**, SHA-256 `00314b9bd569ee4e11d337d5dbb4d06006965615a639656947498dcdbf163fd7`. Directorio con ACL solo para el usuario actual y SYSTEM. Contiene datos personales y de autenticación: no publicarlo ni adjuntarlo a tickets. Es un respaldo lógico de una base, no incluye roles globales.
- Restauración en una **nueva** base local PostgreSQL 18.3: `carnavales_restore_test_20261006_1791287443944`. No se borró ninguna base existente. Restauración `--no-owner --no-acl --exit-on-error --single-transaction`; se revocó `CONNECT`/`TEMPORARY` de `PUBLIC` en la copia. El inventario restaurado coincidió con Neon: **41 tablas, 3.670 registros** y fingerprints de contenido iguales. Checksums históricos `001`–`076` coinciden con el checkout, sin diferencias de finales de línea.
- Sobre esa copia se aplicaron **077–083**. Las **40 tablas y 3.595 registros preexistentes**, excluido el ledger `schema_migrations`, conservaron exactamente sus columnas anteriores. La diferencia de 75 filas respecto del inventario completo es el ledger histórico, no una pérdida. La cadena de auditoría conservó **491 eventos** y el mismo resultado antes/después. Segunda ejecución: cero migraciones aplicadas y cero pendientes.
- Evidencia privada: `.sha256`, `.inventory.json`, `validation.json` y `upgrade-validation.json` junto al dump. `api/.env.restore-validation` apunta solo a la base local y está ignorado por Git. No se inició la aplicación sobre esa copia ni se enviaron correos.
- **No se usó** `api/scripts/restore.sh`: actualmente continúa si falla la verificación del checksum y hace `DROP DATABASE`. No emplearlo para publicar sin corregirlo. Esta restauración tuvo destino nuevo y validación estricta.

CI/build y el ensayo con datos restaurados quedaron aprobados. **Neon productivo permanece en `076`; Render no se desplegó**. Revisar los cambios funcionales de nominados/resultados antes de publicar; tomar un respaldo nuevo inmediatamente antes del corte si hubo operaciones posteriores a esta captura. Hacer smoke público después del despliegue del SHA aprobado. El respaldo actual debe permanecer en acceso restringido hasta acordar su retención.

## Revisión funcional previa a publicación urgente

La consulta solo lectura del 06/10 encontró en Neon 24 planillas presentadas, 1.270 puntuaciones confirmadas, 258 de rubros `NOMINATION` en dos eventos, y ningún nominado cargado. Quedaba una jornada competitiva `DRAFT` de un evento ya `OPEN`, con tres asignaciones. El flujo nuevo 080–083 impedía crear sus planillas (`NOMINATION_CONFIGURATION_INCOMPLETE`). No era seguro publicar sin corregirlo.

La migración **084** fija, al momento de aplicarse, los alcances de evento/rubro/comparsa que ya estaban abiertos sin nominados. Solo esos alcances conservan el voto por comparsa con `nomination_id = NULL`, sin atribuir falsamente una nota a una persona. Las altas nuevas siguen exigiendo nominados; el guard de integridad 082 (nominado activo y tipo correcto) se conserva. En la copia restaurada se registraron 27 alcances. Un ensayo transaccional de la jornada pendiente creó tres planillas y 402 ítems, incluidos 126 nominativos históricos; se hizo `ROLLBACK`. La lectura de resultados de los dos eventos históricos conserva la suma de puntuaciones confirmadas y produce rankings sin inventar nombres. Esto es compatibilidad para datos existentes, no una nueva regla para eventos futuros.
