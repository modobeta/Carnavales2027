# Despliegue y respaldo — piloto

**Estado al 20/10/2026:** `main` `7c4505664cb592113f05e202f6810ff31f2d088e` LIVE en Render servicio `srv-dal5pcv40ujc739l5r30`; Neon aplicó 090/095, sin migraciones pendientes ni votación abierta al corte. Esta es una **foto histórica**; consultar Render/GitHub/Neon antes de repetirla. Antecedentes amplios: [DEPLOYMENT.md](historico/DEPLOYMENT.md).

## Regla de publicación

`autoDeploy` está apagado. Cambiar `render.yaml` no modifica automáticamente el servicio existente (fue creado directamente). El build instala API/cliente y crea `client/dist`; start solo inicia API. **Render no aplica migraciones al arrancar**. En Free no hay pre-deploy command. No activar On Commit/After CI Checks Pass sin automatizar gate de esquema, backup y votación; CI actual usa solo DB descartable.

El job `verify` de GitHub Actions es un control de integración: prueba API/cliente, audita una base descartable, ejecuta migraciones dos veces y comprueba enlaces locales de Markdown. Un PR verde **no autoriza** desplegar ni implica que Neon esté preparado. `main` debe protegerse con PR, una aprobación y el check `verify` actualizado y obligatorio; esa configuración la realiza el propietario con permisos de administración en GitHub. Hasta comprobarla, no afirmar que GitHub impide pushes directos.

**Configuración pendiente del propietario en GitHub:** `Settings → Branches → Add branch protection rule` para `main`: exigir pull request antes de merge, una aprobación, status check `verify` exitoso, rama actualizada antes de merge, sin bypass ordinario, force-push ni borrado. Mantener el nombre del job `verify`; si cambia, actualizar la regla. Comprobar con un PR que el merge queda bloqueado cuando falla el check. Esta protección no cambia el estado de Auto-Deploy en Render.

## Procedimiento antes de cada release

1. Fijar SHA de `main` remoto y comprobar CI del **mismo SHA**. Revisar diff, migraciones y compatibilidad con código anterior. No iniciar durante votación activa.
2. Verificar en Neon migraciones/checksums, `voting_window` sin `OPEN`, conteos de `ballot`, `ballot_score`, `audit_event` y cadena de auditoría. Acordar ventana sin escrituras.
3. Hacer dump privado de Neon por conexión directa con TLS `verify-full`; calcular SHA-256 y listar contenido. No guardar dump ni URL con credenciales en repo/OneDrive público.
4. Restaurar en PostgreSQL **vacío y descartable**; comprobar conteos, auditoría y hashes de datos; ensayar solo migraciones pendientes y segunda ejecución sin pendientes. Si falla, detenerse.
5. Volver a fijar SHA/estado de votación. Aplicar migraciones a Neon con conexión directa y `api/src/db/migrate.js`; verificar segunda pasada, datos y auditoría. Nunca correr `npm test --prefix api` en Neon.
6. Desplegar manualmente desde Render; confirmar `live` con **ese SHA**, no solo «deploy triggered». Verificar `/health`, assets, login+OTP, 401/403, pantallas por rol y flujos críticos de solo lectura. Sin votos de prueba en eventos reales.
7. Registrar SHA, deploy ID, fecha, hash/ubicación privada del backup, migraciones, resultados de smoke y responsables. Usuarios de PWA deben cerrar/reabrir pestañas **cuando sea seguro**, no durante planilla abierta.

## Lista registrable para cada publicación

Copiar esta lista al registro de release **sin secretos, URLs de conexión ni rutas privadas del dump**. Conservar la ubicación del backup y cualquier credencial solo en un registro privado autorizado. Cada casilla requiere evidencia fechada; si falla o no se puede comprobar, **detenerse**.

- [ ] Responsable, ventana sin escrituras y SHA exacto de `main` anotados; PR aprobado y job `verify` verde para ese SHA.
- [ ] Neon sin `voting_window` en `OPEN`; conteos de votos/auditoría y estado/checksums de migraciones registrados.
- [ ] Dump nuevo por conexión directa TLS verificada; SHA-256 e inventario comprobados, con identificador de resguardo privado.
- [ ] Dump restaurado en base **vacía y descartable**; conteos, auditoría y datos clave verificados.
- [ ] Migraciones pendientes ensayadas en la restauración; segunda ejecución sin pendientes y sin regresión de datos.
- [ ] SHA y ausencia de votación activa reconfirmados; migraciones aplicadas a Neon con conexión directa y segunda ejecución sin pendientes.
- [ ] Render desplegado manualmente con **ese SHA**, estado `live`; `/health`, recursos estáticos, login+OTP, permisos por rol y flujos críticos de solo lectura comprobados.
- [ ] Resultado, deploy ID, fecha, responsables y eventual contingencia registrados; aviso PWA emitido solo cuando no interrumpa una planilla.

No ejecutar tests de API ni votos de prueba sobre Neon o eventos reales. Un deploy fallido no habilita revertir migraciones ni sobrescribir la base: seguir la contingencia siguiente.

## Contingencia

Fallo de código: rollback a último build compatible; **no revertir migraciones** automáticamente. Fallo de datos: preservar Neon, restaurar backup en otra base vacía y verificar antes de cambiar conexión. Si `main` avanzó entre ensayo y despliegue, parar y revalidar. Rotación de Better Auth exige procedimiento de recifrado/sesiones; los antecedentes de Gmail OAuth están en [DEPLOYMENT.md](historico/DEPLOYMENT.md) y [VERIFICACION-GOOGLE.md](historico/VERIFICACION-GOOGLE.md); verificar vigencia antes de operar.

## Último corte comprobado

CI `Pilot checks` run `39293419774` correcto; backup final privado SHA-256 `60060685c45476f28ac0ebf2b6e582be85adc5ab16e0f171f9336e6cbb3c0aba`, restauración y migraciones 090/095 ensayadas dos veces; Render deploy `dep-dbblgmrncjis7394v130` LIVE. Smoke HTTP público y logo correcto; verificación de login+OTP y roles con usuario real quedó pendiente. No reutilizar el backup como si fuera actual.
