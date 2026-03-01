import { Router } from "express";
import {
  bulkDeleteLessons,
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

router.use(requireAuth, requireAdmin);

router.post("/", createLesson);
router.delete("/bulk-delete", bulkDeleteLessons);
router.get("/", listLessons);
router.put("/reorder", reorderLessons);
router.get("/:id", getLessonById);
router.put("/:id", updateLesson);
router.delete("/:id", deleteLesson);

router.put("/:id/publish", publishLesson);

export default router;
