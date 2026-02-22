import { Router } from "express";
import {
  createPhrase,
  deletePhrase,
  generateLessonPhrasesAudio,
  generatePhraseAudioById,
  getPhraseById,
  listPhrases,
  publishPhrase,
  updatePhrase
} from "../../controllers/admin/phrase.controller.js";
import { requireAdmin, requireAuth } from "../../utils/authMiddleware.js";

const router = Router();

router.use(requireAuth);

router.post("/", createPhrase);
router.get("/", listPhrases);
router.put("/bulk/:lessonId/generate-audio", requireAdmin, generateLessonPhrasesAudio);
router.put("/:id/generate-audio", requireAdmin, generatePhraseAudioById);
router.get("/:id", getPhraseById);
router.put("/:id", updatePhrase);
router.delete("/:id", deletePhrase);

router.put("/:id/publish", requireAdmin, publishPhrase);

export default router;
