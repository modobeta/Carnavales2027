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
import { IncompleteNominationsSummary } from "./IncompleteNominationsSummary.jsx";

const READINESS_LABELS = {
  COMPETITION_NIGHT: ["Creá al menos una jornada de Competencia", "#/admin/events"],
  ACTIVE_TROUPE: ["Creá o activá al menos una comparsa", "#/admin/competencia?step=participantes"],
  ACTIVE_SPECIALTY: ["Creá o activá al menos una especialidad", "#/admin/competencia?step=especialidades"],
  ACTIVE_RUBRIC: ["Creá o activá al menos un rubro", "#/admin/competencia?step=catalogo"],
  INCOMPLETE_TROUPES: ["Asigná una categoría activa a cada comparsa activa", "#/admin/competencia?step=participantes"],
  INCOMPLETE_RUBRICS: ["Agregá ítems puntuables y usá especialidades activas en cada rubro", "#/admin/competencia?step=rubros"],
  INCOMPLETE_NOMINATIONS: ["Completá las nominaciones requeridas para las comparsas programadas", "#/admin/competencia?step=participantes"],
  INCOMPLETE_SCHEDULES: ["Programá al menos una comparsa en cada jornada de Competencia", "#/admin/competencia?step=participantes"],
};

export function EventReadinessPanel({ event, locked, onOpened, onGoToNights, onGoToNightAssignments, onReadinessChange, refreshKey = 0 }) {
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
    onReadinessChange?.({ eventId: event.id, data: null });
    try {
      const nextReadiness = await apiRequest(`/api/v1/events/${encodeURIComponent(event.id)}/readiness`);
      if (isCurrent() && revision === requestRevision.current) {
        if (isInterpretableReadiness(nextReadiness)) {
          setReadinessSnapshot({ eventId: event.id, data: nextReadiness });
          setReadinessUnavailable(false);
          onReadinessChange?.({ eventId: event.id, data: nextReadiness });
        } else {
          setReadinessUnavailable(true);
          onReadinessChange?.({ eventId: event.id, data: null });
        }
      }
    } catch (error) {
      if (isCurrent() && revision === requestRevision.current) {
        setReadinessUnavailable(true);
        onReadinessChange?.({ eventId: event.id, data: null });
      }
    } finally {
      if (isCurrent() && revision === requestRevision.current) setLoading(false);
    }
  }, [event.id, onReadinessChange]);

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
    const storedOperation = readPendingEventOpenOperation(event.id);
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
    <section className="config-section readiness-panel" aria-label="Requisitos para abrir el evento">
      <div className="section-heading">
        <h2>Preparar y comenzar</h2>
      </div>
      {readiness && (
        <>
          <div className="readiness-summary">
            {event.status === "OPEN" || opened ? (
              <p className="readiness-ok">La competencia está abierta. Ya podés continuar con la puesta en marcha por jornada.</p>
            ) : event.status === "CLOSED" ? (
              <p className="readiness-pending">El evento está finalizado y no se puede abrir.</p>
            ) : !eligible ? (
              <p className="readiness-pending">El evento no está disponible para abrir.</p>
            ) : readiness.ready ? (
              <p className="readiness-ok">Se cumplen los requisitos. El evento está listo para abrir.</p>
            ) : (
              <p className="readiness-pending">Requisitos pendientes para abrir: {(readiness.missing ?? []).filter((code) => !["INCOMPLETE_SCHEDULES", "INCOMPLETE_NOMINATIONS", "NIGHTS_WITHOUT_JURY"].includes(code)).length + (readiness.incompleteTroupes?.length ?? 0) + (readiness.incompleteRubrics?.length ?? 0) + (readiness.incompleteSchedules?.length ?? 0) + (readiness.incompleteNominations?.length ?? 0)}.</p>
            )}
          </div>
          <ul className="readiness-checklist">
            {(readiness.missing ?? []).filter((code) => code !== "INCOMPLETE_NOMINATIONS" || readiness.incompleteNominations.length === 0).map((code) => (
              <li key={code} className="readiness-fail">
                <span className="readiness-icon">&#x2717;</span>
                {(Array.isArray(READINESS_LABELS[code]) ? READINESS_LABELS[code][0] : READINESS_LABELS[code]) ?? code}{" "}
                {code === "COMPETITION_NIGHT" && onGoToNights ? (
                  <button type="button" className="secondary" onClick={onGoToNights}>Ir al problema</button>
                ) : (
                  <a href={Array.isArray(READINESS_LABELS[code]) ? READINESS_LABELS[code][1] : "#/admin/competencia?step=revision"}>Ir al problema</a>
                )}
              </li>
            ))}
            {(readiness.incompleteTroupes ?? []).map((troupe) => (
              <li key={troupe.id} className="readiness-fail"><span className="readiness-icon">&#x2717;</span>La comparsa &ldquo;{troupe.name}&rdquo; necesita una categoría activa. <a href="#/admin/competencia?step=participantes">Corregir comparsa</a></li>
            ))}
            {(readiness.incompleteRubrics ?? []).map((rubric) => (
              <li key={rubric.id} className="readiness-fail"><span className="readiness-icon">&#x2717;</span>El rubro &ldquo;{rubric.name}&rdquo; necesita ítems puntuables y especialidades activas. <a href="#/admin/competencia?step=rubros">Corregir evaluación</a></li>
            ))}
            {(readiness.incompleteSchedules ?? []).map((schedule) => (
              <li key={schedule.nightId} className="readiness-fail"><span className="readiness-icon">&#x2717;</span>Programá al menos una comparsa en la jornada &ldquo;{schedule.nightName}&rdquo;. <a href="#/admin/competencia?step=participantes">Configurar el orden de salida</a></li>
            ))}
            {(readiness.incompleteNominations ?? []).length > 0 && (
              <li className="readiness-fail readiness-nominations-item">
                <span className="readiness-icon" aria-hidden="true">&#x2717;</span>
                <IncompleteNominationsSummary nominations={readiness.incompleteNominations} />
              </li>
            )}
            {(readiness.nightsWithoutJury ?? []).map((night) => (
              <li key={night.nightId} className="readiness-pending">
                <span className="readiness-icon">&#x25cf;</span>
                La jornada &ldquo;{night.nightName}&rdquo; todavía no tiene jurados. Podés prepararlos desde{" "}
                <a
                  href="#/admin/events"
                  aria-label="Preparar jurados en Jornadas"
                  onClick={(clickEvent) => {
                    if (!onGoToNightAssignments) return;
                    clickEvent.preventDefault();
                    onGoToNightAssignments(night.nightId);
                  }}
                >Jornadas</a>.
              </li>
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
          {event.status === "CONFIGURING" && <button ref={openTriggerRef} className="danger-action" disabled={!canOpen} onClick={() => setConfirmOpen(true)}>
            {opening ? "Abriendo…" : "Abrir evento"}
          </button>}
          <ConfirmDialog
            isOpen={confirmOpen}
            onClose={() => setConfirmOpen(false)}
            onConfirm={() => void open()}
            title="Abrir evento"
            description={`Vas a abrir el evento «${event.name ?? "Evento"}» y su estado cambiará a OPEN. Esto no inicia una jornada ni habilita la votación. Las asignaciones de jurados se preparan desde Jornadas; después, Control de votación permite abrir cada jornada y su votación. Las asignaciones sin planilla confirmada todavía podrán revocarse o reemplazarse desde Jornadas. ¿Querés continuar?`}
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
      {pendingOperation && (
        <button type="button" className="secondary" disabled={checkingOperation || opening} onClick={() => void checkOperation()}>
          {checkingOperation ? "Consultando operación…" : "Consultar resultado de apertura"}
        </button>
      )}
      {(event.status === "OPEN" || opened) && <div className="readiness-summary" role="status">
        <p>La competencia está abierta. El siguiente paso es elegir una jornada y habilitar su votación; el estado de cada jornada y su ventana se conserva por separado.</p>
        <a className="button-link" href="#/admin/voting">Continuar a Control de votación</a>
      </div>}
      {event.status === "CLOSED" && <p className="readiness-summary" role="status">El evento está finalizado.</p>}
    </section>
  );
}
