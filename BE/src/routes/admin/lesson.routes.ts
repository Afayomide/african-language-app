import { Router } from "express";
import {
  createLesson,
  deleteLesson,
  getLessonById,
  listLessons,
  publishLesson,
  reorderLessons,
  updateLesson
} from "../../controllers/admin/lesson.controller.js";
import { requireAdmin, requireAuth } from "../../utils/authMiddleware.js";

const router = Router();

router.use(requireAuth);

router.post("/", createLesson);
router.get("/", listLessons);
router.put("/reorder", requireAdmin, reorderLessons);
router.get("/:id", getLessonById);
router.put("/:id", updateLesson);
router.delete("/:id", deleteLesson);

router.put("/:id/publish", requireAdmin, publishLesson);

export default router;
