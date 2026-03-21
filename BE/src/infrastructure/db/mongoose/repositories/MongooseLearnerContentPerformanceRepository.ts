import LearnerContentPerformanceModel, {
  type LearnerContentPerformanceDocument
} from "../../../../models/learner/LearnerContentPerformance.js";
import type { LearnerContentPerformanceEntity } from "../../../../domain/entities/LearnerContentPerformance.js";
import type {
  LearnerContentPerformanceRepository,
  LearnerContentPerformanceUpsertInput
} from "../../../../domain/repositories/LearnerContentPerformanceRepository.js";

function toEntity(doc: LearnerContentPerformanceDocument): LearnerContentPerformanceEntity {
  return {
    id: doc._id.toString(),
    _id: doc._id.toString(),
    userId: doc.userId.toString(),
    language: doc.language,
    contentType: doc.contentType,
    contentId: doc.contentId.toString(),
    exposureCount: doc.exposureCount ?? 0,
    attemptCount: doc.attemptCount ?? 0,
    correctCount: doc.correctCount ?? 0,
    wrongCount: doc.wrongCount ?? 0,
    retryCount: doc.retryCount ?? 0,
    speakingFailureCount: doc.speakingFailureCount ?? 0,
    listeningFailureCount: doc.listeningFailureCount ?? 0,
    contextScenarioFailureCount: doc.contextScenarioFailureCount ?? 0,
    lastLessonId: doc.lastLessonId ? doc.lastLessonId.toString() : undefined,
    lastQuestionType: doc.lastQuestionType ?? undefined,
    lastQuestionSubtype: doc.lastQuestionSubtype ?? undefined,
    firstSeenAt: doc.firstSeenAt,
    lastSeenAt: doc.lastSeenAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

export class MongooseLearnerContentPerformanceRepository implements LearnerContentPerformanceRepository {
  async listByUserAndLanguage(userId: string, language: "yoruba" | "igbo" | "hausa"): Promise<LearnerContentPerformanceEntity[]> {
    const docs = await LearnerContentPerformanceModel.find({ userId, language }).sort({ updatedAt: -1 });
    return docs.map(toEntity);
  }

  async upsertMany(rows: LearnerContentPerformanceUpsertInput[]): Promise<void> {
    if (!rows.length) return;

    await LearnerContentPerformanceModel.bulkWrite(
      rows.map((row) => ({
        updateOne: {
          filter: {
            userId: row.userId,
            contentType: row.contentType,
            contentId: row.contentId
          },
          update: {
            $setOnInsert: {
              userId: row.userId,
              language: row.language,
              contentType: row.contentType,
              contentId: row.contentId,
              firstSeenAt: row.seenAt
            },
            $set: {
              language: row.language,
              lastSeenAt: row.seenAt,
              lastLessonId: row.lastLessonId,
              lastQuestionType: row.lastQuestionType,
              lastQuestionSubtype: row.lastQuestionSubtype
            },
            $inc: {
              exposureCount: row.exposureIncrement,
              attemptCount: row.attemptIncrement,
              correctCount: row.correctIncrement,
              wrongCount: row.wrongIncrement,
              retryCount: row.retryIncrement,
              speakingFailureCount: row.speakingFailureIncrement,
              listeningFailureCount: row.listeningFailureIncrement,
              contextScenarioFailureCount: row.contextScenarioFailureIncrement
            }
          },
          upsert: true
        }
      })) as any
    );
  }
}
