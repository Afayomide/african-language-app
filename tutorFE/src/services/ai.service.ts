import api from "@/lib/api";
import { feTutorAiRoutes } from "@/lib/apiRoutes";
import { Lesson, Phrase, Proverb } from "@/types";

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
      proverbsPerLesson?: number;
      topics?: string[];
      extraInstructions?: string;
    }
  ) {
    const response = await api.post<{
      unitId: string;
      requestedLessons: number;
      createdLessons: number;
      skippedLessons: Array<{ reason: string; topic?: string; title?: string }>;
      lessonGenerationErrors: Array<{ topic?: string; error: string }>;
      contentErrors: Array<{ lessonId?: string; title?: string; error: string }>;
      lessons: Array<{
        lessonId: string;
        title: string;
        phrasesGenerated: number;
        proverbsGenerated: number;
        questionsGenerated: number;
        blocksGenerated: number;
      }>;
    }>(feTutorAiRoutes.generateUnitContent(unitId), payload || {});
    return response.data;
  },

  async reviseUnitContent(
    unitId: string,
    payload: {
      mode: "refactor" | "regenerate";
      lessonCount?: number;
      phrasesPerLesson?: number;
      proverbsPerLesson?: number;
      topics?: string[];
      extraInstructions?: string;
    }
  ) {
    const response = await api.post<{
      unitId: string;
      requestedLessons: number;
      createdLessons: number;
      updatedLessons: number;
      clearedLessons: number;
      revisionMode: "refactor" | "regenerate";
      skippedLessons: Array<{ reason: string; topic?: string; title?: string }>;
      lessonGenerationErrors: Array<{ topic?: string; error: string }>;
      contentErrors: Array<{ lessonId?: string; title?: string; error: string }>;
      lessons: Array<{
        lessonId: string;
        title: string;
        phrasesGenerated: number;
        proverbsGenerated: number;
        questionsGenerated: number;
        blocksGenerated: number;
      }>;
    }>(feTutorAiRoutes.reviseUnitContent(unitId), payload);
    return response.data;
  }
};
