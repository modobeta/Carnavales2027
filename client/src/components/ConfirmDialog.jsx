import { Button } from "./Button.jsx";
import { Dialog } from "./Dialog.jsx";
import { DialogFooter } from "./DialogFooter.jsx";

/**
 * ConfirmDialog — Confirmación para acciones peligrosas/irreversibles
 * (Spec 027/RF-UX-03). Reemplazo accesible de `window.confirm()`.
 *
 * Reutiliza `Dialog` (foco, Escape, backdrop, retorno de foco).
 * Las consecuencias van en `description` (=> `aria-describedby`).
 *
 * `tone` define el lenguaje visual y la acción afirmativa:
 *   - "danger"  → acción destructiva (rojo).
 *   - "warning" → advertencia / cambio delicado (naranja). Predeterminado.
 *   - "success" → confirmación de algo que avanza un proceso (verde).
 *   - "violet"  → acción habitual de creación/edición.
 * Se conserva `danger` por retrocompatibilidad.
 */
export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  confirming = false,
  danger = false,
  tone,
  focusReturnRef,
}) {
  const resolvedTone = tone ?? (danger ? "danger" : "warning");
  const confirmVariant = resolvedTone === "default" ? "confirm" : resolvedTone;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      description={description}
      focusReturnRef={focusReturnRef}
      className="confirm-dialog"
      tone={resolvedTone}
    >
      <DialogFooter>
        <Button variant="secondary" onClick={onClose} disabled={confirming}>
          {cancelLabel}
        </Button>
        <Button
          variant={confirmVariant}
          onClick={onConfirm}
          disabled={confirming}
          busy={confirming}
          busyText="Procesando…"
        >
          {confirmLabel}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
