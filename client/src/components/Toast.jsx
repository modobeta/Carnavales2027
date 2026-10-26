import { animate } from "animejs";
import { useMotionScope } from "../motion/useMotionScope.js";

/**
 * Toast — Notificación en pantalla no intrusiva y accesible (Spec 020 / RF-178)
 */
export function Toast({
  message,
  type = "info",
  actionLabel,
  onAction,
  onDismiss,
  className = "",
  role = "status",
}) {
  const rootRef = useMotionScope(
    (root) => {
      animate(root, {
        opacity: [0, 1],
        translateY: [8, 0],
        scale: [0.98, 1],
        duration: 220,
        ease: "out(3)",
      });
    },
    { deps: [message, type], enabled: Boolean(message) },
  );

  if (!message) return null;

  return (
    <div
      ref={rootRef}
      role={role}
      aria-live={role === "alert" ? "assertive" : "polite"}
      className={`app-toast app-toast-${type} ${className}`.trim()}
    >
      <span className="app-toast-message">{message}</span>
      {actionLabel && onAction && (
        <button
          type="button"
          className="app-toast-action-btn"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      )}
      {onDismiss && (
        <button
          type="button"
          className="app-toast-close-btn"
          onClick={onDismiss}
          aria-label="Cerrar notificación"
        >
          ✕
        </button>
      )}
    </div>
  );
}
