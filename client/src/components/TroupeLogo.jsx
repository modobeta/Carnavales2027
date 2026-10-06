import { useState } from "react";
import { troupeLogoUrl } from "../api/troupes.js";

/**
 * TroupeLogo — logo de comparsa cargado desde la API con la sesión vigente
 * (Spec 029). No renderiza nada si la comparsa no tiene logo o si la imagen
 * falla, para no dejar íconos rotos en la interfaz.
 */
export function TroupeLogo({ troupeId, hasLogo, sha256, alt = "", className = "" }) {
  const [failed, setFailed] = useState(false);

  if (!hasLogo || !troupeId || failed) return null;

  return (
    <img
      className={`troupe-logo ${className}`.trim()}
      src={troupeLogoUrl(troupeId, sha256)}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
