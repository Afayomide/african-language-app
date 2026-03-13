import api from "@/lib/api";
import { feAdminRoutes } from "@/lib/apiRoutes";
import {
  Lesson,
  Unit,
  Phrase,
  Proverb,
  Language,
  Level,
  Status,
  ExerciseQuestion,
  QuestionType,
  ImageAsset,
  PhraseImageLink,
  Tutor,
  AdminUserRecord,
  UserRole,
  VoiceArtist,
  VoiceAudioSubmission,
  LessonAuditResult
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
  async listLessons(status?: Status, language?: Language) {
    return fetchAllPages<Lesson>(feAdminRoutes.lessons(), "lessons", { status, language });
  },

  async listLessonsPage(params?: { status?: Status; language?: Language; unitId?: string; q?: string; page?: number; limit?: number }) {
    const response = await api.get<{ lessons: Lesson[]; total: number; pagination?: PaginationMeta }>(
      feAdminRoutes.lessons(),
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
    const response = await api.get<{ lesson: Lesson }>(feAdminRoutes.lesson(id));
    return response.data.lesson;
  },

  async auditLesson(id: string) {
    const response = await api.get<{ audit: LessonAuditResult }>(feAdminRoutes.auditLesson(id));
    return response.data.audit;
  },

  async createLesson(data: {
    title: string;
    unitId: string;
    description?: string;
    topics?: string[];
    proverbs?: Array<{ text: string; translation: string; contextNote: string }>;
  }) {
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

  async bulkDeleteLessons(ids: string[]) {
    const response = await api.delete<{ deletedIds: string[] }>(feAdminRoutes.bulkDeleteLessons(), {
      data: { ids }
    });
    return {
      ...response.data,
      deletedCount: response.data.deletedIds.length
    };
  },

  async publishLesson(id: string) {
    const response = await api.put<{ lesson: Lesson }>(feAdminRoutes.publishLesson(id));
    return response.data.lesson;
  },

  async reorderLessons(unitId: string, lessonIds: string[]) {
    const response = await api.put<{ lessons: Lesson[] }>(feAdminRoutes.reorderLessons(), {
      unitId,
      lessonIds,
    });
    return response.data.lessons;
  },

  async generateBulkLessons(data: {
    unitId: string;
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

export const unitService = {
  async listUnits(status?: Status, language?: Language) {
    const response = await api.get<{ units: Unit[] }>(feAdminRoutes.units(), {
      params: { status, language }
    });
    return response.data.units || [];
  },

  async getUnit(id: string) {
    const response = await api.get<{ unit: Unit }>(feAdminRoutes.unit(id));
    return response.data.unit;
  },

  async getDeletedEntries(id: string) {
    const response = await api.get<{ lessons: Lesson[]; phrases: Phrase[] }>(feAdminRoutes.unitDeletedEntries(id));
    return response.data;
  },

  async createUnit(data: { title: string; description?: string; language: Language; level: Level }) {
    const response = await api.post<{ unit: Unit }>(feAdminRoutes.units(), data);
    return response.data.unit;
  },

  async updateUnit(id: string, data: Partial<Unit>) {
    const response = await api.put<{ unit: Unit }>(feAdminRoutes.unit(id), data);
    return response.data.unit;
  },

  async deleteUnit(id: string) {
    await api.delete(feAdminRoutes.unit(id));
  },

  async restoreDeletedLesson(unitId: string, lessonId: string) {
    const response = await api.post<{ lesson: Lesson }>(feAdminRoutes.restoreDeletedUnitLesson(unitId, lessonId));
    return response.data.lesson;
  },

  async restoreDeletedPhrase(unitId: string, phraseId: string) {
    const response = await api.post<{ phrase: Phrase }>(feAdminRoutes.restoreDeletedUnitPhrase(unitId, phraseId));
    return response.data.phrase;
  },

  async finishUnit(id: string) {
    const response = await api.put<{ unit: Unit }>(feAdminRoutes.finishUnit(id));
    return response.data.unit;
  },

  async publishUnit(id: string) {
    const response = await api.put<{ unit: Unit }>(feAdminRoutes.publishUnit(id));
    return response.data.unit;
  },

  async reorderUnits(language: Language, unitIds: string[]) {
    const response = await api.put<{ units: Unit[] }>(feAdminRoutes.reorderUnits(), {
      language,
      unitIds
    });
    return response.data.units || [];
  },

  async generateBulkUnits(data: {
    language: Language;
    level: Level;
    count?: number;
    topic?: string;
  }) {
    const response = await api.post<{
      totalRequested: number;
      createdCount: number;
      skippedCount: number;
      errorCount: number;
      units: Unit[];
      skipped: Array<{ reason: string; title?: string }>;
      errors: Array<{ index: number; error: string }>;
    }>(feAdminRoutes.generateBulkUnits(), data);
    return response.data;
  }
};

export const phraseService = {
  async listPhrases(lessonId?: string, status?: Status, language?: Language) {
    return fetchAllPages<Phrase>(feAdminRoutes.phrases(), "phrases", { lessonId, status, language });
  },

  async listPhrasesPage(params?: {
    lessonId?: string;
    status?: Status;
    language?: Language;
    q?: string;
    page?: number;
    limit?: number;
  }) {
    const response = await api.get<{ phrases: Phrase[]; total: number; pagination?: PaginationMeta }>(
      feAdminRoutes.phrases(),
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
    const response = await api.get<{ phrase: Phrase }>(feAdminRoutes.phrase(id));
    return response.data.phrase;
  },

  async listPhraseImages(id: string) {
    const response = await api.get<{ phraseId: string; images: PhraseImageLink[] }>(feAdminRoutes.phraseImages(id));
    return response.data.images;
  },

  async linkPhraseImage(
    id: string,
    data: {
      imageAssetId: string;
      translationIndex?: number | null;
      isPrimary?: boolean;
      notes?: string;
    }
  ) {
    const response = await api.post<{ images: PhraseImageLink[] }>(feAdminRoutes.phraseImages(id), data);
    return response.data.images;
  },

  async updatePhraseImageLink(
    id: string,
    linkId: string,
    data: {
      imageAssetId?: string;
      translationIndex?: number | null;
      isPrimary?: boolean;
      notes?: string;
    }
  ) {
    const response = await api.put<{ images: PhraseImageLink[] }>(feAdminRoutes.phraseImageLink(id, linkId), data);
    return response.data.images;
  },

  async deletePhraseImageLink(id: string, linkId: string) {
    const response = await api.delete<{ images: PhraseImageLink[] }>(feAdminRoutes.phraseImageLink(id, linkId));
    return response.data.images;
  },

  async createPhrase(data: Partial<Phrase> & { audioUpload?: AudioUploadPayload }) {
    const response = await api.post<{ phrase: Phrase }>(feAdminRoutes.phrases(), data);
    return response.data.phrase;
  },

  async updatePhrase(id: string, data: Partial<Phrase> & { audioUpload?: AudioUploadPayload }) {
    const response = await api.put<{ phrase: Phrase }>(feAdminRoutes.phrase(id), data);
    return response.data.phrase;
  },

  async deletePhrase(id: string) {
    await api.delete(feAdminRoutes.phrase(id));
  },

  async bulkDeletePhrases(ids: string[]) {
    const response = await api.delete<{ deletedIds: string[] }>(feAdminRoutes.bulkDeletePhrases(), {
      data: { ids }
    });
    return {
      ...response.data,
      deletedCount: response.data.deletedIds.length
    };
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

export const imageService = {
  async listImagesPage(params?: { status?: "draft" | "approved"; q?: string; page?: number; limit?: number }) {
    const response = await api.get<{ images: ImageAsset[]; total: number; pagination?: PaginationMeta }>(
      feAdminRoutes.images(),
      { params }
    );
    return {
      items: response.data.images,
      total: response.data.total ?? response.data.images.length,
      pagination: response.data.pagination ?? {
        page: 1,
        limit: response.data.images.length || 20,
        total: response.data.images.length,
        totalPages: 1,
        hasPrevPage: false,
        hasNextPage: false
      }
    } satisfies PaginatedResult<ImageAsset>;
  },

  async createImage(data: {
    url?: string;
    thumbnailUrl?: string;
    mimeType?: string;
    width?: number;
    height?: number;
    description?: string;
    altText: string;
    tags?: string[];
    languageNeutralLabel?: string;
    status?: "draft" | "approved";
    imageUpload?: { base64: string; mimeType?: string; fileName?: string };
  }) {
    const response = await api.post<{ image: ImageAsset }>(feAdminRoutes.images(), data);
    return response.data.image;
  },

  async updateImage(id: string, data: Partial<ImageAsset> & {
    imageUpload?: { base64: string; mimeType?: string; fileName?: string };
  }) {
    const response = await api.put<{ image: ImageAsset }>(feAdminRoutes.image(id), data);
    return response.data.image;
  },

  async deleteImage(id: string) {
    await api.delete(feAdminRoutes.image(id));
  }
};

export const proverbService = {
  async listProverbs(lessonId?: string, status?: Status, language?: Language) {
    return fetchAllPages<Proverb>(feAdminRoutes.proverbs(), "proverbs", { lessonId, status, language });
  },

  async listProverbsPage(params?: {
    lessonId?: string;
    status?: Status;
    language?: Language;
    page?: number;
    limit?: number;
  }) {
    const response = await api.get<{ proverbs: Proverb[]; total: number; pagination?: PaginationMeta }>(
      feAdminRoutes.proverbs(),
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

  async createProverb(data: Partial<Proverb> & { lessonIds: string[]; language: Language; text: string }) {
    const response = await api.post<{ proverb: Proverb }>(feAdminRoutes.proverbs(), data);
    return response.data.proverb;
  },

  async updateProverb(id: string, data: Partial<Proverb>) {
    const response = await api.put<{ proverb: Proverb }>(feAdminRoutes.proverb(id), data);
    return response.data.proverb;
  },

  async deleteProverb(id: string) {
    await api.delete(feAdminRoutes.proverb(id));
  },

  async finishProverb(id: string) {
    const response = await api.put<{ proverb: Proverb }>(feAdminRoutes.finishProverb(id));
    return response.data.proverb;
  },

  async publishProverb(id: string) {
    const response = await api.put<{ proverb: Proverb }>(feAdminRoutes.publishProverb(id));
    return response.data.proverb;
  }
};

export const questionService = {
  async listQuestions(filters?: { lessonId?: string; type?: QuestionType; status?: Status }) {
    return fetchAllPages<ExerciseQuestion>(feAdminRoutes.questions(), "questions", filters as Record<string, unknown>);
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
      feAdminRoutes.questions(),
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
    relatedPhraseIds?: string[];
    translationIndex?: number;
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
    interactionData?: {
      matchingPairs?: Array<{
        phraseId: string;
        translationIndex: number;
        imageAssetId?: string;
      }>;
    };
    explanation?: string;
  }) {
    const response = await api.post<{ question: ExerciseQuestion }>(feAdminRoutes.questions(), data);
    return response.data.question;
  },

  async getQuestion(id: string) {
    const response = await api.get<{ question: ExerciseQuestion }>(feAdminRoutes.question(id));
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

  async sendBackToTutorQuestion(id: string) {
    const response = await api.put<{ question: ExerciseQuestion }>(feAdminRoutes.sendBackToTutorQuestion(id));
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

  async listTutorsPage(params?: {
    status?: "all" | "active" | "pending";
    q?: string;
    page?: number;
    limit?: number;
  }) {
    const response = await api.get<{ tutors: Tutor[]; total: number; pagination?: PaginationMeta }>(
      feAdminRoutes.tutors(),
      { params }
    );
    return {
      items: response.data.tutors,
      total: response.data.total ?? response.data.tutors.length,
      pagination: response.data.pagination ?? {
        page: 1,
        limit: response.data.tutors.length || 20,
        total: response.data.tutors.length,
        totalPages: 1,
        hasPrevPage: false,
        hasNextPage: false
      }
    } satisfies PaginatedResult<Tutor>;
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

export const userService = {
  async listUsersPage(params?: {
    role?: "all" | UserRole;
    q?: string;
    page?: number;
    limit?: number;
  }) {
    const response = await api.get<{ users: AdminUserRecord[]; total: number; pagination?: PaginationMeta }>(
      feAdminRoutes.users(),
      { params }
    );
    return {
      items: response.data.users,
      total: response.data.total ?? response.data.users.length,
      pagination: response.data.pagination ?? {
        page: 1,
        limit: response.data.users.length || 20,
        total: response.data.users.length,
        totalPages: 1,
        hasPrevPage: false,
        hasNextPage: false
      }
    } satisfies PaginatedResult<AdminUserRecord>;
  },

  async assignUserRole(
    id: string,
    data: { role: UserRole; language?: Language; displayName?: string }
  ) {
    const response = await api.put<{ user: AdminUserRecord }>(feAdminRoutes.assignUserRole(id), data);
    return response.data.user;
  },

  async activateUser(id: string, data: { role: UserRole; language?: Language }) {
    const response = await api.put<{ user: AdminUserRecord }>(feAdminRoutes.activateUser(id), data);
    return response.data.user;
  },

  async deactivateUser(id: string, data: { role: UserRole }) {
    const response = await api.put<{ user: AdminUserRecord }>(feAdminRoutes.deactivateUser(id), data);
    return response.data.user;
  }
};

export const voiceArtistService = {
  async listVoiceArtists(status: "all" | "active" | "pending" = "all") {
    const response = await api.get<{ voiceArtists: VoiceArtist[] }>(feAdminRoutes.voiceArtists(), {
      params: { status }
    });
    return response.data.voiceArtists;
  },

  async listVoiceArtistsPage(params?: {
    status?: "all" | "active" | "pending";
    q?: string;
    page?: number;
    limit?: number;
  }) {
    const response = await api.get<{ voiceArtists: VoiceArtist[]; total: number; pagination?: PaginationMeta }>(
      feAdminRoutes.voiceArtists(),
      { params }
    );
    return {
      items: response.data.voiceArtists,
      total: response.data.total ?? response.data.voiceArtists.length,
      pagination: response.data.pagination ?? {
        page: 1,
        limit: response.data.voiceArtists.length || 20,
        total: response.data.voiceArtists.length,
        totalPages: 1,
        hasPrevPage: false,
        hasNextPage: false
      }
    } satisfies PaginatedResult<VoiceArtist>;
  },

  async activateVoiceArtist(id: string) {
    const response = await api.put<{ voiceArtist: VoiceArtist }>(feAdminRoutes.activateVoiceArtist(id));
    return response.data.voiceArtist;
  },

  async deactivateVoiceArtist(id: string) {
    const response = await api.put<{ voiceArtist: VoiceArtist }>(feAdminRoutes.deactivateVoiceArtist(id));
    return response.data.voiceArtist;
  },

  async deleteVoiceArtist(id: string) {
    await api.delete(feAdminRoutes.deleteVoiceArtist(id));
  }
};

export const voiceAudioService = {
  async listSubmissions(filters?: {
    status?: "pending" | "accepted" | "rejected";
    language?: Language;
    voiceArtistUserId?: string;
  }) {
    const response = await api.get<{ submissions: VoiceAudioSubmission[] }>(
      feAdminRoutes.voiceAudioSubmissions(),
      { params: filters }
    );
    return response.data.submissions;
  },

  async listSubmissionsPage(filters?: {
    status?: "pending" | "accepted" | "rejected";
    language?: Language;
    voiceArtistUserId?: string;
    q?: string;
    page?: number;
    limit?: number;
  }) {
    const response = await api.get<{ submissions: VoiceAudioSubmission[]; total: number; pagination?: PaginationMeta }>(
      feAdminRoutes.voiceAudioSubmissions(),
      { params: filters }
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
      feAdminRoutes.acceptVoiceAudioSubmission(id)
    );
    return response.data.submission;
  },

  async rejectSubmission(id: string, reason: string) {
    const response = await api.put<{ submission: VoiceAudioSubmission }>(
      feAdminRoutes.rejectVoiceAudioSubmission(id),
      { reason }
    );
    return response.data.submission;
  }
};
