import { Router } from "express";
import {
  generateLessonsBulk,
  generateProverbs,
  generateUnitContent,
  generateUnitsBulk
} from "../../controllers/admin/lessonAi.controller.js";
import { requireAdmin, requireAuth } from "../../utils/authMiddleware.js";

const router = Router();

router.use(requireAuth, requireAdmin);

router.post("/lessons/generate-bulk", generateLessonsBulk);
router.post("/units/generate-bulk", generateUnitsBulk);
router.post("/units/:unitId/generate-content", generateUnitContent);
router.post("/proverbs/generate", generateProverbs);

export default router;
