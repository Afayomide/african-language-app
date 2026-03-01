import { Router } from "express";
import { generateLessonsBulk, generateProverbs } from "../../controllers/admin/lessonAi.controller.js";
import { requireAdmin, requireAuth } from "../../utils/authMiddleware.js";

const router = Router();

router.use(requireAuth, requireAdmin);

router.post("/lessons/generate-bulk", generateLessonsBulk);
router.post("/proverbs/generate", generateProverbs);

export default router;
