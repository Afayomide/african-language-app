import api from "@/lib/api";
import { feTutorAiRoutes } from "@/lib/apiRoutes";
import { Expression, Lesson, Proverb, Sentence, Word } from "@/types";

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
  async suggestLesson(topic: string, language: string, level: "beginner" | "intermediate" | "advanced") {
    const response = await api.post<{ suggestion: Partial<Lesson> }>(feTutorAiRoutes.suggestLesson(), {
      topic,
      language,
      level
    });
    return response.data.suggestion;
  },

  async generateExpressions(
    lessonId: string | undefined,
    level: "beginner" | "intermediate" | "advanced",
    seedWords?: string[],
    extraInstructions?: string
  ) {
    const response = await api.post<{ expressions: Expression[] }>(feTutorAiRoutes.generateExpressions(), {
      lessonId,
      level,
      seedWords,
      extraInstructions
    });
    return response.data.expressions;
  },

  async generateWords(
    lessonId: string | undefined,
    level: "beginner" | "intermediate" | "advanced",
    seedWords?: string[],
    extraInstructions?: string
  ) {
    const response = await api.post<{ words: Word[] }>(feTutorAiRoutes.generateWords(), {
      lessonId,
      level,
      seedWords,
      extraInstructions
    });
    return response.data.words;
  },

  async generateSentences(
    lessonId: string | undefined,
    level: "beginner" | "intermediate" | "advanced",
    seedWords?: string[],
    extraInstructions?: string
  ) {
    const response = await api.post<{ sentences: Sentence[] }>(feTutorAiRoutes.generateSentences(), {
      lessonId,
      level,
      seedWords,
      extraInstructions
    });
    return response.data.sentences;
  },

  async enhanceExpression(id: string) {
    const response = await api.post<{ expression: Expression }>(feTutorAiRoutes.enhanceExpression(id), {});
    return response.data.expression;
  },

  async generateProverbs(lessonId: string, count?: number, extraInstructions?: string) {
    const response = await api.post<{ proverbs: Proverb[] }>(
      feTutorAiRoutes.generateProverbs(),
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
    const response = await api.post<UnitContentResult>(feTutorAiRoutes.generateUnitContent(unitId), requestPayload);
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
      feTutorAiRoutes.previewUnitContentPlan(unitId),
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
      feTutorAiRoutes.applyUnitContentPlan(unitId),
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
    const response = await api.post<UnitRevisionResult>(feTutorAiRoutes.reviseUnitContent(unitId), requestPayload);
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
      feTutorAiRoutes.refactorLessonContent(lessonId),
      payload || {}
    );
    return response.data;
  }
};
