import type {
  CurriculumBuildJobArtifacts,
  CurriculumBuildJobEntity,
  CurriculumBuildJobError,
  CurriculumBuildJobStatus,
  CurriculumBuildJobStep,
  CurriculumBuildStepKey
} from "../entities/CurriculumBuildJob.js";
import type { Language, Level } from "../entities/Lesson.js";

export type CurriculumBuildJobListFilter = {
  createdBy?: string;
  language?: Language;
  languageId?: string | null;
  level?: Level;
  status?: CurriculumBuildJobStatus;
  limit?: number;
};

export type CurriculumBuildJobCreateInput = {
  language: Language;
  languageId?: string | null;
  level: Level;
  requestedChapterCount: number;
  topic?: string;
  extraInstructions?: string;
  cefrTarget?: string;
  status?: CurriculumBuildJobStatus;
  currentStepKey?: CurriculumBuildStepKey;
  steps?: CurriculumBuildJobStep[];
  artifacts?: Partial<CurriculumBuildJobArtifacts>;
  errors?: CurriculumBuildJobError[];
  createdBy: string;
  startedAt?: Date | null;
  finishedAt?: Date | null;
};

export type CurriculumBuildJobUpdateInput = Partial<
  Pick<
    CurriculumBuildJobEntity,
    | "languageId"
    | "status"
    | "currentStepKey"
    | "steps"
    | "artifacts"
    | "errors"
    | "startedAt"
    | "finishedAt"
  >
>;

export interface CurriculumBuildJobRepository {
  create(input: CurriculumBuildJobCreateInput): Promise<CurriculumBuildJobEntity>;
  findById(id: string): Promise<CurriculumBuildJobEntity | null>;
  list(filter?: CurriculumBuildJobListFilter): Promise<CurriculumBuildJobEntity[]>;
  updateById(id: string, update: CurriculumBuildJobUpdateInput): Promise<CurriculumBuildJobEntity | null>;
}
