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
  const storageKey = session?.user?.id ? `carnavales.event.${session.user.id}.${judgeArea ? "judge" : "operational"}` : STORAGE_KEY;
  const [events, setEvents] = useState([]);
  const [activeEventId, setActiveEventIdState] = useState(() => readStoredEventId(storageKey));
  const activeEventIdRef = useRef(activeEventId);
  const [activeNightId, setActiveNightIdState] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestSequence = useRef(0);

  const refreshEvents = async () => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    try {
      const loaded = await loadAvailableEvents(session?.roles, judgeArea);
      const items = (Array.isArray(loaded) ? loaded : []).filter((event) => event.active !== false);
      if (requestId !== requestSequence.current) return [];
      setEvents(items ?? []);
      setError("");
      const currentId = activeEventIdRef.current;
      const storedEvent = items.find((event) => event.id === currentId);
      const nextId = storedEvent?.id ?? items[0]?.id ?? "";
      if (nextId !== currentId) setActiveNightIdState("");
      activeEventIdRef.current = nextId;
      setActiveEventIdState(nextId);
      storeEventId(nextId, storageKey);
      return items ?? [];
    } catch {
      if (requestId !== requestSequence.current) return [];
      setEvents([]);
      activeEventIdRef.current = "";
      setActiveEventIdState("");
      setActiveNightIdState("");
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
    setActiveEventIdState(nextId);
    activeEventIdRef.current = nextId;
    setActiveNightIdState("");
    storeEventId(nextId, storageKey);
  };

  const setActiveEvent = (event) => {
    if (event?.id) {
      setEvents((current) => current.some((entry) => entry.id === event.id)
        ? current.map((entry) => entry.id === event.id ? { ...entry, ...event } : entry)
        : [...current, event]);
    }
    setActiveEventIdState(event?.id ?? "");
    activeEventIdRef.current = event?.id ?? "";
    setActiveNightIdState("");
    storeEventId(event?.id ?? "", storageKey);
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
    setActiveNightId,
    updateEvent,
  }), [events, activeEvent, activeEventId, activeNightId, loading, error]);

  return <AdminEventContext.Provider value={value}>{children}</AdminEventContext.Provider>;
}

export function useAdminEvent() {
  return useContext(AdminEventContext);
}
