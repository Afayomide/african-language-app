import { Router } from "express";
import { listLanguagesAdmin, updateLanguageAdmin } from "../../controllers/admin/language.controller.js";
import { requireAdmin, requireAuth } from "../../utils/authMiddleware.js";

const router = Router();

router.use(requireAuth, requireAdmin);
router.get("/", listLanguagesAdmin);
router.put("/:id", updateLanguageAdmin);

export default router;
