import { apiRequest } from "./http.js";

/**
 * Logo de comparsa (Spec 029). El binario vive en PostgreSQL y la API lo
 * expone sólo por `/api/v1/troupes/:troupeId/logo`, por lo que este módulo
 * concentra las tres operaciones con el endpoint existente:
 *   - PUT    (ADMIN)   subir o reemplazar el logo.
 *   - DELETE (ADMIN)   quitar el logo.
 *   - URL autenticada  para que el navegador lo cargue con la sesión vigente.
 */

export const TROUPE_LOGO_ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml";
export const TROUPE_LOGO_MAX_BYTES = 1048576;

const ALLOWED_TYPES = new Set(TROUPE_LOGO_ACCEPT.split(","));

/**
 * Validación de orientación en cliente. La API vuelve a validar la firma real
 * de los bytes: acá sólo evitamos un viaje innecesario por errores evidentes.
 */
export function validateTroupeLogoFile(file) {
  if (!file) return "Seleccioná un archivo de imagen.";
  if (!ALLOWED_TYPES.has(file.type)) return "El logo debe ser PNG, JPG, WebP o SVG.";
  if (file.size > TROUPE_LOGO_MAX_BYTES) return "El logo no puede superar 1 MB.";
  return null;
}

export function uploadTroupeLogo(troupeId, file) {
  return apiRequest(`/api/v1/troupes/${troupeId}/logo`, {
    method: "PUT",
    headers: { "content-type": file.type },
    body: file,
  });
}

export function removeTroupeLogo(troupeId) {
  return apiRequest(`/api/v1/troupes/${troupeId}/logo`, { method: "DELETE" });
}

/**
 * URL del logo versionada por hash. El `?v=` fuerza recarga cuando el logo
 * cambia aunque la ruta sea la misma (la API cachea por ETag/SHA-256).
 */
export function troupeLogoUrl(troupeId, sha256) {
  const base = `/api/v1/troupes/${troupeId}/logo`;
  return sha256 ? `${base}?v=${encodeURIComponent(sha256)}` : base;
}
