import { Router } from "express";
import {
  activateUserRole,
  assignUserRole,
  deactivateUserRole,
  listUsers,
  updateUserRoles
} from "../../controllers/admin/user.controller.js";
import { requireAdmin, requireAuth } from "../../utils/authMiddleware.js";

const router = Router();

router.use(requireAuth, requireAdmin);

router.get("/", listUsers);
router.post("/:id/roles/assign", assignUserRole);
router.put("/:id/roles", updateUserRoles);
router.put("/:id/activate", activateUserRole);
router.put("/:id/deactivate", deactivateUserRole);

export default router;
