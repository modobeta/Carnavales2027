import { Button } from "./Button.jsx";
import { Dialog } from "./Dialog.jsx";
import { DialogFooter } from "./DialogFooter.jsx";

/**
 * ConfirmDialog — Confirmación para acciones peligrosas/irreversibles
 * (Spec 027/RF-UX-03). Reemplazo accesible de `window.confirm()`.
 *
 * Reutiliza `Dialog` (foco, Escape, backdrop, retorno de foco).
 * Las consecuencias van en `description` (=> `aria-describedby`).
 * `danger` pinta la acción afirmativa en rojo de cancelar; en otro caso
 * la confirmación usa el verde de la paleta Carnaval.
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
  focusReturnRef,
}) {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      description={description}
      focusReturnRef={focusReturnRef}
      className="confirm-dialog"
    >
<DialogFooter>
        <Button variant="cancel" onClick={onClose} disabled={confirming}>
          {cancelLabel}
        </Button>
        <Button
          variant={danger ? "cancel" : "confirm"}
          onClick={onConfirm}
          disabled={confirming}
          busyText="Procesando…"
        >
          {confirmLabel}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
