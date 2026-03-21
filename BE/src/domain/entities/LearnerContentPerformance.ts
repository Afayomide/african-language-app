import type { ContentType } from "./Content.js";
import type { Language } from "./Lesson.js";
import type { QuestionSubtype, QuestionType } from "./Question.js";

export type LearnerContentPerformanceEntity = {
  id: string;
  _id?: string;
  userId: string;
  language: Language;
  contentType: ContentType;
  contentId: string;
  exposureCount: number;
  attemptCount: number;
  correctCount: number;
  wrongCount: number;
  retryCount: number;
  speakingFailureCount: number;
  listeningFailureCount: number;
  contextScenarioFailureCount: number;
  lastLessonId?: string;
  lastQuestionType?: QuestionType;
  lastQuestionSubtype?: QuestionSubtype;
  firstSeenAt: Date;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
};
