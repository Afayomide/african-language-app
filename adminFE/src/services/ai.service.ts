import api from "@/lib/api";
import { feAdminRoutes, feAiRoutes } from "@/lib/apiRoutes";
import { Lesson, Expression, Proverb, Language, Level, Sentence, Word } from "@/types";

type UnitContentLessonSummary = {
  lessonId: string;
  title: string;
  contentGenerated: number;
  sentencesGenerated: number;
  existingContentLinked: number;
  newContentSelected: number;
  reviewContentSelected: number;
  contentDroppedFromCandidates: number;
  proverbsGenerated: number;
  questionsGenerated: number;
  blocksGenerated: number;
};

export type UnitPlanLesson = {
  title: string;
  description?: string;
  objectives: string[];
  conversationGoal: string;
  situations: string[];
  sentenceGoals: string[];
  focusSummary?: string;
};

export type UnitPlanSequenceLesson = UnitPlanLesson & {
  lessonMode: "core" | "review";
  sourceCoreLessonIndexes?: number[];
};

type UnitContentResult = {
  unitId: string;
  requestedLessons: number;
  createdLessons: number;
  skippedLessons: Array<{ reason: string; topic?: string; title?: string }>;
  lessonGenerationErrors: Array<{ topic?: string; error: string }>;
  contentErrors: Array<{ lessonId?: string; title?: string; error: string }>;
  lessons: UnitContentLessonSummary[];
};

type UnitRevisionResult = UnitContentResult & {
  updatedLessons: number;
  clearedLessons: number;
  revisionMode: "refactor" | "regenerate";
};

export type UnitContentPlanPreviewResult = {
  unitId: string;
  requestedLessons: number;
  actualLessonCount: number;
  coreLessons: UnitPlanLesson[];
  lessonSequence: UnitPlanSequenceLesson[];
};

type LessonRefactorResult = {
  unitId: string;
  lessonId: string;
  updatedLesson: boolean;
  lesson: UnitContentLessonSummary;
  patch: {
    lessonId: string;
    lessonTitle?: string;
    rationale?: string;
    operations: Array<{ type: string }>;
  } | null;
};

export const aiService = {
  async generateExpressions(
    lessonId: string | undefined,
    language: Language,
    level: Level,
    seedWords?: string[],
    extraInstructions?: string
  ) {
    const response = await api.post<{ expressions: Expression[] }>(
      feAiRoutes.generateExpressions(),
      { lessonId, language, level, seedWords, extraInstructions }
    );
    return response.data.expressions;
  },

  async generateWords(
    lessonId: string | undefined,
    language: Language,
    level: Level,
    seedWords?: string[],
    extraInstructions?: string
  ) {
    const response = await api.post<{ words: Word[] }>(
      feAiRoutes.generateWords(),
      { lessonId, language, level, seedWords, extraInstructions }
    );
    return response.data.words;
  },

  async generateSentences(
    lessonId: string | undefined,
    language: Language,
    level: Level,
    seedWords?: string[],
    extraInstructions?: string
  ) {
    const response = await api.post<{ sentences: Sentence[] }>(
      feAiRoutes.generateSentences(),
      { lessonId, language, level, seedWords, extraInstructions }
    );
    return response.data.sentences;
  },

  async enhanceExpression(id: string, language: Language, level: Level) {
    const response = await api.post<{ expression: Expression }>(
      feAiRoutes.enhanceExpression(id),
      { language, level }
    );
    return response.data.expression;
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
  },

  async generateUnitContent(
    unitId: string,
    payload?: {
      lessonCount?: number;
      newTargetsPerLesson?: number;
      sentencesPerLesson?: number;
      reviewContentPerLesson?: number;
      expressionsPerLesson?: number;
      reviewExpressionsPerLesson?: number;
      proverbsPerLesson?: number;
      topics?: string[];
      extraInstructions?: string;
    }
  ) {
    const requestPayload = payload
      ? (() => {
          const {
            newTargetsPerLesson,
            expressionsPerLesson,
            reviewExpressionsPerLesson,
            ...rest
          } = payload;
          return {
            ...rest,
            sentencesPerLesson:
              newTargetsPerLesson ?? payload.sentencesPerLesson ?? expressionsPerLesson,
            reviewContentPerLesson: payload.reviewContentPerLesson ?? reviewExpressionsPerLesson,
          };
        })()
      : {};
    const response = await api.post<UnitContentResult>(feAdminRoutes.generateUnitContent(unitId), requestPayload);
    return response.data;
  },

  async previewUnitContentPlan(
    unitId: string,
    payload?: {
      lessonCount?: number;
      newTargetsPerLesson?: number;
      sentencesPerLesson?: number;
      reviewContentPerLesson?: number;
      expressionsPerLesson?: number;
      reviewExpressionsPerLesson?: number;
      proverbsPerLesson?: number;
      topics?: string[];
      extraInstructions?: string;
    }
  ) {
    const requestPayload = payload
      ? (() => {
          const {
            newTargetsPerLesson,
            expressionsPerLesson,
            reviewExpressionsPerLesson,
            ...rest
          } = payload;
          return {
            ...rest,
            sentencesPerLesson:
              newTargetsPerLesson ?? payload.sentencesPerLesson ?? expressionsPerLesson,
            reviewContentPerLesson: payload.reviewContentPerLesson ?? reviewExpressionsPerLesson,
          };
        })()
      : {};
    const response = await api.post<UnitContentPlanPreviewResult>(
      feAdminRoutes.previewUnitContentPlan(unitId),
      requestPayload
    );
    return response.data;
  },

  async applyUnitContentPlan(
    unitId: string,
    payload: {
      lessonCount?: number;
      newTargetsPerLesson?: number;
      sentencesPerLesson?: number;
      reviewContentPerLesson?: number;
      expressionsPerLesson?: number;
      reviewExpressionsPerLesson?: number;
      proverbsPerLesson?: number;
      topics?: string[];
      extraInstructions?: string;
      planLessons: UnitPlanLesson[];
    }
  ) {
    const {
      newTargetsPerLesson,
      expressionsPerLesson,
      reviewExpressionsPerLesson,
      ...rest
    } = payload;
    const requestPayload = {
      ...rest,
      sentencesPerLesson:
        newTargetsPerLesson ?? payload.sentencesPerLesson ?? expressionsPerLesson,
      reviewContentPerLesson: payload.reviewContentPerLesson ?? reviewExpressionsPerLesson,
    };
    const response = await api.post<UnitContentResult>(
      feAdminRoutes.applyUnitContentPlan(unitId),
      requestPayload
    );
    return response.data;
  },

  async reviseUnitContent(
    unitId: string,
    payload: {
      mode: "refactor" | "regenerate";
      lessonCount?: number;
      newTargetsPerLesson?: number;
      sentencesPerLesson?: number;
      reviewContentPerLesson?: number;
      expressionsPerLesson?: number;
      reviewExpressionsPerLesson?: number;
      proverbsPerLesson?: number;
      topics?: string[];
      extraInstructions?: string;
    }
  ) {
    const {
      newTargetsPerLesson,
      expressionsPerLesson,
      reviewExpressionsPerLesson,
      ...rest
    } = payload;
    const requestPayload = {
      ...rest,
      sentencesPerLesson:
        newTargetsPerLesson ?? payload.sentencesPerLesson ?? expressionsPerLesson,
      reviewContentPerLesson: payload.reviewContentPerLesson ?? reviewExpressionsPerLesson,
    };
    const response = await api.post<UnitRevisionResult>(feAdminRoutes.reviseUnitContent(unitId), requestPayload);
    return response.data;
  },

  async refactorLessonContent(
    lessonId: string,
    payload?: {
      topic?: string;
      extraInstructions?: string;
    }
  ) {
    const response = await api.post<LessonRefactorResult>(
      feAdminRoutes.refactorLessonContent(lessonId),
      payload || {}
    );
    return response.data;
  }
};
