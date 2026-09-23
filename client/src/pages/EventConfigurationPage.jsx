import { useEffect, useRef, useState } from "react";
import { PageShell } from "../components/PageShell.jsx";
import { PageHeader } from "../components/PageHeader.jsx";
import { EventStatusBanner } from "../components/EventStatusBanner.jsx";
import { Dialog } from "../components/Dialog.jsx";
import { EntityDrawer } from "../components/EntityDrawer.jsx";
import { DialogFooter } from "../components/DialogFooter.jsx";
import { apiRequest } from "../api/http.js";
import { EventReadinessPanel } from "../features/EventReadinessPanel.jsx";
import { NightForm, nightKindLabel } from "../features/NightForm.jsx";

const EMPTY_LIST = [];
const errorMessages = {
  EVENT_LOCKED: "El evento esta abierto y su configuracion ya no puede modificarse.",
  RESOURCE_CONFLICT: "Ese nombre u orden ya está en uso.",
  VALIDATION_ERROR: "Revisa los datos ingresados.",
};

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-AR");
}

export function EventConfigurationPage({
  event,
  nights: initialNights = EMPTY_LIST,
  onBack,
  onCompetencia,
  onEventChange,
}) {
  const [currentEvent, setCurrentEvent] = useState(event);
  const [nights, setNights] = useState(initialNights);
  const [readinessRevision, setReadinessRevision] = useState(0);
  const [message, setMessage] = useState("");
  const [drawerMode, setDrawerMode] = useState(null);
  const [savingNight, setSavingNight] = useState(false);
  const [closeNightTarget, setCloseNightTarget] = useState(null);
  const [closingNight, setClosingNight] = useState(false);
  const [votingStatuses, setVotingStatuses] = useState({});
  const drawerTriggerRef = useRef(null);
  const nightsSectionRef = useRef(null);
  const locked = currentEvent.status !== "CONFIGURING";

  useEffect(() => setNights(initialNights), [initialNights]);

  useEffect(() => {
    if (currentEvent.status !== "OPEN") {
      setVotingStatuses({});
      return undefined;
    }
    let current = true;
    void Promise.all(nights.filter((night) => night.kind === "COMPETITION").map(async (night) => {
      try {
        const result = await apiRequest(`/api/v1/events/${currentEvent.id}/nights/${night.id}/voting/status`);
        return [night.id, result.votingStatus];
      } catch {
        return [night.id, "UNKNOWN"];
      }
    })).then((entries) => { if (current) setVotingStatuses(Object.fromEntries(entries)); });
    return () => { current = false; };
  }, [currentEvent.id, currentEvent.status, nights]);

  const save = async (path, body, { form, method = "POST", onSaved, reset = method === "POST" } = {}) => {
    try {
      const saved = await apiRequest(path, { method, body: JSON.stringify(body) });
      onSaved?.(saved);
      onEventChange?.(saved);
      setReadinessRevision((revision) => revision + 1);
      setMessage("Cambios guardados.");
      if (reset) form?.reset();
      return saved;
    } catch (error) {
      setMessage(errorMessages[error.code] ?? error.message ?? "No se pudo guardar.");
      return null;
    }
  };

  const submit = (path, toBody, onSaved, method = "POST") => async (formEvent) => {
    formEvent.preventDefault();
    const form = formEvent.currentTarget;
    await save(path, toBody(new FormData(form)), { form, method, onSaved });
  };

  const orderedNights = [...nights].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  const nextOrder = orderedNights.length === 0 ? 1 : Math.max(...orderedNights.map((n) => n.displayOrder ?? 0)) + 1;
  const editingNight = drawerMode?.mode === "edit" ? nights.find((n) => n.id === drawerMode.nightId) : null;

  const openCreate = (event) => {
    drawerTriggerRef.current = event.currentTarget;
    setDrawerMode({ mode: "create" });
  };

  const openEdit = (nightId, event) => {
    drawerTriggerRef.current = event.currentTarget;
    setDrawerMode({ mode: "edit", nightId });
  };

  const closeDrawer = () => setDrawerMode(null);

  const saveNight = async (body) => {
    setSavingNight(true);
    try {
      if (drawerMode?.mode === "edit" && editingNight) {
        const saved = await save(
          `/api/v1/nights/${editingNight.id}`,
          body,
          { method: "PATCH", reset: false, onSaved: (entry) => setNights((current) => current.map((n) => n.id === entry.id ? { ...n, ...entry } : n)) },
        );
        if (saved) closeDrawer();
      } else {
        const saved = await save(
          `/api/v1/events/${event.id}/nights`,
          body,
          { reset: false, onSaved: (entry) => setNights((current) => [...current, entry]) },
        );
        if (saved) closeDrawer();
      }
    } finally {
      setSavingNight(false);
    }
  };

  const closeNight = async () => {
    if (!closeNightTarget || closingNight) return;
    setClosingNight(true);
    setMessage("");
    try {
      const night = closeNightTarget;
      const saved = await apiRequest(`/api/v1/nights/${night.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: night.name, displayOrder: night.displayOrder, kind: night.kind, eventDate: night.eventDate ?? null, status: "CLOSED" }),
      });
      setNights((current) => current.map((item) => item.id === saved.id ? saved : item));
      const updatedEvent = await apiRequest(`/api/v1/events/${currentEvent.id}`);
      setCurrentEvent(updatedEvent);
      onEventChange?.(updatedEvent);
      setMessage(updatedEvent.status === "CLOSED"
        ? "Última jornada cerrada. El evento finalizó y las sesiones de jurado se cerrarán."
        : `Jornada ${night.name} finalizada.`);
      setCloseNightTarget(null);
    } catch (error) {
      setMessage(error.code === "VOTING_WINDOW_NOT_CLOSED"
        ? "Cerrá primero la votación de esta jornada."
        : "No se pudo finalizar la jornada.");
    } finally {
      setClosingNight(false);
    }
  };

  return (
    <PageShell layer="instrument" className="admin-shell">
      <PageHeader
        eyebrow={currentEvent.status === "OPEN" ? "Evento abierto" : currentEvent.status === "CLOSED" ? "Evento finalizado" : "Evento en configuracion"}
        title={currentEvent.name ?? "Evento"}
        status={currentEvent.status}
        actions={<>
          {onCompetencia && <button type="button" onClick={onCompetencia}>Competencia</button>}
          {onBack && <button className="secondary" type="button" onClick={onBack}>Volver a eventos</button>}
        </>}
      />
      <EventStatusBanner status={currentEvent.status} />
      <p className="feedback" role="status" aria-live="polite">{message}</p>

      <section className="config-section">
        <div className="section-heading"><h2>Datos del evento</h2><p>Identidad del evento.</p></div>
        <form className="config-card" onSubmit={submit(`/api/v1/events/${event.id}`, (data) => ({ name: data.get("name") }), setCurrentEvent, "PATCH")}>
          <label>Nombre del evento<input name="name" defaultValue={currentEvent.name ?? ""} disabled={locked} required /></label>
          <button disabled={locked}>Guardar evento</button>
        </form>
      </section>

      <section className="config-section" ref={nightsSectionRef} aria-label="Jornadas">
        <div className="section-heading"><h2>Jornadas</h2><p>Calendario de la competencia.</p></div>
        {!locked && <button type="button" onClick={openCreate}>+ Agregar jornada</button>}
        {orderedNights.length === 0 ? (
          <p className="empty-state">Todavía no hay jornadas. Agregá la primera noche de competencia.</p>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Jornada</th>
                  <th scope="col">Fecha</th>
                  <th scope="col">Tipo</th>
                  {(!locked || currentEvent.status === "OPEN") && <th scope="col">Acción</th>}
                </tr>
              </thead>
              <tbody>
                {orderedNights.map((night, index) => (
                  <tr key={night.id}>
                    <td>{night.displayOrder ?? index + 1}</td>
                    <td><strong>{night.name}</strong>{night.status === "CLOSED" && <small> · Finalizada</small>}</td>
                    <td>{formatDate(night.eventDate)}</td>
                    <td>{nightKindLabel(night.kind)}</td>
                    {(!locked || currentEvent.status === "OPEN") && (
                      <td>
                        {!locked && <button className="secondary" type="button" aria-label={`Editar jornada ${night.name}`} onClick={(event) => openEdit(night.id, event)}>Editar</button>}
                        {currentEvent.status === "OPEN" && night.status !== "CLOSED" && <>
                          {night.kind === "COMPETITION" && (night.status !== "OPEN" || votingStatuses[night.id] !== "CLOSED") && <small> Abrí y cerrá la votación antes de finalizar.</small>}
                          <button
                            className="secondary"
                            type="button"
                            disabled={closingNight || (night.kind === "COMPETITION" && (night.status !== "OPEN" || votingStatuses[night.id] !== "CLOSED"))}
                            aria-label={`Finalizar jornada ${night.name}`}
                            onClick={() => setCloseNightTarget(night)}
                          >Finalizar jornada</button>
                        </>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <EntityDrawer
        isOpen={drawerMode !== null && !locked}
        onClose={closeDrawer}
        title={drawerMode?.mode === "edit" ? `Editar jornada${editingNight ? ` — ${editingNight.name}` : ""}` : "Nueva jornada"}
        description={drawerMode?.mode === "edit" ? "Modificá los datos de la jornada." : "Completá los datos de la jornada."}
        focusReturnRef={drawerTriggerRef}
      >
        <NightForm
          key={drawerMode?.mode === "edit" ? `edit-${drawerMode.nightId}` : "create"}
          initialValue={editingNight ?? {}}
          defaultOrder={nextOrder}
          submitting={savingNight}
          submitLabel={drawerMode?.mode === "edit" ? "Guardar jornada" : "Agregar jornada"}
          onSubmit={saveNight}
        />
        <DialogFooter>
          <button type="button" className="secondary" onClick={closeDrawer}>Cancelar</button>
        </DialogFooter>
      </EntityDrawer>

      <Dialog
        isOpen={closeNightTarget !== null}
        onClose={() => { if (!closingNight) setCloseNightTarget(null); }}
        title={`Finalizar ${closeNightTarget?.name ?? "jornada"}`}
        description={`El cierre de una jornada es definitivo. Cuando todas las jornadas del evento estén cerradas, el evento finalizará y se cerrarán las sesiones de jurado.`}
      >
        <DialogFooter>
          <button type="button" className="secondary" disabled={closingNight} onClick={() => setCloseNightTarget(null)}>Cancelar</button>
          <button type="button" className="danger-action" disabled={closingNight} onClick={() => void closeNight()}>{closingNight ? "Finalizando…" : "Confirmar cierre"}</button>
        </DialogFooter>
      </Dialog>

      <EventReadinessPanel
        event={currentEvent}
        locked={locked}
        refreshKey={readinessRevision}
          onOpened={(openedEvent) => {
            setCurrentEvent((current) => ({ ...current, ...openedEvent }));
            onEventChange?.(openedEvent);
          }}
        onGoToNights={() => nightsSectionRef.current?.scrollIntoView?.({ block: "start" })}
      />
    </PageShell>
  );
}
