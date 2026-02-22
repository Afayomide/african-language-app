import { Router } from "express";
import {
  activateTutor,
  deactivateTutor,
  deleteTutor,
  listTutors
} from "../../controllers/admin/tutor.controller.js";
import { requireAdmin, requireAuth } from "../../utils/authMiddleware.js";

const router = Router();

router.use(requireAuth, requireAdmin);

router.get("/", listTutors);
router.put("/:id/activate", activateTutor);
router.put("/:id/deactivate", deactivateTutor);
router.delete("/:id", deleteTutor);

export default router;
