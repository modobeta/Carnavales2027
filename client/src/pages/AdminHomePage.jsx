import { useEffect, useState } from "react";
import { apiRequest } from "../api/http.js";
import { PageShell } from "../components/PageShell.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { EventStatusBanner } from "../components/EventStatusBanner.jsx";
import { useAdminEvent } from "../context/AdminEventContext.jsx";
import { PREPARATION_STEPS, READINESS_STATE_LABELS, isInterpretableReadiness, readinessIssues, readinessStepStates } from "../features/readiness-presentation.js";

function countActive(items) {
  return (items ?? []).filter((item) => item.active !== false).length;
}

/**
 * AdminHomePage — Panel de solo lectura (Spec 027/Fase B).
 * Responde: estado, qué está configurado, qué falta, próximo paso,
 * problemas bloqueantes. Sin escrituras: ningún POST/PUT/PATCH.
 */
export function AdminHomePage() {
  const adminEvent = useAdminEvent();
  const [localEvents, setLocalEvents] = useState([]);
  const [localEventId, setLocalEventId] = useState("");
  const [readinessState, setReadinessState] = useState({ eventId: null, status: "unqueried", data: null });
  const [counts, setCounts] = useState({ nights: 0, troupes: 0, specialties: 0, rubrics: 0, judges: 0, assignments: 0 });
  const [localLoading, setLocalLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (adminEvent) return undefined;
    let active = true;
    apiRequest("/api/v1/events")
      .then((items) => {
        if (!active) return;
        const events = items ?? [];
        const firstEventId = events[0]?.id ?? "";
        setLocalEvents(events);
        setLocalEventId(firstEventId);
        if (!firstEventId) setLocalLoading(false);
      })
      .catch(() => {
        if (active) {
          setMessage("No se pudieron cargar los eventos.");
          setLocalLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [adminEvent]);

  const events = adminEvent?.events ?? localEvents;
  const eventId = adminEvent?.activeEventId ?? localEventId;
  const loading = adminEvent ? adminEvent.loading || (eventId ? localLoading : false) : localLoading;

  useEffect(() => {
    if (!eventId) {
      setReadinessState({ eventId: null, status: "unqueried", data: null });
      return undefined;
    }
    let active = true;
    setLocalLoading(true);
    setMessage("");
    setReadinessState({ eventId, status: "unqueried", data: null });
    Promise.allSettled([
      apiRequest(`/api/v1/events/${eventId}/readiness`),
      apiRequest(`/api/v1/events/${eventId}/nights`),
      apiRequest(`/api/v1/events/${eventId}/troupes`),
      apiRequest(`/api/v1/events/${eventId}/specialties`),
      apiRequest(`/api/v1/events/${eventId}/rubrics`),
      apiRequest(`/api/v1/events/${eventId}/judge-assignments`),
      apiRequest("/api/v1/judges"),
    ]).then(([readinessRes, nightsRes, troupesRes, specialtiesRes, rubricsRes, assignmentsRes, judgesRes]) => {
      if (!active) return;
      const validReadiness = readinessRes.status === "fulfilled" && isInterpretableReadiness(readinessRes.value);
      setReadinessState({ eventId, status: validReadiness ? "available" : "unavailable", data: validReadiness ? readinessRes.value : null });
      const rubrics = rubricsRes.status === "fulfilled" ? rubricsRes.value : [];
      const assignments = assignmentsRes.status === "fulfilled" ? assignmentsRes.value?.assignments ?? [] : [];
      const judges = judgesRes.status === "fulfilled" ? judgesRes.value : [];
      setCounts({
        nights: (nightsRes.status === "fulfilled" ? nightsRes.value : []).filter((n) => n.kind === "COMPETITION").length,
        troupes: countActive(troupesRes.status === "fulfilled" ? troupesRes.value : []),
        specialties: countActive(specialtiesRes.status === "fulfilled" ? specialtiesRes.value : []),
        rubrics: countActive(rubrics),
        judges: judges.filter((j) => j.registrationStatus === "REGISTERED").length,
        assignments: assignments.filter((a) => a.status === "ACTIVE").length,
      });
      if (!validReadiness) setMessage("No se pudo consultar la preparación del evento.");
      setLocalLoading(false);
    });
    return () => {
      active = false;
    };
  }, [eventId, adminEvent]);

  const selected = adminEvent?.activeEvent ?? events.find((event) => event.id === eventId);
  const effectiveMessage = adminEvent?.error || message;

  const currentReadiness = readinessState.eventId === eventId ? readinessState.data : null;
  const currentReadinessStatus = readinessState.eventId === eventId ? readinessState.status : "unqueried";
  const states = readinessStepStates(currentReadiness, currentReadinessStatus);
  const steps = PREPARATION_STEPS.map((step) => ({ ...step, state: states[step.key] }));
  const problems = readinessIssues(currentReadiness);
  const incompleteStep = steps.find((step) => step.state === "incomplete");
  const nextStep = selected?.status === "OPEN"
    ? { label: "Supervisar la votación", href: "#/veedor", detail: "El evento está abierto; consultá el avance de la jornada." }
    : selected?.status === "CLOSED"
      ? { label: "Revisar resultados", href: "#/admin/results", detail: "El evento está cerrado." }
      : incompleteStep
        ? { label: `Corregir ${incompleteStep.label.toLowerCase()}`, href: incompleteStep.href, detail: "Readiness informa bloqueos oficiales para este paso." }
        : currentReadinessStatus !== "available"
          ? { label: "Consultar preparación", href: "#/admin/events", detail: "La preparación todavía no está disponible para este evento." }
          : { label: "Revisar readiness", href: "#/admin/events", detail: "La API no informa bloqueos oficiales de apertura." };

  const stats = [
    { key: "troupes", value: counts.troupes, label: "Comparsas", href: "#/admin/competencia" },
    { key: "nights", value: counts.nights, label: "Jornadas", href: "#/admin/events" },
    { key: "judges", value: counts.judges, label: "Jurados", href: "#/admin/judges" },
    { key: "rubrics", value: counts.rubrics, label: "Rubros", href: "#/admin/competencia" },
  ];

  return (
    <PageShell layer="instrument" className="admin-shell admin-home-shell">
      <PageHeader
        eyebrow="Panel de administración"
        title={selected?.name ?? "Administración"}
        status={selected?.status}
      />
      {selected && <EventStatusBanner status={selected.status} />}
      <p className="feedback" role="status" aria-live="polite">
        {effectiveMessage}
      </p>
      {loading ? (
        <p>Cargando panel…</p>
      ) : !selected ? (
        <p className="empty-state">Todavía no hay eventos. Creá el primero desde Evento.</p>
      ) : (
        <div className="admin-dashboard">
          <section className="config-section" aria-label="Resumen del evento">
            <div className="section-heading">
              <h2>Resumen</h2>
            </div>
            <div className="competencia-overview-grid admin-stats">
              {stats.map((stat) => (
                <a className="overview-stat" key={stat.key} href={stat.href} aria-label={`${stat.label}: ${stat.value}. Ver ${stat.label.toLowerCase()}`}>
                  <span className="overview-number">{stat.value}</span>
                  <span className="overview-label">{stat.label}</span>
                  <span className="admin-stat-link">Ver {stat.label.toLowerCase()}</span>
                </a>
              ))}
            </div>
          </section>

          <section className="config-section" aria-label="Preparación del evento">
            <div className="section-heading">
              <h2>Preparación del evento</h2>
              <p>Estados oficiales de readiness para las cuatro etapas.</p>
            </div>
            <ol className="config-progress-steps">
              {steps.map((step) => <li key={step.key} className={`config-progress-step is-${step.state}`}>
                <a className="config-progress-link" href={step.href} aria-label={`${step.label}: ${READINESS_STATE_LABELS[step.state]}`}>
                  <span className="config-progress-bullet" aria-hidden="true">{step.state === "complete" ? "✓" : "!"}</span>
                  <span className="config-progress-copy"><span className="config-progress-title"><strong>{step.label}</strong><span className="config-progress-state">{READINESS_STATE_LABELS[step.state]}</span></span></span>
                </a>
              </li>)}
            </ol>
            <div className="admin-next-step-card">
              <div><span className="eyebrow">Próxima acción</span><strong>{nextStep.label}</strong><span>{nextStep.detail}</span></div>
              <a className="button-link" href={nextStep.href}>{nextStep.label}</a>
            </div>
          </section>

          <section className="config-section admin-attention-section" aria-label="Requiere atención">
            <div className="section-heading">
              <h2>Requiere atención</h2>
              <p>Resolvé estos puntos antes de abrir la competencia.</p>
            </div>
            {currentReadinessStatus !== "available" ? (
              <p className="readiness-pending">{currentReadinessStatus === "unqueried" ? "No consultado" : "Readiness no disponible; no se puede confirmar la preparación."}</p>
            ) : problems.length > 0 ? (
              <ul className="readiness-checklist admin-problem-list">
                {problems.map((problem) => (
                  <li key={problem.key} className="readiness-fail">
                    <span className="readiness-icon" aria-hidden="true">!</span>
                    <span className="admin-problem-copy">
                      <span className="eyebrow">Bloqueo oficial</span>
                      <strong>{problem.title}</strong>
                      <span>{problem.description}</span>
                    </span>
                    <a href={problem.href}>{problem.action}</a>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        </div>
      )}
    </PageShell>
  );
}
