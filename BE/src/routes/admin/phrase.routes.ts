import { Router } from "express";
import {
  bulkDeletePhrases,
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

router.use(requireAuth, requireAdmin);

router.post("/", createPhrase);
router.delete("/bulk-delete", bulkDeletePhrases);
router.get("/", listPhrases);
router.put("/bulk/:lessonId/generate-audio", generateLessonPhrasesAudio);
router.put("/:id/generate-audio", generatePhraseAudioById);
router.get("/:id", getPhraseById);
router.put("/:id", updatePhrase);
router.delete("/:id", deletePhrase);

router.put("/:id/publish", publishPhrase);

export default router;
