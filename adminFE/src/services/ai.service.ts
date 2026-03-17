import api from "@/lib/api";
import { feAdminRoutes, feAiRoutes } from "@/lib/apiRoutes";
import { Lesson, Phrase, Proverb, Language, Level } from "@/types";

type UnitContentLessonSummary = {
  lessonId: string;
  title: string;
  phrasesGenerated: number;
  repeatedPhrasesLinked: number;
  newPhrasesSelected: number;
  reviewPhrasesSelected: number;
  phrasesDroppedFromCandidates: number;
  proverbsGenerated: number;
  questionsGenerated: number;
  blocksGenerated: number;
};

type UnitContentResult = {
  unitId: string;
  requestedLessons: number;
  createdLessons: number;
  skippedLessons: Array<{ reason: string; topic?: string; title?: string }>;
  lessonGenerationErrors: Array<{ topic?: string; error: string }>;
  contentErrors: Array<{ lessonId?: string; title?: string; error: string }>;
  lessons: UnitContentLessonSummary[];
};

type UnitRevisionResult = UnitContentResult & {
  updatedLessons: number;
  clearedLessons: number;
  revisionMode: "refactor" | "regenerate";
};

type LessonRefactorResult = {
  unitId: string;
  lessonId: string;
  updatedLesson: boolean;
  lesson: UnitContentLessonSummary;
  patch: {
    lessonId: string;
    lessonTitle?: string;
    rationale?: string;
    operations: Array<{ type: string }>;
  } | null;
};

export const aiService = {
  async generatePhrases(
    lessonId: string,
    language: Language,
    level: Level,
    seedWords?: string[],
    extraInstructions?: string
  ) {
    const response = await api.post<{ phrases: Phrase[] }>(
      feAiRoutes.generatePhrases(),
      { lessonId, language, level, seedWords, extraInstructions }
    );
    return response.data.phrases;
  },

  async enhancePhrase(id: string, language: Language, level: Level) {
    const response = await api.post<{ phrase: Phrase }>(
      feAiRoutes.enhancePhrase(id),
      { language, level }
    );
    return response.data.phrase;
  },

  async suggestLesson(topic: string, language: Language, level: Level) {
    const response = await api.post<{ suggestion: Partial<Lesson> }>(
      feAiRoutes.suggestLesson(),
      { topic, language, level }
    );
    return response.data.suggestion;
  },

  async generateProverbs(lessonId: string, count?: number, extraInstructions?: string) {
    const response = await api.post<{ proverbs: Proverb[] }>(
      feAdminRoutes.generateLessonProverbs(),
      { lessonId, count, extraInstructions }
    );
    return response.data.proverbs;
  },

  async generateUnitContent(
    unitId: string,
    payload?: {
      lessonCount?: number;
      phrasesPerLesson?: number;
      reviewPhrasesPerLesson?: number;
      proverbsPerLesson?: number;
      topics?: string[];
      extraInstructions?: string;
    }
  ) {
    const response = await api.post<UnitContentResult>(feAdminRoutes.generateUnitContent(unitId), payload || {});
    return response.data;
  },

  async reviseUnitContent(
    unitId: string,
    payload: {
      mode: "refactor" | "regenerate";
      lessonCount?: number;
      phrasesPerLesson?: number;
      reviewPhrasesPerLesson?: number;
      proverbsPerLesson?: number;
      topics?: string[];
      extraInstructions?: string;
    }
  ) {
    const response = await api.post<UnitRevisionResult>(feAdminRoutes.reviseUnitContent(unitId), payload);
    return response.data;
  },

  async refactorLessonContent(
    lessonId: string,
    payload?: {
      topic?: string;
      extraInstructions?: string;
    }
  ) {
    const response = await api.post<LessonRefactorResult>(
      feAdminRoutes.refactorLessonContent(lessonId),
      payload || {}
    );
    return response.data;
  }
};
