import { Router } from "express";
import {
  completeLesson,
  completeStep,
  getLessonOverview,
  getLessonPhrases,
  getLessonReviewExercises,
  getLessonQuestions,
  getLessonSteps,
  getNextLesson
} from "../../controllers/learner/lesson.controller.js";
import { requireAuth, requireLearner } from "../../utils/authMiddleware.js";

const router = Router();

router.use(requireAuth, requireLearner);

router.get("/next", getNextLesson);
router.get("/:id/overview", getLessonOverview);
router.get("/:id/steps", getLessonSteps);
router.get("/:id/phrases", getLessonPhrases);
router.get("/:id/review-exercises", getLessonReviewExercises);
router.get("/:id/questions", getLessonQuestions);
router.put("/:id/steps/:stepKey/complete", completeStep);
router.post("/:id/complete", completeLesson);

export default router;
