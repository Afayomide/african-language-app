import { Router } from "express";
import { requireAdmin, requireAuth } from "../../utils/authMiddleware.js";
import {
  createChapter,
  deleteChapter,
  getChapterById,
  listChapters,
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
router.delete("/:id", deleteChapter);

export default router;
