import api from "@/lib/api";
import { feTutorRoutes } from "@/lib/apiRoutes";
import { Lesson, Phrase, Language, Level, Status, ExerciseQuestion, QuestionType } from "@/types";

export const lessonService = {
  async listLessons(status?: Status) {
    const response = await api.get<{ lessons: Lesson[] }>(feTutorRoutes.lessons(), {
      params: { status }
    });
    return response.data.lessons;
  },

  async getLesson(id: string) {
    const response = await api.get<{ lesson: Lesson }>(feTutorRoutes.lesson(id));
    return response.data.lesson;
  },

  async createLesson(data: { title: string; level: Level; description?: string; language?: Language; topics?: string[] }) {
    const response = await api.post<{ lesson: Lesson }>(feTutorRoutes.lessons(), data);
    return response.data.lesson;
  },

  async updateLesson(id: string, data: Partial<Lesson>) {
    const response = await api.put<{ lesson: Lesson }>(feTutorRoutes.lesson(id), data);
    return response.data.lesson;
  },

  async deleteLesson(id: string) {
    await api.delete(feTutorRoutes.lesson(id));
  },

  async reorderLessons(lessonIds: string[]) {
    const response = await api.put<{ lessons: Lesson[] }>(feTutorRoutes.reorderLessons(), {
      lessonIds
    });
    return response.data.lessons;
  }
};

export const phraseService = {
  async listPhrases(lessonId?: string, status?: Status) {
    const response = await api.get<{ phrases: Phrase[] }>(feTutorRoutes.phrases(), {
      params: { lessonId, status }
    });
    return response.data.phrases;
  },

  async getPhrase(id: string) {
    const response = await api.get<{ phrase: Phrase }>(feTutorRoutes.phrase(id));
    return response.data.phrase;
  },

  async createPhrase(data: Partial<Phrase>) {
    const response = await api.post<{ phrase: Phrase }>(feTutorRoutes.phrases(), data);
    return response.data.phrase;
  },

  async updatePhrase(id: string, data: Partial<Phrase>) {
    const response = await api.put<{ phrase: Phrase }>(feTutorRoutes.phrase(id), data);
    return response.data.phrase;
  },

  async deletePhrase(id: string) {
    await api.delete(feTutorRoutes.phrase(id));
  },

  async generatePhraseAudio(id: string) {
    const response = await api.put<{ phrase: Phrase }>(feTutorRoutes.generatePhraseAudio(id));
    return response.data.phrase;
  },

  async generateLessonPhraseAudio(lessonId: string) {
    const response = await api.put<{
      lessonId: string;
      total: number;
      updatedCount: number;
      failedCount: number;
      updatedIds: string[];
      failedIds: string[];
    }>(feTutorRoutes.bulkPhraseAudio(lessonId));
    return response.data;
  }
};

export const questionService = {
  async listQuestions(filters?: { lessonId?: string; type?: QuestionType; status?: Status }) {
    const response = await api.get<{ questions: ExerciseQuestion[] }>(feTutorRoutes.questions(), {
      params: filters
    });
    return response.data.questions;
  },

  async createQuestion(data: {
    lessonId: string;
    phraseId: string;
    type: QuestionType;
    promptTemplate: string;
    options?: string[];
    correctIndex?: number;
    reviewData?: {
      sentence: string;
      words: string[];
      correctOrder: number[];
      meaning: string;
    };
    explanation?: string;
  }) {
    const response = await api.post<{ question: ExerciseQuestion }>(feTutorRoutes.questions(), data);
    return response.data.question;
  },

  async updateQuestion(id: string, data: Partial<ExerciseQuestion>) {
    const response = await api.put<{ question: ExerciseQuestion }>(feTutorRoutes.question(id), data);
    return response.data.question;
  },

  async deleteQuestion(id: string) {
    await api.delete(feTutorRoutes.question(id));
  },

  async publishQuestion(id: string) {
    const response = await api.put<{ question: ExerciseQuestion }>(feTutorRoutes.publishQuestion(id));
    return response.data.question;
  }
};
