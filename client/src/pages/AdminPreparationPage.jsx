import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "../api/http.js";
import { useAdminEvent } from "../context/AdminEventContext.jsx";
import { useUnsavedChanges } from "../hooks/useUnsavedChanges.js";
import { usePreparationNavigationGuard } from "../hooks/usePreparationNavigationGuard.js";
import { PageShell } from "../components/PageShell.jsx";
import { UnsavedChangesDialog } from "../components/UnsavedChangesDialog.jsx";
import { SkeletonLoader } from "../components/SkeletonLoader.jsx";
import { EventConfigurationPage } from "./EventConfigurationPage.jsx";
import { AdminCompetenciaPage } from "./AdminCompetenciaPage.jsx";
import { ADMIN_PREPARATION_STAGES, preparationIssueLocation, preparationLocation, preparationStages } from "../features/admin-preparation.js";
import { isInterpretableReadiness, readinessIssues, READINESS_STATE_LABELS } from "../features/readiness-presentation.js";

const TITLES = {
  data: ["Datos del evento", "El nombre identifica el evento. Después vamos a preparar el calendario."],
  nights: ["Armá el calendario", "Agregá las jornadas de competencia y premiación."],
  catalogo: ["Definí qué se evalúa", "Configurá los rubros y a quién se califica."],
  especialidades: ["Prepará las especialidades", "Identificá las áreas de evaluación del jurado."],
  rubros: ["Prepará los ítems puntuables", "Organizá los ítems de cada rubro y sus especialidades."],
  comparsas: ["Agregá las comparsas", "Configurá sus tipos y participantes cuando corresponda."],
  orden: ["Programá el orden de salida", "Elegí qué comparsas participan en cada jornada y en qué orden."],
};

export function AdminPreparationPage({ initialStage = "event", initialTask = "data", newEvent = false }) {
  const context = useAdminEvent();
  const event = newEvent ? null : context?.activeEvent;
  const stage = ADMIN_PREPARATION_STAGES.find((entry) => entry.key === initialStage) ?? ADMIN_PREPARATION_STAGES[0];
  const task = stage.tasks.find((entry) => entry.key === initialTask)?.key ?? stage.tasks[0]?.key ?? "";
  const stageIndex = ADMIN_PREPARATION_STAGES.indexOf(stage);
  const taskIndex = stage.tasks.findIndex((entry) => entry.key === task);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [finished, setFinished] = useState(false);
  const [resources, setResources] = useState({ eventId: null, availability: "unqueried", readiness: null, nights: null });
  const request = useRef(0);
  const creatingRef = useRef(false);
  const activeEventId = useRef(event?.id);
  activeEventId.current = event?.id;
  const childGuard = useRef(null);
  const [childDirty, setChildDirty] = useState(false);
  const registerGuard = useCallback((guard) => { childGuard.current = guard; setChildDirty(Boolean(guard)); }, []);
  const dirty = newEvent && name !== "";
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const { promptOpen, requestLeave, keepEditing, discard } = useUnsavedChanges({ isDirty: dirty });
  const cancelNavigation = useRef(null);
  const guard = useRef(null);
  const allowedHash = useRef(null);
  guard.current = (proceed, cancel) => {
    if (childGuard.current?.(proceed, cancel)) return true;
    if (!dirtyRef.current) return false;
    cancelNavigation.current = cancel;
    requestLeave(proceed);
    return true;
  };
  usePreparationNavigationGuard(dirty || childDirty, guard, allowedHash);
  useEffect(() => !newEvent && childDirty ? context?.registerEventChangeGuard?.((commit) => guard.current?.(commit) ?? false) : undefined,
    [newEvent, childDirty, context?.registerEventChangeGuard]);

  const navigate = useCallback((nextStage, nextTask, creatingNew = false) => {
    const proceed = () => {
      const href = preparationLocation(nextStage, nextTask, creatingNew);
      allowedHash.current = href;
      window.location.hash = href;
    };
    if (!guard.current?.(proceed)) proceed();
  }, []);
  const refresh = useCallback(async () => {
    if (!event?.id) return;
    const id = event.id;
    const sequence = ++request.current;
    setResources((previous) => ({ eventId: id, availability: "unqueried", readiness: null, nights: previous.eventId === id ? previous.nights : null }));
    const [readiness, nights] = await Promise.allSettled([
      apiRequest(`/api/v1/events/${id}/readiness`), apiRequest(`/api/v1/events/${id}/nights`),
    ]);
    if (sequence !== request.current || id !== activeEventId.current) return;
    const valid = readiness.status === "fulfilled" && isInterpretableReadiness(readiness.value);
    setResources({ eventId: id, availability: valid ? "available" : "unavailable", readiness: valid ? readiness.value : null,
      nights: nights.status === "fulfilled" && Array.isArray(nights.value) ? nights.value : null });
  }, [event?.id]);
  useEffect(() => { setFinished(false); void refresh(); return () => { request.current += 1; }; }, [refresh]);
  const previousStage = useRef(stage.key);
  useEffect(() => {
    if (stage.key === "review" && previousStage.current !== stage.key) void refresh();
    previousStage.current = stage.key;
  }, [stage.key, refresh]);
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus(); }, [stage.key, task, newEvent]);

  const create = async (formEvent) => {
    formEvent.preventDefault();
    if (creatingRef.current) return;
    if (!name.trim()) { setCreateError("Ingresá un nombre para el evento."); return; }
    creatingRef.current = true; setCreating(true); setCreateError("");
    try {
      const created = await apiRequest("/api/v1/events", { method: "POST", body: JSON.stringify({ name: name.trim() }) });
      if (!created?.id) throw new Error("Respuesta de creación incompleta");
      dirtyRef.current = false;
      context?.setActiveEvent?.(created);
      setName("");
      navigate("event", "nights");
    } catch (error) {
      setCreateError(error?.code === "RESOURCE_CONFLICT" ? "Ya existe un evento equivalente. Elegí otro nombre." : "No se pudo crear el evento. Tu nombre se conserva para reintentar.");
    } finally { creatingRef.current = false; setCreating(false); }
  };

  const source = resources.eventId === event?.id ? resources : { availability: "unqueried", readiness: null, nights: null };
  const states = newEvent ? ADMIN_PREPARATION_STAGES.map(() => "incomplete") : preparationStages(source.readiness, source.availability);
  const completed = states.filter((entry) => entry === "complete").length;
  const issues = source.availability === "available" ? readinessIssues(source.readiness).filter((issue) => issue.kind === "blocking") : [];
  const issueAction = (issue) => {
    const destination = preparationIssueLocation(issue);
    if (destination) navigate(...destination);
    else window.location.hash = issue.href;
  };
  const next = () => {
    if (taskIndex >= 0 && taskIndex < stage.tasks.length - 1) navigate(stage.key, stage.tasks[taskIndex + 1].key);
    else if (stageIndex < 3) navigate(ADMIN_PREPARATION_STAGES[stageIndex + 1].key);
  };
  const back = () => {
    if (taskIndex > 0) navigate(stage.key, stage.tasks[taskIndex - 1].key);
    else if (stageIndex > 0) { const previous = ADMIN_PREPARATION_STAGES[stageIndex - 1]; navigate(previous.key, previous.tasks.at(-1)?.key); }
  };
  const title = newEvent ? ["Identificá el evento", "Empezá por el nombre. Después vamos a preparar el calendario."] : TITLES[task];

  return <PageShell layer="instrument" className="admin-preparation-page">
    <section className="admin-preparation-progress" aria-label="Progreso de preparación">
      <div className="admin-preparation-caption"><strong>Preparación del evento</strong><span>{newEvent || source.availability === "available" ? `${completed} de 4 etapas completas` : source.availability === "unqueried" ? "Revisando configuración…" : "Progreso no disponible"}</span></div>
      <div className="admin-preparation-track" role="progressbar" aria-label="Etapas de preparación completas" aria-valuemin="0" aria-valuemax="4" aria-valuenow={newEvent || source.availability === "available" ? completed : undefined} aria-busy={!newEvent && source.availability === "unqueried"}>
        <span style={{ inlineSize: `${completed * 25}%` }} />
      </div>
      <ol className="admin-preparation-steps">{ADMIN_PREPARATION_STAGES.map((entry, index) => <li key={entry.key}>
        <button type="button" aria-current={stage.key === entry.key ? "step" : undefined} disabled={creating || (newEvent && index > 0)} onClick={() => navigate(entry.key, undefined, newEvent)}>
          <span className={`preparation-number${states[index] === "complete" ? " is-complete" : ""}`} aria-hidden="true">{states[index] === "complete" ? "✓" : index + 1}</span>
          <span>{entry.label}<small>{READINESS_STATE_LABELS[states[index]]}</small></span>
        </button>
      </li>)}</ol>
    </section>

    {!newEvent && !event ? <section className="preparation-notice"><h1>Elegí el evento que querés preparar</h1><p>Seleccioná un evento en la cabecera o creá uno nuevo.</p><a href={preparationLocation("event", "data", true)}>Crear evento</a></section> : <>
      {stage.tasks.length > 0 && !newEvent && <nav className="admin-preparation-tasks" aria-label={`Tareas de ${stage.label}`}>{stage.tasks.map((entry) => <button key={entry.key} type="button" aria-current={task === entry.key ? "step" : undefined} onClick={() => navigate(stage.key, entry.key)}>{entry.label}</button>)}</nav>}
      {title && <header className="preparation-task-heading"><h1 ref={heading} tabIndex={-1}>{title[0]}</h1><p>{title[1]}</p></header>}
      {newEvent ? <form className="preparation-create-form" onSubmit={create}>
        <label htmlFor="prepare-event-name">Nombre del evento</label>
        <input id="prepare-event-name" name="name" value={name} required disabled={creating} onChange={(e) => setName(e.target.value)} placeholder="Ej.: Carnavales 2027" />
        {createError && <p role="alert">{createError}</p>}
        <button disabled={creating} type="submit">{creating ? "Creando…" : "Crear y continuar"}</button>
      </form> : stage.key === "event" ? (
        task === "nights" && !source.nights ? <section className="preparation-notice"><p role="status">{source.availability === "unqueried" ? "Cargando jornadas…" : "No se pudieron cargar las jornadas. No se muestran datos incompletos."}</p><button type="button" onClick={() => void refresh()}>Reintentar jornadas</button></section>
        : <EventConfigurationPage key={event.id} event={event} nights={source.nights ?? []} guidedTask={task} onRegisterGuard={registerGuard} onPreparationChange={refresh} onEventChange={context?.updateEvent} onContinue={() => navigate("event", "nights")} />
      ) : stage.key === "evaluation" || stage.key === "troupes" ? <AdminCompetenciaPage key={event.id} event={event} embedded initialStep={stage.key === "troupes" ? "participantes" : task} preparationTask={task} onRegisterGuard={registerGuard} onPreparationChange={refresh} onPreparationNavigate={navigate} />
      : <section className="preparation-review" aria-label="Revisión de preparación">
        <h1 ref={heading} tabIndex={-1}>{source.availability === "available" ? source.readiness.ready ? finished ? "Preparación finalizada" : "El evento está listo para abrir" : "Todavía hay configuración pendiente" : "Revisá antes de terminar"}</h1>
        {source.availability === "unqueried" ? <SkeletonLoader variant="text" rows={2} label="Revisando configuración…" /> : source.availability === "unavailable" ? <p role="alert">No se pudo revisar la configuración. El evento no se marca como listo.</p> : source.readiness.ready ? <>
          <p>La configuración guardada cumple los requisitos de preparación.</p><p className="preparation-secondary">Finalizar no abre el evento. Jurados y votación se preparan después, por jornada.</p>
          <details><summary>Ver resumen</summary><p>Evento: {event.name}</p><p>Jornadas: {source.nights?.length ?? "No disponibles"}</p><p>Configuración verificada.</p></details>
          <button type="button" onClick={() => finished ? (window.location.hash = "#/admin/home") : setFinished(true)}>{finished ? "Volver a mis eventos" : "Finalizar preparación"}</button>
        </> : issues.length ? <>
          <div className="preparation-issue"><h2>{issues[0].title}</h2><p>{issues[0].description}</p><button type="button" onClick={() => issueAction(issues[0])}>{issues[0].action} →</button></div>
          {issues.length > 1 && <details><summary>Ver otros {issues.length - 1} faltantes</summary><ul>{issues.slice(1).map((issue) => <li key={issue.key}><strong>{issue.title}</strong><button type="button" className="secondary" onClick={() => issueAction(issue)}>{issue.action}</button></li>)}</ul></details>}
        </> : <p>Todavía no está listo. Reintentá la revisión antes de finalizar.</p>}
        {!source.readiness?.ready && <button type="button" className="secondary" onClick={() => void refresh()}>Revisar nuevamente</button>}
      </section>}
      {!newEvent && stage.key !== "review" && !(stage.key === "event" && task === "data") && <nav className="preparation-navigation" aria-label="Navegación del asistente"><button type="button" className="secondary" onClick={back}>← Atrás</button><button type="button" onClick={next}>Continuar →</button></nav>}
    </>}
    <UnsavedChangesDialog isOpen={promptOpen} onKeepEditing={() => { cancelNavigation.current?.(); cancelNavigation.current = null; keepEditing(); }} onDiscard={() => { dirtyRef.current = false; setName(""); discard(); }} />
  </PageShell>;
}
