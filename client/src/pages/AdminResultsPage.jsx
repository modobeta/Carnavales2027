import { useEffect, useMemo, useRef, useState } from "react";
import { PageShell } from "../components/PageShell.jsx";
import { apiRequest } from "../api/http.js";
import { CeremonialDrawModal } from "../features/results/CeremonialDrawModal.jsx";
import { SkeletonLoader } from "../components/SkeletonLoader.jsx";
import { useSession } from "../auth/session-context.jsx";
import { useAdminEvent } from "../context/AdminEventContext.jsx";

function nameFor(troupes, id) {
  return troupes.find((troupe) => troupe.id === id)?.name ?? id;
}

export function AdminResultsPage() {
  const session = useSession();
  const adminEvent = useAdminEvent();
  const canRelease = session?.roles?.some((role) => ["SCRUTINEER", "ESCRIBANO"].includes(role));
  const [localEvents, setLocalEvents] = useState([]);
  const [localEventId, setLocalEventId] = useState("");
  const [troupes, setTroupes] = useState([]);
  const [result, setResult] = useState(null);
  const [tie, setTie] = useState(null);
  const [drawResult, setDrawResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [releaseAvailable, setReleaseAvailable] = useState(false);
  const [releaseBlocked, setReleaseBlocked] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [releasing, setReleasing] = useState(false);
  const drawTriggerRef = useRef(null);
  const events = adminEvent?.events ?? localEvents;
  const eventId = adminEvent?.activeEventId ?? localEventId;

  useEffect(() => {
    if (adminEvent) return undefined;
    let active = true;
    void apiRequest("/api/v1/results/events").then((items) => {
      if (!active) return;
       setLocalEvents(items);
       setLocalEventId(items[0]?.id ?? "");
    }).catch(() => {
      if (active) {
        setLocalEvents([]);
        setLocalEventId("");
        setLoading(false);
        setMessage("No se pudieron cargar las competencias. Verificá que la API esté disponible y tu sesión siga activa.");
      }
    });
    return () => { active = false; };
  }, [adminEvent]);

  useEffect(() => {
    if (!eventId) return undefined;
    let active = true;
    setLoading(true);
    setResult(null);
    setTie(null);
    setDrawResult(null);
    setReleaseAvailable(false);
    setReleaseBlocked(false);
    setMessage("");

    void Promise.allSettled([
      apiRequest(`/api/v1/results/events/${eventId}/troupes`),
      apiRequest(`/api/v1/events/${eventId}/results`),
    ]).then(async ([troupesResponse, resultsResponse]) => {
      if (!active) return;
      if (troupesResponse.status === "fulfilled") setTroupes(troupesResponse.value);
      else setTroupes([]);
      if (resultsResponse.status === "fulfilled") {
        setResult(resultsResponse.value);
        setTie(null);
      } else if (resultsResponse.reason?.code === "RESULTS_NOT_RELEASED") {
        setReleaseAvailable(true);
      } else if (resultsResponse.reason?.code === "TIE_BREAKER_REQUIRES_MANUAL_DRAW") {
        const details = resultsResponse.reason.details ?? {};
        setTie({
          remainingTroupeIds: details.remainingTroupeIds ?? [],
          context: details.tieBreakerContext ?? {},
        });
        setMessage("Empate pendiente: los criterios 1 y 2 no definieron una ganadora.");
        try {
          const draw = await apiRequest(`/api/v1/events/${eventId}/tie-breaker/ceremonial-draw`);
          if (active) setDrawResult(draw);
        } catch (error) {
          if (error.code !== "TIE_BREAKER_DRAW_NOT_FOUND" && active) {
            setMessage("No se pudo recuperar el resultado del sorteo ceremonial.");
          }
        }
      } else {
        setMessage("No se pudieron cargar los resultados.");
      }
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [eventId, refreshVersion]);

  const release = async () => {
    if (!eventId || releasing) return;
    setReleasing(true);
    setMessage("");
    try {
      await apiRequest(`/api/v1/events/${eventId}/results/release`, { method: "POST" });
      adminEvent?.updateEvent({ id: eventId, resultsReleased: true });
      setRefreshVersion((version) => version + 1);
    } catch (error) {
      if (error?.code === "RESULTS_RELEASE_FORBIDDEN_FOR_ADMIN") {
        setMessage("La liberación oficial de resultados corresponde a Escrutinio o Escribanía; el Administrador no puede liberarlos.");
      } else if (error?.code === "RESULTS_NOT_READY") {
        setReleaseBlocked(true);
        setMessage("El servidor todavía no permite publicar. Revisá los requisitos y volvé a intentar.");
      } else {
        setMessage("No se pudieron liberar los resultados.");
      }
    } finally {
      setReleasing(false);
    }
  };

  const tiedNames = useMemo(
    () => (tie?.remainingTroupeIds ?? []).map((id) => ({ id, name: nameFor(troupes, id) })),
    [tie, troupes],
  );
  const selectedEvent = adminEvent?.activeEvent ?? events.find((event) => event.id === eventId);
  const workflowSteps = [
    { label: "Revisar resultados", state: result || releaseAvailable ? "done" : "current" },
    { label: "Publicar", state: result ? "done" : releaseAvailable ? "current" : "locked" },
    { label: "Resolver empate", state: result && !tie ? "skipped" : drawResult ? "done" : tie ? "current" : "locked" },
    { label: "Emitir acta", state: result && (!tie || drawResult) ? "current" : "locked" },
  ];

  return (
    <PageShell layer="instrument" className="admin-shell results-page">
      <header className="event-header">
        <div>
          <p className="eyebrow">Escrutinio</p>
          <h1>Resultados</h1>
          <p className="results-page-summary">Revisá los resultados, publicalos y después emití el acta.</p>
        </div>
         {!adminEvent && <label>Competencia
           <select value={eventId} onChange={(event) => setLocalEventId(event.target.value)}>
             {events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
           </select>
         </label>}
      </header>

      {message && <p className={`feedback${releaseBlocked ? " feedback-warning" : ""}`} role="status" aria-live="polite">{message}</p>}
      {loading && <SkeletonLoader variant="table" rows={4} label="Cargando resultados…" />}
      {!loading && selectedEvent && (
        <>
           <section className="config-section results-intro">
            <p className="eyebrow">{selectedEvent.name}</p>
            <h2>{result ? "Resultados publicados" : releaseBlocked ? "Falta completar la votación" : releaseAvailable ? "Publicación pendiente" : "Preparación de resultados"}</h2>
            {!releaseBlocked && <p>{result ? "El consolidado ya está disponible para consulta." : releaseAvailable ? "La publicación todavía no se confirmó. Revisá los requisitos antes de continuar." : "Cuando la votación esté cerrada y las planillas completas, vas a poder continuar desde acá."}</p>}
            {releaseAvailable && (
              canRelease ? (
                <button type="button" onClick={release} disabled={releasing}>
                  {releasing ? "Publicando resultados…" : "Publicar resultados"}
                </button>
              ) : (
                <p className="admin-release-notice" role="note">
                  Para publicar, necesitás ingresar con una cuenta habilitada de Escrutinio o Escribanía y completar la verificación en dos pasos.
                </p>
              )
            )}
           </section>

           <ol className="workflow-stepper" aria-label="Flujo de escrutinio">
             {workflowSteps.map((step, index) => <li className={`workflow-step workflow-step-${step.state}`} key={step.label} aria-current={step.state === "current" ? "step" : undefined}>
               <span className="workflow-step-number" aria-hidden="true">{index + 1}</span>
               <div><strong>{step.label}</strong><span className="sr-only">{step.state === "done" ? "Listo" : step.state === "current" ? "En curso" : step.state === "skipped" ? "No requerido" : "Pendiente"}</span></div>
             </li>)}
           </ol>

           {!result && (
             <section className="release-conditions-card" aria-label="Condiciones para liberación de resultados">
               <h3>Antes de publicar</h3>
               <ul className="release-conditions-list">
                 <li>
                   <span className="condition-bullet" aria-hidden="true">1</span>
                   <span>La votación de todas las jornadas debe estar cerrada.</span>
                 </li>
                 <li>
                   <span className="condition-bullet" aria-hidden="true">2</span>
                   <span>Todas las planillas deben estar completas.</span>
                 </li>
                 <li>
                   <span className="condition-bullet" aria-hidden="true">3</span>
                   <span>No debe quedar ninguna calificación pendiente.</span>
                 </li>
               </ul>
             </section>
           )}

           {tie && (
            <section className="tie-breaker-panel" aria-labelledby="tie-breaker-title">
              <div>
                <p className="eyebrow">Criterio 3</p>
                <h2 id="tie-breaker-title">Empate pendiente</h2>
                <p>El sorteo ceremonial debe ejecutarse entre las comparsas que siguen empatadas.</p>
              </div>
              <ul className="tie-breaker-pool" aria-label="Comparsas empatadas">
                {tiedNames.map((troupe) => <li key={troupe.id}><strong>{troupe.name}</strong><span>Rubros ganados: {tie.context.wonRubricsCounts?.find((item) => item.troupeId === troupe.id)?.wonRubrics ?? "—"}</span></li>)}
              </ul>
              {drawResult ? (
                <p className="results-winner" role="status">Ganadora: <strong>{nameFor(troupes, drawResult.winnerTroupeId)}</strong></p>
              ) : (
                <button ref={drawTriggerRef} type="button" onClick={() => setModalOpen(true)}>Iniciar sorteo ceremonial</button>
              )}
            </section>
          )}

          {result && (
            <section className="results-ranking" aria-labelledby="results-ranking-title">
              <div className="section-heading">
                <div>
                  <h2 id="results-ranking-title">Ranking general</h2>
                  <p>Solo rubros nominativos participan en Mejor Comparsa.</p>
                </div>
              </div>
              <div className="results-table" role="table" aria-label="Ranking general de comparsas">
                <div className="results-header-row" role="row">
                  <span role="columnheader">Puesto</span>
                  <span role="columnheader">Comparsa</span>
                  <span role="columnheader" className="results-num-col">Puntaje bruto</span>
                  <span role="columnheader" className="results-num-col">Penalizaciones</span>
                  <span role="columnheader" className="results-num-col">Puntaje final neto</span>
                </div>
                {result.overallRanking.map((troupe) => {
                  const gross = troupe.grossScore ?? troupe.totalScore ?? 0;
                  const penalties = troupe.totalPenalties ?? troupe.penaltyPoints ?? 0;
                  const net = troupe.netScore ?? troupe.totalScore ?? Math.max(0, gross - penalties);
                  return (
                    <div className="results-row" role="row" key={troupe.troupeId}>
                      <span role="cell" className="results-rank">#{troupe.rank}</span>
                      <strong role="cell" className="results-troupe-name">{troupe.troupeName}</strong>
                      <span role="cell" className="results-col-gross" data-label="Puntaje bruto">{gross} pts</span>
                      <span role="cell" className="results-col-penalties" data-label="Penalizaciones">
                        {penalties > 0 ? `−${penalties} pts` : "0 pts"}
                      </span>
                      <span role="cell" className="results-col-net" data-label="Puntaje final neto">{net} pts</span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
          {result && (
            <section className="official-record-banner" aria-label="Acta Oficial">
              <div>
                <h3>Acta Notarial Oficial</h3>
                <p>Emisión formal, sellado de integridad digital y firmas de autoridades y delegados.</p>
              </div>
              <a className="button-link" href={`#/admin/record?eventId=${encodeURIComponent(eventId)}`}>
                📜 Ver / Emitir Acta Oficial →
              </a>
            </section>
          )}
        </>
      )}
      {modalOpen && tie && <CeremonialDrawModal
        eventId={eventId}
        remainingTroupeIds={tie.remainingTroupeIds}
        tiedTroupeNames={tiedNames}
        triggerRef={drawTriggerRef}
        onClose={() => setModalOpen(false)}
        onResolved={setDrawResult}
      />}
    </PageShell>
  );
}
