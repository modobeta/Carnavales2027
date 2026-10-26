import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { loadAvailableEvents } from "./available-events.js";

const STORAGE_KEY = "carnavales.admin.activeEventId";
const AdminEventContext = createContext(null);

function readStoredEventId(key) {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function storeEventId(eventId, key) {
  try {
    if (eventId) window.localStorage.setItem(key, eventId);
    else window.localStorage.removeItem(key);
  } catch {
    // Storage is an optional convenience, not a requirement for the session.
  }
}

export function AdminEventProvider({ children, session, judgeArea = false }) {
  const storageArea = judgeArea ? "judge" : "operational";
  const storageKey = session?.user?.id ? `carnavales.event.${session.user.id}.${storageArea}` : STORAGE_KEY;
  const [events, setEvents] = useState([]);
  const [activeEventId, setActiveEventIdState] = useState(() => readStoredEventId(storageKey));
  const activeEventIdRef = useRef(activeEventId);
  const [activeNightId, setActiveNightIdState] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestSequence = useRef(0);
  // Registered only by the active admin editor; a picker must decide before
  // changing either React context or the persisted event preference.
  const eventChangeGuard = useRef(null);
  const registerEventChangeGuard = (guard) => {
    eventChangeGuard.current = guard;
    return () => { if (eventChangeGuard.current === guard) eventChangeGuard.current = null; };
  };
  const requestEventChange = (nextId, commit) => {
    if (nextId !== activeEventIdRef.current && eventChangeGuard.current?.(commit)) return false;
    commit();
    return true;
  };

  const refreshEvents = async () => {
    const requestId = ++requestSequence.current;
    // Do not unmount the dirty editor while checking a new catalog: it must
    // remain mounted until the user decides whether to leave its event.
    if (!eventChangeGuard.current) setLoading(true);
    try {
      const loaded = await loadAvailableEvents(session?.roles, judgeArea);
      const all = Array.isArray(loaded) ? loaded : [];
      const items = all.filter((event) => event.active !== false);
      if (requestId !== requestSequence.current) return [];
      const currentId = activeEventIdRef.current;
      const visible = items;
      const storedEvent = visible.find((event) => event.id === currentId);
      const fallbackId = items[0]?.id ?? "";
      const nextId = storedEvent?.id ?? fallbackId;
      const commit = () => {
        if (requestId !== requestSequence.current) return;
        setEvents(visible);
        setError("");
        if (nextId !== activeEventIdRef.current) setActiveNightIdState("");
        activeEventIdRef.current = nextId;
        setActiveEventIdState(nextId);
        storeEventId(nextId, storageKey);
      };
      if (!requestEventChange(nextId, commit)) {
        setError("El evento activo ya no figura en el catálogo actualizado. Revisá el borrador antes de cambiar de evento.");
      }
      return visible;
    } catch {
      if (requestId !== requestSequence.current) return [];
      const commit = () => {
        if (requestId !== requestSequence.current) return;
        setEvents([]);
        activeEventIdRef.current = "";
        setActiveEventIdState("");
        setActiveNightIdState("");
        storeEventId("", storageKey);
      };
      requestEventChange("", commit);
      setError("No se pudieron cargar los eventos.");
      return [];
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  };

  useEffect(() => {
    void refreshEvents();
  }, []);

  const setActiveEventId = (eventId) => {
    const exists = events.some((event) => event.id === eventId);
    const nextId = exists ? eventId : "";
    if (nextId === activeEventIdRef.current) return;
    const commit = () => {
      setActiveEventIdState(nextId);
      activeEventIdRef.current = nextId;
      setActiveNightIdState("");
      storeEventId(nextId, storageKey);
    };
    return requestEventChange(nextId, commit);
  };

  const setActiveEvent = (event) => {
    const nextId = event?.id ?? "";
    return requestEventChange(nextId, () => {
      if (event?.id) {
        setEvents((current) => current.some((entry) => entry.id === event.id)
          ? current.map((entry) => entry.id === event.id ? { ...entry, ...event } : entry)
          : [...current, event]);
      }
      if (nextId !== activeEventIdRef.current) setActiveNightIdState("");
      setActiveEventIdState(nextId);
      activeEventIdRef.current = nextId;
      storeEventId(nextId, storageKey);
    });
  };

  const setActiveNightId = (nightId) => setActiveNightIdState(nightId ?? "");

  const updateEvent = (event) => {
    if (!event?.id) return;
    setEvents((current) => current.map((entry) => entry.id === event.id ? { ...entry, ...event } : entry));
  };

  const activeEvent = events.find((event) => event.id === activeEventId) ?? null;
  const value = useMemo(() => ({
    events,
    activeEvent,
    activeEventId,
    activeNightId,
    loading,
    error,
    refreshEvents,
    setActiveEvent,
    setActiveEventId,
    registerEventChangeGuard,
    setActiveNightId,
    updateEvent,
  }), [events, activeEvent, activeEventId, activeNightId, loading, error]);

  return <AdminEventContext.Provider value={value}>{children}</AdminEventContext.Provider>;
}

export function useAdminEvent() {
  return useContext(AdminEventContext);
}
