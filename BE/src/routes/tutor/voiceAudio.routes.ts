import { Router } from "express";
import {
  acceptVoiceAudioSubmission,
  listVoiceAudioSubmissions,
  rejectVoiceAudioSubmission
} from "../../controllers/tutor/voiceAudioReview.controller.js";
import { requireAuth, requireTutor } from "../../utils/authMiddleware.js";

const router = Router();

router.use(requireAuth, requireTutor);

router.get("/submissions", listVoiceAudioSubmissions);
router.put("/submissions/:id/accept", acceptVoiceAudioSubmission);
router.put("/submissions/:id/reject", rejectVoiceAudioSubmission);

export default router;
