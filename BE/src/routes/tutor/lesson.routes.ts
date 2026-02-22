import { Router } from "express";
import {
  createLesson,
  deleteLesson,
  finishLesson,
  getLessonById,
  listLessons,
  reorderLessons,
  updateLesson
} from "../../controllers/tutor/lesson.controller.js";
import { requireAuth, requireTutor } from "../../utils/authMiddleware.js";

const router = Router();

router.use(requireAuth, requireTutor);

router.post("/", createLesson);
router.get("/", listLessons);
router.put("/reorder", reorderLessons);
router.get("/:id", getLessonById);
router.put("/:id", updateLesson);
router.put("/:id/finish", finishLesson);
router.delete("/:id", deleteLesson);

export default router;
