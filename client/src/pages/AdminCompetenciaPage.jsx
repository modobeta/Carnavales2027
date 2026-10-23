import { Fragment, createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useAdminEvent } from "../context/AdminEventContext.jsx";
import { PageShell } from "../components/PageShell.jsx";
import { apiRequest } from "../api/http.js";
import { removeTroupeLogo, uploadTroupeLogo } from "../api/troupes.js";
import { StatusPill } from "../components/StatusPill.jsx";
import { EntityDrawer } from "../components/EntityDrawer.jsx";
import { Dialog } from "../components/Dialog.jsx";
import { DialogFooter } from "../components/DialogFooter.jsx";
import { Button } from "../components/Button.jsx";
import { TroupeLogo } from "../components/TroupeLogo.jsx";
import { RubricIcon } from "../components/RubricIcon.jsx";
import { RubricIconPicker } from "../components/RubricIconPicker.jsx";
import { TroupeForm } from "../features/TroupeForm.jsx";
import { CatalogForm } from "../features/CatalogForm.jsx";
import { PREPARATION_STEPS, READINESS_STATE_LABELS, isInterpretableReadiness, readinessIssues, readinessStepStates } from "../features/readiness-presentation.js";
import { uxStatusLabel } from "../components/admin-ux-labels.js";
import { AdminAssignmentsPage } from "./AdminAssignmentsPage.jsx";
import { JuradosPorJornadaSection } from "../features/JuradosPorJornadaSection.jsx";
import { ConfirmDialog } from "../components/ConfirmDialog.jsx";
import { createPendingEventOpenOperation, resolvePendingEventOpenOperation } from "../features/event-open-operation.js";
import { deriveEvaluationPresentation } from "../features/evaluation-presentation.js";
import { evaluationItemCode, unequivocalCreateRejection } from "../features/evaluation-create-flow.js";
import { hashHistoryPosition, markHashHistoryEntry } from "../features/hash-history.js";

const WriteContext = createContext(null);

function receiptMatches(rubrics, receipt) {
  const rubric = rubrics.find((entry) => entry.id === receipt.rubricId);
  const row = receipt.kind === "rubric" ? rubric
    : rubric?.[receipt.kind]?.find((entry) => entry.id === receipt.id);
  return Boolean(row && Object.entries(receipt.fields).every(([key, value]) => row[key] === value));
}

function changedReceiptFields(body, saved, previous) {
  return Object.fromEntries(Object.keys(body)
    .filter((key) => Object.hasOwn(previous ?? {}, key) && previous[key] !== (saved[key] ?? body[key]))
    .map((key) => [key, saved[key] ?? body[key]]));
}

function showConfirmedChange(rubric, receipt) {
  if (receipt.kind === "rubric") return { ...rubric, ...receipt.data };
  const rows = rubric[receipt.kind] ?? [];
  const updated = rows.some((row) => row.id === receipt.id)
    ? rows.map((row) => row.id === receipt.id ? { ...row, ...receipt.data } : row)
    : [...rows, receipt.data];
  return { ...rubric, [receipt.kind]: updated };
}

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

// Error de carga inicial con reintento: nunca se presenta como lista vacía (spec 040, E-2).
function LoadErrorAlert({ message, onRetry }) {
  return (
    <div className="overview-alert" role="alert">
      <strong>{message}</strong>{" "}
      <button type="button" className="secondary" onClick={onRetry}>Reintentar</button>
    </div>
  );
}

function incompleteStepGuidance(stepKey, readiness) {
  const missing = new Set(readiness?.missing ?? []);
  const messages = [];

  if (stepKey === "participantes") {
    if (missing.has("ACTIVE_TROUPE")) messages.push("No hay comparsas activas. Creá una comparsa o activá una existente.");
    for (const troupe of readiness?.incompleteTroupes ?? []) {
      messages.push(`Elegí una categoría activa para ${troupe.name ?? "esta comparsa"}.`);
    }
    for (const nomination of readiness?.incompleteNominations ?? []) {
      messages.push(`Cargá el participante que falta para ${nomination.rubricName ?? "el rubro"} en ${nomination.troupeName ?? "la comparsa"}.`);
    }
    if (messages.length === 0) messages.push("Revisá los participantes y completá los datos que faltan para continuar.");
  }

  if (stepKey === "jurados") {
    if (missing.has("ACTIVE_SPECIALTY")) messages.push("No hay especialidades activas. Creá o activá una especialidad antes de asignar jurados.");
    for (const night of readiness?.nightsWithoutJury ?? []) {
      messages.push(`Asigná un jurado activo a ${night.nightName ?? "esta jornada"}.`);
    }
    if (missing.has("NIGHTS_WITHOUT_JURY") && messages.length === 0) messages.push("Revisá las asignaciones y asegurate de que cada jornada tenga un jurado activo.");
    if (messages.length === 0) messages.push("Revisá las especialidades y las asignaciones de jurados para completar este paso.");
  }

  if (stepKey === "rubros") {
    if (missing.has("ACTIVE_RUBRIC")) messages.push("No hay rubros activos. Creá o activá un rubro para definir qué se va a evaluar.");
    for (const rubric of readiness?.incompleteRubrics ?? []) {
      messages.push(`${rubric.name ?? "Este rubro"}: agregá ítems puntuables y asigná cada uno a una especialidad activa.`);
    }
    if (messages.length === 0) messages.push("Revisá los rubros e ítems de evaluación y completá lo que falta.");
  }

  if (stepKey === "revision") return "Antes de abrir el evento, resolvé los bloqueos detallados más abajo.";
  return messages.join(" ");
}

export function AdminCompetenciaPage({ event, onBack, initialStep = "participantes", initialTab = "" }) {
  const adminEvent = useAdminEvent();
  const draftGuard = useRef(null);
  const [hasDraftGuard, setHasDraftGuard] = useState(false);
  const registerDraftGuard = useCallback((guard) => {
    draftGuard.current = guard;
    setHasDraftGuard(true);
    return () => {
      if (draftGuard.current === guard) {
        draftGuard.current = null;
        setHasDraftGuard(false);
      }
    };
  }, []);
  const requestLeave = (action) => {
    if (!draftGuard.current?.(action)) action();
  };
  useEffect(() => hasDraftGuard ? adminEvent?.registerEventChangeGuard?.((commit) => draftGuard.current?.(commit) ?? false) : undefined,
    [hasDraftGuard, adminEvent?.registerEventChangeGuard]);

  // The Navigation API can hold a same-document traversal before it commits.
  // Legacy hashchange runs after history moved: App marks visited entries so
  // we can traverse back to the draft without replacing the destination.
  useEffect(() => {
    if (!hasDraftGuard) return undefined;
    const navigation = window.navigation;
    const acceptedHash = window.location.hash;
    const acceptedPosition = markHashHistoryEntry();
    let restoring = null;
    const onNavigate = (change) => {
      if (restoring || !change.canIntercept || !change.cancelable || !change.destination?.url) return;
      const destination = new URL(change.destination.url);
      if (destination.origin !== window.location.origin || destination.pathname !== window.location.pathname
        || destination.search !== window.location.search || destination.hash === window.location.hash) return;
      change.intercept({
        focusReset: "manual",
        scroll: "manual",
        precommitHandler: () => new Promise((resolve, reject) => {
          if (!draftGuard.current?.(resolve, () => reject(new DOMException("Se conservó el borrador", "AbortError")))) resolve();
        }),
      });
    };
    navigation?.addEventListener?.("navigate", onNavigate);
    const acceptedHistoryLength = window.history.length;
    const onHashChange = (change) => {
      const target = window.location.hash;
      if (restoring) {
        change.stopImmediatePropagation();
        if (target === acceptedHash) {
          const { delta } = restoring;
          restoring = null;
          draftGuard.current?.(() => window.history.go(delta));
        }
        return;
      }
      if (target === acceptedHash) return;
      if (!draftGuard.current) return;
      const destinationPosition = hashHistoryPosition();
      // An unmarked older entry has no readable direction. Only treat an
      // unmarked hash as a new forward entry when the stack actually grew.
      // Never guess a rollback for an entry from before this document loaded.
      if (destinationPosition === null && window.history.length <= acceptedHistoryLength) return;
      const delta = destinationPosition === null ? 1 : destinationPosition - acceptedPosition || 1;
      restoring = { delta };
      window.history.go(-delta);
      change.stopImmediatePropagation();
    };
    window.addEventListener("hashchange", onHashChange, true);
    return () => {
      navigation?.removeEventListener?.("navigate", onNavigate);
      window.removeEventListener("hashchange", onHashChange, true);
    };
  }, [hasDraftGuard]);
  const availableSteps = PREPARATION_STEPS;
  const validInitialStep = availableSteps.some((item) => item.key === initialStep) ? initialStep : "participantes";
  const [step, setStep] = useState(validInitialStep);
  const getTabFromHash = () => new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("tab") ?? "";
  const [juryTab, setJuryTab] = useState(() => (initialTab || getTabFromHash()) === "asignaciones" ? "asignaciones" : "especialidades");
  const [troupeTab, setTroupeTab] = useState("comparsas");
  const [rubricTab, setRubricTab] = useState("rubros");
  const [pending, setPending] = useState(false);
  const [focusRubricId, setFocusRubricId] = useState(null);
  const [evaluationState, setEvaluationState] = useState({ eventId: null, status: "loading", data: null });
  const [essentialCatalogState, setEssentialCatalogState] = useState({ eventId: null, data: null });
  const [catalogState, setCatalogState] = useState({ eventId: null, status: "loading", data: null });
  const [editorSpecialties, setEditorSpecialties] = useState({ eventId: null, data: [] });
  const [confirmedReads, setConfirmedReads] = useState({ eventId: null, entries: [] });
  const [confirmedEditor, setConfirmedEditor] = useState({ eventId: null, entries: {} });
  const [readinessState, setReadinessState] = useState({ eventId: null, status: "unqueried", data: null });
  const [dataRevision, setDataRevision] = useState(0);
  const [readinessRevision, setReadinessRevision] = useState(0);
  const [currentEvent, setCurrentEvent] = useState(event);
  const [openingEvent, setOpeningEvent] = useState(false);
  const [confirmOpenEvent, setConfirmOpenEvent] = useState(false);
  const [openEventMessage, setOpenEventMessage] = useState("");
  const writingByEvent = useRef({ eventId: event.id, ref: { current: false } });
  if (writingByEvent.current.eventId !== event.id) writingByEvent.current = { eventId: event.id, ref: { current: false } };
  const writing = writingByEvent.current.ref;
  const progressRequest = useRef(0);
  const readinessRequest = useRef(0);
  const activeEventId = useRef(event.id);
  activeEventId.current = event.id;
  const invalidateEvaluation = () => {
    if (event.id !== activeEventId.current) return;
    ++progressRequest.current;
    ++readinessRequest.current;
    setEvaluationState({ eventId: event.id, status: "loading", data: null });
    setEssentialCatalogState({ eventId: event.id, data: null });
    setCatalogState({ eventId: event.id, status: "loading", data: null });
    setReadinessState({ eventId: event.id, status: "unqueried", data: null });
  };
  const registerConfirmed = (receipt) => {
    if (event.id !== activeEventId.current || !receipt?.id) return;
    setConfirmedReads((previous) => {
      const entries = previous.eventId === event.id ? previous.entries : [];
      const earlier = entries.find((entry) => entry.kind === receipt.kind && entry.id === receipt.id);
      return { eventId: event.id, entries: [
        ...entries.filter((entry) => !(entry.kind === receipt.kind && entry.id === receipt.id)),
        earlier ? { ...receipt, fields: { ...earlier.fields, ...receipt.fields }, data: { ...earlier.data, ...receipt.data } } : receipt,
      ] };
    });
  };
  const rememberConfirmedEditor = (receipt, visibleSource) => {
    if (event.id !== activeEventId.current || !receipt?.id) return;
    setConfirmedEditor((previous) => {
      const entries = previous.eventId === event.id ? previous.entries : {};
      const source = entries[receipt.rubricId] ?? visibleSource ?? (receipt.kind === "rubric" ? receipt.data : null);
      return source ? { eventId: event.id, entries: { ...entries, [receipt.rubricId]: showConfirmedChange(source, receipt) } } : previous;
    });
  };

  useEffect(() => {
    setCurrentEvent(event);
  }, [event]);
  useEffect(() => { setPending(false); }, [event.id]);
  useEffect(() => { setOpeningEvent(false); setConfirmOpenEvent(false); setOpenEventMessage(""); }, [event.id]);

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
    if (event.id !== activeEventId.current) return () => {};
    const request = ++progressRequest.current;
    setEvaluationState({ eventId: event.id, status: "loading", data: null });
    setEssentialCatalogState({ eventId: event.id, data: null });
    setCatalogState({ eventId: event.id, status: "loading", data: null });
    const read = (resource) => apiRequest(`/api/v1/events/${event.id}/${resource}`);
    const troupesRead = read("troupes");
    const categoriesRead = read("categories");
    const specialtiesRead = read("specialties").then((data) => {
      if (request === progressRequest.current && Array.isArray(data)) setEditorSpecialties({ eventId: event.id, data });
      return data;
    });
    const rubricsRead = read("rubrics");
    Promise.all([specialtiesRead, rubricsRead]).then(([specialties, rubrics]) => {
      if (request !== progressRequest.current) return;
      setEssentialCatalogState({ eventId: event.id, data: Array.isArray(specialties) && Array.isArray(rubrics)
        && rubrics.every((rubric) => Array.isArray(rubric.items)) ? { specialties, rubrics } : null });
    }).catch(() => {
      if (request === progressRequest.current) setEssentialCatalogState({ eventId: event.id, data: null });
    });
    const orphanedRead = read("orphaned-criteria");
    const readinessRead = read("readiness");
    const supplementalNames = ["comparsas", "categorías", "criterios descriptivos"];
    let supplemental = { troupes: [], orphaned: [], secondaryErrors: [], secondaryPending: supplementalNames };
    const settleSupplemental = (name, key, result, failed) => {
      supplemental = { ...supplemental,
        ...(key && !failed ? { [key]: result } : {}),
        secondaryErrors: failed ? [...supplemental.secondaryErrors, name] : supplemental.secondaryErrors,
        secondaryPending: supplemental.secondaryPending.filter((entry) => entry !== name),
      };
      if (request === progressRequest.current) setEvaluationState((previous) => previous.eventId === event.id && previous.status === "available"
        ? { ...previous, data: { ...previous.data, ...supplemental } } : previous);
    };
    troupesRead.then((result) => settleSupplemental("comparsas", "troupes", result, false), () => settleSupplemental("comparsas", "troupes", null, true));
    categoriesRead.then((result) => settleSupplemental("categorías", null, result, false), () => settleSupplemental("categorías", null, null, true));
    orphanedRead.then((result) => settleSupplemental("criterios descriptivos", "orphaned", result, false), () => settleSupplemental("criterios descriptivos", "orphaned", null, true));
    Promise.all([
      troupesRead, categoriesRead, specialtiesRead, rubricsRead, orphanedRead,
    ]).then(([troupes, categories, specialties, rubrics, orphaned]) => {
      const data = { troupes, categories, specialties, rubrics, orphaned };
      if (request === progressRequest.current) setCatalogState({ eventId: event.id, status: "available", data });
      return data;
    }).catch((error) => {
      if (request === progressRequest.current) setCatalogState({ eventId: event.id, status: "error", data: null });
    });
    Promise.all([specialtiesRead, rubricsRead, readinessRead]).then(([specialties, rubrics, readiness]) => {
      if (request !== progressRequest.current) return;
      if (!isInterpretableReadiness(readiness) || !Array.isArray(specialties) || !Array.isArray(rubrics)) {
        setEvaluationState({ eventId: event.id, status: "error", data: null });
        return;
      }
      setEvaluationState({ eventId: event.id, status: "available", data: {
        specialties, rubrics, readiness, ...supplemental,
      } });
    }).catch(() => {
      if (request !== progressRequest.current) return;
      setEvaluationState({ eventId: event.id, status: "error", data: null });
    });
    return () => { progressRequest.current += 1; };
  };

  const retryEvaluation = () => {
    if (event.id !== activeEventId.current) return;
    ++readinessRequest.current;
    setReadinessState({ eventId: event.id, status: "unqueried", data: null });
    setReadinessRevision((revision) => revision + 1);
    reloadProgress();
  };

  useEffect(reloadProgress, [event.id]);

  useEffect(() => {
    let active = true;
    const request = ++readinessRequest.current;
    setReadinessState({ eventId: event.id, status: "unqueried", data: null });
    apiRequest(`/api/v1/events/${event.id}/readiness`).then((readiness) => {
      if (active && request === readinessRequest.current && event.id === activeEventId.current) setReadinessState({ eventId: event.id, status: isInterpretableReadiness(readiness) ? "available" : "unavailable", data: isInterpretableReadiness(readiness) ? readiness : null });
    }).catch((error) => {
      if (!active || request !== readinessRequest.current || event.id !== activeEventId.current) return;
      setReadinessState({ eventId: event.id, status: "unavailable", data: null });
    });
    return () => { active = false; };
  }, [event.id, dataRevision, readinessRevision]);

  const paired = evaluationState.eventId === event.id && evaluationState.status === "available" ? evaluationState.data : null;
  const editorCatalog = paired ?? (essentialCatalogState.eventId === event.id ? essentialCatalogState.data : null);
  const outstanding = confirmedReads.eventId === event.id ? confirmedReads.entries : [];
  const unreflected = paired ? outstanding.filter((entry) => !receiptMatches(paired.rubrics, entry)) : outstanding;
  useEffect(() => {
    if (!paired || unreflected.length === outstanding.length) return;
    setConfirmedReads((previous) => previous.eventId === event.id ? { ...previous, entries: previous.entries.filter((entry) => !receiptMatches(paired.rubrics, entry)) } : previous);
  }, [paired, confirmedReads, event.id]);
  const progress = catalogState.eventId === event.id && catalogState.status === "available" ? catalogState.data : null;
  const progressError = catalogState.eventId === event.id && catalogState.status === "error";
  const specialtiesActive = (progress?.specialties ?? []).filter((s) => s.active !== false);
  const activeReviewRubrics = (progress?.rubrics ?? []).filter((rubric) => rubric.active !== false);
  const activeReviewRubricIds = new Set(activeReviewRubrics.map((rubric) => rubric.id));
  const reviewCriteriaCount = new Set([
    ...activeReviewRubrics.flatMap((rubric) => (rubric.criteria ?? []).filter((criterion) => criterion.active !== false).map((criterion) => criterion.id)),
    ...(progress?.orphaned ?? []).filter((criterion) => criterion.active !== false && activeReviewRubricIds.has(criterion.rubricId)).map((criterion) => criterion.id),
  ]).size;
  const evaluation = paired && unreflected.length === 0 ? deriveEvaluationPresentation(paired) : null;
  const evaluationStatus = evaluation ? "available" : paired && unreflected.length > 0 ? "unreflected"
    : evaluationState.eventId === event.id && ["available", "error"].includes(evaluationState.status) ? "error" : "loading";
  // La apertura y los bloqueos oficiales provienen de readiness, nunca de la proyección visual.
  const currentReadiness = readinessState.eventId === event.id ? readinessState.data : null;
  const currentReadinessStatus = readinessState.eventId === event.id ? readinessState.status : "unqueried";
  const stepStatuses = readinessStepStates(currentReadiness, currentReadinessStatus);
  const steps = availableSteps.map((item) => ({ ...item, label: item.key === "rubros" ? "Evaluación" : item.label }));
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
    // Solo se navega a pasos visibles: un paso oculto no se alcanza ni monta sus consultas.
    if (key !== step && availableSteps.some((item) => item.key === key)) requestLeave(() => setStep(key));
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
      window.history.replaceState(window.history.state, "", newHash);
    }
  };

  const isEventOpen = currentEvent?.status === "OPEN";

  const handleOpenEvent = async () => {
    if (openingEvent || !currentReadiness?.ready || isEventOpen) return;
    setOpeningEvent(true);
    setOpenEventMessage("");
    setConfirmOpenEvent(false);
    let operation;
    try {
      operation = createPendingEventOpenOperation(event.id);
      const openedEvent = await apiRequest(`/api/v1/events/${encodeURIComponent(event.id)}/open`, {
        method: "POST",
        headers: { "Idempotency-Key": operation.operationId },
      });
      if (event.id !== activeEventId.current) return;
      const receipt = openedEvent?.operation;
      const isMatchingApplied = receipt?.operationId === operation.operationId
        && receipt?.eventId === event.id && receipt?.intent === "OPEN_EVENT"
        && receipt?.status === "applied" && openedEvent?.status === "OPEN";
      if (isMatchingApplied) {
        resolvePendingEventOpenOperation(event.id, receipt);
        setCurrentEvent(openedEvent);
        setOpenEventMessage("¡Competencia abierta con éxito! Ya podés gestionar las jornadas en Control de votación.");
        reloadProgress();
      } else {
        setOpenEventMessage("La respuesta no confirmó la apertura. Verificá el estado del evento.");
      }
    } catch (err) {
      if (event.id !== activeEventId.current) return;
      const receipt = err?.details?.operation ?? err?.operation;
      if (operation && receipt?.operationId === operation.operationId && receipt?.status === "rejected") {
        resolvePendingEventOpenOperation(event.id, receipt);
      }
      setOpenEventMessage(err?.message ?? "Error al abrir la competencia.");
    } finally {
      if (event.id === activeEventId.current) setOpeningEvent(false);
    }
  };

  const statusSummary = (key) => {
    const status = stepStatuses[key];
    if (status === "complete") return null;
    if (status === "incomplete") return incompleteStepGuidance(key, currentReadiness);
    if (status === "unqueried") return "Todavía no se revisaron los requisitos de este paso.";
    return "No se pudieron revisar los requisitos de este paso.";
  };
  const eventStatusLabel = uxStatusLabel(currentEvent?.status, "No disponible");

  return (
    <WriteContext.Provider value={{ writing, setPending: (value) => { if (event.id === activeEventId.current) setPending(value); }, reloadProgress, invalidateEvaluation, registerConfirmed, dataRevision, incRevision: () => { if (event.id !== activeEventId.current) return; invalidateEvaluation(); setDataRevision((r) => r + 1); }, refreshReadiness: () => { if (event.id !== activeEventId.current) return; invalidateEvaluation(); reloadProgress(); setReadinessRevision((r) => r + 1); } }}>
      <PageShell layer="instrument" className="admin-shell" aria-busy={pending}>
        <fieldset aria-label="Configuracion de competencia" disabled={pending} className="fieldset-reset">
          <header className="event-header competencia-header">
            <div>
              <p className="eyebrow">Competencia</p>
              <h1>{event.name ?? "Evento"}</h1>
              <h2 className="competencia-flow-title" style={{ fontSize: "var(--text-xl)", fontWeight: 700, margin: "var(--space-2) 0" }}>Preparación del evento</h2>
              <p className="competencia-event-status">Estado del evento: {eventStatusLabel}</p>
              <p className="competencia-step-meta">Paso {activeIndex + 1} de {steps.length}</p>
            </div>
            <div className="event-actions">
              {onBack && <button className="secondary" type="button" onClick={() => requestLeave(onBack)}>Volver</button>}
            </div>
          </header>
          <nav className="competencia-nav competencia-stepper competencia-stepper-header" aria-label="Pasos de configuración de competencia">
            <ol className="competencia-stepper-line">
              {steps.map((item, index) => {
                const state = stepStatuses[item.key];
                const isCurrent = step === item.key;
                const isComplete = !isCurrent && state === "complete";
                const stateLabel = READINESS_STATE_LABELS[state];
                const shortLabels = {
                  participantes: "Comparsas",
                  jurados: "Jurados",
                  rubros: "Evaluación",
                  revision: "Revisión final",
                };
                return (
                  <li key={item.key} className="competencia-stepper-item">
                    <span className="sr-only" id={`competencia-step-${item.key}-context`}>
                      Paso {index + 1} de {steps.length}. {item.label !== shortLabels[item.key] ? `${item.label}.` : ""} {isCurrent ? "Paso actual." : ""}
                    </span>
                    <button
                      type="button"
                      className={`competencia-stepper-btn ${isCurrent ? "is-active active" : "secondary"} ${isComplete ? "is-complete" : ""}`}
                      aria-current={isCurrent ? "step" : undefined}
                      aria-describedby={`competencia-step-${item.key}-context`}
                      onClick={() => goStep(item.key)}
                    >
                      <span className="competencia-stepper-circle competencia-step-badge" aria-hidden="true">
                        {isComplete ? "✓" : index + 1}
                      </span>
                      <span className="competencia-step-copy">
                        <span className="competencia-step-label">{shortLabels[item.key] ?? item.label}</span>
                        <span className="competencia-step-state">{stateLabel}</span>
                      </span>
                    </button>
                    {index < steps.length - 1 && <span className="competencia-stepper-divider" aria-hidden="true" />}
                  </li>
                );
              })}
            </ol>
          </nav>
          {progressError && <LoadErrorAlert message="No se pudo cargar el resumen de la preparación." onRetry={reloadProgress} />}
          {step === "participantes" && (
            <section aria-labelledby="competencia-step-title">
              <h2 id="competencia-step-title" ref={stepTitleRef} tabIndex={-1}>Participantes</h2>
              <StepSummary stepLabel="Participantes" recommendation={statusSummary("participantes")} />

              <div className="competencia-subtabs" role="tablist" aria-label="Subsecciones de participantes">
                <button
                  type="button"
                  role="tab"
                  id="tab-sub-comparsas"
                  aria-controls="panel-sub-comparsas"
                  aria-selected={troupeTab === "comparsas"}
                  className={`competencia-subtab-btn ${troupeTab === "comparsas" ? "is-active active" : ""}`}
                  onClick={() => setTroupeTab("comparsas")}
                >
                  Comparsas
                </button>
                <button
                  type="button"
                  role="tab"
                  id="tab-sub-orden"
                  aria-controls="panel-sub-orden"
                  aria-selected={troupeTab === "orden"}
                  className={`competencia-subtab-btn ${troupeTab === "orden" ? "is-active active" : ""}`}
                  onClick={() => setTroupeTab("orden")}
                >
                  Orden de pasada por jornada
                </button>
              </div>

              <div
                role="tabpanel"
                id="panel-sub-comparsas"
                aria-labelledby="tab-sub-comparsas"
                className={`competencia-tab-panel ${troupeTab === "comparsas" ? "is-active" : "is-hidden"}`}
              >
                <section className="competencia-subblock participants-types-block" aria-label="Bloque 1 de 3: Tipos de participación" id="seccion-tipos-participacion">
                  <AdminCategoriesSection key={`categories-${event.id}`} event={event} />
                </section>
                <section className="competencia-subblock participants-troupes-block" aria-label="Bloque 2 de 3: Comparsas">
                  <AdminTroupesSection key={`troupes-${event.id}`} event={event} />
                </section>
              </div>

              <div
                role="tabpanel"
                id="panel-sub-orden"
                aria-labelledby="tab-sub-orden"
                className={`competencia-tab-panel ${troupeTab === "orden" ? "is-active" : "is-hidden"}`}
              >
                <section className="competencia-subblock" aria-label="Bloque 3 de 3: Orden de pasada por jornada">
                  <TroupeScheduleSection key={`schedule-${event.id}`} event={event} />
                </section>
              </div>
            </section>
          )}
          {step === "jurados" && (
            <section aria-labelledby="competencia-step-title">
              <h2 id="competencia-step-title" ref={stepTitleRef} tabIndex={-1}>Jurados y especialidades</h2>
              <StepSummary stepLabel="Jurados y especialidades" recommendation={statusSummary("jurados")} />

              <section
                id="seccion-especialidades"
                className="competencia-subblock"
                aria-label="Gestión de especialidades"
              >
                <AdminSpecialtiesSection key={`specialties-${event.id}`} event={event} />
              </section>

              <p className="step-intro">Padrón general: <a href="#/admin/judges">Jurados</a>.</p>
              <JuradosPorJornadaSection
                event={event}
                refreshSignal={dataRevision}
                onOpenSpecialties={() => {
                  const el = document.getElementById("seccion-especialidades");
                  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                onDataChanged={() => {
                  if (incRevision) incRevision();
                  if (reloadProgress) reloadProgress();
                }}
              />
            </section>
          )}
          {step === "rubros" && (
            <section aria-labelledby="competencia-step-title">
              <h2 id="competencia-step-title" ref={stepTitleRef} tabIndex={-1} aria-label="Configurar evaluación" className="sr-only">Configurar evaluación</h2>
              <span className="sr-only">Definí qué se evalúa en cada rubro y agregá los ítems que recibirán puntuación.</span>
              <div className="competencia-tabs sr-only" role="tablist" aria-label="Rubros e ítems">
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
                readiness={evaluation ? paired.readiness : null}
                readinessStatus={evaluationStatus === "available" ? "available" : "unavailable"}
                evaluation={evaluation}
                evaluationStatus={evaluationStatus}
                catalog={editorCatalog}
                unreflected={unreflected}
                confirmedEntries={confirmedEditor.eventId === event.id ? confirmedEditor.entries : {}}
                onRememberAccepted={rememberConfirmedEditor}
                editorSpecialties={editorSpecialties.eventId === event.id ? editorSpecialties.data : []}
                onRetryEvaluation={retryEvaluation}
                registerDraftGuard={registerDraftGuard}
                onBack={() => goStep("jurados")}
                tab={rubricTab}
              />
              </div>
              <CompetenciaOverview key={`overview-${event.id}`} event={event} catalog={evaluation ? paired : null} evaluationStatus={evaluationStatus} />
              <EvaluationStepSummary progress={evaluation ? paired : null} progressError={["error", "unreflected"].includes(evaluationStatus)} readiness={currentReadiness} readinessStatus={currentReadinessStatus} evaluation={evaluation} />
            </section>
          )}
          {step === "revision" && (
            <section aria-labelledby="competencia-step-title">
              <h2 id="competencia-step-title" ref={stepTitleRef} tabIndex={-1}>Revisión final</h2>

              {(isEventOpen || currentEvent?.status === "CLOSED") ? (
                <div className={`revision-status-banner ${isEventOpen ? "is-open" : "is-closed"}`} role="region" aria-label="Estado de la competencia">
                  <div className="revision-banner-content">
                    <h3>{isEventOpen ? "Competencia abierta" : "Competencia finalizada"}</h3>
                    <p>{isEventOpen ? "El evento está abierto. La operación de las jornadas y la votación continúa desde Control de votación." : "El evento finalizó."}</p>
                    <div className="revision-banner-actions">
                      {isEventOpen && <a href="#/admin/voting" className="button-link primary">Ir a Control de votación →</a>}
                      <a href="#/admin/results" className="button-link secondary">Ver resultados</a>
                    </div>
                  </div>
                </div>
              ) : isEventOpen ? (
                <div className="revision-status-banner is-open" role="region" aria-label="Estado de la competencia">
                  <div className="revision-banner-icon" aria-hidden="true">🟢</div>
                  <div className="revision-banner-content">
                    <h3>Competencia abierta</h3>
                    <p>
                      El evento está abierto. Ya podés iniciar las jornadas y habilitar las votaciones desde Control de votación. Las asignaciones sin planilla confirmada todavía pueden revocarse o reemplazarse.
                    </p>
                    <div className="revision-banner-actions">
                      <a href="#/admin/voting" className="button-link primary">Ir a Control de votación →</a>
                      <a href="#/admin/results" className="button-link secondary">Ver resultados</a>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <StepSummary stepLabel="Revisión final" recommendation={statusSummary("revision")} />
                  <p className="revision-readiness-note">La apertura se decide con los requisitos oficiales de la API; el progreso por especialidad y los criterios descriptivos son orientación, no condiciones adicionales.</p>
                  {currentReadinessStatus === "available" ? (
                    currentReadiness.ready ? (
                      <div className="revision-status-banner is-ready" role="region" aria-label="Requisitos para abrir el evento">
                        <div className="revision-banner-icon" aria-hidden="true">✅</div>
                        <div className="revision-banner-content">
                          <h3>Preparación completa</h3>
                          <p className="readiness-ok">Se cumplen los requisitos para abrir el evento.</p>
                          <div className="revision-banner-actions">
                            <button
                              type="button"
                              className="primary"
                              onClick={() => setConfirmOpenEvent(true)}
                              disabled={openingEvent}
                            >
                              {openingEvent ? "Abriendo…" : "Abrir competencia"}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <ul className="readiness-checklist" aria-label="Requisitos pendientes para abrir el evento">
                        {officialIssues.map((issue) => (
                          <li key={issue.key} className="readiness-fail">
                            <span className="readiness-icon" aria-hidden="true">!</span>
                            <span><strong>{issue.title}</strong><span>{issue.description}</span></span>
                            <a href={issue.href}>{issue.action}</a>
                          </li>
                        ))}
                      </ul>
                    )
                  ) : (
                    <p role="status">
                      {currentReadinessStatus === "unqueried"
                        ? "Todavía no se revisaron los requisitos para abrir."
                        : "No se pudieron revisar los requisitos. Volvé a intentarlo desde Jornadas."}
                    </p>
                  )}
                  {currentReadinessStatus === "unavailable" && (
                    <a className="button-link" href="#/admin/events">Reintentar en Eventos</a>
                  )}
                </>
              )}

              {openEventMessage && (
                <p className="form-error" role="status" style={{ margin: "var(--space-3) 0" }}>
                  {openEventMessage}
                </p>
              )}

              <section className="revision-summary-section" aria-label="Resumen de la preparación">
                <h3 className="revision-section-title">Resumen de la preparación</h3>
                {progress && evaluationStatus === "available" ? <>
                  <div className="revision-evaluation-guidance" role="status">
                    {evaluation.progress.total > 0
                      ? <p>Especialidades listas: {evaluation.progress.readyCount} de {evaluation.progress.total} (orientación visual; no bloquea la apertura).</p>
                      : <p>No hay especialidades activas. La API determina los bloqueos oficiales.</p>}
                    {(progress.orphaned ?? []).length > 0 && <p>{progress.orphaned.length} criterio{progress.orphaned.length === 1 ? "" : "s"} descriptivo{progress.orphaned.length === 1 ? "" : "s"} sin asociar (no bloquea la apertura).</p>}
                  </div>
                  <div className="revision-summary-grid">
                  <div className="revision-summary-card">
                    <div className="revision-card-header">
                      <span className="revision-card-badge">Paso 1</span>
                      <h4>Comparsas</h4>
                    </div>
                    <p className="revision-card-value">
                      {progress?.troupes?.filter((t) => t.active !== false).length ?? 0} comparsas
                    </p>
                    <p className="revision-card-detail">
                      {progress?.categories?.filter((c) => c.active !== false).length ?? 0} tipos de participación
                    </p>
                    <button
                      type="button"
                      className="secondary revision-card-link"
                      onClick={() => goStep("participantes")}
                    >
                      Ver comparsas
                    </button>
                  </div>

                  <div className="revision-summary-card">
                    <div className="revision-card-header">
                      <span className="revision-card-badge">Paso 2</span>
                      <h4>Jurados</h4>
                    </div>
                    <p className="revision-card-value">
                      {specialtiesActive.length} especialidades
                    </p>
                    <p className="revision-card-detail">
                      Asignaciones por jornada
                    </p>
                    <button
                      type="button"
                      className="secondary revision-card-link"
                      onClick={() => goStep("jurados")}
                    >
                      Ver jurados
                    </button>
                  </div>

                  <div className="revision-summary-card">
                    <div className="revision-card-header">
                      <span className="revision-card-badge">Paso 3</span>
                      <h4>Evaluación</h4>
                    </div>
                    <p className="revision-card-value">
                      {progress?.rubrics?.filter((r) => r.active !== false).length ?? 0} rubros
                    </p>
                    <p className="revision-card-detail">
                      {(progress?.rubrics ?? [])
                        .filter((r) => r.active !== false)
                        .reduce((acc, r) => acc + (r.items ?? []).filter((item) => item.active !== false).length, 0)} ítems puntuables
                    </p>
                    <p className="revision-card-detail">
                      {reviewCriteriaCount} criterio{reviewCriteriaCount === 1 ? "" : "s"} descriptivo{reviewCriteriaCount === 1 ? "" : "s"}
                    </p>
                    <button
                      type="button"
                      className="secondary revision-card-link"
                      onClick={() => goStep("rubros")}
                    >
                      Ver evaluación
                    </button>
                  </div>

                  <div className="revision-summary-card">
                    <div className="revision-card-header">
                      <span className="revision-card-badge">Operación</span>
                      <h4>Jornadas</h4>
                    </div>
                    <p className="revision-card-value">
                      Control de votación
                    </p>
                    <p className="revision-card-detail">
                      Orden y apertura de mesas
                    </p>
                    <a
                      href="#/admin/voting"
                      className="button-link secondary revision-card-link"
                    >
                      Ir a jornadas
                    </a>
                  </div>
                  </div>
                </> : <p role="status">{evaluationStatus === "unreflected" ? "Estado por comprobar: el catálogo todavía no refleja cambios confirmados." : progressError || evaluationStatus === "error" ? "Resumen no disponible." : "Cargando el resumen…"}</p>}
              </section>

              <ConfirmDialog
                isOpen={confirmOpenEvent}
                onClose={() => setConfirmOpenEvent(false)}
                onConfirm={handleOpenEvent}
                title="¿Abrir la competencia?"
                description="Al abrir el evento, su estado cambiará a OPEN. Esto no inicia una jornada ni habilita los votos. Después podrás iniciar cada jornada y abrir su votación desde Control de votación. Las asignaciones sin planilla confirmada todavía pueden revocarse o reemplazarse."
                confirmLabel={openingEvent ? "Abriendo…" : "Abrir competencia"}
                cancelLabel="Cancelar"
                confirming={openingEvent}
                tone="success"
              />
            </section>
          )}
          <WizardFooterNav
            activeIndex={activeIndex}
            steps={steps}
            onStepChange={goStep}
            isEventOpen={isEventOpen}
            isReady={currentReadiness?.ready}
            onOpenEvent={() => setConfirmOpenEvent(true)}
            allowOpen
            opening={openingEvent}
          />
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

function WizardFooterNav({ activeIndex, steps, onStepChange, isEventOpen, isReady, onOpenEvent, opening, allowOpen = true }) {
  const hasPrev = activeIndex > 0;
  const hasNext = activeIndex < steps.length - 1;
  const nextStep = hasNext ? steps[activeIndex + 1] : null;
  const prevStep = hasPrev ? steps[activeIndex - 1] : null;
  const isLastStep = activeIndex === steps.length - 1;

  const STEP_BUTTON_LABELS = {
    participantes: "comparsas",
    jurados: "jurados",
    rubros: "evaluación",
    revision: "revisión",
  };

  return (
    <nav className="wizard-footer-nav" aria-label="Navegación del asistente">
      <div>
        {hasPrev ? (
          <button
            type="button"
            className="secondary"
            onClick={() => onStepChange(prevStep.key)}
          >
            ← Volver a {STEP_BUTTON_LABELS[prevStep.key] ?? prevStep.label.toLowerCase()}
          </button>
        ) : (
          <span />
        )}
      </div>
      <div>
        {hasNext && (
          <button
            type="button"
            className="primary"
            onClick={() => onStepChange(nextStep.key)}
          >
            Continuar a {STEP_BUTTON_LABELS[nextStep.key] ?? nextStep.label.toLowerCase()} →
          </button>
        )}
        {allowOpen && isLastStep && isEventOpen && (
          <a href="#/admin/voting" className="button-link primary">
            Ir a Control de votación →
          </a>
        )}
        {allowOpen && isLastStep && !isEventOpen && isReady && (
          <button
            type="button"
            className="primary"
            onClick={onOpenEvent}
            disabled={opening}
          >
            {opening ? "Abriendo…" : "Abrir competencia"}
          </button>
        )}
      </div>
    </nav>
  );
}

function CompetenciaOverview({ event, catalog, evaluationStatus }) {
  const [confirmedCriteria, setConfirmedCriteria] = useState([]);
  const data = catalog ? { rubrics: catalog.rubrics, orphaned: catalog.orphaned.filter((criterion) => !confirmedCriteria.includes(criterion.id)) } : null;
  const orphanedUnavailable = catalog?.secondaryErrors?.includes("criterios descriptivos") || catalog?.secondaryPending?.includes("criterios descriptivos");
  const [message, setMessage] = useState("");
  const [criterionConfirmTarget, setCriterionConfirmTarget] = useState(null);
  const locked = event.status !== "CONFIGURING";

  const { writing, setPending, incRevision, invalidateEvaluation, reloadProgress } = useContext(WriteContext);

  const reassignCriterion = async (criterionId, scoringItemId) => {
    if (writing.current || locked) return;
    writing.current = true;
    setPending(true);
    try {
      await apiRequest(`/api/v1/rubric-criteria/${criterionId}`, {
        method: "PATCH",
        body: JSON.stringify({ scoringItemId }),
      });
      invalidateEvaluation();
      setConfirmedCriteria((previous) => [...previous, criterionId]);
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

  if (!data) return message ? <p role="status">{message}</p> : evaluationStatus === "error" ? null : <p>Cargando resumen...</p>;
  if (orphanedUnavailable) return <p role="status">Criterios descriptivos por comprobar. Reintentá la consulta antes de revisarlos.</p>;
  if (data.orphaned.length === 0) return message ? <p role="status">{message}</p> : null;

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
              <button type="submit" aria-label={`Vincular criterio ${criterion.description}`} disabled={locked || items.length === 0}>Vincular</button>
            </SaveForm>
          );
        })}
      </div>
      <Dialog
        isOpen={criterionConfirmTarget !== null && !locked}
        onClose={() => setCriterionConfirmTarget(null)}
        title="Confirmar reasignación"
        description={criterionConfirmTarget ? `El criterio ${criterionConfirmTarget.criterion.description} del rubro ${criterionConfirmTarget.criterion.rubricName} se vinculará al ítem ${(data.rubrics.find((rubric) => rubric.id === criterionConfirmTarget.criterion.rubricId)?.items ?? []).find((item) => item.id === criterionConfirmTarget.scoringItemId)?.name ?? "seleccionado"} de ese mismo rubro.` : ""}
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

function EvaluationStepSummary({ progress, progressError = false, readiness, readinessStatus, evaluation }) {
  const specialties = (progress?.specialties ?? []).filter((specialty) => specialty.active !== false);
  const rubrics = (progress?.rubrics ?? []).filter((rubric) => rubric.active !== false);
  const items = rubrics.flatMap((rubric) => (rubric.items ?? []).filter((item) => item.active !== false));
  const coveredSpecialtyIds = new Set(items.map((item) => item.specialtyId));
  const pendingRubrics = readiness?.incompleteRubrics ?? [];
  const pendingNominations = readiness?.incompleteNominations ?? [];
  const missingActiveRubrics = readiness?.missing?.includes("ACTIVE_RUBRIC");
  const pendingCriteria = progress?.orphaned?.length ?? 0;
  const orphanedUnavailable = !progress || progress.secondaryErrors?.includes("criterios descriptivos") || progress.secondaryPending?.includes("criterios descriptivos");
  const visualPending = evaluation?.specialties.filter((specialty) => specialty.status !== "Lista") ?? [];
  const officialPending = pendingRubrics.length || missingActiveRubrics || pendingNominations.length;

  return (
    <section className="evaluation-step-summary" aria-labelledby="evaluation-summary-title">
      <header className="evaluation-summary-head">
        <h3 id="evaluation-summary-title">Resumen de evaluación</h3>
        {evaluation?.progress.total > 0 && <p className={`evaluation-summary-readiness${evaluation.progress.readyCount === evaluation.progress.total ? " is-ready" : ""}`}>Especialidades listas: {evaluation.progress.readyCount} de {evaluation.progress.total}</p>}
        {evaluation?.progress.total === 0 && <p className="evaluation-summary-readiness">No hay especialidades activas.</p>}
      </header>
      {!evaluation && <p role="status">{progressError ? "Estado por comprobar" : "Cargando evaluación…"}</p>}
      {progress ? <dl className="evaluation-summary-stats">
        <div className="evaluation-summary-stat"><dt>Especialidades con rubros</dt><dd>{specialties.filter((specialty) => coveredSpecialtyIds.has(specialty.id)).length} de {specialties.length}</dd></div>
        <div className="evaluation-summary-stat"><dt>Rubros activos</dt><dd>{rubrics.length}</dd></div>
        <div className="evaluation-summary-stat"><dt>Ítems activos</dt><dd>{items.length}</dd></div>
      </dl> : <p role="status">{progressError ? "Resumen de evaluación no disponible." : "Cargando el resumen de evaluación…"}</p>}
      {evaluation && visualPending.length > 0 && <div className="evaluation-summary-guidance">
        <strong>Orientación por especialidad (no bloquea el avance):</strong>
        <ul>{visualPending.map((specialty) => <li key={specialty.id}>{specialty.name}: {specialty.status}. Revisá sus rubros e ítems.</li>)}</ul>
      </div>}
      {(orphanedUnavailable || pendingCriteria > 0) && <div className="evaluation-summary-descriptive" role="status">
        <strong>Criterios descriptivos (no son ítems puntuables ni bloqueos de apertura):</strong>
        {orphanedUnavailable ? <p>Criterios descriptivos por comprobar.</p>
          : <p>{pendingCriteria} criterio{pendingCriteria === 1 ? "" : "s"} descriptivo{pendingCriteria === 1 ? "" : "s"} sin asociar. Abrí el rubro y vinculá cada criterio a un ítem.</p>}
      </div>}
      <div className="evaluation-summary-official">
      {readinessStatus === "available" ? (
        officialPending ? (
          <div className="evaluation-summary-pending" role="status">
            <strong>Bloqueos oficiales de evaluación (API):</strong>
            <ul>
              {missingActiveRubrics && <li>No hay rubros activos. Creá o activá un rubro para definir qué se va a evaluar.</li>}
              {pendingRubrics.map((rubric) => <li key={rubric.id}>{rubric.name ?? "Este rubro"} necesita ítems puntuables y una especialidad activa. Agregá o corregí sus ítems.</li>)}
              {pendingNominations.map((nomination) => <li key={`${nomination.rubricId}-${nomination.troupeId}`}>Falta cargar un participante para {nomination.rubricName ?? "el rubro"} en {nomination.troupeName ?? "la comparsa"}.</li>)}
            </ul>
          </div>
        ) : <p className="evaluation-summary-status is-ok" role="status">Sin bloqueos oficiales de evaluación.</p>
      ) : <p className="evaluation-summary-status is-warning" role="status">No se pudo revisar la evaluación. Volvé a intentarlo en Revisión final.</p>}
      </div>
    </section>
  );
}

function AdminTroupesSection({ event, readOnly = false }) {
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

  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoadError(false);
    apiRequest(`/api/v1/events/${event.id}/troupes`).then((loaded) => { if (active) setTroupes(loaded); }).catch(() => { if (active) setLoadError(true); });
    apiRequest(`/api/v1/events/${event.id}/categories`).then((loaded) => { if (active) setCategories(loaded); }).catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [event.id, dataRevision, loadAttempt]);

  const locked = event.status === "OPEN" || readOnly;
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
    <section className="config-section participants-catalog-section">
      <div className="section-heading">
        <h2>Comparsas</h2>
      </div>
      <p className="feedback" role="status">{message}</p>
      {loadError && <LoadErrorAlert message="No se pudieron cargar las comparsas." onRetry={() => setLoadAttempt((n) => n + 1)} />}
      <div className="competencia-card">
        <div className="competencia-card-toolbar">
          <div className="competencia-toolbar-left troupe-filters">
            <span className="competencia-toolbar-count filter-count" role="status">{filtered.length} de {troupes.length} comparsas</span>
            <div className="competencia-toolbar-search">
              <label>Buscar<input type="search" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar comparsa por nombre" placeholder="Buscar por nombre..." /></label>
            </div>
            <div className="competencia-toolbar-filter">
              <label>Tipo<select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} aria-label="Filtrar comparsas por tipo">
                <option value="all">Todos los tipos</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></label>
            </div>
            <div className="competencia-toolbar-filter">
              <label>Estado<select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filtrar comparsas por estado">
                <option value="all">Todas</option>
                <option value="active">Activas</option>
                <option value="inactive">Inactivas</option>
              </select></label>
            </div>
          </div>
          <div className="competencia-toolbar-right">
            {!locked && <button type="button" className="btn-primary" aria-label="+ Nueva comparsa" onClick={(event) => { drawerTriggerRef.current = event.currentTarget; setDrawerMode({ mode: "create", ts: Date.now() }); }}>+ Nueva comparsa</button>}
          </div>
        </div>
        {loadError ? null : filtered.length === 0 ? (
          <p className="empty-state" style={{ padding: "var(--space-6)" }}>Sin comparsas para los filtros actuales.</p>
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
                          {troupe.brandColor && (
                            <span className="troupe-preview" aria-label={`Vista jurado de ${troupe.name}`}>Vista jurado: {troupe.name} ({troupe.brandColor})</span>
                          )}
                        </span>
                      </span>
                    </td>
                    <td>{troupe.categoryName ?? "Sin tipo"}</td>
                    <td><StatusPill status={troupe.active ? "ACTIVE" : "SUSPENDED"} label={troupe.active ? "Activa" : "Inactiva"} /></td>
                    {!locked && (
                      <td>
                        <button className="secondary edit-action" type="button" aria-label={`Editar comparsa ${troupe.name}`} onClick={(event) => { drawerTriggerRef.current = event.currentTarget; setDrawerMode({ mode: "edit", troupeId: troupe.id }); }}>
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
        {troupes.filter((t) => t.active !== false).length < 2 && (
          <div className="competencia-card-footer">
            <div className="competencia-readiness-badge">
              <span aria-hidden="true">⚠️</span> Se requieren al menos 2 comparsas activas
            </div>
          </div>
        )}
      </div>
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
          onCancel={() => setDrawerMode(null)}
          submitting={saving}
          submitLabel={drawerMode?.mode === "edit" ? "Guardar comparsa" : "Agregar comparsa"}
          showActive={drawerMode?.mode === "edit"}
          onSubmit={submitTroupe}
        />
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
        description="La comparsa se desactivará y podrás reactivarla cuando sea necesario. No se borra el historial."
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
  const { writing, setPending, dataRevision, refreshReadiness } = useContext(WriteContext);
  const locked = event.status === "OPEN";

  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoadError(false);
    apiRequest(`/api/v1/events/${event.id}/nights`).then((loaded) => {
      if (!active) return;
      const available = loaded ?? [];
      setNights(available);
      setNightId((selected) => available.some((night) => night.id === selected) ? selected : available[0]?.id ?? "");
    }).catch(() => { if (active) setLoadError(true); });
    apiRequest(`/api/v1/events/${event.id}/troupes`).then((loaded) => { if (active) setTroupes(loaded ?? []); }).catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [event.id, dataRevision, loadAttempt]);

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
      // Programar o quitar comparsas cambia los requisitos de la revisión final.
      if (refreshReadiness) refreshReadiness();
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
      refreshReadiness?.();
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
      </div>
      <p className="feedback" role="status">{message}</p>
      {loadError && <LoadErrorAlert message="No se pudieron cargar las jornadas." onRetry={() => setLoadAttempt((n) => n + 1)} />}
      {!loadError && nights.length === 0 && <p>Cargando jornadas...</p>}
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
                  if (refreshReadiness) refreshReadiness();
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

function AdminCategoriesSection({ event, readOnly = false }) {
  const [categories, setCategories] = useState([]);
  const [drawerMode, setDrawerMode] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [mutationTarget, setMutationTarget] = useState(null);
  const drawerTriggerRef = useRef(null);
  const deleteTriggerRef = useRef(null);
  const { writing, setPending, incRevision, reloadProgress, dataRevision } = useContext(WriteContext);

  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoadError(false);
    apiRequest(`/api/v1/events/${event.id}/categories`).then((loaded) => { if (active) setCategories(loaded); }).catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [event.id, dataRevision, loadAttempt]);
  const locked = event.status === "OPEN" || readOnly;

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
    <section className="config-section participants-catalog-section participants-types-section">
      <div className="section-heading participants-type-heading">
        <div>
          <h2>Tipos de participación</h2>
        </div>
        {!locked && <button type="button" onClick={(event) => { drawerTriggerRef.current = event.currentTarget; setDrawerMode({ mode: "create", ts: Date.now() }); }}>+ Nuevo tipo</button>}
      </div>
      <p className="feedback" role="status">{message}</p>
      {loadError && <LoadErrorAlert message="No se pudieron cargar los tipos de participación." onRetry={() => setLoadAttempt((n) => n + 1)} />}
      {loadError ? null : ordered.length === 0 ? (
        <p className="empty-state">Todavía no hay tipos de participación.</p>
      ) : (
        <div className="table-wrapper participants-types-table">
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
                      <button className="secondary edit-action" type="button" aria-label={`Editar tipo ${category.name}`} onClick={(event) => { drawerTriggerRef.current = event.currentTarget; setDrawerMode({ mode: "edit", categoryId: category.id }); }}>
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
        description="El tipo se desactivará y podrás reactivarlo cuando sea necesario. No se borra el historial."
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

  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoadError(false);
    apiRequest(`/api/v1/events/${event.id}/specialties`).then((loaded) => { if (active) setSpecialties(loaded); }).catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [event.id, dataRevision, loadAttempt]);
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
      <div className="section-heading"><h2>Especialidades</h2></div>
      <p className="feedback" role="status">{message}</p>
      {!locked && <button type="button" onClick={(event) => { drawerTriggerRef.current = event.currentTarget; setDrawerMode({ mode: "create", ts: Date.now() }); }}>+ Nueva especialidad</button>}
      {loadError && <LoadErrorAlert message="No se pudieron cargar las especialidades." onRetry={() => setLoadAttempt((n) => n + 1)} />}
      {loadError ? null : ordered.length === 0 ? (
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
                      <button className="secondary edit-action" type="button" aria-label={`Editar especialidad ${spec.name}`} onClick={(event) => { drawerTriggerRef.current = event.currentTarget; setDrawerMode({ mode: "edit", specialtyId: spec.id }); }}>
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
        description="La especialidad se desactivará y podrás reactivarla cuando sea necesario. No se borra el historial."
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

function AdminRubricsSection({ event, focusRubricId = null, readiness, readinessStatus, evaluation, evaluationStatus, catalog, unreflected, confirmedEntries, onRememberAccepted, editorSpecialties, onRetryEvaluation, onBack, registerDraftGuard, tab = "rubros" }) {
  const [detailSnapshot, setDetailSnapshot] = useState(null);
  const applyUnreflected = (rubric) => unreflected.filter((receipt) => receipt.rubricId === rubric.id)
    .reduce(showConfirmedChange, rubric);
  const verifiedRows = (catalog?.rubrics ?? []).map((rubric) => applyUnreflected(detailSnapshot?.catalog === catalog && detailSnapshot.id === rubric.id ? detailSnapshot.rubric : rubric));
  const receiptRows = Object.values(confirmedEntries)
    .filter((entry) => !catalog || unreflected.some((receipt) => receipt.rubricId === entry.id))
    .map(applyUnreflected);
  const rubrics = [...verifiedRows, ...receiptRows.filter((rubric) => !verifiedRows.some((entry) => entry.id === rubric.id))];
  const specialties = catalog?.specialties ?? editorSpecialties;
  const troupes = catalog?.troupes ?? [];
  const [selectedSpecialtyId, setSelectedSpecialtyId] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createSpecialty, setCreateSpecialty] = useState(null);
  const [createRows, setCreateRows] = useState([]);
  const createRowsRef = useRef([]);
  const nextCreateRow = useRef(0);
  const [createReceipt, setCreateReceipt] = useState(null);
  const createReceiptRef = useRef(null);
  const [createOutcome, setCreateOutcome] = useState("");
  const [createError, setCreateError] = useState("");
  const [reviewRequested, setReviewRequested] = useState(false);
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const updateCreateRows = (updater) => {
    const next = updater(createRowsRef.current);
    createRowsRef.current = next;
    setCreateRows(next);
  };
  const resetCreateFlow = () => {
    setCreateSpecialty(null);
    setNewRubricTarget("TROUPE");
    createRowsRef.current = [];
    setCreateRows([]);
    createReceiptRef.current = null;
    setCreateReceipt(null);
    setCreateOutcome("");
    setCreateError("");
    setReviewRequested(false);
  };
  const createFormRef = useRef(null);
  const initialDraft = useRef(null);
  const dirtyDraft = useRef(false);
  const discardTrigger = useRef(null);
  const discardStay = useRef(null);
  const [discardAction, setDiscardAction] = useState(null);
  const [isDraftDirty, setIsDraftDirty] = useState(false);
  useEffect(() => {
    if (showCreateForm && createFormRef.current && initialDraft.current === null) {
      initialDraft.current = JSON.stringify([...new FormData(createFormRef.current).entries()]);
    }
    if (!showCreateForm) { initialDraft.current = null; dirtyDraft.current = false; setIsDraftDirty(false); }
  }, [showCreateForm]);
  const trackDraft = (form) => {
    dirtyDraft.current = createRowsRef.current.length > 0 || createReceiptRef.current !== null
      || JSON.stringify([...new FormData(form).entries()]) !== initialDraft.current;
    setIsDraftDirty(dirtyDraft.current);
  };
  const requestDiscard = (action, onStay) => {
    if (creatingRef.current) {
      setCreateError("Esperá a que termine el guardado antes de salir. Si se pierde la respuesta, revisá el resultado antes de continuar.");
      onStay?.();
      return true;
    }
    if (!showCreateForm || (!dirtyDraft.current && !createRowsRef.current.some((row) => row.status !== "confirmed"))) return false;
    const trigger = document.activeElement;
    discardTrigger.current = trigger?.isConnected && !trigger.closest(".event-picker-popover")
      ? trigger : createFormRef.current?.querySelector('[name="name"]');
    discardStay.current = onStay ?? null;
    setDiscardAction(() => action);
    return true;
  };
  useEffect(() => showCreateForm && isDraftDirty ? registerDraftGuard(requestDiscard) : undefined,
    [registerDraftGuard, showCreateForm, isDraftDirty]);
  useEffect(() => {
    if (!showCreateForm || !isDraftDirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [showCreateForm, isDraftDirty]);
  const confirmDiscard = () => {
    const action = discardAction;
    discardStay.current = null;
    // The form input disappears on discard; Dialog must not return focus to it.
    discardTrigger.current = document.querySelector('.evaluation-specialty-btn[aria-pressed="true"]');
    setDiscardAction(null);
    dirtyDraft.current = false;
    setIsDraftDirty(false);
    initialDraft.current = null;
    setShowCreateForm(false);
    resetCreateFlow();
    action?.();
    requestAnimationFrame(() => {
      const target = document.querySelector('button[aria-controls="new-rubric-form"]')
        ?? document.querySelector('.evaluation-specialty-btn[aria-pressed="true"]')
        ?? document.querySelector('#competencia-step-title')
        ?? document.querySelector('#main-content h1, #main-content h2');
      if (target) {
        if (!target.matches("button") && !target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
        target.focus();
      }
    });
  };
  const closeCreateForm = () => {
    if (creatingRef.current) return;
    if (!requestDiscard(() => { setShowCreateForm(false); resetCreateFlow(); })) { setShowCreateForm(false); resetCreateFlow(); }
  };
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
  const [openMenuRubricId, setOpenMenuRubricId] = useState(null);
  const pendingReceipts = unreflected.filter((receipt) => receipt.kind === "items" || (receipt.kind === "rubric" && "name" in receipt.fields));
  const { writing, setPending, reloadProgress, invalidateEvaluation, registerConfirmed, incRevision } = useContext(WriteContext);

  const scrollToSelector = (selector) => {
    requestAnimationFrame(() => {
      document.querySelector(selector)?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    });
  };

  useEffect(() => {
    // A catalog refresh must not silently change the specialty of an open draft.
    if (showCreateForm || !specialties.length) return;
    setSelectedSpecialtyId((current) => current && specialties.some((specialty) => specialty.id === current && specialty.active !== false)
        ? current
        : specialties.find((specialty) => specialty.active !== false)?.id ?? null);
  }, [catalog, editorSpecialties, showCreateForm]);

  useEffect(() => {
    if (focusRubricId) {
      setRubricTab("items");
      setExpanded(focusRubricId);
      setHighlightItemId(null);
      scrollToSelector(`[data-rubric-id="${focusRubricId}"]`);
    }
  }, [focusRubricId]);

  const locked = event.status !== "CONFIGURING";
  const activeSpecialties = evaluation?.specialties ?? specialties.filter((specialty) => specialty.active !== false);
  const specialtyName = (specialtyId, fallback) => specialties.find((specialty) => specialty.id === specialtyId)?.name ?? fallback ?? `especialidad ${specialtyId}`;
  const rubricSpecialtyScope = (rubric) => {
    const activeIds = new Set(specialties.filter((specialty) => specialty.active !== false).map((specialty) => specialty.id));
    const inactiveIds = new Set(specialties.filter((specialty) => specialty.active === false).map((specialty) => specialty.id));
    const items = rubric.items ?? [];
    const activeNames = [...new Set(items.filter((item) => item.active !== false && activeIds.has(item.specialtyId))
      .map((item) => specialtyName(item.specialtyId, item.specialtyName)))];
    const historical = [...new Set(items.filter((item) => item.active === false || inactiveIds.has(item.specialtyId))
      .map((item) => `${specialtyName(item.specialtyId, item.specialtyName)} (${item.active === false ? "ítem inactivo" : "especialidad inactiva"})`))];
    const unverified = [...new Set(items.filter((item) => item.active !== false && !activeIds.has(item.specialtyId) && !inactiveIds.has(item.specialtyId))
      .map((item) => specialtyName(item.specialtyId, item.specialtyName)))];
    const current = rubric.active === false
      ? `El rubro está inactivo; no tiene asociaciones activas. Al reactivar, especialidades con ítems activos: ${activeNames.join(", ") || "ninguna"}.`
      : activeNames.length ? `Especialidades asociadas por ítems activos: ${activeNames.join(", ")}.` : "Sin especialidades asociadas por ítems activos.";
    return [current, historical.length ? `Sin asociación activa (historial): ${historical.join(", ")}.` : null,
      unverified.length ? `Estado de especialidad por comprobar: ${unverified.join(", ")}.` : null].filter(Boolean).join(" ");
  };
  const activeTroupes = troupes.filter((troupe) => troupe.active !== false).sort((a, b) => a.name.localeCompare(b.name));
  const selectedSpecialty = activeSpecialties.find((specialty) => specialty.id === selectedSpecialtyId) ?? null;
  const originalSpecialtyActive = !createSpecialty || specialties.some((specialty) => specialty.id === createSpecialty.id && specialty.active !== false);
  const createSpecialtyNames = [...new Set(createRows.map((row) => row.specialtyId))]
    .map((specialtyId) => activeSpecialties.find((specialty) => specialty.id === specialtyId)?.name)
    .filter(Boolean);
  const openCreateForm = () => {
    if (!selectedSpecialty) return;
    resetCreateFlow();
    setCreateSpecialty({ id: selectedSpecialty.id, name: selectedSpecialty.name });
    setShowCreateForm(true);
  };
  const rubricHasSpecialty = (rubric, specialtyId) => (rubric.items ?? []).some((item) => item.active !== false && item.specialtyId === specialtyId);
  const specialtyRubrics = selectedSpecialty
    ? rubrics.filter((rubric) => rubric.active !== false && rubricHasSpecialty(rubric, selectedSpecialty.id))
    : [];
  const pendingRubrics = rubrics.filter((rubric) => rubric.active !== false && !activeSpecialties.some((specialty) => rubricHasSpecialty(rubric, specialty.id)));
  const historicalRubrics = rubrics.filter((rubric) => rubric.active === false);
  const rubricGroups = [
    { key: "associated", entries: specialtyRubrics, title: null },
    { key: "pending", entries: pendingRubrics, title: "Rubros activos pendientes de asociación" },
    { key: "historical", entries: historicalRubrics, title: "Historial de rubros inactivos" },
  ];
  const activeRubrics = rubrics.filter((rubric) => rubric.active !== false);
  const activeItemCount = activeRubrics.reduce((total, rubric) => total + (rubric.items ?? []).filter((item) => item.active !== false).length, 0);
  const coveredSpecialtyIds = new Set(activeRubrics.flatMap((rubric) =>
    (rubric.items ?? []).filter((item) => item.active !== false).map((item) => item.specialtyId)));
  const incompleteRubricIds = new Set(evaluation ? [
    ...(readiness?.incompleteRubrics ?? []).map((rubric) => rubric.id),
    ...(readiness?.incompleteNominations ?? []).map((nomination) => nomination.rubricId),
  ] : []);

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
  const rememberAccepted = (receipt) => {
    onRememberAccepted(receipt, rubrics.find((rubric) => rubric.id === receipt.rubricId));
  };

  const confirmCreated = (saved, body, kind, rubricId = saved.id) => {
    const receipt = { rubricId, kind, id: saved.id, fields: { name: saved.name ?? body.name },
      data: { ...saved, name: saved.name ?? body.name, ...(kind === "items" ? { specialtyId: body.specialtyId, active: saved.active ?? true } : { items: [], criteria: [], nominations: [] }) } };
    registerConfirmed(receipt);
    rememberAccepted(receipt);
    invalidateEvaluation();
    incRevision?.();
    reloadProgress?.();
  };

  const submitCreate = async (form) => {
    if (creatingRef.current || locked || createRowsRef.current.some((row) => row.status === "uncertain")
        || createOutcome === "uncertain") return false;
    if (!createSpecialty || selectedSpecialtyId !== createSpecialty.id || !originalSpecialtyActive) {
      setCreateError(`La especialidad ${createSpecialty?.name ?? "seleccionada"} ya no está activa. Descartá este formulario y elegí otra especialidad antes de crear.`);
      return false;
    }
    const fd = new FormData(form);
    const rubricBody = {
      name: fd.get("name"), evaluationTarget: fd.get("evaluationTarget"), rubricType: fd.get("rubricType"),
      resolutionMethod: fd.get("resolutionMethod"), evaluationObjective: fd.get("evaluationObjective") || null,
      expectedSubjectType: fd.get("evaluationTarget") === "NOMINATION" ? fd.get("expectedSubjectType") : null,
      icon: fd.get("icon") || null,
    };
    const first = createRowsRef.current[0];
    const code = first ? evaluationItemCode(first.name) : null;
    if (first && !createReceiptRef.current && (!code || !/^[A-Z0-9_]{1,64}$/.test(code))) {
      setCreateError("El nombre del primer ítem debe incluir letras o números para crear un código válido. Corregí el nombre antes de guardar.");
      setCreateOutcome("");
      return false;
    }
    if (createRowsRef.current.some((row) => row.status !== "confirmed" && !row.name.trim())) {
      setCreateError("Ingresá un nombre para cada ítem pendiente.");
      return false;
    }
    const activeSpecialtyIds = new Set(activeSpecialties.map((specialty) => specialty.id));
    if (createRowsRef.current.some((row) => row.status !== "confirmed" && !activeSpecialtyIds.has(row.specialtyId))) {
      setCreateError("Elegí una especialidad activa para cada ítem pendiente.");
      return false;
    }
    creatingRef.current = true;
    setCreating(true);
    setCreateError("");
    setReviewRequested(false);
    try {
      if (!createReceiptRef.current) {
        const initialItem = first ? { name: first.name, code, specialtyId: first.specialtyId,
          required: first.required, allowNotPresented: first.allowNotPresented } : null;
        try {
          invalidateEvaluation();
          const saved = await apiRequest(`/api/v1/events/${event.id}/${first ? "rubrics-with-item" : "rubrics"}`, {
            method: "POST", body: JSON.stringify(first ? { ...rubricBody, initialItem } : rubricBody),
          });
          if (!saved?.id || (first && !saved.initialItem?.id)) throw new Error("Respuesta sin comprobante");
          createReceiptRef.current = { id: saved.id, name: saved.name ?? rubricBody.name };
          setCreateReceipt(createReceiptRef.current);
          confirmCreated(saved, rubricBody, "rubric");
          if (first) {
            updateCreateRows((rows) => rows.map((row, index) => index === 0
              ? { ...row, status: "confirmed", receipt: { id: saved.initialItem.id, name: saved.initialItem.name ?? row.name } } : row));
            confirmCreated(saved.initialItem, initialItem, "items", saved.id);
          }
        } catch (error) {
          const rejected = unequivocalCreateRejection(error);
          invalidateEvaluation();
          if (rejected) reloadProgress?.();
          setCreateOutcome(rejected ? "error" : "uncertain");
          if (first) updateCreateRows((rows) => rows.map((row, index) => index === 0
            ? { ...row, status: rejected ? "rejected" : "uncertain" } : row));
          setCreateError(rejected ? error.code === "RESOURCE_CONFLICT"
            ? "El código ya está en uso. Corregí el nombre y reintentá la creación." : "La API rechazó la creación. Revisá los datos y reintentá."
            : "Se interrumpió la conexión o no llegó un comprobante; no sabemos si se guardó. No vuelvas a enviar esta operación.");
          return false;
        }
      }
      for (const row of createRowsRef.current) {
        if (row.status === "confirmed") continue;
        // An uncertain operation stops this sequence: no dependent POST follows.
        if (row.status === "uncertain") break;
        const body = { name: row.name, specialtyId: row.specialtyId,
          required: row.required, allowNotPresented: row.allowNotPresented };
        try {
          invalidateEvaluation();
          const saved = await apiRequest(`/api/v1/rubrics/${createReceiptRef.current.id}/items`, {
            method: "POST", body: JSON.stringify(body),
          });
          if (!saved?.id) throw new Error("Respuesta sin comprobante");
          updateCreateRows((rows) => rows.map((candidate) => candidate.key === row.key
            ? { ...candidate, status: "confirmed", receipt: { id: saved.id, name: saved.name ?? row.name } } : candidate));
          confirmCreated(saved, body, "items", createReceiptRef.current.id);
        } catch (error) {
          const rejected = unequivocalCreateRejection(error);
          invalidateEvaluation();
          if (rejected) reloadProgress?.();
          updateCreateRows((rows) => rows.map((candidate) => candidate.key === row.key
            ? { ...candidate, status: rejected ? "rejected" : "uncertain" } : candidate));
          setCreateError(rejected ? error.code === "RESOURCE_CONFLICT"
            ? "El código ya está en uso. Corregí el nombre de este ítem antes de reintentar." : "La API rechazó este ítem. Revisá los datos antes de reintentar."
            : "Se interrumpió la conexión o no llegó un comprobante de este ítem. No lo reenvíes sin revisión manual.");
          break;
        }
      }
      const remaining = createRowsRef.current.filter((row) => row.status !== "confirmed");
      if (remaining.length) {
        setCreateOutcome("partial");
      } else {
        const createdId = createReceiptRef.current.id;
        setCreateOutcome("complete");
        setMessage(first ? "Rubro e ítems guardados." : "Rubro guardado.");
        dirtyDraft.current = false;
        setIsDraftDirty(false);
        setShowCreateForm(false);
        resetCreateFlow();
        setExpanded(createdId);
      }
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
    return false;
  };

  const saveRubric = async (path, body, method = "POST") => {
    if (locked) return false;
    try {
      const saved = await apiRequest(path, { method, body: JSON.stringify(body) });
      if (saved?.id) registerConfirmed({ rubricId: saved.id, kind: "rubric", id: saved.id,
        fields: method === "PATCH" ? changedReceiptFields(body, saved, rubrics.find((entry) => entry.id === saved.id)) : { name: saved.name ?? body.name },
        data: { ...saved, name: saved.name ?? body.name } });
      invalidateEvaluation();
      if (saved?.id) rememberAccepted({ rubricId: saved.id, kind: "rubric", id: saved.id,
        data: { ...saved, name: saved.name ?? body.name } });
      setMessage("Rubro guardado.");
      if (method === "POST") {
        dirtyDraft.current = false;
        setIsDraftDirty(false);
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
    if (locked) return false;
    try {
      const path = method === "PATCH" ? `/api/v1/evaluation-items/${itemId}` : `/api/v1/rubrics/${rubricId}/items`;
      const saved = await apiRequest(path, { method, body: JSON.stringify(body) });
      if (saved?.id) registerConfirmed({ rubricId, kind: "items", id: saved.id,
        fields: method === "PATCH" ? changedReceiptFields(body, saved, rubrics.find((entry) => entry.id === rubricId)?.items?.find((entry) => entry.id === saved.id)) : { name: saved.name ?? body.name },
        data: { ...saved, name: saved.name ?? body.name } });
      invalidateEvaluation();
      if (saved?.id) rememberAccepted({ rubricId, kind: "items", id: saved.id, data: { ...saved, name: saved.name ?? body.name } });
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
    if (!target || writing.current || locked) return;
    writing.current = true;
    setPending(true);
    try {
      const saved = await apiRequest(`/api/v1/rubrics/${target.rubricId}/nominations`, {
        method: "POST",
        body: JSON.stringify(target.body),
      });
      if (saved?.id) rememberAccepted({ rubricId: target.rubricId, kind: "nominations", id: saved.id,
        data: { ...saved, displayName: saved.displayName ?? target.body.displayName, troupeName: saved.troupeName ?? target.troupeName } });
      if (saved?.id) registerConfirmed({ rubricId: target.rubricId, kind: "nominations", id: saved.id,
        fields: { displayName: saved.displayName ?? target.body.displayName }, data: { ...saved, displayName: saved.displayName ?? target.body.displayName,
          troupeName: saved.troupeName ?? target.troupeName } });
      invalidateEvaluation();
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
    if (!target || writing.current || locked) return;
    writing.current = true;
    setPending(true);
    try {
      const saved = await apiRequest(`/api/v1/nominations/${target.nomination.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: target.active }),
      });
      rememberAccepted({ rubricId: target.nomination.rubricId, kind: "nominations", id: target.nomination.id,
        data: { ...target.nomination, ...saved, active: target.active } });
      registerConfirmed({ rubricId: target.nomination.rubricId, kind: "nominations", id: target.nomination.id,
        fields: { active: target.active }, data: { ...target.nomination, ...saved, active: target.active } });
      invalidateEvaluation();
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
    if (locked) return false;
    try {
      const path = method === "PATCH" ? `/api/v1/rubric-criteria/${criterionId}` : `/api/v1/rubrics/${rubricId}/criteria`;
      const saved = await apiRequest(path, { method, body: JSON.stringify(body) });
      if (saved?.id) rememberAccepted({ rubricId, kind: "criteria", id: saved.id, data: { ...saved, description: saved.description ?? body.description } });
      if (saved?.id) registerConfirmed({ rubricId, kind: "criteria", id: saved.id,
        fields: method === "PATCH" ? changedReceiptFields(body, saved, rubrics.find((entry) => entry.id === rubricId)?.criteria?.find((entry) => entry.id === saved.id)) : { description: saved.description ?? body.description },
        data: { ...saved, description: saved.description ?? body.description } });
      invalidateEvaluation();
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
    if (!target || locked) return;
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
      for (const change of changes) {
        const receipt = { rubricId, kind: collection === "items" ? "items" : "criteria",
          id: change.id, fields: { displayOrder: change.displayOrder }, data: change };
        rememberAccepted(receipt);
        registerConfirmed(receipt);
      }
      invalidateEvaluation();
      setMessage("Orden actualizado.");
      incRevision();
      reloadProgress();
    } catch (error) {
      if (["ORDER_CONFLICT", "ORDER_BOUNDARY", "CRITERION_REASSIGNMENT_REQUIRED"].includes(error.code)) {
        try {
          const fresh = await apiRequest(`/api/v1/rubrics/${rubricId}`);
          setDetailSnapshot({ id: rubricId, rubric: fresh, catalog });
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
    if (writing.current || locked) return;
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
      rememberAccepted({ rubricId: rubric.id, kind: "rubric", id: rubric.id, data: { active } });
      registerConfirmed({ rubricId: rubric.id, kind: "rubric", id: rubric.id, fields: { active }, data: { active } });
      invalidateEvaluation();
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
      {evaluationStatus === "unreflected" && (
        <div className="overview-alert" role="status">
          <strong>Estado por comprobar.</strong> La lectura todavía no refleja todos los cambios confirmados por la API.
          <button type="button" className="secondary" onClick={onRetryEvaluation} aria-label="Reintentar evaluación">Reintentar</button>
        </div>
      )}
      {evaluationStatus === "error" && (
        <div className="overview-alert" role="alert" style={{ marginBlockEnd: "var(--space-4)" }}>
          <strong>{catalog ? "No se pudo revisar el estado de evaluación." : "No se pudo cargar la configuración de evaluación."}</strong> Estado por comprobar.
          <button type="button" className="secondary" onClick={onRetryEvaluation} aria-label="Reintentar evaluación">Reintentar</button>
        </div>
      )}
      <div className="evaluation-panel-card">
        <div className="evaluation-panel-header">
          <h2>Evaluación</h2>
          <p>Configurá qué van a evaluar los jurados en cada especialidad.</p>
          {evaluation?.progress.total === 0 && <p>No hay especialidades activas.</p>}
          {evaluationStatus === "loading" && <p role="status">Cargando evaluación…</p>}
          {pendingReceipts.map((receipt) => <p role="status" key={`${receipt.kind}-${receipt.id}`}>{receipt.kind === "rubric" ? "Rubro" : "Ítem"} confirmado: {receipt.data.name} ({receipt.id}).</p>)}
          {catalog?.secondaryPending?.length > 0 && <p role="status">Datos complementarios por comprobar: {catalog.secondaryPending.join(", ")}.</p>}
          {catalog?.secondaryErrors?.length > 0 && <p role="status">No se pudieron cargar datos complementarios: {catalog.secondaryErrors.join(", ")}. Revisá antes de usar esas opciones. <button type="button" onClick={onRetryEvaluation}>Reintentar datos complementarios</button></p>}
        </div>
        {(catalog || evaluation || activeSpecialties.length > 0 || receiptRows.length > 0) && <>
        <div className="evaluation-panel-body">
          {/* Especialidades: filtro superior de la lista de rubros */}
          <aside className="evaluation-specialties-col" aria-label="Especialidades">
            <h3 className="evaluation-specialties-title">Especialidades</h3>
            {activeSpecialties.length > 0 ? (
              <div className="evaluation-specialty-list specialty-selector" role="group" aria-label="Especialidades de la competencia">
                {activeSpecialties.map((specialty) => {
                  const count = activeRubrics.filter((rubric) => (rubric.items ?? []).some((item) => item.active !== false && item.specialtyId === specialty.id)).length;
                  const status = evaluation?.specialties.find((entry) => entry.id === specialty.id);
                  const selected = selectedSpecialtyId === specialty.id;
                  return (
                    <button
                      key={specialty.id}
                      type="button"
                      className={`evaluation-specialty-btn specialty-option ${selected ? "is-selected" : ""}`}
                      aria-pressed={selected}
                      onClick={() => {
                        if (specialty.id !== selectedSpecialtyId && !requestDiscard(() => {
                          setShowCreateForm(false);
                          setSelectedSpecialtyId(specialty.id);
                        })) {
                          setShowCreateForm(false);
                          setSelectedSpecialtyId(specialty.id);
                        }
                      }}
                    >
                      <span className="evaluation-specialty-info">
                        <span className="evaluation-specialty-name">{specialty.name}</span>
                        <span className="evaluation-specialty-meta">
                          <span className="evaluation-specialty-count specialty-option-count">
                            {evaluation ? `${count} ${count === 1 ? "rubro" : "rubros"}` : "Rubros por comprobar"}
                          </span>
                          <span className={`evaluation-specialty-status${status?.status === "Lista" ? " is-ready" : ""}`}>{status?.status ?? "Estado por comprobar"}</span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="evaluation-empty-state">
                <strong>Todavía no hay especialidades activas</strong>
                <p>Los rubros se organizan según la especialidad que evalúa cada jurado. Primero agregá una especialidad.</p>
                <button className="secondary" type="button" onClick={onBack}>Volver a Jurados y especialidades</button>
              </div>
            )}
          </aside>
          {/* Columna Derecha: Rubros de la Especialidad */}
          <div className="evaluation-rubrics-col">
            {selectedSpecialty && (
              <div className="evaluation-rubrics-header evaluation-list-heading">
                <div>
                  <h3>Rubros de {selectedSpecialty.name}</h3>
                  <p>Ítems puntuables y criterios descriptivos de esta especialidad.</p>
                </div>
                {!locked && (!evaluation || specialtyRubrics.length > 0) && (
                  <button
                    type="button"
                    className="primary"
                    onClick={() => showCreateForm ? closeCreateForm() : openCreateForm()}
                    aria-expanded={showCreateForm}
                    aria-controls="new-rubric-form"
                  >
                    {showCreateForm ? "Cancelar" : "Agregar rubro"}
                  </button>
                )}
              </div>
            )}
            <p className="feedback" role="status">{message}</p>

            {!locked && showCreateForm && (
              <SaveForm
                id="new-rubric-form"
                ref={createFormRef}
                onInput={(e) => trackDraft(e.currentTarget)}
                onChange={(e) => trackDraft(e.currentTarget)}
                className="config-card rubric-create-form"
                onSubmit={(e) => submitCreate(e.currentTarget)}
              >
                <div className="rubric-create-head">
                  <h3>Crear rubro de evaluación</h3>
                  <p>Cada ítem indica la especialidad que lo puntúa. Los criterios descriptivos se agregan después, por separado.</p>
                </div>
                <div className="rubric-create-layout">
                <div className="rubric-create-main">
                <label>Nombre del rubro<input name="name" autoFocus required placeholder="Ej. Coreografía" disabled={Boolean(createReceipt)} /></label>
                <div className="rubric-create-pair">
                  <label>A quién se evalúa
                    <select name="evaluationTarget" value={newRubricTarget} disabled={Boolean(createReceipt)} onChange={(e) => setNewRubricTarget(e.target.value)}>
                      <option value="TROUPE">Comparsa</option>
                      <option value="NOMINATION">Nominación</option>
                    </select>
                  </label>
                  {newRubricTarget === "NOMINATION" && (
                    <label>Qué tipo de participante
                      <select name="expectedSubjectType" defaultValue="PERSON" disabled={Boolean(createReceipt)}>
                        {SUBJECT_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </label>
                  )}
                </div>
                <section className="rubric-create-items" aria-labelledby="new-rubric-items-title">
                  <h4 id="new-rubric-items-title">Ítems puntuables</h4>
                  <p className="rubric-create-hint">Cada ítem recibe una puntuación del jurado.</p>
                  {createRows.length === 0 && <p className="rubric-create-empty">Podés crear el rubro sin ítems; quedará sin asociación y pendiente de completar.</p>}
                  {createRows.map((row, index) => <div className="rubric-create-item" key={row.key}>
                    <div className="rubric-create-item-main">
                      <label>Nombre del ítem {index + 1}
                        <input value={row.name} required disabled={creating || row.status === "confirmed" || row.status === "uncertain"}
                          onChange={(e) => { const name = e.target.value; updateCreateRows((rows) => rows.map((candidate) => candidate.key === row.key ? { ...candidate, name } : candidate)); dirtyDraft.current = true; setIsDraftDirty(true); }} />
                      </label>
                      <label>Especialidad del ítem {index + 1}
                        <select value={row.specialtyId ?? ""} required disabled={creating || row.status === "confirmed" || row.status === "uncertain"}
                          onChange={(e) => { const specialtyId = e.target.value; updateCreateRows((rows) => rows.map((candidate) => candidate.key === row.key ? { ...candidate, specialtyId } : candidate)); dirtyDraft.current = true; setIsDraftDirty(true); }}>
                          {activeSpecialties.map((specialty) => <option key={specialty.id} value={specialty.id}>{specialty.name}</option>)}
                        </select>
                      </label>
                      {row.status !== "confirmed" && row.status !== "uncertain" && !creating && <button type="button" className="secondary rubric-create-remove" aria-label={`Quitar fila: ítem ${index + 1}`}
                        onClick={() => { updateCreateRows((rows) => rows.filter((candidate) => candidate.key !== row.key)); dirtyDraft.current = true; setIsDraftDirty(true); }}>Quitar</button>}
                    </div>
                    <div className="rubric-create-options">
                      <label className="check"><input type="checkbox" checked={row.required} disabled={creating || row.status === "confirmed" || row.status === "uncertain"}
                        onChange={(e) => { const required = e.target.checked; updateCreateRows((rows) => rows.map((candidate) => candidate.key === row.key ? { ...candidate, required } : candidate)); }} /> Obligatorio</label>
                      <label className="check"><input type="checkbox" checked={row.allowNotPresented} disabled={creating || row.status === "confirmed" || row.status === "uncertain"}
                        onChange={(e) => { const allowNotPresented = e.target.checked; updateCreateRows((rows) => rows.map((candidate) => candidate.key === row.key ? { ...candidate, allowNotPresented } : candidate)); }} /> Permite No presentado</label>
                    </div>
                    {row.status === "confirmed" ? <p>Ítem confirmado: {row.receipt.name} ({row.receipt.id}).</p>
                      : <p>{row.name || `Ítem ${index + 1}`}: {row.status === "uncertain" ? "por comprobar" : row.status === "rejected" ? "rechazada" : "pendiente no enviada"}.</p>}
                  </div>)}
                  {!createReceipt && <button type="button" className="secondary rubric-create-add" disabled={creating || createOutcome === "uncertain"} onClick={() => {
                    const key = ++nextCreateRow.current;
                    updateCreateRows((rows) => [...rows, { key, name: "", specialtyId: createSpecialty?.id ?? null, required: true, allowNotPresented: true, status: "pending" }]);
                    dirtyDraft.current = true; setIsDraftDirty(true);
                    requestAnimationFrame(() => createFormRef.current?.querySelector(`.rubric-create-item:last-of-type input`)?.focus());
                  }}>Agregar otro ítem</button>}
                </section>
                <details className="advanced-options">
                  <summary>Opciones avanzadas</summary>
                  <label>Tipo de evaluación
                    <select name="rubricType" disabled={Boolean(createReceipt)}>
                      {RUBRIC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </label>
                  <label>Detalle adicional (opcional)<input name="evaluationObjective" placeholder="Por ejemplo: figura o participante" disabled={Boolean(createReceipt)} /></label>
                  <label>Método de resolución
                    <select name="resolutionMethod" disabled={Boolean(createReceipt)} title="Este dato describe cómo se resuelve el rubro; no ejecuta fórmulas ni decisiones automáticas.">
                      {RESOLUTION_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </label>
                  <RubricIconPicker name="icon" disabled={Boolean(createReceipt)} />
                </details>
                {createReceipt && <p role="status">Rubro confirmado: {createReceipt.name} ({createReceipt.id}).</p>}
                {!originalSpecialtyActive && <p role="alert">La especialidad {createSpecialty.name} ya no está activa. No se enviarán ítems a otra especialidad: descartá este formulario y elegí una especialidad activa. Lo confirmado no se deshará.</p>}
                {createOutcome === "partial" && createRows.some((row) => row.status !== "confirmed") && <p role="status">Guardado parcial: el rubro y los ítems identificados están confirmados; los demás siguen pendientes. No es una transacción única.</p>}
                {createOutcome === "error" && <p role="status">Error total: ninguna operación se confirmó. Revisá los datos y reintentá la creación.</p>}
                {createOutcome === "uncertain" && <p role="status">Resultado por comprobar: no sabemos si se guardó. No reintentes este POST sin revisión manual.</p>}
                {createError && <p role="alert">{createError}</p>}
                {reviewRequested && <p role="status">Consultá la configuración guardada y solicitá revisión manual antes de intentar otra vez. Un GET, incluso con nombre o ID coincidente, no comprueba este POST.</p>}
                <div className="form-actions rubric-create-actions">
                  {createRows.some((row) => row.status === "uncertain") || createOutcome === "uncertain"
                    ? <button type="button" className="secondary" onClick={() => { setReviewRequested(true); onRetryEvaluation?.(); }}>Revisar configuración guardada</button>
                    : createReceipt && createRows.some((row) => row.status !== "confirmed")
                      ? <button type="submit" disabled={creating || !originalSpecialtyActive}>Reintentar ítems pendientes</button>
                      : createReceipt ? <button type="button" onClick={() => {
                        dirtyDraft.current = false; setIsDraftDirty(false); setShowCreateForm(false); resetCreateFlow();
                        setMessage("Alta finalizada. Solo se guardaron el rubro y los ítems confirmados.");
                      }}>Finalizar alta</button>
                      : <button type="submit" disabled={creating || !originalSpecialtyActive}>Crear rubro</button>}
                  <button type="button" className="secondary" onClick={closeCreateForm}>Cancelar</button>
                </div>
                </div>
                <aside className="rubric-create-summary" aria-label="Resumen del alta">
                  <h4>Resumen</h4>
                  <dl>
                    <div><dt>Especialidades</dt><dd>{createSpecialtyNames.length > 0 ? createSpecialtyNames.join(", ") : "Ninguna todavía"}</dd></div>
                    <div><dt>Se evalúa a</dt><dd>{newRubricTarget === "NOMINATION" ? "Nominación" : "Comparsa"}</dd></div>
                    <div><dt>Ítems</dt><dd>{createRows.length}</dd></div>
                  </dl>
                  <p className="rubric-create-note">Primero se guarda el rubro y después cada ítem. Si alguno falla, te mostramos cuál quedó pendiente.</p>
                </aside>
                </div>
              </SaveForm>
            )}

            {evaluation && selectedSpecialty && specialtyRubrics.length === 0 && !showCreateForm && (
              <div className="evaluation-empty-state">
                <h3>Todavía no configuraste qué se evalúa en {selectedSpecialty.name}.</h3>
                <p>Empezá creando un rubro, por ejemplo Coreografía. Después podrás agregar ítems puntuables como Creatividad y Sincronización.</p>
                {!locked && (
                  <button type="button" className="primary" onClick={openCreateForm} aria-controls="new-rubric-form" aria-expanded={showCreateForm}>Crear primer rubro</button>
                )}
              </div>
            )}

            {rubricGroups.filter((group) => group.entries.length > 0).map((group) => (
              <section key={group.key} className="evaluation-rubric-group" aria-label={group.title ?? `Rubros de ${selectedSpecialty?.name ?? "la especialidad"}`}>
                {group.title && <h3 className="rubric-group-heading">{group.title}</h3>}
                <div className="rubric-list">
              {group.entries.map((rubric) => {
                const isUnassigned = group.key === "pending";
                const orderedItems = [...(rubric.items ?? [])].sort((a, b) => a.displayOrder - b.displayOrder);
                const derived = activeSpecialties.filter((s) => (rubric.items ?? []).some((i) => i.active !== false && i.specialtyId === s.id));
                const visibleItems = orderedItems.filter((item) => item.active !== false && (group.key !== "associated" || item.specialtyId === selectedSpecialty?.id));
                const isExpanded = expanded === rubric.id;
                const rubricTypeLabel = RUBRIC_TYPES.find((t) => t.value === rubric.rubricType)?.label ?? LEGACY_RUBRIC_TYPE_LABELS[rubric.rubricType] ?? rubric.rubricType;
                const rubricStatus = rubric.active === false ? "Inactivo" : !evaluation || readinessStatus !== "available" ? "Estado por comprobar" : incompleteRubricIds.has(rubric.id) ? "Necesita configuración" : isUnassigned ? "Sin asociación activa" : "Listo";
                const criteriaCount = (rubric.criteria ?? []).filter((c) => c.active !== false).length;
                const isMenuOpen = openMenuRubricId === rubric.id;

                return (
                  <Fragment key={rubric.id}>
                    <article className={`rubric-card${isUnassigned ? " rubric-card-unassigned" : ""}`} data-rubric-id={rubric.id}>
                      <div className="rubric-card-header">
                        <div className="rubric-card-main">
                          <h3>
                            <RubricIcon icon={rubric.icon} size="sm" className="rubric-icon-inline" />
                            {rubric.name}
                            {rubric.active === false && <small> · Inactivo</small>}
                          </h3>
                          <p className="rubric-card-meta">
                            <span>{rubric.evaluationTarget === "NOMINATION" ? "Evalúa participantes nominados" : "Evalúa comparsas"}</span>
                            <span className={`rubric-status${rubricStatus === "Listo" ? " is-ready" : ""}`}>{rubricStatus}</span>
                          </p>
                          <div className="rubric-item-preview">
                            <strong>{visibleItems.length} {visibleItems.length === 1 ? "ítem puntuable" : "ítems puntuables"}</strong>
                            {visibleItems.length > 0 ? (
                              <ul aria-label={`Ítems puntuables de ${rubric.name}`}>
                                {visibleItems.map((item) => <li key={item.id}>{item.name}</li>)}
                              </ul>
                            ) : <p>Sin ítems puntuables activos.</p>}
                          </div>
                          {rubric.evaluationObjective && <p className="rubric-card-note">{rubric.evaluationObjective}</p>}
                          {derived.length > 1 && (
                            <p className="rubric-card-note" title={`Este rubro se comparte entre ${derived.map((s) => s.name).join(" y ")}`}>
                              Este rubro se comparte entre {derived.map((s) => s.name).join(" y ")}
                            </p>
                          )}
                          {isUnassigned && <p className="rubric-card-note">No tiene ítems asociados a una especialidad activa.</p>}
                        </div>

                        <div className="rubric-card-actions">
                          <button
                            className="secondary rubric-criteria-toggle"
                            type="button"
                            aria-label={`${isExpanded ? "Ocultar" : "Ver"} criterios de ${rubric.name}`}
                            aria-expanded={isExpanded}
                            onClick={() => {
                              setHighlightItemId(null);
                              setExpanded(isExpanded ? null : rubric.id);
                              setEditingRubricId(null);
                            }}
                          >
                            {isExpanded ? "Ocultar criterios " : "Ver criterios "}<span aria-hidden="true">{isExpanded ? "▴" : "▾"}</span>
                          </button>

                          {!locked && <div className="rubric-quick-menu">
                            <button
                              type="button"
                              className="secondary rubric-quick-menu-trigger"
                              aria-label={`Más opciones para ${rubric.name}`}
                              aria-expanded={isMenuOpen}
                              onClick={() => setOpenMenuRubricId((cur) => cur === rubric.id ? null : rubric.id)}
                            >
                              Más opciones
                            </button>
                            {isMenuOpen && (
                              <div className="rubric-quick-menu-dropdown" role="menu">
                                {!locked && (
                                  <button
                                    type="button"
                                    className="secondary"
                                    onClick={() => {
                                      setOpenMenuRubricId(null);
                                      setExpanded(rubric.id);
                                      setEditingRubricId(rubric.id);
                                      setEditingRubricTarget(rubric.evaluationTarget);
                                    }}
                                  >
                                    Editar rubro
                                  </button>
                                )}
                                {!locked && (
                                  <button
                                    type="button"
                                    className="secondary"
                                    disabled={activeSpecialties.length === 0}
                                    onClick={(event) => {
                                      setOpenMenuRubricId(null);
                                      itemCreateTriggerRef.current = event.currentTarget;
                                      setItemCreateTarget(rubric);
                                    }}
                                  >
                                    Crear ítem
                                  </button>
                                )}
                                {!locked && (rubric.active !== false ? (
                                  <button
                                    className="secondary danger-action"
                                    type="button"
                                    onClick={(event) => {
                                      setOpenMenuRubricId(null);
                                      rubricDeleteTriggerRef.current = event.currentTarget;
                                      setRubricDeleteTarget(rubric);
                                    }}
                                  >
                                    Desactivar rubro
                                  </button>
                                ) : (
                                  <button
                                    className="secondary"
                                    type="button"
                                    onClick={() => {
                                      setOpenMenuRubricId(null);
                                       requestMutationConfirmation("Reactivar rubro", `Se volverá a incluir el rubro ${rubric.name} en la configuración activa. ${rubricSpecialtyScope(rubric)} Sus datos e historial se conservan.`, () => setRubricActive(rubric, true), true);
                                    }}
                                  >
                                    Reactivar rubro
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>}

                          {tab === "items" && !locked && rubric.active !== false && (
                            <button
                              type="button"
                              aria-label={`Crear ítem en ${rubric.name}`}
                              disabled={activeSpecialties.length === 0}
                              onClick={(event) => {
                                itemCreateTriggerRef.current = event.currentTarget;
                                setItemCreateTarget(rubric);
                              }}
                            >
                              Crear ítem
                            </button>
                          )}
                          {!locked && (rubric.active !== false ? (
                            <button
                              className="secondary danger-action sr-only"
                              type="button"
                              aria-label={`Desactivar rubro ${rubric.name}`}
                              onClick={(event) => {
                                rubricDeleteTriggerRef.current = event.currentTarget;
                                setRubricDeleteTarget(rubric);
                              }}
                            >
                              Desactivar
                            </button>
                          ) : (
                            <button
                              className="secondary sr-only"
                              type="button"
                              aria-label={`Reactivar rubro ${rubric.name}`}
                               onClick={() => requestMutationConfirmation("Reactivar rubro", `Se volverá a incluir el rubro ${rubric.name} en la configuración activa. ${rubricSpecialtyScope(rubric)} Sus datos e historial se conservan.`, () => setRubricActive(rubric, true), true)}
                            >
                              Reactivar
                            </button>
                          ))}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="rubric-compact-body rubric-expanded">
                          <p className="rubric-detail-meta">{criteriaCount} {criteriaCount === 1 ? "criterio descriptivo" : "criterios descriptivos"}</p>
                          {derived.length > 1 && (
                            <div className="rubric-shared-explanation" role="note">
                              <span aria-hidden="true">ℹ️</span>
                               Editar o cambiar el estado de este rubro compartido afecta a sus especialidades asociadas ({derived.map((s) => s.name).join(", ")}). Editar un ítem o criterio afecta solo a ese elemento.
                            </div>
                          )}

                          {!locked && (
                            editingRubricId === rubric.id ? (
                              <SaveForm
                                className="rubric-edit-form"
                                onSubmit={(e) => {
                                  const fd = new FormData(e.currentTarget);
                                  const body = {
                                    name: fd.get("name"),
                                    evaluationTarget: fd.get("evaluationTarget"),
                                    expectedSubjectType: fd.get("evaluationTarget") === "NOMINATION" ? fd.get("expectedSubjectType") : null,
                                    rubricType: fd.get("rubricType"),
                                    resolutionMethod: fd.get("resolutionMethod"),
                                    evaluationObjective: fd.get("evaluationObjective") || null,
                                    icon: fd.get("icon") || null,
                                    active: fd.get("active") === "on",
                                  };
                                   const desc = `Se actualizará la configuración del rubro ${rubric.name}. ${rubricSpecialtyScope(rubric)} Este cambio no borra el historial.`;
                                  requestMutationConfirmation("Guardar cambios del rubro", desc, async () => {
                                    const ok = await saveRubric(`/api/v1/rubrics/${rubric.id}`, body, "PATCH");
                                    if (ok) setEditingRubricId(null);
                                  });
                                  return false;
                                }}
                              >
                                <label>Nombre<input name="name" defaultValue={rubric.name} required /></label>
                                <label>A quién se evalúa
                                  <select name="evaluationTarget" value={editingRubricTarget} onChange={(e) => setEditingRubricTarget(e.target.value)}>
                                    <option value="TROUPE">Comparsa</option>
                                    <option value="NOMINATION">Nominación</option>
                                  </select>
                                </label>
                                <label>Tipo
                                  <select name="rubricType" defaultValue={rubric.rubricType}>
                                    {!RUBRIC_TYPES.some((type) => type.value === rubric.rubricType) && (
                                      <option value={rubric.rubricType}>{LEGACY_RUBRIC_TYPE_LABELS[rubric.rubricType] ?? `${rubric.rubricType} (histórico)`}</option>
                                    )}
                                    {RUBRIC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                                  </select>
                                </label>
                                <label>Detalle (opcional)<input name="evaluationObjective" defaultValue={rubric.evaluationObjective ?? ""} /></label>
                                <details className="advanced-options">
                                  <summary>Opciones avanzadas</summary>
                                  {editingRubricTarget === "NOMINATION" && (
                                    <label>Qué tipo de participante
                                      <select name="expectedSubjectType" defaultValue={rubric.expectedSubjectType ?? "PERSON"}>
                                        {SUBJECT_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                                      </select>
                                    </label>
                                  )}
                                  <label>Método de resolución
                                    <select name="resolutionMethod" defaultValue={rubric.resolutionMethod} title="Este dato describe cómo se resuelve el rubro; no ejecuta fórmulas ni decisiones automáticas.">
                                      {RESOLUTION_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                                    </select>
                                  </label>
                                </details>
                                <RubricIconPicker name="icon" defaultValue={rubric.icon} />
                                <label className="check"><input name="active" type="checkbox" defaultChecked={rubric.active} /> Activo</label>
                                <div className="form-actions">
                                  <button type="submit">Guardar rubro</button>
                                  <button type="button" className="secondary" onClick={() => setEditingRubricId(null)}>Cancelar</button>
                                </div>
                              </SaveForm>
                            ) : (
                              <div className="rubric-edit-actions">
                                <button
                                  className="secondary"
                                  type="button"
                                  onClick={() => {
                                    setEditingRubricId(rubric.id);
                                    setEditingRubricTarget(rubric.evaluationTarget);
                                  }}
                                >
                                  Editar rubro
                                </button>
                              </div>
                            )
                          )}

                          {rubric.evaluationTarget === "NOMINATION" && (
                            <section className="rubric-nominations" aria-label={`Participantes nominados para ${rubric.name}`}>
                              <h4>Participantes nominados</h4>
                              <ul className="rubric-nomination-list">
                                {(rubric.nominations ?? []).map((nomination) => (
                                  <li key={nomination.id} className={nomination.active ? "" : "is-inactive"}>
                                    <span><strong>{nomination.displayName}</strong> · {nomination.troupeName} <small>({subjectTypeLabel(nomination.subjectType)})</small></span>
                                    {!locked && (
                                      <button
                                        className="secondary"
                                        type="button"
                                        onClick={() => setNominationStatusTarget({ nomination, rubric, active: !nomination.active })}
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
                                      rubric,
                                      rubricName: rubric.name,
                                      troupeName: troupe?.name ?? "la comparsa seleccionada",
                                      body: { eventTroupeId: fd.get("eventTroupeId"), displayName: fd.get("displayName") },
                                    });
                                    return false;
                                  }}
                                >
                                  <label>Comparsa
                                    <select name="eventTroupeId" required defaultValue="">
                                      <option value="" disabled>Elegí una comparsa</option>
                                      {activeTroupes.map((troupe) => <option key={troupe.id} value={troupe.id}>{troupe.name}</option>)}
                                    </select>
                                  </label>
                                  <label>Nombre del participante
                                    <input name="displayName" required placeholder="Ej.: Ana López o Pareja de baile" />
                                  </label>
                                  {rubric.rubricType === "RANDOM" && <small>Máximo 3 participantes activos por comparsa en este rubro.</small>}
                                  <button type="submit">Agregar participante</button>
                                </SaveForm>
                              )}
                            </section>
                          )}

                          <section className="rubric-items-section" aria-label={`Ítems y criterios de ${rubric.name}`}>
                            <div className="rubric-items-header">
                              <h4>Ítems y criterios puntuables</h4>
                              {!locked && tab !== "items" && (
                                <button
                                  type="button"
                                  className="secondary"
                                  disabled={activeSpecialties.length === 0}
                                  onClick={(event) => {
                                    itemCreateTriggerRef.current = event.currentTarget;
                                    setItemCreateTarget(rubric);
                                  }}
                                >
                                  + Agregar ítem puntuable
                                </button>
                              )}
                            </div>

                            {orderedItems.length === 0 ? (
                              <p className="field-hint">Este rubro todavía no tiene ítems puntuables; agregá el primero.</p>
                            ) : (
                              orderedItems.map((item, itemIndex) => {
                                const itemCriteria = (rubric.criteria ?? []).filter((c) => c.scoringItemId === item.id).sort((a, b) => a.displayOrder - b.displayOrder);
                                return (
                                  <article className={`subrecord${highlightItemId === item.id ? " is-target" : ""}`} key={item.id} data-item-id={item.id}>
                                    {editingItem === item.id ? (
                                      <SaveForm onSubmit={(e) => {
                                        const fd = new FormData(e.currentTarget);
                                        const body = {
                                          name: fd.get("name"),
                                          specialtyId: fd.get("specialtyId"),
                                          displayOrder: Number(fd.get("displayOrder")),
                                          required: fd.get("required") === "on",
                                          allowNotPresented: fd.get("allowNotPresented") === "on",
                                          active: fd.get("active") === "on",
                                        };
                                        requestMutationConfirmation("Guardar cambios del ítem", `Se actualizará el ítem ${item.name} del rubro ${rubric.name}. Especialidad de origen: ${specialtyName(item.specialtyId, item.specialtyName)}; destino: ${specialtyName(body.specialtyId)}. Solo se modifica este ítem.`, () => saveItem(rubric.id, body, "PATCH", item.id));
                                        return false;
                                      }}>
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
                                        {!locked && <button className="secondary edit-action" type="button" aria-label={`Editar item ${item.name}`} onClick={() => setEditingItem(item.id)}>Editar</button>}
                                        {!locked && (
                                          <>
                                            <button className="secondary" type="button" aria-label={`Subir item ${item.name}`} disabled={itemIndex === 0 || !!editingItem || !!editingCriterion} onClick={() => requestMutationConfirmation("Confirmar cambio de orden", `Se intercambiará el orden del ítem ${item.name} (${specialtyName(item.specialtyId, item.specialtyName)}) con el ítem vecino ${orderedItems[itemIndex - 1].name} (${specialtyName(orderedItems[itemIndex - 1].specialtyId, orderedItems[itemIndex - 1].specialtyName)}) dentro del rubro ${rubric.name}.`, () => reorder(rubric.id, "items", item, orderedItems[itemIndex - 1], "UP"), true)}>Subir</button>
                                            <button className="secondary" type="button" aria-label={`Bajar item ${item.name}`} disabled={itemIndex === orderedItems.length - 1 || !!editingItem || !!editingCriterion} onClick={() => requestMutationConfirmation("Confirmar cambio de orden", `Se intercambiará el orden del ítem ${item.name} (${specialtyName(item.specialtyId, item.specialtyName)}) con el ítem vecino ${orderedItems[itemIndex + 1].name} (${specialtyName(orderedItems[itemIndex + 1].specialtyId, orderedItems[itemIndex + 1].specialtyName)}) dentro del rubro ${rubric.name}.`, () => reorder(rubric.id, "items", item, orderedItems[itemIndex + 1], "DOWN"), true)}>Bajar</button>
                                          </>
                                        )}
                                      </div>
                                    )}

                                    <div className="criterion-list">
                                      {itemCriteria.length === 0 && (
                                        <p className="field-hint" style={{ fontSize: "var(--text-xs)", margin: "0.25rem 0" }}>
                                          Sin criterios de puntuación asociados a este ítem.
                                        </p>
                                      )}
                                      {itemCriteria.map((crit, criterionIndex, siblings) => (
                                        <article className="subrecord criterion" key={crit.id}>
                                          {editingCriterion === crit.id ? (
                                            <SaveForm onSubmit={(e) => {
                                              const fd = new FormData(e.currentTarget);
                                              const body = {
                                                scoringItemId: fd.get("scoringItemId"),
                                                description: fd.get("description"),
                                                displayOrder: Number(fd.get("displayOrder")),
                                                active: fd.get("active") === "on",
                                              };
                                              const destination = (rubric.items ?? []).find((candidate) => candidate.id === body.scoringItemId);
                                              requestMutationConfirmation("Guardar cambios del criterio", `Se actualizará el criterio ${crit.description} del rubro ${rubric.name}. Ítem de origen: ${item.name}; destino: ${destination?.name ?? "seleccionado"}. Solo se modifica este criterio.`, () => saveCriterion(rubric.id, body, "PATCH", crit.id));
                                              return false;
                                            }}>
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
                                              {!locked && <button className="secondary edit-action" type="button" aria-label={`Editar criterio ${crit.description}`} onClick={() => setEditingCriterion(crit.id)}>Editar</button>}
                                              {!locked && (
                                                <>
                                                  <button className="secondary" type="button" aria-label={`Subir criterio ${crit.description}`} disabled={criterionIndex === 0 || !!editingItem || !!editingCriterion} onClick={() => requestMutationConfirmation("Confirmar cambio de orden", `Se intercambiará el orden del criterio ${crit.description} con ${siblings[criterionIndex - 1].description} dentro del ítem ${item.name} del rubro ${rubric.name}.`, () => reorder(rubric.id, "criteria", crit, siblings[criterionIndex - 1], "UP"), true)}>Subir</button>
                                                  <button className="secondary" type="button" aria-label={`Bajar criterio ${crit.description}`} disabled={criterionIndex === siblings.length - 1 || !!editingItem || !!editingCriterion} onClick={() => requestMutationConfirmation("Confirmar cambio de orden", `Se intercambiará el orden del criterio ${crit.description} con ${siblings[criterionIndex + 1].description} dentro del ítem ${item.name} del rubro ${rubric.name}.`, () => reorder(rubric.id, "criteria", crit, siblings[criterionIndex + 1], "DOWN"), true)}>Bajar</button>
                                                </>
                                              )}
                                            </div>
                                          )}
                                        </article>
                                      ))}

                                      {!locked && (
                                        <SaveForm
                                          className="inline-criterion-form"
                                          onSubmit={(e) => {
                                            const fd = new FormData(e.currentTarget);
                                            const form = e.currentTarget;
                                            const body = { scoringItemId: item.id, description: fd.get("description"), displayOrder: Number(fd.get("displayOrder")) };
                                            requestMutationConfirmation("Confirmar creación del criterio", `Se agregará el criterio ${body.description} al ítem ${item.name} del rubro ${rubric.name}.`, async () => {
                                              if (await saveCriterion(rubric.id, body) && form.isConnected) form.reset();
                                            });
                                            return false;
                                          }}
                                        >
                                          <input name="description" aria-label={`Nuevo criterio para ${item.name}`} placeholder="Guía para el jurado (ej: Sincronización)" required />
                                          <input name="displayOrder" aria-label={`Orden del nuevo criterio para ${item.name}`} type="number" min="1" defaultValue="1" required className="input-order" />
                                          <button type="submit" aria-label={`Agregar criterio a ${item.name}`}>+</button>
                                        </SaveForm>
                                      )}
                                    </div>
                                  </article>
                                );
                              })
                            )}
                          </section>
                        </div>
                      )}
                    </article>
                  </Fragment>
                );
              })}
                </div>
              </section>
            ))}

            {specialtyRubrics.some((r) => activeSpecialties.filter((s) => (r.items ?? []).some((i) => i.active !== false && i.specialtyId === s.id)).length > 1) && (
              <p className="rubric-shared-footnote">
                Los cambios en la configuración del rubro compartido afectan a sus especialidades asociadas; los cambios de ítem y criterio tienen su propio alcance.
              </p>
            )}
          </div>
        </div>
        </>}
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
        description={rubricDeleteTarget ? `El rubro ${rubricDeleteTarget.name} dejará de formar parte de la configuración activa. ${rubricSpecialtyScope(rubricDeleteTarget)} El registro y sus datos se conservarán; no se borrarán sus antecedentes.` : ""}
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
          ? `Se agregará a ${nominationCreateTarget.body.displayName} de ${nominationCreateTarget.troupeName} al rubro ${nominationCreateTarget.rubricName}. ${rubricSpecialtyScope(nominationCreateTarget.rubric)} El participante tendrá una puntuación independiente.`
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
          ? `${nominationStatusTarget.active ? "Se incluirá" : "Se excluirá"} a ${nominationStatusTarget.nomination.displayName} (${nominationStatusTarget.nomination.troupeName}) de las nuevas planillas del rubro ${nominationStatusTarget.rubric.name}. ${rubricSpecialtyScope(nominationStatusTarget.rubric)}`
          : "Confirmá el cambio del participante."}
      >
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={() => setNominationStatusTarget(null)}>Cancelar</button>
          <button type="button" className={nominationStatusTarget?.active ? "primary" : "danger-action"} onClick={confirmNominationStatus}>
            {nominationStatusTarget?.active ? "Reactivar" : "Desactivar"}
          </button>
        </div>
      </Dialog>
      <ConfirmDialog
        isOpen={discardAction !== null}
        onClose={() => { discardStay.current?.(); discardStay.current = null; setDiscardAction(null); }}
        onConfirm={confirmDiscard}
        title="¿Descartar cambios sin guardar?"
        description="Los cambios de este formulario se perderán. Lo ya guardado en el evento no se deshará."
        confirmLabel="Descartar cambios"
        cancelLabel="Permanecer"
        focusReturnRef={discardTrigger}
      />
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
