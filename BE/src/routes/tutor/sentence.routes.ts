import { Router } from "express";
import { bulkDeleteSentences, createSentence, deleteSentence, finishSentence, generateLessonSentencesAudio, generateSentenceAudioById, getSentenceById, listSentences, updateSentence } from "../../controllers/tutor/sentence.controller.js";
import { requireAuth, requireTutor } from "../../utils/authMiddleware.js";

const router = Router();
router.use(requireAuth, requireTutor);
router.post("/", createSentence);
router.delete("/bulk-delete", bulkDeleteSentences);
router.get("/", listSentences);
router.put("/bulk/:lessonId/generate-audio", generateLessonSentencesAudio);
router.put("/:id/generate-audio", generateSentenceAudioById);
router.get("/:id", getSentenceById);
router.put("/:id", updateSentence);
router.put("/:id/finish", finishSentence);
router.delete("/:id", deleteSentence);
export default router;
