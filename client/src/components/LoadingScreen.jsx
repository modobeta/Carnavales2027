import { animate, stagger } from "animejs";
import { useMotionScope } from "../motion/useMotionScope.js";

/**
 * LoadingScreen — espera institucional de página completa.
 *
 * Se usa mientras se resuelve la sesión inicial, nunca como confirmación de una
 * operación. La animación es decorativa: el texto y el rol `status` son la
 * fuente de información para lectores de pantalla.
 */
export function LoadingScreen({
  label = "Cargando…",
  detail = "Estamos preparando el portal.",
  layer = "brand",
  compact = false,
  className = "",
}) {
  const rootRef = useMotionScope(
    (root) => {
      animate(root, {
        opacity: [0, 1],
        translateY: [8, 0],
        duration: 360,
        ease: "out(3)",
      });

      const rings = root.querySelectorAll("[data-loading-ring]");
      rings.forEach((ring, index) => {
        animate(ring, {
          rotate: index % 2 === 0 ? [0, 360] : [360, 0],
          duration: 7_000 + index * 1_800,
          loop: true,
          ease: "linear",
          delay: index * 120,
        });
      });

      animate(root.querySelectorAll("[data-loading-dot]"), {
        opacity: [0.3, 1],
        scale: [0.8, 1],
        duration: 900,
        loop: true,
        alternate: true,
        delay: stagger(140),
        ease: "inOutSine",
      });

      animate(root.querySelector("[data-loading-mark]"), {
        opacity: [0.82, 1],
        scale: [0.96, 1.03],
        duration: 1_600,
        loop: true,
        alternate: true,
        ease: "inOutSine",
      });
    },
    { deps: [] },
  );

  return (
    <div
      ref={rootRef}
      className={`loading-screen${compact ? " is-compact" : ""} ${className}`.trim()}
      data-layer={layer}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="loading-screen-panel">
        <div className="loading-orbit" aria-hidden="true">
          <span className="loading-orbit-ring loading-orbit-ring-outer" data-loading-ring />
          <span className="loading-orbit-ring loading-orbit-ring-middle" data-loading-ring />
          <span className="loading-orbit-ring loading-orbit-ring-inner" data-loading-ring />
          <span className="loading-orbit-mark" data-loading-mark>
            <span className="loading-orbit-mark-line" />
            <span className="loading-orbit-mark-line" />
          </span>
          <span className="loading-orbit-dots">
            <span data-loading-dot />
            <span data-loading-dot />
            <span data-loading-dot />
          </span>
        </div>
        <p className="loading-screen-label">{label}</p>
        {detail && <p className="loading-screen-detail">{detail}</p>}
      </div>
    </div>
  );
}
