import { RequireAnyRole } from "./RequireAnyRole.jsx";
import { canAccessAdminArea } from "./role-routes.js";

// La interfaz limita la navegación a ADMIN; la API mantiene la autoridad final.
export function RequireAdminArea({ session, children }) {
  return <RequireAnyRole session={session} isAllowed={canAccessAdminArea} deniedMessage="No tenés permisos de administración">{children}</RequireAnyRole>;
}
