import type { LessonProgressEntity, LessonProgressStatus, LessonStepProgressEntity } from "../entities/LessonProgress.js";

export interface LessonProgressRepository {
  findByUserAndLessonId(userId: string, lessonId: string): Promise<LessonProgressEntity | null>;
  listByUserAndLessonIds(userId: string, lessonIds: string[]): Promise<LessonProgressEntity[]>;
  create(input: {
    userId: string;
    lessonId: string;
    status: LessonProgressStatus;
    progressPercent: number;
    stepProgress: LessonStepProgressEntity[];
  }): Promise<LessonProgressEntity>;
  updateById(
    id: string,
    update: Partial<{
      status: LessonProgressStatus;
      progressPercent: number;
      xpEarned: number;
      stepProgress: LessonStepProgressEntity[];
      startedAt?: Date;
      completedAt?: Date;
    }>
  ): Promise<LessonProgressEntity | null>;
}
