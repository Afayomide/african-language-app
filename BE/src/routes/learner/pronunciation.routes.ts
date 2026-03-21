import { Router } from "express";
import { comparePronunciation } from "../../controllers/learner/pronunciation.controller.js";
import { requireAuth, requireLearner } from "../../utils/authMiddleware.js";

const router = Router();

router.use(requireAuth, requireLearner);
router.post("/:contentType/:id/compare", comparePronunciation);

export default router;
