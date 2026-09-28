import { useEffect, useState } from "react";
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
  assignedJudgeIds = [],
  submitting = false,
  focusReturnRef,
}) {
  const [assignmentType, setAssignmentType] = useState("PRIMARY");
  const standbyMissing = assignmentType === "SUBSTITUTE" && primaryOptions.length === 0;
  useEffect(() => {
    if (isOpen) setAssignmentType("PRIMARY");
  }, [isOpen]);

  const availableJudges = judges.filter((judge) => !assignedJudgeIds.includes(judge.id));
  const canSubmit = (assignmentType === "PRIMARY" || !standbyMissing) && availableJudges.length > 0;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={assignmentType === "SUBSTITUTE" ? "Asignar jurado suplente" : "Asignar jurado"}
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
              <small>Cubre a un titular de esta especialidad</small>
            </span>
          </label>
        </fieldset>
        {assignmentType === "SUBSTITUTE" && (
          <section className="standby-assignment-flow" aria-label="Vincular el suplente con su titular">
            {primaryOptions.length === 1 ? (
              <>
                <p className="standby-assignment-hint">
                  Suplente de: <strong>{primaryOptions[0].judgeName}</strong>
                </p>
                <input type="hidden" name="standbyForAssignmentId" value={primaryOptions[0].id} />
              </>
            ) : primaryOptions.length > 1 ? (
              <>
                <label htmlFor="assignment-standby">Suplente de</label>
                <p className="standby-assignment-hint">Elegí al titular de {nightName} · {specialtyName} que este jurado podrá cubrir.</p>
                <select id="assignment-standby" name="standbyForAssignmentId" required defaultValue="">
                  <option value="">Elegir titular</option>
                  {primaryOptions.map((assignment) => (
                    <option key={assignment.id} value={assignment.id}>
                      {assignment.judgeName}
                    </option>
                  ))}
                </select>
                {availableJudges.length > 0 && (
                  <p className="standby-assignment-hint">El suplente quedará vinculado solo a este titular y esta especialidad.</p>
                )}
              </>
            ) : (
              <p className="standby-assignment-hint" role="status">No hay titulares disponibles en {nightName} · {specialtyName}. Asigná primero un jurado titular o revisá si ya tiene suplente.</p>
            )}
          </section>
        )}
        <label htmlFor="assignment-judge">Jurado</label>
        {assignmentType === "SUBSTITUTE" && <p className="standby-assignment-hint">El jurado elegido quedará registrado como suplente.</p>}
        <select id="assignment-judge" name="judgeProfileId" required defaultValue="" disabled={assignmentType === "SUBSTITUTE" && availableJudges.length === 0}>
          <option value="">Elegir jurado</option>
          {availableJudges.map((judge) => (
            <option key={judge.id} value={judge.id}>
              {judge.name}
            </option>
          ))}
        </select>
        {assignmentType === "SUBSTITUTE" && availableJudges.length === 0 && primaryOptions.length > 0 && (
          <p className="standby-assignment-hint" role="status">Todos los jurados registrados ya tienen una asignación activa en esta noche.</p>
        )}
        {standbyMissing && <p className="feedback">No hay titular asignado para esta especialidad.</p>}
        <DialogFooter>
          <button type="button" className="secondary" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button type="submit" disabled={submitting || !canSubmit}>
            {submitting ? "Asignando…" : "Asignar"}
          </button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
