import api from "@/lib/api";
import { feAdminRoutes, feAiRoutes } from "@/lib/apiRoutes";
import { Lesson, Phrase, Proverb, Language, Level } from "@/types";

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
  }
};
