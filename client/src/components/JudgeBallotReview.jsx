import { useEffect, useRef } from "react";

export function JudgeBallotReview({ ballot, groups, canSubmit, isSubmitting, online, message, onBack, onConfirm }) {
  const headingRef = useRef(null);
  useEffect(() => { headingRef.current?.focus(); }, []);
  return (
    <section className="judge-ballot-review" aria-labelledby="review-heading">
      <button type="button" className="judge-review-back" onClick={onBack} disabled={isSubmitting}>← Volver a la evaluación</button>
      <header className="judge-review-heading">
        <h1 id="review-heading" ref={headingRef} tabIndex={-1}>Revisá tu planilla</h1>
        <p>El cierre incluye las {groups.length} comparsas de esta planilla. No se cierra una sola comparsa.</p>
      </header>
      {!online && <p className="judge-connection-notice" role="alert">Sin conexión. No se puede confirmar el cierre. Reintentá manualmente cuando recuperes la conexión.</p>}
      {message && <p className="feedback" role="status">{message}</p>}
      <div className="judge-review-layout">
        <table className="judge-review-table">
          <caption className="sr-only">Puntuaciones registradas de {ballot.nightName} · {ballot.specialtyName}</caption>
          <thead><tr><th scope="col">Ítem</th><th scope="col">Puntuación</th></tr></thead>
          {groups.map((group) => <tbody key={group.nightScheduleId}>
            <tr className="judge-review-group"><th colSpan={2} scope="rowgroup">{group.troupeName}</th></tr>
            {Object.values(group.rubrics).flatMap((rubric) => rubric.scores.map((score) => <tr key={score.id}>
              <th scope="row"><span>{score.itemName}</span>{score.participantName && <small>{score.participantName}</small>}{rubric.rubricName !== ballot.specialtyName && <small>Rubro: {rubric.rubricName}</small>}</th>
              <td>{score.evaluationState === "NOT_PRESENTED" ? "No se presentó (0)" : score.score}</td>
            </tr>))}
          </tbody>)}
        </table>
        <aside className="judge-review-aside">
          <h2>Cierre definitivo</h2>
          <p>Las puntuaciones ya registradas no se pueden editar. Al cerrar, presentás toda la planilla.</p>
          <button type="button" disabled={!canSubmit} onClick={onConfirm}>{isSubmitting ? "Confirmando…" : "Confirmar y cerrar planilla"}</button>
          <small>Se solicita una última confirmación.</small>
        </aside>
      </div>
    </section>
  );
}
