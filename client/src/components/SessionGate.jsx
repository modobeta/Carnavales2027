import { useSession } from "../auth/session-context.jsx";
import { LoadingScreen } from "./LoadingScreen.jsx";

/**
 * SessionGate — espera a que `/api/v1/me` resuelva antes de mostrar rutas.
 *
 * Evita el destello de login en una sesión ya autenticada. No altera la
 * resolución de sesión ni los guards: solo decide qué se pinta mientras
 * `SessionProvider` sigue en estado `loading`.
 */
export function SessionGate({ children }) {
  const session = useSession();

  if (session.status === "loading") {
    return (
      <LoadingScreen
        label="Preparando el portal"
        detail="Verificando tu sesión…"
      />
    );
  }

  return children;
}
