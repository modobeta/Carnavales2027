import { createScope } from "animejs";
import { useEffect, useRef } from "react";
import { useReducedMotion } from "./useReducedMotion.js";

/**
 * Crea un scope de Anime.js ligado a un elemento y lo revierte al desmontar
 * o cuando cambian las dependencias. Si el navegador pide movimiento reducido,
 * no se ejecuta ninguna animación: el componente queda en su estado final.
 *
 * La animación es siempre cosmética. Un fallo al inicializarla no debe impedir
 * que la pantalla siga funcionando, por eso el try/catch silencioso.
 */
export function useMotionScope(setup, { deps = [], enabled = true, ref } = {}) {
  const internalRef = useRef(null);
  const rootRef = ref ?? internalRef;
  const setupRef = useRef(setup);
  const reducedMotion = useReducedMotion();

  setupRef.current = setup;

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !enabled || reducedMotion || typeof window === "undefined") {
      return undefined;
    }

    let scope;
    try {
      scope = createScope({ root }).add(() => setupRef.current(root));
    } catch {
      return undefined;
    }

    return () => {
      try {
        scope?.revert();
      } catch {
        // La limpieza de una animación cosmética nunca debe romper el flujo.
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, reducedMotion, ...deps]);

  return rootRef;
}
