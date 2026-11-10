import { useEffect, useLayoutEffect, useRef, useState } from "react";

export function EventPicker({ adminEvent, canCreateEvents = false, compactArrow = false, viewportBounded = false }) {
  const [open, setOpen] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState(null);
  const rootRef = useRef(null);
  const popoverRef = useRef(null);
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

  useLayoutEffect(() => {
    if (!open || !viewportBounded) return undefined;

    const placePopover = () => {
      const trigger = rootRef.current?.querySelector(".event-picker-trigger");
      const popover = popoverRef.current;
      if (!trigger || !popover) return;

      const margin = 8;
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
      const viewportHeight = window.innerHeight;
      const triggerRect = trigger.getBoundingClientRect();
      const popoverRect = popover.getBoundingClientRect();
      const width = Math.min(popoverRect.width || 320, viewportWidth - margin * 2);
      const height = Math.min(popoverRect.height || 240, viewportHeight - margin * 2);
      const left = Math.min(Math.max(margin, triggerRect.left), viewportWidth - width - margin);
      const below = triggerRect.bottom + margin;
      const top = below + height <= viewportHeight - margin
        ? below
        : Math.max(margin, triggerRect.top - height - margin);

      setPopoverPosition({
        position: "fixed",
        inset: "auto",
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        maxHeight: `${viewportHeight - margin * 2}px`,
      });
    };

    placePopover();
    window.addEventListener("resize", placePopover);
    window.addEventListener("scroll", placePopover, true);
    return () => {
      window.removeEventListener("resize", placePopover);
      window.removeEventListener("scroll", placePopover, true);
    };
  }, [open, viewportBounded]);

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
    window.location.hash = "#/admin/prepare?stage=event&task=data&new=1";
    close();
  };

  return (
    <div className={"event-picker" + (viewportBounded ? " event-picker--viewport-bounded" : "")} ref={rootRef}>
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
        <span className="event-picker-chevron" aria-hidden="true">{compactArrow ? <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v10m-4-4 4 4 4-4" /></svg> : "⌄"}</span>
      </button>

      {open && (
        <div
          className={"event-picker-popover" + (viewportBounded ? " event-picker-popover--viewport-bounded" : "")}
          ref={popoverRef}
          style={viewportBounded ? (popoverPosition ?? { visibility: "hidden" }) : undefined}
          role="dialog"
          aria-label="Cambiar de evento"
        >
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
