## Resultado

Preparar un piloto de hasta 30 usuarios detrás de una misma IP, preservando los datos existentes. Express sirve el cliente compilado y la API bajo un único origen HTTPS de Render Free; Neon aloja PostgreSQL y Gmail API envía OTP, invitaciones y recuperación sin dominio propio.

Incluye transporte común sin dependencias nuevas, configuración de producción validada, límites por cuenta/token, aislamiento de errores SSE posteriores al commit, service worker versionado, Blueprint manual, CI y restauración conservadora en base vacía.

## Validación

Consultar `specs/029-piloto-produccion/validation.md`: pruebas API/BD y cliente, build, ensayo de restauración y comprobación local de actualización PWA. Los tests de Gmail simulan el proveedor; no prueban recepción real.

## Operación pendiente

Configurar OAuth del remitente, destino Neon vacío y secretos en Render. Publicar y verificar HTTPS, correo real, reinicio y recorridos del piloto. No ejecutar seeds ni bootstrap en datos importados. Despliegues manuales; una instancia SSE. Procedimiento completo en `DEPLOYMENT.md`.
