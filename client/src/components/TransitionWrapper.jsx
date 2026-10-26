import { animate } from "animejs";
import { useMotionScope } from "../motion/useMotionScope.js";

/**
 * TransitionWrapper — entrada suave del contenido de una ruta o sección.
 *
 * Solo anima opacidad y desplazamiento. No retrasa el montaje, no bloquea
 * eventos y se desactiva por completo con `prefers-reduced-motion`.
 */
export function TransitionWrapper({
  motionKey,
  children,
  variant = "rise",
  className = "",
}) {
  const rootRef = useMotionScope(
    (root) => {
      animate(root, {
        opacity: [0, 1],
        translateY: variant === "fade" ? [0, 0] : [10, 0],
        duration: variant === "fade" ? 240 : 320,
        ease: "out(3)",
      });
    },
    { deps: [motionKey, variant] },
  );

  return (
    <div
      ref={rootRef}
      key={motionKey}
      className={`motion-transition motion-transition-${variant} ${className}`.trim()}
    >
      {children}
    </div>
  );
}
