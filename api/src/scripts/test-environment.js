// Preload de `npm test` y `npm run db:test`.
//
// `dotenv/config` carga `api/.env`, donde `DATABASE_URL` apunta a la base de
// desarrollo y `TEST_DATABASE_URL` a la base descartable de pruebas. Los tests
// nunca deben escribir en desarrollo, aunque el operador olvide exportar
// `DATABASE_URL=TEST_DATABASE_URL` en la terminal. `pretest` ya exige que
// `TEST_DATABASE_URL` exista; acá se fuerza su uso en todos los procesos hijos.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

// La suite completa asume el contexto de pruebas. Los casos puntuales que
// necesitan simular production/development lo establecen dentro del propio test.
process.env.NODE_ENV = "test";
