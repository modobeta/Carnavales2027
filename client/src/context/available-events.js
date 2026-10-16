import { apiRequest } from "../api/http.js";

export async function loadAvailableEvents(roles = ["ADMIN"], judgeArea = false) {
  if (roles.includes("ADMIN") && !judgeArea) return apiRequest("/api/v1/events");
  if (roles.includes("JUDGE") && (judgeArea || !roles.some((role) => ["COMISARIO", "SCRUTINEER", "ESCRIBANO", "VEEDOR"].includes(role)))) {
    const profile = await apiRequest("/api/v1/judge/profile");
    return [...new Map((profile.assignments ?? [])
      .filter((assignment) => assignment.status === "ACTIVE")
      .map((assignment) => [assignment.eventId, { id: assignment.eventId, name: assignment.eventName }])).values()];
  }
  if (roles.includes("COMISARIO")) return apiRequest("/api/v1/penalties/events");
  if (roles.some((role) => ["SCRUTINEER", "ESCRIBANO"].includes(role))) return apiRequest("/api/v1/results/events");
  if (roles.includes("VEEDOR")) return apiRequest("/api/v1/monitor/events");
  return [];
}
