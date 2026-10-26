import { animate, stagger } from "animejs";
import { useMotionScope } from "../motion/useMotionScope.js";

/**
 * LoadingOverlay — indicador de una operación en curso.
 *
 * Refleja únicamente que la petición sigue pendiente. No debe usarse para
 * anunciar éxito: el mensaje de confirmación solo aparece cuando la API
 * responde. Por defecto no bloquea interacción; `blocking` se reserva para
 * acciones que ya deshabilitan el flujo (por ejemplo, confirmar una planilla).
 */
export function LoadingOverlay({
  active = false,
  label = "Procesando…",
  detail = "",
  inline = false,
  blocking = false,
  className = "",
}) {
  const rootRef = useMotionScope(
    (root) => {
      const panel = root.querySelector(".loading-overlay-panel");
      animate(panel, {
        opacity: [0, 1],
        translateY: [6, 0],
        scale: [0.98, 1],
        duration: 220,
        ease: "out(3)",
      });

      animate(root.querySelector(".loading-overlay-ring"), {
        rotate: [0, 360],
        duration: 900,
        loop: true,
        ease: "linear",
      });

      animate(root.querySelectorAll(".loading-overlay-dot"), {
        opacity: [0.25, 1],
        duration: 700,
        loop: true,
        alternate: true,
        delay: stagger(120),
        ease: "inOutSine",
      });
    },
    { deps: [active, label], enabled: active },
  );

  if (!active) return null;

  return (
    <div
      ref={rootRef}
      className={`loading-overlay${inline ? " is-inline" : ""}${blocking ? " is-blocking" : ""} ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="loading-overlay-panel">
        <span className="loading-overlay-spinner" aria-hidden="true">
          <span className="loading-overlay-ring" />
          <span className="loading-overlay-dots">
            <span className="loading-overlay-dot" />
            <span className="loading-overlay-dot" />
            <span className="loading-overlay-dot" />
          </span>
        </span>
        <span className="loading-overlay-copy">
          <strong>{label}</strong>
          {detail && <span>{detail}</span>}
        </span>
      </div>
    </div>
  );
}
