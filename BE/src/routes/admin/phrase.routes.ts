import { Router } from "express";
import {
  bulkDeletePhrases,
  createPhrase,
  deletePhrase,
  deletePhraseImageLink,
  generateLessonPhrasesAudio,
  generatePhraseAudioById,
  getPhraseById,
  linkPhraseImage,
  listPhraseImages,
  listPhrases,
  publishPhrase,
  updatePhraseImageLink,
  updatePhrase
} from "../../controllers/admin/phrase.controller.js";
import { requireAdmin, requireAuth } from "../../utils/authMiddleware.js";

const router = Router();

router.use(requireAuth, requireAdmin);

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
router.delete("/:id", deletePhrase);

router.put("/:id/publish", publishPhrase);

export default router;
