import { useEffect, useRef, useState } from "react";
import { Dialog } from "../components/Dialog.jsx";
import { DialogFooter } from "../components/DialogFooter.jsx";
import { StatusPill } from "../components/StatusPill.jsx";

export function TroupeParticipantsSection({ troupe, rubrics, locked, readiness, loading, loadError, unreflected,
  message, subjectTypeLabel, rubricScope, onAdd, onToggle, onRetry, onBack, onConfigure }) {
  const [target, setTarget] = useState(null);
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const trigger = useRef(null);
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus(); }, []);

  const nominationRubrics = rubrics
    .filter((rubric) => rubric.active !== false && rubric.evaluationTarget === "NOMINATION")
    .sort((left, right) => left.name.localeCompare(right.name));
  const missingIds = new Set((readiness?.incompleteNominations ?? [])
    .filter((entry) => entry.troupeId === troupe.id).map((entry) => entry.rubricId));

  const open = (event, next) => {
    trigger.current = event.currentTarget;
    setDisplayName("");
    setError("");
    setTarget(next);
  };
  const close = () => { if (!submitting.current) setTarget(null); };
  const submit = async (event) => {
    event.preventDefault();
    if (!target || locked || submitting.current) return;
    const name = displayName.trim();
    if (!target.nomination && !name) { setError("Escribí el nombre del participante."); return; }
    submitting.current = true;
    setSaving(true);
    setError("");
    try {
      const result = target.nomination
        ? await onToggle(target.nomination, target.rubric, target.active)
        : await onAdd(target.rubric, name);
      if (result?.ok) setTarget(null);
      else setError(result?.error ?? "No se pudo guardar el participante.");
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  return (
    <section className="troupe-nominations-view" aria-label={`Participantes de ${troupe.name}`}>
      <div className="troupe-nominations-header">
        <div>
          <h3 ref={heading} tabIndex={-1}>Participantes de {troupe.name}</h3>
          <p>Agregá cada participante en el rubro que le corresponde.</p>
          {locked && <p>Solo consulta: el evento o la comparsa no permite modificar participantes.</p>}
        </div>
        <button type="button" className="secondary" onClick={onBack} disabled={saving}>Volver a comparsas</button>
      </div>
      {message && <p role="status">{message}</p>}
      {loading && <p role="status">Cargando participantes…</p>}
      {loadError && <div role="alert">No se pudieron comprobar los participantes. <button type="button" className="secondary" onClick={onRetry}>Reintentar</button></div>}
      {unreflected && <p role="status">Estado por comprobar: la lectura todavía no refleja todos los cambios confirmados. <button type="button" className="secondary" onClick={onRetry}>Reintentar</button></p>}
      {!loading && !loadError && nominationRubrics.length === 0 && (
        <div>
          <p>No hay rubros de nominación activos. Creá uno en Rubros para agregar participantes.</p>
          <button type="button" className="secondary" onClick={onConfigure}>Ir a Rubros</button>
        </div>
      )}
      <div className="troupe-nomination-groups">
        {nominationRubrics.map((rubric) => {
          const nominations = (rubric.nominations ?? []).filter((entry) => entry.eventTroupeId === troupe.id);
          const activeCount = nominations.filter((entry) => entry.active).length;
          const atCapacity = rubric.rubricType === "RANDOM" && activeCount >= 3;
          const missing = missingIds.has(rubric.id);
          return (
            <article key={rubric.id} className={`troupe-nomination-group${missing ? " is-missing" : ""}`} aria-label={rubric.name}>
              <header className="troupe-nomination-group-header">
                <div>
                  <h4>{rubric.name}</h4>
                  <p>{rubric.rubricType === "RANDOM" ? `Aleatorio · ${activeCount} de 3 activos` : `${activeCount} participantes activos`}</p>
                </div>
                {missing ? <StatusPill status="PENDING" label="Falta cargar" /> : activeCount > 0 && <StatusPill status="ACTIVE" label="Cargado" />}
              </header>
              {nominations.length === 0 ? <p>Sin participantes.</p> : (
                <ul className="troupe-nomination-list">
                  {nominations.map((nomination) => (
                    <li key={nomination.id}>
                      <span><strong>{nomination.displayName}</strong> <small>· {subjectTypeLabel(nomination.subjectType)}</small>
                        {!nomination.active && <StatusPill status="SUSPENDED" label="Inactivo" />}
                      </span>
                      {!locked && <button type="button" className="secondary"
                        disabled={!nomination.active && atCapacity}
                        aria-label={`${nomination.active ? "Desactivar" : "Reactivar"} a ${nomination.displayName} en ${rubric.name}`}
                        onClick={(event) => open(event, { rubric, nomination, active: !nomination.active })}>
                        {nomination.active ? "Desactivar" : "Reactivar"}
                      </button>}
                    </li>
                  ))}
                </ul>
              )}
              {!locked && (atCapacity ? <p>Máximo 3 participantes activos en este rubro.</p> : (
                <button type="button" className="secondary" aria-label={`Agregar participante a ${rubric.name}`}
                  onClick={(event) => open(event, { rubric })}>Agregar participante</button>
              ))}
            </article>
          );
        })}
      </div>
      <Dialog isOpen={target !== null && !locked} onClose={close} focusReturnRef={trigger}
        title={target?.nomination ? `${target.active ? "Reactivar" : "Desactivar"} participante` : "Agregar participante al rubro"}
        description={target ? `Comparsa: ${troupe.name}. Rubro: ${target.rubric.name}. ${rubricScope(target.rubric)}` : ""}>
        <form className="troupe-nomination-form" onSubmit={submit} aria-busy={saving}>
          {target?.nomination ? <p>¿Confirmás {target.active ? "reactivar" : "desactivar"} a {target.nomination.displayName}?</p> : (
            <label>Nombre del participante
              <input name="displayName" value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoFocus required disabled={saving} />
            </label>
          )}
          {error && <p role="alert">{error}</p>}
          <DialogFooter>
            <button type="button" className="secondary" onClick={close} disabled={saving}>Cancelar</button>
            <button type="submit" disabled={saving}>{saving ? "Guardando…" : target?.nomination ? (target.active ? "Reactivar" : "Desactivar") : "Confirmar y agregar"}</button>
          </DialogFooter>
        </form>
      </Dialog>
    </section>
  );
}
