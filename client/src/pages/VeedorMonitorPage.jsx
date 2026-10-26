import { useAdminEvent } from "../context/AdminEventContext.jsx";
import { useCallback, useEffect, useRef, useState } from "react";
import { PageShell } from "../components/PageShell.jsx";
import { SkeletonLoader } from "../components/SkeletonLoader.jsx";
import { apiRequest } from "../api/http.js";
import {
  getPendingIncidents,
  savePendingIncident,
  syncPendingIncidents,
} from "../offline/veedor-incidents-store.js";

const POLLING_MS = 15_000;
const RECONNECT_INTERVAL_MS = 20_000;

const countCards = [
  ["OPEN", "En carga"],
  ["SUBMITTED", "Confirmadas"],
  ["REOPENED", "Reabiertas"],
  ["REPLACED", "Reemplazadas"],
];

const INCIDENT_TYPE_LABELS = {
  INCOMPLETE_BALLOT: "Planilla incompleta",
  UNSCORED_ITEM: "Rubro sin puntuar",
  ERROR_OMISSION: "Error u omisión detectada",
  ABSENT_PARTICIPANT_SCORED: "Participante ausente evaluado",
  SYNC_FAILURE: "Problema de sincronización",
  PROCEDURE_BREACH: "Incumplimiento de procedimiento",
  OBSERVATION: "Observación reglamentaria",
  OTHER: "Otra incidencia",
};

const INCIDENT_STATUS_LABELS = {
  OPEN: "Abierta",
  NOTIFIED: "Notificada",
  IN_SUBSANATION: "En subsanación",
  RESOLVED: "Resuelta",
  ESCALATED: "Escalada",
};

function votingStatusLabel(status) {
  return {
    NOT_OPEN: "Sin abrir",
    OPEN: "Abierta",
    CLOSED: "Cerrada",
  }[status] ?? status;
}

export function VeedorMonitorPage() {
  const eventContext = useAdminEvent();
  const [events, setEvents] = useState([]);
  const [localEventId, setEventId] = useState("");
  const eventId = eventContext?.activeEventId ?? localEventId;
  const [localNightId, setLocalNightId] = useState("");
  const nightId = eventContext?.activeNightId ?? localNightId;
  const chooseNight = eventContext?.setActiveNightId ?? setLocalNightId;
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  // Navegación por pestañas del panel Veedor (Capítulo V)
  const [activeTab, setActiveTab] = useState("resumen"); // "resumen" | "jurados" | "planillas" | "incidencias" | "custodia"

  // Datos detallados de supervisión
  const [judges, setJudges] = useState([]);
  const [ballots, setBallots] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [custody, setCustody] = useState([]);
  const [pendingOfflineIncidents, setPendingOfflineIncidents] = useState([]);

  // Modales de incidencias y custodia
  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [incidentForm, setIncidentForm] = useState({
    incidentType: "UNSCORED_ITEM",
    description: "",
    eventTroupeId: "",
    judgeProfileId: "",
    ballotId: "",
  });
  const [submittingIncident, setSubmittingIncident] = useState(false);
  const [incidentActionError, setIncidentActionError] = useState("");

  const [resolvingIncident, setResolvingIncident] = useState(null);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [submittingResolution, setSubmittingResolution] = useState(false);

  const [custodyModalBallot, setCustodyModalBallot] = useState(null);
  const [custodyNotes, setCustodyNotes] = useState("");
  const [submittingCustody, setSubmittingCustody] = useState(false);

  // Filtro de estado de incidencias
  const [incidentFilter, setIncidentFilter] = useState("ALL");

  // Spec 022: Estado de conexión en tiempo real (RF-191, RF-193)
  const [, setConnectionMode] = useState("connecting");
  const [anomalies, setAnomalies] = useState([]);

  const eventSourceRef = useRef(null);
  const mountedRef = useRef(true);
  const requestSequenceRef = useRef(0);
  const activeEventIdRef = useRef(eventId);
  const activeNightIdRef = useRef(nightId);
  const eventContextRef = useRef(Boolean(eventContext));
  const activeTabRef = useRef(activeTab);

  activeEventIdRef.current = eventId;
  activeNightIdRef.current = nightId;
  eventContextRef.current = Boolean(eventContext);
  activeTabRef.current = activeTab;

  const loadTabDetails = useCallback(async (tab, eId, nId) => {
    if (!eId || !nId || tab === "resumen") return;
    try {
      if (tab === "jurados") {
        const res = await apiRequest(`/api/v1/monitor/events/${eId}/nights/${nId}/judges`);
        if (mountedRef.current && Array.isArray(res) && (res.length === 0 || res[0]?.judgeProfileId)) {
          setJudges(res);
        }
      } else if (tab === "planillas") {
        const res = await apiRequest(`/api/v1/monitor/events/${eId}/nights/${nId}/ballots`);
        if (mountedRef.current && Array.isArray(res) && (res.length === 0 || res[0]?.ballotId)) {
          setBallots(res);
        }
      } else if (tab === "incidencias") {
        const res = await apiRequest(`/api/v1/monitor/events/${eId}/nights/${nId}/incidents`);
        if (mountedRef.current && Array.isArray(res) && (res.length === 0 || res[0]?.incidentType)) {
          setIncidents(res);
        }
      } else if (tab === "custodia") {
        const res = await apiRequest(`/api/v1/monitor/events/${eId}/nights/${nId}/custody`);
        if (mountedRef.current && Array.isArray(res) && (res.length === 0 || res[0]?.integrityStatus)) {
          setCustody(res);
        }
      }
    } catch {
      // Si falla la carga de detalles no bloquea el dashboard
    }
  }, []);

  const refresh = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    const requestedEventId = activeEventIdRef.current;
    const requestId = ++requestSequenceRef.current;
    try {
      const nextEvents = await apiRequest("/api/v1/monitor/events");
      if (!mountedRef.current || requestId !== requestSequenceRef.current || requestedEventId !== activeEventIdRef.current) return;
      setEvents(nextEvents);
      setMessage("");
      setLastUpdated(new Date());

      let currentEventId = requestedEventId;
      if (!eventContextRef.current) {
        setEventId((current) => {
          const resolved = nextEvents.some((event) => event.id === current) ? current : nextEvents[0]?.id ?? "";
          currentEventId = resolved;
          return resolved;
        });
      }

      const activeEvent = nextEvents.find((e) => e.id === currentEventId);
      const activeNight = activeEvent?.nights?.find((n) => n.id === activeNightIdRef.current) ?? activeEvent?.nights?.[0];

      if (activeEvent?.id && activeNight?.id) {
        setPendingOfflineIncidents(getPendingIncidents(activeEvent.id, activeNight.id));
        if (activeTabRef.current !== "resumen") {
          void loadTabDetails(activeTabRef.current, activeEvent.id, activeNight.id);
        }
      }
    } catch {
      if (!mountedRef.current || requestId !== requestSequenceRef.current || requestedEventId !== activeEventIdRef.current) return;
      setMessage("No se pudo cargar la supervisión. Intentá actualizar nuevamente.");
    } finally {
      if (mountedRef.current && requestId === requestSequenceRef.current) setLoading(false);
    }
  }, [loadTabDetails]);

  // Carga inicial y escucha de visibilidad
  useEffect(() => {
    mountedRef.current = true;
    void refresh();

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      mountedRef.current = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refresh]);

  // Gestión de conexión SSE con fallback automático a polling (RF-191, RF-193)
  useEffect(() => {
    let fallbackInterval = null;
    let reconnectTimer = null;

    const connectSSE = () => {
      if (typeof window.EventSource !== "function") {
        setConnectionMode("polling");
        return;
      }

      try {
        const es = new window.EventSource("/api/v1/monitor/stream");
        eventSourceRef.current = es;

        es.addEventListener("connected", () => {
          if (!mountedRef.current) return;
          setConnectionMode("live");
        });

        es.addEventListener("monitor_update", (e) => {
          if (!mountedRef.current) return;
          try {
            const data = JSON.parse(e.data);
            if (data.type === "CLOSE_ATTEMPT_INCOMPLETE") {
              const pendingText = data.pendingCount ? `${data.pendingCount} planilla(s)` : "planillas";
              setAnomalies((prev) => [
                {
                  id: String(Date.now()),
                  message: `Intento de cierre de votación bloqueado: aún hay ${pendingText} pendientes.`,
                  timestamp: data.timestamp || new Date().toISOString(),
                },
                ...prev,
              ]);
            }
          } catch {
            // Evento no JSON o malformado
          }
          void refresh();
        });

        es.onerror = () => {
          if (!mountedRef.current) return;
          setConnectionMode("polling");
          es.close();
          eventSourceRef.current = null;

          reconnectTimer = window.setTimeout(() => {
            if (mountedRef.current) connectSSE();
          }, RECONNECT_INTERVAL_MS);
        };
      } catch {
        if (mountedRef.current) setConnectionMode("polling");
      }
    };

    connectSSE();

    fallbackInterval = window.setInterval(() => {
      void refresh();
    }, POLLING_MS);

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (fallbackInterval) window.clearInterval(fallbackInterval);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
    };
  }, [refresh]);

  const selectedEvent = events.find((event) => event.id === eventId);
  const nights = selectedEvent?.nights ?? [];
  const selectedNight = nights.find((night) => night.id === nightId) ?? nights[0];
  const total = selectedNight?.total ?? 0;
  const submitted = selectedNight?.counts?.SUBMITTED ?? 0;
  const progress = total > 0 ? Math.round((submitted / total) * 100) : 0;

  useEffect(() => {
    if (selectedEvent && !nights.some((night) => night.id === nightId)) {
      chooseNight(nights[0]?.id ?? "");
    }
  }, [eventId, nightId, nights, selectedEvent, chooseNight]);

  useEffect(() => {
    if (activeTab !== "resumen" && selectedEvent?.id && selectedNight?.id) {
      void loadTabDetails(activeTab, selectedEvent.id, selectedNight.id);
    }
    if (selectedEvent?.id && selectedNight?.id) {
      setPendingOfflineIncidents(getPendingIncidents(selectedEvent.id, selectedNight.id));
    }
  }, [activeTab, selectedEvent?.id, selectedNight?.id, loadTabDetails]);

  const dismissAnomaly = (id) => {
    setAnomalies((prev) => prev.filter((a) => a.id !== id));
  };

  // Enviar reporte de incidencia con soporte offline
  const handleCreateIncident = async (e) => {
    e.preventDefault();
    if (!incidentForm.description.trim()) {
      setIncidentActionError("La descripción de la incidencia es obligatoria.");
      return;
    }

    setSubmittingIncident(true);
    setIncidentActionError("");

    const incidentPayload = {
      incidentType: incidentForm.incidentType,
      description: incidentForm.description.trim(),
      eventTroupeId: incidentForm.eventTroupeId || null,
      judgeProfileId: incidentForm.judgeProfileId || null,
      ballotId: incidentForm.ballotId || null,
    };

    try {
      if (!navigator.onLine) {
        savePendingIncident(selectedEvent.id, selectedNight.id, incidentPayload);
        setPendingOfflineIncidents(getPendingIncidents(selectedEvent.id, selectedNight.id));
        setShowIncidentModal(false);
        setIncidentForm({ incidentType: "UNSCORED_ITEM", description: "", eventTroupeId: "", judgeProfileId: "", ballotId: "" });
        return;
      }

      await apiRequest(`/api/v1/monitor/events/${selectedEvent.id}/nights/${selectedNight.id}/incidents`, {
        method: "POST",
        body: JSON.stringify(incidentPayload),
      });

      setShowIncidentModal(false);
      setIncidentForm({ incidentType: "UNSCORED_ITEM", description: "", eventTroupeId: "", judgeProfileId: "", ballotId: "" });
      void refresh();
    } catch {
      // En caso de fallo de red, respaldar localmente
      savePendingIncident(selectedEvent.id, selectedNight.id, incidentPayload);
      setPendingOfflineIncidents(getPendingIncidents(selectedEvent.id, selectedNight.id));
      setShowIncidentModal(false);
      setIncidentForm({ incidentType: "UNSCORED_ITEM", description: "", eventTroupeId: "", judgeProfileId: "", ballotId: "" });
    } finally {
      setSubmittingIncident(false);
    }
  };

  // Sincronizar incidencias guardadas offline
  const handleSyncOffline = async () => {
    if (!selectedEvent?.id || !selectedNight?.id) return;
    await syncPendingIncidents(selectedEvent.id, selectedNight.id, apiRequest);
    setPendingOfflineIncidents(getPendingIncidents(selectedEvent.id, selectedNight.id));
    void refresh();
  };

  // Actualizar estado de una incidencia
  const handleUpdateIncidentStatus = async (incidentId, nextStatus) => {
    try {
      await apiRequest(`/api/v1/monitor/events/${selectedEvent.id}/incidents/${incidentId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      void refresh();
    } catch {
      setMessage("No se pudo actualizar el estado de la incidencia.");
    }
  };

  // Resolver formalmente una incidencia con notas obligatorias
  const handleConfirmResolution = async (e) => {
    e.preventDefault();
    if (!resolutionNotes.trim()) {
      setIncidentActionError("Se requiere detallar la subsanación o resolución según el reglamento.");
      return;
    }

    setSubmittingResolution(true);
    setIncidentActionError("");

    try {
      await apiRequest(`/api/v1/monitor/events/${selectedEvent.id}/incidents/${resolvingIncident.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "RESOLVED",
          resolutionNotes: resolutionNotes.trim(),
        }),
      });

      setResolvingIncident(null);
      setResolutionNotes("");
      void refresh();
    } catch {
      setIncidentActionError("No se pudo registrar la resolución de la incidencia.");
    } finally {
      setSubmittingResolution(false);
    }
  };

  // Recepción de custodia de planilla
  const handleConfirmCustody = async (e) => {
    e.preventDefault();
    if (!custodyModalBallot) return;

    setSubmittingCustody(true);
    try {
      await apiRequest(
        `/api/v1/monitor/events/${selectedEvent.id}/nights/${selectedNight.id}/ballots/${custodyModalBallot.ballotId}/custody`,
        {
          method: "POST",
          body: JSON.stringify({ notes: custodyNotes.trim() || null }),
        },
      );

      setCustodyModalBallot(null);
      setCustodyNotes("");
      void refresh();
    } catch {
      setMessage("Error al registrar la custodia de la planilla.");
    } finally {
      setSubmittingCustody(false);
    }
  };

  const filteredIncidents = incidents.filter((inc) => {
    if (incidentFilter === "ALL") return true;
    return inc.status === incidentFilter;
  });

  return (
    <PageShell layer="instrument" className="container monitor-page">
      <header className="monitor-header">
        <div>
          <p className="eyebrow">Supervisión operativa</p>
          <h1>Supervisión de la jornada</h1>
          <p className="monitor-header-desc">Monitoreo en tiempo real del progreso de votación por jornada.</p>
        </div>
        <div className="monitor-header-actions">
          {lastUpdated && (
            <p className="monitor-updated">
              <span className="monitor-updated-dot" aria-hidden="true" />
              Actualizado{" "}
              {lastUpdated.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </p>
          )}
        </div>
      </header>

      {/* Banner de anomalías operativas (RF-194) */}
      {anomalies.length > 0 && (
        <section className="anomaly-alert-container" aria-label="Alertas operativas">
          {anomalies.map((anomaly) => (
            <aside
              key={anomaly.id}
              className="anomaly-alert-banner"
              role="alert"
              aria-live="assertive"
            >
              <div className="anomaly-alert-content">
                <span className="anomaly-alert-icon" aria-hidden="true">
                  ⚠️
                </span>
                <div>
                  <strong>Alerta operativa</strong>
                  <p>{anomaly.message}</p>
                </div>
              </div>
              <button
                type="button"
                className="app-button app-button-secondary app-button-md"
                onClick={() => dismissAnomaly(anomaly.id)}
                aria-label="Descartar alerta"
              >
                Descartar
              </button>
            </aside>
          ))}
        </section>
      )}

      {message && (
        <p className="feedback" role="alert">
          {message}
        </p>
      )}
      {loading && <SkeletonLoader variant="cards" rows={3} label="Cargando supervisión…" />}
      {!loading && events.length === 0 && !message && (
        <section className="empty-state">
          <h2>Sin actividad de votación</h2>
          <p>
            Todavía no hay noches competitivas con planillas o una ventana de
            votación registrada.
          </p>
        </section>
      )}
      {!loading && eventContext?.activeEventId && !selectedEvent && events.length > 0 && (
        <p>El evento seleccionado todavía no tiene actividad de votación.</p>
      )}

      {events.length > 0 && (
        <>
          {!eventContext && events.length > 1 && (
            <section
              className="monitor-selectors"
              aria-label="Seleccionar actividad"
            >
              <label>
                Evento
                <select
                  value={eventId}
                  onChange={(event) => {
                    setEventId(event.target.value);
                    setLocalNightId("");
                  }}
                >
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.name}
                    </option>
                  ))}
                </select>
              </label>
            </section>
          )}

          {nights.length > 1 && (
            <nav className="monitor-night-tabs" aria-label="Jornadas competitivas">
              {nights.map((night) => (
                <button
                  key={night.id}
                  type="button"
                  className={`monitor-night-tab ${night.id === selectedNight?.id ? "is-active" : ""}`}
                  onClick={() => chooseNight(night.id)}
                  aria-pressed={night.id === selectedNight?.id}
                >
                  {night.name}
                </button>
              ))}
            </nav>
          )}

          {selectedNight ? (
            <>
              <section className="monitor-night-heading">
                <div className="monitor-night-info">
                  <p className="eyebrow">{selectedEvent.name}</p>
                  <h2>{selectedNight.name}</h2>
                  <p className="monitor-night-meta">
                    Estado de la jornada: {selectedNight.status === "OPEN" ? "Abierta" : selectedNight.status === "CLOSED" ? "Cerrada" : selectedNight.status ?? "Sin información"} · Ventana de votación: {votingStatusLabel(selectedNight.votingStatus)}
                  </p>
                </div>
                <span
                  className={`monitor-status monitor-status-${selectedNight.votingStatus.toLowerCase()}`}
                >
                  {votingStatusLabel(selectedNight.votingStatus)}
                </span>
              </section>

              {/* Navegación por pestañas del panel Veedor (Capítulo V) */}
              <nav className="monitor-tabs-nav" role="tablist" aria-label="Secciones de supervisión">
                <button
                  type="button"
                  role="tab"
                  id="tab-resumen"
                  aria-controls="panel-resumen"
                  aria-selected={activeTab === "resumen"}
                  className={`monitor-tab-btn ${activeTab === "resumen" ? "is-active" : ""}`}
                  onClick={() => setActiveTab("resumen")}
                >
                  <span>📊 Resumen</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  id="tab-jurados"
                  aria-controls="panel-jurados"
                  aria-selected={activeTab === "jurados"}
                  className={`monitor-tab-btn ${activeTab === "jurados" ? "is-active" : ""}`}
                  onClick={() => setActiveTab("jurados")}
                >
                  <span>⚖️ Jurados</span>
                  {judges.length > 0 && <span className="monitor-tab-badge">{judges.length}</span>}
                </button>
                <button
                  type="button"
                  role="tab"
                  id="tab-planillas"
                  aria-controls="panel-planillas"
                  aria-selected={activeTab === "planillas"}
                  className={`monitor-tab-btn ${activeTab === "planillas" ? "is-active" : ""}`}
                  onClick={() => setActiveTab("planillas")}
                >
                  <span>📋 Planillas</span>
                  {ballots.length > 0 && <span className="monitor-tab-badge">{ballots.length}</span>}
                </button>
                <button
                  type="button"
                  role="tab"
                  id="tab-incidencias"
                  aria-controls="panel-incidencias"
                  aria-selected={activeTab === "incidencias"}
                  className={`monitor-tab-btn ${activeTab === "incidencias" ? "is-active" : ""}`}
                  onClick={() => setActiveTab("incidencias")}
                >
                  <span>🚨 Incidencias</span>
                  {(incidents.length > 0 || pendingOfflineIncidents.length > 0) && (
                    <span className="monitor-tab-badge">{incidents.length + pendingOfflineIncidents.length}</span>
                  )}
                </button>
                <button
                  type="button"
                  role="tab"
                  id="tab-custodia"
                  aria-controls="panel-custodia"
                  aria-selected={activeTab === "custodia"}
                  className={`monitor-tab-btn ${activeTab === "custodia" ? "is-active" : ""}`}
                  onClick={() => setActiveTab("custodia")}
                >
                  <span>🔐 Custodia</span>
                  {custody.length > 0 && <span className="monitor-tab-badge">{custody.length}</span>}
                </button>
              </nav>

              {/* Panel 1: Resumen */}
              {activeTab === "resumen" && (
                <div id="panel-resumen" role="tabpanel" aria-labelledby="tab-resumen">
                  <section
                    className="monitor-counts"
                    aria-label="Conteos de planillas"
                    aria-live="polite"
                  >
                    {countCards.map(([key, label]) => (
                      <div className={`monitor-count-card monitor-count-${key.toLowerCase()}`} key={key}>
                        <span>{label}</span>
                        <strong>{selectedNight.counts?.[key] ?? 0}</strong>
                      </div>
                    ))}
                    <div className="monitor-count-card monitor-count-total">
                      <span>Total votante</span>
                      <strong>{total}</strong>
                    </div>
                  </section>

                  <section
                    className="monitor-progress"
                    aria-label="Progreso de confirmación"
                  >
                    <div className="monitor-progress-card">
                      <div className="monitor-progress-header">
                        <span className="monitor-progress-title">Confirmación de planillas</span>
                        <strong className="monitor-progress-percent">{progress}%</strong>
                      </div>
                      <div
                        className="progress-track"
                        role="progressbar"
                        aria-valuenow={progress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label="Porcentaje de planillas confirmadas"
                      >
                        <span style={{ inlineSize: `${progress}%` }} />
                      </div>
                      <p className="monitor-progress-detail">
                        {submitted} de {total} planillas confirmadas
                      </p>
                    </div>
                  </section>
                </div>
              )}

              {/* Panel 2: Jurados */}
              {activeTab === "jurados" && (
                <div id="panel-jurados" role="tabpanel" aria-labelledby="tab-jurados">
                  <div className="monitor-section-header">
                    <h3>Supervisión de Jurados ({judges.length})</h3>
                  </div>

                  {judges.length === 0 ? (
                    <section className="empty-state">
                      <p>No hay jurados asignados para esta jornada todavía.</p>
                    </section>
                  ) : (
                    <div className="monitor-card-grid">
                      {judges.map((j) => (
                        <div key={j.judgeProfileId} className="monitor-card">
                          <div>
                            <div className="monitor-card-header">
                              <div>
                                <h4 className="monitor-card-title">{j.judgeName}</h4>
                                <p className="monitor-card-subtitle">{j.judgeEmail}</p>
                              </div>
                              <span className="monitor-badge monitor-badge-open">
                                {j.specialtyName}
                              </span>
                            </div>

                            <div style={{ marginBlock: "var(--space-2)" }}>
                              <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                                Rol: {j.assignmentType === "PRIMARY" ? "Titular" : "Suplente"} · Planilla:{" "}
                                <strong style={{ color: "var(--text-primary)" }}>
                                  {j.ballotStatus === "OPEN" ? "En carga" : j.ballotStatus === "SUBMITTED" ? "Confirmada" : "Sin iniciar"}
                                </strong>
                              </p>
                            </div>
                          </div>

                          <div style={{ marginBlockStart: "var(--space-3)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-xs)", marginBlockEnd: "var(--space-1)" }}>
                              <span>Evaluaciones</span>
                              <strong>{j.progress}%</strong>
                            </div>
                            <div className="progress-track" role="progressbar" aria-valuenow={j.progress} aria-valuemin={0} aria-valuemax={100}>
                              <span style={{ inlineSize: `${j.progress}%` }} />
                            </div>
                            <p style={{ margin: "var(--space-1) 0 0 0", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                              {j.resolvedScores} de {j.totalScores} rubros resueltos
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Panel 3: Planillas */}
              {activeTab === "planillas" && (
                <div id="panel-planillas" role="tabpanel" aria-labelledby="tab-planillas">
                  <div className="monitor-section-header">
                    <h3>Supervisión de Planillas y Evaluaciones ({ballots.length})</h3>
                  </div>

                  {ballots.length === 0 ? (
                    <section className="empty-state">
                      <p>No hay planillas registradas para esta jornada.</p>
                    </section>
                  ) : (
                    <div className="monitor-table-wrap">
                      <table className="monitor-table">
                        <thead>
                          <tr>
                            <th>Especialidad / Jurado</th>
                            <th>Comparsas evaluadas</th>
                            <th>Rubros calificados</th>
                            <th>Estado planilla</th>
                            <th>Custodia</th>
                            <th>Acción</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ballots.map((b) => (
                            <tr key={b.ballotId}>
                              <td>
                                <strong>{b.specialtyName}</strong>
                                <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{b.judgeName}</div>
                              </td>
                              <td>
                                {b.troupes && b.troupes.length > 0 ? (
                                  <ul style={{ margin: 0, paddingInlineStart: "var(--space-3)", fontSize: "var(--text-xs)" }}>
                                    {b.troupes.map((t) => (
                                      <li key={t.troupeId}>
                                        {t.troupeName} ({t.scoredItems + t.absentItems}/{t.totalItems})
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <span style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>Sin comparsas</span>
                                )}
                              </td>
                              <td>
                                <div>
                                  <strong>{b.scoredItems}</strong> / {b.totalItems}
                                  {b.absentItems > 0 && (
                                    <span style={{ color: "var(--warning-text)", fontSize: "var(--text-xs)", marginInlineStart: "var(--space-1)" }}>
                                      ({b.absentItems} ausentes)
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td>
                                <span className={`monitor-badge ${b.ballotStatus === "SUBMITTED" ? "monitor-badge-submitted" : "monitor-badge-open"}`}>
                                  {b.ballotStatus === "SUBMITTED" ? "Confirmada" : "En carga"}
                                </span>
                              </td>
                              <td>
                                {b.custodyStatus ? (
                                  <span className="monitor-badge monitor-badge-verified">
                                    🛡️ Recibida
                                  </span>
                                ) : (
                                  <span className="monitor-badge monitor-badge-open">
                                    Pendiente
                                  </span>
                                )}
                              </td>
                              <td>
                                {b.ballotStatus === "SUBMITTED" && !b.custodyStatus && (
                                  <button
                                    type="button"
                                    className="app-button app-button-primary app-button-sm"
                                    onClick={() => {
                                      setCustodyModalBallot(b);
                                      setCustodyNotes("");
                                    }}
                                  >
                                    Recibir custodia
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Panel 4: Incidencias */}
              {activeTab === "incidencias" && (
                <div id="panel-incidencias" role="tabpanel" aria-labelledby="tab-incidencias">
                  <div className="monitor-section-header">
                    <div>
                      <h3>Gestión de Incidencias Operativas</h3>
                      <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                        Registro reglamentario auditado de anomalías, omisiones y problemas de sincronización.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="app-button app-button-primary app-button-md"
                      onClick={() => {
                        setIncidentActionError("");
                        setShowIncidentModal(true);
                      }}
                    >
                      + Registrar Incidencia
                    </button>
                  </div>

                  {/* Banner de incidencias pendientes de sincronización offline */}
                  {pendingOfflineIncidents.length > 0 && (
                    <div className="monitor-offline-banner">
                      <div>
                        <strong>Hay {pendingOfflineIncidents.length} incidencia(s) guardadas localmente sin sincronizar.</strong>
                        <p style={{ margin: 0, fontSize: "var(--text-xs)" }}>Se sincronizarán cuando se restablezca la conexión con el corsódromo.</p>
                      </div>
                      <button
                        type="button"
                        className="app-button app-button-secondary app-button-sm"
                        onClick={handleSyncOffline}
                      >
                        Sincronizar ahora
                      </button>
                    </div>
                  )}

                  {/* Filtro de estado */}
                  <div style={{ display: "flex", gap: "var(--space-2)", marginBlock: "var(--space-3)", flexWrap: "wrap" }}>
                    {["ALL", "OPEN", "NOTIFIED", "IN_SUBSANATION", "RESOLVED"].map((st) => (
                      <button
                        key={st}
                        type="button"
                        className={`app-button app-button-sm ${incidentFilter === st ? "app-button-primary" : "app-button-secondary"}`}
                        onClick={() => setIncidentFilter(st)}
                      >
                        {st === "ALL" ? "Todas" : INCIDENT_STATUS_LABELS[st] ?? st}
                      </button>
                    ))}
                  </div>

                  {filteredIncidents.length === 0 && pendingOfflineIncidents.length === 0 ? (
                    <section className="empty-state">
                      <p>No hay incidencias registradas con el filtro seleccionado.</p>
                    </section>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                      {/* Incidencias pendientes offline */}
                      {pendingOfflineIncidents.map((inc) => (
                        <div key={inc.operationId} className="monitor-card" style={{ borderColor: "var(--palette-highlight)" }}>
                          <div className="monitor-card-header">
                            <div>
                              <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
                                <span className="monitor-badge monitor-badge-warning">Pendiente sincronización</span>
                                <h4 className="monitor-card-title">{INCIDENT_TYPE_LABELS[inc.incidentType] ?? inc.incidentType}</h4>
                              </div>
                              <p className="monitor-card-subtitle">Registrado en dispositivo local</p>
                            </div>
                          </div>
                          <p style={{ margin: "var(--space-2) 0", fontSize: "var(--text-sm)" }}>{inc.description}</p>
                        </div>
                      ))}

                      {/* Incidencias del servidor */}
                      {filteredIncidents.map((inc) => (
                        <div key={inc.id} className="monitor-card">
                          <div className="monitor-card-header">
                            <div>
                              <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
                                <span className={`monitor-badge ${inc.status === "RESOLVED" ? "monitor-badge-submitted" : inc.status === "OPEN" ? "monitor-badge-danger" : "monitor-badge-warning"}`}>
                                  {INCIDENT_STATUS_LABELS[inc.status] ?? inc.status}
                                </span>
                                <h4 className="monitor-card-title">{INCIDENT_TYPE_LABELS[inc.incidentType] ?? inc.incidentType}</h4>
                              </div>
                              <p className="monitor-card-subtitle">
                                Reportado por {inc.reportedByName} · {new Date(inc.createdAt).toLocaleString()}
                              </p>
                            </div>

                            <div style={{ display: "flex", gap: "var(--space-2)" }}>
                              {inc.troupeName && <span className="monitor-badge monitor-badge-open">{inc.troupeName}</span>}
                              {inc.specialtyName && <span className="monitor-badge monitor-badge-open">{inc.specialtyName}</span>}
                            </div>
                          </div>

                          <p style={{ margin: "var(--space-2) 0", fontSize: "var(--text-sm)", color: "var(--text-primary)" }}>
                            {inc.description}
                          </p>

                          {inc.status === "RESOLVED" && inc.resolutionNotes && (
                            <div style={{ background: "var(--surface-sunken)", padding: "var(--space-3)", borderRadius: "var(--radius-md)", marginBlock: "var(--space-2)" }}>
                              <p style={{ margin: 0, fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--palette-confirm)" }}>
                                Resuelto por {inc.resolvedByName} el {new Date(inc.resolvedAt).toLocaleString()}:
                              </p>
                              <p style={{ margin: "var(--space-1) 0 0 0", fontSize: "var(--text-sm)" }}>{inc.resolutionNotes}</p>
                            </div>
                          )}

                          {inc.status !== "RESOLVED" && (
                            <div style={{ display: "flex", gap: "var(--space-2)", marginBlockStart: "var(--space-3)", justifyContent: "flex-end" }}>
                              {inc.status === "OPEN" && (
                                <button
                                  type="button"
                                  className="app-button app-button-secondary app-button-sm"
                                  onClick={() => handleUpdateIncidentStatus(inc.id, "NOTIFIED")}
                                >
                                  Notificar jurado
                                </button>
                              )}
                              {inc.status !== "IN_SUBSANATION" && (
                                <button
                                  type="button"
                                  className="app-button app-button-secondary app-button-sm"
                                  onClick={() => handleUpdateIncidentStatus(inc.id, "IN_SUBSANATION")}
                                >
                                  Iniciar subsanación
                                </button>
                              )}
                              <button
                                type="button"
                                className="app-button app-button-primary app-button-sm"
                                onClick={() => {
                                  setResolvingIncident(inc);
                                  setResolutionNotes("");
                                  setIncidentActionError("");
                                }}
                              >
                                Resolver con acta
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Panel 5: Custodia */}
              {activeTab === "custodia" && (
                <div id="panel-custodia" role="tabpanel" aria-labelledby="tab-custodia">
                  <div className="monitor-section-header">
                    <div>
                      <h3>Custodia Oficial de Planillas y Actas</h3>
                      <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                        Registro inmutable con verificación criptográfica SHA-256 conforme al Capítulo V del Reglamento.
                      </p>
                    </div>
                  </div>

                  {custody.length === 0 ? (
                    <section className="empty-state">
                      <p>Todavía no se han recibido planillas en custodia para esta jornada.</p>
                    </section>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                      {custody.map((c) => (
                        <div key={c.ballotId} className="monitor-card">
                          <div className="monitor-card-header">
                            <div>
                              <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
                                <span
                                  className={`monitor-badge ${
                                    c.integrityStatus === "VERIFIED"
                                      ? "monitor-badge-verified"
                                      : c.integrityStatus === "PENDING_CUSTODY"
                                      ? "monitor-badge-warning"
                                      : c.integrityStatus === "PENDING_SUBMISSION"
                                      ? "monitor-badge-open"
                                      : "monitor-badge-danger"
                                  }`}
                                >
                                  {c.integrityStatus === "VERIFIED"
                                    ? "🛡️ INTEGRIDAD VERIFICADA"
                                    : c.integrityStatus === "PENDING_CUSTODY"
                                    ? "PENDIENTE DE CUSTODIA"
                                    : c.integrityStatus === "PENDING_SUBMISSION"
                                    ? "EN VOTACIÓN"
                                    : "ANOMALÍA DETECTADA"}
                                </span>
                                <h4 className="monitor-card-title">{c.specialtyName} — {c.judgeName}</h4>
                              </div>
                              <p className="monitor-card-subtitle">
                                {c.custodyStatus
                                  ? `Recibida formalmente por ${c.receivedByName || "Veedor"} el ${new Date(c.receivedAt).toLocaleString()}`
                                  : c.ballotStatus === "SUBMITTED"
                                  ? "Planilla confirmada por el jurado. Pendiente de recepción formal por veeduría."
                                  : "El jurado se encuentra evaluando la jornada (votación en curso)."}
                              </p>
                            </div>

                            {c.ballotStatus === "SUBMITTED" && !c.custodyStatus && (
                              <button
                                type="button"
                                className="app-button app-button-primary app-button-sm"
                                onClick={() => {
                                  setCustodyModalBallot(c);
                                  setCustodyNotes("");
                                }}
                              >
                                Recibir en custodia
                              </button>
                            )}
                          </div>

                          {c.canonicalHash && (
                            <div style={{ marginBlock: "var(--space-2)" }}>
                              <p style={{ margin: "0 0 var(--space-1) 0", fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--text-muted)" }}>
                                Hash canónico SHA-256 de las puntuaciones:
                              </p>
                              <code className="monitor-hash-code">{c.canonicalHash}</code>
                            </div>
                          )}

                          {c.custodyNotes && (
                            <p style={{ margin: "var(--space-1) 0 0 0", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                              Observaciones: {c.custodyNotes}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <section className="empty-state">
              <h2>Sin noches activas</h2>
              <p>Este evento todavía no tiene actividad de votación para supervisar.</p>
            </section>
          )}
        </>
      )}

      {/* Modal: Registrar Incidencia */}
      {showIncidentModal && (
        <div className="monitor-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-incident-title">
          <div className="monitor-modal">
            <h3 id="modal-incident-title">Registrar Incidencia Reglamentaria</h3>
            {incidentActionError && (
              <p className="feedback" role="alert" style={{ margin: 0 }}>
                {incidentActionError}
              </p>
            )}
            <form onSubmit={handleCreateIncident} className="monitor-modal-form">
              <label>
                Tipo de incidencia reglamentaria
                <select
                  value={incidentForm.incidentType}
                  onChange={(e) => setIncidentForm({ ...incidentForm, incidentType: e.target.value })}
                >
                  {Object.entries(INCIDENT_TYPE_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Comparsa involucrada (opcional)
                <select
                  value={incidentForm.eventTroupeId}
                  onChange={(e) => setIncidentForm({ ...incidentForm, eventTroupeId: e.target.value })}
                >
                  <option value="">-- No especifica / General --</option>
                  {ballots
                    .flatMap((b) => b.troupes || [])
                    .filter((v, i, a) => a.findIndex((t) => t.troupeId === v.troupeId) === i)
                    .map((t) => (
                      <option key={t.troupeId} value={t.troupeId}>
                        {t.troupeName}
                      </option>
                    ))}
                </select>
              </label>

              <label>
                Jurado involucrado (opcional)
                <select
                  value={incidentForm.judgeProfileId}
                  onChange={(e) => setIncidentForm({ ...incidentForm, judgeProfileId: e.target.value })}
                >
                  <option value="">-- No especifica / General --</option>
                  {judges.map((j) => (
                    <option key={j.judgeProfileId} value={j.judgeProfileId}>
                      {j.judgeName} ({j.specialtyName})
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Descripción de la anomalía o incumplimiento
                <textarea
                  rows={4}
                  required
                  placeholder="Detallar claramente lo observado conforme a las normas del Carnaval..."
                  value={incidentForm.description}
                  onChange={(e) => setIncidentForm({ ...incidentForm, description: e.target.value })}
                />
              </label>

              <div className="monitor-modal-actions">
                <button
                  type="button"
                  className="app-button app-button-secondary app-button-md"
                  onClick={() => setShowIncidentModal(false)}
                  disabled={submittingIncident}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="app-button app-button-primary app-button-md"
                  disabled={submittingIncident}
                >
                  {submittingIncident ? "Guardando…" : "Registrar incidencia"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Resolver Incidencia con Acta */}
      {resolvingIncident && (
        <div className="monitor-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-resolve-title">
          <div className="monitor-modal">
            <h3 id="modal-resolve-title">Resolver Incidencia con Acta</h3>
            <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
              Incidencia: {INCIDENT_TYPE_LABELS[resolvingIncident.incidentType]} — {resolvingIncident.description}
            </p>
            {incidentActionError && (
              <p className="feedback" role="alert" style={{ margin: 0 }}>
                {incidentActionError}
              </p>
            )}
            <form onSubmit={handleConfirmResolution} className="monitor-modal-form">
              <label>
                Notas de resolución y referencia al acta reglamentaria
                <textarea
                  rows={4}
                  required
                  placeholder="Detalle la subsanación realizada, número de acta o decisión tomada..."
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                />
              </label>
              <div className="monitor-modal-actions">
                <button
                  type="button"
                  className="app-button app-button-secondary app-button-md"
                  onClick={() => setResolvingIncident(null)}
                  disabled={submittingResolution}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="app-button app-button-primary app-button-md"
                  disabled={submittingResolution}
                >
                  {submittingResolution ? "Registrando…" : "Confirmar resolución"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Recibir en custodia */}
      {custodyModalBallot && (
        <div className="monitor-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-custody-title">
          <div className="monitor-modal">
            <h3 id="modal-custody-title">Recepción Formal en Custodia</h3>
            <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
              Planilla de <strong>{custodyModalBallot.specialtyName}</strong> ({custodyModalBallot.judgeName}). Al recibirla, el sistema calculará el sello criptográfico SHA-256 de todas las evaluaciones bloqueadas.
            </p>
            <form onSubmit={handleConfirmCustody} className="monitor-modal-form">
              <label>
                Observaciones de recepción (opcional)
                <textarea
                  rows={3}
                  placeholder="Ej: Planilla recibida conforme y firmada en mesa central..."
                  value={custodyNotes}
                  onChange={(e) => setCustodyNotes(e.target.value)}
                />
              </label>
              <div className="monitor-modal-actions">
                <button
                  type="button"
                  className="app-button app-button-secondary app-button-md"
                  onClick={() => setCustodyModalBallot(null)}
                  disabled={submittingCustody}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="app-button app-button-primary app-button-md"
                  disabled={submittingCustody}
                >
                  {submittingCustody ? "Sellando…" : "Confirmar custodia y sellar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageShell>
  );
}
