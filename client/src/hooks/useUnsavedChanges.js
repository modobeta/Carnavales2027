import { useCallback, useEffect, useRef, useState } from "react";

/**
 * useUnsavedChanges — Evita perder cambios sin guardar (Spec 027/RF-UX-03).
 *
 * - Registra `beforeunload` mientras `isDirty` sea verdadero (recarga/cierre
 *   de pestaña).
 * - `requestLeave(proceed)` intercepta una salida en la app (cerrar un drawer,
 *   volver a otra sección) y muestra el diálogo de advertencia.
 * - No hace nada si no hay cambios pendientes.
 */
export function useUnsavedChanges({ isDirty, onSave, saving = false }) {
  const [promptOpen, setPromptOpen] = useState(false);
  const pendingActionRef = useRef(null);

  useEffect(() => {
    if (!isDirty) return undefined;
    const handler = (event) => {
      event.preventDefault();
      event.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const requestLeave = useCallback(
    (proceed) => {
      if (!isDirty) {
        if (typeof proceed === "function") proceed();
        return true;
      }
      pendingActionRef.current = typeof proceed === "function" ? proceed : null;
      setPromptOpen(true);
      return false;
    },
    [isDirty],
  );

  const keepEditing = useCallback(() => {
    pendingActionRef.current = null;
    setPromptOpen(false);
  }, []);

  const discard = useCallback(() => {
    const proceed = pendingActionRef.current;
    pendingActionRef.current = null;
    setPromptOpen(false);
    if (typeof proceed === "function") proceed();
  }, []);

  const saveAndLeave = useCallback(async () => {
    if (!onSave) return;
    const proceed = pendingActionRef.current;
    try {
      await onSave();
    } catch {
      return;
    }
    pendingActionRef.current = null;
    setPromptOpen(false);
    if (typeof proceed === "function") proceed();
  }, [onSave]);

  return { promptOpen, requestLeave, keepEditing, discard, saveAndLeave, saving };
}

/**
 * useFormDirty — Marca un formulario no controlado como "modificado".
 * `resetKey` limpia el estado cuando cambia (p. ej. al reabrir el drawer).
 */
export function useFormDirty(resetKey) {
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    setDirty(false);
  }, [resetKey]);
  const markDirty = useCallback(() => setDirty(true), []);
  const reset = useCallback(() => setDirty(false), []);
  return { dirty, markDirty, reset };
}
