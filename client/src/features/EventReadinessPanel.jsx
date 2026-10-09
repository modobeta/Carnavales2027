import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "../api/http.js";
import { ConfirmDialog } from "../components/ConfirmDialog.jsx";
import {
  createPendingEventOpenOperation,
  readPendingEventOpenOperation,
  reconcilePendingEventOpenOperation,
  resolvePendingEventOpenOperation,
} from "./event-open-operation.js";
import { isInterpretableReadiness } from "./readiness-presentation.js";

const READINESS_LABELS = {
  COMPETITION_NIGHT: "No existe ninguna jornada de competencia configurada",
  ACTIVE_TROUPE: "No hay comparsas activas registradas",
  ACTIVE_SPECIALTY: "No hay especialidades activas configuradas",
  ACTIVE_RUBRIC: "No existe ningun rubro activo",
  INCOMPLETE_TROUPES: "Existen comparsas sin categoria activa",
  INCOMPLETE_RUBRICS: "Existen rubros sin items puntuables o con especialidades inactivas",
  INCOMPLETE_NOMINATIONS: "Faltan participantes nominados para rubros o comparsas programadas",
  INCOMPLETE_SCHEDULES: "Una o mas jornadas no tienen comparsas programadas en el orden de pasada",
  NIGHTS_WITHOUT_JURY: "Una o más jornadas de competencia no tienen jurado asignado",
};

export function EventReadinessPanel({ event, locked, onOpened, onGoToNights, refreshKey = 0 }) {
  const [readinessSnapshot, setReadinessSnapshot] = useState({ eventId: null, data: null });
  const [readinessUnavailable, setReadinessUnavailable] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [checkingOperation, setCheckingOperation] = useState(false);
  const [pendingOperation, setPendingOperation] = useState(() => readPendingEventOpenOperation(event.id));
  const [opened, setOpened] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const openTriggerRef = useRef(null);
  const openingRef = useRef(false);
  const requestRevision = useRef(0);

  const load = useCallback(async ({ isCurrent = () => true } = {}) => {
    const revision = ++requestRevision.current;
    setLoading(true);
    setReadinessUnavailable(false);
    setReadinessSnapshot({ eventId: event.id, data: null });
    try {
      const nextReadiness = await apiRequest(`/api/v1/events/${encodeURIComponent(event.id)}/readiness`);
      if (isCurrent() && revision === requestRevision.current) {
        if (isInterpretableReadiness(nextReadiness)) {
          setReadinessSnapshot({ eventId: event.id, data: nextReadiness });
          setReadinessUnavailable(false);
        } else {
          setReadinessUnavailable(true);
        }
      }
    } catch {
      if (isCurrent() && revision === requestRevision.current) setReadinessUnavailable(true);
    } finally {
      if (isCurrent() && revision === requestRevision.current) setLoading(false);
    }
  }, [event.id]);

  const readiness = readinessSnapshot.eventId === event.id ? readinessSnapshot.data : null;

  const finishOperation = useCallback((result, reference) => {
    if (result.status === "applied" && result.event?.status === "OPEN") {
      resolvePendingEventOpenOperation(event.id, {
        operationId: reference.operationId, eventId: event.id, intent: "OPEN_EVENT", status: "applied",
      });
      setPendingOperation(null);
      setOpened(true);
      setMessage("El servidor confirmó que el evento está abierto.");
      onOpened?.(result.event);
      return true;
    }
    if (result.status === "rejected") {
      resolvePendingEventOpenOperation(event.id, {
        operationId: reference.operationId, eventId: event.id, intent: "OPEN_EVENT", status: "rejected",
      });
      setPendingOperation(null);
      if (result.code === "EVENT_CONFIGURATION_INCOMPLETE" && isInterpretableReadiness(result.details)) {
        setReadinessSnapshot({ eventId: event.id, data: result.details });
      } else if (result.code === "EVENT_CONFIGURATION_INCOMPLETE") {
        setReadinessSnapshot({ eventId: event.id, data: null });
        setReadinessUnavailable(true);
      }
      setMessage(result.code === "EVENT_CONFIGURATION_INCOMPLETE"
        ? "El servidor rechazó la apertura porque la preparación cambió. Se muestran los bloqueos vigentes."
        : result.code === "EVENT_LOCKED"
          ? "El servidor rechazó la apertura porque el evento ya no es elegible."
          : "El servidor rechazó la apertura del evento.");
      return true;
    }
    return false;
  }, [event.id, onOpened]);

  async function checkOperation({ isCurrent = () => true } = {}) {
    setCheckingOperation(true);
    try {
      const result = await reconcilePendingEventOpenOperation(event.id);
      if (!isCurrent()) return;
      if (result.status === "applied") {
        finishOperation({ status: result.status, event: result.result?.event }, result.operation);
      } else if (result.status === "rejected") {
        finishOperation({ status: result.status, code: result.code, details: result.details }, result.operation);
      } else {
        setPendingOperation(readPendingEventOpenOperation(event.id));
        setMessage(result.status === "not_registered"
          ? "La operación no aparece registrada; resultado no confirmado. Se conserva su identificador y la apertura sigue bloqueada."
          : result.status === "pending"
            ? "La operación sigue pendiente; resultado no confirmado. La apertura sigue bloqueada."
            : result.status === "conflict"
              ? "No se pudo verificar la operación original por un conflicto. Resultado no confirmado; apertura bloqueada."
              : "No se pudo consultar la operación. Resultado no confirmado; apertura bloqueada.");
      }
    } finally {
      if (isCurrent()) setCheckingOperation(false);
    }
  }

  useEffect(() => {
    let current = true;
    const storedOperation = readPendingEventOpenOperation(event.id);
    setPendingOperation(storedOperation);
    setOpened(false);
    if (storedOperation) {
      setMessage("Apertura pendiente: resultado no confirmado. Consultá la operación original antes de continuar.");
      void checkOperation({ isCurrent: () => current });
    }
    void load({ isCurrent: () => current });
    return () => { current = false; };
  // Event changes intentionally reload both readiness and the matching saved operation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, refreshKey, event.id]);

  const open = async () => {
    if (openingRef.current || loading || !isInterpretableReadiness(readiness) || readiness.ready !== true
      || event.status !== "CONFIGURING" || event.active !== true || locked || pendingOperation) return;
    openingRef.current = true;
    requestRevision.current += 1;
    setConfirmOpen(false);
    setOpening(true);
    setMessage("Enviando apertura del evento al servidor…");
    let operation;
    try {
      operation = createPendingEventOpenOperation(event.id);
      setPendingOperation(operation);
      const openedEvent = await apiRequest(`/api/v1/events/${encodeURIComponent(event.id)}/open`, {
        method: "POST",
        headers: { "Idempotency-Key": operation.operationId },
      });
      const receipt = openedEvent?.operation;
      const isMatchingApplied = receipt?.operationId === operation.operationId
        && receipt?.eventId === event.id && receipt?.intent === "OPEN_EVENT"
        && receipt?.status === "applied" && openedEvent?.status === "OPEN";
      if (isMatchingApplied) {
        finishOperation({ status: "applied", event: openedEvent }, operation);
        await load();
      } else {
        setMessage("La respuesta no confirma la operación original. Resultado no confirmado; la apertura sigue bloqueada.");
      }
    } catch (error) {
      const receipt = error?.details?.operation ?? error?.operation;
      const matchingTerminal = operation && receipt?.operationId === operation.operationId
        && receipt?.eventId === event.id && receipt?.intent === "OPEN_EVENT" && receipt?.status === "rejected";
      if (matchingTerminal) {
        finishOperation({ status: "rejected", code: error.code ?? error.details?.code, details: error.details?.details ?? error.details }, operation);
      } else {
        setPendingOperation(readPendingEventOpenOperation(event.id) ?? operation);
        setMessage("No se pudo confirmar la respuesta del servidor. Resultado no confirmado; la apertura sigue bloqueada.");
      }
    } finally {
      openingRef.current = false;
      setOpening(false);
    }
  };

  const eligible = event.status === "CONFIGURING" && event.active === true;
  const canOpen = !loading && isInterpretableReadiness(readiness) && readiness.ready === true
    && eligible && !locked && !pendingOperation && !opening;

  return (
    <section className="config-section readiness-panel">
      <div className="section-heading">
        <h2>Preparacion del evento</h2>
      </div>
      {readiness && (
        <>
          <div className="readiness-summary">
            {readiness.ready ? (
              <p className="readiness-ok">Configuracion completa. El evento esta listo para abrir.</p>
            ) : (
              <p className="readiness-pending">{(readiness.missing ?? []).filter((code) => !["INCOMPLETE_SCHEDULES", "INCOMPLETE_NOMINATIONS"].includes(code)).length + (readiness.incompleteTroupes?.length ?? 0) + (readiness.incompleteRubrics?.length ?? 0) + (readiness.incompleteSchedules?.length ?? 0) + (readiness.incompleteNominations?.length ?? 0)} problema(s) impiden abrir el evento.</p>
            )}
          </div>
          <ul className="readiness-checklist">
            {(readiness.missing ?? []).map((code) => (
              <li key={code} className="readiness-fail">
                <span className="readiness-icon">&#x2717;</span>
                {READINESS_LABELS[code] ?? code}{" "}
                {code === "COMPETITION_NIGHT" && onGoToNights ? (
                  <button type="button" className="secondary" onClick={onGoToNights}>Ir al problema</button>
                ) : (
                  <a href="#/admin/competencia">Ir al problema</a>
                )}
              </li>
            ))}
            {(readiness.incompleteTroupes ?? []).map((troupe) => (
              <li key={troupe.id} className="readiness-fail"><span className="readiness-icon">&#x2717;</span>La comparsa &ldquo;{troupe.name}&rdquo; no tiene categoria activa <a href="#/admin/competencia">Ir al problema</a></li>
            ))}
            {(readiness.incompleteRubrics ?? []).map((rubric) => (
              <li key={rubric.id} className="readiness-fail"><span className="readiness-icon">&#x2717;</span>El rubro &ldquo;{rubric.name}&rdquo; no tiene items puntuables validos <a href="#/admin/competencia">Ir al problema</a></li>
            ))}
            {(readiness.incompleteSchedules ?? []).map((schedule) => (
              <li key={schedule.nightId} className="readiness-fail"><span className="readiness-icon">&#x2717;</span>La jornada &ldquo;{schedule.nightName}&rdquo; no tiene comparsas programadas en el orden de pasada. <a href="#/admin/competencia">Configurar el orden</a></li>
            ))}
            {(readiness.incompleteNominations ?? []).map((item) => (
              <li key={`${item.rubricId}-${item.troupeId}`} className="readiness-fail"><span className="readiness-icon">&#x2717;</span>El rubro &ldquo;{item.rubricName}&rdquo; necesita al menos un participante para &ldquo;{item.troupeName}&rdquo;. <a href="#/admin/competencia">Cargar participante</a></li>
            ))}
            {(readiness.nightsWithoutJury ?? []).map((night) => (
              <li key={night.nightId} className="readiness-fail"><span className="readiness-icon">&#x2717;</span>La jornada &ldquo;{night.nightName}&rdquo; no tiene jurado activo asignado. <a href={`#/admin/assignments?eventId=${encodeURIComponent(event.id)}&nightId=${encodeURIComponent(night.nightId)}`}>Revisar asignaciones</a></li>
            ))}
            {readiness.ready && (
              <>
                <li className="readiness-ok-item"><span className="readiness-icon">&#x2713;</span> Jornadas de competencia configuradas</li>
                <li className="readiness-ok-item"><span className="readiness-icon">&#x2713;</span> Comparsas activas</li>
                <li className="readiness-ok-item"><span className="readiness-icon">&#x2713;</span> Especialidades activas</li>
                <li className="readiness-ok-item"><span className="readiness-icon">&#x2713;</span> Rubros activos con items validos</li>
                <li className="readiness-ok-item"><span className="readiness-icon">&#x2713;</span> Participantes nominados cargados</li>
                <li className="readiness-ok-item"><span className="readiness-icon">&#x2713;</span> Orden de pasada configurado en las jornadas de competencia</li>
              </>
            )}
          </ul>
          {!eligible && <p role="status">El evento no está en estado CONFIGURING y no es elegible para abrir.</p>}
          <button ref={openTriggerRef} className="danger-action" disabled={!canOpen} onClick={() => setConfirmOpen(true)}>
            {opening ? "Abriendo…" : "Abrir evento"}
          </button>
          <ConfirmDialog
            isOpen={confirmOpen}
            onClose={() => setConfirmOpen(false)}
            onConfirm={() => void open()}
            title="Abrir evento"
            description={`Vas a abrir el evento «${event.name ?? "Evento"}» y su estado cambiará a OPEN. Esto no implica que toda su configuración quede bloqueada; se conservan las excepciones administrativas existentes. No abre la jornada ni la ventana de votación. ¿Querés continuar?`}
            confirmLabel="Abrir evento"
            confirming={opening}
            danger
            focusReturnRef={openTriggerRef}
          />
        </>
      )}
      {loading && <p role="status">Consultando readiness oficial del evento…</p>}
      {!loading && !readiness && readinessUnavailable && <p role="status">Readiness no disponible; la preparación no se puede confirmar.</p>}
      {!loading && readinessUnavailable && <button type="button" className="secondary" onClick={() => void load()}>Volver a consultar readiness</button>}
      <p role="status" aria-live="polite">{message}</p>
      {pendingOperation && (
        <button type="button" className="secondary" disabled={checkingOperation || opening} onClick={() => void checkOperation()}>
          {checkingOperation ? "Consultando operación…" : "Consultar resultado de apertura"}
        </button>
      )}
      {opened && <p><a href="#/admin/voting">Ir a Control de votación</a> para abrir una jornada y, por separado, su ventana de votación.</p>}
    </section>
  );
}
