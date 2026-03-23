import LearnerQuestionMissModel, {
  type LearnerQuestionMissDocument
} from "../../../../models/learner/LearnerQuestionMiss.js";
import type { LearnerQuestionMissEntity } from "../../../../domain/entities/LearnerQuestionMiss.js";
import type {
  LearnerQuestionMissRepository,
  LearnerQuestionMissUpsertInput
} from "../../../../domain/repositories/LearnerQuestionMissRepository.js";

function toEntity(doc: LearnerQuestionMissDocument): LearnerQuestionMissEntity {
  return {
    id: doc._id.toString(),
    _id: doc._id.toString(),
    userId: doc.userId.toString(),
    lessonId: doc.lessonId.toString(),
    questionId: doc.questionId.toString(),
    questionType: doc.questionType,
    questionSubtype: doc.questionSubtype,
    sourceType: doc.sourceType ?? undefined,
    sourceId: doc.sourceId ? doc.sourceId.toString() : undefined,
    missCount: doc.missCount ?? 0,
    firstMissedAt: doc.firstMissedAt,
    lastMissedAt: doc.lastMissedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

export class MongooseLearnerQuestionMissRepository implements LearnerQuestionMissRepository {
  async listByUserAndLessonIds(userId: string, lessonIds: string[]): Promise<LearnerQuestionMissEntity[]> {
    if (!lessonIds.length) return [];
    const docs = await LearnerQuestionMissModel.find({
      userId,
      lessonId: { $in: lessonIds }
    }).sort({ lastMissedAt: -1, updatedAt: -1 });
    return docs.map(toEntity);
  }

  async upsertMany(rows: LearnerQuestionMissUpsertInput[]): Promise<void> {
    if (!rows.length) return;

    await LearnerQuestionMissModel.bulkWrite(
      rows.map((row) => ({
        updateOne: {
          filter: {
            userId: row.userId,
            questionId: row.questionId
          },
          update: {
            $setOnInsert: {
              userId: row.userId,
              lessonId: row.lessonId,
              questionId: row.questionId,
              questionType: row.questionType,
              questionSubtype: row.questionSubtype,
              sourceType: row.sourceType ?? null,
              sourceId: row.sourceId ?? null,
              firstMissedAt: row.seenAt
            },
            $set: {
              lastMissedAt: row.seenAt
            },
            $inc: {
              missCount: Math.max(1, row.missIncrement)
            }
          },
          upsert: true
        }
      })) as any
    );
  }
}
