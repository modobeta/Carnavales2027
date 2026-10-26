// Hash routes share the browser's session history. Keep a position on entries
// visited by this document so a legacy hashchange can be reversed by traversal
// instead of replacing (and destroying) the destination entry.
const POSITION = "__carnavalesHashPosition";
let lastPosition = 0;

export function hashHistoryPosition() {
  const position = window.history.state?.[POSITION];
  return Number.isSafeInteger(position) ? position : null;
}

export function markHashHistoryEntry() {
  const position = hashHistoryPosition();
  if (position !== null) {
    lastPosition = position;
    return position;
  }
  const next = ++lastPosition;
  const state = window.history.state;
  window.history.replaceState({ ...(state && typeof state === "object" && !Array.isArray(state) ? state : {}), [POSITION]: next }, "", window.location.href);
  return next;
}
