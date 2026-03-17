import { Router } from "express";
import {
  enhancePhrase,
  refactorLessonContent,
  generatePhrases,
  generateProverbs,
  generateUnitContent,
  reviseUnitContent,
  suggestLesson
} from "../../controllers/tutor/ai.controller.js";
import { requireAuth, requireTutor } from "../../utils/authMiddleware.js";

const router = Router();

router.use(requireAuth, requireTutor);

router.post("/lessons/suggest", suggestLesson);
router.post("/lessons/:lessonId/refactor", refactorLessonContent);
router.post("/units/:unitId/generate-content", generateUnitContent);
router.post("/units/:unitId/revise", reviseUnitContent);
router.post("/phrases/generate", generatePhrases);
router.post("/phrases/:id/enhance", enhancePhrase);
router.post("/proverbs/generate", generateProverbs);

export default router;
