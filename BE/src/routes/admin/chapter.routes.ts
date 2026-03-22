import { Router } from "express";
import { requireAdmin, requireAuth } from "../../utils/authMiddleware.js";
import {
  createChapter,
  deleteChapter,
  finishChapter,
  getChapterById,
  listChapters,
  publishChapter,
  reorderChapters,
  updateChapter
} from "../../controllers/admin/chapter.controller.js";

const router = Router();

router.use(requireAuth, requireAdmin);
router.post("/", createChapter);
router.get("/", listChapters);
router.put("/reorder", reorderChapters);
router.get("/:id", getChapterById);
router.put("/:id", updateChapter);
router.put("/:id/finish", finishChapter);
router.put("/:id/publish", publishChapter);
router.delete("/:id", deleteChapter);

export default router;
