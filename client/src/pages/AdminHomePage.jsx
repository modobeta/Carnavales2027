import { useEffect, useRef, useState } from "react";
import { apiRequest } from "../api/http.js";
import { PageShell } from "../components/PageShell.jsx";
import { Dialog } from "../components/Dialog.jsx";
import { StatusPill } from "../components/StatusPill.jsx";
import { ActionMenu } from "../components/ActionMenu.jsx";
import { EVENT_STATUS_LABELS } from "../components/event-status-labels.js";
import { useAdminEvent } from "../context/AdminEventContext.jsx";

function normalize(text) {
  return String(text ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function deleteErrorMessage(error) {
  if (error?.code?.startsWith("EVENT_HAS_")) return "Solo se pueden eliminar eventos sin votación ni historial operativo.";
  if (error?.code === "EVENT_LOCKED") return "Solo se pueden eliminar eventos en preparación.";
  return "No se pudo eliminar el evento.";
}

function countText(summary, key, singular, plural) {
  if (summary.loading) return `— ${plural}`;
  const value = summary[key] ?? 0;
  return `${value} ${value === 1 ? singular : plural}`;
}

const EMPTY_SUMMARY = { nights: 0, troupes: 0, judges: 0, rubrics: 0, loading: true };

/**
 * AdminHomePage — Inicio del Administrador ("Mis eventos").
 * Permite buscar, filtrar y seleccionar el evento a administrar.
 */
export function AdminHomePage() {
  const adminEvent = useAdminEvent();
  const [catalog, setCatalog] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [summaries, setSummaries] = useState({});
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const createTriggerRef = useRef(null);
  const confirmTriggerRef = useRef(null);

  const activeEvents = adminEvent?.events ?? catalog.filter((event) => event.active !== false);
  const deletedEvents = catalog.filter((event) => event.active === false);
  const visibleEvents = showDeleted ? deletedEvents : activeEvents;

  const normalizedQuery = normalize(query);
  const filteredEvents = visibleEvents.filter((event) =>
    (!statusFilter || event.status === statusFilter) &&
    (!normalizedQuery || normalize(event.name).includes(normalizedQuery)));

  const loadCatalog = async () => {
    try {
      const items = await apiRequest("/api/v1/events");
      setCatalog(Array.isArray(items) ? items : []);
    } catch {
      setCatalog([]);
      if (!adminEvent) setMessage("No se pudieron cargar los eventos.");
    } finally {
      setCatalogLoading(false);
    }
  };

  const refreshEvents = async () => {
    await Promise.all([loadCatalog(), adminEvent?.refreshEvents?.()]);
  };

  useEffect(() => {
    void loadCatalog();
  }, []);

  const eventKey = visibleEvents.map((e) => e.id).join("|");
  useEffect(() => {
    if (visibleEvents.length === 0) {
      setSummaries({});
      return undefined;
    }
    let current = true;
    const loadSummaries = async () => {
      const judgesResult = await apiRequest("/api/v1/judges").catch(() => []);
      const judges = Array.isArray(judgesResult)
        ? judgesResult.filter((judge) => judge.registrationStatus === "REGISTERED").length
        : 0;
      const entries = await Promise.all(visibleEvents.map(async (event) => {
        const [nightsRes, troupesRes, rubricsRes] = await Promise.allSettled([
          apiRequest(`/api/v1/events/${event.id}/nights`),
          apiRequest(`/api/v1/events/${event.id}/troupes`),
          apiRequest(`/api/v1/events/${event.id}/rubrics`),
        ]);
        const nightsList = nightsRes.status === "fulfilled" && Array.isArray(nightsRes.value) ? nightsRes.value : [];
        const troupesList = troupesRes.status === "fulfilled" && Array.isArray(troupesRes.value) ? troupesRes.value : [];
        const rubricsList = rubricsRes.status === "fulfilled" && Array.isArray(rubricsRes.value) ? rubricsRes.value : [];
        return [event.id, {
          nights: nightsList.filter((n) => n.kind === "COMPETITION").length,
          troupes: troupesList.filter((t) => t.active !== false).length,
          judges,
          rubrics: rubricsList.filter((r) => r.active !== false).length,
          loading: false,
        }];
      }));
      if (current) setSummaries(Object.fromEntries(entries));
    };
    void loadSummaries();
    return () => { current = false; };
  }, [eventKey]);

  const goWithEvent = (event, href) => {
    adminEvent?.setActiveEvent?.(event);
    window.location.hash = href;
  };

  const handleAdminister = (event) => {
    goWithEvent(event, "#/admin/events");
  };

  const create = async (formEvent) => {
    formEvent.preventDefault();
    const form = formEvent.currentTarget;
    const data = new FormData(form);
    try {
      const created = await apiRequest("/api/v1/events", {
        method: "POST",
        body: JSON.stringify({ name: data.get("name") }),
      });
      await refreshEvents();
      adminEvent?.setActiveEvent?.(created);
      setIsCreateOpen(false);
      form.reset();
      setMessage(`Evento ${created?.name ?? data.get("name")} creado.`);
    } catch (error) {
      setMessage(error?.code === "RESOURCE_CONFLICT" ? "Ya existe un evento equivalente." : "No se pudo crear el evento.");
    }
  };

  const confirmAction = async () => {
    const target = confirmTarget;
    setConfirmTarget(null);
    if (!target) return;
    const { event, kind } = target;
    if (kind === "delete") {
      try {
        await apiRequest(`/api/v1/events/${event.id}`, { method: "DELETE" });
        if (event.id === adminEvent?.activeEventId) adminEvent.setActiveEventId?.("");
        await refreshEvents();
        setMessage(`Evento ${event.name} eliminado (desactivado en BD).`);
      } catch (error) {
        setMessage(deleteErrorMessage(error));
      }
      return;
    }
    try {
      await apiRequest(`/api/v1/events/${event.id}`, { method: "PATCH", body: JSON.stringify({ active: true }) });
      await refreshEvents();
      setMessage(`Evento ${event.name} reactivado.`);
    } catch {
      setMessage("No se pudo reactivar el evento.");
    }
  };

  const askConfirm = (event, kind, trigger) => {
    confirmTriggerRef.current = trigger;
    setConfirmTarget({ event, kind });
  };

  const menuItemsFor = (event) => {
    if (event.active === false) {
      return [{ key: "reactivate", label: "Reactivar", onSelect: (_e, trigger) => askConfirm(event, "reactivate", trigger) }];
    }
    const items = [{ key: "detail", label: "Ver detalle / configuración", onSelect: () => goWithEvent(event, "#/admin/events") }];
    if (event.status === "OPEN") items.push({ key: "supervise", label: "Ir a supervisión", onSelect: () => goWithEvent(event, "#/veedor") });
    if (event.status === "CLOSED") items.push({ key: "results", label: "Ver resultados", onSelect: () => goWithEvent(event, "#/admin/results") });
    if (event.status === "CONFIGURING") {
      items.push({ key: "delete", label: "Eliminar", danger: true, onSelect: (_e, trigger) => askConfirm(event, "delete", trigger) });
    }
    return items;
  };

  const loading = adminEvent ? adminEvent.loading : catalogLoading;
  const effectiveMessage = adminEvent?.error || message;
  const hasFilters = Boolean(normalizedQuery || statusFilter);

  return (
    <PageShell layer="instrument" className="container my-events-page">
      <nav className="my-events-breadcrumb" aria-label="Ruta de navegación">
        <span>Inicio</span>
        <span aria-hidden="true">&rsaquo;</span>
      </nav>

      <header className="my-events-header">
        <div>
          <h1>{showDeleted ? "Eventos eliminados" : "Mis eventos"}</h1>
          <p>{showDeleted ? "Eventos desactivados; podés reactivarlos desde su menú." : "Elegí el evento que querés administrar."}</p>
        </div>
        <button ref={createTriggerRef} type="button" className="my-events-create" onClick={() => setIsCreateOpen(true)}>
          <span aria-hidden="true">+</span>
          <span>Crear evento</span>
        </button>
      </header>

      <div className="my-events-filters" role="search">
        <label className="my-events-search">
          <span className="sr-only">Buscar evento</span>
          <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input type="search" placeholder="Buscar evento..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <label className="my-events-status-filter">
          <span className="sr-only">Filtrar por estado</span>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Todos los estados</option>
            {Object.entries(EVENT_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
      </div>

      <p className="feedback" role="status" aria-live="polite">{effectiveMessage}</p>

      {loading ? (
        <p>Cargando eventos…</p>
      ) : visibleEvents.length === 0 && !showDeleted ? (
        <section className="my-events-empty card" aria-label="Catálogo de eventos vacío">
          <h2>Todavía no hay eventos</h2>
          <p>Creá el primero para comenzar la configuración del carnaval.</p>
          <button type="button" onClick={() => setIsCreateOpen(true)}>Crear primer evento</button>
        </section>
      ) : filteredEvents.length === 0 ? (
        <p className="my-events-empty-filter">
          {hasFilters ? "Ningún evento coincide con la búsqueda." : "No hay eventos eliminados."}
        </p>
      ) : (
        <div className="my-events-grid">
          {filteredEvents.map((event) => {
            const summary = summaries[event.id] ?? EMPTY_SUMMARY;
            const isDeleted = event.active === false;
            return (
              <article key={event.id} className={`my-event-card${isDeleted ? " is-deleted" : ""}`} aria-label={event.name}>
                <div className="my-event-card-top">
                  <div className="my-event-card-pills">
                    <StatusPill status={event.status} label={EVENT_STATUS_LABELS[event.status] ?? event.status} />
                    {isDeleted && <StatusPill status="SUSPENDED" label="Eliminado" />}
                  </div>
                  <ActionMenu label={`Acciones de ${event.name}`} items={menuItemsFor(event)} />
                </div>
                <h2 className="my-event-card-title">{event.name}</h2>
                <hr className="my-event-card-divider" />
                <div className="my-event-card-meta" aria-label="Resumen del evento">
                  <p>
                    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                      <rect x="4" y="5" width="16" height="16" rx="2" />
                      <line x1="16" y1="3" x2="16" y2="7" />
                      <line x1="8" y1="3" x2="8" y2="7" />
                      <line x1="4" y1="11" x2="20" y2="11" />
                    </svg>
                    <span>{countText(summary, "nights", "jornada", "jornadas")}</span>
                    <span aria-hidden="true">•</span>
                    <span>{countText(summary, "troupes", "comparsa", "comparsas")}</span>
                  </p>
                  <p>
                    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    <span>{countText(summary, "judges", "jurado", "jurados")}</span>
                    <span aria-hidden="true">•</span>
                    <span>{countText(summary, "rubrics", "rubro", "rubros")}</span>
                  </p>
                </div>
                {!isDeleted && (
                  <button type="button" className="my-event-card-cta" onClick={() => handleAdminister(event)} aria-label={`Administrar evento ${event.name}`}>
                    <span>Administrar evento</span>
                    <span aria-hidden="true">&rarr;</span>
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}

      {(showDeleted || deletedEvents.length > 0) && (
        <button type="button" className="my-events-deleted-toggle" onClick={() => setShowDeleted((val) => !val)}>
          {showDeleted ? "Volver a mis eventos" : "Ver eventos eliminados"}
        </button>
      )}

      <Dialog
        isOpen={Boolean(confirmTarget)}
        onClose={() => setConfirmTarget(null)}
        title={confirmTarget ? `${confirmTarget.kind === "delete" ? "Eliminar" : "Reactivar"} ${confirmTarget.event.name}` : ""}
        description={confirmTarget?.kind === "delete"
          ? "Se ocultará del catálogo y quedará desactivado en BD (active=false). Podrás verlo en Ver eventos eliminados y reactivarlo. No se borra el historial."
          : "El evento volverá a aparecer en Mis eventos."}
        focusReturnRef={confirmTriggerRef}
      >
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={() => setConfirmTarget(null)}>Cancelar</button>
          {confirmTarget?.kind === "delete" ? (
            <button type="button" className="danger-action" onClick={confirmAction}>Eliminar (desactivar)</button>
          ) : (
            <button type="button" onClick={confirmAction}>Reactivar</button>
          )}
        </div>
      </Dialog>

      <Dialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Nuevo evento"
        description="Creá un evento para luego configurar sus jornadas y competencia."
        focusReturnRef={createTriggerRef}
      >
        <form className="config-card" onSubmit={create}>
          <label>Nombre del evento<input name="name" required autoFocus /></label>
          <div className="dialog-actions">
            <button type="button" className="secondary" onClick={() => setIsCreateOpen(false)}>Cancelar</button>
            <button type="submit">Crear evento</button>
          </div>
        </form>
      </Dialog>
    </PageShell>
  );
}
