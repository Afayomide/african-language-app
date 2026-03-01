import api from "@/lib/api";
import { feTutorRoutes } from "@/lib/apiRoutes";
import {
  Lesson,
  Phrase,
  Proverb,
  Language,
  Level,
  Status,
  ExerciseQuestion,
  QuestionType,
  VoiceAudioSubmission
} from "@/types";

type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasPrevPage: boolean;
  hasNextPage: boolean;
};

type PaginatedResult<T> = {
  items: T[];
  total: number;
  pagination: PaginationMeta;
};

type AudioUploadPayload = {
  base64: string;
  mimeType?: string;
  fileName?: string;
};

async function fetchAllPages<T>(
  path: string,
  key: "lessons" | "phrases" | "proverbs" | "questions",
  params?: Record<string, unknown>
) {
  const all: T[] = [];
  let page = 1;

  while (true) {
    const response = await api.get<{
      lessons?: T[];
      phrases?: T[];
      proverbs?: T[];
      questions?: T[];
      pagination?: PaginationMeta;
    }>(path, {
      params: { ...params, page, limit: 100 }
    });

    const items = (response.data[key] || []) as T[];
    all.push(...items);

    if (!response.data.pagination?.hasNextPage) break;
    page += 1;
  }

  return all;
}

export const lessonService = {
  async listLessons(status?: Status) {
    return fetchAllPages<Lesson>(feTutorRoutes.lessons(), "lessons", { status });
  },

  async listLessonsPage(params?: { status?: Status; q?: string; page?: number; limit?: number }) {
    const response = await api.get<{ lessons: Lesson[]; total: number; pagination?: PaginationMeta }>(
      feTutorRoutes.lessons(),
      { params }
    );
    return {
      items: response.data.lessons,
      total: response.data.total ?? response.data.lessons.length,
      pagination: response.data.pagination ?? {
        page: 1,
        limit: response.data.lessons.length || 20,
        total: response.data.lessons.length,
        totalPages: 1,
        hasPrevPage: false,
        hasNextPage: false
      }
    } satisfies PaginatedResult<Lesson>;
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
  },

  async finishLesson(id: string) {
    const response = await api.put<{ lesson: Lesson }>(feTutorRoutes.finishLesson(id));
    return response.data.lesson;
  }
};

export const phraseService = {
  async listPhrases(lessonId?: string, status?: Status) {
    return fetchAllPages<Phrase>(feTutorRoutes.phrases(), "phrases", { lessonId, status });
  },

  async listPhrasesPage(params?: { lessonId?: string; status?: Status; q?: string; page?: number; limit?: number }) {
    const response = await api.get<{ phrases: Phrase[]; total: number; pagination?: PaginationMeta }>(
      feTutorRoutes.phrases(),
      { params }
    );
    return {
      items: response.data.phrases,
      total: response.data.total ?? response.data.phrases.length,
      pagination: response.data.pagination ?? {
        page: 1,
        limit: response.data.phrases.length || 20,
        total: response.data.phrases.length,
        totalPages: 1,
        hasPrevPage: false,
        hasNextPage: false
      }
    } satisfies PaginatedResult<Phrase>;
  },

  async getPhrase(id: string) {
    const response = await api.get<{ phrase: Phrase }>(feTutorRoutes.phrase(id));
    return response.data.phrase;
  },

  async createPhrase(data: Partial<Phrase> & { audioUpload?: AudioUploadPayload }) {
    const response = await api.post<{ phrase: Phrase }>(feTutorRoutes.phrases(), data);
    return response.data.phrase;
  },

  async updatePhrase(id: string, data: Partial<Phrase> & { audioUpload?: AudioUploadPayload }) {
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
  },

  async finishPhrase(id: string) {
    const response = await api.put<{ phrase: Phrase }>(feTutorRoutes.finishPhrase(id));
    return response.data.phrase;
  }
};

export const proverbService = {
  async listProverbs(lessonId?: string, status?: Status) {
    return fetchAllPages<Proverb>(feTutorRoutes.proverbs(), "proverbs", { lessonId, status });
  },

  async listProverbsPage(params?: { lessonId?: string; status?: Status; page?: number; limit?: number }) {
    const response = await api.get<{ proverbs: Proverb[]; total: number; pagination?: PaginationMeta }>(
      feTutorRoutes.proverbs(),
      { params }
    );
    return {
      items: response.data.proverbs,
      total: response.data.total ?? response.data.proverbs.length,
      pagination: response.data.pagination ?? {
        page: 1,
        limit: response.data.proverbs.length || 20,
        total: response.data.proverbs.length,
        totalPages: 1,
        hasPrevPage: false,
        hasNextPage: false
      }
    } satisfies PaginatedResult<Proverb>;
  },

  async createProverb(data: Partial<Proverb> & { lessonIds: string[]; text: string }) {
    const response = await api.post<{ proverb: Proverb }>(feTutorRoutes.proverbs(), data);
    return response.data.proverb;
  },

  async updateProverb(id: string, data: Partial<Proverb>) {
    const response = await api.put<{ proverb: Proverb }>(feTutorRoutes.proverb(id), data);
    return response.data.proverb;
  },

  async deleteProverb(id: string) {
    await api.delete(feTutorRoutes.proverb(id));
  },

  async finishProverb(id: string) {
    const response = await api.put<{ proverb: Proverb }>(feTutorRoutes.finishProverb(id));
    return response.data.proverb;
  }
};

export const questionService = {
  async listQuestions(filters?: { lessonId?: string; type?: QuestionType; status?: Status }) {
    return fetchAllPages<ExerciseQuestion>(feTutorRoutes.questions(), "questions", filters as Record<string, unknown>);
  },

  async listQuestionsPage(filters?: {
    lessonId?: string;
    type?: QuestionType;
    status?: Status;
    q?: string;
    page?: number;
    limit?: number;
  }) {
    const response = await api.get<{ questions: ExerciseQuestion[]; total: number; pagination?: PaginationMeta }>(
      feTutorRoutes.questions(),
      { params: filters }
    );
    return {
      items: response.data.questions,
      total: response.data.total ?? response.data.questions.length,
      pagination: response.data.pagination ?? {
        page: 1,
        limit: response.data.questions.length || 20,
        total: response.data.questions.length,
        totalPages: 1,
        hasPrevPage: false,
        hasNextPage: false
      }
    } satisfies PaginatedResult<ExerciseQuestion>;
  },

  async createQuestion(data: {
    lessonId: string;
    phraseId: string;
    type: QuestionType;
    subtype: string;
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

  async finishQuestion(id: string) {
    const response = await api.put<{ question: ExerciseQuestion }>(feTutorRoutes.finishQuestion(id));
    return response.data.question;
  }
};

export const tutorVoiceAudioService = {
  async listSubmissions(params?: {
    status?: "pending" | "accepted" | "rejected";
    phraseId?: string;
    q?: string;
    page?: number;
    limit?: number;
  }) {
    const response = await api.get<{ submissions: VoiceAudioSubmission[]; total: number; pagination?: PaginationMeta }>(
      feTutorRoutes.voiceAudioSubmissions(),
      { params }
    );
    return {
      items: response.data.submissions,
      total: response.data.total ?? response.data.submissions.length,
      pagination: response.data.pagination ?? {
        page: 1,
        limit: response.data.submissions.length || 20,
        total: response.data.submissions.length,
        totalPages: 1,
        hasPrevPage: false,
        hasNextPage: false
      }
    } satisfies PaginatedResult<VoiceAudioSubmission>;
  },

  async acceptSubmission(id: string) {
    const response = await api.put<{ submission: VoiceAudioSubmission }>(
      feTutorRoutes.acceptVoiceAudioSubmission(id)
    );
    return response.data.submission;
  },

  async rejectSubmission(id: string, reason: string) {
    const response = await api.put<{ submission: VoiceAudioSubmission }>(
      feTutorRoutes.rejectVoiceAudioSubmission(id),
      { reason }
    );
    return response.data.submission;
  }
};
