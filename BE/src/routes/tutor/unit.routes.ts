import { Router } from "express";
import {
  createUnit,
  deleteUnit,
  finishUnit,
  getUnitById,
  listUnits,
  reorderUnits,
  updateUnit
} from "../../controllers/tutor/unit.controller.js";
import { requireAuth, requireTutor } from "../../utils/authMiddleware.js";

const router = Router();

router.use(requireAuth, requireTutor);

router.post("/", createUnit);
router.get("/", listUnits);
router.put("/reorder", reorderUnits);
router.get("/:id", getUnitById);
router.put("/:id", updateUnit);
router.put("/:id/finish", finishUnit);
router.delete("/:id", deleteUnit);

export default router;
