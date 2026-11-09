import { useEffect } from "react";
import { hashHistoryPosition, markHashHistoryEntry } from "../features/hash-history.js";

// Misma protección de historial que el editor de competencia, para los pasos embebidos.
export function usePreparationNavigationGuard(active, guard, allowedHash) {
  useEffect(() => {
    if (!active) return undefined;
    const navigation = window.navigation;
    const acceptedHash = window.location.hash;
    const acceptedPosition = markHashHistoryEntry();
    const acceptedLength = window.history.length;
    let restoring = null;
    const onNavigate = (change) => {
      if (restoring || !change.canIntercept || !change.cancelable || !change.destination?.url) return;
      const target = new URL(change.destination.url);
      if (target.origin !== window.location.origin || target.pathname !== window.location.pathname || target.search !== window.location.search
        || target.hash === window.location.hash || target.hash === allowedHash.current) return;
      change.intercept({ focusReset: "manual", scroll: "manual", precommitHandler: () => new Promise((resolve, reject) => {
        if (!guard.current?.(() => { allowedHash.current = target.hash; resolve(); }, () => reject(new DOMException("Se conservó el borrador", "AbortError")))) { allowedHash.current = target.hash; resolve(); }
      }) });
    };
    const onHashChange = (change) => {
      const target = window.location.hash;
      if (target === allowedHash.current) { allowedHash.current = null; return; }
      if (restoring) {
        change.stopImmediatePropagation();
        if (target === acceptedHash) {
          const { delta, destination } = restoring;
          restoring = null;
          const proceed = () => { allowedHash.current = destination; window.history.go(delta); };
          if (!guard.current?.(proceed)) proceed();
        }
        return;
      }
      if (target === acceptedHash || !guard.current) return;
      const position = hashHistoryPosition();
      if (position === null && window.history.length <= acceptedLength) return;
      const delta = position === null ? 1 : position - acceptedPosition || 1;
      restoring = { delta, destination: target };
      window.history.go(-delta);
      change.stopImmediatePropagation();
    };
    navigation?.addEventListener?.("navigate", onNavigate);
    window.addEventListener("hashchange", onHashChange, true);
    return () => {
      navigation?.removeEventListener?.("navigate", onNavigate);
      window.removeEventListener("hashchange", onHashChange, true);
    };
  }, [active, guard, allowedHash]);
}
