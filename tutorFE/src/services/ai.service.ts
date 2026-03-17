import api from "@/lib/api";
import { feTutorAiRoutes } from "@/lib/apiRoutes";
import { Lesson, Phrase, Proverb } from "@/types";

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
  async suggestLesson(topic: string, language: string, level: "beginner" | "intermediate" | "advanced") {
    const response = await api.post<{ suggestion: Partial<Lesson> }>(feTutorAiRoutes.suggestLesson(), {
      topic,
      language,
      level
    });
    return response.data.suggestion;
  },

  async generatePhrases(lessonId: string, seedWords?: string[], extraInstructions?: string) {
    const response = await api.post<{ phrases: Phrase[] }>(feTutorAiRoutes.generatePhrases(), {
      lessonId,
      seedWords,
      extraInstructions
    });
    return response.data.phrases;
  },

  async enhancePhrase(id: string) {
    const response = await api.post<{ phrase: Phrase }>(feTutorAiRoutes.enhancePhrase(id), {});
    return response.data.phrase;
  },

  async generateProverbs(lessonId: string, count?: number, extraInstructions?: string) {
    const response = await api.post<{ proverbs: Proverb[] }>(
      feTutorAiRoutes.generateProverbs(),
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
    const response = await api.post<UnitContentResult>(feTutorAiRoutes.generateUnitContent(unitId), payload || {});
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
    const response = await api.post<UnitRevisionResult>(feTutorAiRoutes.reviseUnitContent(unitId), payload);
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
      feTutorAiRoutes.refactorLessonContent(lessonId),
      payload || {}
    );
    return response.data;
  }
};
