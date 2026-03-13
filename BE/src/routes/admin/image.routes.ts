import { Router } from "express";
import {
  createImageAsset,
  deleteImageAsset,
  getImageAssetById,
  listImageAssets,
  updateImageAsset
} from "../../controllers/admin/image.controller.js";
import { requireAdmin, requireAuth } from "../../utils/authMiddleware.js";

const router = Router();

router.use(requireAuth, requireAdmin);

router.post("/", createImageAsset);
router.get("/", listImageAssets);
router.get("/:id", getImageAssetById);
router.put("/:id", updateImageAsset);
router.delete("/:id", deleteImageAsset);

export default router;
