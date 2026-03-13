import LessonProgressModel, { type LessonProgressDocument } from "../../../../models/learner/LessonProgress.js";
import type { LessonProgressEntity } from "../../../../domain/entities/LessonProgress.js";
import type { LessonProgressRepository } from "../../../../domain/repositories/LessonProgressRepository.js";

function toEntity(doc: LessonProgressDocument): LessonProgressEntity {
  return {
    id: doc._id.toString(),
    _id: doc._id.toString(),
    userId: doc.userId.toString(),
    lessonId: doc.lessonId.toString(),
    status: doc.status,
    progressPercent: doc.progressPercent,
    xpEarned: doc.xpEarned ?? 0,
    stepProgress: (doc.stepProgress || []).map((step) => ({
      stepKey: String(step.stepKey),
      status: step.status,
      score: step.score,
      completedAt: step.completedAt ?? undefined
    })),
    stageProgress: (doc.stageProgress || []).map((stage) => ({
      stageId: String(stage.stageId),
      stageIndex: stage.stageIndex,
      status: stage.status,
      completedAt: stage.completedAt ?? undefined
    })),
    currentStageIndex: doc.currentStageIndex ?? 0,
    startedAt: doc.startedAt ?? undefined,
    completedAt: doc.completedAt ?? undefined,
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
    stageProgress: Array<{
      stageId: string;
      stageIndex: number;
      status: "not_started" | "in_progress" | "completed";
      completedAt?: Date;
    }>;
    currentStageIndex: number;
  }): Promise<LessonProgressEntity> {
    const updated = await LessonProgressModel.findOneAndUpdate(
      { userId: input.userId, lessonId: input.lessonId },
      {
        $setOnInsert: {
          userId: input.userId,
          lessonId: input.lessonId,
          status: input.status,
          progressPercent: input.progressPercent,
          stepProgress: input.stepProgress,
          stageProgress: input.stageProgress,
          currentStageIndex: input.currentStageIndex
        }
      },
      { upsert: true, new: true }
    );
    return toEntity(updated);
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
      stageProgress: Array<{
        stageId: string;
        stageIndex: number;
        status: "not_started" | "in_progress" | "completed";
        completedAt?: Date;
      }>;
      currentStageIndex: number;
      startedAt?: Date;
      completedAt?: Date;
    }>
  ): Promise<LessonProgressEntity | null> {
    const updated = await LessonProgressModel.findByIdAndUpdate(id, update, { new: true });
    return updated ? toEntity(updated) : null;
  }
}
