import { Router } from "express";
import {
  enhanceExpression,
  generateExpressions,
  generateSentences,
  generateWords
} from "../../controllers/ai/expressionAi.controller.js";
import { requireAiKey } from "../../utils/aiKeyMiddleware.js";

const router = Router();

router.use(requireAiKey);

router.post("/expressions/generate", generateExpressions);
router.post("/words/generate", generateWords);
router.post("/sentences/generate", generateSentences);
router.post("/expressions/:id/enhance", enhanceExpression);

export default router;
