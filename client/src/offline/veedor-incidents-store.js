const STORAGE_KEY_PREFIX = "carnavales_offline_incidents";

function getKey(eventId, nightId) {
  return `${STORAGE_KEY_PREFIX}_${eventId}_${nightId}`;
}

export function getPendingIncidents(eventId, nightId) {
  try {
    const raw = localStorage.getItem(getKey(eventId, nightId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function savePendingIncident(eventId, nightId, incident) {
  const pending = getPendingIncidents(eventId, nightId);
  const entry = {
    ...incident,
    operationId: incident.operationId || crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    status: "OPEN",
    isOfflinePending: true,
  };
  pending.push(entry);
  try {
    localStorage.setItem(getKey(eventId, nightId), JSON.stringify(pending));
  } catch {
    // LocalStorage full or unavailable
  }
  return entry;
}

export function removePendingIncident(eventId, nightId, operationId) {
  const pending = getPendingIncidents(eventId, nightId);
  const filtered = pending.filter((inc) => inc.operationId !== operationId);
  try {
    localStorage.setItem(getKey(eventId, nightId), JSON.stringify(filtered));
  } catch {
    // LocalStorage error
  }
}

export async function syncPendingIncidents(eventId, nightId, apiRequest) {
  const pending = getPendingIncidents(eventId, nightId);
  if (pending.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  for (const item of [...pending]) {
    try {
      await apiRequest(`/api/v1/monitor/events/${eventId}/nights/${nightId}/incidents`, {
        method: "POST",
        body: JSON.stringify({
          incidentType: item.incidentType,
          description: item.description,
          eventTroupeId: item.eventTroupeId || null,
          judgeProfileId: item.judgeProfileId || null,
          ballotId: item.ballotId || null,
        }),
      });
      removePendingIncident(eventId, nightId, item.operationId);
      synced++;
    } catch {
      failed++;
    }
  }

  return { synced, failed };
}
