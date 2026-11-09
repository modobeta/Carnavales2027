import { useEffect, useRef } from "react";
import { EventPicker } from "./EventPicker.jsx";
import { ThemeToggle } from "./ThemeToggle.jsx";
import { uxStatusLabel } from "./admin-ux-labels.js";

export function AdminHeader({ session, context, globalPage, newEvent, preparing, label, closing, onSignOut, children }) {
  const account = useRef(null);
  useEffect(() => {
    const outside = (event) => { if (account.current && !account.current.contains(event.target)) account.current.open = false; };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  return <>
    <div className="admin-header-identity">
      {children}
      <details className="admin-header-account" ref={account} onKeyDown={(event) => {
        if (event.key === "Escape") { event.stopPropagation(); account.current.open = false; account.current.querySelector("summary")?.focus(); }
      }}>
        <summary><strong>{session.user?.name || "Administrador"}</strong><span>Administrador</span><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M8 3v10m-4-4 4 4 4-4" /></svg></summary>
        <div className="admin-header-account-menu"><ThemeToggle /><button type="button" className="secondary" disabled={closing} onClick={onSignOut}>{closing ? "Saliendo…" : "Salir"}</button></div>
      </details>
    </div>
    <div className="admin-header-context">
      {newEvent ? <strong>Nuevo evento</strong> : context && !globalPage ? <EventPicker adminEvent={context} canCreateEvents compactArrow /> : <strong>Administración</strong>}
      <span>{newEvent ? "Sin crear" : !globalPage && context?.activeEvent ? uxStatusLabel(context.activeEvent.status) : "Gestión de eventos"}</span>
    </div>
    {preparing ? <button type="button" className="admin-header-exit" onClick={() => { window.location.hash = "#/admin/home"; }} title="Se conserva lo guardado. Si hay cambios pendientes, se solicita confirmación.">Mis eventos</button> : <span className="admin-header-section">{label}</span>}
  </>;
}
