import { Router } from "express";
import {
  createQuestion,
  deleteQuestion,
  getQuestionById,
  listQuestions,
  publishQuestion,
  updateQuestion
} from "../../controllers/admin/question.controller.js";
import { requireAdmin, requireAuth } from "../../utils/authMiddleware.js";

const router = Router();

router.use(requireAuth);

router.post("/", createQuestion);
router.get("/", listQuestions);
router.get("/:id", getQuestionById);
router.put("/:id", updateQuestion);
router.delete("/:id", deleteQuestion);
router.put("/:id/publish", requireAdmin, publishQuestion);

export default router;
