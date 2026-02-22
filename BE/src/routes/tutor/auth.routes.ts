import { Router } from "express";
import { login, me, signup } from "../../controllers/tutor/auth.controller.js";
import { requireAuth, requireTutor } from "../../utils/authMiddleware.js";

const router = Router();

router.post("/signup", signup);
router.post("/login", login);
router.get("/me", requireAuth, requireTutor, me);

export default router;
