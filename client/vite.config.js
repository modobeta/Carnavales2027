import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/tests/setup.js"],
    // Las páginas con más árboles de componentes superan los 5 s por defecto
    // cuando la suite corre en paralelo en equipos lentos.
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
