import api from "@/lib/api";
import { feAdminRoutes } from "@/lib/apiRoutes";
import { Lesson, Phrase, Language, Level, Status, ExerciseQuestion, QuestionType, Tutor } from "@/types";

export const lessonService = {
  async listLessons(status?: Status, language?: Language) {
    const response = await api.get<{ lessons: Lesson[] }>(feAdminRoutes.lessons(), {
      params: { status, language },
    });
    return response.data.lessons;
  },

  async getLesson(id: string) {
    const response = await api.get<{ lesson: Lesson }>(feAdminRoutes.lesson(id));
    return response.data.lesson;
  },

  async createLesson(data: { title: string; language: Language; level: Level; description?: string; topics?: string[] }) {
    const response = await api.post<{ lesson: Lesson }>(feAdminRoutes.lessons(), data);
    return response.data.lesson;
  },

  async updateLesson(id: string, data: Partial<Lesson>) {
    const response = await api.put<{ lesson: Lesson }>(feAdminRoutes.lesson(id), data);
    return response.data.lesson;
  },

  async deleteLesson(id: string) {
    await api.delete(feAdminRoutes.lesson(id));
  },

  async publishLesson(id: string) {
    const response = await api.put<{ lesson: Lesson }>(feAdminRoutes.publishLesson(id));
    return response.data.lesson;
  },

  async reorderLessons(language: Language, lessonIds: string[]) {
    const response = await api.put<{ lessons: Lesson[] }>(feAdminRoutes.reorderLessons(), {
      language,
      lessonIds,
    });
    return response.data.lessons;
  },

  async generateBulkLessons(data: {
    language: Language;
    level: Level;
    count?: number;
    title?: string;
    topics?: string[];
  }) {
    const response = await api.post<{
      totalRequested: number;
      createdCount: number;
      skippedCount: number;
      errorCount: number;
      lessons: Lesson[];
      skipped: { reason: string; title?: string }[];
      errors: { title?: string; error: string }[];
    }>(feAdminRoutes.generateBulkLessons(), data);
    return response.data;
  },
};

export const phraseService = {
  async listPhrases(lessonId?: string, status?: Status, language?: Language) {
    const response = await api.get<{ phrases: Phrase[] }>(feAdminRoutes.phrases(), {
      params: { lessonId, status, language },
    });
    return response.data.phrases;
  },

  async getPhrase(id: string) {
    const response = await api.get<{ phrase: Phrase }>(feAdminRoutes.phrase(id));
    return response.data.phrase;
  },

  async createPhrase(data: Partial<Phrase>) {
    const response = await api.post<{ phrase: Phrase }>(feAdminRoutes.phrases(), data);
    return response.data.phrase;
  },

  async updatePhrase(id: string, data: Partial<Phrase>) {
    const response = await api.put<{ phrase: Phrase }>(feAdminRoutes.phrase(id), data);
    return response.data.phrase;
  },

  async deletePhrase(id: string) {
    await api.delete(feAdminRoutes.phrase(id));
  },

  async publishPhrase(id: string) {
    const response = await api.put<{ phrase: Phrase }>(feAdminRoutes.publishPhrase(id));
    return response.data.phrase;
  },

  async generatePhraseAudio(id: string) {
    const response = await api.put<{ phrase: Phrase }>(feAdminRoutes.generatePhraseAudio(id));
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
    }>(feAdminRoutes.bulkPhraseAudio(lessonId));
    return response.data;
  },
};

export const questionService = {
  async listQuestions(filters?: { lessonId?: string; type?: QuestionType; status?: Status }) {
    const response = await api.get<{ questions: ExerciseQuestion[] }>(feAdminRoutes.questions(), {
      params: filters,
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
    const response = await api.post<{ question: ExerciseQuestion }>(feAdminRoutes.questions(), data);
    return response.data.question;
  },

  async updateQuestion(id: string, data: Partial<ExerciseQuestion>) {
    const response = await api.put<{ question: ExerciseQuestion }>(feAdminRoutes.question(id), data);
    return response.data.question;
  },

  async deleteQuestion(id: string) {
    await api.delete(feAdminRoutes.question(id));
  },

  async publishQuestion(id: string) {
    const response = await api.put<{ question: ExerciseQuestion }>(feAdminRoutes.publishQuestion(id));
    return response.data.question;
  },
};

export const tutorService = {
  async listTutors(status: "all" | "active" | "pending" = "all") {
    const response = await api.get<{ tutors: Tutor[] }>(feAdminRoutes.tutors(), {
      params: { status }
    });
    return response.data.tutors;
  },

  async activateTutor(id: string) {
    const response = await api.put<{ tutor: Tutor }>(feAdminRoutes.activateTutor(id));
    return response.data.tutor;
  },

  async deactivateTutor(id: string) {
    const response = await api.put<{ tutor: Tutor }>(feAdminRoutes.deactivateTutor(id));
    return response.data.tutor;
  },

  async deleteTutor(id: string) {
    await api.delete(feAdminRoutes.deleteTutor(id));
  }
};
