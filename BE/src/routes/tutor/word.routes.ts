import { Router } from "express";
import { bulkDeleteWords, createWord, deleteWord, finishWord, generateLessonWordsAudio, generateWordAudioById, getWordById, listWords, updateWord } from "../../controllers/tutor/word.controller.js";
import { requireAuth, requireTutor } from "../../utils/authMiddleware.js";

const router = Router();
router.use(requireAuth, requireTutor);
router.post("/", createWord);
router.delete("/bulk-delete", bulkDeleteWords);
router.get("/", listWords);
router.put("/bulk/:lessonId/generate-audio", generateLessonWordsAudio);
router.put("/:id/generate-audio", generateWordAudioById);
router.get("/:id", getWordById);
router.put("/:id", updateWord);
router.put("/:id/finish", finishWord);
router.delete("/:id", deleteWord);
export default router;
