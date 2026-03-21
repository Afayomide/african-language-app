import { Router } from "express";
import {
  applyUnitContentPlan,
  generateChaptersBulk,
  generateLessonsBulk,
  generateProverbs,
  generateUnitContent,
  generateUnitsBulk,
  previewUnitContentPlan,
  refactorLessonContent,
  reviseUnitContent
} from "../../controllers/admin/lessonAi.controller.js";
import { requireAdmin, requireAuth } from "../../utils/authMiddleware.js";

const router = Router();

router.use(requireAuth, requireAdmin);

router.post("/chapters/generate-bulk", generateChaptersBulk);
router.post("/lessons/generate-bulk", generateLessonsBulk);
router.post("/units/generate-bulk", generateUnitsBulk);
router.post("/units/:unitId/generate-content/plan", previewUnitContentPlan);
router.post("/units/:unitId/generate-content/apply", applyUnitContentPlan);
router.post("/units/:unitId/generate-content", generateUnitContent);
router.post("/units/:unitId/revise", reviseUnitContent);
router.post("/lessons/:lessonId/refactor", refactorLessonContent);
router.post("/proverbs/generate", generateProverbs);

export default router;
