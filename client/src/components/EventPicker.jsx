import { useEffect, useRef, useState } from "react";

export function EventPicker({ adminEvent, canCreateEvents = false }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) close();
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const activeEvent = adminEvent?.activeEvent ?? null;
  const events = adminEvent?.events ?? [];
  const loading = Boolean(adminEvent?.loading);
  const error = adminEvent?.error ?? "";

  const displayName = loading
    ? "Cargando…"
    : activeEvent?.name || (events.length ? "Seleccionar evento" : "Sin eventos");

  const selectEvent = (eventId) => {
    adminEvent?.setActiveEventId?.(eventId);
    if (window.location.hash.startsWith("#/judge/")) window.location.hash = "#/judge";
    close();
  };

  const createEvent = () => {
    window.location.hash = "#/admin/home";
    close();
  };

  return (
    <div className="event-picker" ref={rootRef}>
      <button
        type="button"
        className="event-picker-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={loading || (!loading && events.length === 0)}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="event-picker-text">
          <span className="event-picker-label">Evento actual</span>
          <span className="event-picker-value">{displayName}</span>
        </span>
        <span className="event-picker-chevron" aria-hidden="true">⌄</span>
      </button>

      {open && (
        <div className="event-picker-popover" role="dialog" aria-label="Cambiar de evento">
          <header className="event-picker-popover-header">
            <h3>Cambiar de evento</h3>
            <p>{canCreateEvents ? "Seleccioná el evento que querés administrar." : "Seleccioná el evento sobre el que querés trabajar."}</p>
          </header>

          <div className="event-picker-popover-body">
            {loading && <p className="event-picker-state">Cargando eventos…</p>}

            {!loading && error && (
              <div className="event-picker-state">
                <p>{error}</p>
                <button type="button" className="secondary" onClick={() => void adminEvent?.refreshEvents?.()}>
                  Reintentar
                </button>
              </div>
            )}

            {!loading && !error && events.length === 0 && (
              <div className="event-picker-state">
                <p>Todavía no hay eventos</p>
                {canCreateEvents && (
                  <button type="button" onClick={createEvent}>Crear primer evento</button>
                )}
              </div>
            )}

            {!loading && !error && events.length > 0 && (
              <ul className="event-picker-list" role="listbox" aria-label="Eventos disponibles">
                {events.map((event) => {
                  const selected = event.id === adminEvent?.activeEventId;
                  return (
                    <li key={event.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className={`event-picker-option ${selected ? "is-selected" : ""}`}
                        onClick={() => selectEvent(event.id)}
                      >
                        <span className="event-picker-option-name">{event.name}</span>
                        {selected && <span className="event-picker-check" aria-hidden="true">✓</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {canCreateEvents && !loading && events.length > 0 && (
            <>
              <div className="event-picker-separator" aria-hidden="true" />
              <button type="button" className="event-picker-create" onClick={createEvent}>
                <span aria-hidden="true">+</span>
                <span>Crear nuevo evento</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
