# Plan

1. Registrar contrato, rama feat/piloto-produccion y excepciones acotadas de gitignore.
2. Implementar transporte común smtp/gmail/console (solo desarrollo), validación de producción, servidor estático de mismo origen y Blueprint manual.
3. Aplicar límites por identidad/token y cupos colectivos; conservar bloqueo OTP nativo.
4. Aislar listeners y separar difusión del catch transaccional. Generar SW versionado desde dist, sin skipWaiting/claim forzados.
5. Agregar CI Node22/Postgres18 y pruebas unitarias/HTTP/integración; manual con backup pg_dump18 y restore atómico sin DROP.
6. Backup real verificado, restauración de ensayo aislada, suite API/BD y cliente/build.
7. Tras cuentas/credenciales y publicación manual del commit, importar destino vacío, desplegar manualmente y validar URL, correo, roles, SSE y PWA.

Build Render: npm ci --prefix api && npm ci --prefix client --include=dev && npm run build --prefix client. Start: npm start --prefix api. Sin migraciones durante build.
