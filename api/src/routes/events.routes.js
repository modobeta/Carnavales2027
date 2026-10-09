import express, { Router } from "express";
import { auditEvent } from "../audit/audit-service.js";
import { hasEventAdminAccess } from "../auth/event-admin-access.js";
import { requireAdmin } from "../auth/require-admin.js";
import { requireTwoFactor } from "../auth/two-factor.js";
import { getPool } from "../db/pool.js";
import { createEvent, createNight, deleteEvent, deleteNight, getEvent, listEvents, listNights, updateEvent, updateNight } from "../modules/events/event-service.js";
import {
  createCategory,
  createTroupe,
  deleteTroupeLogo,
  getTroupeLogo,
  listCategories,
  listTroupes,
  setTroupeLogo,
  updateCategory,
  updateTroupe,
  TROUPE_LOGO_MAX_BYTES,
} from "../modules/troupes/category-service.js";
import { createSpecialty, listSpecialties, updateSpecialty } from "../modules/specialties/specialty-service.js";
import { listSchedule, reorderEventSchedule, reorderScheduleEntry, addTroupeToSchedule, removeScheduleEntry } from "../modules/schedule/schedule-service.js";
import {
  createCriterion,
  createItem,
  createRubric,
  createRubricWithInitialItem,
  getOrphanedCriteria,
  getRubric,
  listCriteriaByItem,
  listRubrics,
  createNomination,
  setNominationActive,
  reorderCriterion,
  reorderItem,
  updateCriterion,
  updateItem,
  updateRubric,
} from "../modules/rubrics/rubric-service.js";
import { getReadiness, getOpenEventOperation, openEvent, openEventOperation } from "../modules/events/event-readiness.service.js";
import { sendKnownError } from "./http-errors.js";

function generateCode(name) {
  return name
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function createWriteHandler(action, entityType, operation, authorize = null) {
  return async (request, response, next) => {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const authorization = authorize ? await authorize(client, request) : null;
      if (authorize && !authorization) {
        await client.query("ROLLBACK");
        return response.status(403).json({ code: "ADMIN_REQUIRED" });
      }
      const result = await operation(client, request, authorization);
      await auditEvent(client, {
        actorUserId: request.user.id,
        action,
        entityType,
        entityId: result.id,
        after: result,
      });
      await client.query("COMMIT");
      response.status(action.endsWith("CREATED") ? 201 : 200).json(result);
    } catch (error) {
      await client.query("ROLLBACK");
      if (sendKnownError(response, error)) return;
      next(error);
    } finally {
      client.release();
    }
  };
}

export function createEventsRouter({ requireSession }) {
  const router = Router();
  const admin = [requireSession, requireTwoFactor, requireAdmin];

  router.get("/events/:eventId/nights", requireSession, requireTwoFactor, async (request, response, next) => {
    try {
      const { eventId } = request.params;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId)) {
        return response.status(400).json({ code: "VALIDATION_ERROR" });
      }
      const { rows } = await getPool().query(
        "SELECT role_code FROM user_role WHERE user_id = $1 ORDER BY role_code",
        [request.user.id],
      );
      request.roles = rows.map((row) => row.role_code);
      if (!request.roles.includes("ADMIN") && !await hasEventAdminAccess({ userId: request.user.id, eventId, db: getPool() })) {
        return response.status(403).json({ code: "ADMIN_REQUIRED" });
      }
      const nights = await listNights({ eventId });
      return response.json(nights);
    } catch (error) {
      if (error.message === "EVENT_NOT_FOUND") return response.status(404).json({ code: error.message });
      return next(error);
    }
  });

  router.patch("/events/:eventId", requireSession, requireTwoFactor, (request, response, next) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(request.params.eventId)) {
      return response.status(400).json({ code: "VALIDATION_ERROR" });
    }
    return next();
  }, createWriteHandler(
    "EVENT_UPDATED",
    "carnival_event",
    (client, request, role) => updateEvent({
      client,
      eventId: request.params.eventId,
      ...(role === "ADMIN_EVENT" ? { name: request.body?.name } : request.body),
    }),
    async (client, request) => {
      const eventId = request.params.eventId;
      const { rows: roleRows } = await client.query(
        "SELECT role_code FROM user_role WHERE user_id = $1 ORDER BY role_code",
        [request.user.id],
      );
      const roles = roleRows.map((row) => row.role_code);
      request.roles = roles;
      if (roles.includes("ADMIN")) return "ADMIN";
      if (Object.prototype.hasOwnProperty.call(request.body ?? {}, "active")) return false;
      if (!await hasEventAdminAccess({ userId: request.user.id, eventId, db: client })) return false;
      const { rowCount } = await client.query(
        `SELECT event.id
           FROM carnival_event AS event
           JOIN admin_event_assignment AS assignment
             ON assignment.event_id = event.id
            AND assignment.user_id = $2
            AND assignment.is_active = TRUE
          WHERE event.id = $1 AND event.active = TRUE
          FOR UPDATE OF event, assignment`,
        [eventId, request.user.id],
      );
      return rowCount === 1 ? "ADMIN_EVENT" : false;
    },
  ));

  router.post("/events/:eventId/nights", requireSession, requireTwoFactor, (request, response, next) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(request.params.eventId)) {
      return response.status(400).json({ code: "VALIDATION_ERROR" });
    }
    return next();
  }, createWriteHandler(
    "NIGHT_CREATED",
    "night",
    (client, request) => createNight({ client, eventId: request.params.eventId, ...request.body }),
    async (client, request) => {
      const eventId = request.params.eventId;
      const { rows: roleRows } = await client.query(
        "SELECT role_code FROM user_role WHERE user_id = $1 ORDER BY role_code",
        [request.user.id],
      );
      const roles = roleRows.map((row) => row.role_code);
      request.roles = roles;
      if (roles.includes("ADMIN")) return "ADMIN";
      if (!await hasEventAdminAccess({ userId: request.user.id, eventId, db: client })) return false;
      const { rowCount } = await client.query(
        `SELECT event.id
           FROM carnival_event AS event
           JOIN admin_event_assignment AS assignment
             ON assignment.event_id = event.id
            AND assignment.user_id = $2
            AND assignment.is_active = TRUE
          WHERE event.id = $1 AND event.active = TRUE
          FOR UPDATE OF event, assignment`,
        [eventId, request.user.id],
      );
      return rowCount === 1 ? "ADMIN_EVENT" : false;
    },
  ));

  router.patch("/nights/:nightId", requireSession, requireTwoFactor, (request, response, next) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(request.params.nightId)) {
      return response.status(400).json({ code: "VALIDATION_ERROR" });
    }
    return next();
  }, createWriteHandler(
    "NIGHT_UPDATED",
    "night",
    (client, request) => updateNight({
      client,
      ...request.body,
      actorUserId: request.user.id,
      nightId: request.params.nightId,
    }),
    async (client, request) => {
      const { rows: roleRows } = await client.query(
        "SELECT role_code FROM user_role WHERE user_id = $1 ORDER BY role_code",
        [request.user.id],
      );
      const roles = roleRows.map((row) => row.role_code);
      request.roles = roles;
      if (roles.includes("ADMIN")) return "ADMIN";
      const { rowCount } = await client.query(
        `SELECT night.id
           FROM night
           JOIN carnival_event AS event ON event.id = night.event_id
           JOIN admin_event_assignment AS assignment
             ON assignment.event_id = event.id
            AND assignment.user_id = $2
            AND assignment.is_active = TRUE
          WHERE night.id = $1 AND event.active = TRUE
          FOR UPDATE OF night, event, assignment`,
        [request.params.nightId, request.user.id],
      );
      return rowCount === 1 ? "ADMIN_EVENT" : false;
    },
  ));

  router.delete("/nights/:nightId", requireSession, requireTwoFactor, async (request, response, next) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(request.params.nightId)) {
      return response.status(400).json({ code: "VALIDATION_ERROR" });
    }

    const client = await getPool().connect();
    let transactionOpen = false;
    try {
      await client.query("BEGIN");
      transactionOpen = true;
      const { rows: roleRows } = await client.query(
        "SELECT role_code FROM user_role WHERE user_id = $1 ORDER BY role_code",
        [request.user.id],
      );
      const roles = roleRows.map((row) => row.role_code);
      request.roles = roles;

      if (!roles.includes("ADMIN")) {
        const { rows: owners } = await client.query(
          `SELECT night.id, night.event_id AS "eventId", event.active AS "eventActive"
             FROM night
             JOIN carnival_event AS event ON event.id = night.event_id
            WHERE night.id = $1
            FOR UPDATE OF night, event`,
          [request.params.nightId],
        );
        if (!owners[0]) {
          await client.query("ROLLBACK");
          transactionOpen = false;
          return response.status(404).json({ code: "NIGHT_NOT_FOUND" });
        }
        if (!owners[0].eventActive) {
          await client.query("ROLLBACK");
          transactionOpen = false;
          return response.status(403).json({ code: "ADMIN_REQUIRED" });
        }
        const { rowCount } = await client.query(
          `SELECT 1 FROM admin_event_assignment
            WHERE user_id = $1 AND event_id = $2 AND is_active = TRUE
            FOR UPDATE`,
          [request.user.id, owners[0].eventId],
        );
        if (rowCount !== 1) {
          await client.query("ROLLBACK");
          transactionOpen = false;
          return response.status(403).json({ code: "ADMIN_REQUIRED" });
        }
      }

      const deleted = await deleteNight({
        client,
        nightId: request.params.nightId,
        actorUserId: request.user.id,
      });
      await client.query("COMMIT");
      transactionOpen = false;
      return response.json(deleted);
    } catch (error) {
      if (transactionOpen) {
        await client.query("ROLLBACK").catch(() => {});
        transactionOpen = false;
      }
      if (error.message === "NIGHT_NOT_FOUND") return response.status(404).json({ code: error.message });
      if (!sendKnownError(response, error)) return next(error);
    } finally {
      client.release();
    }
  });

  // Logo de comparsa — lectura operativa, escritura ADMIN (Spec 029).
  // Se registra antes del bloque admin de /troupes para que el jurado pueda
  // identificar la comparsa durante la votación. La lectura sigue exigiendo
  // sesión y 2FA; la escritura (PUT/DELETE) queda abajo bajo `...admin`.
  router.get("/troupes/:troupeId/logo", requireSession, requireTwoFactor, async (request, response, next) => {
    try {
      const logo = await getTroupeLogo({ troupeId: request.params.troupeId });
      if (!logo) return response.status(404).json({ code: "TROUPE_LOGO_NOT_FOUND" });
      response.set("Content-Type", logo.logoMime);
      response.set("X-Content-Type-Options", "nosniff");
      // Un SVG servido desde el mismo origen queda aislado: no puede ejecutar
      // script ni cargar recursos externos aunque se abra en una pestaña.
      response.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
      response.set("ETag", `"${logo.logoSha256}"`);
      response.set("Cache-Control", "private, max-age=86400");
      if (request.headers["if-none-match"] === `"${logo.logoSha256}"`) return response.status(304).end();
      return response.status(200).send(logo.logoData);
    } catch (error) {
      if (error.message === "TROUPE_NOT_FOUND") return response.status(404).json({ code: error.message });
      return next(error);
    }
  });

  router.get("/events", requireSession, requireTwoFactor, async (request, response, next) => {
    try {
      const { rows: roleRows } = await getPool().query(
        "SELECT role_code FROM user_role WHERE user_id = $1 ORDER BY role_code",
        [request.user.id],
      );
      if (roleRows.some((row) => row.role_code === "ADMIN")) {
        return response.json(await listEvents());
      }

      const events = await listEvents({ userId: request.user.id });
      if (events.length === 0) return response.status(403).json({ code: "ADMIN_REQUIRED" });
      return response.json(events);
    } catch (error) {
      return next(error);
    }
  });

  router.get("/events/:eventId", requireSession, requireTwoFactor, async (request, response, next) => {
    try {
      const { eventId } = request.params;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId)) {
        return response.status(400).json({ code: "VALIDATION_ERROR" });
      }
      const { rows: roleRows } = await getPool().query(
        "SELECT role_code FROM user_role WHERE user_id = $1 ORDER BY role_code",
        [request.user.id],
      );
      if (!roleRows.some((row) => row.role_code === "ADMIN")
          && !await hasEventAdminAccess({ userId: request.user.id, eventId, db: getPool() })) {
        return response.status(403).json({ code: "ADMIN_REQUIRED" });
      }
      const event = await getEvent({ eventId });
      if (!event) return response.status(404).json({ code: "EVENT_NOT_FOUND" });
      return response.json(event);
    } catch (error) {
      return next(error);
    }
  });

  router.get("/events/:eventId/readiness", requireSession, requireTwoFactor, async (request, response, next) => {
    try {
      const { eventId } = request.params;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId)) {
        return response.status(400).json({ code: "VALIDATION_ERROR" });
      }
      const { rows: roleRows } = await getPool().query(
        "SELECT role_code FROM user_role WHERE user_id = $1 ORDER BY role_code",
        [request.user.id],
      );
      if (!roleRows.some((row) => row.role_code === "ADMIN")
          && !await hasEventAdminAccess({ userId: request.user.id, eventId, db: getPool() })) {
        return response.status(403).json({ code: "ADMIN_REQUIRED" });
      }
      return response.json(await getReadiness({ eventId }));
    } catch (error) {
      if (error.message === "EVENT_NOT_FOUND") return response.status(404).json({ code: error.message });
      return next(error);
    }
  });

  for (const prefix of [
    "/events",
    "/rubrics",
    "/nights",
    "/categories",
    "/troupes",
    "/specialties",
    "/evaluation-items",
    "/nominations",
    "/rubric-criteria",
    "/schedule",
  ]) {
    router.use(prefix, ...admin);
  }

  // ---- Events ----
  router.get("/events/:eventId/open-operations/:operationId", async (request, response, next) => {
    try {
      return response.json(await getOpenEventOperation({
        eventId: request.params.eventId,
        operationId: request.params.operationId,
      }));
    } catch (error) {
      if (error.message === "OPEN_OPERATION_NOT_FOUND") return response.status(404).json({ code: error.message });
      if (error.message === "IDEMPOTENCY_CONFLICT") return response.status(409).json({ code: error.message });
      if (error.message === "IDEMPOTENCY_KEY_REQUIRED") return response.status(400).json({ code: "VALIDATION_ERROR" });
      return next(error);
    }
  });
  router.post("/events/:eventId/open", async (request, response, next) => {
    try {
      const operationId = request.get("Idempotency-Key");
      if (!operationId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operationId)) {
        return response.status(400).json({ code: "IDEMPOTENCY_KEY_REQUIRED" });
      }
      const result = await openEventOperation({
        eventId: request.params.eventId,
        operationId,
        actorUserId: request.user.id,
      });
      if (result.error) return response.status(result.httpStatus).json(result.error);
      return response.status(result.httpStatus).json({ ...result.event, operation: result.operation });
    } catch (error) {
      if (error.message === "IDEMPOTENCY_KEY_REQUIRED") return response.status(400).json({ code: error.message });
      if (error.message === "IDEMPOTENCY_CONFLICT") return response.status(409).json({ code: error.message });
      if (error.message === "EVENT_CONFIGURATION_INCOMPLETE") return response.status(409).json({ code: error.message, details: error.readiness });
      if (error.message === "EVENT_LOCKED") return response.status(409).json({ code: error.message });
      if (error.message === "EVENT_NOT_FOUND") return response.status(404).json({ code: error.message });
      return next(error);
    }
  });
  router.post("/events", createWriteHandler("EVENT_CREATED", "carnival_event", (client, request) => createEvent({ client, ...request.body })));
  router.patch("/events/:eventId", createWriteHandler("EVENT_UPDATED", "carnival_event", (client, request) => updateEvent({ client, eventId: request.params.eventId, ...request.body })));
  router.delete("/events/:eventId", async (request, response, next) => {
    try {
      response.json(await deleteEvent({ eventId: request.params.eventId, actorUserId: request.user.id }));
    } catch (error) {
      if (error.message === "EVENT_NOT_FOUND") return response.status(404).json({ code: error.message });
      if (!sendKnownError(response, error)) next(error);
    }
  });
  router.post("/events/:eventId/nights", createWriteHandler("NIGHT_CREATED", "night", (client, request) => createNight({ client, eventId: request.params.eventId, ...request.body })));
  router.patch("/nights/:nightId", createWriteHandler("NIGHT_UPDATED", "night", (client, request) => updateNight({ client, actorUserId: request.user.id, nightId: request.params.nightId, ...request.body })));
  // ---- Categories ----
  router.get("/events/:eventId/categories", async (request, response, next) => {
    try { return response.json(await listCategories({ eventId: request.params.eventId, eligible: request.query.eligible === "true" })); } catch (error) { return next(error); }
  });
  router.post("/events/:eventId/categories", createWriteHandler("CATEGORY_CREATED", "event_category", (client, request) => {
    const body = { ...request.body };
    if (!body.code) body.code = generateCode(body.name || "");
    return createCategory({ client, eventId: request.params.eventId, ...body });
  }));
  router.patch("/categories/:categoryId", createWriteHandler("CATEGORY_UPDATED", "event_category", (client, request) => updateCategory({ client, categoryId: request.params.categoryId, ...request.body })));

  // ---- Troupes ----
  router.get("/events/:eventId/troupes", async (request, response, next) => { try { return response.json(await listTroupes({ eventId: request.params.eventId })); } catch (error) { return next(error); } });
  router.post("/events/:eventId/troupes", createWriteHandler("TROUPE_CREATED", "event_troupe", (client, request) => createTroupe({ client, eventId: request.params.eventId, ...request.body })));
  router.patch("/troupes/:troupeId", createWriteHandler("TROUPE_UPDATED", "event_troupe", (client, request) => updateTroupe({ client, troupeId: request.params.troupeId, ...request.body })));

  // Logo de comparsa. Se almacena como BYTEA (migración 083) y se sirve como
  // binario: el listado sólo expone hasLogo/logoSha256, nunca los bytes.
  // La lectura vive más arriba (antes del bloque admin) para que el jurado
  // pueda identificarlo; la escritura exige ADMIN.
  router.put(
    "/troupes/:troupeId/logo",
    ...admin,
    // El parser crudo acepta cualquier Content-Type: la autoridad es la firma
    // de los bytes (validateTroupeLogo), no la cabecera declarada.
    express.raw({ type: () => true, limit: TROUPE_LOGO_MAX_BYTES }),
    createWriteHandler("TROUPE_LOGO_UPDATED", "event_troupe", (client, request) =>
      setTroupeLogo({
        client,
        troupeId: request.params.troupeId,
        data: Buffer.isBuffer(request.body) ? request.body : null,
        mime: request.get("content-type") || null,
      })),
  );
  router.delete("/troupes/:troupeId/logo", ...admin, createWriteHandler("TROUPE_LOGO_DELETED", "event_troupe", (client, request) => deleteTroupeLogo({ client, troupeId: request.params.troupeId })));

  // ---- Specialties ----
  router.get("/events/:eventId/specialties", async (request, response, next) => { try { return response.json(await listSpecialties({ eventId: request.params.eventId })); } catch (error) { return next(error); } });
  router.post("/events/:eventId/specialties", createWriteHandler("SPECIALTY_CREATED", "event_specialty", (client, request) => {
    const body = { ...request.body };
    if (!body.code) body.code = generateCode(body.name || "");
    return createSpecialty({ client, eventId: request.params.eventId, ...body });
  }));
  router.patch("/specialties/:specialtyId", createWriteHandler("SPECIALTY_UPDATED", "event_specialty", (client, request) => updateSpecialty({ client, specialtyId: request.params.specialtyId, ...request.body })));

  // ---- Rubrics ----
  router.get("/events/:eventId/rubrics", async (request, response, next) => { try { return response.json(await listRubrics({ eventId: request.params.eventId })); } catch (error) { return next(error); } });
  router.get("/rubrics/:rubricId", async (request, response, next) => {
    try {
      const rubric = await getRubric({ rubricId: request.params.rubricId });
      if (!rubric) return response.status(404).json({ code: "RUBRIC_NOT_FOUND" });
      return response.json(rubric);
    } catch (error) { return next(error); }
  });
  router.post("/events/:eventId/rubrics", createWriteHandler("RUBRIC_CREATED", "rubric", (client, request) => {
    const body = { ...request.body };
    if (!body.code) body.code = generateCode(body.name || "");
    return createRubric({ client, eventId: request.params.eventId, ...body });
  }));
  router.patch("/rubrics/:rubricId", createWriteHandler("RUBRIC_UPDATED", "rubric", (client, request) => updateRubric({ ...request.body, client, rubricId: request.params.rubricId })));

  // Alta de rubro desde la tarjeta de especialidad: crea rubro + primer ítem en
  // una sola transacción, para no dejar rubros sin ítems puntuables.
  router.post("/events/:eventId/rubrics-with-item", createWriteHandler("RUBRIC_CREATED", "rubric", (client, request) => {
    const body = { ...request.body };
    const { initialItem, ...rubricInput } = body;
    if (!rubricInput.code) rubricInput.code = generateCode(rubricInput.name || "");
    return createRubricWithInitialItem({ client, eventId: request.params.eventId, rubric: rubricInput, initialItem: initialItem ?? {} });
  }));

  router.post("/rubrics/:rubricId/nominations", createWriteHandler("TROUPE_NOMINATION_CREATED", "troupe_nomination", (client, request) => {
    const { eventTroupeId, displayName } = request.body ?? {};
    return createNomination({ client, rubricId: request.params.rubricId, eventTroupeId, displayName });
  }));
  router.patch("/nominations/:nominationId", createWriteHandler("TROUPE_NOMINATION_UPDATED", "troupe_nomination", (client, request) => {
    const { active } = request.body ?? {};
    return setNominationActive({ client, nominationId: request.params.nominationId, active });
  }));

  // ---- Evaluation Items ----
  router.get("/rubrics/:rubricId/items", async (request, response, next) => {
    try {
      const rubric = await getRubric({ rubricId: request.params.rubricId });
      if (!rubric) return response.status(404).json({ code: "RUBRIC_NOT_FOUND" });
      return response.json(rubric.items);
    } catch (error) { return next(error); }
  });
  router.post("/rubrics/:rubricId/items", createWriteHandler("EVALUATION_ITEM_CREATED", "evaluation_item", (client, request) => {
    const body = { ...request.body };
    if (!body.code) body.code = generateCode(body.name || "");
    return createItem({ ...body, client, rubricId: request.params.rubricId });
  }));
  router.patch("/evaluation-items/:itemId", createWriteHandler("EVALUATION_ITEM_UPDATED", "evaluation_item", (client, request) => updateItem({ ...request.body, client, itemId: request.params.itemId })));

  // ---- Criteria ----
  router.get("/rubrics/:rubricId/criteria", async (request, response, next) => {
    try {
      const rubric = await getRubric({ rubricId: request.params.rubricId });
      if (!rubric) return response.status(404).json({ code: "RUBRIC_NOT_FOUND" });
      return response.json(rubric.criteria);
    } catch (error) { return next(error); }
  });
  router.get("/rubrics/:rubricId/items/:itemId/criteria", async (request, response, next) => {
    try { return response.json(await listCriteriaByItem({ rubricId: request.params.rubricId, scoringItemId: request.params.itemId })); } catch (error) { return next(error); }
  });
  router.post("/rubrics/:rubricId/criteria", createWriteHandler("RUBRIC_CRITERION_CREATED", "rubric_criterion", (client, request) => createCriterion({ ...request.body, client, rubricId: request.params.rubricId })));
  router.patch("/rubric-criteria/:criterionId", createWriteHandler("RUBRIC_CRITERION_UPDATED", "rubric_criterion", (client, request) => updateCriterion({ ...request.body, client, criterionId: request.params.criterionId })));

  for (const [path, idKey, operation] of [
    ["/evaluation-items/:itemId/reorder", "itemId", reorderItem],
    ["/rubric-criteria/:criterionId/reorder", "criterionId", reorderCriterion],
  ]) {
    router.post(path, async (request, response, next) => {
      try {
        const { direction, neighborId, expectedOrder, expectedNeighborOrder } = request.body ?? {};
        response.json(await operation({
          [idKey]: request.params[idKey], actorUserId: request.user.id,
          direction, neighborId, expectedOrder, expectedNeighborOrder,
        }));
      } catch (error) {
        if (!sendKnownError(response, error)) next(error);
      }
    });
  }

  // ---- Orphaned Criteria ----
  router.get("/events/:eventId/orphaned-criteria", async (request, response, next) => {
    try { return response.json(await getOrphanedCriteria({ eventId: request.params.eventId })); } catch (error) { return next(error); }
  });

  // ---- Night schedule (presentation order, Spec 017 T09b) ----
  router.get("/events/:eventId/schedule", async (request, response, next) => {
    try {
      const nightId = typeof request.query.nightId === "string" && request.query.nightId.length > 0
        ? request.query.nightId
        : null;
      return response.json(await listSchedule({ eventId: request.params.eventId, nightId }));
    } catch (error) { return next(error); }
  });
  router.post("/schedule/:scheduleId/reorder", async (request, response, next) => {
    try {
      const { direction, neighborId, expectedOrder, expectedNeighborOrder } = request.body ?? {};
      response.json(await reorderScheduleEntry({
        scheduleId: request.params.scheduleId, actorUserId: request.user.id,
        direction, neighborId, expectedOrder, expectedNeighborOrder,
      }));
    } catch (error) {
      if (!sendKnownError(response, error)) next(error);
    }
  });
  router.patch("/events/:eventId/schedule/reorder", async (request, response, next) => {
    try {
      const { nightId, orderedIds, reason } = request.body ?? {};
      response.json(await reorderEventSchedule({
        eventId: request.params.eventId, nightId, orderedIds, reason,
        actorUserId: request.user.id,
      }));
    } catch (error) {
      if (!sendKnownError(response, error)) next(error);
    }
  });
  router.post("/events/:eventId/schedule", async (request, response, next) => {
    try {
      const { nightId, troupeId } = request.body ?? {};
      response.status(201).json(await addTroupeToSchedule({
        eventId: request.params.eventId, nightId, troupeId, actorUserId: request.user.id,
      }));
    } catch (error) {
      if (error.message === "SCHEDULE_CONFLICT") return response.status(409).json({ code: error.message });
      if (error.message === "NIGHT_NOT_FOUND" || error.message === "TROUPE_NOT_FOUND") {
        return response.status(404).json({ code: error.message });
      }
      if (!sendKnownError(response, error)) next(error);
    }
  });
  router.delete("/schedule/:scheduleId", async (request, response, next) => {
    try {
      response.json(await removeScheduleEntry({ scheduleId: request.params.scheduleId, actorUserId: request.user.id }));
    } catch (error) {
      if (error.message === "NIGHT_TROUPE_SCHEDULE_NOT_FOUND") {
        return response.status(404).json({ code: error.message });
      }
      if (!sendKnownError(response, error)) next(error);
    }
  });

  return router;
}
