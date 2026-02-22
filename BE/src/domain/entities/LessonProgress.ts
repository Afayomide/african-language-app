export type LessonStepStatus = "locked" | "available" | "completed";

export type LessonStepProgressEntity = {
  stepKey: string;
  status: LessonStepStatus;
  score?: number;
  completedAt?: Date;
};

export type LessonProgressStatus = "not_started" | "in_progress" | "completed";

export type LessonProgressEntity = {
  id: string;
  _id?: string;
  userId: string;
  lessonId: string;
  status: LessonProgressStatus;
  progressPercent: number;
  xpEarned: number;
  stepProgress: LessonStepProgressEntity[];
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};
