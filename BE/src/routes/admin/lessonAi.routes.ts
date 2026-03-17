import { Router } from "express";
import {
  generateLessonsBulk,
  generateProverbs,
  generateUnitContent,
  generateUnitsBulk,
  refactorLessonContent,
  reviseUnitContent
} from "../../controllers/admin/lessonAi.controller.js";
import { requireAdmin, requireAuth } from "../../utils/authMiddleware.js";

const router = Router();

router.use(requireAuth, requireAdmin);

router.post("/lessons/generate-bulk", generateLessonsBulk);
router.post("/units/generate-bulk", generateUnitsBulk);
router.post("/units/:unitId/generate-content", generateUnitContent);
router.post("/units/:unitId/revise", reviseUnitContent);
router.post("/lessons/:lessonId/refactor", refactorLessonContent);
router.post("/proverbs/generate", generateProverbs);

export default router;
