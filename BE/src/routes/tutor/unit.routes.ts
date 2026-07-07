import { Router } from "express";
import {
  createUnit,
  deleteUnit,
  finishUnit,
  getDeletedEntries,
  getUnitById,
  listUnits,
  reorderUnits,
  restoreDeletedExpression,
  restoreDeletedLesson,
  restoreDeletedProverb,
  restoreDeletedSentence,
  restoreDeletedWord,
  updateUnit
} from "../../controllers/tutor/unit.controller.js";
import { requireAuth, requireTutor } from "../../utils/authMiddleware.js";

const router = Router();

router.use(requireAuth, requireTutor);

router.post("/", createUnit);
router.get("/", listUnits);
router.put("/reorder", reorderUnits);
router.get("/:id/deleted-entries", getDeletedEntries);
router.post("/:id/deleted-lessons/:lessonId/restore", restoreDeletedLesson);
router.post("/:id/deleted-words/:wordId/restore", restoreDeletedWord);
router.post("/:id/deleted-expressions/:expressionId/restore", restoreDeletedExpression);
router.post("/:id/deleted-sentences/:sentenceId/restore", restoreDeletedSentence);
router.post("/:id/deleted-proverbs/:proverbId/restore", restoreDeletedProverb);
router.get("/:id", getUnitById);
router.put("/:id", updateUnit);
router.put("/:id/finish", finishUnit);
router.delete("/:id", deleteUnit);

export default router;
