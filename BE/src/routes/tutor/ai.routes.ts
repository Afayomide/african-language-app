import { Router } from "express";
import { enhancePhrase, generatePhrases, suggestLesson } from "../../controllers/tutor/ai.controller.js";
import { requireAuth, requireTutor } from "../../utils/authMiddleware.js";

const router = Router();

router.use(requireAuth, requireTutor);

router.post("/lessons/suggest", suggestLesson);
router.post("/phrases/generate", generatePhrases);
router.post("/phrases/:id/enhance", enhancePhrase);

export default router;
