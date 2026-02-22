import { Router } from "express";
import {
  createQuestion,
  deleteQuestion,
  finishQuestion,
  getQuestionById,
  listQuestions,
  updateQuestion
} from "../../controllers/tutor/question.controller.js";
import { requireAuth, requireTutor } from "../../utils/authMiddleware.js";

const router = Router();

router.use(requireAuth, requireTutor);

router.post("/", createQuestion);
router.get("/", listQuestions);
router.get("/:id", getQuestionById);
router.put("/:id", updateQuestion);
router.delete("/:id", deleteQuestion);
router.put("/:id/finish", finishQuestion);

export default router;
