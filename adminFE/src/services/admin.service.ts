import api from "@/lib/api";
import { feAdminRoutes } from "@/lib/apiRoutes";
import {
  Chapter,
  Lesson,
  Unit,
  Expression,
  Word,
  Sentence,
  Proverb,
  Language,
  Level,
  Status,
  ExerciseQuestion,
  QuestionType,
  ImageAsset,
  ExpressionImageLink,
  SentenceComponentRef,
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
  key: "lessons" | "expressions" | "words" | "sentences" | "proverbs" | "questions",
  params?: Record<string, unknown>
) {
  const all: T[] = [];
  let page = 1;

  while (true) {
    const response = await api.get<{
      lessons?: T[];
      expressions?: T[];
      words?: T[];
      sentences?: T[];
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

  async requestLessonAudio(id: string) {
    const response = await api.put<{ lesson: Lesson }>(feAdminRoutes.requestLessonAudio(id));
    return response.data.lesson;
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
  async listUnits(
    statusOrFilters?: Status | { status?: Status; language?: Language; chapterId?: string; kind?: Unit["kind"] },
    language?: Language
  ) {
    const params =
      typeof statusOrFilters === "object" && statusOrFilters !== null
        ? statusOrFilters
        : { status: statusOrFilters, language };
    const response = await api.get<{ units: Unit[] }>(feAdminRoutes.units(), {
      params
    });
    return response.data.units || [];
  },

  async getUnit(id: string) {
    const response = await api.get<{ unit: Unit }>(feAdminRoutes.unit(id));
    return response.data.unit;
  },

  async getDeletedEntries(id: string) {
    const response = await api.get<{ lessons: Lesson[]; expressions: Expression[] }>(feAdminRoutes.unitDeletedEntries(id));
    return response.data;
  },

  async createUnit(data: {
    title: string;
    description?: string;
    language: Language;
    level: Level;
    chapterId?: string | null;
    kind?: Unit["kind"];
    reviewStyle?: Unit["reviewStyle"];
    reviewSourceUnitIds?: string[];
  }) {
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

  async restoreDeletedExpression(unitId: string, expressionId: string) {
    const response = await api.post<{ expression: Expression }>(feAdminRoutes.restoreDeletedUnitExpression(unitId, expressionId));
    return response.data.expression;
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
    chapterId?: string;
    count?: number;
    topic?: string;
  }) {
    const response = await api.post<{
      totalRequested: number;
      createdCount: number;
      coreCreatedCount?: number;
      reviewCreatedCount?: number;
      skippedCount: number;
      errorCount: number;
      units: Unit[];
      skipped: Array<{ reason: string; title?: string }>;
      errors: Array<{ index: number; error: string }>;
    }>(feAdminRoutes.generateBulkUnits(), data);
    return response.data;
  }
};

export const chapterService = {
  async listChapters(status?: Status, language?: Language) {
    const response = await api.get<{ chapters: Chapter[] }>(feAdminRoutes.chapters(), {
      params: { status, language }
    });
    return response.data.chapters || [];
  },

  async getChapter(id: string) {
    const response = await api.get<{ chapter: Chapter }>(feAdminRoutes.chapter(id));
    return response.data.chapter;
  },

  async createChapter(data: { title: string; description?: string; language: Language; level: Level }) {
    const response = await api.post<{ chapter: Chapter }>(feAdminRoutes.chapters(), data);
    return response.data.chapter;
  },

  async updateChapter(id: string, data: Partial<Chapter>) {
    const response = await api.put<{ chapter: Chapter }>(feAdminRoutes.chapter(id), data);
    return response.data.chapter;
  },

  async finishChapter(id: string) {
    const response = await api.put<{ chapter: Chapter }>(feAdminRoutes.finishChapter(id));
    return response.data.chapter;
  },

  async publishChapter(id: string) {
    const response = await api.put<{ chapter: Chapter }>(feAdminRoutes.publishChapter(id));
    return response.data.chapter;
  },

  async deleteChapter(id: string) {
    await api.delete(feAdminRoutes.chapter(id));
  },

  async reorderChapters(chapterIds: string[]) {
    const response = await api.put<{ chapters: Chapter[] }>(feAdminRoutes.reorderChapters(), {
      chapterIds
    });
    return response.data.chapters || [];
  },

  async generateBulkChapters(data: {
    language: Language;
    level: Level;
    count?: number;
    topic?: string;
    extraInstructions?: string;
  }) {
    const response = await api.post<{
      totalRequested: number;
      createdCount: number;
      skippedCount: number;
      errorCount: number;
      chapters: Chapter[];
      skipped: { reason: string; title?: string }[];
      errors: { index?: number; error: string }[];
    }>(feAdminRoutes.generateBulkChapters(), data);
    return response.data;
  }
};

export const expressionService = {
  async listExpressions(lessonId?: string, status?: Status, language?: Language) {
    return fetchAllPages<Expression>(feAdminRoutes.expressions(), "expressions", { lessonId, status, language });
  },

  async listExpressionsPage(params?: {
    lessonId?: string;
    status?: Status;
    language?: Language;
    q?: string;
    page?: number;
    limit?: number;
  }) {
    const response = await api.get<{ expressions: Expression[]; total: number; pagination?: PaginationMeta }>(
      feAdminRoutes.expressions(),
      { params }
    );
    return {
      items: response.data.expressions,
      total: response.data.total ?? response.data.expressions.length,
      pagination: response.data.pagination ?? {
        page: 1,
        limit: response.data.expressions.length || 20,
        total: response.data.expressions.length,
        totalPages: 1,
        hasPrevPage: false,
        hasNextPage: false
      }
    } satisfies PaginatedResult<Expression>;
  },

  async getExpression(id: string) {
    const response = await api.get<{ expression: Expression }>(feAdminRoutes.expression(id));
    return response.data.expression;
  },

  async listExpressionImages(id: string) {
    const response = await api.get<{ expressionId: string; images: ExpressionImageLink[] }>(feAdminRoutes.expressionImages(id));
    return response.data.images;
  },

  async listPhraseImages(id: string) {
    return this.listExpressionImages(id);
  },

  async linkExpressionImage(
    id: string,
    data: {
      imageAssetId: string;
      translationIndex?: number | null;
      isPrimary?: boolean;
      notes?: string;
    }
  ) {
    const response = await api.post<{ images: ExpressionImageLink[] }>(feAdminRoutes.expressionImages(id), data);
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
    return this.linkExpressionImage(id, data);
  },

  async updateExpressionImageLink(
    id: string,
    linkId: string,
    data: {
      imageAssetId?: string;
      translationIndex?: number | null;
      isPrimary?: boolean;
      notes?: string;
    }
  ) {
    const response = await api.put<{ images: ExpressionImageLink[] }>(feAdminRoutes.expressionImageLink(id, linkId), data);
    return response.data.images;
  },

  async deleteExpressionImageLink(id: string, linkId: string) {
    const response = await api.delete<{ images: ExpressionImageLink[] }>(feAdminRoutes.expressionImageLink(id, linkId));
    return response.data.images;
  },

  async createExpression(data: Partial<Expression> & { audioUpload?: AudioUploadPayload }) {
    const response = await api.post<{ expression: Expression }>(feAdminRoutes.expressions(), data);
    return response.data.expression;
  },

  async updateExpression(id: string, data: Partial<Expression> & { audioUpload?: AudioUploadPayload }) {
    const response = await api.put<{ expression: Expression }>(feAdminRoutes.expression(id), data);
    return response.data.expression;
  },

  async deleteExpression(id: string) {
    await api.delete(feAdminRoutes.expression(id));
  },

  async bulkDeleteExpressions(ids: string[]) {
    const response = await api.delete<{ deletedIds: string[] }>(feAdminRoutes.bulkDeleteExpressions(), {
      data: { ids }
    });
    return {
      ...response.data,
      deletedCount: response.data.deletedIds.length
    };
  },

  async publishExpression(id: string) {
    const response = await api.put<{ expression: Expression }>(feAdminRoutes.publishExpression(id));
    return response.data.expression;
  },

  async generateExpressionAudio(id: string) {
    const response = await api.put<{ expression: Expression }>(feAdminRoutes.generateExpressionAudio(id));
    return response.data.expression;
  },

  async generateLessonExpressionAudio(lessonId: string) {
    const response = await api.put<{
      lessonId: string;
      total: number;
      updatedCount: number;
      failedCount: number;
      updatedIds: string[];
      failedIds: string[];
    }>(feAdminRoutes.bulkExpressionAudio(lessonId));
    return response.data;
  },
};

export const wordService = {
  async listWords(lessonId?: string, status?: Status, language?: Language) {
    return fetchAllPages<Word>(feAdminRoutes.words(), "words", { lessonId, status, language });
  },

  async listWordsPage(params?: {
    lessonId?: string;
    status?: Status;
    language?: Language;
    q?: string;
    page?: number;
    limit?: number;
  }) {
    const response = await api.get<{ words: Word[]; total: number; pagination?: PaginationMeta }>(
      feAdminRoutes.words(),
      { params }
    );
    return {
      items: response.data.words,
      total: response.data.total ?? response.data.words.length,
      pagination: response.data.pagination ?? {
        page: 1,
        limit: response.data.words.length || 20,
        total: response.data.words.length,
        totalPages: 1,
        hasPrevPage: false,
        hasNextPage: false
      }
    } satisfies PaginatedResult<Word>;
  },

  async getWord(id: string) {
    const response = await api.get<{ word: Word }>(feAdminRoutes.word(id));
    return response.data.word;
  },

  async createWord(data: Partial<Word> & { audioUpload?: AudioUploadPayload }) {
    const response = await api.post<{ word: Word }>(feAdminRoutes.words(), data);
    return response.data.word;
  },

  async updateWord(id: string, data: Partial<Word> & { audioUpload?: AudioUploadPayload }) {
    const response = await api.put<{ word: Word }>(feAdminRoutes.word(id), data);
    return response.data.word;
  },

  async deleteWord(id: string) {
    await api.delete(feAdminRoutes.word(id));
  },

  async bulkDeleteWords(ids: string[]) {
    const response = await api.delete<{ deletedIds: string[] }>(feAdminRoutes.bulkDeleteWords(), {
      data: { ids }
    });
    return {
      ...response.data,
      deletedCount: response.data.deletedIds.length
    };
  },

  async publishWord(id: string) {
    const response = await api.put<{ word: Word }>(feAdminRoutes.publishWord(id));
    return response.data.word;
  },

  async generateWordAudio(id: string) {
    const response = await api.put<{ word: Word }>(feAdminRoutes.generateWordAudio(id));
    return response.data.word;
  },

  async generateLessonWordAudio(lessonId: string) {
    const response = await api.put<{
      lessonId: string;
      total: number;
      updatedCount: number;
      failedCount: number;
      updatedIds: string[];
      failedIds: string[];
    }>(feAdminRoutes.bulkWordAudio(lessonId));
    return response.data;
  }
};

export const sentenceService = {
  async listSentences(lessonId?: string, status?: Status, language?: Language) {
    return fetchAllPages<Sentence>(feAdminRoutes.sentences(), "sentences", { lessonId, status, language });
  },

  async listSentencesPage(params?: {
    lessonId?: string;
    status?: Status;
    language?: Language;
    q?: string;
    page?: number;
    limit?: number;
  }) {
    const response = await api.get<{ sentences: Sentence[]; total: number; pagination?: PaginationMeta }>(
      feAdminRoutes.sentences(),
      { params }
    );
    return {
      items: response.data.sentences,
      total: response.data.total ?? response.data.sentences.length,
      pagination: response.data.pagination ?? {
        page: 1,
        limit: response.data.sentences.length || 20,
        total: response.data.sentences.length,
        totalPages: 1,
        hasPrevPage: false,
        hasNextPage: false
      }
    } satisfies PaginatedResult<Sentence>;
  },

  async getSentence(id: string) {
    const response = await api.get<{ sentence: Sentence }>(feAdminRoutes.sentence(id));
    return response.data.sentence;
  },

  async createSentence(
    data: Partial<Sentence> & {
      components: SentenceComponentRef[];
      audioUpload?: AudioUploadPayload;
    }
  ) {
    const response = await api.post<{ sentence: Sentence }>(feAdminRoutes.sentences(), data);
    return response.data.sentence;
  },

  async updateSentence(
    id: string,
    data: Partial<Sentence> & {
      components?: SentenceComponentRef[];
      audioUpload?: AudioUploadPayload;
    }
  ) {
    const response = await api.put<{ sentence: Sentence }>(feAdminRoutes.sentence(id), data);
    return response.data.sentence;
  },

  async deleteSentence(id: string) {
    await api.delete(feAdminRoutes.sentence(id));
  },

  async bulkDeleteSentences(ids: string[]) {
    const response = await api.delete<{ deletedIds: string[] }>(feAdminRoutes.bulkDeleteSentences(), {
      data: { ids }
    });
    return {
      ...response.data,
      deletedCount: response.data.deletedIds.length
    };
  },

  async publishSentence(id: string) {
    const response = await api.put<{ sentence: Sentence }>(feAdminRoutes.publishSentence(id));
    return response.data.sentence;
  },

  async generateSentenceAudio(id: string) {
    const response = await api.put<{ sentence: Sentence }>(feAdminRoutes.generateSentenceAudio(id));
    return response.data.sentence;
  },

  async generateLessonSentenceAudio(lessonId: string) {
    const response = await api.put<{
      lessonId: string;
      total: number;
      updatedCount: number;
      failedCount: number;
      updatedIds: string[];
      failedIds: string[];
    }>(feAdminRoutes.bulkSentenceAudio(lessonId));
    return response.data;
  }
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
    sourceId?: string;
    relatedSourceRefs?: Array<{ type: "word" | "expression" | "sentence"; id: string }>;
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
        contentId?: string;
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
    contentType?: "word" | "expression" | "sentence";
    contentId?: string;
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
    contentType?: "word" | "expression" | "sentence";
    contentId?: string;
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
