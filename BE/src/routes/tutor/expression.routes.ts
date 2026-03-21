import { Router } from "express";
import {
  bulkDeleteExpressions,
  createExpression,
  deleteExpressionImageLink,
  deleteExpression,
  finishExpression,
  generateExpressionAudioById,
  generateLessonExpressionsAudio,
  getExpressionById,
  linkExpressionImage,
  listExpressionImages,
  listExpressions,
  updateExpressionImageLink,
  updateExpression
} from "../../controllers/tutor/expression.controller.js";
import { requireAuth, requireTutor } from "../../utils/authMiddleware.js";

const router = Router();

router.use(requireAuth, requireTutor);

router.post("/", createExpression);
router.delete("/bulk-delete", bulkDeleteExpressions);
router.get("/", listExpressions);
router.put("/bulk/:lessonId/generate-audio", generateLessonExpressionsAudio);
router.put("/:id/generate-audio", generateExpressionAudioById);
router.get("/:id/images", listExpressionImages);
router.post("/:id/images", linkExpressionImage);
router.put("/:id/images/:linkId", updateExpressionImageLink);
router.delete("/:id/images/:linkId", deleteExpressionImageLink);
router.get("/:id", getExpressionById);
router.put("/:id", updateExpression);
router.put("/:id/finish", finishExpression);
router.delete("/:id", deleteExpression);

export default router;
