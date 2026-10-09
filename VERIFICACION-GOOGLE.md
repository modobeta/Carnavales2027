# Google OAuth — preparación de verificación

Estado: OAuth **En producción**, **propiedad del sitio verificada**, pero **marca y acceso a datos no verificados**. No se ha enviado una solicitud completa de revisión. El token de Gmail fue renovado el 06/10/2026 y actualizado en Render; correo de prueba aceptado por Gmail. Falta confirmar login + OTP público. Recuperación e incidente de despliegue documentados en `DEPLOYMENT.md`.

## Hallazgos de la consola

- La página principal no figura como propiedad acreditada del responsable. Google pide verificarla y esperar **24 horas** antes de reintentar.
- La revisión automática no pudo confirmar el propósito/cumplimiento de la aplicación. Pide describir claramente su finalidad y confirmar que no utiliza las APIs de Google para imágenes íntimas no consentidas generadas con IA. Esto es un resultado automático, no evidencia de que la aplicación tenga esa funcionalidad.
- La revisión de permisos sensibles está bloqueada hasta verificar y publicar la marca.

## Texto propuesto para ampliar la presentación

Carnavales2027 es una herramienta de gestión de competencias de comparsas y registro de puntuaciones por jurados autorizados. No es un servicio de generación de imágenes ni utiliza las APIs de Google para crear imágenes íntimas, contenido sexual o contenido generado con inteligencia artificial.

La integración con Google se limita al envío de correos transaccionales desde la cuenta de Gmail autorizada por el responsable: invitaciones, recuperación de acceso y códigos de verificación. Los participantes ingresan con las cuentas de la aplicación; no se les solicita acceso a sus buzones de Gmail. La aplicación no lee mensajes ni contactos de Gmail.

## Justificación propuesta del permiso

`https://www.googleapis.com/auth/gmail.send` permite enviar los correos transaccionales necesarios para autenticar e invitar a los participantes. El backend usa `users.messages.send` sobre la cuenta remitente autorizada. Un permiso de identidad básica no permite enviar mensajes. No se solicitan permisos de lectura, modificación o eliminación del buzón.

## Evidencia pendiente

El responsable aprobó publicar la aclaración y acreditar la propiedad con su cuenta. Chrome bloqueó la descarga del archivo HTML; se eligió la alternativa oficial de etiqueta meta, añadida a `client/index.html` y `client/public/acerca.html`. La etiqueta de verificación es pública, no es un secreto OAuth. Debe conservarse para mantener la acreditación.

### Resultado del despliegue y acreditación

- Commit `2e4cb3cf65022a0df15d3c89034b3518a8858180`, rama `deploy/privacidad-oauth`; Render `dep-db23fbom7kps73db7ev0` **live**. Presentación ampliada comprobada desde la URL pública. Seis pruebas de metadatos/información pública pasaron; no se ejecutó build local.
- Search Console confirmó **Propiedad verificada — Etiqueta HTML**, con la cuenta autorizada `prof.mcjuncos@gmail.com`. Se pulsó Verificar el 05/10/2026 aproximadamente a las 23:51 UTC; se leyó la confirmación al retomar el 06/10 a las 05:00 UTC, después de una interrupción por cuota de herramientas.
- Google indicó esperar 24 horas tras acreditar la propiedad. Como margen conservador, reintentar la marca **a partir del 07/10/2026 a las 02:00 de Argentina (05:00 UTC)**, 24 horas desde la confirmación observada. No se programó un reintento automático.
- Acreditar el sitio no verifica por sí mismo la marca ni `gmail.send`. La renovación independiente del token se completó el 06/10; no declarar verificado el flujo OTP público hasta probarlo.

1. Propiedad acreditada de `https://carnavales2027-piloto.onrender.com/`. Conservar la etiqueta en futuros despliegues; no confundir agregar un dominio autorizado con verificar su propiedad.
2. Aclaración del propósito publicada. Esperar el plazo indicado arriba antes de reintentar.
3. Revisar la configuración de Condiciones del Servicio: actualmente apunta a privacidad, que no constituye un documento de términos. Ese campo es opcional según la documentación; no inventar condiciones ni declarar su aceptación.
4. Reintentar verificación de marca. Solo declarar corregidos los problemas que efectivamente se hayan resuelto.
5. Preparar una demostración real en inglés del consentimiento OAuth (nombre y client ID visibles, sin secretos) y del envío transaccional. No simular un flujo exitoso ni incluir códigos OTP, tokens o datos de terceros en el video. Obtener aprobación antes de publicar el video y presentar declaraciones de cumplimiento.
6. Solicitar revisión de `gmail.send` cuando Google habilite el trámite; conservar las respuestas del equipo de revisión. La aprobación y sus plazos dependen de Google.

## Fuentes oficiales

- [Verificación de permisos sensibles](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification).
- [Verificación de marca](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification).
- [Cumplimiento de políticas OAuth](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance).

## Precaución de despliegue

Mantener la versión productiva aislada: `2e4cb3c` en la rama `deploy/privacidad-oauth`. No desplegar el último commit de main: incluye migraciones y cambios ajenos aún pendientes de evaluar. No tocar votos, auditoría, `BETTER_AUTH_SECRET` ni 2FA para completar esta verificación.
