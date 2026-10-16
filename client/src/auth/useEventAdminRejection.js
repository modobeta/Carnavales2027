import { useSession } from "./session-context.jsx";
import { useAdminEvent } from "../context/AdminEventContext.jsx";
import { useNotify } from "../components/Notifications.jsx";

export function isEventAdminRejection(error) {
  return error?.status === 403 && error?.code === "ADMIN_REQUIRED";
}

// Spec 040 RF-7 (D6): ante 403 ADMIN_REQUIRED, una reconsulta de /me. Si el evento ya no está
// asignado, se sale de él; si sigue (p. ej. desactivado), se queda. Sesión y 2FA siguen las guardias.
export async function reactToEventAdminRejection({ error, eventId, refreshSession, leaveEvent }) {
  if (!isEventAdminRejection(error)) return "not-applicable";
  const next = await refreshSession();
  if (next?.status === "error") return "refresh-failed";
  // Sesión terminada o segundo factor pendiente: lo resuelven las guardias existentes (CA-7.4).
  if (next?.status !== "authenticated") return "session-ended";
  if (!(next.adminEvents ?? []).some((event) => event.id === eventId)) {
    leaveEvent();
    return "revoked";
  }
  return "still-assigned";
}

// Una reconsulta en curso se comparte entre todas las pantallas montadas (una por rechazo).
let reactionInFlight = false;

export function useEventAdminRejection(enabled) {
  const session = useSession();
  const adminEvent = useAdminEvent();
  const { notify } = useNotify();

  // Devuelve el resultado, o "not-applicable" si la regla no aplica. Rechazos simultáneos comparten una reconsulta.
  return async (error, eventId) => {
    if (!enabled || !isEventAdminRejection(error)) return "not-applicable";
    if (reactionInFlight) return "pending";
    reactionInFlight = true;
    notify({ message: "Acción no permitida para este evento.", type: "error" });
    try {
      const outcome = await reactToEventAdminRejection({
        error,
        eventId,
        refreshSession: () => session.refresh(),
        leaveEvent: () => {
          adminEvent?.setActiveEventId?.("");
          window.location.hash = "#/admin/home";
        },
      });
      if (outcome === "still-assigned") void adminEvent?.refreshEvents?.();
      if (outcome === "refresh-failed") notify({ message: "No se pudieron verificar tus permisos. Reintentá.", type: "error" });
      return outcome;
    } finally {
      reactionInFlight = false;
    }
  };
}
