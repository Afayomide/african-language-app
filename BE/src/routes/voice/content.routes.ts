import { Router } from "express";
import { createSubmission, getQueue, listOwnSubmissions } from "../../controllers/voice/content.controller.js";
import { requireAuth, requireVoiceArtist } from "../../utils/authMiddleware.js";

const router = Router();

router.use(requireAuth, requireVoiceArtist);
router.get("/queue", getQueue);
router.get("/submissions", listOwnSubmissions);
router.post("/:contentType/:id/submissions", createSubmission);

export default router;
