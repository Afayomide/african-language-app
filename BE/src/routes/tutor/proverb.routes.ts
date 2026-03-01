import { Router } from "express";
import {
  createProverb,
  deleteProverb,
  finishProverb,
  getProverbById,
  listProverbs,
  updateProverb
} from "../../controllers/tutor/proverb.controller.js";
import { requireAuth, requireTutor } from "../../utils/authMiddleware.js";

const router = Router();

router.use(requireAuth, requireTutor);

router.post("/", createProverb);
router.get("/", listProverbs);
router.get("/:id", getProverbById);
router.put("/:id", updateProverb);
router.delete("/:id", deleteProverb);
router.put("/:id/finish", finishProverb);

export default router;

