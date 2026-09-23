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
  useEffect(() => {
    if (session.status !== "authenticated" || !session.roles?.includes("JUDGE")) return undefined;
    let active = true;
    let checking = false;
    const checkEventCompletion = async () => {
      if (checking) return;
      checking = true;
      try {
        const result = await apiRequest("/api/v1/judge/session-status");
        if (!active || !result.eventEnded) return;
        requestRevision.current += 1;
        await apiRequest("/api/auth/sign-out", { method: "POST", body: "{}" }).catch(() => {});
        if (activeUserId.current) void clearUserOfflineData(activeUserId.current).catch(() => {});
        activeUserId.current = null;
        if (active) {
          setSession({ status: "anonymous", roles: [], user: null, judgeProfile: null, sessionExpired: false, lastErrorCode: null });
          window.location.hash = "#/login?reason=event-ended";
        }
      } catch {
        // A temporary network failure must not end the local session.
      } finally {
        checking = false;
      }
    };
    void checkEventCompletion();
    const timer = window.setInterval(checkEventCompletion, 5 * 60 * 1000);
    window.addEventListener("focus", checkEventCompletion);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", checkEventCompletion);
    };
  }, [session.status, session.roles?.join(",")]);
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
