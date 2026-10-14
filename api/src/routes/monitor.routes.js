import { Router } from "express";
import { requireTwoFactor } from "../auth/two-factor.js";
import { requireVotingObserver } from "../auth/require-voting-observer.js";
import {
  listMonitorEvents,
  getMonitorNight,
  listMonitorJudges,
  listMonitorBallots,
} from "../modules/monitor/monitor-service.js";
import {
  createIncident,
  listIncidents,
  updateIncidentStatus,
} from "../modules/incidents/incident-service.js";
import {
  receiveBallotCustody,
  listNightCustody,
} from "../modules/custody/custody-service.js";
import { subscribeMonitorEvents } from "../modules/monitor/monitor-event-bus.js";
import { sendKnownError } from "./http-errors.js";

// Spec 016 & Spec 022 — Supervisión de votación por VEEDOR y ADMIN en tiempo real (SSE).
// Roles: ADMIN o VEEDOR con sesión 2FA verificada.
export function createMonitorRouter({ requireSession }) {
  const router = Router();
  const observer = [requireSession, requireTwoFactor, requireVotingObserver];

  router.get("/monitor/stream", ...observer, (request, response) => {
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });

    // Enviar evento inicial de conexión (RF-191)
    response.write(
      `event: connected\ndata: ${JSON.stringify({ status: "connected", timestamp: new Date().toISOString() })}\n\n`,
    );
    if (typeof response.flush === "function") {
      response.flush();
    }

    // Heartbeat periódico cada 25s (RF-191)
    const pingTimer = setInterval(() => {
      response.write(": ping\n\n");
      if (typeof response.flush === "function") {
        response.flush();
      }
    }, 25000);

    // Suscribir al bus de eventos de monitor (RF-190, RF-192)
    const unsubscribe = subscribeMonitorEvents((event) => {
      response.write(`event: monitor_update\ndata: ${JSON.stringify(event)}\n\n`);
      if (typeof response.flush === "function") {
        response.flush();
      }
    });

    request.on("close", () => {
      clearInterval(pingTimer);
      unsubscribe();
    });
  });

  router.get("/monitor/events", ...observer, async (_request, response) => {
    try {
      response.json(await listMonitorEvents());
    } catch (error) {
      if (sendKnownError(response, error)) return;
      throw error;
    }
  });

  router.get("/monitor/events/:eventId/nights/:nightId", ...observer, async (request, response) => {
    try {
      response.json(await getMonitorNight({
        eventId: request.params.eventId,
        nightId: request.params.nightId,
      }));
    } catch (error) {
      if (sendKnownError(response, error)) return;
      throw error;
    }
  });

  router.get("/monitor/events/:eventId/nights/:nightId/judges", ...observer, async (request, response) => {
    try {
      response.json(await listMonitorJudges({
        eventId: request.params.eventId,
        nightId: request.params.nightId,
      }));
    } catch (error) {
      if (sendKnownError(response, error)) return;
      throw error;
    }
  });

  router.get("/monitor/events/:eventId/nights/:nightId/ballots", ...observer, async (request, response) => {
    try {
      response.json(await listMonitorBallots({
        eventId: request.params.eventId,
        nightId: request.params.nightId,
      }));
    } catch (error) {
      if (sendKnownError(response, error)) return;
      throw error;
    }
  });

  router.get("/monitor/events/:eventId/nights/:nightId/incidents", ...observer, async (request, response) => {
    try {
      response.json(await listIncidents({
        eventId: request.params.eventId,
        nightId: request.params.nightId,
        status: request.query.status ?? null,
      }));
    } catch (error) {
      if (sendKnownError(response, error)) return;
      throw error;
    }
  });

  router.post("/monitor/events/:eventId/nights/:nightId/incidents", ...observer, async (request, response) => {
    try {
      const created = await createIncident({
        eventId: request.params.eventId,
        nightId: request.params.nightId,
        eventTroupeId: request.body?.eventTroupeId ?? null,
        judgeProfileId: request.body?.judgeProfileId ?? null,
        ballotId: request.body?.ballotId ?? null,
        incidentType: request.body?.incidentType,
        description: request.body?.description,
        actorUserId: request.user.id,
      });
      response.status(201).json(created);
    } catch (error) {
      if (sendKnownError(response, error)) return;
      throw error;
    }
  });

  router.patch("/monitor/events/:eventId/incidents/:incidentId/status", ...observer, async (request, response) => {
    try {
      const updated = await updateIncidentStatus({
        incidentId: request.params.incidentId,
        eventId: request.params.eventId,
        status: request.body?.status,
        resolutionNotes: request.body?.resolutionNotes ?? null,
        actorUserId: request.user.id,
      });
      response.json(updated);
    } catch (error) {
      if (sendKnownError(response, error)) return;
      throw error;
    }
  });

  router.get("/monitor/events/:eventId/nights/:nightId/custody", ...observer, async (request, response) => {
    try {
      response.json(await listNightCustody({
        eventId: request.params.eventId,
        nightId: request.params.nightId,
      }));
    } catch (error) {
      if (sendKnownError(response, error)) return;
      throw error;
    }
  });

  router.post("/monitor/events/:eventId/nights/:nightId/ballots/:ballotId/custody", ...observer, async (request, response) => {
    try {
      const custody = await receiveBallotCustody({
        ballotId: request.params.ballotId,
        eventId: request.params.eventId,
        nightId: request.params.nightId,
        notes: request.body?.notes ?? null,
        actorUserId: request.user.id,
      });
      response.status(201).json(custody);
    } catch (error) {
      if (sendKnownError(response, error)) return;
      throw error;
    }
  });

  return router;
}
