import { useEffect, useId, useRef, useState } from "react";

/**
 * ActionMenu — menú contextual "…" accesible.
 * items: [{ key, label, onSelect, danger? }]
 */
export function ActionMenu({ label, items }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    rootRef.current?.querySelector('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!items || items.length === 0) return null;

  return (
    <div className="action-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="secondary action-menu-trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className="icon">
          <circle cx="5" cy="12" r="1.5" fill="currentColor" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
          <circle cx="19" cy="12" r="1.5" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div className="action-menu-list" role="menu" id={menuId} aria-label={label}>
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              className={`action-menu-item${item.danger ? " is-danger" : ""}`}
              onClick={(event) => {
                setOpen(false);
                item.onSelect(event, triggerRef.current);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
