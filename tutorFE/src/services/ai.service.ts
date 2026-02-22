import api from "@/lib/api";
import { feTutorAiRoutes } from "@/lib/apiRoutes";
import { Lesson, Phrase } from "@/types";

export const aiService = {
  async suggestLesson(topic: string, level: "beginner" | "intermediate" | "advanced") {
    const response = await api.post<{ suggestion: Partial<Lesson> }>(feTutorAiRoutes.suggestLesson(), {
      topic,
      level
    });
    return response.data.suggestion;
  },

  async generatePhrases(lessonId: string, seedWords?: string[]) {
    const response = await api.post<{ phrases: Phrase[] }>(feTutorAiRoutes.generatePhrases(), {
      lessonId,
      seedWords
    });
    return response.data.phrases;
  },

  async enhancePhrase(id: string) {
    const response = await api.post<{ phrase: Phrase }>(feTutorAiRoutes.enhancePhrase(id), {});
    return response.data.phrase;
  }
};
