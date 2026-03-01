import { Router } from "express";
import {
  createProverb,
  deleteProverb,
  finishProverb,
  getProverbById,
  listProverbs,
  publishProverb,
  updateProverb
} from "../../controllers/admin/proverb.controller.js";
import { requireAdmin, requireAuth } from "../../utils/authMiddleware.js";

const router = Router();

router.use(requireAuth, requireAdmin);

router.post("/", createProverb);
router.get("/", listProverbs);
router.get("/:id", getProverbById);
router.put("/:id", updateProverb);
router.delete("/:id", deleteProverb);
router.put("/:id/finish", finishProverb);
router.put("/:id/publish", publishProverb);

export default router;

