import { Router } from "express";
import {
  createPhrase,
  deletePhrase,
  generateLessonPhrasesAudio,
  generatePhraseAudioById,
  getPhraseById,
  listPhrases,
  updatePhrase
} from "../../controllers/tutor/phrase.controller.js";
import { requireAuth, requireTutor } from "../../utils/authMiddleware.js";

const router = Router();

router.use(requireAuth, requireTutor);

router.post("/", createPhrase);
router.get("/", listPhrases);
router.put("/bulk/:lessonId/generate-audio", generateLessonPhrasesAudio);
router.put("/:id/generate-audio", generatePhraseAudioById);
router.get("/:id", getPhraseById);
router.put("/:id", updatePhrase);
router.delete("/:id", deletePhrase);

export default router;
