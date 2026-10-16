import { RequireAnyRole } from "./RequireAnyRole.jsx";
import { canAccessAdminArea } from "./role-routes.js";

// Admite ADMIN global o ADMIN_EVENT vigente. Solo decide qué se renderiza: la API autoriza cada solicitud.
export function RequireAdminArea({ session, children }) {
  return <RequireAnyRole session={session} isAllowed={canAccessAdminArea} deniedMessage="No tenés permisos de administración">{children}</RequireAnyRole>;
}
