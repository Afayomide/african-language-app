import { Router } from "express";
import {
  bulkDeletePhrases,
  createPhrase,
  deletePhrase,
  finishPhrase,
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
router.delete("/bulk-delete", bulkDeletePhrases);
router.get("/", listPhrases);
router.put("/bulk/:lessonId/generate-audio", generateLessonPhrasesAudio);
router.put("/:id/generate-audio", generatePhraseAudioById);
router.get("/:id", getPhraseById);
router.put("/:id", updatePhrase);
router.put("/:id/finish", finishPhrase);
router.delete("/:id", deletePhrase);

export default router;
