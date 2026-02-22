import { Router } from "express";
import { suggestLesson } from "../../controllers/ai/lessonAi.controller.js";
import { requireAiKey } from "../../utils/aiKeyMiddleware.js";

const router = Router();

router.use(requireAiKey);

router.post("/lessons/suggest", suggestLesson);

export default router;
