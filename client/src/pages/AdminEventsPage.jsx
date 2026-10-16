import { useEffect, useState } from "react";
import { PageShell } from "../components/PageShell.jsx";
import { apiRequest } from "../api/http.js";
import { EventConfigurationPage } from "./EventConfigurationPage.jsx";
import { useAdminEvent } from "../context/AdminEventContext.jsx";

export function AdminEventsPage({ eventAdminMode = false } = {}) {
  const adminEvent = useAdminEvent();
  const [localEvents, setLocalEvents] = useState([]);
  const [nights, setNights] = useState([]);
  const [configurationLoading, setConfigurationLoading] = useState(false);
  const [configurationError, setConfigurationError] = useState(false);
  const [selected, setSelected] = useState(null);

  const allEvents = adminEvent?.events ?? localEvents;
  const events = allEvents.filter((event) => event.active !== false);
  const activeEventId = adminEvent?.activeEventId ?? "";
  const activeEvent = selected ?? adminEvent?.activeEvent ?? (activeEventId ? events.find((e) => e.id === activeEventId) : null);

  useEffect(() => {
    if (!adminEvent) {
      void apiRequest("/api/v1/events")
        .then((items) => setLocalEvents(Array.isArray(items) ? items : []))
        .catch(() => setLocalEvents([]));
    }
  }, [adminEvent]);

  useEffect(() => {
    if (!activeEvent) {
      setNights([]);
      return;
    }
    let current = true;
    setConfigurationError(false);
    setConfigurationLoading(true);
    void Promise.all([
      apiRequest(`/api/v1/events/${activeEvent.id}/nights`),
    ]).then(([eventNights]) => {
      if (!current) return;
      setNights(Array.isArray(eventNights) ? eventNights : []);
    }).catch(() => {
      if (!current) return;
      setNights([]);
      setConfigurationError(true);
    }).finally(() => {
      if (current) setConfigurationLoading(false);
    });
    return () => { current = false; };
  }, [activeEvent?.id]);

  if (activeEvent) {
    if (configurationLoading) {
      return (
        <PageShell layer="instrument" className="container">
          <p>Cargando configuracion...</p>
        </PageShell>
      );
    }
    if (configurationError) {
      return (
        <PageShell layer="instrument" className="container">
          <div className="card">
            <h1>No se pudo cargar la configuracion</h1>
            <p>No se muestran formularios para evitar trabajar sobre datos incompletos.</p>
            <button type="button" onClick={() => { setConfigurationLoading(true); setSelected({ ...activeEvent }); }}>
              Reintentar
            </button>{" "}
            <button className="secondary" type="button" onClick={() => { window.location.hash = "#/admin/home"; }}>
              Volver a eventos
            </button>
          </div>
        </PageShell>
      );
    }
    return (
      <EventConfigurationPage
        key={activeEvent.id}
        event={activeEvent}
        nights={nights}
        onBack={() => { window.location.hash = "#/admin/home"; }}
        onCompetencia={() => { window.location.hash = "#/admin/competencia"; }}
        onEventChange={adminEvent?.updateEvent}
        eventAdminMode={eventAdminMode}
      />
    );
  }

  if (events.length > 0) {
    return (
      <PageShell layer="instrument" className="container admin-events-page">
        <header className="admin-events-header">
          <div>
            <p className="eyebrow">Configuración operativa</p>
            <h1>Jornadas</h1>
            <p>Seleccioná el evento para configurar sus jornadas y apertura.</p>
          </div>
        </header>
        <section className="event-catalog-section" aria-label="Seleccionar evento">
          <div className="event-catalog-grid">
            {events.map((event) => (
              <article className="event-catalog-card" key={event.id}>
                <h3>{event.name}</h3>
                <button type="button" onClick={() => { setSelected(event); adminEvent?.setActiveEvent?.(event); }}>
                  Usar este evento
                </button>
              </article>
            ))}
          </div>
        </section>
      </PageShell>
    );
  }

  return (
    <PageShell layer="instrument" className="container admin-events-page">
      <section className="admin-events-empty card" aria-label="Sin evento activo">
        <h2>Primero seleccioná un evento</h2>
        <p>Elegí o creá un evento en Inicio para gestionar sus jornadas y apertura.</p>
        <a className="button-link" href="#/admin/home">Ir a Mis eventos</a>
      </section>
    </PageShell>
  );
}
