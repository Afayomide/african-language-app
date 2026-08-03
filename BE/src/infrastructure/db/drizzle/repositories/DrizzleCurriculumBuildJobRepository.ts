import { and, desc, eq, type SQL } from "drizzle-orm";
import { db } from "../client.js";
import { curriculumBuildJobs, type CurriculumBuildJobRow, type NewCurriculumBuildJobRow } from "../schema.js";
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
import { buildScopedLanguageCondition, findLanguageIdByCode } from "./languageRef.js";

const scopeCols = { language: curriculumBuildJobs.language, languageId: curriculumBuildJobs.languageId };

/** Dates nested inside jsonb come back as ISO strings — coerce them back. */
function toDate(value: unknown): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : new Date(String(value));
}

function toStep(step: any): CurriculumBuildJobStep {
  return {
    key: step?.key || "architect",
    status: step?.status || "pending",
    attempts: Number(step?.attempts || 0),
    message: String(step?.message || ""),
    startedAt: toDate(step?.startedAt),
    completedAt: toDate(step?.completedAt)
  };
}

function toError(error: any): CurriculumBuildJobError {
  return {
    stepKey: error?.stepKey || null,
    message: String(error?.message || ""),
    details: error?.details || null,
    createdAt: toDate(error?.createdAt) ?? new Date()
  };
}

function toArtifacts(artifacts: any): CurriculumBuildJobArtifacts {
  return {
    memorySummary: String(artifacts?.memorySummary || ""),
    priorChapterTitles: (artifacts?.priorChapterTitles || []).map(String),
    priorUnitTitles: (artifacts?.priorUnitTitles || []).map(String),
    chapterPlan: (artifacts?.chapterPlan || []).map((item: any) => ({
      title: String(item?.title || ""),
      description: String(item?.description || ""),
      orderIndex: Number(item?.orderIndex || 0),
      status: item?.status || "planned",
      chapterId: item?.chapterId ? String(item.chapterId) : null
    })),
    unitPlan: (artifacts?.unitPlan || []).map((item: any) => ({
      chapterId: String(item?.chapterId || ""),
      chapterTitle: String(item?.chapterTitle || ""),
      title: String(item?.title || ""),
      description: String(item?.description || ""),
      orderIndex: Number(item?.orderIndex || 0),
      status: item?.status || "planned",
      unitId: item?.unitId ? String(item.unitId) : null
    })),
    lessonPlan: (artifacts?.lessonPlan || []).map((item: any) => ({
      chapterId: String(item?.chapterId || ""),
      chapterTitle: String(item?.chapterTitle || ""),
      unitId: String(item?.unitId || ""),
      unitTitle: String(item?.unitTitle || ""),
      title: String(item?.title || ""),
      description: String(item?.description || ""),
      orderIndex: Number(item?.orderIndex || 0),
      status: item?.status || "planned",
      lessonId: item?.lessonId ? String(item.lessonId) : null
    })),
    architectNotes: (artifacts?.architectNotes || []).map(String),
    criticSummary: String(artifacts?.criticSummary || ""),
    criticIssues: (artifacts?.criticIssues || []).map(String),
    refinerSummary: String(artifacts?.refinerSummary || "")
  };
}

function toEntity(row: CurriculumBuildJobRow): CurriculumBuildJobEntity {
  return {
    id: row.id,
    _id: row.id,
    languageId: row.languageId ?? null,
    language: row.language,
    level: row.level,
    requestedChapterCount: Number(row.requestedChapterCount || 0),
    topic: String(row.topic || ""),
    extraInstructions: String(row.extraInstructions || ""),
    cefrTarget: String(row.cefrTarget || ""),
    status: row.status,
    currentStepKey: row.currentStepKey as CurriculumBuildStepKey,
    steps: (Array.isArray(row.steps) ? row.steps : []).map(toStep),
    artifacts: toArtifacts(row.artifacts),
    errors: (Array.isArray(row.errors) ? row.errors : []).map(toError),
    createdBy: String(row.createdBy),
    startedAt: row.startedAt ?? null,
    finishedAt: row.finishedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

async function enrichLanguageId(language: Language, input: { languageId?: string | null } = {}) {
  if (input.languageId !== undefined) return input.languageId || null;
  return findLanguageIdByCode(language);
}

export class DrizzleCurriculumBuildJobRepository implements CurriculumBuildJobRepository {
  async create(input: CurriculumBuildJobCreateInput): Promise<CurriculumBuildJobEntity> {
    const languageId = await enrichLanguageId(input.language, input);
    const [row] = await db
      .insert(curriculumBuildJobs)
      .values({
        language: input.language,
        languageId,
        level: input.level,
        requestedChapterCount: input.requestedChapterCount,
        topic: input.topic || "",
        extraInstructions: input.extraInstructions || "",
        cefrTarget: input.cefrTarget || "",
        status: input.status ?? "queued",
        currentStepKey: input.currentStepKey ?? "architect",
        steps: input.steps ?? [],
        artifacts: (input.artifacts ?? {}) as NewCurriculumBuildJobRow["artifacts"],
        errors: input.errors ?? [],
        createdBy: input.createdBy,
        startedAt: input.startedAt ?? null,
        finishedAt: input.finishedAt ?? null
      })
      .returning();
    return toEntity(row);
  }

  async findById(id: string): Promise<CurriculumBuildJobEntity | null> {
    const rows = await db.select().from(curriculumBuildJobs).where(eq(curriculumBuildJobs.id, id)).limit(1);
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async list(filter: CurriculumBuildJobListFilter = {}): Promise<CurriculumBuildJobEntity[]> {
    const conditions: (SQL | undefined)[] = [];
    if (filter.createdBy) conditions.push(eq(curriculumBuildJobs.createdBy, filter.createdBy));
    if (filter.status) conditions.push(eq(curriculumBuildJobs.status, filter.status));
    if (filter.level) conditions.push(eq(curriculumBuildJobs.level, filter.level));
    if (filter.language || filter.languageId) {
      conditions.push(
        await buildScopedLanguageCondition(scopeCols, {
          language: filter.language,
          languageId: filter.languageId
        })
      );
    }

    const query = db
      .select()
      .from(curriculumBuildJobs)
      .where(conditions.length > 0 ? and(...conditions.filter(Boolean)) : undefined)
      .orderBy(desc(curriculumBuildJobs.createdAt));

    const rows =
      filter.limit && filter.limit > 0
        ? await query.limit(Math.max(1, Math.min(filter.limit, 100)))
        : await query;

    return rows.map(toEntity);
  }

  async updateById(
    id: string,
    update: CurriculumBuildJobUpdateInput
  ): Promise<CurriculumBuildJobEntity | null> {
    const values: Partial<NewCurriculumBuildJobRow> = { updatedAt: new Date() };
    if (update.languageId !== undefined) values.languageId = update.languageId || null;
    if (update.status !== undefined) values.status = update.status;
    if (update.currentStepKey !== undefined) values.currentStepKey = update.currentStepKey;
    if (update.steps !== undefined) values.steps = update.steps;
    if (update.artifacts !== undefined) values.artifacts = update.artifacts;
    if (update.errors !== undefined) values.errors = update.errors;
    if (update.startedAt !== undefined) values.startedAt = update.startedAt;
    if (update.finishedAt !== undefined) values.finishedAt = update.finishedAt;

    const rows = await db
      .update(curriculumBuildJobs)
      .set(values)
      .where(eq(curriculumBuildJobs.id, id))
      .returning();
    return rows[0] ? toEntity(rows[0]) : null;
  }
}
