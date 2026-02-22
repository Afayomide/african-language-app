import LessonProgressModel from "../../../../models/learner/LessonProgress.js";
import type { LessonProgressEntity } from "../../../../domain/entities/LessonProgress.js";
import type { LessonProgressRepository } from "../../../../domain/repositories/LessonProgressRepository.js";

function toEntity(doc: any): LessonProgressEntity {
  return {
    id: doc._id.toString(),
    _id: doc._id.toString(),
    userId: doc.userId.toString(),
    lessonId: doc.lessonId.toString(),
    status: doc.status,
    progressPercent: doc.progressPercent,
    xpEarned: doc.xpEarned ?? 0,
    stepProgress: (doc.stepProgress || []).map((s: any) => ({
      stepKey: String(s.stepKey),
      status: s.status,
      score: s.score,
      completedAt: s.completedAt
    })),
    startedAt: doc.startedAt,
    completedAt: doc.completedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

export class MongooseLessonProgressRepository implements LessonProgressRepository {
  async findByUserAndLessonId(userId: string, lessonId: string): Promise<LessonProgressEntity | null> {
    const progress = await LessonProgressModel.findOne({ userId, lessonId });
    return progress ? toEntity(progress) : null;
  }

  async listByUserAndLessonIds(userId: string, lessonIds: string[]): Promise<LessonProgressEntity[]> {
    const progresses = await LessonProgressModel.find({
      userId,
      lessonId: { $in: lessonIds }
    });
    return progresses.map(toEntity);
  }

  async create(input: {
    userId: string;
    lessonId: string;
    status: "not_started" | "in_progress" | "completed";
    progressPercent: number;
    stepProgress: Array<{
      stepKey: string;
      status: "locked" | "available" | "completed";
      score?: number;
      completedAt?: Date;
    }>;
  }): Promise<LessonProgressEntity> {
    const created = await LessonProgressModel.create(input);
    return toEntity(created);
  }

  async updateById(
    id: string,
    update: Partial<{
      status: "not_started" | "in_progress" | "completed";
      progressPercent: number;
      xpEarned: number;
      stepProgress: Array<{
        stepKey: string;
        status: "locked" | "available" | "completed";
        score?: number;
        completedAt?: Date;
      }>;
      startedAt?: Date;
      completedAt?: Date;
    }>
  ): Promise<LessonProgressEntity | null> {
    const updated = await LessonProgressModel.findByIdAndUpdate(id, update, { new: true });
    return updated ? toEntity(updated) : null;
  }
}
