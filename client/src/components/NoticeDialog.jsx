import { Button } from "./Button.jsx";
import { Dialog } from "./Dialog.jsx";
import { DialogFooter } from "./DialogFooter.jsx";

/**
 * NoticeDialog — Modal de resultado para operaciones que requieren
 * una decisión o confirmación de lectura del usuario.
 * (Spec 027/RF-UX-03)
 *
 * Usar cuando la operación es lo bastante relevante como para exigir
 * una pausa (éxito de un cierre, error general, advertencia). Para
 * guardados frecuentes y simples preferir una notificación breve
 * (`useNotify`) en lugar de un modal.
 *
 * `tone` acepta: "success" | "warning" | "error" | "info".
 */
const TONE_TO_DIALOG = {
  success: "success",
  warning: "warning",
  error: "danger",
  danger: "danger",
  info: "info",
};

const TONE_TO_BUTTON = {
  success: "success",
  warning: "warning",
  error: "danger",
  danger: "danger",
  info: "primary",
};

const TONE_ICONS = {
  success: "✓",
  warning: "⚠",
  error: "✕",
  danger: "✕",
  info: "i",
};

export function NoticeDialog({
  isOpen,
  onClose,
  tone = "info",
  title,
  description,
  children,
  actionLabel = "Entendido",
  onAction,
  focusReturnRef,
  busy = false,
}) {
  const resolvedTone = TONE_TO_DIALOG[tone] ?? "info";
  const icon = TONE_ICONS[tone] ?? "i";

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      focusReturnRef={focusReturnRef}
      className="notice-dialog"
      tone={resolvedTone}
      icon={false}
    >
      <div className={`notice-dialog-body notice-dialog-body--${tone}`}>
        <span className="notice-dialog-icon" aria-hidden="true">{icon}</span>
        <div className="notice-dialog-text">
          {description && <p className="notice-dialog-description">{description}</p>}
          {children}
        </div>
      </div>
      <DialogFooter>
        <Button
          variant={TONE_TO_BUTTON[tone] ?? "primary"}
          onClick={onAction ?? onClose}
          busy={busy}
        >
          {actionLabel}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
