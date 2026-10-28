import { useEffect, useRef, useState } from "react";
import { apiRequest } from "../api/http.js";
import { clearUserOfflineData } from "../offline/ballot-store.js";
import { useAdminEvent } from "../context/AdminEventContext.jsx";
import { EventPicker } from "./EventPicker.jsx";
import { PublicResultsLink } from "./PublicResultsLink.jsx";
import { canAccessAdminArea } from "../auth/role-routes.js";
import { ThemeToggle } from "./ThemeToggle.jsx";

const ROLE_LABELS = { ADMIN: "Administrador", JUDGE: "Juez", COMISARIO: "Comisario", VEEDOR: "Veedor", SCRUTINEER: "Escrutador", ESCRIBANO: "Escribano" };
const SIDEBAR_STORAGE_KEY = "carnavales.sidebar.collapsed";

function readStoredCollapsed() {
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function storeCollapsed(collapsed) {
  try {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
  } catch {
    // Storage is an optional convenience, not a requirement for the session.
  }
}

function NavigationIcon({ name }) {
  const paths = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5.5 9v11h13V9M9.5 20v-6h5v6" /></>,
    calendar: <><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 3v4m8-4v4M4 10h16M8 14h2m4 0h2m-8 3h2" /></>,
    people: <><circle cx="9" cy="8" r="3" /><path d="M3.5 20v-1a5.5 5.5 0 0 1 11 0v1zM16 5.5a3 3 0 0 1 0 5.8m1 3.2a5 5 0 0 1 3.5 4.8V20h-4" /></>,
    checklist: <><path d="m4 7 1.5 1.5L8 6M11 7h9M4 13l1.5 1.5L8 12m3 1h9M4 19l1.5 1.5L8 18m3 1h9" /></>,
    ballot: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 9h8M8 13h3m-3 4h8M6 3v4m12-4v4" /></>,
    support: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><path d="m5.6 5.6 3 3m6.8 6.8 3 3m0-13.2-3 3m-6.8 6.8-3 3" /></>,
    shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
    userPlus: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" /></>,
    userCheck: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><polyline points="16 11 18 13 22 9" /></>,
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

  if (currentRoute === "#/admin/assignments" && hrefRoute === "#/admin/competencia") {
    const hrefStep = new URLSearchParams(hrefSearch).get("step");
    if (hrefStep === "jurados") return true;
  }

  if (currentRoute !== hrefRoute) return false;

  const currentParams = new URLSearchParams(currentSearch);
  const hrefParams = new URLSearchParams(hrefSearch);

  const currentStep = currentParams.get("step");
  const hrefStep = hrefParams.get("step");

  if (currentStep || hrefStep) return (currentStep ?? "catalogo") === (hrefStep ?? "catalogo");
  return true;
}

export function AppNavigation({ session }) {
  const adminEvent = useAdminEvent();
  const [closing, setClosing] = useState(false);
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readStoredCollapsed);
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
  const isAdmin = session.roles?.includes("ADMIN");
  const isJudge = session.roles?.includes("JUDGE");
  // El Jurado mantiene su pantalla de trabajo despejada; una cuenta ADMIN conserva navegación global.
  const hideDrawer = isJudge && !isAdmin && currentRoute.startsWith("#/judge");
  // El modo solo-iconos existe solo para el menú de Administrador en desktop;
  // los demás roles tienen enlaces de solo texto que no caben en el rail.
  const canCollapse = isDesktop && isAdmin;
  const isRail = canCollapse && collapsed;
  const railTitle = (label) => (isRail ? label : undefined);
  const expandRail = () => {
    if (isRail) setCollapsed(false);
  };

  useEffect(() => {
    storeCollapsed(collapsed);
  }, [collapsed]);

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

const ROUTE_LABELS = {
  "#/admin/home": "Inicio",
  "#/admin/events": "Jornadas",
  "#/admin/competencia": "Comparsas y jurados",
  "#/admin/assignments": "Asignaciones",
  "#/admin/voting": "Control de votación",
  "#/veedor": "Supervisión",
  "#/admin/penalties": "Penalizaciones",
  "#/admin/results": "Escrutinio",
  "#/admin/record": "Acta oficial",
  "#/admin/judges": "Usuarios",
  "#/admin/users": "Administradores",
  "#/judge": "Mi panel",
  "#/judge/assignment": "Selección de comparsa",
  "#/judge/ballot": "Planilla de votación",
  "#/resultados": "Resultados oficiales",
};

function getBreadcrumbData(location) {
  const [route, query = ""] = location.split("?");
  if (!route || route === "#/admin/home" || route === "#/login") {
    return { isHome: true, label: "Inicio" };
  }
  let label = ROUTE_LABELS[route];
  if (route === "#/admin/competencia") {
    const params = new URLSearchParams(query);
    const step = params.get("step") ?? "catalogo";
    if (step === "catalogo") label = "Rubros";
    else if (step === "especialidades") label = "Especialidades";
    else if (step === "participantes") label = "Comparsas";
    else if (step === "jurados") label = params.get("tab") === "asignaciones" ? "Asignación de jurados" : "Especialidades";
    else if (step === "asignaciones") label = "Asignación de jurados";
    else if (step === "rubros") label = "Evaluación";
    else if (step === "revision") label = "Revisión final";
  }
  if (!label) {
    const stripped = route.replace(/^#\/(admin\/)?/, "").replace(/-/g, " ");
    label = stripped.charAt(0).toUpperCase() + stripped.slice(1);
  }
  return { isHome: false, label };
}

function getInitials(name) {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatNightDate(value) {
  if (!value) return "";
  if (typeof value === "string") {
    const match = value.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
      if (!Number.isNaN(date.getTime())) {
        return date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
      }
    }
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

  const isHomeRoute = currentRoute === "#/admin/home";
  const isJudgeRoute = currentRoute.startsWith("#/judge");
  const judgeNight = isJudgeRoute
    && adminEvent?.judgeNight?.route === currentRoute
    && (!adminEvent?.activeEventId || adminEvent.judgeNight.eventId === adminEvent.activeEventId)
    ? adminEvent.judgeNight
    : null;
  const judgeNightDate = judgeNight ? formatNightDate(judgeNight.eventDate) : "";
  const isUsersRoute = currentRoute === "#/admin/judges" || currentRoute === "#/admin/users";
  const isGlobalAdminRoute = isHomeRoute || isUsersRoute;
  const hideEventPicker = isHomeRoute || isUsersRoute;
  const breadcrumb = getBreadcrumbData(currentLocation);
  const showHomeBreadcrumb = canAccessAdminArea(session) && currentRoute !== "#/veedor";
  const roleLabels = (session.roles ?? []).map((role) => ROLE_LABELS[role] ?? role);
  const sessionUser = (
    <div className="session-user">
      <div className="session-avatar" aria-hidden="true">
        {getInitials(session.user?.name)}
      </div>
      <div className="session-identity">
        <strong>{session.user?.name}</strong>
        <span className="session-role">{roleLabels.join(" · ") || "Sin rol asignado"}</span>
        {adminEvent && (
          <span className="session-event sr-only">
            {adminEvent.loading ? "Cargando evento…" : adminEvent.activeEvent?.name ?? "Sin eventos disponibles"}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <>
    <header className={`app-navigation ${session.roles?.includes("JUDGE") ? "judge-navigation" : ""} ${isJudgeRoute ? "is-judge-route" : ""} ${isHomeRoute ? "is-home" : ""}`}>
      <div className="header-left">
        {isJudgeRoute && sessionUser}
        {!isDesktop && !hideDrawer && (
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
        {canCollapse && (
        <button
          className="nav-toggle nav-collapse-toggle"
          type="button"
          aria-expanded={!collapsed}
          aria-controls="app-drawer"
          aria-label="Menú lateral"
          title={collapsed ? "Expandir menú lateral" : "Contraer menú lateral"}
          onClick={() => setCollapsed((value) => !value)}
        >
          <span aria-hidden="true">☰</span>
        </button>
        )}
        <a className="brand" href="#" onClick={(e) => { e.preventDefault(); window.location.reload(); }}><span>Carnavales</span> <strong>2027</strong></a>
        {isDesktop && !isJudgeRoute && (
          <nav className="header-breadcrumb" aria-label="Ruta de navegación">
            {breadcrumb.isHome ? (
              canAccessAdminArea(session) ? (
                <>
                  <span>Inicio</span>
                  <span aria-hidden="true">&rsaquo;</span>
                </>
              ) : null
            ) : (
              <>
                {showHomeBreadcrumb && (
                  <>
                    <a href="#/admin/home" className="breadcrumb-link">Inicio</a>
                    <span aria-hidden="true">&rsaquo;</span>
                  </>
                )}
                <span className="breadcrumb-current" aria-current="page">{breadcrumb.label}</span>
              </>
            )}
          </nav>
        )}
      </div>
      <div className="session-actions">
        {adminEvent && !hideEventPicker && <EventPicker adminEvent={adminEvent} canCreateEvents={isAdmin} />}
        {judgeNight && (
          <div
            className="session-night"
            aria-label={`Jornada actual: ${judgeNight.name}${judgeNightDate ? `, ${judgeNightDate}` : ""}`}
          >
            <span className="session-night-name">{judgeNight.name}</span>
            {judgeNightDate && <span className="session-night-date">{judgeNightDate}</span>}
          </div>
        )}
        {!isJudgeRoute && sessionUser}
        <ThemeToggle iconOnly className="theme-toggle--nav" />
        <span className="session-divider" aria-hidden="true" />
        <button className="session-signout secondary" type="button" disabled={closing} onClick={signOut}>
          <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span>Salir</span>
        </button>
      </div>
      {message && <p className="navigation-feedback" role="alert">{message}</p>}
      {adminEvent?.error && <p className="navigation-feedback" role="alert">{adminEvent.error} <button type="button" onClick={() => void adminEvent.refreshEvents()}>Reintentar eventos</button></p>}
    </header>
    {!hideDrawer && open && !isDesktop && (
      <button
        className="app-drawer-backdrop"
        type="button"
        aria-label="Cerrar menu de navegacion"
        onClick={() => setOpen(false)}
      />
    )}
    {!hideDrawer && <nav
      ref={drawerRef}
      id="app-drawer"
      className={`app-drawer${drawerOpen ? " is-open" : ""}${isRail ? " is-collapsed" : ""}`}
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
      {/* Tema removido según solicitud */}
        {session.roles?.includes("ADMIN") && (
          <>
            <span className="nav-section-label">Inicio</span>
            <a className="nav-primary-link" href="#/admin/home" title={railTitle("Inicio")} aria-current={isCurrentNavItem(currentLocation, "#/admin/home") ? "page" : undefined}>
              <NavigationIcon name="home" />
              <span>Inicio</span>
            </a>
            {!isGlobalAdminRoute && <>
            <span className="nav-section-label">Preparación</span>
            <a className="nav-primary-link" href="#/admin/events" title={railTitle("Jornadas")} aria-current={isCurrentNavItem(currentLocation, "#/admin/events") ? "page" : undefined}>
              <NavigationIcon name="calendar" />
              <span>Jornadas</span>
            </a>
            <details className="nav-group" open={["#/admin/competencia", "#/admin/assignments"].includes(currentRoute)}>
              <summary className="nav-group-summary" title={railTitle("Preparación de competencia")} onClick={expandRail}>
                <NavigationIcon name="people" />
                <span>Preparación de competencia</span>
              </summary>
              <div className="nav-group-links">
                {navLink("#/admin/competencia?step=catalogo", "Rubros")}
                {navLink("#/admin/competencia?step=especialidades", "Especialidades")}
                {navLink("#/admin/competencia?step=rubros", "Evaluación")}
                {navLink("#/admin/competencia?step=participantes", "Comparsas")}
                {navLink("#/admin/competencia?step=asignaciones", "Asignación de jurados")}
              </div>
            </details>
            <span className="nav-section-label">En vivo</span>
            <a className="nav-primary-link" href="#/admin/voting" title={railTitle("Control de votación")} aria-current={isCurrentNavItem(currentLocation, "#/admin/voting") ? "page" : undefined}>
              <NavigationIcon name="ballot" />
              <span>Control de votación</span>
            </a>
            <details className="nav-group" open={["#/veedor", "#/admin/penalties"].includes(currentRoute)}>
              <summary className="nav-group-summary" title={railTitle("Supervisión y penalizaciones")} onClick={expandRail}>
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
              <summary className="nav-group-summary" title={railTitle("Resultados y actas")} onClick={expandRail}>
                <NavigationIcon name="record" />
                <span>Resultados y actas</span>
              </summary>
              <div className="nav-group-links">
                {navLink("#/admin/results", "Escrutinio")}
                {navLink("#/admin/record", "Acta oficial")}
                <PublicResultsLink currentRoute={currentRoute} />
              </div>
            </details>
            </>}
            <span className="nav-section-label">Usuarios</span>
            <a className="nav-primary-link" href="#/admin/judges" title={railTitle("Usuarios")} aria-current={isUsersRoute ? "page" : undefined}>
              <NavigationIcon name="userCheck" />
              <span>Usuarios</span>
            </a>
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
    </nav>}
    </>
  );
}
