import { Router } from "express";
import {
  applyUnitContentPlan,
  enhanceExpression,
  generateChaptersBulk,
  generateUnitsBulk,
  refactorLessonContent,
  generateExpressions,
  generateSentences,
  generateWords,
  generateProverbs,
  generateUnitContent,
  previewUnitContentPlan,
  reviseUnitContent,
  suggestLesson
} from "../../controllers/tutor/ai.controller.js";
import { requireAuth, requireTutor } from "../../utils/authMiddleware.js";

const router = Router();

router.use(requireAuth, requireTutor);

router.post("/chapters/generate-bulk", generateChaptersBulk);
router.post("/units/generate-bulk", generateUnitsBulk);
router.post("/lessons/suggest", suggestLesson);
router.post("/lessons/:lessonId/refactor", refactorLessonContent);
router.post("/units/:unitId/generate-content/plan", previewUnitContentPlan);
router.post("/units/:unitId/generate-content/apply", applyUnitContentPlan);
router.post("/units/:unitId/generate-content", generateUnitContent);
router.post("/units/:unitId/revise", reviseUnitContent);
router.post("/expressions/generate", generateExpressions);
router.post("/words/generate", generateWords);
router.post("/sentences/generate", generateSentences);
router.post("/expressions/:id/enhance", enhanceExpression);
router.post("/proverbs/generate", generateProverbs);

export default router;
