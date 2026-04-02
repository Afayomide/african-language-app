import ExerciseQuestionModel from "../../../../models/ExerciseQuestion.js";
import LessonModel from "../../../../models/Lesson.js";
import type { QuestionEntity } from "../../../../domain/entities/Question.js";
import type {
  QuestionCreateInput,
  QuestionListFilter,
  QuestionRepository,
  QuestionUpdateInput
} from "../../../../domain/repositories/QuestionRepository.js";

function toEntity(doc: any): QuestionEntity {
  const translationIndex = Number(doc.translationIndex ?? 0);
  return {
    id: doc._id.toString(),
    _id: doc._id.toString(),
    lessonId: doc.lessonId.toString(),
    sourceType: doc.sourceType ?? undefined,
    sourceId: doc.sourceId ? doc.sourceId.toString() : undefined,
    relatedSourceRefs: Array.isArray(doc.relatedSourceRefs)
      ? doc.relatedSourceRefs.map((item: { type?: string; id?: { toString(): string } | string }) => ({
          type: item.type === "sentence" ? "sentence" : item.type === "word" ? "word" : "expression",
          id: typeof item.id === "string" ? item.id : String(item.id?.toString() || "")
        }))
      : [],
    translationIndex: Number.isInteger(translationIndex) && translationIndex >= 0 ? translationIndex : 0,
    type: doc.type,
    subtype: doc.subtype,
    promptTemplate: doc.promptTemplate,
    options: doc.options || [],
    correctIndex: doc.correctIndex,
    reviewData: doc.reviewData,
    interactionData: doc.interactionData
      ? {
          matchingPairs: Array.isArray(doc.interactionData.matchingPairs)
            ? doc.interactionData.matchingPairs.map(
                (item: {
                  pairId?: string;
                  contentType?: string;
                  contentId?: { toString(): string } | string;
                  contentText?: string;
                  translationIndex?: number;
                  translation?: string;
                  image?: {
                    imageAssetId?: { toString(): string } | string | null;
                    url?: string;
                    thumbnailUrl?: string;
                    altText?: string;
                  } | null;
                }) => ({
                  pairId: String(item.pairId || ""),
                  contentType:
                    item.contentType === "sentence"
                      ? "sentence"
                      : item.contentType === "word"
                        ? "word"
                        : item.contentType === "expression"
                          ? "expression"
                          : undefined,
                  contentId: item.contentId
                    ? typeof item.contentId === "string"
                      ? item.contentId
                      : item.contentId.toString()
                    : undefined,
                  contentText: item.contentText ? String(item.contentText) : undefined,
                  translationIndex: Number(item.translationIndex || 0),
                  translation: String(item.translation || ""),
                  image: item.image?.url || item.image?.altText || item.image?.imageAssetId
                    ? {
                        imageAssetId: item.image.imageAssetId
                          ? typeof item.image.imageAssetId === "string"
                            ? item.image.imageAssetId
                            : item.image.imageAssetId.toString()
                          : "",
                        url: String(item.image.url || ""),
                        thumbnailUrl: String(item.image.thumbnailUrl || ""),
                        altText: String(item.image.altText || "")
                      }
                    : null
                })
              )
            : []
        }
      : undefined,
    explanation: String(doc.explanation || ""),
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

export class MongooseQuestionRepository implements QuestionRepository {
  async create(input: QuestionCreateInput): Promise<QuestionEntity> {
    const created = await ExerciseQuestionModel.create(input);
    return toEntity(created);
  }

  async list(filter: QuestionListFilter): Promise<QuestionEntity[]> {
    const query: Record<string, unknown> = { isDeleted: { $ne: true } };
    if (filter.lessonId) query.lessonId = filter.lessonId;
    if (filter.lessonIds) query.lessonId = { $in: filter.lessonIds };
    if (filter.type) query.type = filter.type;
    if (filter.subtype) query.subtype = filter.subtype;
    if (filter.status) query.status = filter.status;

    const questions = await ExerciseQuestionModel.find(query).sort({ createdAt: -1 });
    return questions.map(toEntity);
  }

  async findById(id: string): Promise<QuestionEntity | null> {
    const question = await ExerciseQuestionModel.findOne({ _id: id, isDeleted: { $ne: true } });
    return question ? toEntity(question) : null;
  }

  async updateById(id: string, update: QuestionUpdateInput): Promise<QuestionEntity | null> {
    const question = await ExerciseQuestionModel.findOneAndUpdate(
      { _id: id, isDeleted: { $ne: true } },
      update,
      { new: true }
    );
    return question ? toEntity(question) : null;
  }

  async softDeleteById(id: string, now: Date): Promise<QuestionEntity | null> {
    const question = await ExerciseQuestionModel.findOneAndUpdate(
      { _id: id, isDeleted: { $ne: true } },
      { isDeleted: true, deletedAt: now },
      { new: true }
    );
    return question ? toEntity(question) : null;
  }

  async softDeleteByLessonId(lessonId: string, now: Date): Promise<void> {
    const candidates = await ExerciseQuestionModel.find({
      lessonId,
      isDeleted: { $ne: true }
    }).select("_id");
    if (candidates.length === 0) return;

    const candidateIds = candidates.map((item) => item._id);
    const reusedByOtherLessons = await LessonModel.find({
      _id: { $ne: lessonId },
      isDeleted: { $ne: true },
      stages: {
        $elemMatch: {
          blocks: {
            $elemMatch: {
              type: "question",
              refId: { $in: candidateIds }
            }
          }
        }
      }
    }).select("stages.blocks.refId stages.blocks.type");

    const preserved = new Set<string>();
    for (const lesson of reusedByOtherLessons) {
      const stages = Array.isArray((lesson as {
        stages?: Array<{ blocks?: Array<{ type?: string; refId?: string | { toString(): string } }> }>;
      }).stages)
        ? (lesson as {
            stages: Array<{ blocks?: Array<{ type?: string; refId?: string | { toString(): string } }> }>;
          }).stages
        : [];
      for (const stage of stages) {
        const blocks = Array.isArray(stage.blocks) ? stage.blocks : [];
        for (const block of blocks) {
          if (block?.type === "question" && block.refId) {
            preserved.add(String(block.refId));
          }
        }
      }
    }

    const deletableIds = candidateIds.filter((id) => !preserved.has(String(id)));
    if (deletableIds.length === 0) return;

    await ExerciseQuestionModel.updateMany(
      { _id: { $in: deletableIds }, isDeleted: { $ne: true } },
      { isDeleted: true, deletedAt: now }
    );
  }

  async softDeleteBySource(sourceType: NonNullable<QuestionEntity["sourceType"]>, sourceId: string, now: Date): Promise<void> {
    await ExerciseQuestionModel.updateMany(
      {
        isDeleted: { $ne: true },
        $or: [
          { sourceType, sourceId },
          { relatedSourceRefs: { $elemMatch: { type: sourceType, id: sourceId } } },
          {
            "interactionData.matchingPairs": {
              $elemMatch: { contentType: sourceType, contentId: sourceId }
            }
          }
        ]
      },
      { isDeleted: true, deletedAt: now }
    );
  }

  async restoreByLessonId(lessonId: string): Promise<void> {
    await ExerciseQuestionModel.updateMany(
      { lessonId, isDeleted: true },
      { isDeleted: false, deletedAt: null }
    );
  }

  async publishById(id: string): Promise<QuestionEntity | null> {
    const question = await ExerciseQuestionModel.findOneAndUpdate(
      { _id: id, status: "finished", isDeleted: { $ne: true } },
      { status: "published" },
      { new: true }
    );
    return question ? toEntity(question) : null;
  }

  async finishById(id: string): Promise<QuestionEntity | null> {
    const question = await ExerciseQuestionModel.findOneAndUpdate(
      { _id: id, isDeleted: { $ne: true } },
      { status: "finished" },
      { new: true }
    );
    return question ? toEntity(question) : null;
  }

  async sendBackToTutorById(id: string): Promise<QuestionEntity | null> {
    const question = await ExerciseQuestionModel.findOneAndUpdate(
      { _id: id, status: "finished", isDeleted: { $ne: true } },
      { status: "draft" },
      { new: true }
    );
    return question ? toEntity(question) : null;
  }
}
