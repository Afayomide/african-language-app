import { Router } from "express";
import {
  acceptVoiceAudioSubmission,
  listVoiceAudioSubmissions,
  rejectVoiceAudioSubmission
} from "../../controllers/admin/voiceAudioReview.controller.js";
import { requireAdmin, requireAuth } from "../../utils/authMiddleware.js";

const router = Router();

router.use(requireAuth, requireAdmin);
router.get("/submissions", listVoiceAudioSubmissions);
router.put("/submissions/:id/accept", acceptVoiceAudioSubmission);
router.put("/submissions/:id/reject", rejectVoiceAudioSubmission);

export default router;
