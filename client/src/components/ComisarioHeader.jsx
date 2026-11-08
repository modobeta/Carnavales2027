import { useEffect, useRef } from "react";
import { EventPicker } from "./EventPicker.jsx";
import { ThemeToggle } from "./ThemeToggle.jsx";
import { uxStatusLabel } from "./admin-ux-labels.js";

export function ComisarioHeader({ session, context, closing, onSignOut, children }) {
  const account = useRef(null);
  useEffect(() => {
    const closeOnOutsidePointer = (event) => {
      if (account.current && !account.current.contains(event.target)) account.current.open = false;
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, []);

  const closeOnEscape = (event) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    account.current.open = false;
    account.current.querySelector("summary")?.focus();
  };

  const eventStatus = context?.loading
    ? "Cargando evento…"
    : context?.activeEvent
      ? uxStatusLabel(context.activeEvent.status, "Estado no disponible")
      : "Sin evento seleccionado";

  return <>
    <div className="comisario-header-identity">
      {children}
      <details className="comisario-header-account" ref={account} onKeyDown={closeOnEscape}>
        <summary>
          <strong>{session.user?.name || "Comisario"}</strong>
          <span>Comisario</span>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8 3v10m-4-4 4 4 4-4" />
          </svg>
        </summary>
        <div className="comisario-header-account-menu">
          <ThemeToggle />
          <button type="button" className="secondary" disabled={closing} onClick={onSignOut}>
            {closing ? "Saliendo…" : "Salir"}
          </button>
        </div>
      </details>
    </div>
    <div className="comisario-header-context">
      {context && <EventPicker adminEvent={context} compactArrow />}
      <span>{eventStatus}</span>
    </div>
    <span className="comisario-header-section" aria-current="page">Penalizaciones</span>
  </>;
}
