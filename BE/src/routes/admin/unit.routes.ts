import { Router } from "express";
import {
  createUnit,
  deleteUnit,
  finishUnit,
  getDeletedEntries,
  getUnitById,
  listUnits,
  publishUnit,
  reorderUnits,
  restoreDeletedExpression,
  restoreDeletedLesson,
  updateUnit
} from "../../controllers/admin/unit.controller.js";
import { requireAdmin, requireAuth } from "../../utils/authMiddleware.js";

const router = Router();

router.use(requireAuth, requireAdmin);

router.post("/", createUnit);
router.get("/", listUnits);
router.put("/reorder", reorderUnits);
router.get("/:id/deleted-entries", getDeletedEntries);
router.post("/:id/deleted-lessons/:lessonId/restore", restoreDeletedLesson);
router.post("/:id/deleted-expressions/:expressionId/restore", restoreDeletedExpression);
router.get("/:id", getUnitById);
router.put("/:id", updateUnit);
router.put("/:id/finish", finishUnit);
router.put("/:id/publish", publishUnit);
router.delete("/:id", deleteUnit);

export default router;
