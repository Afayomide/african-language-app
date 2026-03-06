import { Router } from "express";
import {
  createUnit,
  deleteUnit,
  finishUnit,
  getUnitById,
  listUnits,
  publishUnit,
  reorderUnits,
  updateUnit
} from "../../controllers/admin/unit.controller.js";
import { requireAdmin, requireAuth } from "../../utils/authMiddleware.js";

const router = Router();

router.use(requireAuth, requireAdmin);

router.post("/", createUnit);
router.get("/", listUnits);
router.put("/reorder", reorderUnits);
router.get("/:id", getUnitById);
router.put("/:id", updateUnit);
router.put("/:id/finish", finishUnit);
router.put("/:id/publish", publishUnit);
router.delete("/:id", deleteUnit);

export default router;
