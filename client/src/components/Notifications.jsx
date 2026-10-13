import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Toast } from "./Toast.jsx";

/**
 * Sistema global de notificaciones breves (toasts) para respuestas de
 * operaciones frecuentes o simples (Spec 027/RF-UX-03).
 *
 * Reglas:
 *  - No bloquea la interfaz.
 *  - Solo se dispara cuando la API confirmó el resultado.
 *  - Los errores usan tono de peligro y no se auto-ocultan si el usuario
 *    debe leerlos con calma.
 *  - Fuera del Provider, `useNotify` es un no-op seguro (permite montar
 *    páginas de forma aislada en tests sin romper).
 */
const NotificationContext = createContext(null);

const NOOP_NOTIFY = { notify: () => null, dismiss: () => {} };

export function useNotify() {
  return useContext(NotificationContext) ?? NOOP_NOTIFY;
}

let notificationId = 0;

export function NotificationProvider({ children, defaultDuration = 5000 }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    ({ message, type = "info", duration, actionLabel, onAction } = {}) => {
      if (!message) return null;
      const resolvedDuration = duration ?? (type === "error" || type === "danger" ? 0 : defaultDuration);
      const id = ++notificationId;
      setToasts((current) => [...current, { id, message, type, actionLabel, onAction }].slice(-4));
      if (resolvedDuration > 0) {
        const timer = setTimeout(() => dismiss(id), resolvedDuration);
        timers.current.set(id, timer);
      }
      return id;
    },
    [defaultDuration, dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  return (
    <NotificationContext.Provider value={{ notify, dismiss }}>
      {children}
      {toasts.length > 0 && (
        <div className="app-toast-stack" aria-label="Notificaciones">
          {toasts.map((toast) => (
            <Toast
              key={toast.id}
              message={toast.message}
              type={toast.type === "error" ? "danger" : toast.type}
              role={toast.type === "error" || toast.type === "danger" ? "alert" : "status"}
              actionLabel={toast.actionLabel}
              onAction={
                toast.onAction
                  ? () => {
                      toast.onAction();
                      dismiss(toast.id);
                    }
                  : undefined
              }
              onDismiss={() => dismiss(toast.id)}
            />
          ))}
        </div>
      )}
    </NotificationContext.Provider>
  );
}
