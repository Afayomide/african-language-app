import { Router } from "express";
import {
  completeLesson,
  completeStage,
  completeStep,
  getLessonOverview,
  getLessonFlow,
  getLessonExpressions,
  getLessonReviewExercises,
  getLessonQuestions,
  getLessonSteps,
  getNextLesson
} from "../../controllers/learner/lesson.controller.js";
import { requireAuth, requireLearner } from "../../utils/authMiddleware.js";

const router = Router();

router.use(requireAuth, requireLearner);

router.get("/next", getNextLesson);
// Legacy standalone adaptive-review endpoints are intentionally disabled.
// Review personalization now happens inside the next review lesson flow.
// router.get("/:id/adaptive-review", getAdaptiveReviewSuggestion);
// router.get("/:id/adaptive-review/flow", getAdaptiveReviewFlow);
router.get("/:id/flow", getLessonFlow);
router.get("/:id/overview", getLessonOverview);
router.get("/:id/steps", getLessonSteps);
router.get("/:id/expressions", getLessonExpressions);
router.get("/:id/review-exercises", getLessonReviewExercises);
router.get("/:id/questions", getLessonQuestions);
router.put("/:id/steps/:stepKey/complete", completeStep);
router.post("/:id/stages/:stageIndex/complete", completeStage);
router.post("/:id/complete", completeLesson);

export default router;
