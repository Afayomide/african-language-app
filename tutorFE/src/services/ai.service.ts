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
  }
};
