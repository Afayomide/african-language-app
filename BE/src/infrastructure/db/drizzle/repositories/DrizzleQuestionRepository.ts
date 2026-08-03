import { and, desc, eq, inArray, ne, notInArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "../client.js";
import {
  exerciseQuestions,
  lessonBlocks,
  lessonStages,
  lessons,
  type ExerciseQuestionRow,
  type NewExerciseQuestionRow
} from "../schema.js";
import type { QuestionEntity } from "../../../../domain/entities/Question.js";
import type {
  QuestionCreateInput,
  QuestionListFilter,
  QuestionRepository,
  QuestionUpdateInput
} from "../../../../domain/repositories/QuestionRepository.js";

const notDeleted = () => eq(exerciseQuestions.isDeleted, false);

function mapContentType(value: unknown): "word" | "expression" | "sentence" | undefined {
  return value === "sentence" || value === "word" || value === "expression" ? value : undefined;
}

function toEntity(row: ExerciseQuestionRow): QuestionEntity {
  const translationIndex = Number(row.translationIndex ?? 0);
  const matchingPairs = Array.isArray(row.interactionData?.matchingPairs)
    ? row.interactionData.matchingPairs
    : [];

  return {
    id: row.id,
    _id: row.id,
    lessonId: String(row.lessonId),
    sourceType: row.sourceType ?? undefined,
    sourceId: row.sourceId ? String(row.sourceId) : undefined,
    relatedSourceRefs: Array.isArray(row.relatedSourceRefs)
      ? row.relatedSourceRefs.map((item: any) => ({
          type: item?.type === "sentence" ? "sentence" : item?.type === "word" ? "word" : "expression",
          id: String(item?.id || "")
        }))
      : [],
    translationIndex: Number.isInteger(translationIndex) && translationIndex >= 0 ? translationIndex : 0,
    type: row.type,
    subtype: row.subtype,
    promptTemplate: row.promptTemplate,
    options: Array.isArray(row.options) ? row.options.map(String) : [],
    correctIndex: row.correctIndex,
    reviewData: row.reviewData as QuestionEntity["reviewData"],
    interactionData: row.interactionData
      ? {
          matchingPairs: matchingPairs.map((item: any) => ({
            pairId: String(item?.pairId || ""),
            contentType: mapContentType(item?.contentType),
            contentId: item?.contentId ? String(item.contentId) : undefined,
            contentText: item?.contentText ? String(item.contentText) : undefined,
            translationIndex: Number(item?.translationIndex || 0),
            translation: String(item?.translation || ""),
            image:
              item?.image?.url || item?.image?.altText || item?.image?.imageAssetId
                ? {
                    imageAssetId: item.image.imageAssetId ? String(item.image.imageAssetId) : "",
                    url: String(item.image.url || ""),
                    thumbnailUrl: String(item.image.thumbnailUrl || ""),
                    altText: String(item.image.altText || "")
                  }
                : null
          }))
        }
      : undefined,
    explanation: String(row.explanation || ""),
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  } as QuestionEntity;
}

export class DrizzleQuestionRepository implements QuestionRepository {
  async create(input: QuestionCreateInput): Promise<QuestionEntity> {
    const [row] = await db
      .insert(exerciseQuestions)
      .values({
        lessonId: input.lessonId,
        sourceType: input.sourceType ?? null,
        sourceId: input.sourceId ?? null,
        relatedSourceRefs: (input.relatedSourceRefs ?? []) as NewExerciseQuestionRow["relatedSourceRefs"],
        translationIndex: input.translationIndex ?? 0,
        type: input.type,
        subtype: input.subtype,
        promptTemplate: input.promptTemplate,
        options: input.options ?? [],
        correctIndex: input.correctIndex ?? 0,
        reviewData: (input.reviewData ?? {}) as NewExerciseQuestionRow["reviewData"],
        interactionData: (input.interactionData ?? {}) as NewExerciseQuestionRow["interactionData"],
        explanation: input.explanation ?? "",
        status: input.status
      })
      .returning();
    return toEntity(row);
  }

  async list(filter: QuestionListFilter): Promise<QuestionEntity[]> {
    const conditions: (SQL | undefined)[] = [notDeleted()];
    if (filter.ids) conditions.push(inArray(exerciseQuestions.id, filter.ids));
    if (filter.lessonId) conditions.push(eq(exerciseQuestions.lessonId, filter.lessonId));
    if (filter.lessonIds) conditions.push(inArray(exerciseQuestions.lessonId, filter.lessonIds));
    if (filter.type) conditions.push(eq(exerciseQuestions.type, filter.type));
    if (filter.subtype) conditions.push(eq(exerciseQuestions.subtype, filter.subtype));
    if (filter.status) {
      conditions.push(
        Array.isArray(filter.status)
          ? inArray(exerciseQuestions.status, filter.status)
          : eq(exerciseQuestions.status, filter.status)
      );
    }

    const rows = await db
      .select()
      .from(exerciseQuestions)
      .where(and(...conditions.filter(Boolean)))
      .orderBy(desc(exerciseQuestions.createdAt));

    return rows.map(toEntity);
  }

  async listDeleted(filter: Pick<QuestionListFilter, "ids" | "lessonId" | "lessonIds">): Promise<QuestionEntity[]> {
    const conditions: (SQL | undefined)[] = [eq(exerciseQuestions.isDeleted, true)];
    if (filter.ids) conditions.push(inArray(exerciseQuestions.id, filter.ids));
    if (filter.lessonId) conditions.push(eq(exerciseQuestions.lessonId, filter.lessonId));
    if (filter.lessonIds) conditions.push(inArray(exerciseQuestions.lessonId, filter.lessonIds));

    const rows = await db
      .select()
      .from(exerciseQuestions)
      .where(and(...conditions.filter(Boolean)))
      .orderBy(desc(exerciseQuestions.updatedAt), desc(exerciseQuestions.createdAt));

    return rows.map(toEntity);
  }

  async findById(id: string): Promise<QuestionEntity | null> {
    const rows = await db
      .select()
      .from(exerciseQuestions)
      .where(and(eq(exerciseQuestions.id, id), notDeleted()))
      .limit(1);
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async updateById(id: string, update: QuestionUpdateInput): Promise<QuestionEntity | null> {
    const values: Partial<NewExerciseQuestionRow> = { updatedAt: new Date() };

    if (update.sourceType !== undefined) values.sourceType = update.sourceType ?? null;
    if (update.sourceId !== undefined) values.sourceId = update.sourceId;
    if (update.relatedSourceRefs !== undefined) {
      values.relatedSourceRefs = update.relatedSourceRefs as NewExerciseQuestionRow["relatedSourceRefs"];
    }
    if (update.translationIndex !== undefined) values.translationIndex = update.translationIndex;
    if (update.type !== undefined) values.type = update.type;
    if (update.subtype !== undefined) values.subtype = update.subtype;
    if (update.promptTemplate !== undefined) values.promptTemplate = update.promptTemplate;
    if (update.options !== undefined) values.options = update.options;
    if (update.correctIndex !== undefined) values.correctIndex = update.correctIndex;
    if (update.reviewData !== undefined) {
      values.reviewData = update.reviewData as NewExerciseQuestionRow["reviewData"];
    }
    if (update.interactionData !== undefined) {
      values.interactionData = update.interactionData as NewExerciseQuestionRow["interactionData"];
    }
    if (update.explanation !== undefined) values.explanation = update.explanation;
    if (update.status !== undefined) values.status = update.status;

    const rows = await db
      .update(exerciseQuestions)
      .set(values)
      .where(and(eq(exerciseQuestions.id, id), notDeleted()))
      .returning();
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async softDeleteById(id: string, now: Date): Promise<QuestionEntity | null> {
    const rows = await db
      .update(exerciseQuestions)
      .set({ isDeleted: true, deletedAt: now, updatedAt: new Date() })
      .where(and(eq(exerciseQuestions.id, id), notDeleted()))
      .returning();
    return rows[0] ? toEntity(rows[0]) : null;
  }

  /**
   * Soft-delete a lesson's questions, but PRESERVE any question that another
   * live lesson still references via a question block.
   *
   * In Mongo this needed a nested $elemMatch over the embedded stages/blocks
   * arrays; now that stages and blocks are real tables it is a plain join.
   */
  async softDeleteByLessonId(lessonId: string, now: Date): Promise<void> {
    const candidates = await db
      .select({ id: exerciseQuestions.id })
      .from(exerciseQuestions)
      .where(and(eq(exerciseQuestions.lessonId, lessonId), notDeleted()));

    if (candidates.length === 0) return;
    const candidateIds = candidates.map((row) => row.id);

    const preserved = await db
      .selectDistinct({ refId: lessonBlocks.refId })
      .from(lessonBlocks)
      .innerJoin(lessonStages, eq(lessonStages.id, lessonBlocks.stageId))
      .innerJoin(lessons, eq(lessons.id, lessonStages.lessonId))
      .where(
        and(
          eq(lessonBlocks.type, "question"),
          inArray(lessonBlocks.refId, candidateIds),
          ne(lessons.id, lessonId),
          eq(lessons.isDeleted, false)
        )
      );

    const preservedIds = preserved.map((row) => row.refId).filter((value): value is string => Boolean(value));
    const deletableIds = candidateIds.filter((id) => !preservedIds.includes(id));
    if (deletableIds.length === 0) return;

    await db
      .update(exerciseQuestions)
      .set({ isDeleted: true, deletedAt: now, updatedAt: new Date() })
      .where(and(inArray(exerciseQuestions.id, deletableIds), notDeleted()));
  }

  /**
   * Soft-delete every question referencing a piece of content, whether as the
   * primary source, inside relatedSourceRefs, or inside a matching pair.
   * The latter two are jsonb containment (@>) queries.
   */
  async softDeleteBySource(
    sourceType: NonNullable<QuestionEntity["sourceType"]>,
    sourceId: string,
    now: Date
  ): Promise<void> {
    const relatedRef = JSON.stringify([{ type: sourceType, id: sourceId }]);
    const matchingPair = JSON.stringify({ matchingPairs: [{ contentType: sourceType, contentId: sourceId }] });

    await db
      .update(exerciseQuestions)
      .set({ isDeleted: true, deletedAt: now, updatedAt: new Date() })
      .where(
        and(
          notDeleted(),
          or(
            and(eq(exerciseQuestions.sourceType, sourceType), eq(exerciseQuestions.sourceId, sourceId)),
            sql`${exerciseQuestions.relatedSourceRefs} @> ${relatedRef}::jsonb`,
            sql`${exerciseQuestions.interactionData} @> ${matchingPair}::jsonb`
          )
        )
      );
  }

  async restoreByLessonId(lessonId: string): Promise<void> {
    await db
      .update(exerciseQuestions)
      .set({ isDeleted: false, deletedAt: null, updatedAt: new Date() })
      .where(and(eq(exerciseQuestions.lessonId, lessonId), eq(exerciseQuestions.isDeleted, true)));
  }

  async publishById(id: string): Promise<QuestionEntity | null> {
    const rows = await db
      .update(exerciseQuestions)
      .set({ status: "published", updatedAt: new Date() })
      .where(and(eq(exerciseQuestions.id, id), eq(exerciseQuestions.status, "finished"), notDeleted()))
      .returning();
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async finishById(id: string): Promise<QuestionEntity | null> {
    const rows = await db
      .update(exerciseQuestions)
      .set({ status: "finished", updatedAt: new Date() })
      .where(and(eq(exerciseQuestions.id, id), notDeleted()))
      .returning();
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async sendBackToTutorById(id: string): Promise<QuestionEntity | null> {
    const rows = await db
      .update(exerciseQuestions)
      .set({ status: "draft", updatedAt: new Date() })
      .where(and(eq(exerciseQuestions.id, id), eq(exerciseQuestions.status, "finished"), notDeleted()))
      .returning();
    return rows[0] ? toEntity(rows[0]) : null;
  }
}
