import { Router } from "express";
import { bulkDeleteSentences, createSentence, deleteSentence, finishSentence, generateLessonSentencesAudio, generateSentenceAudioById, getSentenceById, listSentences, publishSentence, updateSentence } from "../../controllers/admin/sentence.controller.js";
import { requireAdmin, requireAuth } from "../../utils/authMiddleware.js";

const router = Router();
router.use(requireAuth, requireAdmin);
router.post("/", createSentence);
router.delete("/bulk-delete", bulkDeleteSentences);
router.get("/", listSentences);
router.put("/bulk/:lessonId/generate-audio", generateLessonSentencesAudio);
router.put("/:id/generate-audio", generateSentenceAudioById);
router.put("/:id/finish", finishSentence);
router.get("/:id", getSentenceById);
router.put("/:id", updateSentence);
router.delete("/:id", deleteSentence);
router.put("/:id/publish", publishSentence);
export default router;
