import type { ContentType } from "../entities/Content.js";
import type { Language } from "../entities/Lesson.js";
import type { QuestionSubtype, QuestionType } from "../entities/Question.js";
import type { LearnerContentPerformanceEntity } from "../entities/LearnerContentPerformance.js";

export type LearnerContentPerformanceUpsertInput = {
  userId: string;
  language: Language;
  contentType: ContentType;
  contentId: string;
  exposureIncrement: number;
  attemptIncrement: number;
  correctIncrement: number;
  wrongIncrement: number;
  retryIncrement: number;
  speakingFailureIncrement: number;
  listeningFailureIncrement: number;
  contextScenarioFailureIncrement: number;
  lastLessonId?: string;
  lastQuestionType?: QuestionType;
  lastQuestionSubtype?: QuestionSubtype;
  seenAt: Date;
};

export interface LearnerContentPerformanceRepository {
  listByUserAndLanguage(userId: string, language: Language): Promise<LearnerContentPerformanceEntity[]>;
  upsertMany(rows: LearnerContentPerformanceUpsertInput[]): Promise<void>;
}
