import { Router } from "express";
import {
  bulkDeleteExpressions,
  createExpression,
  deleteExpressionImageLink,
  deleteExpression,
  generateExpressionAudioById,
  generateLessonExpressionsAudio,
  getExpressionById,
  linkExpressionImage,
  listExpressionImages,
  listExpressions,
  publishExpression,
  updateExpressionImageLink,
  updateExpression
} from "../../controllers/admin/expression.controller.js";
import { requireAdmin, requireAuth } from "../../utils/authMiddleware.js";

const router = Router();

router.use(requireAuth, requireAdmin);

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
router.delete("/:id", deleteExpression);
router.put("/:id/publish", publishExpression);

export default router;
