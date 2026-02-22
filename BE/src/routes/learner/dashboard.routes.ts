import { Router } from "express";
import {
  getDashboardOverview,
  markLearningSession,
  updateCurrentLanguage,
  updateDailyGoal
} from "../../controllers/learner/dashboard.controller.js";
import { requireAuth, requireLearner } from "../../utils/authMiddleware.js";

const router = Router();

router.use(requireAuth, requireLearner);

router.get("/overview", getDashboardOverview);
router.put("/daily-goal", updateDailyGoal);
router.put("/language", updateCurrentLanguage);
router.post("/session", markLearningSession);

export default router;
