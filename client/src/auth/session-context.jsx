import { createContext, useContext, useEffect, useRef, useState } from "react";
import { apiRequest } from "../api/http.js";
import { clearUserOfflineData } from "../offline/ballot-store.js";

const SessionContext = createContext({
  status: "loading",
  roles: [],
  user: null,
  judgeProfile: null,
  sessionExpired: false,
  lastErrorCode: null,
  refresh: async () => ({ status: "anonymous", roles: [] }),
  clear: () => {},
});
export const useSession = () => useContext(SessionContext);

// Códigos que significan "la sesión ya no es válida" (no un fallo transitorio).
export const SESSION_ENDED_CODES = ["UNAUTHENTICATED", "SESSION_EXPIRED"];

export function isSessionEndedError(error) {
  return Boolean(error && SESSION_ENDED_CODES.includes(error.code));
}

// Redirige al login con aviso de sesión expirada, preservando el retorno
// (p. ej. la planilla que el jurado estaba votando) para retomar tras re-login.
export function redirectToLoginExpired(returnToHash) {
  const params = new URLSearchParams({ reason: "session-expired" });
  if (returnToHash && returnToHash.startsWith("#/judge")) {
    params.set("returnTo", returnToHash);
  }
  window.location.hash = `#/login?${params.toString()}`;
}

export function SessionProvider({ children }) {
  const [session, setSession] = useState({ status: "loading", roles: [], user: null, judgeProfile: null, sessionExpired: false, lastErrorCode: null });
  const requestRevision = useRef(0);
  const activeUserId = useRef(null);
  const refresh = async () => {
    const revision = ++requestRevision.current;
    try {
      const data = await apiRequest("/api/v1/me");
      if (activeUserId.current && activeUserId.current !== data.user?.id) {
        await clearUserOfflineData(activeUserId.current);
      }
      activeUserId.current = data.user?.id ?? null;
      const next = { status: "authenticated", ...data };
      if (revision === requestRevision.current) setSession(next);
      return next;
    } catch (error) {
      const ended = isSessionEndedError(error);
      const status = ended
        ? "anonymous"
        : error.code === "TWO_FACTOR_REQUIRED"
          ? "second-factor-required"
          : "error";
      const next = {
        status,
        roles: [],
        user: null,
        judgeProfile: null,
        sessionExpired: ended,
        lastErrorCode: ended ? null : (error?.code ?? null),
      };
      if (revision === requestRevision.current) setSession(next);
      return next;
    }
  };
  useEffect(() => {
    void refresh();
    return () => { requestRevision.current += 1; };
  }, []);
  return <SessionContext.Provider value={{
    ...session,
    refresh,
      clear: (options) => {
        requestRevision.current += 1;
        if (activeUserId.current) void clearUserOfflineData(activeUserId.current);
        activeUserId.current = null;
        setSession({ status: "anonymous", roles: [], user: null, judgeProfile: null, sessionExpired: Boolean(options?.sessionExpired), lastErrorCode: null });
    },
  }}>{children}</SessionContext.Provider>;
}
