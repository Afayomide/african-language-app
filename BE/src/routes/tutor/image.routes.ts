import { Router } from "express";
import {
  createImageAsset,
  deleteImageAsset,
  getImageAssetById,
  listImageAssets,
  updateImageAsset
} from "../../controllers/tutor/image.controller.js";
import { requireAuth, requireTutor } from "../../utils/authMiddleware.js";

const router = Router();

router.use(requireAuth, requireTutor);

router.post("/", createImageAsset);
router.get("/", listImageAssets);
router.get("/:id", getImageAssetById);
router.put("/:id", updateImageAsset);
router.delete("/:id", deleteImageAsset);

export default router;
