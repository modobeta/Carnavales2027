import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
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
  const [judgeNight, setJudgeNightState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestSequence = useRef(0);

  const refreshEvents = async () => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    try {
      const loaded = await loadAvailableEvents(session?.roles, judgeArea);
      const all = Array.isArray(loaded) ? loaded : [];
      const items = all.filter((event) => event.active !== false);
      if (requestId !== requestSequence.current) return [];
      const currentId = activeEventIdRef.current;
      const visible = items;
      setEvents(visible);
      setError("");
      const storedEvent = visible.find((event) => event.id === currentId);
      const fallbackId = items[0]?.id ?? "";
      const nextId = storedEvent?.id ?? fallbackId;
      if (nextId !== currentId) {
        setActiveNightIdState("");
        if (currentId) setJudgeNightState(null);
      }
      activeEventIdRef.current = nextId;
      setActiveEventIdState(nextId);
      storeEventId(nextId, storageKey);
      return visible;
    } catch {
      if (requestId !== requestSequence.current) return [];
      setEvents([]);
      activeEventIdRef.current = "";
      setActiveEventIdState("");
      setActiveNightIdState("");
      setJudgeNightState(null);
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
    if (nextId !== activeEventIdRef.current) setJudgeNightState(null);
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
    if ((event?.id ?? "") !== activeEventIdRef.current) setJudgeNightState(null);
    setActiveEventIdState(event?.id ?? "");
    activeEventIdRef.current = event?.id ?? "";
    setActiveNightIdState("");
    storeEventId(event?.id ?? "", storageKey);
  };

  const setActiveNightId = (nightId) => setActiveNightIdState(nightId ?? "");

  const setJudgeNight = useCallback((night) => {
    setJudgeNightState(night ?? null);
  }, []);

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
    judgeNight,
    loading,
    error,
    refreshEvents,
    setActiveEvent,
    setActiveEventId,
    setActiveNightId,
    setJudgeNight,
    updateEvent,
  }), [events, activeEvent, activeEventId, activeNightId, judgeNight, loading, error]);

  return <AdminEventContext.Provider value={value}>{children}</AdminEventContext.Provider>;
}

export function useAdminEvent() {
  return useContext(AdminEventContext);
}
