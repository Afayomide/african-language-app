import type {
  CurriculumBuildArtifactCriticReport,
  CurriculumBuildArtifactEntity,
  CurriculumBuildArtifactPhase,
  CurriculumBuildArtifactRefinerReport,
  CurriculumBuildArtifactScope,
  CurriculumBuildArtifactStatus
} from "../entities/CurriculumBuildArtifact.js";
import type { CurriculumBuildStepKey } from "../entities/CurriculumBuildJob.js";

export type CurriculumBuildArtifactCreateInput = {
  jobId: string;
  stepKey: CurriculumBuildStepKey;
  phaseKey: CurriculumBuildArtifactPhase;
  scopeType: CurriculumBuildArtifactScope;
  scopeId?: string | null;
  scopeTitle?: string | null;
  attempt: number;
  status: CurriculumBuildArtifactStatus;
  summary: string;
  input?: Record<string, unknown> | null;
  output?: Record<string, unknown> | null;
  critic?: CurriculumBuildArtifactCriticReport | null;
  refiner?: CurriculumBuildArtifactRefinerReport | null;
};

export interface CurriculumBuildArtifactRepository {
  create(input: CurriculumBuildArtifactCreateInput): Promise<CurriculumBuildArtifactEntity>;
  listByJobId(jobId: string): Promise<CurriculumBuildArtifactEntity[]>;
}
