import { useEffect, useRef, useState } from "react";
import { apiRequest } from "../api/http.js";
import { clearUserOfflineData } from "../offline/ballot-store.js";
import { useAdminEvent } from "../context/AdminEventContext.jsx";
import { PublicResultsLink } from "./PublicResultsLink.jsx";

const ROLE_LABELS = { ADMIN: "Administrador", JUDGE: "Juez", COMISARIO: "Comisario", VEEDOR: "Veedor", SCRUTINEER: "Escrutador", ESCRIBANO: "Escribano" };

function NavigationIcon({ name }) {
  const paths = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5.5 9v11h13V9M9.5 20v-6h5v6" /></>,
    calendar: <><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 3v4m8-4v4M4 10h16M8 14h2m4 0h2m-8 3h2" /></>,
    people: <><circle cx="9" cy="8" r="3" /><path d="M3.5 20v-1a5.5 5.5 0 0 1 11 0v1zM16 5.5a3 3 0 0 1 0 5.8m1 3.2a5 5 0 0 1 3.5 4.8V20h-4" /></>,
    checklist: <><path d="m4 7 1.5 1.5L8 6M11 7h9M4 13l1.5 1.5L8 12m3 1h9M4 19l1.5 1.5L8 18m3 1h9" /></>,
    ballot: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 9h8M8 13h3m-3 4h8M6 3v4m12-4v4" /></>,
    support: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><path d="m5.6 5.6 3 3m6.8 6.8 3 3m0-13.2-3 3m-6.8 6.8-3 3" /></>,
    shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
    record: <><path d="M6 3h8l5 5v13H6z" /><path d="M14 3v6h5M9 13h7m-7 3h7m-7 3h4" /></>,
  };

  return (
    <svg className="nav-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  );
}

function isCurrentNavItem(currentLocation, href) {
  const [currentRoute, currentSearch = ""] = currentLocation.split("?");
  const [hrefRoute, hrefSearch = ""] = href.split("?");
  if (currentRoute !== hrefRoute) return false;

  const currentStep = new URLSearchParams(currentSearch).get("step");
  const hrefStep = new URLSearchParams(hrefSearch).get("step");
  if (currentStep || hrefStep) return (currentStep ?? "participantes") === (hrefStep ?? "participantes");
  return true;
}

export function AppNavigation({ session }) {
  const adminEvent = useAdminEvent();
  const [closing, setClosing] = useState(false);
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window.matchMedia === "function"
      ? window.matchMedia("(min-width: 64rem)").matches
      : false,
  );
  const [currentLocation, setCurrentLocation] = useState(() => window.location.hash || "#/");
  const currentRoute = currentLocation.split("?")[0];
  const toggleRef = useRef(null);
  const drawerRef = useRef(null);
  const drawerOpen = isDesktop || open;

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(min-width: 64rem)");
    const onChange = (event) => {
      setIsDesktop(event.matches);
      if (event.matches) setOpen(false);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const updateRoute = () => {
      setCurrentLocation(window.location.hash || "#/");
      setOpen(false);
    };
    window.addEventListener("hashchange", updateRoute);
    return () => window.removeEventListener("hashchange", updateRoute);
  }, []);

  useEffect(() => {
    if (!open || isDesktop) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeButton = drawerRef.current?.querySelector("[data-drawer-close]");
    closeButton?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        toggleRef.current?.focus();
        return;
      }
      if (event.key === "Tab" && drawerRef.current) {
        const focusables = drawerRef.current.querySelectorAll(
          'a[href], button:not([disabled])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, isDesktop]);

  const closeDrawer = () => {
    setOpen(false);
    toggleRef.current?.focus();
  };

  const navLink = (href, label) => (
    <a href={href} aria-current={isCurrentNavItem(currentLocation, href) ? "page" : undefined}>
      {label}
    </a>
  );

  const signOut = async () => {
    setClosing(true);
    try {
      await apiRequest("/api/auth/sign-out", { method: "POST", body: "{}" });
      if (session.user?.id) await clearUserOfflineData(session.user.id);
      session.clear?.();
      window.location.hash = "#/login";
    } catch {
      setMessage("No se pudo cerrar la sesión. Tu acceso continúa activo.");
    } finally {
      setClosing(false);
    }
  };

  return (
    <>
    <header className={`app-navigation ${session.roles?.includes("JUDGE") ? "judge-navigation" : ""}`}>
      {!isDesktop && (
      <button
        ref={toggleRef}
        className="nav-toggle"
        type="button"
        aria-expanded={open}
        aria-controls="app-drawer"
        aria-label={open ? "Cerrar menu de navegacion" : "Abrir menu de navegacion"}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">{open ? "✕" : "☰"}</span>
      </button>
      )}
      <a className="brand" href="#" onClick={(e) => { e.preventDefault(); window.location.reload(); }}><span>Carnavales</span> <strong>2027</strong></a>
      <div className="session-actions">
        {adminEvent && (
          <label className="global-event-picker">
            <span>Evento activo</span>
            <select
              aria-label="Evento activo"
              value={adminEvent.activeEventId}
              disabled={adminEvent.loading || adminEvent.events.length === 0}
              onChange={(event) => {
                adminEvent.setActiveEventId(event.target.value);
                if (currentRoute.startsWith("#/judge/")) window.location.hash = "#/judge";
              }}
            >
              {adminEvent.events.length === 0 ? <option value="">Sin eventos</option> : adminEvent.events.map((event) => (
                <option key={event.id} value={event.id}>{event.name}</option>
              ))}
            </select>
          </label>
        )}
        <div className="session-identity">
          <strong>{session.user?.name}</strong>
          <span className="session-role">{(session.roles ?? []).map((role) => ROLE_LABELS[role] ?? role).join(" · ") || "Sin rol asignado"}</span>
          {adminEvent && <span className="session-event">{adminEvent.loading ? "Cargando evento…" : adminEvent.activeEvent?.name ?? "Sin eventos disponibles"}</span>}
        </div>
        <button className="secondary" type="button" disabled={closing} onClick={signOut}>Salir</button>
      </div>
      {message && <p className="navigation-feedback" role="alert">{message}</p>}
      {adminEvent?.error && <p className="navigation-feedback" role="alert">{adminEvent.error} <button type="button" onClick={() => void adminEvent.refreshEvents()}>Reintentar eventos</button></p>}
    </header>
    {open && !isDesktop && (
      <button
        className="app-drawer-backdrop"
        type="button"
        aria-label="Cerrar menu de navegacion"
        onClick={() => setOpen(false)}
      />
    )}
    <nav
      ref={drawerRef}
      id="app-drawer"
      className={`app-drawer${drawerOpen ? " is-open" : ""}`}
      aria-label="Navegacion principal"
      aria-hidden={!drawerOpen}
    >
      <div className="app-drawer-header">
          <span className="app-drawer-title">Menú</span>
        <button
          className="secondary app-drawer-close"
          type="button"
          data-drawer-close
          aria-label="Cerrar menu de navegacion"
          onClick={closeDrawer}
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>
        {session.roles?.includes("ADMIN") && (
          <>
            <span className="nav-section-label">Inicio</span>
            <a className="nav-primary-link" href="#/admin/home" aria-current={isCurrentNavItem(currentLocation, "#/admin/home") ? "page" : undefined}>
              <NavigationIcon name="home" />
              <span>Inicio</span>
            </a>
            <span className="nav-section-label">Preparación</span>
            <a className="nav-primary-link" href="#/admin/events" aria-current={isCurrentNavItem(currentLocation, "#/admin/events") ? "page" : undefined}>
              <NavigationIcon name="calendar" />
              <span>Evento y jornadas</span>
            </a>
            <details className="nav-group" open={["#/admin/competencia", "#/admin/judges", "#/admin/assignments"].includes(currentRoute)}>
              <summary className="nav-group-summary">
                <NavigationIcon name="people" />
                <span>Comparsas y jurados</span>
              </summary>
              <div className="nav-group-links">
                {navLink("#/admin/competencia?step=participantes", "Comparsas")}
                {navLink("#/admin/competencia?step=jurados", "Jurados y especialidades")}
                {navLink("#/admin/competencia?step=rubros", "Evaluación")}
                {navLink("#/admin/assignments", "Asignar Jurados")}
                {navLink("#/admin/judges", "Crear Usuario")}
              </div>
            </details>
            <span className="nav-section-label">En vivo</span>
            <a className="nav-primary-link" href="#/admin/voting" aria-current={isCurrentNavItem(currentLocation, "#/admin/voting") ? "page" : undefined}>
              <NavigationIcon name="ballot" />
              <span>Control de votación</span>
            </a>
            <details className="nav-group" open={["#/veedor", "#/admin/penalties"].includes(currentRoute)}>
              <summary className="nav-group-summary">
                <NavigationIcon name="shield" />
                <span>Supervisión y penalizaciones</span>
              </summary>
              <div className="nav-group-links">
                {navLink("#/veedor", "Supervisión")}
                {navLink("#/admin/penalties", "Penalizaciones")}
              </div>
            </details>
            <span className="nav-section-label">Finalización</span>
            <details className="nav-group" open={["#/admin/results", "#/admin/record", "#/resultados"].includes(currentRoute)}>
              <summary className="nav-group-summary">
                <NavigationIcon name="record" />
                <span>Resultados y actas</span>
              </summary>
              <div className="nav-group-links">
                {navLink("#/admin/results", "Escrutinio")}
                {navLink("#/admin/record", "Acta oficial")}
                <PublicResultsLink currentRoute={currentRoute} />
              </div>
            </details>
          </>
        )}
        {session.roles?.includes("COMISARIO") && !session.roles?.includes("ADMIN") && (
          <>
            <a href="#/admin/penalties" aria-current={currentRoute === "#/admin/penalties" ? "page" : undefined}>Penalizaciones</a>
          </>
        )}
        {session.roles?.includes("JUDGE") && <a href="#/judge" aria-current={currentRoute === "#/judge" ? "page" : undefined}>Mi panel</a>}
        {(session.roles?.includes("ADMIN") || session.roles?.includes("VEEDOR")) && !session.roles?.includes("ADMIN") && (
          <>
            <a href="#/veedor" aria-current={currentRoute === "#/veedor" ? "page" : undefined}>Supervisión</a>
          </>
        )}
        {!session.roles?.includes("ADMIN") && <PublicResultsLink currentRoute={currentRoute} />}
    </nav>
    </>
  );
}
