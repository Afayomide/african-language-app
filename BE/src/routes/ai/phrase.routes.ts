import { Router } from "express";
import { generatePhrases, enhancePhrase } from "../../controllers/ai/phraseAi.controller.js";
import { requireAiKey } from "../../utils/aiKeyMiddleware.js";

const router = Router();

router.use(requireAiKey);

router.post("/phrases/generate", generatePhrases);
router.post("/phrases/:id/enhance", enhancePhrase);

export default router;
