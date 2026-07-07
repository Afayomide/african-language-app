import { Router } from "express";
import { listTutorLanguages } from "../../controllers/tutor/language.controller.js";
import { requireAuth, requireTutor } from "../../utils/authMiddleware.js";

const router = Router();

router.use(requireAuth, requireTutor);
router.get("/", listTutorLanguages);

export default router;
