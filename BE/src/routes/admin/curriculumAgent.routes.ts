import { Router } from "express";
import { requireAdmin, requireAuth } from "../../utils/authMiddleware.js";
import {
  getCurriculumBuildJob,
  listCurriculumBuildArtifacts,
  listCurriculumBuildJobs,
  resumeCurriculumBuildJob,
  startCurriculumBuildJob
} from "../../controllers/admin/curriculumAgent.controller.js";

const router = Router();

router.use(requireAuth, requireAdmin);
router.post("/", startCurriculumBuildJob);
router.get("/", listCurriculumBuildJobs);
router.get("/:id", getCurriculumBuildJob);
router.get("/:id/artifacts", listCurriculumBuildArtifacts);
router.post("/:id/resume", resumeCurriculumBuildJob);

export default router;
