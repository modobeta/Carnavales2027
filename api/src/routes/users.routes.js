import { Router } from "express";
import { requireAdmin } from "../auth/require-admin.js";
import { grantAdminEventAssignment, listActiveAdminEventAssignments, revokeAdminEventAssignment } from "../auth/admin-event-assignment-service.js";
import { grantRole, revokeRole } from "../auth/role-service.js";
import { requireTwoFactor } from "../auth/two-factor.js";
import { sendKnownError } from "./http-errors.js";
import * as userController from "../modules/users/user-controller.js";

export function createUsersRouter({ requireSession, createUser }) {
  const router = Router();

  router.use((req, res, next) => {
    req.createUser = createUser;
    next();
  });

  router.post("/invitations/role/inspect", userController.getInvitation);
  router.post("/invitations/role/accept", userController.acceptInvitation);

  const admin = [requireSession, requireTwoFactor, requireAdmin];

  router.get("/events/:eventId/admin-assignments", ...admin, async (request, response, next) => {
    try {
      return response.json(await listActiveAdminEventAssignments({ eventId: request.params.eventId }));
    } catch (error) {
      if (error.message === "INVALID_EVENT_ID") return response.status(400).json({ code: "VALIDATION_ERROR" });
      if (error.message === "EVENT_NOT_FOUND") return response.status(404).json({ code: "EVENT_NOT_FOUND" });
      return next(error);
    }
  });

  router.put("/events/:eventId/admin-assignments/:userId", ...admin, async (request, response, next) => {
    try {
      const result = await grantAdminEventAssignment({
        actorUserId: request.user.id,
        eventId: request.params.eventId,
        userId: request.params.userId,
      });
      if (result.error === "VALIDATION_ERROR") return response.status(400).json({ code: result.error });
      if (result.error) return response.status(404).json({ code: result.error });
      return response.json(result);
    } catch (error) {
      if (sendKnownError(response, error)) return;
      return next(error);
    }
  });

  router.delete("/events/:eventId/admin-assignments/:userId", ...admin, async (request, response, next) => {
    try {
      const result = await revokeAdminEventAssignment({
        actorUserId: request.user.id,
        eventId: request.params.eventId,
        userId: request.params.userId,
      });
      if (result.error === "VALIDATION_ERROR") return response.status(400).json({ code: result.error });
      if (result.error) return response.status(404).json({ code: result.error });
      return response.json(result);
    } catch (error) {
      if (sendKnownError(response, error)) return;
      return next(error);
    }
  });

  router.get("/users", ...admin, userController.listUsers);
  router.post("/users/invitations", ...admin, userController.inviteUser);

  router.post("/users/:userId/roles/admin", ...admin, async (request, response, next) => {
    try {
      const result = await grantRole({
        actorUserId: request.user.id,
        userId: request.params.userId,
        roleCode: "ADMIN",
      });
      response.status(result.created ? 201 : 200).json(result);
    } catch (error) {
      if (error.code === "23503") return response.status(404).json({ code: "USER_NOT_FOUND" });
      if (sendKnownError(response, error)) return;
      return next(error);
    }
  });

  router.delete("/users/:userId/roles/admin", ...admin, async (request, response, next) => {
    try {
      return response.json(await revokeRole({
        actorUserId: request.user.id,
        userId: request.params.userId,
        roleCode: "ADMIN",
      }));
    } catch (error) {
      if (sendKnownError(response, error)) return;
      return next(error);
    }
  });

  return router;
}
