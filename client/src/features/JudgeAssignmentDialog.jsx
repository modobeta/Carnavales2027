import { useState } from "react";
import { Dialog } from "../components/Dialog.jsx";
import { DialogFooter } from "../components/DialogFooter.jsx";

/**
 * JudgeAssignmentDialog — Alta de asignación con progressive disclosure
 * (Spec 027/E3, RF-UX-04). Noche y especialidad vienen del contexto del
 * board; "Suplente de…" solo aparece si elige Suplente. El contrato API
 * ({ nightId, specialtyId, judgeProfileId, assignmentType,
 * standbyForAssignmentId }) no cambia.
 */
export function JudgeAssignmentDialog({
  isOpen,
  onClose,
  onSubmit,
  nightName,
  specialtyName,
  judges = [],
  primaryOptions = [],
  submitting = false,
  focusReturnRef,
}) {
  const [assignmentType, setAssignmentType] = useState("PRIMARY");
  const standbyMissing = assignmentType === "SUBSTITUTE" && primaryOptions.length === 0;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Asignar jurado"
      description={`${nightName} · ${specialtyName}`}
      focusReturnRef={focusReturnRef}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const values = new FormData(event.currentTarget);
          onSubmit({
            judgeProfileId: values.get("judgeProfileId"),
            assignmentType: values.get("assignmentType"),
            standbyForAssignmentId: values.get("standbyForAssignmentId") || undefined,
          });
        }}
      >
        <p>
          Noche: <strong>{nightName}</strong> · Especialidad: <strong>{specialtyName}</strong>
        </p>
        <fieldset className="assignment-type-group">
          <legend className="sr-only">Tipo de asignación</legend>
          <label className={`assignment-type-card ${assignmentType === "PRIMARY" ? "selected" : ""}`}>
            <input
              type="radio"
              name="assignmentType"
              value="PRIMARY"
              className="sr-only"
              aria-label="Titular"
              checked={assignmentType === "PRIMARY"}
              onChange={() => setAssignmentType("PRIMARY")}
            />
            <span className="assignment-type-icon">👤</span>
            <span className="assignment-type-content">
              <strong>Titular</strong>
              <small>Jurado principal que emite votos</small>
            </span>
          </label>
          <label className={`assignment-type-card ${assignmentType === "SUBSTITUTE" ? "selected" : ""}`}>
            <input
              type="radio"
              name="assignmentType"
              value="SUBSTITUTE"
              className="sr-only"
              aria-label="Suplente"
              checked={assignmentType === "SUBSTITUTE"}
              onChange={() => setAssignmentType("SUBSTITUTE")}
            />
            <span className="assignment-type-icon">🔄</span>
            <span className="assignment-type-content">
              <strong>Suplente</strong>
              <small>Reemplazo en caso de ausencia</small>
            </span>
          </label>
        </fieldset>
        <label htmlFor="assignment-judge">Jurado</label>
        <select id="assignment-judge" name="judgeProfileId" required defaultValue="">
          <option value="">Elegir jurado</option>
          {judges.map((judge) => (
            <option key={judge.id} value={judge.id}>
              {judge.name}
            </option>
          ))}
        </select>
        {assignmentType === "SUBSTITUTE" && primaryOptions.length === 1 && (
          <>
            <p>Suplente de: <strong>{primaryOptions[0].judgeName}</strong></p>
            <input type="hidden" name="standbyForAssignmentId" value={primaryOptions[0].id} />
          </>
        )}
        {assignmentType === "SUBSTITUTE" && primaryOptions.length > 1 && (
          <>
            <label htmlFor="assignment-standby">Suplente de</label>
            <select id="assignment-standby" name="standbyForAssignmentId" required defaultValue="">
              <option value="">Elegir titular</option>
              {primaryOptions.map((assignment) => (
                <option key={assignment.id} value={assignment.id}>
                  {assignment.judgeName}
                </option>
              ))}
            </select>
          </>
        )}
        {standbyMissing && <p className="feedback">No hay titular asignado para esta especialidad.</p>}
        <DialogFooter>
          <button type="button" className="secondary" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button type="submit" disabled={submitting || standbyMissing}>
            {submitting ? "Asignando…" : "Asignar"}
          </button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
