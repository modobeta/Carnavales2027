# Clarificaciones

- Presupuesto cero: Render Free + Neon Free + Gmail API. El usuario descarta Brevo por problemas de verificación telefónica. Gmail requiere autorización OAuth privada del remitente; no garantiza evitar verificaciones de seguridad de Google. Se aceptan suspensión y cuotas para piloto; no SLA.
- Base actual PostgreSQL 18: 11.8 MB, 1 evento, 0 planillas al inspeccionarla. Una pausa de escrituras precede el backup final. La copia local queda preservada.
- Mantener BETTER_AUTH_SECRET en el traslado para datos cifrados. Credenciales exclusivamente en archivos ignorados/paneles.
- Límite de invitación por token: 10 solicitudes/15 minutos, compartido entre inspect y accept. Login usa hash HMAC de correo normalizado, no correo en claro. Límites en memoria: una instancia, reinicio restablece ventanas; bloqueo OTP nativo persiste en BD.
- Reglas internas Better Auth de login y two-factor: 100/minuto/IP/ruta. Cuenta OTP se obtiene del callback autenticado sendOTP, nunca de un email suministrado por el cliente.
- Sin predeploy gratuito: migraciones controladas manualmente, fuera del build y del arranque.
- No copiar documentación histórica de otro repositorio ni reinterpretar capacidades de dominio.
