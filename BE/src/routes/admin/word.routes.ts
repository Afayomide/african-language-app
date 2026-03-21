import { Router } from "express";
import { bulkDeleteWords, createWord, deleteWord, generateLessonWordsAudio, generateWordAudioById, getWordById, listWords, publishWord, updateWord } from "../../controllers/admin/word.controller.js";
import { requireAdmin, requireAuth } from "../../utils/authMiddleware.js";

const router = Router();
router.use(requireAuth, requireAdmin);
router.post("/", createWord);
router.delete("/bulk-delete", bulkDeleteWords);
router.get("/", listWords);
router.put("/bulk/:lessonId/generate-audio", generateLessonWordsAudio);
router.put("/:id/generate-audio", generateWordAudioById);
router.get("/:id", getWordById);
router.put("/:id", updateWord);
router.delete("/:id", deleteWord);
router.put("/:id/publish", publishWord);
export default router;
