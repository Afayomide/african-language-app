import { Router } from "express";
import { login, me, signup } from "../../controllers/voice/auth.controller.js";
import { requireAuth, requireVoiceArtist } from "../../utils/authMiddleware.js";

const router = Router();

router.post("/signup", signup);
router.post("/login", login);
router.get("/me", requireAuth, requireVoiceArtist, me);

export default router;
