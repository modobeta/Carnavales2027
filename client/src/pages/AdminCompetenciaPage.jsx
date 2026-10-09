import { Fragment, createContext, useContext, useEffect, useRef, useState } from "react";
import { PageShell } from "../components/PageShell.jsx";
import { apiRequest } from "../api/http.js";
import { removeTroupeLogo, uploadTroupeLogo } from "../api/troupes.js";
import { StatusPill } from "../components/StatusPill.jsx";
import { EntityDrawer } from "../components/EntityDrawer.jsx";
import { Dialog } from "../components/Dialog.jsx";
import { DialogFooter } from "../components/DialogFooter.jsx";
import { Button } from "../components/Button.jsx";
import { TroupeLogo } from "../components/TroupeLogo.jsx";
import { TroupeForm } from "../features/TroupeForm.jsx";
import { CatalogForm } from "../features/CatalogForm.jsx";
import { PREPARATION_STEPS, READINESS_STATE_LABELS, isInterpretableReadiness, readinessIssues, readinessStepStates } from "../features/readiness-presentation.js";
import { uxStatusLabel } from "../components/admin-ux-labels.js";
import { AdminAssignmentsPage } from "./AdminAssignmentsPage.jsx";

const WriteContext = createContext(null);

function SaveForm({ onSubmit, resetOnSuccess = false, ...props }) {
  const { writing, setPending } = useContext(WriteContext);
  return <form {...props} onSubmit={async (e) => {
    e.preventDefault();
    if (writing.current) return;
    const form = e.currentTarget;
    writing.current = true;
    // Read form values before the pending render disables its controls.
    try {
      const result = onSubmit(e);
      setPending(true);
      if (await result && resetOnSuccess) form.reset();
    } finally {
      writing.current = false;
      setPending(false);
    }
  }} />;
}

export function AdminCompetenciaPage({ event, onBack, initialStep = "participantes", initialTab = "" }) {
  const validInitialStep = PREPARATION_STEPS.some((item) => item.key === initialStep) ? initialStep : "participantes";
  const [step, setStep] = useState(validInitialStep);
  const getTabFromHash = () => new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("tab") ?? "";
  const [juryTab, setJuryTab] = useState(() => (initialTab || getTabFromHash()) === "asignaciones" ? "asignaciones" : "especialidades");
  const [rubricTab, setRubricTab] = useState("rubros");
  const [pending, setPending] = useState(false);
  const [focusRubricId, setFocusRubricId] = useState(null);
  const [progress, setProgress] = useState(null);
  const [readinessState, setReadinessState] = useState({ eventId: null, status: "unqueried", data: null });
  const [dataRevision, setDataRevision] = useState(0);
  const writing = useRef(false);
  const progressRequest = useRef(0);

  useEffect(() => {
    setStep(validInitialStep);
    const targetTab = initialTab || getTabFromHash();
    if (targetTab === "asignaciones") {
      setJuryTab("asignaciones");
    } else if (targetTab === "especialidades") {
      setJuryTab("especialidades");
    }
  }, [validInitialStep, initialTab]);

  useEffect(() => {
    const onHashChange = () => {
      const targetTab = getTabFromHash();
      if (targetTab === "asignaciones") {
        setJuryTab("asignaciones");
      } else if (targetTab === "especialidades") {
        setJuryTab("especialidades");
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Conteo liviano para el progreso del asistente (solo lectura; el detalle
  // y las mutaciones siguen en cada sección). Guía sin bloquear (T05 intacta).
  const reloadProgress = () => {
    const request = ++progressRequest.current;
    Promise.all([
      apiRequest(`/api/v1/events/${event.id}/troupes`).catch(() => []),
      apiRequest(`/api/v1/events/${event.id}/categories`).catch(() => []),
      apiRequest(`/api/v1/events/${event.id}/specialties`).catch(() => []),
      apiRequest(`/api/v1/events/${event.id}/rubrics`).catch(() => []),
      apiRequest(`/api/v1/events/${event.id}/orphaned-criteria`).catch(() => []),
    ]).then(([troupes, categories, specialties, rubrics, orphaned]) => {
      if (request === progressRequest.current) setProgress({ troupes, categories, specialties, rubrics, orphaned });
    });
    return () => { progressRequest.current += 1; };
  };

  useEffect(reloadProgress, [event.id]);

  useEffect(() => {
    let active = true;
    setReadinessState({ eventId: event.id, status: "unqueried", data: null });
    apiRequest(`/api/v1/events/${event.id}/readiness`).then((readiness) => {
      if (active) setReadinessState({ eventId: event.id, status: isInterpretableReadiness(readiness) ? "available" : "unavailable", data: isInterpretableReadiness(readiness) ? readiness : null });
    }).catch(() => {
      if (active) setReadinessState({ eventId: event.id, status: "unavailable", data: null });
    });
    return () => { active = false; };
  }, [event.id, dataRevision]);

  const specialtiesActive = (progress?.specialties ?? []).filter((s) => s.active !== false);
  const currentReadiness = readinessState.eventId === event.id ? readinessState.data : null;
  const currentReadinessStatus = readinessState.eventId === event.id ? readinessState.status : "unqueried";
  const stepStatuses = readinessStepStates(currentReadiness, currentReadinessStatus);
  const steps = PREPARATION_STEPS.map((item) => ({ ...item, label: item.key === "rubros" ? "Evaluación" : item.label }));
  const officialIssues = readinessIssues(currentReadiness);
  const activeIndex = Math.max(0, steps.findIndex((item) => item.key === step));

  // Accesibilidad: al cambiar de paso, el foco va al título del paso (no en el montaje inicial).
  const stepTitleRef = useRef(null);
  const firstRenderRef = useRef(true);
  useEffect(() => {
    if (firstRenderRef.current) { firstRenderRef.current = false; return; }
    stepTitleRef.current?.focus();
  }, [step]);

  const goStep = (key) => {
    setStep(key);
  };

  const selectJuryTab = (newTab) => {
    setJuryTab(newTab);
    const search = window.location.hash.split("?")[1] ?? "";
    const params = new URLSearchParams(search);
    params.set("step", "jurados");
    if (newTab === "asignaciones") {
      params.set("tab", "asignaciones");
    } else {
      params.delete("tab");
    }
    const newHash = `#/admin/competencia?${params.toString()}`;
    if (window.location.hash !== newHash) {
      window.history.replaceState(null, "", newHash);
    }
  };

  const statusSummary = (key) => {
    const status = stepStatuses[key];
    if (status === "complete") return `${READINESS_STATE_LABELS[status]} según readiness de la API.`;
    if (status === "incomplete") return "Readiness informa uno o más bloqueos oficiales para este paso.";
    if (status === "unqueried") return "Readiness no consultado todavía.";
    return "Readiness no disponible; no se puede confirmar el estado de este paso.";
  };
  const eventStatusLabel = uxStatusLabel(event.status, "No disponible");

  return (
    <WriteContext.Provider value={{ writing, setPending, reloadProgress, dataRevision, incRevision: () => setDataRevision((r) => r + 1) }}>
      <PageShell layer="instrument" className="admin-shell" aria-busy={pending}>
        <fieldset aria-label="Configuracion de competencia" disabled={pending} className="fieldset-reset">
          <header className="event-header competencia-header">
            <div>
              <p className="eyebrow">Competencia</p>
              <h1>{event.name ?? "Evento"}</h1>
              <p className="competencia-event-status">Estado del evento: {eventStatusLabel}</p>
              <p className="competencia-step-meta">Paso {activeIndex + 1} de {steps.length}</p>
            </div>
            <div className="event-actions">
              {onBack && <button className="secondary" type="button" onClick={onBack}>Volver</button>}
            </div>
          </header>
          <nav className="competencia-nav competencia-stepper" aria-label="Pasos de configuración de competencia">
            <ol>
              {steps.map((item, index) => {
                const state = stepStatuses[item.key];
                const isCurrent = step === item.key;
                const stateLabel = READINESS_STATE_LABELS[state];
                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      className={isCurrent ? "active" : "secondary"}
                      aria-current={isCurrent ? "step" : undefined}
                      aria-label={`Paso ${index + 1} de ${steps.length}: ${item.label}. ${stateLabel}.${isCurrent ? " Paso actual." : ""}`}
                      onClick={() => goStep(item.key)}
                    >
                      <span className="competencia-step-badge" aria-hidden="true">
                        {!isCurrent && state === "complete" ? "✓" : index + 1}
                      </span>
                      <span className="competencia-step-copy">
                        <span className="competencia-step-label">{item.label}</span>
                        <span className="competencia-step-state">{stateLabel}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>
          {step === "participantes" && (
            <section aria-labelledby="competencia-step-title">
              <h2 id="competencia-step-title" ref={stepTitleRef} tabIndex={-1}>Participantes</h2>
              <p className="step-intro">Cargá quiénes participan: primero los tipos, después las comparsas y por último el orden de pasada de cada jornada.</p>
              <StepSummary stepLabel="Participantes" recommendation={statusSummary("participantes")} />
              <section className="competencia-subblock" aria-label="Bloque 1 de 3: Tipos de participación">
                <AdminCategoriesSection key={`categories-${event.id}`} event={event} />
              </section>
              <section className="competencia-subblock" aria-label="Bloque 2 de 3: Comparsas">
                <AdminTroupesSection key={`troupes-${event.id}`} event={event} />
              </section>
              <section className="competencia-subblock" aria-label="Bloque 3 de 3: Orden de pasada por jornada">
                <TroupeScheduleSection key={`schedule-${event.id}`} event={event} />
              </section>
            </section>
          )}
          {step === "jurados" && (
            <section aria-labelledby="competencia-step-title">
              <h2 id="competencia-step-title" ref={stepTitleRef} tabIndex={-1}>Jurados y especialidades</h2>
              <p className="step-intro">Primero creá al menos una especialidad activa. Después vas a poder asignar jurados a cada especialidad. Administrá el padrón en <a href="#/admin/judges">Jurados</a>.</p>
              <StepSummary stepLabel="Jurados y especialidades" recommendation={statusSummary("jurados")} />
              <div className="competencia-tabs" role="tablist" aria-label="Especialidades y asignaciones">
                <button
                  type="button"
                  role="tab"
                  id="competencia-tab-especialidades"
                  aria-controls="competencia-jurados-panel"
                  aria-selected={juryTab === "especialidades"}
                  className={juryTab === "especialidades" ? "active" : "secondary"}
                  onClick={() => selectJuryTab("especialidades")}
                >
                  Especialidades
                </button>
                <button
                  type="button"
                  role="tab"
                  id="competencia-tab-asignaciones"
                  aria-controls="competencia-jurados-panel"
                  aria-selected={juryTab === "asignaciones"}
                  className={juryTab === "asignaciones" ? "active" : "secondary"}
                  onClick={() => selectJuryTab("asignaciones")}
                >
                  Asignar jurados
                </button>
              </div>
              <div role="tabpanel" id="competencia-jurados-panel" aria-labelledby={`competencia-tab-${juryTab}`} tabIndex={0}>
                {juryTab === "especialidades" ? (
                  <>
                    <AdminSpecialtiesSection key={`specialties-${event.id}`} event={event} />
                    {specialtiesActive.length === 0 && <p className="field-hint">Creá o reactivá una especialidad para habilitar las asignaciones.</p>}
                  </>
                ) : (
                  <AdminAssignmentsPage initialEventId={event.id} embedded={true} />
                )}
              </div>
            </section>
          )}
          {step === "rubros" && (
            <section aria-labelledby="competencia-step-title">
              <h2 id="competencia-step-title" ref={stepTitleRef} tabIndex={-1}>Configurar evaluación</h2>
              <p className="step-intro">Definí qué va a evaluar cada jurado y cómo se registrará su evaluación.</p>
              <div className="competencia-tabs" role="tablist" aria-label="Rubros e ítems">
                <button type="button" role="tab" id="competencia-tab-rubros" aria-controls="competencia-rubros-panel"
                  aria-selected={rubricTab === "rubros"} className={rubricTab === "rubros" ? "active" : "secondary"}
                  onClick={() => setRubricTab("rubros")}>Rubros</button>
                <button type="button" role="tab" id="competencia-tab-items" aria-controls="competencia-rubros-panel"
                  aria-selected={rubricTab === "items"} className={rubricTab === "items" ? "active" : "secondary"}
                  onClick={() => setRubricTab("items")}>Ítems</button>
              </div>
              <div role="tabpanel" id="competencia-rubros-panel" aria-labelledby={`competencia-tab-${rubricTab}`} tabIndex={0}>
              <AdminRubricsSection
                key={`rubrics-${event.id}`}
                event={event}
                focusRubricId={focusRubricId}
                readiness={currentReadiness}
                readinessStatus={currentReadinessStatus}
                onBack={() => goStep("jurados")}
                onContinue={() => goStep("revision")}
                tab={rubricTab}
              />
              </div>
              <CompetenciaOverview key={`overview-${event.id}`} event={event} />
              <EvaluationStepSummary progress={progress} readiness={currentReadiness} readinessStatus={currentReadinessStatus} onBack={() => goStep("jurados")} onContinue={() => goStep("revision")} />
            </section>
          )}
          {step === "revision" && (
            <section aria-labelledby="competencia-step-title">
              <h2 id="competencia-step-title" ref={stepTitleRef} tabIndex={-1}>Revisión final</h2>
              <p className="step-intro">Revisá únicamente los bloqueos oficiales de apertura informados por la API.</p>
              <StepSummary stepLabel="Revisión final" recommendation={statusSummary("revision")} />
              {currentReadinessStatus === "available" ? currentReadiness.ready ? (
                <p className="readiness-ok">La API confirma que no hay bloqueos oficiales de apertura.</p>
              ) : (
                <ul className="readiness-checklist" aria-label="Bloqueos oficiales de readiness">
                  {officialIssues.map((issue) => <li key={issue.key} className="readiness-fail">
                    <span className="readiness-icon" aria-hidden="true">!</span>
                    <span><strong>{issue.title}</strong><span>{issue.description}</span></span>
                    <a href={issue.href}>{issue.action}</a>
                  </li>)}
                </ul>
              ) : <p role="status">{currentReadinessStatus === "unqueried" ? "Readiness no consultado." : "No se pudo consultar readiness; revisá Eventos para volver a consultar."}</p>}
              {currentReadinessStatus === "unavailable" && <a className="button-link" href="#/admin/events">Reintentar en Eventos</a>}
            </section>
          )}
        </fieldset>
      </PageShell>
    </WriteContext.Provider>
  );
}

function StepSummary({ stepLabel, recommendation }) {
  if (!recommendation) return null;
  return (
    <section className="competencia-step-summary" aria-label={`Resumen del paso ${stepLabel}`}>
      <h3>Resumen del paso</h3>
      <p role="status">{recommendation}</p>
    </section>
  );
}

function CompetenciaOverview({ event }) {
  const [data, setData] = useState(null);
  const [message, setMessage] = useState("");
  const [criterionConfirmTarget, setCriterionConfirmTarget] = useState(null);
  const locked = event.status === "OPEN";

  const { writing, setPending, incRevision, reloadProgress, dataRevision } = useContext(WriteContext);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest(`/api/v1/events/${event.id}/rubrics`),
      apiRequest(`/api/v1/events/${event.id}/orphaned-criteria`),
    ]).then(([rubrics, orphaned]) => {
      if (!active) return;
      setData({ rubrics, orphaned });
    }).catch(() => { if (active) setMessage("No se pudo cargar el resumen."); });
    return () => { active = false; };
  }, [event.id, dataRevision]);

  const reassignCriterion = async (criterionId, scoringItemId) => {
    if (writing.current) return;
    writing.current = true;
    setPending(true);
    try {
      const saved = await apiRequest(`/api/v1/rubric-criteria/${criterionId}`, {
        method: "PATCH",
        body: JSON.stringify({ scoringItemId }),
      });
      setData((previous) => ({
        ...previous,
        orphaned: previous.orphaned.filter((criterion) => criterion.id !== criterionId),
        rubrics: previous.rubrics.map((rubric) => rubric.id === saved.rubricId
          ? { ...rubric, criteria: [...(rubric.criteria ?? []), saved] }
          : rubric),
      }));
      setMessage("Criterio reasignado.");
      if (incRevision) incRevision();
      if (reloadProgress) reloadProgress();
      return true;
    } catch {
      setMessage("No se pudo reasignar el criterio.");
    } finally {
      writing.current = false;
      setPending(false);
    }
  };

  if (message && !data) return <p role="status">{message}</p>;
  if (!data) return <p>Cargando resumen...</p>;
  if (data.orphaned.length === 0) return null;

  return (
    <section className="config-section evaluation-review-items">
      <div className="section-heading">
        <h3>Otros elementos por revisar</h3>
        <p>Estos criterios todavía no están vinculados a un ítem.</p>
      </div>
      <p className="feedback" role="status">{message}</p>
      <div className="overview-alert">
        <strong>{data.orphaned.length} criterio(s) pendiente(s) de vincular</strong>
        <p>Elegí el ítem al que corresponde cada criterio para que el jurado pueda consultarlo.</p>
        {data.orphaned.map((criterion) => {
          const items = (data.rubrics.find((rubric) => rubric.id === criterion.rubricId)?.items ?? [])
            .filter((item) => item.active !== false);
          return (
            <SaveForm key={criterion.id} onSubmit={(e) => {
              const scoringItemId = new FormData(e.currentTarget).get("scoringItemId");
              setCriterionConfirmTarget({ criterion, scoringItemId });
              return false;
            }}>
              <span>{criterion.rubricName}: {criterion.description}</span>
              <select name="scoringItemId" aria-label={`Item para ${criterion.rubricName}: ${criterion.description}`} required disabled={locked || items.length === 0}>
                <option value="">Seleccionar ítem</option>
                {items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <button type="submit" aria-label={`Reasignar ${criterion.description}`} disabled={locked || items.length === 0}>Vincular</button>
            </SaveForm>
          );
        })}
      </div>
      <Dialog
        isOpen={criterionConfirmTarget !== null && !locked}
        onClose={() => setCriterionConfirmTarget(null)}
        title="Confirmar reasignación"
        description={criterionConfirmTarget ? `El criterio ${criterionConfirmTarget.criterion.description} se moverá a otro ítem puntuable.` : ""}
      >
        <DialogFooter>
          <Button variant="secondary" onClick={() => setCriterionConfirmTarget(null)}>Cancelar</Button>
          <Button variant="primary" onClick={async () => {
            const target = criterionConfirmTarget;
            setCriterionConfirmTarget(null);
            if (target) await reassignCriterion(target.criterion.id, target.scoringItemId);
          }}>Confirmar reasignación</Button>
        </DialogFooter>
      </Dialog>
    </section>
  );
}

function EvaluationStepSummary({ progress, readiness, readinessStatus, onBack, onContinue }) {
  const specialties = (progress?.specialties ?? []).filter((specialty) => specialty.active !== false);
  const rubrics = (progress?.rubrics ?? []).filter((rubric) => rubric.active !== false);
  const items = rubrics.flatMap((rubric) => (rubric.items ?? []).filter((item) => item.active !== false));
  const coveredSpecialtyIds = new Set(items.map((item) => item.specialtyId));
  const pendingRubrics = readiness?.incompleteRubrics ?? [];
  const pendingNominations = readiness?.incompleteNominations ?? [];
  const missingActiveRubrics = readiness?.missing?.includes("ACTIVE_RUBRIC");
  const pendingCriteria = progress?.orphaned?.length ?? 0;

  return (
    <section className="evaluation-step-summary" aria-labelledby="evaluation-summary-title">
      <h3 id="evaluation-summary-title">Resumen de evaluación</h3>
      {progress ? <dl className="evaluation-summary-stats">
        <div><dt>Especialidades con rubros</dt><dd>{specialties.filter((specialty) => coveredSpecialtyIds.has(specialty.id)).length} de {specialties.length}</dd></div>
        <div><dt>Rubros activos</dt><dd>{rubrics.length}</dd></div>
        <div><dt>Ítems activos</dt><dd>{items.length}</dd></div>
      </dl> : <p role="status">Cargando el resumen de evaluación…</p>}
      {readinessStatus === "available" ? (
        pendingRubrics.length || missingActiveRubrics || pendingNominations.length || pendingCriteria ? (
          <div className="evaluation-summary-pending" role="status">
            <strong>Hay puntos de evaluación para revisar.</strong>
            <ul>
              {missingActiveRubrics && <li>No hay rubros activos.</li>}
              {pendingRubrics.length > 0 && <li>{pendingRubrics.length} rubro(s) necesitan ítems activos y especialidades disponibles.</li>}
              {pendingNominations.length > 0 && <li>Faltan participantes nominados en {pendingNominations.length} combinación(es) de rubro y comparsa.</li>}
              {pendingCriteria > 0 && <li>{pendingCriteria} criterio(s) todavía deben vincularse a un ítem.</li>}
            </ul>
          </div>
        ) : <p className="evaluation-summary-status" role="status">Readiness no informa pendientes de rubros o nominaciones.</p>
      ) : <p className="evaluation-summary-status" role="status">No se pudo comprobar el estado de evaluación ahora. La Revisión final verificará los bloqueos oficiales.</p>}
      <nav className="evaluation-step-actions" aria-label="Navegación de evaluación">
        <button type="button" className="secondary" onClick={onBack}>Volver</button>
        <button type="button" onClick={onContinue}>Continuar a revisión</button>
      </nav>
    </section>
  );
}

function AdminTroupesSection({ event }) {
  const [troupes, setTroupes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [drawerMode, setDrawerMode] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [mutationTarget, setMutationTarget] = useState(null);
  const drawerTriggerRef = useRef(null);
  const deleteTriggerRef = useRef(null);
  const { writing, setPending, dataRevision, incRevision, reloadProgress } = useContext(WriteContext);

  useEffect(() => {
    let active = true;
    apiRequest(`/api/v1/events/${event.id}/troupes`).then((loaded) => { if (active) setTroupes(loaded); }).catch(() => {});
    apiRequest(`/api/v1/events/${event.id}/categories`).then((loaded) => { if (active) setCategories(loaded); }).catch(() => {});
    return () => { active = false; };
  }, [event.id, dataRevision]);

  const locked = event.status === "OPEN";
  const activeCategories = categories.filter((c) => c.active !== false);

  const save = async (path, body, method = "POST") => {
    try {
      const saved = await apiRequest(path, { method, body: JSON.stringify(body) });
      const fresh = await apiRequest(`/api/v1/events/${event.id}/troupes`).catch(() => null);
      if (fresh) setTroupes(fresh);
      else setTroupes((prev) => {
        if (method === "POST") return [...prev, saved];
        return prev.map((t) => t.id === saved.id ? { ...t, ...saved } : t);
      });
      setMessage("Guardado.");
      setDrawerMode(null);
      if (incRevision) incRevision();
      if (reloadProgress) reloadProgress();
      return saved;
    } catch (e) {
      if (e.code === "CATEGORY_INACTIVE") setMessage("La categoria seleccionada esta inactiva.");
      else if (e.code === "VALIDATION_ERROR") setMessage("Revisa los campos: el nombre y el tipo son obligatorios y el color debe tener formato #RRGGBB.");
      else if (e.code === "EVENT_LOCKED") setMessage("El evento ya no permite modificar su configuracion.");
      else setMessage("No se pudo guardar.");
      return null;
    }
  };

  // La comparsa ya quedó guardada cuando falla el logo: informamos eso y
  // dejamos reintentar desde Editar, sin volver a crear la comparsa.
  const logoErrorMessage = (error) => {
    if (error?.code === "PAYLOAD_TOO_LARGE") return "Los datos se guardaron, pero el logo supera 1 MB.";
    if (error?.code === "VALIDATION_ERROR") return "Los datos se guardaron, pero el logo no es válido (PNG, JPG, WebP o SVG hasta 1 MB).";
    if (error?.code === "EVENT_LOCKED") return "Los datos se guardaron, pero el evento ya no permite modificar el logo.";
    return "Los datos se guardaron, pero no se pudo guardar el logo. Reintentá desde Editar.";
  };

  const submitTroupe = async (payload, confirmed = false) => {
    const { logoFile = null, removeLogo = false, ...fields } = payload ?? {};
    if (drawerMode?.mode === "edit" && !confirmed) {
      setMutationTarget({ title: "Guardar cambios de comparsa", description: `Se actualizarán los datos de ${editingTroupe?.name ?? "la comparsa"}.`, confirm: () => submitTroupe(payload, true) });
      return;
    }
    if (writing.current) return;
    writing.current = true;
    setPending(true);
    setSaving(true);
    try {
      const isEdit = drawerMode?.mode === "edit";
      const path = isEdit ? `/api/v1/troupes/${drawerMode.troupeId}` : `/api/v1/events/${event.id}/troupes`;
      const saved = await save(path, fields, isEdit ? "PATCH" : "POST");
      if (saved && (logoFile || removeLogo)) {
        try {
          if (logoFile) await uploadTroupeLogo(saved.id, logoFile);
          else await removeTroupeLogo(saved.id);
          const fresh = await apiRequest(`/api/v1/events/${event.id}/troupes`).catch(() => null);
          if (fresh) setTroupes(fresh);
          setMessage(logoFile ? "Guardado. Logo actualizado." : "Guardado. Logo eliminado.");
        } catch (error) {
          setMessage(logoErrorMessage(error));
        }
      }
    } finally {
      writing.current = false;
      setPending(false);
      setSaving(false);
    }
  };

  const confirmDeleteTroupe = async () => {
    const target = deleteTarget;
    setDeleteTarget(null);
    if (!target || writing.current) return;
    writing.current = true;
    setPending(true);
    try {
      await apiRequest(`/api/v1/troupes/${target.id}`, { method: "PATCH", body: JSON.stringify({ active: false }) });
      const fresh = await apiRequest(`/api/v1/events/${event.id}/troupes`).catch(() => null);
      if (fresh) setTroupes(fresh);
      else setTroupes((prev) => prev.map((t) => t.id === target.id ? { ...t, active: false } : t));
      setMessage(`Comparsa ${target.name} eliminada (desactivada en BD).`);
      if (incRevision) incRevision();
      if (reloadProgress) reloadProgress();
    } catch {
      setMessage("No se pudo eliminar la comparsa.");
    } finally {
      writing.current = false;
      setPending(false);
    }
  };

  const reactivateTroupe = async (troupe, confirmed = false) => {
    if (!confirmed) {
      setMutationTarget({ title: "Reactivar comparsa", description: `Se volverá a incluir ${troupe.name} en la competencia.`, confirm: () => reactivateTroupe(troupe, true) });
      return;
    }
    if (writing.current) return;
    writing.current = true;
    setPending(true);
    try {
      await apiRequest(`/api/v1/troupes/${troupe.id}`, { method: "PATCH", body: JSON.stringify({ active: true }) });
      const fresh = await apiRequest(`/api/v1/events/${event.id}/troupes`).catch(() => null);
      if (fresh) setTroupes(fresh);
      else setTroupes((prev) => prev.map((t) => t.id === troupe.id ? { ...t, active: true } : t));
      setMessage(`Comparsa ${troupe.name} reactivada.`);
      if (incRevision) incRevision();
      if (reloadProgress) reloadProgress();
    } catch (e) {
      setMessage(e.code === "CATEGORY_INACTIVE" ? "No se puede reactivar: la categoria esta inactiva." : "No se pudo reactivar la comparsa.");
    } finally {
      writing.current = false;
      setPending(false);
    }
  };

  const filtered = troupes.filter((troupe) => {
    if (statusFilter === "active" && troupe.active === false) return false;
    if (statusFilter === "inactive" && troupe.active !== false) return false;
    if (categoryFilter !== "all" && troupe.categoryId !== categoryFilter) return false;
    const query = search.trim().toLowerCase();
    if (query && !(troupe.name ?? "").toLowerCase().includes(query)) return false;
    return true;
  });

  const editingTroupe = drawerMode?.mode === "edit" ? troupes.find((t) => t.id === drawerMode.troupeId) : null;

  return (
    <section className="config-section">
      <div className="section-heading">
        <h2>Comparsas</h2>
        <p>Eliminar oculta la comparsa de la vista y la conserva desactivada en BD. Para verlas usa el filtro de estado.</p>
      </div>
      <p className="feedback" role="status">{message}</p>
      {!locked && <button type="button" onClick={(event) => { drawerTriggerRef.current = event.currentTarget; setDrawerMode({ mode: "create", ts: Date.now() }); }}>+ Nueva comparsa</button>}
      <div className="troupe-filters">
        <label>Buscar<input type="search" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar comparsa por nombre" placeholder="Buscar por nombre" /></label>
        <label>Tipo<select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} aria-label="Filtrar comparsas por tipo">
          <option value="all">Todos los tipos</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></label>
        <label>Estado<select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filtrar comparsas por estado">
          <option value="all">Todas</option>
          <option value="active">Activas</option>
          <option value="inactive">Inactivas</option>
        </select></label>
        <span className="filter-count" role="status">{filtered.length} de {troupes.length} comparsas</span>
      </div>
      {filtered.length === 0 ? (
        <p className="empty-state">Sin comparsas para los filtros actuales.</p>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Comparsa</th>
                <th scope="col">Tipo</th>
                <th scope="col">Estado</th>
                {!locked && <th scope="col">Acción</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((troupe) => (
                <tr key={troupe.id}>
                  <td>
                    <span className="troupe-cell">
                      <TroupeLogo troupeId={troupe.id} hasLogo={troupe.hasLogo} sha256={troupe.logoSha256} alt={`Logo de ${troupe.name}`} />
                      {troupe.brandColor && <span className="troupe-swatch" role="img" aria-label={`Color ${troupe.brandColor}`} style={{ backgroundColor: troupe.brandColor }} />}
                      <span>
                        <strong>{troupe.name}</strong>
                        <span className="troupe-preview" aria-label={`Vista jurado de ${troupe.name}`}>Vista jurado: {troupe.name}{troupe.brandColor ? ` (${troupe.brandColor})` : " (sin color)"}</span>
                      </span>
                    </span>
                  </td>
                  <td>{troupe.categoryName ?? "Sin tipo"}</td>
                  <td><StatusPill status={troupe.active ? "ACTIVE" : "SUSPENDED"} label={troupe.active ? "Activa" : "Inactiva"} /></td>
                  {!locked && (
                    <td>
                      <button className="secondary" type="button" aria-label={`Editar comparsa ${troupe.name}`} onClick={(event) => { drawerTriggerRef.current = event.currentTarget; setDrawerMode({ mode: "edit", troupeId: troupe.id }); }}>
                        Editar
                      </button>{" "}
                      {troupe.active !== false ? (
                        <button className="secondary danger-action" type="button" aria-label={`Eliminar comparsa ${troupe.name}`} onClick={(event) => { deleteTriggerRef.current = event.currentTarget; setDeleteTarget(troupe); }}>
                          Eliminar
                        </button>
                      ) : (
                        <button className="secondary" type="button" aria-label={`Reactivar comparsa ${troupe.name}`} onClick={() => reactivateTroupe(troupe)}>
                          Reactivar
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <EntityDrawer
        isOpen={drawerMode !== null && !locked}
        onClose={() => setDrawerMode(null)}
        title={drawerMode?.mode === "edit" ? `Editar comparsa${editingTroupe ? ` — ${editingTroupe.name}` : ""}` : "Nueva comparsa"}
        description={drawerMode?.mode === "edit" ? "Modificá los datos de la comparsa." : "Completá los datos de la comparsa."}
        focusReturnRef={drawerTriggerRef}
      >
        <TroupeForm
          key={drawerMode?.mode === "edit" ? `edit-${drawerMode.troupeId}` : `create-${drawerMode?.ts}`}
          initialValue={editingTroupe ?? {}}
          categories={activeCategories}
          submitting={saving}
          submitLabel={drawerMode?.mode === "edit" ? "Guardar comparsa" : "Agregar comparsa"}
          showActive={drawerMode?.mode === "edit"}
          onSubmit={submitTroupe}
        />
        <DialogFooter>
          <button type="button" className="secondary" onClick={() => setDrawerMode(null)}>Cancelar</button>
        </DialogFooter>
      </EntityDrawer>
      <Dialog isOpen={mutationTarget !== null && !locked} onClose={() => setMutationTarget(null)} title={mutationTarget?.title ?? "Confirmar cambio"} description={mutationTarget?.description ?? ""}>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setMutationTarget(null)}>Cancelar</Button>
          <Button variant="primary" onClick={() => { const target = mutationTarget; setMutationTarget(null); void target?.confirm(); }}>Confirmar y guardar</Button>
        </DialogFooter>
      </Dialog>
      <Dialog
        isOpen={deleteTarget !== null && !locked}
        onClose={() => setDeleteTarget(null)}
        title={deleteTarget ? `Eliminar ${deleteTarget.name}` : "Eliminar comparsa"}
        description="Se ocultara de la lista y quedara desactivada en BD (active=false). Podras verla con el filtro Inactivas y reactivarla. No se borra el historial."
        focusReturnRef={deleteTriggerRef}
      >
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={() => setDeleteTarget(null)}>Cancelar</button>
          <button type="button" className="danger-action" onClick={confirmDeleteTroupe}>Eliminar (desactivar)</button>
        </div>
      </Dialog>
    </section>
  );
}

function TroupeScheduleSection({ event }) {
  const [nights, setNights] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const scheduleRequest = useRef(0);
  const [troupes, setTroupes] = useState([]);
  const [nightId, setNightId] = useState("");
  const [troupeToAdd, setTroupeToAdd] = useState("");
  const [quitTarget, setQuitTarget] = useState(null);
  const [reorderTarget, setReorderTarget] = useState(null);
  const [scheduleAddTarget, setScheduleAddTarget] = useState(null);
  const [message, setMessage] = useState("");
  const { writing, setPending, dataRevision } = useContext(WriteContext);
  const locked = event.status === "OPEN";

  useEffect(() => {
    let active = true;
    apiRequest(`/api/v1/events/${event.id}/nights`).then((loaded) => {
      if (!active) return;
      const available = loaded ?? [];
      setNights(available);
      setNightId((selected) => available.some((night) => night.id === selected) ? selected : available[0]?.id ?? "");
    }).catch(() => {});
    apiRequest(`/api/v1/events/${event.id}/troupes`).then((loaded) => { if (active) setTroupes(loaded ?? []); }).catch(() => {});
    return () => { active = false; };
  }, [event.id, dataRevision]);

  useEffect(() => {
    const request = ++scheduleRequest.current;
    if (!nightId) { setSchedule([]); return; }
    setSchedule([]);
    apiRequest(`/api/v1/events/${event.id}/schedule?nightId=${nightId}`)
      .then((loaded) => { if (request === scheduleRequest.current) setSchedule(loaded); })
      .catch(() => { if (request === scheduleRequest.current) setMessage("No se pudo cargar el orden de pasada."); });
    return () => { scheduleRequest.current += 1; };
  }, [event.id, nightId, dataRevision]);

  const ordered = [...schedule].sort((a, b) => a.presentationOrder - b.presentationOrder);
  const nightName = nights.find((n) => n.id === nightId)?.name ?? "";
  const unprogrammed = troupes.filter((t) => t.active !== false && !schedule.some((s) => s.troupeId === t.id));

  const addToSchedule = async (troupeId) => {
    if (writing.current || locked || !troupeId) return;
    writing.current = true;
    setPending(true);
    try {
      const saved = await apiRequest(`/api/v1/events/${event.id}/schedule`, {
        method: "POST",
        body: JSON.stringify({ nightId, troupeId }),
      });
      const troupe = troupes.find((t) => t.id === troupeId);
      scheduleRequest.current += 1;
      setSchedule((prev) => [...prev, { ...saved, nightId, troupeId, troupeName: troupe?.name ?? "", troupeBrandColor: troupe?.brandColor ?? null }]);
      setTroupeToAdd("");
      setMessage("Comparsa programada en la jornada.");
    } catch (error) {
      setMessage(error.code === "SCHEDULE_CONFLICT"
        ? "Esa comparsa ya está programada en la jornada."
        : error.code === "EVENT_LOCKED"
          ? "El evento ya no permite modificar su configuracion."
          : "No se pudo programar la comparsa.");
    } finally {
      writing.current = false;
      setPending(false);
    }
  };

  const reorder = async (current, neighbor, direction) => {
    if (writing.current || locked || !neighbor) return;
    writing.current = true;
    setPending(true);
    try {
      const { changes } = await apiRequest(`/api/v1/schedule/${current.id}/reorder`, {
        method: "POST",
        body: JSON.stringify({ direction, neighborId: neighbor.id, expectedOrder: current.presentationOrder, expectedNeighborOrder: neighbor.presentationOrder }),
      });
      scheduleRequest.current += 1;
      setSchedule((previous) => previous.map((entry) => ({ ...entry, ...changes.find((change) => change.id === entry.id) })));
      setMessage("Orden de pasada actualizado.");
    } catch (error) {
      if (["ORDER_CONFLICT", "ORDER_BOUNDARY"].includes(error.code)) {
        try {
          const fresh = await apiRequest(`/api/v1/events/${event.id}/schedule?nightId=${nightId}`);
          setSchedule(fresh);
          setMessage("El orden cambio. Recargamos la jornada; revisa antes de reintentar.");
        } catch {
          setMessage("No se pudo actualizar el orden. Recarga antes de reintentar.");
        }
      } else {
        setMessage(error.code === "EVENT_LOCKED" ? "El evento ya no permite modificar su configuracion." : "No se pudo cambiar el orden. Verifica la configuracion antes de reintentar.");
      }
    } finally {
      writing.current = false;
      setPending(false);
    }
  };

  return (
    <section className="config-section" aria-label="Orden de pasada por jornada">
      <div className="section-heading">
        <h2>Orden de pasada</h2>
        <p>Programá las comparsas en cada jornada y ordená la salida. Sin comparsas programadas, la votación abre planillas vacías. No abre votacion ni crea planillas.</p>
      </div>
      <p className="feedback" role="status">{message}</p>
      {nights.length === 0 && <p>Cargando jornadas...</p>}
      {nights.length > 0 && (
        <label>Jornada<select value={nightId} onChange={(e) => setNightId(e.target.value)} aria-label="Jornada para el orden de pasada">
          {nights.map((night) => <option key={night.id} value={night.id}>{night.name}</option>)}
        </select></label>
      )}
      {!locked && nightId && unprogrammed.length > 0 && (
        <form
          className="inline-item-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!writing.current && troupeToAdd) setScheduleAddTarget(troupeToAdd);
          }}
        >
          <select value={troupeToAdd} onChange={(e) => setTroupeToAdd(e.target.value)} aria-label="Comparsa para programar en la jornada" required>
            <option value="">Comparsa para programar…</option>
            {unprogrammed.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button type="submit">Programar comparsa</button>
        </form>
      )}
      <ol className="schedule-list">
        {ordered.map((entry, index) => (
          <li key={entry.id} className="schedule-row">
            <span className="mono-text">{entry.presentationOrder}</span>
            {entry.troupeBrandColor && <span className="troupe-swatch" role="img" aria-label={`Color ${entry.troupeBrandColor}`} style={{ backgroundColor: entry.troupeBrandColor }} />}
            <strong>{entry.troupeName}</strong>
            <ScheduledPassTime scheduledAt={entry.scheduledAt} scheduledTimezone={entry.scheduledTimezone} />
            {!locked && <>
              <button className="secondary" type="button" aria-label={`Subir ${entry.troupeName} en ${nightName}`} disabled={index === 0} onClick={() => setReorderTarget({ current: entry, neighbor: ordered[index - 1], direction: "UP" })}>Subir</button>
              <button className="secondary" type="button" aria-label={`Bajar ${entry.troupeName} en ${nightName}`} disabled={index === ordered.length - 1} onClick={() => setReorderTarget({ current: entry, neighbor: ordered[index + 1], direction: "DOWN" })}>Bajar</button>
              <button className="secondary" type="button" aria-label={`Quitar ${entry.troupeName} de ${nightName}`} onClick={() => setQuitTarget(entry)}>Quitar</button>
            </>}
          </li>
        ))}
      </ol>
      {ordered.some((entry) => entry.orderSource === "TEST_SIMULATED_DRAW") && (
        <p>Horarios y orden simulados para pruebas; no son un cronograma oficial de la COC.</p>
      )}
      <Dialog
        isOpen={scheduleAddTarget !== null && !locked}
        onClose={() => setScheduleAddTarget(null)}
        title="Confirmar programación"
        description={`Se agregará ${troupes.find((t) => t.id === scheduleAddTarget)?.name ?? "la comparsa"} al orden de pasada de ${nightName}.`}
      >
        <DialogFooter>
          <Button variant="secondary" onClick={() => setScheduleAddTarget(null)}>Cancelar</Button>
          <Button variant="primary" onClick={() => { const troupeId = scheduleAddTarget; setScheduleAddTarget(null); if (troupeId) void addToSchedule(troupeId); }}>Confirmar y guardar</Button>
        </DialogFooter>
      </Dialog>
      <Dialog
        isOpen={reorderTarget !== null && !locked}
        onClose={() => setReorderTarget(null)}
        title="Confirmar cambio de orden"
        description={reorderTarget ? `Se cambiará el orden de ${reorderTarget.current.troupeName} en ${nightName}.` : ""}
      >
        <DialogFooter>
          <Button variant="secondary" onClick={() => setReorderTarget(null)}>Cancelar</Button>
          <Button variant="primary" onClick={() => { const target = reorderTarget; setReorderTarget(null); if (target) void reorder(target.current, target.neighbor, target.direction); }}>Confirmar y guardar</Button>
        </DialogFooter>
      </Dialog>
      {nightId && ordered.length === 0 && <p>Sin comparsas programadas en esta jornada. Programá al menos una para poder abrir la votación.</p>}
      {quitTarget && (
        <Dialog
          isOpen={Boolean(quitTarget)}
          onClose={() => setQuitTarget(null)}
          title={`Quitar ${quitTarget.troupeName} de ${nightName}`}
          description="La comparsa sale del orden de pasada pero no se elimina del evento."
        >
          <DialogFooter>
            <Button variant="secondary" onClick={() => setQuitTarget(null)}>Cancelar</Button>
            <Button
              variant="danger"
              onClick={async () => {
                const target = quitTarget;
                setQuitTarget(null);
                if (writing.current) return;
                writing.current = true;
                setPending(true);
                try {
                  await apiRequest(`/api/v1/schedule/${target.id}`, { method: "DELETE" });
                  scheduleRequest.current += 1;
                  setSchedule((prev) => prev.filter((s) => s.id !== target.id));
                  setMessage("Comparsa quitada de la jornada.");
                } catch {
                  setMessage("No se pudo quitar la comparsa de la jornada.");
                } finally {
                  writing.current = false;
                  setPending(false);
                }
              }}
            >
              Quitar de la jornada
            </Button>
          </DialogFooter>
        </Dialog>
      )}
    </section>
  );
}

function AdminCategoriesSection({ event }) {
  const [categories, setCategories] = useState([]);
  const [drawerMode, setDrawerMode] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [mutationTarget, setMutationTarget] = useState(null);
  const drawerTriggerRef = useRef(null);
  const deleteTriggerRef = useRef(null);
  const { writing, setPending, incRevision, reloadProgress, dataRevision } = useContext(WriteContext);

  useEffect(() => {
    let active = true;
    apiRequest(`/api/v1/events/${event.id}/categories`).then((loaded) => { if (active) setCategories(loaded); }).catch(() => {});
    return () => { active = false; };
  }, [event.id, dataRevision]);
  const locked = event.status === "OPEN";

  const save = async (path, body, method = "POST") => {
    try {
      const saved = await apiRequest(path, { method, body: JSON.stringify(body) });
      const fresh = await apiRequest(`/api/v1/events/${event.id}/categories`).catch(() => null);
      if (fresh) setCategories(fresh);
      else setCategories((prev) => method === "POST" ? [...prev, saved] : prev.map((category) => category.id === saved.id ? { ...category, ...saved } : category));
      setMessage("Guardado.");
      setDrawerMode(null);
      if (incRevision) incRevision();
      if (reloadProgress) reloadProgress();
      return true;
    } catch (e) {
      setMessage(e.code === "RESOURCE_CONFLICT" ? "Ese nombre u orden ya está en uso." : "No se pudo guardar.");
      return false;
    }
  };

  const submitCategory = async (body, confirmed = false) => {
    if (drawerMode?.mode === "edit" && !confirmed) {
      setMutationTarget({ title: "Guardar cambios del tipo", description: `Se actualizarán los datos de ${editingCategory?.name ?? "el tipo"}.`, confirm: () => submitCategory(body, true) });
      return;
    }
    if (writing.current) return;
    writing.current = true;
    setPending(true);
    setSaving(true);
    try {
      if (drawerMode?.mode === "edit") {
        await save(`/api/v1/categories/${drawerMode.categoryId}`, body, "PATCH");
      } else {
        await save(`/api/v1/events/${event.id}/categories`, body);
      }
    } finally {
      writing.current = false;
      setPending(false);
      setSaving(false);
    }
  };

  const ordered = [...categories].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  const nextOrder = ordered.length === 0 ? 1 : Math.max(...ordered.map((c) => c.displayOrder ?? 0)) + 1;
  const editingCategory = drawerMode?.mode === "edit" ? categories.find((c) => c.id === drawerMode.categoryId) : null;

  const refreshCategories = async (fallback) => {
    const fresh = await apiRequest(`/api/v1/events/${event.id}/categories`).catch(() => null);
    if (fresh) setCategories(fresh);
    else if (fallback) setCategories(fallback);
  };

  const confirmDeleteCategory = async () => {
    const target = deleteTarget;
    setDeleteTarget(null);
    if (!target || writing.current) return;
    writing.current = true;
    setPending(true);
    try {
      await apiRequest(`/api/v1/categories/${target.id}`, { method: "PATCH", body: JSON.stringify({ active: false }) });
      await refreshCategories((prev) => prev.map((c) => c.id === target.id ? { ...c, active: false } : c));
      setMessage(`Tipo ${target.name} eliminado (desactivado en BD).`);
      if (incRevision) incRevision();
      if (reloadProgress) reloadProgress();
    } catch {
      setMessage("No se pudo eliminar el tipo.");
    } finally {
      writing.current = false;
      setPending(false);
    }
  };

  const reactivateCategory = async (category, confirmed = false) => {
    if (!confirmed) {
      setMutationTarget({ title: "Reactivar tipo", description: `Se volverá a habilitar ${category.name} para comparsas nuevas.`, confirm: () => reactivateCategory(category, true) });
      return;
    }
    if (writing.current) return;
    writing.current = true;
    setPending(true);
    try {
      await apiRequest(`/api/v1/categories/${category.id}`, { method: "PATCH", body: JSON.stringify({ active: true }) });
      await refreshCategories((prev) => prev.map((c) => c.id === category.id ? { ...c, active: true } : c));
      setMessage(`Tipo ${category.name} reactivado.`);
      if (incRevision) incRevision();
      if (reloadProgress) reloadProgress();
    } catch {
      setMessage("No se pudo reactivar el tipo.");
    } finally {
      writing.current = false;
      setPending(false);
    }
  };

  return (
    <section className="config-section">
      <div className="section-heading"><h2>Tipos de participacion</h2><p>Cada comparsa elige uno de estos tipos al darse de alta: crealos antes de cargar comparsas. Eliminar oculta el tipo y lo conserva desactivado en BD.</p></div>
      <p className="feedback" role="status">{message}</p>
      {!locked && <button type="button" onClick={(event) => { drawerTriggerRef.current = event.currentTarget; setDrawerMode({ mode: "create", ts: Date.now() }); }}>+ Nuevo tipo</button>}
      {ordered.length === 0 ? (
        <p className="empty-state">Todavía no hay tipos de participación.</p>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Tipo</th>
                <th scope="col">Código</th>
                <th scope="col">Estado</th>
                {!locked && <th scope="col">Acción</th>}
              </tr>
            </thead>
            <tbody>
              {ordered.map((category) => (
                <tr key={category.id}>
                  <td>{category.displayOrder}</td>
                  <td><strong>{category.name}</strong></td>
                  <td><span className="mono-text">{category.code}</span></td>
                  <td><StatusPill status={category.active ? "ACTIVE" : "SUSPENDED"} label={category.active ? "Activa" : "Inactiva"} /></td>
                  {!locked && (
                    <td>
                      <button className="secondary" type="button" aria-label={`Editar tipo ${category.name}`} onClick={(event) => { drawerTriggerRef.current = event.currentTarget; setDrawerMode({ mode: "edit", categoryId: category.id }); }}>
                        Editar
                      </button>{" "}
                      {category.active !== false ? (
                        <button className="secondary danger-action" type="button" aria-label={`Eliminar tipo ${category.name}`} onClick={(event) => { deleteTriggerRef.current = event.currentTarget; setDeleteTarget(category); }}>
                          Eliminar
                        </button>
                      ) : (
                        <button className="secondary" type="button" aria-label={`Reactivar tipo ${category.name}`} onClick={() => reactivateCategory(category)}>
                          Reactivar
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <EntityDrawer
        isOpen={drawerMode !== null && !locked}
        onClose={() => setDrawerMode(null)}
        title={drawerMode?.mode === "edit" ? `Editar tipo${editingCategory ? ` — ${editingCategory.name}` : ""}` : "Nuevo tipo de participación"}
        description={drawerMode?.mode === "edit" ? "Modificá los datos del tipo." : "Completá los datos del tipo."}
        focusReturnRef={drawerTriggerRef}
      >
        <CatalogForm
          key={drawerMode?.mode === "edit" ? `edit-${drawerMode.categoryId}` : `create-${drawerMode?.ts}`}
          initialValue={editingCategory ?? {}}
          defaultOrder={nextOrder}
          showOrder={drawerMode?.mode === "edit"}
          submitting={saving}
          submitLabel={drawerMode?.mode === "edit" ? "Guardar" : "Agregar tipo"}
          showActive={drawerMode?.mode === "edit"}
          idPrefix="category"
          onSubmit={submitCategory}
        />
        <DialogFooter>
          <button type="button" className="secondary" onClick={() => setDrawerMode(null)}>Cancelar</button>
        </DialogFooter>
      </EntityDrawer>
      <Dialog isOpen={mutationTarget !== null && !locked} onClose={() => setMutationTarget(null)} title={mutationTarget?.title ?? "Confirmar cambio"} description={mutationTarget?.description ?? ""}>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setMutationTarget(null)}>Cancelar</Button>
          <Button variant="primary" onClick={() => { const target = mutationTarget; setMutationTarget(null); void target?.confirm(); }}>Confirmar y guardar</Button>
        </DialogFooter>
      </Dialog>
      <Dialog
        isOpen={deleteTarget !== null && !locked}
        onClose={() => setDeleteTarget(null)}
        title={deleteTarget ? `Eliminar ${deleteTarget.name}` : "Eliminar tipo"}
        description="Se ocultara de la lista y quedara desactivado en BD (active=false). Podras reactivarlo. No se borra el historial."
        focusReturnRef={deleteTriggerRef}
      >
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={() => setDeleteTarget(null)}>Cancelar</button>
          <button type="button" className="danger-action" onClick={confirmDeleteCategory}>Eliminar (desactivar)</button>
        </div>
      </Dialog>
    </section>
  );
}

function AdminSpecialtiesSection({ event }) {
  const [specialties, setSpecialties] = useState([]);
  const [drawerMode, setDrawerMode] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [mutationTarget, setMutationTarget] = useState(null);
  const drawerTriggerRef = useRef(null);
  const deleteTriggerRef = useRef(null);
  const { writing, setPending, incRevision, reloadProgress, dataRevision } = useContext(WriteContext);

  useEffect(() => {
    let active = true;
    apiRequest(`/api/v1/events/${event.id}/specialties`).then((loaded) => { if (active) setSpecialties(loaded); }).catch(() => {});
    return () => { active = false; };
  }, [event.id, dataRevision]);
  const locked = event.status === "OPEN";

  const save = async (path, body, method = "POST") => {
    try {
      const saved = await apiRequest(path, { method, body: JSON.stringify(body) });
      const fresh = await apiRequest(`/api/v1/events/${event.id}/specialties`).catch(() => null);
      if (fresh) setSpecialties(fresh);
      else setSpecialties((prev) => method === "POST" ? [...prev, saved] : prev.map((s) => s.id === saved.id ? { ...s, ...saved } : s));
      setMessage("Guardado.");
      setDrawerMode(null);
      if (incRevision) incRevision();
      if (reloadProgress) reloadProgress();
      return true;
    } catch (e) {
      setMessage(e.code === "RESOURCE_CONFLICT" ? "Ese nombre u orden ya está en uso." : "No se pudo guardar.");
      return false;
    }
  };

  const submitSpecialty = async (body, confirmed = false) => {
    if (drawerMode?.mode === "edit" && !confirmed) {
      setMutationTarget({ title: "Guardar cambios de especialidad", description: `Se actualizarán los datos de ${editingSpecialty?.name ?? "la especialidad"}.`, confirm: () => submitSpecialty(body, true) });
      return;
    }
    if (writing.current) return;
    writing.current = true;
    setPending(true);
    setSaving(true);
    try {
      if (drawerMode?.mode === "edit") {
        await save(`/api/v1/specialties/${drawerMode.specialtyId}`, body, "PATCH");
      } else {
        await save(`/api/v1/events/${event.id}/specialties`, body);
      }
    } finally {
      writing.current = false;
      setPending(false);
      setSaving(false);
    }
  };

  const ordered = [...specialties].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  const nextOrder = ordered.length === 0 ? 1 : Math.max(...ordered.map((s) => s.displayOrder ?? 0)) + 1;
  const editingSpecialty = drawerMode?.mode === "edit" ? specialties.find((s) => s.id === drawerMode.specialtyId) : null;

  const refreshSpecialties = async (fallback) => {
    const fresh = await apiRequest(`/api/v1/events/${event.id}/specialties`).catch(() => null);
    if (fresh) setSpecialties(fresh);
    else if (fallback) setSpecialties(fallback);
  };

  const confirmDeleteSpecialty = async () => {
    const target = deleteTarget;
    setDeleteTarget(null);
    if (!target || writing.current) return;
    writing.current = true;
    setPending(true);
    try {
      await apiRequest(`/api/v1/specialties/${target.id}`, { method: "PATCH", body: JSON.stringify({ active: false }) });
      await refreshSpecialties((prev) => prev.map((s) => s.id === target.id ? { ...s, active: false } : s));
      setMessage(`Especialidad ${target.name} eliminada (desactivada en BD).`);
      if (incRevision) incRevision();
      if (reloadProgress) reloadProgress();
    } catch {
      setMessage("No se pudo eliminar la especialidad.");
    } finally {
      writing.current = false;
      setPending(false);
    }
  };

  const reactivateSpecialty = async (specialty, confirmed = false) => {
    if (!confirmed) {
      setMutationTarget({ title: "Reactivar especialidad", description: `Se volverá a habilitar ${specialty.name} para la configuración de rubros.`, confirm: () => reactivateSpecialty(specialty, true) });
      return;
    }
    if (writing.current) return;
    writing.current = true;
    setPending(true);
    try {
      await apiRequest(`/api/v1/specialties/${specialty.id}`, { method: "PATCH", body: JSON.stringify({ active: true }) });
      await refreshSpecialties((prev) => prev.map((s) => s.id === specialty.id ? { ...s, active: true } : s));
      setMessage(`Especialidad ${specialty.name} reactivada.`);
      if (incRevision) incRevision();
      if (reloadProgress) reloadProgress();
    } catch {
      setMessage("No se pudo reactivar la especialidad.");
    } finally {
      writing.current = false;
      setPending(false);
    }
  };

  return (
    <section className="config-section">
      <div className="section-heading"><h2>Especialidades</h2><p>Cada ítem puntuable pertenece a una especialidad activa: creá al menos una antes de cargar ítems en el paso 3. Eliminar la oculta y la conserva desactivada en BD.</p></div>
      <p className="feedback" role="status">{message}</p>
      {!locked && <button type="button" onClick={(event) => { drawerTriggerRef.current = event.currentTarget; setDrawerMode({ mode: "create", ts: Date.now() }); }}>+ Nueva especialidad</button>}
      {ordered.length === 0 ? (
        <p className="empty-state">Todavía no hay especialidades.</p>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Especialidad</th>
                <th scope="col">Código</th>
                <th scope="col">Estado</th>
                {!locked && <th scope="col">Acción</th>}
              </tr>
            </thead>
            <tbody>
              {ordered.map((spec) => (
                <tr key={spec.id}>
                  <td>{spec.displayOrder}</td>
                  <td><strong>{spec.name}</strong></td>
                  <td><span className="mono-text">{spec.code}</span></td>
                  <td><StatusPill status={spec.active ? "ACTIVE" : "SUSPENDED"} label={spec.active ? "Activa" : "Inactiva"} /></td>
                  {!locked && (
                    <td>
                      <button className="secondary" type="button" aria-label={`Editar especialidad ${spec.name}`} onClick={(event) => { drawerTriggerRef.current = event.currentTarget; setDrawerMode({ mode: "edit", specialtyId: spec.id }); }}>
                        Editar
                      </button>{" "}
                      {spec.active !== false ? (
                        <button className="secondary danger-action" type="button" aria-label={`Eliminar especialidad ${spec.name}`} onClick={(event) => { deleteTriggerRef.current = event.currentTarget; setDeleteTarget(spec); }}>
                          Eliminar
                        </button>
                      ) : (
                        <button className="secondary" type="button" aria-label={`Reactivar especialidad ${spec.name}`} onClick={() => reactivateSpecialty(spec)}>
                          Reactivar
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <EntityDrawer
        isOpen={drawerMode !== null && !locked}
        onClose={() => setDrawerMode(null)}
        title={drawerMode?.mode === "edit" ? `Editar especialidad${editingSpecialty ? ` — ${editingSpecialty.name}` : ""}` : "Nueva especialidad"}
        description={drawerMode?.mode === "edit" ? "Modificá los datos de la especialidad." : "Completá los datos de la especialidad."}
        focusReturnRef={drawerTriggerRef}
      >
        <CatalogForm
          key={drawerMode?.mode === "edit" ? `edit-${drawerMode.specialtyId}` : `create-${drawerMode?.ts}`}
          initialValue={editingSpecialty ?? {}}
          defaultOrder={nextOrder}
          showOrder={drawerMode?.mode === "edit"}
          submitting={saving}
          submitLabel={drawerMode?.mode === "edit" ? "Guardar" : "Agregar especialidad"}
          showActive={drawerMode?.mode === "edit"}
          idPrefix="specialty"
          onSubmit={submitSpecialty}
        />
        <DialogFooter>
          <button type="button" className="secondary" onClick={() => setDrawerMode(null)}>Cancelar</button>
        </DialogFooter>
      </EntityDrawer>
      <Dialog isOpen={mutationTarget !== null && !locked} onClose={() => setMutationTarget(null)} title={mutationTarget?.title ?? "Confirmar cambio"} description={mutationTarget?.description ?? ""}>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setMutationTarget(null)}>Cancelar</Button>
          <Button variant="primary" onClick={() => { const target = mutationTarget; setMutationTarget(null); void target?.confirm(); }}>Confirmar y guardar</Button>
        </DialogFooter>
      </Dialog>
      <Dialog
        isOpen={deleteTarget !== null && !locked}
        onClose={() => setDeleteTarget(null)}
        title={deleteTarget ? `Eliminar ${deleteTarget.name}` : "Eliminar especialidad"}
        description="Se ocultara de la lista y quedara desactivada en BD (active=false). Podras reactivarla. No se borra el historial."
        focusReturnRef={deleteTriggerRef}
      >
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={() => setDeleteTarget(null)}>Cancelar</button>
          <button type="button" className="danger-action" onClick={confirmDeleteSpecialty}>Eliminar (desactivar)</button>
        </div>
      </Dialog>
    </section>
  );
}

function AdminRubricsSection({ event, focusRubricId = null, readiness, readinessStatus, onBack, onContinue, tab = "rubros" }) {
  const [rubrics, setRubrics] = useState([]);
  const [specialties, setSpecialties] = useState([]);
  const [troupes, setTroupes] = useState([]);
  const [selectedSpecialtyId, setSelectedSpecialtyId] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newRubricTarget, setNewRubricTarget] = useState("TROUPE");
  const [editingRubricTarget, setEditingRubricTarget] = useState("TROUPE");
  const [expanded, setExpanded] = useState(null);
  const [editingRubricId, setEditingRubricId] = useState(null);
  const [highlightItemId, setHighlightItemId] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [editingCriterion, setEditingCriterion] = useState(null);
  const [rubricDeleteTarget, setRubricDeleteTarget] = useState(null);
  const [nominationCreateTarget, setNominationCreateTarget] = useState(null);
  const [nominationStatusTarget, setNominationStatusTarget] = useState(null);
  const [mutationConfirmTarget, setMutationConfirmTarget] = useState(null);
  const [itemCreateTarget, setItemCreateTarget] = useState(null);
  const rubricDeleteTriggerRef = useRef(null);
  const itemCreateTriggerRef = useRef(null);
  const [message, setMessage] = useState("");
  const { writing, setPending, reloadProgress, dataRevision, incRevision } = useContext(WriteContext);

  const scrollToSelector = (selector) => {
    requestAnimationFrame(() => {
      document.querySelector(selector)?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    });
  };

  useEffect(() => {
    let active = true;
    apiRequest(`/api/v1/events/${event.id}/rubrics`).then((loaded) => { if (active) setRubrics(loaded); }).catch(() => {});
    apiRequest(`/api/v1/events/${event.id}/specialties`).then((loaded) => {
      if (!active) return;
      setSpecialties(loaded);
      setSelectedSpecialtyId((current) => current && loaded.some((specialty) => specialty.id === current && specialty.active !== false)
        ? current
        : loaded.find((specialty) => specialty.active !== false)?.id ?? null);
    }).catch(() => {});
    apiRequest(`/api/v1/events/${event.id}/troupes`).then((loaded) => { if (active) setTroupes(loaded); }).catch(() => {});
    return () => { active = false; };
  }, [event.id, dataRevision]);

  useEffect(() => {
    if (focusRubricId) {
      setRubricTab("items");
      setExpanded(focusRubricId);
      setHighlightItemId(null);
      scrollToSelector(`[data-rubric-id="${focusRubricId}"]`);
    }
  }, [focusRubricId]);

  const locked = event.status === "OPEN";
  const activeSpecialties = specialties.filter((s) => s.active !== false);
  const activeTroupes = troupes.filter((troupe) => troupe.active !== false).sort((a, b) => a.name.localeCompare(b.name));
  const selectedSpecialty = activeSpecialties.find((specialty) => specialty.id === selectedSpecialtyId) ?? null;
  const rubricHasSpecialty = (rubric, specialtyId) => (rubric.items ?? []).some((item) => item.active !== false && item.specialtyId === specialtyId);
  const specialtyRubrics = selectedSpecialty
    ? rubrics.filter((rubric) => rubricHasSpecialty(rubric, selectedSpecialty.id))
    : [];
  const unassignedRubrics = rubrics.filter((rubric) => !activeSpecialties.some((specialty) => rubricHasSpecialty(rubric, specialty.id)));
  const visibleRubrics = [...specialtyRubrics, ...unassignedRubrics.filter((rubric) => !specialtyRubrics.some((entry) => entry.id === rubric.id))];
  const activeRubrics = rubrics.filter((rubric) => rubric.active !== false);
  const activeItemCount = activeRubrics.reduce((total, rubric) => total + (rubric.items ?? []).filter((item) => item.active !== false).length, 0);
  const coveredSpecialtyIds = new Set(activeRubrics.flatMap((rubric) =>
    (rubric.items ?? []).filter((item) => item.active !== false).map((item) => item.specialtyId)));
  const incompleteRubricIds = new Set((readiness?.incompleteRubrics ?? []).map((rubric) => rubric.id));

  const RUBRIC_TYPES = [
    { value: "NOMINATIVE", label: "Nominativo" },
    { value: "RANDOM", label: "Aleatorio" },
  ];
  const LEGACY_RUBRIC_TYPE_LABELS = {
    GENERAL: "General (histórico)",
    CALCULATED: "Calculado (histórico)",
    SPECIAL: "Especial (histórico)",
  };
  const RESOLUTION_METHODS = [
    { value: "JURY", label: "Jurado" },
    { value: "COMMITTEE", label: "Comision Organizadora" },
    { value: "AUTOMATIC", label: "Resultado automatico" },
    { value: "ADMINISTRATIVE", label: "Carga administrativa" },
  ];
  const SUBJECT_TYPES = [
    { value: "PERSON", label: "Persona" },
    { value: "COUPLE", label: "Pareja" },
    { value: "GROUP", label: "Grupo" },
    { value: "FIGURE", label: "Figura" },
    { value: "ELEMENT", label: "Elemento" },
    { value: "OTHER", label: "Otro" },
  ];

  const subjectTypeLabel = (value) => SUBJECT_TYPES.find((type) => type.value === value)?.label ?? value;

  const saveRubric = async (path, body, method = "POST") => {
    try {
      const saved = await apiRequest(path, { method, body: JSON.stringify(body) });
      const fresh = await apiRequest(`/api/v1/events/${event.id}/rubrics`).catch(() => null);
      if (fresh) setRubrics(fresh);
      else setRubrics((prev) => method === "POST" ? [...prev, { ...saved, items: [], criteria: [], specialties: [] }] : prev.map((r) => r.id === saved.id ? { ...r, ...saved } : r));
      setMessage("Rubro guardado.");
      if (method === "POST") {
        setShowCreateForm(false);
        setNewRubricTarget("TROUPE");
      }
      if (incRevision) incRevision();
      reloadProgress?.();
      if (method === "POST" && saved?.id) {
        // El rubro recién creado se abre solo para seguir cargando ítems.
        setExpanded(saved.id);
        setHighlightItemId(null);
        scrollToSelector(`[data-rubric-id="${saved.id}"]`);
      }
      return true;
    } catch (e) {
      setMessage(e.code === "RESOURCE_CONFLICT" ? "El codigo ya esta en uso." : "No se pudo guardar.");
    }
  };

  const saveItem = async (rubricId, body, method = "POST", itemId = null) => {
    try {
      const path = method === "PATCH" ? `/api/v1/evaluation-items/${itemId}` : `/api/v1/rubrics/${rubricId}/items`;
      const saved = await apiRequest(path, { method, body: JSON.stringify(body) });
      const fresh = await apiRequest(`/api/v1/rubrics/${rubricId}`).catch(() => null);
      if (fresh) {
        setRubrics((prev) => prev.map((r) => r.id === rubricId ? fresh : r));
      } else {
        setRubrics((prev) => prev.map((r) => {
          if (r.id !== rubricId) return r;
          if (method === "POST") return { ...r, items: [...(r.items ?? []), saved] };
          return { ...r, items: (r.items ?? []).map((i) => i.id === saved.id ? { ...i, ...saved } : i) };
        }));
      }
      setMessage("Item guardado.");
      if (incRevision) incRevision();
      reloadProgress?.();
      setEditingItem(null);
      if (method === "POST" && saved?.id) {
        setHighlightItemId(saved.id);
        scrollToSelector(`[data-item-id="${saved.id}"]`);
      }
      return true;
    } catch (e) {
      setMessage(e.code === "SPECIALTY_INACTIVE" ? "La especialidad seleccionada esta inactiva." : "No se pudo guardar.");
    }
  };

  const confirmNominationCreate = async () => {
    const target = nominationCreateTarget;
    setNominationCreateTarget(null);
    if (!target || writing.current) return;
    writing.current = true;
    setPending(true);
    try {
      await apiRequest(`/api/v1/rubrics/${target.rubricId}/nominations`, {
        method: "POST",
        body: JSON.stringify(target.body),
      });
      const fresh = await apiRequest(`/api/v1/rubrics/${target.rubricId}`).catch(() => null);
      if (fresh) setRubrics((previous) => previous.map((rubric) => rubric.id === target.rubricId ? fresh : rubric));
      setMessage("Participante agregado al rubro.");
      if (incRevision) incRevision();
      reloadProgress?.();
    } catch (error) {
      setMessage(error.code === "RANDOM_RUBRIC_NOMINATION_LIMIT"
        ? "Los rubros aleatorios permiten hasta 3 participantes por comparsa."
        : error.code === "NOMINATION_ALREADY_EXISTS"
          ? "Ese participante ya está cargado para esta comparsa y rubro."
          : "No se pudo agregar el participante.");
    } finally {
      writing.current = false;
      setPending(false);
    }
  };

  const confirmNominationStatus = async () => {
    const target = nominationStatusTarget;
    setNominationStatusTarget(null);
    if (!target || writing.current) return;
    writing.current = true;
    setPending(true);
    try {
      await apiRequest(`/api/v1/nominations/${target.nomination.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: target.active }),
      });
      const fresh = await apiRequest(`/api/v1/rubrics/${target.nomination.rubricId}`).catch(() => null);
      if (fresh) setRubrics((previous) => previous.map((rubric) => rubric.id === fresh.id ? fresh : rubric));
      setMessage(target.active ? "Participante reactivado." : "Participante desactivado.");
      if (incRevision) incRevision();
      reloadProgress?.();
    } catch (error) {
      setMessage(error.code === "RANDOM_RUBRIC_NOMINATION_LIMIT"
        ? "Los rubros aleatorios permiten hasta 3 participantes activos por comparsa."
        : "No se pudo actualizar el participante.");
    } finally {
      writing.current = false;
      setPending(false);
    }
  };

  const saveCriterion = async (rubricId, body, method = "POST", criterionId = null) => {
    try {
      const path = method === "PATCH" ? `/api/v1/rubric-criteria/${criterionId}` : `/api/v1/rubrics/${rubricId}/criteria`;
      const saved = await apiRequest(path, { method, body: JSON.stringify(body) });
      const fresh = await apiRequest(`/api/v1/rubrics/${rubricId}`).catch(() => null);
      if (fresh) {
        setRubrics((prev) => prev.map((r) => r.id === rubricId ? fresh : r));
      } else {
        setRubrics((prev) => prev.map((r) => {
          if (r.id !== rubricId) return r;
          if (method === "POST") return { ...r, criteria: [...(r.criteria ?? []), saved] };
          return { ...r, criteria: (r.criteria ?? []).map((c) => c.id === saved.id ? { ...c, ...saved } : c) };
        }));
      }
      setMessage("Criterio guardado.");
      if (incRevision) incRevision();
      reloadProgress?.();
      setEditingCriterion(null);
      return true;
    } catch (e) {
      setMessage(e.code === "EVALUATION_ITEM_NOT_FOUND" ? "El item seleccionado no es valido." : "No se pudo guardar.");
    }
  };

  const requestMutationConfirmation = (title, description, commit, managesWrite = false) =>
    setMutationConfirmTarget({ title, description, commit, managesWrite });

  const confirmMutation = async () => {
    const target = mutationConfirmTarget;
    setMutationConfirmTarget(null);
    if (!target) return;
    if (target.managesWrite) {
      await target.commit();
      return;
    }
    if (writing.current) return;
    writing.current = true;
    setPending(true);
    try { await target.commit(); }
    finally { writing.current = false; setPending(false); }
  };

  const reorder = async (rubricId, collection, current, neighbor, direction) => {
    if (writing.current || locked || !neighbor) return;
    writing.current = true;
    setPending(true);
    try {
      const resource = collection === "items" ? "evaluation-items" : "rubric-criteria";
      const { changes } = await apiRequest(`/api/v1/${resource}/${current.id}/reorder`, {
        method: "POST",
        body: JSON.stringify({ direction, neighborId: neighbor.id, expectedOrder: current.displayOrder, expectedNeighborOrder: neighbor.displayOrder }),
      });
      setRubrics((previous) => previous.map((rubric) => rubric.id !== rubricId ? rubric : {
        ...rubric,
        [collection]: rubric[collection].map((entry) => ({ ...entry, ...changes.find((change) => change.id === entry.id) })),
      }));
      setMessage("Orden actualizado.");
    } catch (error) {
      if (["ORDER_CONFLICT", "ORDER_BOUNDARY", "CRITERION_REASSIGNMENT_REQUIRED"].includes(error.code)) {
        try {
          const fresh = await apiRequest(`/api/v1/rubrics/${rubricId}`);
          setRubrics((previous) => previous.map((rubric) => rubric.id === rubricId ? fresh : rubric));
          // Remount uncontrolled edit fields from the refreshed data on expansion.
          setExpanded(null);
          setMessage("La configuracion cambio. Recargamos el rubro; volve a expandirlo para revisar antes de editar.");
        } catch {
          setMessage("No se pudo actualizar la configuracion. Recarga antes de reintentar el orden.");
        }
      } else {
        setMessage(error.code === "EVENT_LOCKED" ? "El evento ya no permite modificar su configuracion." : "No se pudo cambiar el orden. Verifica la configuracion antes de reintentar.");
      }
    } finally {
      writing.current = false;
      setPending(false);
    }
  };

  const setRubricActive = async (rubric, active) => {
    if (writing.current) return;
    writing.current = true;
    setPending(true);
    try {
      await apiRequest(`/api/v1/rubrics/${rubric.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: rubric.name,
          evaluationTarget: rubric.evaluationTarget,
          expectedSubjectType: rubric.expectedSubjectType ?? null,
          rubricType: rubric.rubricType,
          resolutionMethod: rubric.resolutionMethod,
          evaluationObjective: rubric.evaluationObjective ?? null,
          active,
        }),
      });
      const fresh = await apiRequest(`/api/v1/events/${event.id}/rubrics`).catch(() => null);
      if (fresh) setRubrics(fresh);
      else setRubrics((prev) => prev.map((r) => r.id === rubric.id ? { ...r, active } : r));
      setMessage(active ? `Rubro ${rubric.name} reactivado.` : `Rubro ${rubric.name} desactivado.`);
      if (incRevision) incRevision();
      reloadProgress?.();
    } catch {
      setMessage(active ? "No se pudo reactivar el rubro." : "No se pudo desactivar el rubro.");
    } finally {
      writing.current = false;
      setPending(false);
    }
  };

  const confirmDeleteRubric = async () => {
    const target = rubricDeleteTarget;
    setRubricDeleteTarget(null);
    if (!target) return;
    await setRubricActive(target, false);
  };

  return (
    <section className="config-section">
      <div className="evaluation-section-heading">
        <div>
          <h3>Especialidades</h3>
          <p>Seleccioná una especialidad para ver qué rubros evalúa.</p>
        </div>
        {!locked && <button type="button" onClick={() => setShowCreateForm((visible) => !visible)} aria-expanded={showCreateForm} aria-controls="new-rubric-form">
          {showCreateForm ? "Cancelar" : "+ Agregar rubro"}
        </button>}
      </div>
      {activeSpecialties.length > 0 ? (
        <div className="specialty-selector" role="group" aria-label="Especialidades de la competencia">
          {activeSpecialties.map((specialty) => {
            const count = activeRubrics.filter((rubric) => (rubric.items ?? []).some((item) => item.active !== false && item.specialtyId === specialty.id)).length;
            const selected = selectedSpecialtyId === specialty.id;
            return <button key={specialty.id} type="button" className={selected ? "specialty-option is-selected" : "specialty-option"}
              aria-pressed={selected} onClick={() => setSelectedSpecialtyId(specialty.id)}>
              <span>{specialty.name}</span><span className="specialty-option-count">{count} {count === 1 ? "rubro" : "rubros"}</span>
            </button>;
          })}
        </div>
      ) : (
        <div className="evaluation-empty-state">
          <strong>Todavía no hay especialidades activas</strong>
          <p>Los rubros se organizan según la especialidad que evalúa cada jurado. Primero agregá una especialidad.</p>
          <button className="secondary" type="button" onClick={onBack}>Volver a Jurados y especialidades</button>
        </div>
      )}

      {selectedSpecialty && <div className="evaluation-list-heading">
        <h3>Rubros de {selectedSpecialty.name}</h3>
      </div>}
      <p className="feedback" role="status">{message}</p>

      {!locked && showCreateForm && <SaveForm id="new-rubric-form" resetOnSuccess className="config-card rubric-create-form" onSubmit={(e) => { const fd = new FormData(e.currentTarget); return saveRubric(`/api/v1/events/${event.id}/rubrics`, { name: fd.get("name"), evaluationTarget: fd.get("evaluationTarget"), rubricType: fd.get("rubricType"), resolutionMethod: fd.get("resolutionMethod"), evaluationObjective: fd.get("evaluationObjective") || null, expectedSubjectType: fd.get("evaluationTarget") === "NOMINATION" ? fd.get("expectedSubjectType") : null }); }}>
        <h3>Agregar rubro</h3>
        <label>Nombre del rubro<input name="name" autoFocus required /></label>
        <label>A quién se evalúa<select name="evaluationTarget" value={newRubricTarget} onChange={(e) => setNewRubricTarget(e.target.value)}><option value="TROUPE">Comparsa</option><option value="NOMINATION">Nominación</option></select></label>
        <label>Tipo de evaluación<select name="rubricType">{RUBRIC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
        {newRubricTarget === "NOMINATION" && <label>Qué tipo de participante<select name="expectedSubjectType" defaultValue="PERSON">{SUBJECT_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label>}
        <label>Detalle adicional (opcional)<input name="evaluationObjective" placeholder="Por ejemplo: figura o participante" /></label>
        <details className="advanced-options">
          <summary>Opciones avanzadas</summary>
          <label>Método de resolución<select name="resolutionMethod" title="Este dato describe cómo se resuelve el rubro; no ejecuta fórmulas ni decisiones automáticas.">{RESOLUTION_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></label>
        </details>
        <div className="form-actions"><button type="submit">Crear rubro</button><button type="button" className="secondary" onClick={() => setShowCreateForm(false)}>Cancelar</button></div>
      </SaveForm>}

      {activeSpecialties.length > 0 && specialtyRubrics.length === 0 && <div className="evaluation-empty-state">
        <strong>Todavía no hay rubros asociados a {selectedSpecialty?.name ?? "esta especialidad"}</strong>
        <p>Los rubros indican qué evaluará el jurado. Podés agregar uno o vincular un ítem de un rubro existente a esta especialidad.</p>
        {!locked && <button type="button" className="secondary" onClick={() => setShowCreateForm(true)}>+ Agregar rubro</button>}
      </div>}

      <div className="rubric-list">
        {visibleRubrics.map((rubric, rubricIndex) => {
          const isUnassigned = unassignedRubrics.some((entry) => entry.id === rubric.id);
          const orderedItems = [...(rubric.items ?? [])].sort((a, b) => a.displayOrder - b.displayOrder);
          const derived = activeSpecialties.filter((s) => (rubric.items ?? []).some((i) => i.active !== false && i.specialtyId === s.id));
          const isExpanded = expanded === rubric.id;
          const rubricTypeLabel = RUBRIC_TYPES.find((t) => t.value === rubric.rubricType)?.label ?? LEGACY_RUBRIC_TYPE_LABELS[rubric.rubricType] ?? rubric.rubricType;
          const rubricStatus = rubric.active === false ? "Inactivo" : readinessStatus !== "available" ? "Estado por comprobar" : incompleteRubricIds.has(rubric.id) ? "Necesita configuración" : "Listo";
          return (
            <Fragment key={rubric.id}>
            {isUnassigned && rubricIndex === visibleRubrics.findIndex((entry) => unassignedRubrics.some((candidate) => candidate.id === entry.id)) && <h3 className="rubric-group-heading">Otros rubros por revisar</h3>}
            <article className={`rubric-card${isUnassigned ? " rubric-card-unassigned" : ""}`} data-rubric-id={rubric.id}>
              <div className="rubric-card-header">
                <div>
                  <h3>{rubric.name}{rubric.active === false && <small> · Inactivo</small>}</h3>
                  <span className="rubric-meta">{rubric.evaluationTarget === "NOMINATION" ? "Evalúa participantes nominados" : "Evalúa comparsas"} · {rubricTypeLabel}</span>
                  <span className="rubric-meta">{orderedItems.filter((item) => item.active !== false).length} ítems · {rubricStatus}</span>
                  {rubric.evaluationObjective && <span className="rubric-meta">{rubric.evaluationObjective}</span>}
                  {derived.length > 1 && <span className="rubric-shared-note">Este rubro se comparte entre {derived.map((specialty) => specialty.name).join(" y ")}.</span>}
                  {isUnassigned && <span className="rubric-shared-note">No tiene ítems asociados a una especialidad activa.</span>}
                </div>
                <div className="rubric-card-actions">
                  {tab === "items" && !locked && rubric.active !== false && (
                    <button type="button" aria-label={`Crear ítem en ${rubric.name}`} disabled={activeSpecialties.length === 0}
                      onClick={(event) => { itemCreateTriggerRef.current = event.currentTarget; setItemCreateTarget(rubric); }}>
                      Crear ítem
                    </button>
                  )}
                  <button className="secondary" type="button" aria-label={`${isExpanded ? "Contraer" : "Expandir"} ${rubric.name}`} aria-expanded={isExpanded} onClick={() => { setHighlightItemId(null); setExpanded(isExpanded ? null : rubric.id); setEditingRubricId(null); }}>
                    {isExpanded ? "Contraer" : "Expandir"}
                  </button>
                  {!locked && (rubric.active !== false ? (
                    <button className="secondary danger-action" type="button" aria-label={`Desactivar rubro ${rubric.name}`} onClick={(event) => { rubricDeleteTriggerRef.current = event.currentTarget; setRubricDeleteTarget(rubric); }}>
                      Desactivar
                    </button>
                  ) : (
                    <button className="secondary" type="button" aria-label={`Reactivar rubro ${rubric.name}`} onClick={() => requestMutationConfirmation("Reactivar rubro", `Se volverá a incluir ${rubric.name} en la configuración activa.`, () => setRubricActive(rubric, true), true)}>
                      Reactivar
                    </button>
                  ))}
                </div>
              </div>

              {isExpanded && (
                <div className="rubric-expanded">
                  {tab === "rubros" && <>
                  {!locked && (
                    editingRubricId === rubric.id ? (
                      <SaveForm className="rubric-edit-form" onSubmit={(e) => { const fd = new FormData(e.currentTarget); const body = { name: fd.get("name"), evaluationTarget: fd.get("evaluationTarget"), expectedSubjectType: fd.get("evaluationTarget") === "NOMINATION" ? fd.get("expectedSubjectType") : null, rubricType: fd.get("rubricType"), resolutionMethod: fd.get("resolutionMethod"), evaluationObjective: fd.get("evaluationObjective") || null, active: fd.get("active") === "on" }; requestMutationConfirmation("Guardar cambios del rubro", `Se actualizará la configuración de ${rubric.name}.`, async () => { const ok = await saveRubric(`/api/v1/rubrics/${rubric.id}`, body, "PATCH"); if (ok) setEditingRubricId(null); }); return false; }}>
                        <label>Nombre<input name="name" defaultValue={rubric.name} required /></label>
                        <label>A quién se evalúa<select name="evaluationTarget" value={editingRubricTarget} onChange={(e) => setEditingRubricTarget(e.target.value)}><option value="TROUPE">Comparsa</option><option value="NOMINATION">Nominación</option></select></label>
                        <label>Tipo<select name="rubricType" defaultValue={rubric.rubricType}>
                          {!RUBRIC_TYPES.some((type) => type.value === rubric.rubricType) && <option value={rubric.rubricType}>{LEGACY_RUBRIC_TYPE_LABELS[rubric.rubricType] ?? `${rubric.rubricType} (histórico)`}</option>}
                          {RUBRIC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select></label>
                        <label>Detalle (opcional)<input name="evaluationObjective" defaultValue={rubric.evaluationObjective ?? ""} /></label>
                        <details className="advanced-options">
                          <summary>Opciones avanzadas</summary>
                          {editingRubricTarget === "NOMINATION" && <label>Qué tipo de participante<select name="expectedSubjectType" defaultValue={rubric.expectedSubjectType ?? "PERSON"}>{SUBJECT_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label>}
                          <label>Método de resolución<select name="resolutionMethod" defaultValue={rubric.resolutionMethod} title="Este dato describe cómo se resuelve el rubro; no ejecuta fórmulas ni decisiones automáticas.">{RESOLUTION_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></label>
                        </details>
                        <label className="check"><input name="active" type="checkbox" defaultChecked={rubric.active} /> Activo</label>
                        <div className="form-actions">
                          <button type="submit">Guardar rubro</button>
                          <button type="button" className="secondary" onClick={() => setEditingRubricId(null)}>Cancelar</button>
                        </div>
                      </SaveForm>
                    ) : (
                      <div className="rubric-edit-actions">
                        <button className="secondary" type="button" onClick={() => { setEditingRubricId(rubric.id); setEditingRubricTarget(rubric.evaluationTarget); }}>Editar rubro</button>
                      </div>
                    )
                  )}

                  {rubric.evaluationTarget === "NOMINATION" && (
                    <section className="rubric-nominations" aria-label={`Participantes nominados para ${rubric.name}`}>
                      <h4>Participantes nominados</h4>
                      <p>Agregá a cada persona, pareja o unidad que el jurado puntuará por separado. El tipo {subjectTypeLabel(rubric.expectedSubjectType)} se hereda de este rubro.</p>
                      <ul className="rubric-nomination-list">
                        {(rubric.nominations ?? []).map((nomination) => (
                          <li key={nomination.id} className={nomination.active ? "" : "is-inactive"}>
                            <span><strong>{nomination.displayName}</strong> · {nomination.troupeName} <small>({subjectTypeLabel(nomination.subjectType)})</small></span>
                            {!locked && (
                              <button
                                className="secondary"
                                type="button"
                                onClick={() => setNominationStatusTarget({ nomination, active: !nomination.active })}
                              >
                                {nomination.active ? "Desactivar" : "Reactivar"}
                              </button>
                            )}
                            {!nomination.active && <StatusPill status="SUSPENDED" label="Inactivo" />}
                          </li>
                        ))}
                      </ul>
                      {!locked && activeTroupes.length > 0 && (
                        <SaveForm
                          resetOnSuccess
                          className="inline-nomination-form"
                          onSubmit={(e) => {
                            const fd = new FormData(e.currentTarget);
                            const troupe = activeTroupes.find((entry) => entry.id === fd.get("eventTroupeId"));
                            setNominationCreateTarget({
                              rubricId: rubric.id,
                              rubricName: rubric.name,
                              troupeName: troupe?.name ?? "la comparsa seleccionada",
                              body: { eventTroupeId: fd.get("eventTroupeId"), displayName: fd.get("displayName") },
                            });
                            return false;
                          }}
                        >
                          <label>Comparsa<select name="eventTroupeId" required defaultValue=""><option value="" disabled>Elegí una comparsa</option>{activeTroupes.map((troupe) => <option key={troupe.id} value={troupe.id}>{troupe.name}</option>)}</select></label>
                          <label>Nombre del participante<input name="displayName" required placeholder="Ej.: Ana López o Pareja de baile" /></label>
                          {rubric.rubricType === "RANDOM" && <small>Máximo 3 participantes activos por comparsa en este rubro.</small>}
                          <button type="submit">Agregar participante</button>
                        </SaveForm>
                      )}
                    </section>
                  )}

                  </>}

                  {tab === "items" && <>
                  <h4>Items puntuables</h4>
                  {orderedItems.map((item, itemIndex) => (
                    <article className={`subrecord${highlightItemId === item.id ? " is-target" : ""}`} key={item.id} data-item-id={item.id}>
                      {editingItem === item.id ? (
                        <SaveForm onSubmit={(e) => { const fd = new FormData(e.currentTarget); const body = { name: fd.get("name"), specialtyId: fd.get("specialtyId"), displayOrder: Number(fd.get("displayOrder")), required: fd.get("required") === "on", allowNotPresented: fd.get("allowNotPresented") === "on", active: fd.get("active") === "on" }; requestMutationConfirmation("Guardar cambios del ítem", `Se actualizará ${item.name} y su configuración de puntuación.`, () => saveItem(rubric.id, body, "PATCH", item.id)); return false; }}>
                          <label>Nombre<input name="name" defaultValue={item.name} required /></label>
                          <label>Especialidad<select name="specialtyId" defaultValue={item.specialtyId}>{activeSpecialties.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
                          <label>Orden<input name="displayOrder" type="number" min="1" defaultValue={item.displayOrder} required /></label>
                          <details className="advanced-options">
                            <summary>Opciones avanzadas</summary>
                            <label className="check"><input name="required" type="checkbox" defaultChecked={item.required} title="Todos los items deben resolverse. Pendientes bloquean cierre." /> Obligatorio</label>
                            <label className="check"><input name="allowNotPresented" type="checkbox" defaultChecked={item.allowNotPresented} title="Admite calificación 'No se presentó'." /> Permite No presentado</label>
                          </details>
                          <label className="check"><input name="active" type="checkbox" defaultChecked={item.active} /> Activo</label>
                          <div className="form-actions">
                            <button type="submit">Guardar item</button>
                            <button type="button" className="secondary" onClick={() => setEditingItem(null)}>Cancelar</button>
                          </div>
                        </SaveForm>
                      ) : (
                        <div className="subrecord-summary">
                          <strong>{item.name}</strong>
                          <span>{item.specialtyName}</span>
                          <span className="mono-text">Orden: {item.displayOrder}</span>
                          {!locked && <button className="secondary" type="button" aria-label={`Editar item ${item.name}`} onClick={() => setEditingItem(item.id)}>Editar</button>}
                          {!locked && <>
                            <button className="secondary" type="button" aria-label={`Subir item ${item.name}`} disabled={itemIndex === 0 || !!editingItem || !!editingCriterion} onClick={() => requestMutationConfirmation("Confirmar cambio de orden", `Se cambiará el orden de ${item.name}.`, () => reorder(rubric.id, "items", item, orderedItems[itemIndex - 1], "UP"), true)}>Subir</button>
                            <button className="secondary" type="button" aria-label={`Bajar item ${item.name}`} disabled={itemIndex === orderedItems.length - 1 || !!editingItem || !!editingCriterion} onClick={() => requestMutationConfirmation("Confirmar cambio de orden", `Se cambiará el orden de ${item.name}.`, () => reorder(rubric.id, "items", item, orderedItems[itemIndex + 1], "DOWN"), true)}>Bajar</button>
                          </>}
                        </div>
                      )}
                      <div className="criterion-list">
                        {(rubric.criteria ?? []).filter((c) => c.scoringItemId === item.id).sort((a, b) => a.displayOrder - b.displayOrder).map((crit, criterionIndex, siblings) => (
                          <article className="subrecord criterion" key={crit.id}>
                            {editingCriterion === crit.id ? (
                              <SaveForm onSubmit={(e) => { const fd = new FormData(e.currentTarget); const body = { scoringItemId: fd.get("scoringItemId"), description: fd.get("description"), displayOrder: Number(fd.get("displayOrder")), active: fd.get("active") === "on" }; requestMutationConfirmation("Guardar cambios del criterio", `Se actualizará el criterio ${crit.description}.`, () => saveCriterion(rubric.id, body, "PATCH", crit.id)); return false; }}>
                                <label>Descripcion<textarea name="description" defaultValue={crit.description} required /></label>
                                <label>Item<select name="scoringItemId" defaultValue={crit.scoringItemId} required>{(rubric.items ?? []).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label>
                                <label>Orden<input name="displayOrder" type="number" min="1" defaultValue={crit.displayOrder} required /></label>
                                <label className="check"><input name="active" type="checkbox" defaultChecked={crit.active} /> Activo</label>
                                <button type="submit" aria-label={`Guardar criterio ${crit.description}`}>Guardar</button>
                                <button type="button" className="secondary" aria-label={`Cancelar edicion de criterio ${crit.description}`} onClick={() => setEditingCriterion(null)}>Cancelar</button>
                              </SaveForm>
                            ) : (
                              <div className="subrecord-summary">
                                <span>{crit.description}</span>
                                <span className="mono-text">#{crit.displayOrder}</span>
                                {!locked && <button className="secondary" type="button" aria-label={`Editar criterio ${crit.description}`} onClick={() => setEditingCriterion(crit.id)}>Editar</button>}
                                {!locked && <>
                                  <button className="secondary" type="button" aria-label={`Subir criterio ${crit.description}`} disabled={criterionIndex === 0 || !!editingItem || !!editingCriterion} onClick={() => requestMutationConfirmation("Confirmar cambio de orden", `Se cambiará el orden del criterio ${crit.description}.`, () => reorder(rubric.id, "criteria", crit, siblings[criterionIndex - 1], "UP"), true)}>Subir</button>
                                  <button className="secondary" type="button" aria-label={`Bajar criterio ${crit.description}`} disabled={criterionIndex === siblings.length - 1 || !!editingItem || !!editingCriterion} onClick={() => requestMutationConfirmation("Confirmar cambio de orden", `Se cambiará el orden del criterio ${crit.description}.`, () => reorder(rubric.id, "criteria", crit, siblings[criterionIndex + 1], "DOWN"), true)}>Bajar</button>
                                </>}
                              </div>
                            )}
                          </article>
                        ))}
                        {!locked && (
                          <SaveForm resetOnSuccess className="inline-criterion-form" onSubmit={(e) => { const fd = new FormData(e.currentTarget); return saveCriterion(rubric.id, { scoringItemId: item.id, description: fd.get("description"), displayOrder: Number(fd.get("displayOrder")) }); }}>
                            <input name="description" aria-label={`Nuevo criterio para ${item.name}`} placeholder="Guía para el jurado (ej: Sincronización)" required />
                            <input name="displayOrder" aria-label={`Orden del nuevo criterio para ${item.name}`} type="number" min="1" defaultValue="1" required className="input-order" />
                            <button type="submit" aria-label={`Agregar criterio a ${item.name}`}>+</button>
                          </SaveForm>
                        )}
                      </div>
                    </article>
                  ))}

                  {!locked && orderedItems.length === 0 && <p className="field-hint">Este rubro todavía no tiene ítems puntuables; agregá el primero desde su tarjeta.</p>}
                  </>}
                </div>
              )}
            </article>
            </Fragment>
          );
        })}
      </div>
      <Dialog
        isOpen={itemCreateTarget !== null && !locked}
        onClose={() => setItemCreateTarget(null)}
        title={itemCreateTarget ? `Crear ítem en ${itemCreateTarget.name}` : "Crear ítem"}
        description="Definí el nombre, la especialidad y las opciones de puntuación del ítem."
        focusReturnRef={itemCreateTriggerRef}
      >
        {itemCreateTarget && <SaveForm className="item-create-form" onSubmit={(event) => {
          const formData = new FormData(event.currentTarget);
          const target = itemCreateTarget;
          const body = {
            name: formData.get("name"),
            specialtyId: formData.get("specialtyId"),
            required: formData.get("required") === "on",
            allowNotPresented: formData.get("allowNotPresented") === "on",
          };
          setMutationConfirmTarget({
            title: "Confirmar creación del ítem",
            description: `Se agregará ${body.name} a ${target.name}.`,
            commit: async () => {
              const saved = await saveItem(target.id, body);
              if (saved) {
                setExpanded(target.id);
                setItemCreateTarget(null);
              }
            },
          });
          return false;
        }}>
          <label>Nombre<input name="name" aria-label={`Nuevo item puntuable para ${itemCreateTarget.name}`} placeholder="Nuevo item puntuable" required /></label>
          <label>Especialidad<select name="specialtyId" aria-label={`Especialidad del nuevo item para ${itemCreateTarget.name}`} required defaultValue="">
            <option value="">Elegí una especialidad</option>
            {activeSpecialties.map((specialty) => <option key={specialty.id} value={specialty.id}>{specialty.name}</option>)}
          </select></label>
          <details className="advanced-options">
            <summary>Opciones avanzadas</summary>
            <label className="check"><input name="required" type="checkbox" defaultChecked title="Todos los items deben resolverse. Pendientes bloquean cierre." /> Obligatorio</label>
            <label className="check"><input name="allowNotPresented" type="checkbox" defaultChecked title="Admite calificación 'No se presentó'." /> Permite No presentado</label>
          </details>
          <DialogFooter>
            <Button variant="secondary" type="button" onClick={() => setItemCreateTarget(null)}>Cancelar</Button>
            <Button variant="primary" type="submit">Agregar ítem</Button>
          </DialogFooter>
        </SaveForm>}
      </Dialog>
      <Dialog
        isOpen={mutationConfirmTarget !== null && !locked}
        onClose={() => setMutationConfirmTarget(null)}
        title={mutationConfirmTarget?.title ?? "Confirmar cambio"}
        description={mutationConfirmTarget?.description ?? "Confirmá el cambio antes de guardarlo."}
      >
        <DialogFooter>
          <Button variant="secondary" onClick={() => setMutationConfirmTarget(null)}>Cancelar</Button>
          <Button variant="primary" onClick={() => void confirmMutation()}>Confirmar y guardar</Button>
        </DialogFooter>
      </Dialog>
      <Dialog
        isOpen={rubricDeleteTarget !== null && !locked}
        onClose={() => setRubricDeleteTarget(null)}
        title={rubricDeleteTarget ? `Desactivar ${rubricDeleteTarget.name}` : "Desactivar rubro"}
        description="El rubro dejará de formar parte de la configuración activa. El registro y sus datos se conservarán; no se borrarán sus antecedentes."
        focusReturnRef={rubricDeleteTriggerRef}
      >
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={() => setRubricDeleteTarget(null)}>Cancelar</button>
          <button type="button" className="danger-action" onClick={confirmDeleteRubric}>Desactivar</button>
        </div>
      </Dialog>
      <Dialog
        isOpen={nominationCreateTarget !== null && !locked}
        onClose={() => setNominationCreateTarget(null)}
        title="Agregar participante al rubro"
        description={nominationCreateTarget
          ? `Se agregará a ${nominationCreateTarget.body.displayName} de ${nominationCreateTarget.troupeName} a ${nominationCreateTarget.rubricName}. El participante tendrá una puntuación independiente.`
          : ""}
      >
        <DialogFooter>
          <Button variant="secondary" onClick={() => setNominationCreateTarget(null)}>Cancelar</Button>
          <Button variant="primary" onClick={() => void confirmNominationCreate()}>Agregar participante</Button>
        </DialogFooter>
      </Dialog>

      <Dialog
        isOpen={nominationStatusTarget !== null && !locked}
        onClose={() => setNominationStatusTarget(null)}
        title={nominationStatusTarget?.active ? "Reactivar participante" : "Desactivar participante"}
        description={nominationStatusTarget
          ? `${nominationStatusTarget.active ? "Se incluirá" : "Se excluirá"} a ${nominationStatusTarget.nomination.displayName} (${nominationStatusTarget.nomination.troupeName}) de las nuevas planillas de este rubro.`
          : "Confirmá el cambio del participante."}
      >
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={() => setNominationStatusTarget(null)}>Cancelar</button>
          <button type="button" className={nominationStatusTarget?.active ? "primary" : "danger-action"} onClick={confirmNominationStatus}>
            {nominationStatusTarget?.active ? "Reactivar" : "Desactivar"}
          </button>
        </div>
      </Dialog>
    </section>
  );
}

function MatrizPlanillasSection({ event, onResolveRubric }) {
  const [rubrics, setRubrics] = useState([]);
  const [specialties, setSpecialties] = useState([]);
  const [selected, setSelected] = useState(null);

  const { dataRevision } = useContext(WriteContext);

  useEffect(() => {
    let active = true;
    apiRequest(`/api/v1/events/${event.id}/rubrics`).then((loaded) => { if (active) setRubrics(loaded); }).catch(() => {});
    apiRequest(`/api/v1/events/${event.id}/specialties`).then((loaded) => { if (active) setSpecialties(loaded); }).catch(() => {});
    return () => { active = false; };
  }, [event.id, dataRevision]);

  const activeSpecialties = specialties.filter((s) => s.active !== false);
  const activeRubrics = rubrics.filter((r) => r.active !== false);
  const missingRubrics = activeRubrics.filter(
    (r) => !(r.items ?? []).some((i) => i.active !== false),
  );
  const uncoveredSpecialties = activeSpecialties.filter(
    (s) => !activeRubrics.some((r) => (r.items ?? []).some((i) => i.active !== false && i.specialtyId === s.id)),
  );

  return (
    <section className="config-section">
      <div className="section-heading"><h2>Planillas de evaluación</h2><p>Qué especialidad evalúa qué rubro. Se genera automaticamente desde la configuracion.</p></div>
      {(missingRubrics.length > 0 || uncoveredSpecialties.length > 0) && (
        <div className="overview-alert" role="alert">
          <strong>⚠ Te faltan {missingRubrics.length + uncoveredSpecialties.length} asignaciones para completar la matriz.</strong>
          <ul>
            {missingRubrics.map((r) => (
              <li key={r.id}>
                El rubro “{r.name}” no tiene ítems puntuables.{" "}
                {onResolveRubric && (
                  <button className="secondary" type="button" aria-label={`Resolver rubro ${r.name}`} onClick={() => onResolveRubric(r.id)}>
                    Resolver
                  </button>
                )}
              </li>
            ))}
            {uncoveredSpecialties.map((s) => (
              <li key={s.id}>La especialidad “{s.name}” todavía no evalúa ningún rubro.</li>
            ))}
          </ul>
        </div>
      )}
      <div className="matrix-wrapper">
        <table className="matrix-table">
          <thead>
            <tr>
              <th>Rubro</th>
              {activeSpecialties.map((s) => <th key={s.id}>{s.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {activeRubrics.map((r) => (
              <tr key={r.id}>
                <td>
                  <button className="matrix-rubric-btn" type="button" onClick={() => setSelected(selected === r.id ? null : r.id)}>
                    {r.name}
                  </button>
                </td>
                {activeSpecialties.map((s) => {
                  const hasItem = (r.items ?? []).some((i) => i.active !== false && i.specialtyId === s.id);
                  return <td key={s.id} className={hasItem ? "matrix-yes" : "matrix-no"}>{hasItem ? "\u2713" : "\u2014"}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected && (
        <div className="matrix-detail">
          <h3>{activeRubrics.find((r) => r.id === selected)?.name}</h3>
          <p>Items y criterios de este rubro:</p>
          {(activeRubrics.find((r) => r.id === selected)?.items ?? []).map((item) => (
            <article className="matrix-detail-item" key={item.id}>
              <strong>{item.name}</strong>
              <span>{item.specialtyName}</span>
              <ul>
                {(activeRubrics.find((r) => r.id === selected)?.criteria ?? []).filter((c) => c.scoringItemId === item.id).map((c) => (
                  <li key={c.id}>{c.description}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
import { ScheduledPassTime } from "../components/ScheduledPassTime.jsx";
