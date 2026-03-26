import api from "@/lib/api";
import { feTutorAiRoutes, feTutorRoutes } from "@/lib/apiRoutes";
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
  async listLessons(status?: Status) {
    return fetchAllPages<Lesson>(feTutorRoutes.lessons(), "lessons", { status });
  },

  async listLessonsPage(params?: { status?: Status; unitId?: string; q?: string; page?: number; limit?: number }) {
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

  async auditLesson(id: string) {
    const response = await api.get<{ audit: LessonAuditResult }>(feTutorRoutes.auditLesson(id));
    return response.data.audit;
  },

  async requestLessonAudio(id: string) {
    const response = await api.put<{ lesson: Lesson }>(feTutorRoutes.requestLessonAudio(id));
    return response.data.lesson;
  },

  async createLesson(data: {
    title: string;
    unitId: string;
    description?: string;
    topics?: string[];
    proverbs?: Array<{ text: string; translation: string; contextNote: string }>;
  }) {
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

  async bulkDeleteLessons(ids: string[]) {
    const response = await api.delete<{ deletedIds: string[] }>(feTutorRoutes.bulkDeleteLessons(), {
      data: { ids }
    });
    return {
      ...response.data,
      deletedCount: response.data.deletedIds.length
    };
  },

  async reorderLessons(unitId: string, lessonIds: string[]) {
    const response = await api.put<{ lessons: Lesson[] }>(feTutorRoutes.reorderLessons(), {
      unitId,
      lessonIds
    });
    return response.data.lessons;
  },

  async finishLesson(id: string) {
    const response = await api.put<{ lesson: Lesson }>(feTutorRoutes.finishLesson(id));
    return response.data.lesson;
  }
};

export const unitService = {
  async listUnits(statusOrFilters?: Status | { status?: Status; chapterId?: string; kind?: Unit["kind"] }) {
    const params =
      typeof statusOrFilters === "object" && statusOrFilters !== null
        ? statusOrFilters
        : { status: statusOrFilters };
    const response = await api.get<{ units: Unit[] }>(feTutorRoutes.units(), {
      params
    });
    return response.data.units || [];
  },

  async getUnit(id: string) {
    const response = await api.get<{ unit: Unit }>(feTutorRoutes.unit(id));
    return response.data.unit;
  },

  async getDeletedEntries(id: string) {
    const response = await api.get<{ lessons: Lesson[]; expressions: Expression[] }>(feTutorRoutes.unitDeletedEntries(id));
    return response.data;
  },

  async createUnit(data: {
    title: string;
    description?: string;
    level: Level;
    chapterId?: string | null;
    kind?: Unit["kind"];
    reviewStyle?: Unit["reviewStyle"];
    reviewSourceUnitIds?: string[];
  }) {
    const response = await api.post<{ unit: Unit }>(feTutorRoutes.units(), data);
    return response.data.unit;
  },

  async updateUnit(id: string, data: Partial<Unit>) {
    const response = await api.put<{ unit: Unit }>(feTutorRoutes.unit(id), data);
    return response.data.unit;
  },

  async deleteUnit(id: string) {
    await api.delete(feTutorRoutes.unit(id));
  },

  async restoreDeletedLesson(unitId: string, lessonId: string) {
    const response = await api.post<{ lesson: Lesson }>(feTutorRoutes.restoreDeletedUnitLesson(unitId, lessonId));
    return response.data.lesson;
  },

  async restoreDeletedExpression(unitId: string, expressionId: string) {
    const response = await api.post<{ expression: Expression }>(feTutorRoutes.restoreDeletedUnitExpression(unitId, expressionId));
    return response.data.expression;
  },

  async finishUnit(id: string) {
    const response = await api.put<{ unit: Unit }>(feTutorRoutes.finishUnit(id));
    return response.data.unit;
  },

  async reorderUnits(unitIds: string[]) {
    const response = await api.put<{ units: Unit[] }>(feTutorRoutes.reorderUnits(), {
      unitIds
    });
    return response.data.units || [];
  },

  async generateBulkUnits(data: {
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
    }>(feTutorAiRoutes.generateBulkUnits(), data);
    return response.data;
  }
};

export const chapterService = {
  async listChapters(status?: Status) {
    const response = await api.get<{ chapters: Chapter[] }>(feTutorRoutes.chapters(), {
      params: { status }
    });
    return response.data.chapters || [];
  },

  async getChapter(id: string) {
    const response = await api.get<{ chapter: Chapter }>(feTutorRoutes.chapter(id));
    return response.data.chapter;
  },

  async createChapter(data: { title: string; description?: string; level: Level }) {
    const response = await api.post<{ chapter: Chapter }>(feTutorRoutes.chapters(), data);
    return response.data.chapter;
  },

  async updateChapter(id: string, data: Partial<Chapter>) {
    const response = await api.put<{ chapter: Chapter }>(feTutorRoutes.chapter(id), data);
    return response.data.chapter;
  },

  async finishChapter(id: string) {
    const response = await api.put<{ chapter: Chapter }>(feTutorRoutes.finishChapter(id));
    return response.data.chapter;
  },

  async deleteChapter(id: string) {
    await api.delete(feTutorRoutes.chapter(id));
  },

  async reorderChapters(chapterIds: string[]) {
    const response = await api.put<{ chapters: Chapter[] }>(feTutorRoutes.reorderChapters(), {
      chapterIds
    });
    return response.data.chapters || [];
  },

  async generateBulkChapters(data: {
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
    }>(feTutorAiRoutes.generateBulkChapters(), data);
    return response.data;
  }
};

export const expressionService = {
  async listExpressions(lessonId?: string, status?: Status) {
    return fetchAllPages<Expression>(feTutorRoutes.expressions(), "expressions", { lessonId, status });
  },

  async listExpressionsPage(params?: { lessonId?: string; status?: Status; q?: string; page?: number; limit?: number }) {
    const response = await api.get<{ expressions: Expression[]; total: number; pagination?: PaginationMeta }>(
      feTutorRoutes.expressions(),
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
    const response = await api.get<{ expression: Expression }>(feTutorRoutes.expression(id));
    return response.data.expression;
  },

  async listExpressionImages(id: string) {
    const response = await api.get<{ expressionId: string; images: ExpressionImageLink[] }>(feTutorRoutes.expressionImages(id));
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
    const response = await api.post<{ images: ExpressionImageLink[] }>(feTutorRoutes.expressionImages(id), data);
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
    const response = await api.put<{ images: ExpressionImageLink[] }>(feTutorRoutes.expressionImageLink(id, linkId), data);
    return response.data.images;
  },

  async deleteExpressionImageLink(id: string, linkId: string) {
    const response = await api.delete<{ images: ExpressionImageLink[] }>(feTutorRoutes.expressionImageLink(id, linkId));
    return response.data.images;
  },

  async createExpression(data: Partial<Expression> & { audioUpload?: AudioUploadPayload }) {
    const response = await api.post<{ expression: Expression }>(feTutorRoutes.expressions(), data);
    return response.data.expression;
  },

  async updateExpression(id: string, data: Partial<Expression> & { audioUpload?: AudioUploadPayload }) {
    const response = await api.put<{ expression: Expression }>(feTutorRoutes.expression(id), data);
    return response.data.expression;
  },

  async deleteExpression(id: string) {
    await api.delete(feTutorRoutes.expression(id));
  },

  async bulkDeleteExpressions(ids: string[]) {
    const response = await api.delete<{ deletedIds: string[] }>(feTutorRoutes.bulkDeleteExpressions(), {
      data: { ids }
    });
    return {
      ...response.data,
      deletedCount: response.data.deletedIds.length
    };
  },

  async generateExpressionAudio(id: string) {
    const response = await api.put<{ expression: Expression }>(feTutorRoutes.generateExpressionAudio(id));
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
    }>(feTutorRoutes.bulkExpressionAudio(lessonId));
    return response.data;
  },

  async finishExpression(id: string) {
    const response = await api.put<{ expression: Expression }>(feTutorRoutes.finishExpression(id));
    return response.data.expression;
  },
};

export const wordService = {
  async listWords(lessonId?: string, status?: Status) {
    return fetchAllPages<Word>(feTutorRoutes.words(), "words", { lessonId, status });
  },

  async listWordsPage(params?: { lessonId?: string; status?: Status; q?: string; page?: number; limit?: number }) {
    const response = await api.get<{ words: Word[]; total: number; pagination?: PaginationMeta }>(
      feTutorRoutes.words(),
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
    const response = await api.get<{ word: Word }>(feTutorRoutes.word(id));
    return response.data.word;
  },

  async createWord(data: Partial<Word> & { audioUpload?: AudioUploadPayload }) {
    const response = await api.post<{ word: Word }>(feTutorRoutes.words(), data);
    return response.data.word;
  },

  async updateWord(id: string, data: Partial<Word> & { audioUpload?: AudioUploadPayload }) {
    const response = await api.put<{ word: Word }>(feTutorRoutes.word(id), data);
    return response.data.word;
  },

  async deleteWord(id: string) {
    await api.delete(feTutorRoutes.word(id));
  },

  async bulkDeleteWords(ids: string[]) {
    const response = await api.delete<{ deletedIds: string[] }>(feTutorRoutes.bulkDeleteWords(), {
      data: { ids }
    });
    return {
      ...response.data,
      deletedCount: response.data.deletedIds.length
    };
  },

  async finishWord(id: string) {
    const response = await api.put<{ word: Word }>(feTutorRoutes.finishWord(id));
    return response.data.word;
  },

  async generateWordAudio(id: string) {
    const response = await api.put<{ word: Word }>(feTutorRoutes.generateWordAudio(id));
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
    }>(feTutorRoutes.bulkWordAudio(lessonId));
    return response.data;
  }
};

export const sentenceService = {
  async listSentences(lessonId?: string, status?: Status) {
    return fetchAllPages<Sentence>(feTutorRoutes.sentences(), "sentences", { lessonId, status });
  },

  async listSentencesPage(params?: { lessonId?: string; status?: Status; q?: string; page?: number; limit?: number }) {
    const response = await api.get<{ sentences: Sentence[]; total: number; pagination?: PaginationMeta }>(
      feTutorRoutes.sentences(),
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
    const response = await api.get<{ sentence: Sentence }>(feTutorRoutes.sentence(id));
    return response.data.sentence;
  },

  async createSentence(
    data: Partial<Sentence> & {
      components: SentenceComponentRef[];
      audioUpload?: AudioUploadPayload;
    }
  ) {
    const response = await api.post<{ sentence: Sentence }>(feTutorRoutes.sentences(), data);
    return response.data.sentence;
  },

  async updateSentence(
    id: string,
    data: Partial<Sentence> & {
      components?: SentenceComponentRef[];
      audioUpload?: AudioUploadPayload;
    }
  ) {
    const response = await api.put<{ sentence: Sentence }>(feTutorRoutes.sentence(id), data);
    return response.data.sentence;
  },

  async deleteSentence(id: string) {
    await api.delete(feTutorRoutes.sentence(id));
  },

  async bulkDeleteSentences(ids: string[]) {
    const response = await api.delete<{ deletedIds: string[] }>(feTutorRoutes.bulkDeleteSentences(), {
      data: { ids }
    });
    return {
      ...response.data,
      deletedCount: response.data.deletedIds.length
    };
  },

  async finishSentence(id: string) {
    const response = await api.put<{ sentence: Sentence }>(feTutorRoutes.finishSentence(id));
    return response.data.sentence;
  },

  async generateSentenceAudio(id: string) {
    const response = await api.put<{ sentence: Sentence }>(feTutorRoutes.generateSentenceAudio(id));
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
    }>(feTutorRoutes.bulkSentenceAudio(lessonId));
    return response.data;
  }
};



export const imageService = {
  async listImagesPage(params?: { status?: "draft" | "approved"; q?: string; page?: number; limit?: number }) {
    const response = await api.get<{ images: ImageAsset[]; total: number; pagination?: PaginationMeta }>(
      feTutorRoutes.images(),
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
    imageUpload?: { base64: string; mimeType?: string; fileName?: string };
  }) {
    const response = await api.post<{ image: ImageAsset }>(feTutorRoutes.images(), data);
    return response.data.image;
  },

  async updateImage(id: string, data: Partial<ImageAsset> & {
    imageUpload?: { base64: string; mimeType?: string; fileName?: string };
  }) {
    const response = await api.put<{ image: ImageAsset }>(feTutorRoutes.image(id), data);
    return response.data.image;
  },

  async deleteImage(id: string) {
    await api.delete(feTutorRoutes.image(id));
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
      meaningSegments?: Array<{
        text: string;
        sourceWordIndexes: number[];
        sourceComponentIndexes?: number[];
      }>;
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
    contentType?: "word" | "expression" | "sentence";
    contentId?: string;
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
