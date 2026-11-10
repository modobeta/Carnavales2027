import { useEffect, useRef } from "react";
import { EventPicker } from "./EventPicker.jsx";
import { ThemeToggle } from "./ThemeToggle.jsx";
import { useOnlineStatus } from "../hooks/useOnlineStatus.js";

export function JudgeHeader({ session, adminEvent, night, nightDate, roles, closing, onSignOut, children, home = false }) {
  const online = useOnlineStatus();
  const accountRef = useRef(null);
  useEffect(() => {
    const closeOutside = (event) => {
      if (accountRef.current && !accountRef.current.contains(event.target)) accountRef.current.open = false;
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);

  const eventPicker = adminEvent && <EventPicker adminEvent={adminEvent} canCreateEvents={session.roles?.includes("ADMIN")} compactArrow={home} viewportBounded />;
  const nightMetadata = <div className="judge-header-night-meta">
    {night?.specialtyName && <span className="judge-header-specialty">{night.specialtyName}</span>}
    {home && night?.specialtyName && night?.ballotStatus && <span aria-hidden="true">·</span>}
    {night?.ballotStatus && <span className="judge-header-state">{night.ballotStatus === "SUBMITTED" ? "Planilla confirmada" : "Planilla abierta"}</span>}
  </div>;
  const nightContext = <>
        {night && (
          <div className="session-night" aria-label={`Jornada actual: ${night.name}${nightDate ? `, ${nightDate}` : ""}`}>
            <strong className="session-night-name">{night.name}</strong>
            {nightDate && <span className="session-night-date">{nightDate}</span>}
          </div>
        )}
      {!home && nightMetadata}
    </>;
  const connection = <span className={`judge-connection${online ? "" : " is-offline"}`} role="status" title={online ? "Con conexión" : "Sin conexión"}>
    {home ? <><span className="judge-connection-led" aria-hidden="true" /><span className="sr-only">{online ? "Con conexión" : "Sin conexión"}</span></> : <><span aria-hidden="true">{online ? "●" : "△"}</span> {online ? "Con conexión" : "Sin conexión"}</>}
  </span>;
  const account = <details className="judge-account" ref={accountRef} onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            accountRef.current.open = false;
            accountRef.current.querySelector("summary")?.focus();
          }
        }}>
          <summary><strong>{session.user?.name || "Jurado"}</strong><span className="judge-account-role">{roles.join(" · ")}</span><span className="judge-account-arrow" aria-hidden="true">{home ? <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v10m-4-4 4 4 4-4" /></svg> : "⌄"}</span></summary>
          <div className="judge-account-menu">
            <ThemeToggle />
            <button className="judge-account-signout" type="button" disabled={closing} onClick={onSignOut}>{closing ? "Saliendo…" : "Salir"}</button>
          </div>
        </details>;

  return home ? (
    <>
      <div className="judge-home-identity">{children}{account}</div>
      <div className="judge-home-night">{nightContext}</div>
      <div className="judge-home-event">{eventPicker}{connection}{nightMetadata}</div>
    </>
  ) : (
    <>
      <div className="judge-header-context">{children}{eventPicker}{nightContext}</div>
      <div className="judge-header-tools">{connection}{account}</div>
    </>
  );
}
