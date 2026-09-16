# AGENTS.md — Carnavales 2027

## Proyecto

**Carnavales 2027** es un sistema web de votación digital para comparsas de carnaval.

La solución debe funcionar como una aplicación web responsive, con una **PWA para jurados**, backend API y persistencia en PostgreSQL.

Actores principales:

* **Jurado:** registra puntuaciones.
* **Fiscal:** supervisa el desarrollo de la votación y consulta resultados.
* **Escribano:** certifica actas y participa en penalizaciones/auditoría.
* **Administrador:** configura el concurso, usuarios, comparsas, rubros y operación general.

El sistema debe priorizar:

* integridad de votos;
* trazabilidad;
* resiliencia ante cortes de conectividad;
* operaciones idempotentes;
* seguridad;
* auditoría;
* facilidad de uso durante el evento.

---

## Estructura principal

```text
carnavales2027/
├── api/            # Backend y acceso a PostgreSQL
├── client/         # Frontend React / PWA
├── docs/           # Documentación funcional y técnica
├── AGENTS.md
└── README.md
```

Las instrucciones específicas de cada módulo se encuentran en:

```text
api/AGENTS.md
client/AGENTS.md
```

Las reglas definidas en un `AGENTS.md` más específico prevalecen para los archivos contenidos dentro de ese directorio.

---

# 1. Fuentes de verdad

Antes de modificar comportamiento funcional, consultar la documentación del proyecto.

Documentos principales:

1. Especificación de Requisitos Funcionales.
2. Reglas de Negocio y Reglamento de Votación.
3. Arquitectura Técnica.
4. Modelo de Datos / ERD.
5. Especificación de API.
6. Matriz de Roles y Permisos.
7. Especificación de Offline y Sincronización.
8. Seguridad y Auditoría.

No inventar reglas de negocio que estén marcadas como pendientes.

Especialmente, no asumir reglas para:

* desempates;
* impugnaciones;
* votos fuera de término;
* excepciones reglamentarias no documentadas.

Cuando una implementación requiera una regla inexistente, dejar claramente identificado el bloqueo en lugar de decidirla silenciosamente.

---

# 2. Reglas fundamentales del dominio

## Jurados

El Jurado elige una noche creada después de autenticarse.

El backend debe validar que la noche exista y que la comparsa activa pertenezca a esa noche antes de aceptar votos o cierres.

No se requiere asignación administrativa de jurados para votar. El jurado autenticado elige una noche creada y el backend valida que la comparsa pertenezca a esa noche.

---

## Comparsas

Las comparsas son administradas por noche.

El Administrador puede crear, ver, modificar, ordenar y borrar comparsas. Usuarios, noches, comparsas e ítems solo se borran físicamente si no tienen historial asociado; si hay votos, cierres, penalizaciones, actas, sesiones, auditoría u otras dependencias, el backend debe bloquear el borrado para preservar evidencia.

Toda acción administrativa sensible de modificación, borrado, apertura/cierre o guardado de orden debe requerir confirmación explícita en modal antes de llamar a la API.

La interfaz de votación presenta las comparsas activas correspondientes a la noche elegida por el jurado.

---

## Ítems y subítems

Los ítems pueden tener subítems.

Un ítem padre con hijos:

* no recibe una puntuación manual;
* obtiene su resultado mediante la suma de sus hijos.

Un ítem sin hijos es puntuable directamente.

---

## Puntuaciones

Las notas válidas actualmente son:

```text
0, 1, 2, 3, 4, 5
```

Una puntuación confirmada debe considerarse **inmutable**.

No implementar operaciones convencionales de edición o eliminación de votos confirmados.

Una anomalía o impugnación debe resolverse mediante mecanismos auditables, nunca mediante modificación silenciosa del voto original.

---

## Totales

No existe descarte automático de nota máxima o mínima en las reglas actualmente confirmadas.

El total de un ítem entre jurados es la suma de las puntuaciones correspondientes.

Los ítems padre se calculan mediante la suma de sus subítems.

Las penalizaciones confirmadas descuentan puntos del total correspondiente según las reglas de negocio.

---

# 3. Integridad y consistencia

Toda operación crítica debe estar protegida tanto como sea razonable en:

1. frontend;
2. API;
3. base de datos.

La API es la autoridad funcional.

PostgreSQL es la autoridad final respecto de integridad persistida.

No depender exclusivamente de validaciones del frontend.

---

# 4. Identificadores

Para recursos persistidos en PostgreSQL pueden utilizarse identificadores definidos por el modelo de datos.

Las operaciones originadas en dispositivos que puedan ser reenviadas por problemas de conectividad deben utilizar un identificador estable generado en cliente, por ejemplo:

```text
operationId / UUID
```

Ese identificador debe permitir procesamiento idempotente.

Nunca utilizar timestamps como único mecanismo de deduplicación.

---

# 5. Resiliencia de conectividad

El escenario normal es online, pero durante el carnaval pueden existir:

* pérdida de Wi-Fi;
* pérdida de datos móviles;
* timeouts;
* reinicio del navegador;
* suspensión del dispositivo;
* reintentos de requests.

La PWA del jurado opera online-first: una nota o cierre solo queda confirmado cuando la API acepta la operación o reconoce un replay idempotente equivalente.

Si no hay conexión, timeout o API disponible, el frontend no debe confirmar localmente: debe mostrar un error claro y permitir reintento manual.

IndexedDB queda para cache de sesión/contexto y recuperación visual; no debe ejecutarse una cola automática agresiva de votos desde el flujo principal.

---

# 6. Seguridad

Aplicar mínimo:

* HTTPS en producción;
* autenticación fuerte;
* segundo factor mediante código cuando corresponda;
* expiración de códigos;
* rate limiting;
* autorización por rol;
* validación de ownership/contexto;
* validación de input;
* manejo seguro de sesiones;
* protección de secretos;
* logs sin credenciales ni tokens;
* auditoría de operaciones sensibles.

Nunca confiar en campos de rol, usuario o permisos enviados por el cliente.

La identidad y autorización deben derivarse de la sesión autenticada.

---

# 7. Auditoría

Las operaciones críticas deben generar evidencia auditable.

Ejemplos:

* autenticación;
* emisión de voto;
* cierre de comparsa;
* cierre de noche;
* penalización;
* anulación de penalización;
* generación de acta;
* certificación;
* operaciones administrativas sensibles.

Los registros de auditoría deben tratarse como append-only.

No escribir secretos, tokens de sesión, códigos 2FA ni información sensible innecesaria dentro del audit log.

---

# 8. Actas y documentos oficiales

Las actas pueden generar representaciones tales como:

* PDF;
* CSV.

Cuando una representación sea considerada oficial debe poder verificarse mediante hash criptográfico, actualmente previsto con **SHA-256**.

El hash debe calcularse sobre los bytes exactos del archivo generado.

Una nueva versión debe producir un nuevo archivo y registro; no sobrescribir silenciosamente un documento previamente emitido.

---

# 9. Código

Priorizar:

* TypeScript cuando forme parte del stack del módulo;
* funciones pequeñas;
* nombres explícitos;
* separación por responsabilidades;
* validaciones centralizadas;
* manejo consistente de errores;
* ausencia de duplicación innecesaria.

Evitar abstraer prematuramente.

No introducir frameworks o dependencias relevantes sin necesidad concreta.

---

# 10. Errores

Los errores esperables deben ser controlados y devolver respuestas consistentes.

Distinguir al menos:

* error de validación;
* no autenticado;
* no autorizado;
* recurso inexistente;
* conflicto;
* operación duplicada/idempotente;
* regla de negocio incumplida;
* error interno.

No exponer:

* stack traces;
* SQL;
* secretos;
* detalles internos de infraestructura

en respuestas de producción.

---

# 11. Testing

Toda funcionalidad crítica debe acompañarse de pruebas adecuadas.

Priorizar cobertura sobre:

* reglas de puntuación;
* permisos;
* idempotencia;
* concurrencia;
* inmutabilidad;
* selección de noche por Jurado;
* conectividad;
* cierres;
* penalizaciones;
* generación/verificación de documentos.

Los tests deben comprobar comportamiento, no detalles accidentales de implementación.

---

# 12. Cambios de base de datos

No modificar el esquema productivo mediante SQL ad hoc dentro del código de aplicación.

Todo cambio estructural debe quedar representado mediante el mecanismo de migraciones elegido por el proyecto.

Las migraciones deben ser:

* versionadas;
* reproducibles;
* revisables;
* compatibles con el historial del repositorio.

---

# 13. Git

Mantener commits pequeños y coherentes.

No incluir:

```text
.env
.env.*
node_modules/
dist/
build/
coverage/
*.log
```

ni archivos con secretos.

No reescribir archivos ajenos al objetivo de la tarea sin necesidad.

---

# 14. Definition of Done mínima

Una tarea se considera técnicamente completa cuando, según corresponda:

* cumple los requisitos funcionales;
* respeta las reglas de negocio;
* respeta RBAC;
* valida entradas;
* maneja errores;
* preserva integridad;
* incluye pruebas;
* no introduce secretos;
* mantiene auditoría cuando corresponde;
* mantiene la documentación/API sincronizada si cambió el contrato.

---

# 15. Prioridad de decisión

Ante conflicto entre implementación y documentación:

1. preservar integridad de los votos;
2. preservar evidencia y auditoría;
3. respetar las reglas de negocio confirmadas;
4. respetar permisos;
5. mantener compatibilidad de API;
6. mantener experiencia de usuario.

No sacrificar integridad o trazabilidad por conveniencia de implementación.
