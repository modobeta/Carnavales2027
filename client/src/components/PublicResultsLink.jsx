import { useEffect, useState } from "react";
import { apiRequest } from "../api/http.js";

export function PublicResultsLink({ currentRoute }) {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let active = true;
    let pending = false;
    const refresh = async () => {
      if (pending || document.visibilityState === "hidden") return;
      pending = true;
      try {
        const data = await apiRequest("/api/v1/public/events", { signal: AbortSignal.timeout(10000) });
        if (active) setAvailable(Array.isArray(data?.events) && data.events.length > 0);
      } catch {
        if (active) setAvailable(false);
      } finally {
        pending = false;
      }
    };
    void refresh();
    const timer = setInterval(refresh, 60000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [currentRoute]);

  return available
    ? <a href="#/resultados" aria-current={currentRoute === "#/resultados" ? "page" : undefined}>Resultados</a>
    : <span role="link" aria-disabled="true" className="nav-link-disabled" title="Todavía no hay resultados publicados disponibles">Resultados</span>;
}
