import { Router } from "express";
import { generateLessonsBulk } from "../../controllers/admin/lessonAi.controller.js";
import { requireAdmin, requireAuth } from "../../utils/authMiddleware.js";

const router = Router();

router.use(requireAuth, requireAdmin);

router.post("/lessons/generate-bulk", generateLessonsBulk);

export default router;
