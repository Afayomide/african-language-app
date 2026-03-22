import { Router } from "express";
import { requireAuth, requireTutor } from "../../utils/authMiddleware.js";
import {
  createChapter,
  deleteChapter,
  finishChapter,
  getChapterById,
  listChapters,
  reorderChapters,
  updateChapter
} from "../../controllers/tutor/chapter.controller.js";

const router = Router();

router.use(requireAuth, requireTutor);
router.post("/", createChapter);
router.get("/", listChapters);
router.put("/reorder", reorderChapters);
router.get("/:id", getChapterById);
router.put("/:id", updateChapter);
router.put("/:id/finish", finishChapter);
router.delete("/:id", deleteChapter);

export default router;
