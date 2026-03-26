import type {
  CurriculumBuildJobArtifacts,
  CurriculumBuildJobEntity,
  CurriculumBuildJobError,
  CurriculumBuildJobStep,
  CurriculumBuildStepKey
} from "../../../../domain/entities/CurriculumBuildJob.js";
import type { Language } from "../../../../domain/entities/Lesson.js";
import type {
  CurriculumBuildJobCreateInput,
  CurriculumBuildJobListFilter,
  CurriculumBuildJobRepository,
  CurriculumBuildJobUpdateInput
} from "../../../../domain/repositories/CurriculumBuildJobRepository.js";
import CurriculumBuildJobModel from "../../../../models/CurriculumBuildJob.js";
import { buildScopedLanguageQuery, findLanguageIdByCode } from "./languageRef.js";

function toStep(step?: {
  key?: CurriculumBuildStepKey;
  status?: CurriculumBuildJobStep["status"];
  attempts?: number | null;
  message?: string | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
} | null): CurriculumBuildJobStep {
  return {
    key: step?.key || "architect",
    status: step?.status || "pending",
    attempts: Number(step?.attempts || 0),
    message: String(step?.message || ""),
    startedAt: step?.startedAt || null,
    completedAt: step?.completedAt || null
  };
}

function toError(error?: {
  stepKey?: CurriculumBuildStepKey | null;
  message?: string | null;
  details?: Record<string, unknown> | null;
  createdAt?: Date | null;
} | null): CurriculumBuildJobError {
  return {
    stepKey: error?.stepKey || null,
    message: String(error?.message || ""),
    details: error?.details || null,
    createdAt: error?.createdAt || new Date()
  };
}

function toArtifacts(artifacts?: {
  memorySummary?: string | null;
  priorChapterTitles?: string[] | null;
  priorUnitTitles?: string[] | null;
  chapterPlan?: Array<{
    title?: string | null;
    description?: string | null;
    orderIndex?: number | null;
    status?: CurriculumBuildJobArtifacts["chapterPlan"][number]["status"] | null;
    chapterId?: { toString(): string } | string | null;
  }> | null;
  unitPlan?: Array<{
    chapterId?: { toString(): string } | string | null;
    chapterTitle?: string | null;
    title?: string | null;
    description?: string | null;
    orderIndex?: number | null;
    status?: CurriculumBuildJobArtifacts["unitPlan"][number]["status"] | null;
    unitId?: { toString(): string } | string | null;
  }> | null;
  lessonPlan?: Array<{
    chapterId?: { toString(): string } | string | null;
    chapterTitle?: string | null;
    unitId?: { toString(): string } | string | null;
    unitTitle?: string | null;
    title?: string | null;
    description?: string | null;
    orderIndex?: number | null;
    status?: CurriculumBuildJobArtifacts["lessonPlan"][number]["status"] | null;
    lessonId?: { toString(): string } | string | null;
  }> | null;
  architectNotes?: string[] | null;
  criticSummary?: string | null;
  criticIssues?: string[] | null;
  refinerSummary?: string | null;
} | null): CurriculumBuildJobArtifacts {
  return {
    memorySummary: String(artifacts?.memorySummary || ""),
    priorChapterTitles: (artifacts?.priorChapterTitles || []).map(String),
    priorUnitTitles: (artifacts?.priorUnitTitles || []).map(String),
    chapterPlan: (artifacts?.chapterPlan || []).map((item) => ({
      title: String(item.title || ""),
      description: String(item.description || ""),
      orderIndex: Number(item.orderIndex || 0),
      status: item.status || "planned",
      chapterId: item.chapterId ? String(item.chapterId) : null
    })),
    unitPlan: (artifacts?.unitPlan || []).map((item) => ({
      chapterId: String(item.chapterId || ""),
      chapterTitle: String(item.chapterTitle || ""),
      title: String(item.title || ""),
      description: String(item.description || ""),
      orderIndex: Number(item.orderIndex || 0),
      status: item.status || "planned",
      unitId: item.unitId ? String(item.unitId) : null
    })),
    lessonPlan: (artifacts?.lessonPlan || []).map((item) => ({
      chapterId: String(item.chapterId || ""),
      chapterTitle: String(item.chapterTitle || ""),
      unitId: String(item.unitId || ""),
      unitTitle: String(item.unitTitle || ""),
      title: String(item.title || ""),
      description: String(item.description || ""),
      orderIndex: Number(item.orderIndex || 0),
      status: item.status || "planned",
      lessonId: item.lessonId ? String(item.lessonId) : null
    })),
    architectNotes: (artifacts?.architectNotes || []).map(String),
    criticSummary: String(artifacts?.criticSummary || ""),
    criticIssues: (artifacts?.criticIssues || []).map(String),
    refinerSummary: String(artifacts?.refinerSummary || "")
  };
}

function toEntity(doc: any): CurriculumBuildJobEntity {
  return {
    id: doc._id.toString(),
    _id: doc._id.toString(),
    languageId: doc.languageId ? String(doc.languageId) : null,
    language: doc.language,
    level: doc.level,
    requestedChapterCount: Number(doc.requestedChapterCount || 0),
    topic: String(doc.topic || ""),
    extraInstructions: String(doc.extraInstructions || ""),
    cefrTarget: String(doc.cefrTarget || ""),
    status: doc.status,
    currentStepKey: doc.currentStepKey,
    steps: (doc.steps || []).map(toStep),
    artifacts: toArtifacts(doc.artifacts),
    errors: (doc.errors || []).map(toError),
    createdBy: String(doc.createdBy),
    startedAt: doc.startedAt || null,
    finishedAt: doc.finishedAt || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

async function enrichLanguageId(language: Language, input: { languageId?: string | null } = {}) {
  if (input.languageId !== undefined) return input.languageId || null;
  return findLanguageIdByCode(language);
}

export class MongooseCurriculumBuildJobRepository implements CurriculumBuildJobRepository {
  async create(input: CurriculumBuildJobCreateInput): Promise<CurriculumBuildJobEntity> {
    const languageId = await enrichLanguageId(input.language, input);
    const created = await CurriculumBuildJobModel.create({
      ...input,
      languageId,
      topic: input.topic || "",
      extraInstructions: input.extraInstructions || "",
      cefrTarget: input.cefrTarget || ""
    });
    return toEntity(created);
  }

  async findById(id: string): Promise<CurriculumBuildJobEntity | null> {
    const job = await CurriculumBuildJobModel.findById(id).lean();
    return job ? toEntity(job) : null;
  }

  async list(filter: CurriculumBuildJobListFilter = {}): Promise<CurriculumBuildJobEntity[]> {
    const query: Record<string, unknown> = {};
    if (filter.createdBy) query.createdBy = filter.createdBy;
    if (filter.status) query.status = filter.status;
    if (filter.level) query.level = filter.level;
    if (filter.language || filter.languageId) {
      Object.assign(query, await buildScopedLanguageQuery({ language: filter.language, languageId: filter.languageId }));
    }

    const cursor = CurriculumBuildJobModel.find(query).sort({ createdAt: -1 });
    if (filter.limit && filter.limit > 0) {
      cursor.limit(Math.max(1, Math.min(filter.limit, 100)));
    }
    const docs = await cursor.lean();
    return docs.map(toEntity);
  }

  async updateById(id: string, update: CurriculumBuildJobUpdateInput): Promise<CurriculumBuildJobEntity | null> {
    const languageId = update.languageId !== undefined ? update.languageId : undefined;
    const doc = await CurriculumBuildJobModel.findByIdAndUpdate(
      id,
      {
        ...update,
        ...(languageId === undefined ? {} : { languageId: languageId || null })
      },
      { new: true }
    ).lean();
    return doc ? toEntity(doc) : null;
  }
}
