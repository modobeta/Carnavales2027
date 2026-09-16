# AGENTS.md — API

Estas reglas complementan el `AGENTS.md` ubicado en la raíz del repositorio.

Aplican a todo el código dentro de:

```text
api/
```

---

# 1. Responsabilidad

La API es responsable de:

* autenticación;
* autorización;
* reglas de negocio;
* validación;
* persistencia;
* idempotencia;
* concurrencia;
* auditoría;
* cálculo de resultados;
* penalizaciones;
* generación/verificación de actas;
* sincronización de operaciones provenientes de clientes.

El frontend nunca debe considerarse una frontera de seguridad.

---

# 2. Stack

Backend previsto:

```text
Node.js
Express
PostgreSQL
```

Utilizar TypeScript si el proyecto ya está configurado para ello.

No introducir otro framework backend o ORM sin una necesidad técnica aprobada.

---

# 3. Arquitectura

Preferir una separación similar a:

```text
src/
├── config/
├── routes/
├── controllers/
├── services/
├── repositories/
├── middleware/
├── validators/
├── domain/
├── errors/
├── security/
├── audit/
└── utils/
```

Responsabilidades:

* **routes:** definición HTTP.
* **controllers:** adaptación request/response.
* **services:** casos de uso y reglas de negocio.
* **repositories:** acceso a PostgreSQL.
* **validators:** validación de inputs.
* **middleware:** auth, RBAC, errores, request context.
* **domain:** lógica del dominio reutilizable.
* **audit:** construcción/persistencia de eventos auditables.

Evitar colocar SQL y reglas de negocio directamente dentro de controllers.

---

# 4. API HTTP

Mantener contratos predecibles.

Ejemplo:

```json
{
  "data": {},
  "meta": {}
}
```

Errores:

```json
{
  "error": {
    "code": "VOTE_ALREADY_CONFIRMED",
    "message": "La puntuación ya fue confirmada.",
    "requestId": "..."
  }
}
```

Los códigos de error deben ser estables y utilizables por el frontend.

---

# 5. Autenticación

La API debe ser la única autoridad respecto de identidad.

Nunca aceptar como confiables valores enviados por cliente como:

```json
{
  "userId": 123,
  "role": "admin"
}
```

para determinar permisos.

Obtener identidad y rol desde la sesión/token validado.

El login debe contemplar el mecanismo 2FA definido por el proyecto.

El login operativo actual valida:

```text
nombre + email + DNI
```

El DNI actúa como credencial operativa del usuario; no introducir una contraseña separada sin actualizar primero la documentación funcional y de seguridad.

Los códigos temporales:

* deben expirar;
* deben ser de un solo uso;
* deben limitar intentos;
* no deben almacenarse en logs;
* no deben devolverse mediante la API.

En desarrollo, `OTP_DEV_LOG=true` puede escribir el último OTP en `storage/dev-otp.txt` y mostrarlo en consola para pruebas locales. Con `OTP_DEV_LOG=false`, la prioridad de entrega es Resend si `RESEND_API_KEY` está configurada; si no, SMTP.

---

# 6. Autorización

Aplicar RBAC en servidor.

Roles contemplados:

```text
jurado
fiscal
escribano
admin
```

Además del rol, validar contexto.

Ejemplo:

Un jurado autenticado puede elegir una noche creada y votar comparsas activas de esa noche.

También debe verificarse que:

```text
jurado
→ seleccionó una noche existente
→ la comparsa activa pertenece a esa noche
```

---

# 7. Selección de noche

La noche puede ser seleccionada por el jurado desde el catálogo creado por Administración.

Resolver la autorización crítica validando en servidor que la noche exista y que la comparsa activa pertenezca a esa noche. El Administrador no asigna jurados como parte del flujo operativo actual.

---

# 8. Registro de puntuaciones

Una puntuación confirmada es crítica.

La operación debe ser:

* validada;
* autenticada;
* autorizada;
* idempotente;
* atómica;
* auditable;
* inmutable.

Datos mínimos conceptuales:

```text
operationId
jurado
comparsa
item
valor
fecha/hora servidor
```

`operationId` debe ser generado por el cliente y enviado en cada reintento de la misma operación.

---

# 9. Idempotencia

Dos requests con el mismo `operationId` para la misma operación lógica no deben crear dos votos.

Caso:

```text
POST voto
→ servidor inserta
→ respuesta se pierde
→ cliente reintenta
```

El segundo request debe reconocer que la operación ya fue procesada.

Si el payload es compatible, devolver el resultado existente.

Si el mismo identificador pretende representar datos diferentes, responder con conflicto y registrar el evento para diagnóstico.

---

# 10. Inmutabilidad

Después de confirmar una puntuación:

```text
UPDATE puntuaciones
DELETE puntuaciones
```

no deben formar parte del flujo normal del sistema.

La protección debe existir también en PostgreSQL mediante constraints, permisos, triggers u otro mecanismo apropiado definido por el esquema.

Una corrección administrativa nunca debe sobrescribir silenciosamente evidencia histórica.

---

# 11. Validación de votos

Antes de insertar una puntuación validar como mínimo:

1. usuario autenticado;
2. rol jurado;
3. noche existente y abierta;
4. comparsa activa;
5. comparsa perteneciente a esa noche;
6. ítem válido;
7. ítem puntuable;
8. valor dentro de rango;
9. ausencia de puntuación previa;
10. estado del concurso compatible;
11. operación idempotente válida.

No confiar en validaciones realizadas previamente por React.

---

# 12. Transacciones

Utilizar transacciones para operaciones que afecten múltiples entidades relacionadas.

Ejemplos:

* registrar voto + auditoría;
* aplicar penalización + auditoría;
* cerrar comparsa;
* cerrar noche;
* generar/certificar acta;
* cambios administrativos críticos.

Una operación no debe quedar parcialmente aplicada.

---

# 13. Penalizaciones

Las penalizaciones confirmadas forman parte de la evidencia del concurso.

No eliminarlas físicamente para representar una anulación.

Preferir estados/eventos que preserven:

* penalización original;
* actor;
* motivo;
* puntos;
* timestamp;
* eventual anulación;
* actor de la anulación;
* motivo de la anulación.

No crear reglas de motivos o límites que todavía no estén definidas en el reglamento.

---

# 14. Cálculos

El backend es la autoridad de resultados oficiales.

No persistir valores derivados si pueden calcularse de forma segura y eficiente, salvo que exista una razón explícita de snapshot/auditoría.

Reglas confirmadas:

```text
item padre = suma de hijos
```

```text
total item = suma de notas de jurados
```

```text
total final = total general - penalizaciones aplicables
```

No aplicar descarte de máximos/mínimos sin una modificación expresa del reglamento.

---

# 15. Auditoría

Toda acción crítica debe generar un evento.

El evento debería incluir cuando corresponda:

```text
actorUserId
actorRole
action
entityType
entityId
requestId
timestamp
metadata
```

No incluir:

* contraseña;
* OTP;
* token;
* cookie;
* authorization header;
* secretos.

El audit log debe ser append-only.

---

# 16. PostgreSQL

Usar consultas parametrizadas.

Nunca concatenar input de usuario dentro de SQL.

Incorrecto:

```js
`SELECT * FROM users WHERE email = '${email}'`
```

Correcto conceptualmente:

```js
db.query(
  'SELECT * FROM users WHERE email = $1',
  [email]
)
```

Mantener constraints importantes dentro de la base de datos siempre que sea viable.

---

# 17. Errores

Crear una taxonomía estable de errores.

Ejemplos:

```text
VALIDATION_ERROR
AUTH_REQUIRED
INVALID_OTP
OTP_EXPIRED
RATE_LIMITED
FORBIDDEN
JUROR_NOT_ASSIGNED
NIGHT_CLOSED
COMPARSA_CLOSED
INVALID_SCORE
VOTE_ALREADY_CONFIRMED
IDEMPOTENCY_CONFLICT
RESOURCE_NOT_FOUND
INTERNAL_ERROR
```

Evitar devolver errores PostgreSQL directamente al usuario.

---

# 18. Rate limiting

Aplicar especialmente en:

* login;
* solicitud de OTP;
* verificación OTP;
* recuperación de acceso;
* endpoints susceptibles de abuso.

Los límites deben distinguir entre abuso y uso legítimo durante el evento.

---

# 19. Logging

Cada request relevante debería disponer de un:

```text
requestId
```

para correlacionar:

```text
frontend
→ API
→ audit log
→ errores
```

Nunca loguear secretos.

---

# 20. Testing obligatorio

Priorizar:

### Unitarios

* cálculo de totales;
* ítems padre;
* permisos;
* validaciones;
* penalizaciones.

### Integración

* PostgreSQL;
* constraints;
* transacciones;
* idempotencia;
* inmutabilidad.

### API

* autenticación;
* RBAC;
* emisión de voto;
* cierre;
* sincronización.

### Concurrencia

Especialmente:

* selección concurrente de noche/voto;
* doble confirmación de voto;
* reintentos simultáneos.

---

# 21. Actas

El backend debe generar el contenido oficial.

Cuando se genere una representación:

```text
PDF
CSV
```

calcular:

```text
SHA-256(bytes_del_archivo)
```

Guardar suficiente metadata para verificar posteriormente:

* tipo;
* versión;
* hash;
* timestamp;
* concurso/noche correspondiente;
* usuario que generó;
* usuario que certificó cuando corresponda.

No sobrescribir archivos oficiales previos.

---

# 22. Seguridad de respuestas

Nunca devolver al cliente:

* password hashes;
* secretos internos;
* OTP;
* tokens de terceros;
* información de conexión;
* stack traces;
* SQL interno.

Aplicar DTOs explícitos cuando resulte conveniente.

---

# 23. Antes de completar una tarea

Verificar:

* contrato API;
* regla de negocio;
* autorización;
* transacción;
* idempotencia;
* auditoría;
* test;
* impacto en sincronización.

Si la tarea modifica el contrato HTTP, actualizar también la especificación de API.
