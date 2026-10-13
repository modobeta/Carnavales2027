/** Etiquetas visibles del estado de un evento (catálogo de eventos y tarjetas). */
export const EVENT_STATUS_LABELS = {
  CONFIGURING: "En preparación",
  OPEN: "Competencia abierta",
  CLOSED: "Evento cerrado",
};

export function eventStatusLabel(status) {
  return EVENT_STATUS_LABELS[status] ?? status;
}
