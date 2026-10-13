import { Button } from "./Button.jsx";
import { Dialog } from "./Dialog.jsx";
import { DialogFooter } from "./DialogFooter.jsx";

/**
 * UnsavedChangesDialog — Advertencia de cambios sin guardar
 * (Spec 027/RF-UX-03).
 *
 * Ofrece opciones explícitas para no perder información:
 *   - "Seguir editando": cancela la salida y conserva los datos.
 *   - "Guardar cambios": solo si el guardado está disponible y es seguro.
 *   - "Descartar cambios": confirma la pérdida de lo ingresado.
 *
 * Siempre en tono de advertencia (naranja) para señalar el riesgo.
 */
export function UnsavedChangesDialog({
  isOpen,
  onKeepEditing,
  onDiscard,
  onSave,
  saving = false,
  title = "Cambios sin guardar",
  description = "Tenés cambios que todavía no se guardaron. Si salís ahora, se perderán.",
}) {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onKeepEditing}
      title={title}
      description={description}
      className="unsaved-changes-dialog"
      tone="warning"
    >
      <DialogFooter>
        <Button variant="secondary" onClick={onKeepEditing} disabled={saving}>
          Seguir editando
        </Button>
        {onSave && (
          <Button variant="violet" onClick={onSave} busy={saving} busyText="Guardando…">
            Guardar cambios
          </Button>
        )}
        <Button variant="warning" onClick={onDiscard} disabled={saving}>
          Descartar cambios
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
