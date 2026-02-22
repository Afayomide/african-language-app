import { Router } from "express";
import {
  activateVoiceArtist,
  deactivateVoiceArtist,
  deleteVoiceArtist,
  listVoiceArtists
} from "../../controllers/admin/voiceArtist.controller.js";
import { requireAdmin, requireAuth } from "../../utils/authMiddleware.js";

const router = Router();

router.use(requireAuth, requireAdmin);
router.get("/", listVoiceArtists);
router.put("/:id/activate", activateVoiceArtist);
router.put("/:id/deactivate", deactivateVoiceArtist);
router.delete("/:id", deleteVoiceArtist);

export default router;
