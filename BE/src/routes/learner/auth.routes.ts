import { Router } from "express";
import { changePassword, login, me, signup, updateProfile } from "../../controllers/learner/auth.controller.js";
import { requireAuth, requireLearner } from "../../utils/authMiddleware.js";

const router = Router();

router.post("/signup", signup);
router.post("/login", login);
router.get("/me", requireAuth, requireLearner, me);
router.put("/profile", requireAuth, requireLearner, updateProfile);
router.put("/password", requireAuth, requireLearner, changePassword);

export default router;
