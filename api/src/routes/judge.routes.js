import { Router } from "express";
import { requireJudge } from "../auth/require-judge.js";
import { requireTwoFactor } from "../auth/two-factor.js";
import { getJudgeEventCompletion, listJudgeAssignments } from "../modules/judges/assignment-service.js";

export function createJudgeRouter({ requireSession, signOut }) {
  const router = Router();
  router.get("/judge/profile", requireSession, requireTwoFactor, requireJudge, async (request, response) => {
    const assignments = await listJudgeAssignments({ userId: request.user.id });
    response.json({
      id: request.judgeProfile.id,
      registrationStatus: request.judgeProfile.registrationStatus,
      assignments,
    });
  });
  router.get("/judge/session-status", requireSession, requireTwoFactor, requireJudge, async (request, response, next) => {
    try {
      const completion = await getJudgeEventCompletion({ judgeProfileId: request.judgeProfile.id });
      if (completion.eventEnded && signOut) {
        await signOut({ headers: new Headers(request.headers) });
      }
      response.json(completion);
    } catch (error) {
      next(error);
    }
  });
  return router;
}
