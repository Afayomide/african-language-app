import { Router } from "express";
import {
  bulkDeletePhrases,
  createPhrase,
  deletePhrase,
  deletePhraseImageLink,
  finishPhrase,
  generateLessonPhrasesAudio,
  generatePhraseAudioById,
  getPhraseById,
  linkPhraseImage,
  listPhraseImages,
  listPhrases,
  updatePhraseImageLink,
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
router.get("/:id/images", listPhraseImages);
router.post("/:id/images", linkPhraseImage);
router.put("/:id/images/:linkId", updatePhraseImageLink);
router.delete("/:id/images/:linkId", deletePhraseImageLink);
router.get("/:id", getPhraseById);
router.put("/:id", updatePhrase);
router.put("/:id/finish", finishPhrase);
router.delete("/:id", deletePhrase);

export default router;
