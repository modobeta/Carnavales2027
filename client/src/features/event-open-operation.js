import { apiRequest } from "../api/http.js";

const STORAGE_PREFIX = "event-open-operation:";
const OPEN_EVENT_INTENT = "OPEN_EVENT";

function storageKey(eventId) {
  return `${STORAGE_PREFIX}${eventId}`;
}

export function readPendingEventOpenOperation(eventId) {
  if (!eventId) return null;
  try {
    const value = globalThis.localStorage.getItem(storageKey(eventId));
    if (!value) return null;
    const operation = JSON.parse(value);
    if (
      operation?.eventId !== eventId
      || operation?.intent !== OPEN_EVENT_INTENT
      || typeof operation?.operationId !== "string"
      || !operation.operationId
    ) return null;
    return operation;
  } catch {
    return null;
  }
}

export function savePendingEventOpenOperation(operation) {
  const { eventId, intent, operationId } = operation ?? {};
  if (!eventId || intent !== OPEN_EVENT_INTENT || typeof operationId !== "string" || !operationId) {
    throw new TypeError("A valid event-open operation reference is required.");
  }

  const existing = readPendingEventOpenOperation(eventId);
  if (existing) return existing;
  if (globalThis.localStorage.getItem(storageKey(eventId)) !== null) {
    throw new Error("The stored event-open operation cannot be safely replaced.");
  }

  const reference = { eventId, intent, operationId };
  globalThis.localStorage.setItem(storageKey(eventId), JSON.stringify(reference));
  return reference;
}

export function createPendingEventOpenOperation(eventId) {
  const existing = readPendingEventOpenOperation(eventId);
  if (existing) return existing;
  return savePendingEventOpenOperation({
    eventId,
    intent: OPEN_EVENT_INTENT,
    operationId: globalThis.crypto.randomUUID(),
  });
}

function isSameOperation(result, reference) {
  return result?.operationId === reference.operationId
    && result?.eventId === reference.eventId
    && result?.intent === reference.intent;
}

export function resolvePendingEventOpenOperation(eventId, terminalOperation) {
  const reference = readPendingEventOpenOperation(eventId);
  if (!reference || !isSameOperation(terminalOperation, reference)) return false;
  if (terminalOperation.status !== "applied" && terminalOperation.status !== "rejected") return false;
  globalThis.localStorage.removeItem(storageKey(eventId));
  return true;
}

export async function reconcilePendingEventOpenOperation(eventId) {
  const reference = readPendingEventOpenOperation(eventId);
  if (!reference) return { status: "none" };

  let result;
  try {
    result = await apiRequest(
      `/api/v1/events/${encodeURIComponent(eventId)}/open-operations/${encodeURIComponent(reference.operationId)}`,
    );
  } catch (error) {
    if (error?.code === "OPEN_OPERATION_NOT_FOUND") {
      return { status: "not_registered", operation: reference };
    }
    if (error?.code === "IDEMPOTENCY_CONFLICT") {
      return { status: "conflict", operation: reference };
    }
    return { status: "unknown", operation: reference, error };
  }

  if (!isSameOperation(result, reference)) {
    return { status: "conflict", operation: reference };
  }

  if (result.status !== "applied" && result.status !== "rejected") {
    return { status: "pending", operation: reference, result };
  }

  resolvePendingEventOpenOperation(eventId, result);
  return { ...result, operation: reference };
}
