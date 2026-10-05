# Carnavales2027 — textos públicos propuestos

**Texto aprobado por Martín Juncos el 05/10/2026. Páginas publicables: `client/public/acerca.html` y `client/public/privacidad.html`.**

Este documento prepara la página de presentación y la política de privacidad para la configuración de Google OAuth. No constituye una verificación de Google ni una certificación de cumplimiento legal.

## Página de presentación

Carnavales2027 es una aplicación web de gestión y votación de concursos de comparsas. Permite configurar eventos, participantes, rubros e ítems; asignar jurados; registrar puntuaciones; supervisar la competencia y consultar resultados publicados.

El acceso a las funciones internas requiere una cuenta autorizada y depende del rol y las asignaciones de cada persona. La aplicación utiliza correos transaccionales para invitaciones, recuperación de acceso y códigos de verificación.

Responsable: **Martín Juncos**. Contacto: **prof.mcjuncos@gmail.com**.

Enlaces previstos: ingresar a la aplicación, resultados públicos y política de privacidad.

## Política de privacidad

### Responsable y contacto

Martín Juncos es el responsable de Carnavales2027 y del tratamiento de los datos de la aplicación. Podés contactarlo en **prof.mcjuncos@gmail.com** para consultas sobre privacidad o solicitudes relacionadas con tus datos.

### Datos que se tratan y finalidad

La aplicación trata datos de identificación y cuenta, como nombre, correo electrónico y documento cuando se solicita; credenciales protegidas, sesiones, roles y asignaciones; y datos de la competencia, como puntuaciones, confirmaciones, penalizaciones, actas y registros de auditoría. También procesa información técnica necesaria para el acceso y la seguridad, como direcciones IP.

Estos datos se usan para gestionar usuarios y eventos, verificar el acceso, registrar y supervisar la votación, emitir resultados y conservar evidencia de las operaciones. Los códigos de verificación tienen una vigencia limitada.

### Uso de Google y Gmail

Carnavales2027 utiliza la cuenta de Gmail autorizada por su responsable para enviar correos transaccionales. Solicita el permiso `gmail.send`, que permite enviar mensajes; no solicita leer la bandeja de entrada ni los contactos de los usuarios.

Google procesa las direcciones de los destinatarios y el contenido de los mensajes enviados, que pueden incluir invitaciones, enlaces de recuperación y códigos de acceso. Las credenciales OAuth de la cuenta remitente se mantienen en la configuración privada del servidor y se utilizan para autorizar esos envíos; no se publican en el navegador ni en el repositorio.

### Proveedores y acceso a los datos

La aplicación utiliza Render para alojamiento, Neon para la base de datos PostgreSQL y Google para el envío de correo. Estos proveedores procesan los datos necesarios para prestar esos servicios y pueden hacerlo fuera del país del usuario.

Las funciones internas restringen el acceso según el rol y el contexto autorizado. Los resultados que se publiquen pueden ser consultados públicamente.

### Almacenamiento en el dispositivo

La aplicación utiliza mecanismos del navegador para mantener la sesión y guardar información de contexto o recuperación visual. El caché local no equivale a la confirmación de un voto: la aceptación de la API es necesaria para confirmarlo. Se recomienda cerrar sesión al terminar, especialmente en dispositivos compartidos.

### Conservación y solicitudes

Los datos se conservan para operar el servicio y preservar la integridad y trazabilidad de la competencia. Los votos confirmados y su evidencia no se modifican ni eliminan mediante las operaciones ordinarias de la aplicación.

Podés solicitar acceso, corrección o eliminación de tus datos escribiendo al correo de contacto. Cada solicitud se evaluará teniendo en cuenta la identidad del solicitante y las necesidades de conservación de evidencia. No se promete eliminación automática de votos ni de registros de auditoría.

### Cambios

Las modificaciones de esta política se publicarán en esta página con su fecha de actualización.

## Pendientes antes de publicar

- Aprobación del responsable recibida el 05/10/2026 sobre el texto completo, su nombre y el correo público de contacto.
- Definir una política operativa de conservación más precisa; este borrador no inventa plazos ni garantiza cumplimiento normativo.
- Publicar presentación y privacidad como páginas accesibles sin iniciar sesión, en el mismo dominio de la aplicación, y enlazarlas entre sí.
- Completar los campos de Google con las URLs reales. Si Google exige condiciones de uso, verificación de dominio o revisión adicional, resolver ese requisito sin declarar verificaciones inexistentes.
- Confirmar el cambio de OAuth a producción antes de ejecutarlo. Después, obtener una autorización nueva y verificar el envío de OTP; el cambio no garantiza que un token nunca se revoque o caduque por otras causas.
