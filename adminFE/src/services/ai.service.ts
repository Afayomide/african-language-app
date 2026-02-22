import api from "@/lib/api";
import { feAiRoutes } from "@/lib/apiRoutes";
import { Lesson, Phrase, Language, Level } from "@/types";

export const aiService = {
  async generatePhrases(
    lessonId: string,
    language: Language,
    level: Level,
    seedWords?: string[]
  ) {
    const response = await api.post<{ phrases: Phrase[] }>(
      feAiRoutes.generatePhrases(),
      { lessonId, language, level, seedWords }
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
};
