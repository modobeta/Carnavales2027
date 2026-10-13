import { useEffect, useRef, useId } from "react";

/**
 * Dialog — Componente modal nativo y plenamente accesible (Spec 020 / RF-178)
 * Basado en <dialog> HTML5 con focus trap nativo, retorno de foco (focusReturnRef),
 * cierre por Escape o click en backdrop, y vinculación de ARIA labels.
 *
 * `tone` unifica el lenguaje visual del sistema de modales:
 *   - "violet"  → creación / edición y acciones habituales.
 *   - "success" → resultado de una operación completada.
 *   - "warning" → advertencia o confirmación de cambio delicado.
 *   - "danger"  → acción destructiva o irreversible.
 *   - "info"    → información general.
 *   - "default" → modal neutro (sin banda de color).
 * El color nunca es el único portador del significado: el título y el
 * contenido describen siempre la acción.
 */
const TONES = new Set(["default", "violet", "success", "warning", "danger", "info"]);

const TONE_ICONS = {
  violet: "✎",
  success: "✓",
  warning: "⚠",
  danger: "⚠",
  info: "i",
  default: null,
};

export function Dialog({
  isOpen,
  onClose,
  title,
  description,
  children,
  focusReturnRef,
  className = "",
  ariaLabel,
  tone = "default",
  size = "md",
  icon = true,
}) {
  const dialogRef = useRef(null);
  const titleId = useId();
  const descId = useId();
  const prevOpenRef = useRef(false);
  const safeTone = TONES.has(tone) ? tone : "default";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
      prevOpenRef.current = true;
    } else if (!isOpen && dialog.open) {
      dialog.close();
      if (prevOpenRef.current && focusReturnRef?.current) {
        focusReturnRef.current.focus();
      }
      prevOpenRef.current = false;
    }
  }, [isOpen, focusReturnRef]);

  // Manejar el evento nativo de cancelación (tecla ESC)
  const handleCancel = (event) => {
    event.preventDefault();
    if (onClose) onClose();
  };

  // Manejar click en el backdrop (fuera de la caja modal)
  const handleClick = (event) => {
    if (event.target === dialogRef.current && onClose) {
      onClose();
    }
  };

  if (!isOpen && !dialogRef.current?.open) {
    return null;
  }

  const toneIcon = TONE_ICONS[safeTone];

  return (
    <dialog
      ref={dialogRef}
      className={`app-dialog app-dialog--${safeTone} app-dialog--${size} ${className}`.trim()}
      aria-modal="true"
      onCancel={handleCancel}
      onClick={handleClick}
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={description ? descId : undefined}
      aria-label={!title && ariaLabel ? ariaLabel : undefined}
    >
      <div className="app-dialog-content">
        {title && (
          <header className="app-dialog-header">
            <h2 id={titleId} className="app-dialog-title">
              {icon && toneIcon && (
                <span className="app-dialog-tone-icon" aria-hidden="true">
                  {toneIcon}
                </span>
              )}
              <span>{title}</span>
            </h2>
            {onClose && (
              <button
                type="button"
                className="app-dialog-close-btn"
                onClick={onClose}
                aria-label="Cerrar diálogo"
              >
                ✕
              </button>
            )}
          </header>
        )}
        {description && (
          <p id={descId} className="app-dialog-description">
            {description}
          </p>
        )}
        <div className="app-dialog-body">{children}</div>
      </div>
    </dialog>
  );
}
