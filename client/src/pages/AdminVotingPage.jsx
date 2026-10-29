import { useEffect, useRef, useState } from "react";
import { PageShell } from "../components/PageShell.jsx";
import { Dialog } from "../components/Dialog.jsx";
import { DialogFooter } from "../components/DialogFooter.jsx";
import { ConfirmDialog } from "../components/ConfirmDialog.jsx";
import { StatusPill } from "../components/StatusPill.jsx";
import { EventStatusBanner } from "../components/EventStatusBanner.jsx";
import { useNotify } from "../components/Notifications.jsx";
import { apiRequest } from "../api/http.js";
import { useAdminEvent } from "../context/AdminEventContext.jsx";
import { AdminAssignmentsPage } from "./AdminAssignmentsPage.jsx";

const BALLOT_STATUS_LABELS = { SUBMITTED: "Confirmada", REOPENED: "Reabierta", OPEN: "En carga" };

export function AdminVotingPage({ initialEventId = "", initialNightId = "" }) {
  const adminEvent = useAdminEvent();
  const { notify } = useNotify();
  const [localEvents, setLocalEvents] = useState([]);
  const [nights, setNights] = useState([]);
  const [ballots, setBallots] = useState([]);
  const [status, setStatus] = useState(null);
  const [localEventId, setLocalEventId] = useState("");
  const [localNightId, setLocalNightId] = useState(initialNightId);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [statusLoading, setStatusLoading] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const actionButtonRef = useRef(null);
  const [pendingCloseDialog, setPendingCloseDialog] = useState(null);
  const [reorderIds, setReorderIds] = useState(null);
  const [reorderReason, setReorderReason] = useState("");
  const [reorderMessage, setReorderMessage] = useState("");
  const [reorderBusy, setReorderBusy] = useState(false);
  const closeButtonRef = useRef(null);
  const events = adminEvent?.events ?? localEvents;
  const eventId = adminEvent?.activeEventId ?? localEventId;
  const nightId = adminEvent?.activeNightId ?? localNightId;
  const chooseNight = adminEvent?.setActiveNightId ?? setLocalNightId;
  const contextRef = useRef("");
  contextRef.current = `${eventId}/${nightId}`;

  const refreshNight = async (selectedEventId = eventId, selectedNightId = nightId) => {
    if (!selectedEventId || !selectedNightId) return;
    const context = `${selectedEventId}/${selectedNightId}`;
    setStatusLoading(true);
    try {
      const [nextStatus, nextBallots] = await Promise.all([
        apiRequest(`/api/v1/events/${selectedEventId}/nights/${selectedNightId}/voting/status`),
        apiRequest(`/api/v1/events/${selectedEventId}/nights/${selectedNightId}/voting/ballots`),
      ]);
      if (contextRef.current !== context) return;
      setStatus(nextStatus);
      setBallots(nextBallots);
    } catch {
      if (contextRef.current !== context) return;
      setStatus(null);
      setBallots([]);
      setMessage("No se pudo cargar el estado de votación.");
    } finally {
      if (contextRef.current === context) setStatusLoading(false);
    }
  };

  useEffect(() => {
    if (adminEvent) {
      if (initialEventId && adminEvent.events.some((event) => event.id === initialEventId)) {
        adminEvent.setActiveEventId(initialEventId);
      }
      return undefined;
    }
    void apiRequest("/api/v1/events").then((items) => {
      setLocalEvents(items);
      const preferred = items.some((event) => event.id === initialEventId) ? initialEventId : items[0]?.id;
      if (preferred) setLocalEventId(preferred);
    }).catch(() => setMessage("No se pudieron cargar los eventos."));
  }, [adminEvent, initialEventId]);

  useEffect(() => {
    setNights([]);
    setStatus(null);
    setBallots([]);
    setStatusLoading(false);
    setConfirmation(null);
    setMessage("");
    if (!eventId) return;
    let active = true;
    void apiRequest(`/api/v1/events/${eventId}/nights`).then((items) => {
      if (!active) return;
      const competitionNights = items.filter((night) => night.kind === "COMPETITION");
      setNights(competitionNights);
       const preferredNightId = competitionNights.some((night) => night.id === initialNightId)
        ? initialNightId
        : competitionNights.some((night) => night.id === adminEvent?.activeNightId)
        ? adminEvent.activeNightId
        : competitionNights[0]?.id ?? "";
      chooseNight(preferredNightId);
      setStatus(null);
      setBallots([]);
    }).catch(() => { if (active) setMessage("No se pudieron cargar las noches del evento."); });
    return () => { active = false; };
  }, [eventId, initialNightId]);

  useEffect(() => { void refreshNight(); }, [eventId, nightId]);

  useEffect(() => {
    setReorderIds(null);
    setReorderReason("");
    setReorderMessage("");
  }, [eventId, nightId]);

  const action = async (key, operation, success) => {
    if (!eventId || !nightId || busy) return false;
    setBusy(key);
    setMessage("");
    try {
      const result = await operation();
      const nextMessage = success(result);
      setMessage(nextMessage);
      await refreshNight();
      notify({ message: nextMessage, type: "success" });
      return true;
    } catch (error) {
      if (error.code === "VOTING_CLOSE_INCOMPLETE_BALLOTS") {
        setPendingCloseDialog((error.details ?? []).map((item) => ({
          id: item.id,
          judgeName: item.judgeName ?? "Jurado",
          troupeName: item.troupeName ?? "Comparsa",
          rubricName: item.rubricName ?? "Rubro",
          itemName: item.name ?? item.code ?? "Ítem pendiente",
        })));
        return false;
      }
      const messages = {
        EVENT_NOT_OPEN: "El evento debe estar abierto para habilitar la votación.",
        NIGHT_NOT_OPEN: "Primero abrí la jornada. Actualizá el estado para ver su situación actual.",
        NIGHT_SCHEDULE_EMPTY: "Programá comparsas en la jornada antes de abrir la votación.",
        NIGHT_CLOSED: "La jornada está cerrada y no se puede reabrir.",
        VOTING_WINDOW_CLOSED: "La ventana de votación está cerrada y no se puede reabrir.",
        VOTING_WINDOW_NOT_OPEN: "La votación todavía no está abierta.",
        NIGHT_WITHOUT_ACTIVE_JURY: "Asigná al menos un jurado titular activo a esta jornada antes de abrirla.",
        VOTING_RELEASE_MODE_LOCKED: "El modo ya no se puede cambiar después de abrir la votación.",
        TROUPE_ALREADY_RELEASED: "Esta comparsa ya fue habilitada.",
        TROUPE_RELEASE_ORDER_REQUIRED: "Habilitá las comparsas en el orden de pasada.",
        ACTIVE_TROUPE_BALLOTS_INCOMPLETE: "No se puede habilitar otra comparsa: todavía hay planillas o ítems pendientes para la comparsa actual.",
        TROUPE_NOT_RELEASED: "Esta comparsa todavía no está habilitada para votar.",
        ALL_TROUPES_NOT_RELEASED: "Abrí nuevamente la votación para habilitar todas las comparsas.",
        EVENT_LOCKED: "El estado del evento o la jornada cambió. Actualizá el estado antes de reintentar.",
        NETWORK_ERROR: "No se recibió confirmación. Actualizá el estado antes de reintentar.",
      };
      const nextMessage = messages[error.code] ?? "No se pudo completar la operación.";
      setMessage(nextMessage);
      notify({ message: nextMessage, type: "error" });
      return false;
    } finally {
      setBusy("");
    }
  };

  const selectedEvent = events.find((event) => event.id === eventId);
  const isEventOpen = selectedEvent?.status === "OPEN";
  const selectedNight = nights.find((night) => night.id === nightId);
  const nightStatus = status?.nightStatus ?? selectedNight?.status;
  const votingStatus = status?.votingStatus ?? "NOT_OPEN";
  const requestConfirmation = (kind, event) => {
    actionButtonRef.current = event.currentTarget;
    setConfirmation(kind);
  };
  const confirmAction = async () => {
    const kind = confirmation;
    setConfirmation(null);
    if (kind === "open") {
      if (nightStatus === "DRAFT") {
        const ok = await action("night", async () => {
          const updated = await apiRequest(`/api/v1/nights/${nightId}`, {
            method: "PATCH",
            body: JSON.stringify({ name: selectedNight.name, displayOrder: selectedNight.displayOrder,
              kind: selectedNight.kind, eventDate: selectedNight.eventDate ?? null, status: "OPEN" }),
          });
          setNights((items) => items.map((item) => item.id === nightId ? updated : item));
          return updated;
        }, () => "Jornada abierta. Abriendo votación...");
        if (!ok) return;
      }
      await action("open", () => apiRequest(`/api/v1/events/${eventId}/nights/${nightId}/voting/open`, { method: "POST" }),
        (result) => `Votación abierta. ${result.ballotsCreated} planilla(s) nueva(s) habilitada(s). Si no hay planillas, revisá que haya un jurado titular activo en esta jornada.`);
    } else if (kind === "close") {
      await action("close", () => apiRequest(`/api/v1/events/${eventId}/nights/${nightId}/voting/close`, { method: "POST" }),
        (result) => `Votación cerrada. ${result.autoSubmitted} planilla(s) confirmada(s) al cerrar.`);
    } else if (kind.startsWith("mode:")) {
      const releaseMode = kind.slice("mode:".length);
      await action("release-mode", () => apiRequest(`/api/v1/events/${eventId}/nights/${nightId}/voting/release-mode`, {
        method: "PATCH", body: JSON.stringify({ releaseMode }),
      }), () => releaseMode === "MANUAL"
        ? "Modo actualizado: habilitar una comparsa por vez."
        : "Modo actualizado: todas las comparsas quedarán habilitadas al abrir la votación.");
    } else if (kind.startsWith("release:")) {
      const scheduleId = kind.slice("release:".length);
      await action("release-troupe", () => apiRequest(`/api/v1/events/${eventId}/nights/${nightId}/voting/release`, {
        method: "POST", body: JSON.stringify({ scheduleId }),
      }), () => "Comparsa habilitada para votar.");
    }
  };
  const runwayTroupes = [...(status?.troupes ?? [])].sort((a, b) => a.presentationOrder - b.presentationOrder);
  const reorderView = reorderIds ?? runwayTroupes.map((troupe) => troupe.scheduleId);
  const frozenThrough = runwayTroupes.reduce(
    (lastStarted, troupe, index) => Number(troupe.resolvedScores) > 0
      || (troupe.status === "IN_RUNWAY" && Number(troupe.totalScores) > 0)
      ? index + 1
      : lastStarted,
    0,
  );

  const moveReorder = (scheduleId, delta) => {
    const base = reorderIds ?? runwayTroupes.map((troupe) => troupe.scheduleId);
    const index = base.indexOf(scheduleId);
    const target = index + delta;
    if (index < frozenThrough || target < frozenThrough || target >= base.length) return;
    const next = [...base];
    [next[index], next[target]] = [next[target], next[index]];
    setReorderIds(next);
  };

  const confirmReorder = async () => {
    if (reorderBusy) return;
    if (!reorderReason.trim()) {
      setReorderMessage("Indicá el motivo del reorden para continuar.");
      return;
    }
    setReorderBusy(true);
    setReorderMessage("");
    try {
      await apiRequest(`/api/v1/events/${eventId}/schedule/reorder`, {
        method: "PATCH",
        body: JSON.stringify({ nightId, orderedIds: reorderView, reason: reorderReason.trim() }),
      });
      setReorderIds(null);
      setReorderReason("");
      setReorderMessage("Orden de pasada actualizado y auditado.");
      notify({ message: "Orden de pasada actualizado y auditado.", type: "success" });
      await refreshNight();
    } catch (error) {
      const messages = {
        REORDER_REASON_REQUIRED: "Indicá el motivo del reorden para continuar.",
        NIGHT_REORDER_STARTED_TROUPES: "No se puede mover el tramo que ya comenzó. Actualizá el estado de pista y reordená solo las comparsas pendientes.",
        ORDER_CONFLICT: "El orden cambió. Recargamos la jornada; revisa antes de reintentar.",
        EVENT_LOCKED: "El evento ya no permite modificar su configuración.",
      };
      if (["ORDER_CONFLICT", "NIGHT_REORDER_STARTED_TROUPES"].includes(error.code)) {
        setReorderIds(null);
        try { await refreshNight(); } catch { /* mensaje ya fijado abajo */ }
      }
      setReorderMessage(messages[error.code] ?? "No se pudo cambiar el orden.");
      notify({ message: messages[error.code] ?? "No se pudo cambiar el orden.", type: "error" });
    } finally {
      setReorderBusy(false);
    }
  };

  return <PageShell layer="instrument" className="admin-shell voting-page">
    <header className="event-header">
      <div><p className="eyebrow">Mesa de control</p><h1>Votación por jornada</h1><p>Evento: <strong>{selectedEvent?.name ?? "Sin evento seleccionado"}</strong></p></div>
      <div className="voting-pickers">
        {!adminEvent && <label>Evento<select disabled={Boolean(busy) || confirmation !== null} value={eventId} onChange={(event) => setLocalEventId(event.target.value)}>{events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}</select></label>}
        <label>Jornada competitiva<select disabled={Boolean(busy) || confirmation !== null} value={nightId} onChange={(event) => { setStatus(null); setBallots([]); setMessage(""); chooseNight(event.target.value); }}>{nights.map((night) => <option key={night.id} value={night.id}>{night.name}</option>)}</select></label>
      </div>
    </header>
    {selectedEvent && <EventStatusBanner status={selectedEvent.status} />}
    <p className="feedback" role="status" aria-live="polite">{message}</p>
    {statusLoading && <p role="status">Consultando el estado de esta jornada…</p>}
    {!statusLoading && !status && nightId && !message && <p role="status">El estado de esta jornada todavía no está disponible. Usá «Actualizar estado» para volver a consultar.</p>}
    {nightId && <>
      <section className="voting-summary" aria-label="Estado de planillas">
        <div><span>En carga</span><strong>{status?.counts.OPEN ?? 0}</strong></div>
        <div><span>Confirmadas</span><strong>{status?.counts.SUBMITTED ?? 0}</strong></div>
        <div><span>Reabiertas</span><strong>{status?.counts.REOPENED ?? 0}</strong></div>
        <div><span>Total</span><strong>{status?.total ?? 0}</strong></div>
      </section>
      {selectedNight && <section className="config-section" aria-label={`Jurados de ${selectedNight.name}`}>
        <div className="section-heading"><div><h2>Jurados de esta jornada</h2><p>Revisá o completá las asignaciones aquí antes de abrir la jornada y su votación.</p></div></div>
        <AdminAssignmentsPage embedded fixedNight initialEventId={eventId} initialNightId={nightId} />
      </section>}
      <section className="config-section">
        <div className="section-heading"><div><h2>Ventana de votación</h2><p>La apertura crea las planillas pendientes. El cierre exige que todas estén completas y confirma las que sigan en carga.</p></div></div>
        <label>Habilitación de comparsas
          <select aria-label="Modo de habilitación de comparsas" value={status?.releaseMode ?? selectedNight?.votingReleaseMode ?? "MANUAL"}
            disabled={Boolean(busy) || votingStatus !== "NOT_OPEN" || !isEventOpen}
            onChange={(event) => requestConfirmation(`mode:${event.target.value}`, event)}>
            <option value="MANUAL">Una comparsa por vez</option>
            <option value="ALL">Todas antes de comenzar</option>
          </select>
        </label>
        <p>{(status?.releaseMode ?? selectedNight?.votingReleaseMode ?? "MANUAL") === "MANUAL"
          ? "La siguiente comparsa solo se habilita cuando todas las planillas de la actual estén completas."
          : "Todas las comparsas se habilitan al abrir; la mesa puede seleccionar cuál está en pista."}</p>
        <p>Estado de la jornada: <strong>{{ DRAFT: "Pendiente de apertura", OPEN: "Abierta", CLOSED: "Cerrada" }[nightStatus] ?? "Consultando"}</strong>. Estado de la ventana de votación: <strong>{!status ? "Consultando" : { NOT_OPEN: "Sin abrir", OPEN: "Abierta", CLOSED: "Cerrada" }[votingStatus]}</strong>.</p>
        {!isEventOpen && <p>Primero abrí el evento desde <a href="#/admin/events">Eventos</a>.</p>}
        {votingStatus === "OPEN" && status?.total === 0 && <p role="alert">La votación está abierta pero no hay planillas. Revisá los <a href={`#/admin/voting?eventId=${encodeURIComponent(eventId)}&nightId=${encodeURIComponent(nightId)}`}>jurados de esta jornada</a> y luego habilitá las planillas pendientes.</p>}
        <div className="event-actions">
          <button type="button" disabled={Boolean(busy) || !status || !isEventOpen || nightStatus === "CLOSED" || votingStatus === "CLOSED"} onClick={(event) => requestConfirmation("open", event)}>{votingStatus === "OPEN" ? "Habilitar planillas pendientes" : nightStatus === "DRAFT" ? "Abrir jornada y votación" : "Abrir votación"}</button>
          <button ref={closeButtonRef} className="danger-action" type="button" disabled={Boolean(busy) || !isEventOpen || votingStatus !== "OPEN"} onClick={(event) => requestConfirmation("close", event)}>Cerrar votación</button>
          <button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => void refreshNight()}>Actualizar estado</button>
        </div>
        {busy && <p role="status">Procesando operación…</p>}
      </section>
      {status?.troupes && status.troupes.length > 0 && (
        <section className="config-section runway-control-section" aria-label="Control de pista y orden de pasada">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Desfile en vivo</p>
              <h2>Control de pista y orden de pasada</h2>
              <p>Monitoreo secuencial del desfile y avance de votación de jurados según orden oficial de salida.</p>
            </div>
            <div className="event-actions">
              <button
                type="button"
                className="refresh-runway-btn"
                disabled={Boolean(busy)}
                onClick={() => void refreshNight()}
                aria-label="Actualizar estado de pista"
              >
                Actualizar pista
              </button>
            </div>
          </div>

          {status.activeTroupe ? (
            <div className="runway-active-card">
              <div className="runway-active-header">
                <div>
                  <span className="runway-order-badge">Salida #{status.activeTroupe.presentationOrder}</span>
                  <h3 className="runway-active-name" style={{ color: status.activeTroupe.brandColor || "inherit" }}>
                    {status.activeTroupe.troupeName}
                  </h3>
                </div>
                <span className="status-pill status-pill-active">EN PISTA</span>
              </div>
              <div className="runway-progress-wrapper">
                <div className="runway-progress-labels">
                  <span>Votos de jurados registrados</span>
                  <strong>{status.activeTroupe.resolvedScores} / {status.activeTroupe.totalScores}</strong>
                </div>
                <progress
                  className="runway-progress-bar"
                  max={status.activeTroupe.totalScores || 1}
                  value={status.activeTroupe.resolvedScores}
                  aria-label={`Progreso de votos para ${status.activeTroupe.troupeName}`}
                />
              </div>
            </div>
          ) : (
            <div className="runway-all-completed-card">
              <span className="status-pill status-pill-submitted">DESFILE FINALIZADO</span>
              <p>Todas las comparsas de la noche han completado su pasada y cuentan con votos resueltos.</p>
            </div>
          )}

          <div className="runway-troupes-grid" aria-label="Cronograma de pasadas">
            {status.troupes.map((troupe) => {
              const pct = troupe.totalScores > 0 ? Math.round((troupe.resolvedScores / troupe.totalScores) * 100) : 0;
              const isCurrent = status.activeTroupe?.scheduleId === troupe.scheduleId;
              const isDone = troupe.status === "COMPLETED";

              return (
                <article
                  key={troupe.scheduleId}
                  className={`runway-troupe-card ${isCurrent ? "is-current" : ""} ${isDone ? "is-completed" : "is-waiting"}`}
                >
                  {votingStatus === "OPEN" && (status?.releaseMode ?? "MANUAL") === "MANUAL" && !troupe.released
                    && troupe.scheduleId === runwayTroupes.find((entry) => !entry.released)?.scheduleId && <button type="button"
                    disabled={Boolean(busy)}
                    onClick={(event) => requestConfirmation(`release:${troupe.scheduleId}`, event)}>
                    Habilitar para votar
                  </button>}
                  {votingStatus === "OPEN" && (status?.releaseMode ?? "MANUAL") === "ALL" && troupe.released && <button type="button"
                    disabled={Boolean(busy) || isCurrent}
                    onClick={(event) => requestConfirmation(`release:${troupe.scheduleId}`, event)}>
                    {isCurrent ? "En pista" : "Poner en pista"}
                  </button>}
                  <div className="runway-troupe-header">
                    <span className="troupe-order">#{troupe.presentationOrder}</span>
                    <strong className="troupe-name" style={{ color: troupe.brandColor || "inherit" }}>
                      {troupe.troupeName}
                    </strong>
                    <span
                      className={`status-pill ${
                        isDone
                          ? "status-pill-submitted"
                          : isCurrent
                            ? "status-pill-active"
                            : "status-pill-pending"
                      }`}
                    >
                      {isDone ? "COMPLETADA" : isCurrent ? "EN PISTA" : "EN ESPERA"}
                    </span>
                  </div>
                  <div className="runway-troupe-progress">
                    <div className="runway-troupe-meta">
                      <span>Progreso</span>
                      <span>{troupe.resolvedScores}/{troupe.totalScores} ({pct}%)</span>
                    </div>
                    <div className="troupe-mini-bar" role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100">
                      <div className="troupe-mini-fill" style={{ inlineSize: `${pct}%` }} />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
      {isEventOpen && runwayTroupes.length > 1 && (
        <section className="config-section" aria-label="Reorden de pasada">
          <div className="section-heading"><div>
            <p className="eyebrow">Corrección operativa</p>
            <h2>Reorden de pasada</h2>
            <p>Podés corregir el orden aunque la jornada haya empezado. La comparsa que está en pista y las que ya tienen votos registrados quedan fijas; solo se puede reordenar el tramo pendiente. Requiere motivo y queda auditado.</p>
          </div></div>
          <p className="feedback" role="status">{reorderMessage}</p>
          <ol className="schedule-list">
            {reorderView.map((scheduleId, index) => {
              const troupe = runwayTroupes.find((entry) => entry.scheduleId === scheduleId);
              if (!troupe) return null;
              return (
                <li key={scheduleId} className="schedule-row">
                  <span className="mono-text">{index + 1}</span>
                  <strong>{troupe.troupeName}</strong>
                  <button type="button" className="secondary" aria-label={`Subir ${troupe.troupeName}`} disabled={index <= frozenThrough || reorderBusy} onClick={() => moveReorder(scheduleId, -1)}>Subir</button>
                  <button type="button" className="secondary" aria-label={`Bajar ${troupe.troupeName}`} disabled={index < frozenThrough || index === reorderView.length - 1 || reorderBusy} onClick={() => moveReorder(scheduleId, 1)}>Bajar</button>
                </li>
              );
            })}
          </ol>
          <label>Motivo del reorden<input value={reorderReason} onChange={(event) => setReorderReason(event.target.value)} aria-label="Motivo del reorden" placeholder="Ej.: intercambio acordado entre comparsas" /></label>
          <div className="event-actions"><button type="button" disabled={reorderBusy || !reorderIds || reorderView.every((id, index) => id === runwayTroupes[index]?.scheduleId)} onClick={() => void confirmReorder()}>Confirmar reorden</button></div>
        </section>
      )}
      <section className="assignment-grid" aria-label="Planillas de la noche">
        {status && ballots.length === 0 && <p className="empty-state">Todavía no hay planillas para esta jornada.</p>}
        {ballots.map((ballot) => <article className="assignment-card" key={ballot.id}>
          <div className="judge-card-heading"><div><p className="eyebrow">{ballot.specialtyName}</p><h2>{ballot.judgeName}</h2><p>{BALLOT_STATUS_LABELS[ballot.status] ?? ballot.status}</p></div><StatusPill status={ballot.status} label={BALLOT_STATUS_LABELS[ballot.status] ?? ballot.status} /></div>
        </article>)}
      </section>
    </>}
    <ConfirmDialog
      isOpen={confirmation !== null}
      onClose={() => setConfirmation(null)}
      tone={confirmation === "open" ? "violet" : "danger"}
      title={confirmation === "open"
        ? nightStatus === "DRAFT" ? "Confirmar apertura de jornada y votación" : "Confirmar apertura de votación"
        : "Confirmar cierre de votación"}
      description={`Jornada: ${selectedNight?.name ?? ""}. ${confirmation === "open" ? (nightStatus === "DRAFT" ? "Se abrirá la jornada y se habilitarán las planillas de los jurados asignados." : "Se habilitarán las planillas de los jurados asignados.") : "El cierre es definitivo y requiere planillas completas."}`}
      confirmLabel="Confirmar"
      focusReturnRef={actionButtonRef}
      confirming={Boolean(busy)}
      onConfirm={() => void confirmAction()}
    />
    <Dialog
      isOpen={pendingCloseDialog !== null && pendingCloseDialog?.length > 0}
      onClose={() => setPendingCloseDialog(null)}
      title="Faltan votos por resolver"
      description="No se puede cerrar la votación hasta que los jurados resuelvan estos ítems."
      tone="warning"
      focusReturnRef={closeButtonRef}
      className="pending-dialog"
    >
      {pendingCloseDialog && <div className="pending-dialog-content">
        <p className="eyebrow">Cierre bloqueado</p>
        <ul className="pending-dialog-list" aria-label="Votos pendientes">
          {pendingCloseDialog.map((item) => <li key={item.id}><span>{item.judgeName} · {item.troupeName}</span><span>{item.rubricName}</span><strong>{item.itemName}</strong></li>)}
        </ul>
        <DialogFooter>
          <button type="button" onClick={() => setPendingCloseDialog(null)}>Volver al control</button>
        </DialogFooter>
      </div>}
    </Dialog>
  </PageShell>;
}
