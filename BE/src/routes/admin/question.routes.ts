import { Router } from "express";
import {
  createQuestion,
  deleteQuestion,
  getQuestionById,
  listQuestions,
  publishQuestion,
  sendBackToTutorQuestion,
  updateQuestion
} from "../../controllers/admin/question.controller.js";
import { requireAdmin, requireAuth } from "../../utils/authMiddleware.js";

const router = Router();

router.use(requireAuth, requireAdmin);

router.post("/", createQuestion);
router.get("/", listQuestions);
router.get("/:id", getQuestionById);
router.put("/:id", updateQuestion);
router.delete("/:id", deleteQuestion);
router.put("/:id/publish", publishQuestion);
router.put("/:id/send-back-to-tutor", sendBackToTutorQuestion);

export default router;
