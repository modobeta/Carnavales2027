import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "../api/http.js";
import { ConfirmDialog } from "../components/ConfirmDialog.jsx";
import {
  createPendingEventOpenOperation,
  readPendingEventOpenOperation,
  reconcilePendingEventOpenOperation,
  resolvePendingEventOpenOperation,
} from "./event-open-operation.js";
import { eventAdminReadinessItems, isInterpretableReadiness } from "./readiness-presentation.js";
import { useEventAdminRejection } from "../auth/useEventAdminRejection.js";

const READINESS_LABELS = {
  COMPETITION_NIGHT: "Creá al menos una jornada de Competencia",
  ACTIVE_TROUPE: "Creá o activá al menos una comparsa",
  ACTIVE_SPECIALTY: "Creá o activá al menos una especialidad",
  ACTIVE_RUBRIC: "Creá o activá al menos un rubro",
  INCOMPLETE_TROUPES: "Asigná una categoría activa a cada comparsa activa",
  INCOMPLETE_RUBRICS: "Agregá ítems puntuables y usá especialidades activas en cada rubro",
  INCOMPLETE_NOMINATIONS: "Completá las nominaciones requeridas para las comparsas programadas",
  INCOMPLETE_SCHEDULES: "Programá al menos una comparsa en cada jornada de Competencia",
  NIGHTS_WITHOUT_JURY: "Asigná al menos un jurado activo a cada jornada de Competencia",
};

// eventAdminMode (spec 040, CA-5.2b): bloqueos clasificados, sin apertura ni operación pendiente
// (GET /open-operations es solo ADMIN y la operación guardada pertenece a quien la inició).
export function EventReadinessPanel({ event, locked, onOpened, onGoToNights, refreshKey = 0, eventAdminMode = false }) {
  const [readinessSnapshot, setReadinessSnapshot] = useState({ eventId: null, data: null });
  const [readinessUnavailable, setReadinessUnavailable] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [checkingOperation, setCheckingOperation] = useState(false);
  const [pendingOperation, setPendingOperation] = useState(() => eventAdminMode ? null : readPendingEventOpenOperation(event.id));
  const [opened, setOpened] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const openTriggerRef = useRef(null);
  const openingRef = useRef(false);
  const requestRevision = useRef(0);
  const handleRejection = useEventAdminRejection(eventAdminMode);

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
    } catch (error) {
      if (isCurrent() && revision === requestRevision.current) {
        setReadinessUnavailable(true);
        void handleRejection(error, event.id);
      }
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
        ? "No se pudo abrir el evento porque cambió la configuración. Estos son los requisitos que faltan ahora."
        : result.code === "EVENT_LOCKED"
          ? "El evento ya no está disponible para abrir. Revisá su estado."
          : "No se pudo abrir el evento.");
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
          ? "No encontramos el intento de apertura. Resultado no confirmado; consultalo antes de volver a intentarlo."
          : result.status === "pending"
            ? "El intento de apertura sigue pendiente. Resultado no confirmado; consultalo antes de volver a intentarlo."
            : result.status === "conflict"
              ? "No se pudo verificar el intento original. Resultado no confirmado; consultalo antes de continuar."
              : "No se pudo consultar el resultado de apertura. Resultado no confirmado; consultalo antes de continuar.");
      }
    } finally {
      if (isCurrent()) setCheckingOperation(false);
    }
  }

  useEffect(() => {
    let current = true;
    const storedOperation = eventAdminMode ? null : readPendingEventOpenOperation(event.id);
    setPendingOperation(storedOperation);
    setOpened(false);
    if (storedOperation) {
      setMessage("Hay un intento de apertura con resultado no confirmado. Consultá su resultado antes de continuar.");
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
    setMessage("Abriendo el evento…");
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
        setMessage("La respuesta no confirma si el evento se abrió. Resultado no confirmado; consultalo antes de volver a intentarlo.");
      }
    } catch (error) {
      const receipt = error?.details?.operation ?? error?.operation;
      const matchingTerminal = operation && receipt?.operationId === operation.operationId
        && receipt?.eventId === event.id && receipt?.intent === "OPEN_EVENT" && receipt?.status === "rejected";
      if (matchingTerminal) {
        finishOperation({ status: "rejected", code: error.code ?? error.details?.code, details: error.details?.details ?? error.details }, operation);
      } else {
        setPendingOperation(readPendingEventOpenOperation(event.id) ?? operation);
        setMessage("No se pudo confirmar si el evento se abrió. Resultado no confirmado; consultalo antes de volver a intentarlo.");
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
        <h2>Requisitos para abrir el evento</h2>
      </div>
      {readiness && eventAdminMode && (
        <>
          <div className="readiness-summary">
            {readiness.ready
              ? <p className="readiness-ok">Se cumplen los requisitos. La apertura la realiza el administrador general.</p>
              : <p className="readiness-pending">{eventAdminReadinessItems(readiness).length > 0 ? `Requisitos pendientes para abrir: ${eventAdminReadinessItems(readiness).length}.` : "Hay requisitos pendientes para abrir."}</p>}
          </div>
          <ul className="readiness-checklist">
            {eventAdminReadinessItems(readiness).map((item) => (
              <li key={item.key} className="readiness-fail">
                <span className="readiness-icon">&#x2717;</span>
                {item.text}{" "}
                {item.resolvableHere && onGoToNights && <button type="button" className="secondary" onClick={onGoToNights}>Ir al problema</button>}
              </li>
            ))}
          </ul>
        </>
      )}
      {readiness && !eventAdminMode && (
        <>
          <div className="readiness-summary">
            {readiness.ready ? (
              <p className="readiness-ok">Se cumplen los requisitos. El evento está listo para abrir.</p>
            ) : (
              <p className="readiness-pending">Requisitos pendientes para abrir: {(readiness.missing ?? []).filter((code) => !["INCOMPLETE_SCHEDULES", "INCOMPLETE_NOMINATIONS", "NIGHTS_WITHOUT_JURY"].includes(code)).length + (readiness.incompleteTroupes?.length ?? 0) + (readiness.incompleteRubrics?.length ?? 0) + (readiness.incompleteSchedules?.length ?? 0) + (readiness.incompleteNominations?.length ?? 0) + (readiness.nightsWithoutJury?.length ?? 0)}.</p>
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
              <li key={troupe.id} className="readiness-fail"><span className="readiness-icon">&#x2717;</span>La comparsa &ldquo;{troupe.name}&rdquo; necesita una categoría activa. <a href="#/admin/competencia">Corregir comparsa</a></li>
            ))}
            {(readiness.incompleteRubrics ?? []).map((rubric) => (
              <li key={rubric.id} className="readiness-fail"><span className="readiness-icon">&#x2717;</span>El rubro &ldquo;{rubric.name}&rdquo; necesita ítems puntuables y especialidades activas. <a href="#/admin/competencia">Corregir rubro</a></li>
            ))}
            {(readiness.incompleteSchedules ?? []).map((schedule) => (
              <li key={schedule.nightId} className="readiness-fail"><span className="readiness-icon">&#x2717;</span>Programá al menos una comparsa en la jornada &ldquo;{schedule.nightName}&rdquo;. <a href="#/admin/competencia">Configurar el orden de salida</a></li>
            ))}
            {(readiness.incompleteNominations ?? []).map((item) => (
              <li key={`${item.rubricId}-${item.troupeId}`} className="readiness-fail"><span className="readiness-icon">&#x2717;</span>Cargá al menos un participante para el rubro &ldquo;{item.rubricName}&rdquo; en &ldquo;{item.troupeName}&rdquo;. <a href="#/admin/competencia">Cargar participante</a></li>
            ))}
            {(readiness.nightsWithoutJury ?? []).map((night) => (
              <li key={night.nightId} className="readiness-fail"><span className="readiness-icon">&#x2717;</span>Asigná al menos un jurado activo a la jornada &ldquo;{night.nightName}&rdquo;. <a href={`#/admin/assignments?eventId=${encodeURIComponent(event.id)}&nightId=${encodeURIComponent(night.nightId)}`}>Asignar jurado</a></li>
            ))}
            {readiness.ready && (
              <>
                <li className="readiness-ok-item"><span className="readiness-icon">&#x2713;</span> Jornadas de competencia configuradas</li>
                <li className="readiness-ok-item"><span className="readiness-icon">&#x2713;</span> Comparsas activas</li>
                <li className="readiness-ok-item"><span className="readiness-icon">&#x2713;</span> Especialidades activas</li>
                <li className="readiness-ok-item"><span className="readiness-icon">&#x2713;</span> Rubros activos con items validos</li>
                <li className="readiness-ok-item"><span className="readiness-icon">&#x2713;</span> Nominaciones requeridas completas</li>
                <li className="readiness-ok-item"><span className="readiness-icon">&#x2713;</span> Orden de pasada configurado en las jornadas de competencia</li>
              </>
            )}
          </ul>
          {!eligible && <p role="status">El evento ya no está en preparación y no se puede abrir desde aquí.</p>}
          <button ref={openTriggerRef} className="danger-action" disabled={!canOpen} onClick={() => setConfirmOpen(true)}>
            {opening ? "Abriendo…" : "Abrir evento"}
          </button>
          <ConfirmDialog
            isOpen={confirmOpen}
            onClose={() => setConfirmOpen(false)}
            onConfirm={() => void open()}
            title="Abrir evento"
            description={`Vas a abrir el evento «${event.name ?? "Evento"}» y su estado cambiará a OPEN. Esto no inicia una jornada ni habilita la votación. Después, las asignaciones de jurados que todavía no tengan una planilla confirmada podrán revocarse o reemplazarse. ¿Querés continuar?`}
            confirmLabel="Abrir evento"
            confirming={opening}
            danger
            focusReturnRef={openTriggerRef}
          />
        </>
      )}
      {loading && <p role="status">Revisando los requisitos para abrir…</p>}
      {!loading && !readiness && readinessUnavailable && <p role="status">No se pudo revisar la configuración. No podemos confirmar si el evento está listo.</p>}
      {!loading && readinessUnavailable && <button type="button" className="secondary" onClick={() => void load()}>Volver a revisar</button>}
      <p role="status" aria-live="polite">{message}</p>
      {!eventAdminMode && pendingOperation && (
        <button type="button" className="secondary" disabled={checkingOperation || opening} onClick={() => void checkOperation()}>
          {checkingOperation ? "Consultando operación…" : "Consultar resultado de apertura"}
        </button>
      )}
      {!eventAdminMode && opened && <p><a href="#/admin/voting">Ir a Control de votación</a> para abrir una jornada y, por separado, su ventana de votación.</p>}
    </section>
  );
}
