# Spec 029 - Piloto público gratuito

Aprobada por el responsable el 2026-09-15 mediante el plan de esta conversación. Destino: modobeta/Carnavales2027, rama main; hasta 30 usuarios en una Wi-Fi, datos existentes, sin dominio propio. No habilita votación real.

- RF-P01: un proceso Node 22 en Render Free sirve cliente y API bajo HTTPS, con CSP diferenciada y configuración validada.
- RF-P02: Neon PostgreSQL 18 conserva identidades, configuración, auditoría y datos existentes mediante backup verificado/restauración en destino vacío; no seeds ni bootstrap.
- RF-P03: Gmail API HTTPS entrega OTP, invitaciones y recuperación desde una cuenta autorizada por OAuth con alcance gmail.send; SMTP local sigue disponible. Producción nunca imprime secretos. No se utiliza Brevo ni se necesita un dominio propio.
- RF-P04: IP compartida admite 300 solicitudes sensibles/15 minutos, 300 generales/minuto; login 10 por cuenta/15 minutos, OTP 3 envíos por cuenta/15 minutos y bloqueo nativo de 10 fallos. Invitaciones limitadas tambi?n por token. Respuestas 429 con reintento.
- RF-P05: errores de suscriptores posteriores a COMMIT no alteran escrituras ni disparan reintentos; SW cambia con el build y permite actualizaci?n segura.
- RF-P06: CI reproducible, manual de despliegue/respaldo y validación pública real antes de declarar entrega.

Fuera de alcance: reglas de puntuación, roles, liberación de resultados, nuevas dependencias de runtime, push/merge automático y servicios pagos.
