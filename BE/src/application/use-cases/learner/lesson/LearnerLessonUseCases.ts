import mongoose from "mongoose";
import type { LessonEntity } from "../../../../domain/entities/Lesson.js";
import type { ContentType } from "../../../../domain/entities/Content.js";
import type { QuestionEntity } from "../../../../domain/entities/Question.js";
import type { ExpressionRepository } from "../../../../domain/repositories/ExpressionRepository.js";
import type { LessonRepository } from "../../../../domain/repositories/LessonRepository.js";
import type { ProverbRepository } from "../../../../domain/repositories/ProverbRepository.js";
import type { QuestionRepository } from "../../../../domain/repositories/QuestionRepository.js";
import type { SentenceRepository } from "../../../../domain/repositories/SentenceRepository.js";
import type { LearnerProfileRepository } from "../../../../domain/repositories/LearnerProfileRepository.js";
import type { UnitRepository } from "../../../../domain/repositories/UnitRepository.js";
import type { WordRepository } from "../../../../domain/repositories/WordRepository.js";
import type { LearnerContentPerformanceEntity } from "../../../../domain/entities/LearnerContentPerformance.js";
import type {
  LessonProgressEntity,
  LessonStageProgressEntity,
  LessonStepProgressEntity
} from "../../../../domain/entities/LessonProgress.js";
import type { LessonProgressRepository } from "../../../../domain/repositories/LessonProgressRepository.js";
import type { LearnerContentPerformanceRepository } from "../../../../domain/repositories/LearnerContentPerformanceRepository.js";
import type { LearnerQuestionMissEntity } from "../../../../domain/entities/LearnerQuestionMiss.js";
import type { LearnerQuestionMissRepository } from "../../../../domain/repositories/LearnerQuestionMissRepository.js";
import {
  compareAdaptiveReviewMissedQuestions,
  scoreAdaptiveReviewTarget
} from "../../../services/adaptiveReviewPriority.js";
import { ContentLookupService, type ResolvedContentEntity } from "../../../services/ContentLookupService.js";

export const LESSON_STEPS = [
  { key: "multiple-choice", title: "Multiple Choice", description: "Learn essential words", route: "/study" },
  { key: "practice", title: "Practice", description: "Fill in the blanks", route: "/study" },
  { key: "listening", title: "Listening", description: "Hear native speakers", route: "/study" },
  { key: "fill-in-the-gap", title: "Fill in the Gap", description: "Test your knowledge", route: "/study" }
] as const;

const DEFAULT_XP_PER_QUESTION = 10;

type MatchingDisplayItem = {
  id: string;
  label: string;
  contentId?: string;
  translationIndex?: number;
  image?: {
    imageAssetId?: string;
    url: string;
    thumbnailUrl?: string;
    altText: string;
  } | null;
};

type LessonDisplayContent = {
  id: string;
  kind: "word" | "expression" | "sentence";
  text: string;
  translations: string[];
  pronunciation: string;
  explanation: string;
  examples: Array<{ original: string; translation: string }>;
  difficulty: number;
  audio: {
    provider?: string;
    model?: string;
    voice?: string;
    locale?: string;
    format?: string;
    url?: string;
    s3Key?: string;
  };
  selectedTranslation: string;
  selectedTranslationIndex: number;
  components?: LessonDisplaySentenceComponent[];
};

type LessonDisplaySentenceComponent = {
  id: string;
  kind: "word" | "expression";
  text: string;
  translations: string[];
  pronunciation: string;
  explanation: string;
  selectedTranslation: string;
  selectedTranslationIndex: number;
  audio: {
    provider: string;
    model: string;
    voice: string;
    locale: string;
    format: string;
    url: string;
    s3Key: string;
  };
};

type StageQuestionResultInput = {
  questionId?: string;
  sourceType?: ContentType;
  sourceId?: string;
  questionType?: QuestionEntity["type"];
  questionSubtype?: QuestionEntity["subtype"];
  attempts?: number;
  incorrectAttempts?: number;
  correct?: boolean;
};

type AdaptiveReviewSuggestion =
  | {
      kind: "personalized";
      title: string;
      description: string;
      sourceLessonIds: string[];
      weakItemCount: number;
    }
  | {
      kind: "fallback";
      lesson: {
        id: string;
        title: string;
      };
      reason: "no_struggle_data";
    };

type AdaptiveReviewTarget = {
  item: ResolvedContentEntity;
  score: number;
  metrics: LearnerContentPerformanceEntity;
};

type AdaptiveReviewMissedQuestion = {
  question: QuestionEntity;
  miss: LearnerQuestionMissEntity;
};

type LearnerFlowQuestion = QuestionEntity & {
  prompt: string;
  source: LessonDisplayContent | null;
  interactionData?: Record<string, unknown>;
  status: "published";
};

type LearnerFlowBlock =
  | { type: "text"; content: string }
  | { type: "question"; refId: string; data: LearnerFlowQuestion };

type LearnerPopulatedBlock =
  | { type: "text"; content: string }
  | { type: "content"; contentType: "word" | "expression" | "sentence"; refId: string; translationIndex: number; data: LessonDisplayContent }
  | { type: "proverb"; refId: string; data: any }
  | { type: "question"; refId: string; data: any };

function toStepProgress(progress: LessonStepProgressEntity[]) {
  const byKey = new Map(progress.map((item) => [item.stepKey, item]));
  return LESSON_STEPS.map((step, idx) => {
    const saved = byKey.get(step.key);
    return {
      id: idx + 1,
      key: step.key,
      title: step.title,
      description: step.description,
      status: (saved?.status || (idx === 3 ? "locked" : "available")) as "locked" | "available" | "completed",
      route: step.route
    };
  });
}

function buildReviewFallback(question: {
  source?: { text: string; translation: string };
  reviewData?: QuestionEntity["reviewData"];
}) {
  const sentence = String(question.reviewData?.sentence || question.source?.text || "").trim();
  const meaning = String(question.reviewData?.meaning || question.source?.translation || "").trim();
  const existingWords = Array.isArray(question.reviewData?.words)
    ? question.reviewData?.words?.map((w) => String(w).trim()).filter(Boolean)
    : [];
  const words = existingWords && existingWords.length > 1 ? existingWords : sentence.split(" ").filter(Boolean);
  const providedOrder = Array.isArray(question.reviewData?.correctOrder)
    ? question.reviewData?.correctOrder
    : [];
  const validProvidedOrder =
    providedOrder.length === words.length &&
    providedOrder.every((idx) => Number.isInteger(idx) && idx >= 0 && idx < words.length) &&
    new Set(providedOrder).size === providedOrder.length;
  const correctOrder = validProvidedOrder ? providedOrder : words.map((_, idx) => idx);
  return { sentence, words, correctOrder, meaning };
}

function getTranslationByIndex(translations: string[], index?: number) {
  if (!Array.isArray(translations) || translations.length === 0) return "";
  if (
    index !== undefined &&
    Number.isInteger(index) &&
    index >= 0 &&
    index < translations.length
  ) {
    return String(translations[index] || "");
  }
  return String(translations[0] || "");
}

function shuffleMatchingItems<T>(items: T[]) {
  return items
    .map((item) => ({ item, sortKey: Math.random() }))
    .sort((left, right) => left.sortKey - right.sortKey)
    .map((entry) => entry.item);
}

function buildMatchingInteractionData(question: QuestionEntity) {
  const matchingPairs = Array.isArray(question.interactionData?.matchingPairs)
    ? question.interactionData.matchingPairs
    : [];
  if (matchingPairs.length < 2) return null;

  const leftItems: MatchingDisplayItem[] = matchingPairs.map((pair) => ({
    id: pair.pairId,
    label: pair.contentText || pair.translation,
    contentId: pair.contentId,
    translationIndex: pair.translationIndex
  }));
  const rightItems: MatchingDisplayItem[] =
    question.subtype === "mt-match-image"
      ? matchingPairs
          .filter((pair) => pair.image?.url)
          .map((pair) => ({
            id: pair.pairId,
            label: pair.image?.altText || pair.translation,
            image: pair.image || null
          }))
      : matchingPairs.map((pair) => ({
          id: pair.pairId,
          label: pair.translation
        }));

  if (rightItems.length !== matchingPairs.length) return null;

  return {
    matchingPairs,
    leftItems,
    rightItems: shuffleMatchingItems(rightItems)
  };
}

function getLessonBlocks(lesson: LessonEntity) {
  return (lesson.stages || [])
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .flatMap((stage) => stage.blocks || []);
}

function buildContentTranslationIndexMap(lessonBlocks: LessonEntity["stages"][number]["blocks"]) {
  const translationIndexMap = new Map<string, number>();
  for (const block of lessonBlocks) {
    if (block.type === "content") {
      const key = `${block.contentType}:${block.refId}`;
      if (!translationIndexMap.has(key)) {
        translationIndexMap.set(key, block.translationIndex ?? 0);
      }
    }
  }
  return translationIndexMap;
}

function getQuestionSourceRef(question: QuestionEntity): { type: ContentType; id: string } | null {
  if (question.sourceType && question.sourceId) {
    return { type: question.sourceType, id: question.sourceId };
  }
  return null;
}

function toDisplayContent(
  entity: ResolvedContentEntity,
  selectedTranslationIndex: number,
  resolvedContentMap?: Map<string, ResolvedContentEntity>
): LessonDisplayContent {
  const translations = Array.isArray(entity.translations) ? entity.translations : [];
  const selectedTranslation = getTranslationByIndex(translations, selectedTranslationIndex);
  const components =
    entity.kind === "sentence" && resolvedContentMap
      ? entity.components
          .slice()
          .sort((left, right) => left.orderIndex - right.orderIndex)
          .reduce<LessonDisplaySentenceComponent[]>((acc, component) => {
            const resolved = resolvedContentMap.get(`${component.type}:${component.refId}`);
            if (!resolved || resolved.kind === "sentence") return acc;
            acc.push({
              id: resolved.id,
              kind: resolved.kind,
              text: component.textSnapshot || resolved.text,
              translations: Array.isArray(resolved.translations) ? resolved.translations : [],
              pronunciation: String(resolved.pronunciation || ""),
              explanation: String(resolved.explanation || ""),
              selectedTranslation: getTranslationByIndex(resolved.translations, 0),
              selectedTranslationIndex: 0,
              audio: {
                provider: String(resolved.audio?.provider || ""),
                model: String(resolved.audio?.model || ""),
                voice: String(resolved.audio?.voice || ""),
                locale: String(resolved.audio?.locale || ""),
                format: String(resolved.audio?.format || ""),
                url: String(resolved.audio?.url || ""),
                s3Key: String(resolved.audio?.s3Key || "")
              }
            });
            return acc;
          }, [])
      : undefined;
  return {
    id: entity.id,
    kind: entity.kind,
    text: entity.text,
    translations,
    pronunciation: String(entity.pronunciation || ""),
    explanation: String(entity.explanation || ""),
    examples: Array.isArray(entity.examples)
      ? entity.examples.map((row) => ({
          original: String(row.original || ""),
          translation: String(row.translation || "")
        }))
      : [],
    difficulty: Number(entity.difficulty || 1),
    audio: entity.audio || {},
    selectedTranslation,
    selectedTranslationIndex,
    components
  };
}

function buildStageProgress(lesson: LessonEntity): LessonStageProgressEntity[] {
  const stages = Array.isArray(lesson.stages) ? lesson.stages.slice().sort((a, b) => a.orderIndex - b.orderIndex) : [];
  return stages.map((stage, index) => ({
    stageId: stage.id || `stage-${index + 1}`,
    stageIndex: index,
    status: index === 0 ? "in_progress" : "not_started"
  }));
}

function syncStageProgress(lesson: LessonEntity, progress: LessonProgressEntity) {
  const expected = buildStageProgress(lesson);
  const byStageId = new Map(progress.stageProgress.map((stage) => [stage.stageId, stage]));
  const merged = expected.map((stage) => {
    const saved = byStageId.get(stage.stageId) || progress.stageProgress.find((item) => item.stageIndex === stage.stageIndex);
    return saved
      ? {
          stageId: stage.stageId,
          stageIndex: stage.stageIndex,
          status: saved.status,
          completedAt: saved.completedAt
        }
      : stage;
  });

  const firstIncomplete = merged.find((stage) => stage.status !== "completed");
  const currentStageIndex = progress.status === "completed"
    ? 0
    : Math.min(progress.currentStageIndex ?? firstIncomplete?.stageIndex ?? 0, Math.max(merged.length - 1, 0));

  if (merged.length > 0 && !merged.some((stage) => stage.status === "in_progress") && firstIncomplete) {
    const idx = merged.findIndex((stage) => stage.stageIndex === currentStageIndex);
    if (idx >= 0 && merged[idx].status === "not_started") {
      merged[idx] = { ...merged[idx], status: "in_progress" };
    }
  }

  return { stageProgress: merged, currentStageIndex };
}

function buildOrderedPublishedLessons(units: Array<{ id: string; orderIndex: number }>, lessons: LessonEntity[]) {
  const unitOrderMap = new Map(units.map((unit) => [unit.id, unit.orderIndex]));
  return lessons
    .filter((lesson) => unitOrderMap.has(lesson.unitId))
    .slice()
    .sort((a, b) => {
      const unitOrderDiff = (unitOrderMap.get(a.unitId) ?? 0) - (unitOrderMap.get(b.unitId) ?? 0);
      if (unitOrderDiff !== 0) return unitOrderDiff;
      const lessonOrderDiff = (a.orderIndex ?? 0) - (b.orderIndex ?? 0);
      if (lessonOrderDiff !== 0) return lessonOrderDiff;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
}

function buildQuestionOrderMap(lessonBlocks: LessonEntity["stages"][number]["blocks"]) {
  const orderMap = new Map<string, number>();
  let cursor = 0;
  for (const block of lessonBlocks) {
    if (block.type === "question") {
      orderMap.set(block.refId, cursor);
    }
    cursor += 1;
  }
  return orderMap;
}

function isoDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function dayDiff(a: Date, b: Date) {
  const ms = isoDay(a).getTime() - isoDay(b).getTime();
  return Math.floor(ms / 86400000);
}

function toDayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getTodayMinutes(weeklyActivity: Array<{ date: Date; minutes: number }>) {
  const todayKey = toDayKey(isoDay(new Date()));
  const todayEntry = weeklyActivity.find((item) => toDayKey(isoDay(new Date(item.date))) === todayKey);
  return todayEntry?.minutes || 0;
}

function buildContentOrderMap(lessonBlocks: LessonEntity["stages"][number]["blocks"]) {
  const orderMap = new Map<string, number>();
  let cursor = 0;
  for (const block of lessonBlocks) {
    if (block.type === "content") {
      const key = `${block.contentType}:${block.refId}`;
      if (!orderMap.has(key)) {
        orderMap.set(key, cursor);
      }
    }
    cursor += 1;
  }
  return orderMap;
}

function isReviewLesson(lesson: Pick<LessonEntity, "kind" | "title">) {
  return lesson.kind === "review";
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function makeUniqueOptions(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const rawValue of values) {
    const value = String(rawValue || "").trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

export class LearnerLessonUseCases {
  private readonly contentLookup: ContentLookupService;

  constructor(
    private readonly lessons: LessonRepository,
    private readonly units: UnitRepository,
    private readonly words: WordRepository,
    private readonly expressions: ExpressionRepository,
    private readonly sentences: SentenceRepository,
    private readonly proverbs: ProverbRepository,
    private readonly questions: QuestionRepository,
    private readonly progress: LessonProgressRepository,
    private readonly learnerProfiles: LearnerProfileRepository,
    private readonly contentPerformance: LearnerContentPerformanceRepository,
    private readonly questionMisses: LearnerQuestionMissRepository
  ) {
    this.contentLookup = new ContentLookupService(words, expressions, sentences);
  }

  private async recordLearnerStageActivity(input: {
    userId: string;
    xpEarned: number;
    minutesSpent: number;
  }) {
    const profile = await this.learnerProfiles.findByUserId(input.userId);
    if (!profile) return null;

    const now = new Date();
    const today = isoDay(now);
    const lastActive = profile.lastActiveDate ? isoDay(new Date(profile.lastActiveDate)) : null;

    let currentStreak = profile.currentStreak;
    if (!lastActive) {
      currentStreak = 1;
    } else {
      const diff = dayDiff(today, lastActive);
      if (diff === 0) currentStreak = Math.max(profile.currentStreak, 1);
      if (diff === 1) currentStreak = Math.max(profile.currentStreak, 0) + 1;
      if (diff > 1) currentStreak = 1;
    }

    const longestStreak = Math.max(profile.longestStreak, currentStreak);
    const todayKey = toDayKey(today);
    const weekly = [...(profile.weeklyActivity || [])];
    const weeklyIndex = weekly.findIndex((entry) => toDayKey(isoDay(new Date(entry.date))) === todayKey);
    if (weeklyIndex >= 0) {
      weekly[weeklyIndex] = {
        ...weekly[weeklyIndex],
        minutes: weekly[weeklyIndex].minutes + Math.max(0, input.minutesSpent)
      };
    } else {
      weekly.push({ date: now, minutes: Math.max(0, input.minutesSpent) });
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);
    const retainedWeekly = weekly.filter((entry) => new Date(entry.date) >= cutoff);

    const updated = await this.learnerProfiles.updateByUserId(input.userId, {
      totalXp: profile.totalXp + Math.max(0, input.xpEarned),
      currentStreak,
      longestStreak,
      lastActiveDate: now,
      weeklyActivity: retainedWeekly
    });

    if (!updated) return null;

    return {
      totalXp: updated.totalXp,
      currentStreak: updated.currentStreak,
      longestStreak: updated.longestStreak,
      todayMinutes: getTodayMinutes(updated.weeklyActivity),
      dailyGoalMinutes: updated.dailyGoalMinutes
    };
  }

  private async recordStageQuestionResults(input: {
    userId: string;
    lesson: LessonEntity;
    questionResults?: StageQuestionResultInput[];
  }) {
    if (!Array.isArray(input.questionResults) || input.questionResults.length === 0) return;

    const seenAt = new Date();
    const byContentKey = new Map<string, {
      sourceType: ContentType;
      sourceId: string;
      attemptIncrement: number;
      wrongIncrement: number;
      correctIncrement: number;
      retryIncrement: number;
      speakingFailureIncrement: number;
      listeningFailureIncrement: number;
      contextScenarioFailureIncrement: number;
      lastQuestionType?: QuestionEntity["type"];
      lastQuestionSubtype?: QuestionEntity["subtype"];
    }>();

    for (const row of input.questionResults) {
      const sourceType = row.sourceType;
      const sourceId = row.sourceId;
      if (!sourceType || !sourceId) continue;

      const key = `${sourceType}:${sourceId}`;
      const attempts = Math.max(1, Math.round(Number(row.attempts) || 1));
      const incorrectAttempts = clamp(Math.max(0, Math.round(Number(row.incorrectAttempts) || 0)), 0, attempts);
      const correctIncrement = row.correct ? 1 : 0;
      const current = byContentKey.get(key) || {
        sourceType,
        sourceId,
        attemptIncrement: 0,
        wrongIncrement: 0,
        correctIncrement: 0,
        retryIncrement: 0,
        speakingFailureIncrement: 0,
        listeningFailureIncrement: 0,
        contextScenarioFailureIncrement: 0
      };

      current.attemptIncrement += attempts;
      current.wrongIncrement += incorrectAttempts;
      current.correctIncrement += correctIncrement;
      current.retryIncrement += Math.max(0, attempts - 1);
      if (row.questionType === "speaking") {
        current.speakingFailureIncrement += incorrectAttempts > 0 || !row.correct ? 1 : 0;
      }
      if (row.questionType === "listening") {
        current.listeningFailureIncrement += incorrectAttempts > 0 || !row.correct ? 1 : 0;
      }
      if (row.questionSubtype === "mc-select-context-response") {
        current.contextScenarioFailureIncrement += incorrectAttempts > 0 || !row.correct ? 1 : 0;
      }
      current.lastQuestionType = row.questionType;
      current.lastQuestionSubtype = row.questionSubtype;
      byContentKey.set(key, current);
    }

    await this.contentPerformance.upsertMany(
      Array.from(byContentKey.values()).map((row) => ({
        userId: input.userId,
        language: input.lesson.language,
        contentType: row.sourceType,
        contentId: row.sourceId,
        exposureIncrement: 1,
        attemptIncrement: row.attemptIncrement,
        correctIncrement: row.correctIncrement,
        wrongIncrement: row.wrongIncrement,
        retryIncrement: row.retryIncrement,
        speakingFailureIncrement: row.speakingFailureIncrement,
        listeningFailureIncrement: row.listeningFailureIncrement,
        contextScenarioFailureIncrement: row.contextScenarioFailureIncrement,
        lastLessonId: input.lesson.id,
        lastQuestionType: row.lastQuestionType,
        lastQuestionSubtype: row.lastQuestionSubtype,
        seenAt
      }))
    );

    const missedQuestionRows = input.questionResults
      .filter((row) => typeof row.questionId === "string" && row.questionId && mongoose.Types.ObjectId.isValid(row.questionId))
      .map((row) => {
        const incorrectAttempts = clamp(Math.max(0, Math.round(Number(row.incorrectAttempts) || 0)), 0, Math.max(1, Math.round(Number(row.attempts) || 1)));
        if (incorrectAttempts <= 0 || !row.questionId || !row.questionType || !row.questionSubtype) return null;
        return {
          userId: input.userId,
          lessonId: input.lesson.id,
          questionId: row.questionId,
          questionType: row.questionType,
          questionSubtype: row.questionSubtype,
          sourceType: row.sourceType,
          sourceId: row.sourceId,
          missIncrement: incorrectAttempts,
          seenAt
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));

    await this.questionMisses.upsertMany(missedQuestionRows);
  }

  private async computeAdaptiveReviewState(userId: string, lesson: LessonEntity) {
    if (isReviewLesson(lesson)) return null;

    const [unit, unitLessons] = await Promise.all([
      this.units.findById(lesson.unitId),
      this.lessons.list({ unitId: lesson.unitId, status: "published" })
    ]);
    if (!unit) return null;

    const orderedLessons = unitLessons
      .slice()
      .sort((a, b) => {
        const diff = (a.orderIndex ?? 0) - (b.orderIndex ?? 0);
        if (diff !== 0) return diff;
        return a.createdAt.getTime() - b.createdAt.getTime();
      });
    const currentIndex = orderedLessons.findIndex((item) => item.id === lesson.id);
    if (currentIndex < 0) return null;

    const completedBeforeCurrent = orderedLessons
      .slice(0, currentIndex + 1)
      .filter((item) => !isReviewLesson(item));
    if (completedBeforeCurrent.length < 2 || completedBeforeCurrent.length % 2 !== 0) {
      return null;
    }

    const sourceLessons = completedBeforeCurrent.slice(-2);
    const fallbackReviewLesson =
      orderedLessons
        .slice(currentIndex + 1)
        .find((item) => isReviewLesson(item)) || null;

    const lessonBlocksById = new Map(sourceLessons.map((item) => [item.id, getLessonBlocks(item)]));
    const questionIds = Array.from(
      new Set(
        sourceLessons.flatMap((item) =>
          (lessonBlocksById.get(item.id) || [])
            .filter((block) => block.type === "question")
            .map((block) => (block.type === "question" ? block.refId : ""))
            .filter(Boolean)
        )
      )
    );
    const questionRows = questionIds.length ? await Promise.all(questionIds.map((id) => this.questions.findById(id))) : [];
    const questionMap = new Map(questionRows.filter(Boolean).map((question) => [question!.id, question!]));
    const questionMissRows = await this.questionMisses.listByUserAndLessonIds(
      userId,
      sourceLessons.map((item) => item.id)
    );
    const missedQuestions = questionMissRows
      .map((miss) => {
        const question = questionMap.get(miss.questionId);
        if (!question) return null;
        return { question, miss } satisfies AdaptiveReviewMissedQuestion;
      })
      .filter((item): item is AdaptiveReviewMissedQuestion => Boolean(item))
      .sort(compareAdaptiveReviewMissedQuestions);

    const allContentRefs = sourceLessons.flatMap((item) => {
      const lessonBlocks = lessonBlocksById.get(item.id) || [];
      const manualContentRefs = lessonBlocks
        .filter((block): block is Extract<LessonEntity["stages"][number]["blocks"][number], { type: "content" }> => block.type === "content")
        .map((block) => ({ type: block.contentType, id: block.refId }))
        .filter((ref) => ref.id);
      const referencedContentRefs = lessonBlocks
        .filter((block): block is Extract<LessonEntity["stages"][number]["blocks"][number], { type: "question" }> => block.type === "question")
        .flatMap((block) => {
          const question = questionMap.get(block.refId);
          if (!question) return [];

          const refs: Array<{ type: ContentType; id: string }> = [];
          const primary = getQuestionSourceRef(question);
          if (primary) refs.push(primary);
          if (Array.isArray(question.relatedSourceRefs)) refs.push(...question.relatedSourceRefs);
          if (Array.isArray(question.interactionData?.matchingPairs)) {
            for (const pair of question.interactionData.matchingPairs) {
              if (pair.contentType && pair.contentId) refs.push({ type: pair.contentType, id: pair.contentId });
            }
          }
          return refs;
        });

      return [...manualContentRefs, ...referencedContentRefs];
    });

    const resolvedContentMap = await this.contentLookup.findMany(allContentRefs);
    const sentenceComponentRefs = Array.from(
      new Map(
        Array.from(resolvedContentMap.values())
          .filter((item): item is Extract<ResolvedContentEntity, { kind: "sentence" }> => item.kind === "sentence")
          .flatMap((item) => item.components.map((component) => [`${component.type}:${component.refId}`, { type: component.type, id: component.refId }] as const))
      ).values()
    );
    if (sentenceComponentRefs.length > 0) {
      const sentenceComponentMap = await this.contentLookup.findMany(sentenceComponentRefs);
      for (const [key, value] of sentenceComponentMap.entries()) {
        resolvedContentMap.set(key, value);
      }
    }

    const candidateKeys = new Set(Array.from(resolvedContentMap.keys()));
    const performanceRows = await this.contentPerformance.listByUserAndLanguage(userId, lesson.language);
    const weakTargets = performanceRows
      .map((row) => {
        const key = `${row.contentType}:${row.contentId}`;
        if (!candidateKeys.has(key)) return null;
        const item = resolvedContentMap.get(key);
        if (!item) return null;

        const score = scoreAdaptiveReviewTarget(row);
        if (score <= 0) return null;

        return { item, score, metrics: row } satisfies AdaptiveReviewTarget;
      })
      .filter((item): item is AdaptiveReviewTarget => Boolean(item))
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        return right.metrics.updatedAt.getTime() - left.metrics.updatedAt.getTime();
      });

    return {
      unit,
      sourceLessons,
      fallbackReviewLesson,
      resolvedContentMap,
      weakTargets,
      missedQuestions
    };
  }

  async getAdaptiveReviewSuggestion(userId: string, afterLessonId: string): Promise<AdaptiveReviewSuggestion | null> {
    const lesson = await this.lessons.findById(afterLessonId);
    if (!lesson || lesson.status !== "published") return null;

    const state = await this.computeAdaptiveReviewState(userId, lesson);
    if (!state) return null;

    if (state.weakTargets.length > 0) {
      return {
        kind: "personalized",
        title: "Targeted Review",
        description: "Review the items you struggled with in the last two lessons.",
        sourceLessonIds: state.sourceLessons.map((item) => item.id),
        weakItemCount: state.weakTargets.length
      };
    }

    if (state.fallbackReviewLesson) {
      return {
        kind: "fallback",
        lesson: {
          id: state.fallbackReviewLesson.id,
          title: state.fallbackReviewLesson.title
        },
        reason: "no_struggle_data"
      };
    }

    return null;
  }

  async getAdaptiveReviewFlow(userId: string, afterLessonId: string) {
    const lesson = await this.lessons.findById(afterLessonId);
    if (!lesson || lesson.status !== "published") return null;

    const state = await this.computeAdaptiveReviewState(userId, lesson);
    if (!state || state.weakTargets.length === 0) return null;

    const syntheticLessonId = `adaptive-review:${afterLessonId}`;
    const selectedTargets = state.weakTargets.slice(0, 4);
    const selectedTargetKeys = new Set(selectedTargets.map((target) => `${target.item.kind}:${target.item.id}`));
    const contentPool = selectedTargets
      .map((target) => target.item)
      .filter((item): item is Extract<ResolvedContentEntity, { kind: "word" | "expression" }> => item.kind !== "sentence");
    const contentPoolForOptions = contentPool.length > 0 ? contentPool : Array.from(state.resolvedContentMap.values()).filter((item): item is Extract<ResolvedContentEntity, { kind: "word" | "expression" }> => item.kind !== "sentence");
    const contextualSentences = Array.from(state.resolvedContentMap.values())
      .filter((item): item is Extract<ResolvedContentEntity, { kind: "sentence" }> => item.kind === "sentence")
      .filter((sentence) =>
        sentence.components.some((component) => selectedTargetKeys.has(`${component.type}:${component.refId}`))
      )
      .slice(0, 2);
    const sentenceTargets = selectedTargets
      .map((target) => target.item)
      .filter((item): item is Extract<ResolvedContentEntity, { kind: "sentence" }> => item.kind === "sentence");
    const sentencePool = [...sentenceTargets, ...contextualSentences].filter(
      (item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index
    );

    const createMcOptions = (item: ResolvedContentEntity) => {
      const correct = getTranslationByIndex(item.translations, 0) || "Correct answer";
      const optionPool =
        item.kind === "sentence"
          ? (sentencePool.length > 0 ? sentencePool : Array.from(state.resolvedContentMap.values()).filter((candidate): candidate is Extract<ResolvedContentEntity, { kind: "sentence" }> => candidate.kind === "sentence"))
          : contentPoolForOptions;
      const distractors = makeUniqueOptions(
        optionPool
          .filter((candidate) => candidate.id !== item.id)
          .flatMap((candidate) => candidate.translations)
      ).filter((candidate: string) => candidate.toLowerCase() !== correct.toLowerCase());
      const options = shuffleMatchingItems([correct, ...distractors.slice(0, 3)]);
      while (options.length < 4) {
        options.push(`Option ${options.length + 1}`);
      }
      const correctIndex = options.findIndex((value) => value.toLowerCase() === correct.toLowerCase());
      return { options, correctIndex: correctIndex >= 0 ? correctIndex : 0, correct };
    };

    const buildWordOrderData = (sentenceText: string, meaning: string) => {
      const words = String(meaning || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      if (words.length < 2) return null;
      return {
        sentence: sentenceText,
        words,
        correctOrder: words.map((_, index) => index),
        meaning
      };
    };

    let questionCounter = 0;
    const createQuestion = (input: Omit<QuestionEntity, "id" | "createdAt" | "updatedAt" | "status" | "lessonId" | "_id"> & {
      prompt: string;
      source: ReturnType<typeof toDisplayContent> | null;
      interactionData?: Record<string, unknown>;
    }) => {
      questionCounter += 1;
      const now = new Date();
      return {
        _id: `adaptive-review-question-${questionCounter}`,
        id: `adaptive-review-question-${questionCounter}`,
        lessonId: syntheticLessonId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        relatedSourceRefs: input.relatedSourceRefs,
        translationIndex: input.translationIndex,
        type: input.type,
        subtype: input.subtype,
        promptTemplate: input.promptTemplate,
        prompt: input.prompt,
        options: input.options,
        correctIndex: input.correctIndex,
        reviewData: input.reviewData,
        interactionData: input.interactionData,
        explanation: input.explanation,
        source: input.source,
        status: "published" as const,
        createdAt: now,
        updatedAt: now
      };
    };

    const stage1Blocks: LearnerFlowBlock[] = [
      {
        type: "text",
        content: "This review focuses on the items you struggled with in the last two lessons."
      }
    ];
    const stage2Blocks: LearnerFlowBlock[] = [
      {
        type: "text",
        content: "Use the same content again in short context and sentence exercises."
      }
    ];
    const stage3Blocks: LearnerFlowBlock[] = [
      {
        type: "text",
        content: "Finish with recall, listening, and speaking practice."
      }
    ];

    const topContentTargets = contentPool.slice(0, 3);
    const missedQuestionReplays = state.missedQuestions.slice(0, 4);

    for (const replay of missedQuestionReplays) {
      const originalQuestion = replay.question;
      const primary = getQuestionSourceRef(originalQuestion);
      const sourceEntity =
        primary
          ? state.resolvedContentMap.get(`${primary.type}:${primary.id}`)
          : null;
      const sourceDisplay = sourceEntity
        ? toDisplayContent(sourceEntity, originalQuestion.translationIndex ?? 0, state.resolvedContentMap)
        : null;
      const selectedTranslation = sourceDisplay?.selectedTranslation || "";
      const interactionData =
        originalQuestion.type === "matching"
          ? buildMatchingInteractionData(originalQuestion)
          : originalQuestion.reviewData
            ? {
                ...buildReviewFallback({
                  source: sourceDisplay ? { text: sourceDisplay.text, translation: selectedTranslation } : undefined,
                  reviewData: originalQuestion.reviewData
                }),
                ...(originalQuestion.interactionData || {})
              }
            : originalQuestion.interactionData;
      const meaning =
        typeof interactionData === "object" && interactionData && "meaning" in interactionData
          ? String((interactionData as { meaning?: unknown }).meaning || "")
          : selectedTranslation;
      const sentence =
        typeof interactionData === "object" && interactionData && "sentence" in interactionData
          ? String((interactionData as { sentence?: unknown }).sentence || "")
          : "";
      const prompt = String(originalQuestion.promptTemplate || "")
        .replace(/\{phrase\}/g, sourceDisplay?.text || "")
        .replace(/\{meaning\}/g, meaning)
        .replace(/\{sentence\}/g, sentence);

      stage1Blocks.push({
        type: "question",
        refId: originalQuestion.id,
        data: {
          ...originalQuestion,
          _id: originalQuestion.id,
          id: originalQuestion.id,
          lessonId: syntheticLessonId,
          prompt,
          source: sourceDisplay,
          interactionData: interactionData ?? undefined,
          status: "published" as const
        }
      });
    }

    for (const item of topContentTargets) {
      const display = toDisplayContent(item, 0, state.resolvedContentMap);
      const { options, correctIndex, correct } = createMcOptions(item);
      const question = createQuestion({
        sourceType: item.kind,
        sourceId: item.id,
        translationIndex: 0,
        type: "multiple-choice",
        subtype: "mc-select-translation",
        promptTemplate: "What does {phrase} mean?",
        prompt: `What does ${item.text} mean?`,
        options,
        correctIndex,
        explanation: item.explanation || `The correct meaning is ${correct}.`,
        source: display
      });
      stage1Blocks.push({
        type: "question",
        refId: question._id,
        data: question
      });

      if (display.audio?.url) {
        const listeningQuestion = createQuestion({
          sourceType: item.kind,
          sourceId: item.id,
          translationIndex: 0,
          type: "listening",
          subtype: "ls-mc-select-translation",
          promptTemplate: "Listen and choose the correct meaning.",
          prompt: `Listen and choose the correct meaning for ${item.text}.`,
          options,
          correctIndex,
          explanation: item.explanation || `The correct meaning is ${correct}.`,
          source: display
        });
        stage1Blocks.push({
          type: "question",
          refId: listeningQuestion._id,
          data: listeningQuestion
        });
      }
    }

    if (topContentTargets.length >= 2) {
      const matchingPairs = topContentTargets.map((item, index) => ({
        pairId: `${item.kind}-${item.id}-${index + 1}`,
        contentType: item.kind,
        contentId: item.id,
        contentText: item.text,
        translationIndex: 0,
        translation: getTranslationByIndex(item.translations, 0),
        image: null
      }));
      const leftItems = matchingPairs.map((pair) => ({
        id: pair.pairId,
        label: pair.contentText || pair.translation,
        translationIndex: pair.translationIndex
      }));
      const rightItems = shuffleMatchingItems(
        matchingPairs.map((pair) => ({
          id: pair.pairId,
          label: pair.translation
        }))
      );

      const matchingQuestion = createQuestion({
        sourceType: topContentTargets[0].kind,
        sourceId: topContentTargets[0].id,
        relatedSourceRefs: topContentTargets.map((item) => ({ type: item.kind, id: item.id })),
        translationIndex: 0,
        type: "matching",
        subtype: "mt-match-translation",
        promptTemplate: "Match each item to the correct translation.",
        prompt: "Match each item to the correct translation.",
        options: [],
        correctIndex: 0,
        explanation: "Match each item to its English meaning.",
        source: toDisplayContent(topContentTargets[0], 0, state.resolvedContentMap),
        interactionData: {
          matchingPairs,
          leftItems,
          rightItems
        }
      });
      stage2Blocks.push({
        type: "question",
        refId: matchingQuestion._id,
        data: matchingQuestion
      });
    }

    for (const sentence of sentencePool) {
      const display = toDisplayContent(sentence, 0, state.resolvedContentMap);
      const { options, correctIndex, correct } = createMcOptions(sentence);
      const sentenceMeaningQuestion = createQuestion({
        sourceType: "sentence",
        sourceId: sentence.id,
        translationIndex: 0,
        type: "multiple-choice",
        subtype: "mc-select-translation",
        promptTemplate: "What does this sentence mean in English?",
        prompt: "What does this sentence mean in English?",
        options,
        correctIndex,
        explanation: sentence.explanation || `The correct meaning is ${correct}.`,
        source: display
      });
      stage2Blocks.push({
        type: "question",
        refId: sentenceMeaningQuestion._id,
        data: sentenceMeaningQuestion
      });

      const wordOrderData = buildWordOrderData(sentence.text, correct);
      if (wordOrderData) {
        const sentenceOrderQuestion = createQuestion({
          sourceType: "sentence",
          sourceId: sentence.id,
          translationIndex: 0,
          type: "fill-in-the-gap",
          subtype: "fg-word-order",
          promptTemplate: "Build the English meaning of this sentence.",
          prompt: "Build the English meaning of this sentence.",
          options: wordOrderData.words,
          correctIndex: 0,
          reviewData: wordOrderData,
          explanation: sentence.explanation || `Correct translation: ${correct}.`,
          source: display,
          interactionData: wordOrderData
        });
        stage2Blocks.push({
          type: "question",
          refId: sentenceOrderQuestion._id,
          data: sentenceOrderQuestion
        });
      }
    }

    for (const item of selectedTargets.slice(0, 3)) {
      const display = toDisplayContent(item.item, 0, state.resolvedContentMap);
      if (display.audio?.url) {
        const speakingQuestion = createQuestion({
          sourceType: item.item.kind,
          sourceId: item.item.id,
          translationIndex: 0,
          type: "speaking",
          subtype: "sp-pronunciation-compare",
          promptTemplate: item.item.kind === "sentence"
            ? "Say this sentence aloud. Match the tutor's tone and rhythm."
            : "Say {phrase} aloud. Match the tutor's tone and pronunciation.",
          prompt:
            item.item.kind === "sentence"
              ? "Say this sentence aloud. Match the tutor's tone and rhythm."
              : `Say ${item.item.text} aloud. Match the tutor's tone and pronunciation.`,
          options: [],
          correctIndex: 0,
          explanation: item.item.explanation || `Repeat ${item.item.text} and match the tutor reference.`,
          source: display
        });
        stage3Blocks.push({
          type: "question",
          refId: speakingQuestion._id,
          data: speakingQuestion
        });
      }

      const { options, correctIndex, correct } = createMcOptions(item.item);
      const recallQuestion = createQuestion({
        sourceType: item.item.kind,
        sourceId: item.item.id,
        translationIndex: 0,
        type: display.audio?.url ? "listening" : "multiple-choice",
        subtype: display.audio?.url ? "ls-mc-select-translation" : "mc-select-translation",
        promptTemplate: display.audio?.url ? "Listen and choose the correct meaning." : "What does {phrase} mean?",
        prompt: display.audio?.url
          ? `Listen and choose the correct meaning for ${item.item.text}.`
          : `What does ${item.item.text} mean?`,
        options,
        correctIndex,
        explanation: item.item.explanation || `The correct meaning is ${correct}.`,
        source: display
      });
      stage3Blocks.push({
        type: "question",
        refId: recallQuestion._id,
        data: recallQuestion
      });
    }

    const stages = [
      {
        id: "adaptive-review-stage-1",
        title: "Targeted Recall",
        description: "Start with the items you struggled with most.",
        orderIndex: 0,
        blocks: stage1Blocks.map((block) => (block.type === "text" ? { type: "text" as const, content: block.content } : { type: "question" as const, refId: block.refId }))
      },
      {
        id: "adaptive-review-stage-2",
        title: "Context Practice",
        description: "Use the same content again inside short contexts and sentences.",
        orderIndex: 1,
        blocks: stage2Blocks.map((block) => (block.type === "text" ? { type: "text" as const, content: block.content } : { type: "question" as const, refId: block.refId }))
      },
      {
        id: "adaptive-review-stage-3",
        title: "Recall and Speak",
        description: "Finish with listening and speaking checks.",
        orderIndex: 2,
        blocks: stage3Blocks.map((block) => (block.type === "text" ? { type: "text" as const, content: block.content } : { type: "question" as const, refId: block.refId }))
      }
    ];

    return {
      lesson: {
        id: syntheticLessonId,
        _id: syntheticLessonId,
        title: "Targeted Review",
        unitId: lesson.unitId,
        language: lesson.language,
        level: lesson.level,
        orderIndex: lesson.orderIndex + 0.5,
        description: "A personalized review session built from the items you struggled with most recently.",
        topics: state.sourceLessons.map((item) => item.title),
        proverbs: [],
        stages,
        kind: "review",
        status: "published" as const,
        createdBy: lesson.createdBy,
        publishedAt: new Date(),
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      blocks: [...stage1Blocks, ...stage2Blocks, ...stage3Blocks],
      progress: {
        currentStageIndex: 0,
        stageProgress: stages.map((stage, index) => ({
          stageId: stage.id,
          stageIndex: index,
          status: index === 0 ? "in_progress" as const : "not_started" as const
        })),
        progressPercent: 0,
        status: "not_started" as const
      }
    };
  }

  async getLessonFlow(userId: string, lessonId: string) {
    const lesson = await this.lessons.findById(lessonId);
    if (!lesson || lesson.status !== "published") return null;

    const progress = await this.ensureProgress(userId, lesson);
    const syncedProgress = syncStageProgress(lesson, progress);

    // 1. Identify all question/proverb/phrase refs in the blocks
    const lessonBlocks = getLessonBlocks(lesson);
    const contentTranslationIndexMap = buildContentTranslationIndexMap(lessonBlocks);
    const questionIds = lessonBlocks
      .filter((b) => b.type === "question")
      .map((b) => (b.type === "question" ? b.refId : ""))
      .filter(Boolean);
    const proverbIds = lessonBlocks
      .filter((b) => b.type === "proverb")
      .map((b) => (b.type === "proverb" ? b.refId : ""))
      .filter(Boolean);
    const manualContentRefs = lessonBlocks
      .filter((b): b is Extract<LessonEntity["stages"][number]["blocks"][number], { type: "content" }> => b.type === "content")
      .map((b) => ({ type: b.contentType, id: b.refId }))
      .filter((item) => item.id);

    // 2. Fetch questions and proverbs first to see what content they reference
    const [questions, proverbs] = await Promise.all([
      questionIds.length ? Promise.all(questionIds.map((id) => this.questions.findById(id))) : Promise.resolve([]),
      proverbIds.length ? Promise.all(proverbIds.map((id) => this.proverbs.findById(id))) : Promise.resolve([])
    ]);

    const questionMap = new Map(questions.filter(Boolean).map(q => [q!.id, q!]));
    const proverbMap = new Map(proverbs.filter(Boolean).map(p => [p!.id, p!]));

    const referencedContentRefs = questions
      .filter(Boolean)
      .flatMap((question) => {
        const value = question!;
        const refs: Array<{ type: ContentType; id: string }> = [];
        const primary = getQuestionSourceRef(value);
        if (primary) refs.push(primary);
        if (Array.isArray(value.relatedSourceRefs)) refs.push(...value.relatedSourceRefs);
        if (Array.isArray(value.interactionData?.matchingPairs)) {
          for (const pair of value.interactionData.matchingPairs) {
            if (pair.contentType && pair.contentId) refs.push({ type: pair.contentType, id: pair.contentId });
          }
        }
        return refs;
      });
    const allContentRefs = [...manualContentRefs, ...referencedContentRefs];

    // 4. Fetch all content
    const resolvedContentMap = await this.contentLookup.findMany(allContentRefs);
    const sentenceComponentRefs = Array.from(
      new Map(
        Array.from(resolvedContentMap.values())
          .filter((item): item is Extract<ResolvedContentEntity, { kind: "sentence" }> => item.kind === "sentence")
          .flatMap((item) => item.components.map((component) => [`${component.type}:${component.refId}`, { type: component.type, id: component.refId }] as const))
      ).values()
    );
    if (sentenceComponentRefs.length > 0) {
      const sentenceComponents = await this.contentLookup.findMany(sentenceComponentRefs);
      for (const [key, value] of sentenceComponents.entries()) {
        resolvedContentMap.set(key, value);
      }
    }

    // 5. Populate blocks with full data
    const populatedBlocks = lessonBlocks.map((block) => {
      if (block.type === "text") return block;

      const refId = block.refId;
      if (block.type === "content") {
        const content = resolvedContentMap.get(`${block.contentType}:${refId}`);
        if (!content) return null;
        return {
          type: "content" as const,
          contentType: block.contentType,
          refId,
          translationIndex: block.translationIndex ?? 0,
          data: toDisplayContent(content, block.translationIndex ?? 0, resolvedContentMap)
        };
      }
      if (block.type === "proverb") {
        const data = proverbMap.get(refId);
        return data ? { ...block, data } : null;
      }
      if (block.type === "question") {
        const q = questionMap.get(refId);
        if (!q) return null;

        if (q.subtype === "mt-match-image" || q.subtype === "mt-match-translation") {
          const matchingInteractionData = buildMatchingInteractionData(q);
          if (!matchingInteractionData) return null;
          const sourceRef = getQuestionSourceRef(q);
          const content = sourceRef ? resolvedContentMap.get(`${sourceRef.type}:${sourceRef.id}`) || null : null;
          const selectedTranslationIndex = sourceRef
            ? (contentTranslationIndexMap.get(`${sourceRef.type}:${sourceRef.id}`) ?? q.translationIndex ?? 0)
            : q.translationIndex ?? 0;

          return {
            ...block,
            data: {
              ...q,
              prompt: String(q.promptTemplate || ""),
              source: content ? toDisplayContent(content, selectedTranslationIndex, resolvedContentMap) : null,
              interactionData: matchingInteractionData
            }
          };
        }

        const sourceRef = getQuestionSourceRef(q);
        const content = sourceRef ? resolvedContentMap.get(`${sourceRef.type}:${sourceRef.id}`) || null : null;
        const displayEntity = content;
        if (!displayEntity || !sourceRef) return null;
        const selectedTranslationIndex = content
          ? (contentTranslationIndexMap.get(`${sourceRef.type}:${sourceRef.id}`) ?? q.translationIndex ?? 0)
          : 0;
        const selectedTranslation = getTranslationByIndex(displayEntity.translations, selectedTranslationIndex);
        const interactionData =
          q.type === "fill-in-the-gap" || q.subtype.includes("fg-") || q.subtype.includes("missing-word")
            ? buildReviewFallback({
                source: { text: displayEntity.text, translation: selectedTranslation },
                reviewData: q.reviewData
              })
            : undefined;
        const meaning = interactionData?.meaning || selectedTranslation;
        const sentence = interactionData?.sentence || "";
        const prompt = String(q.promptTemplate || "")
          .replace(/\{phrase\}/g, displayEntity?.text || "")
          .replace(/\{meaning\}/g, meaning)
          .replace(/\{sentence\}/g, sentence);

        return {
          ...block,
          data: {
            ...q,
            prompt,
            source: displayEntity
              ? toDisplayContent(displayEntity, selectedTranslationIndex, resolvedContentMap)
              : null,
            interactionData
          }
        };
      }
      return null;
    }).filter((block): block is LearnerPopulatedBlock => Boolean(block));

    let flowLesson = lesson;
    let flowBlocks: LearnerPopulatedBlock[] = populatedBlocks;

    if (lesson.kind === "review") {
      const unitLessons = await this.lessons.list({ unitId: lesson.unitId, status: "published" });
      const orderedUnitLessons = unitLessons
        .slice()
        .sort((a, b) => {
          const diff = (a.orderIndex ?? 0) - (b.orderIndex ?? 0);
          if (diff !== 0) return diff;
          return a.createdAt.getTime() - b.createdAt.getTime();
        });
      const reviewLessonIndex = orderedUnitLessons.findIndex((item) => item.id === lesson.id);
      const sourceCoreLessons =
        reviewLessonIndex > 0
          ? orderedUnitLessons
              .slice(0, reviewLessonIndex)
              .filter((item) => item.kind !== "review")
              .slice(-2)
          : [];

      const anchorLesson = sourceCoreLessons[sourceCoreLessons.length - 1];
      if (anchorLesson && sourceCoreLessons.length === 2) {
        const adaptiveFlow = await this.getAdaptiveReviewFlow(userId, anchorLesson.id);
        const adaptiveStage = adaptiveFlow?.lesson.stages?.[0];
        if (adaptiveFlow && adaptiveStage && adaptiveStage.blocks.length > 0 && lesson.stages.length > 0) {
          const personalizedBlocks = adaptiveFlow.blocks.slice(0, adaptiveStage.blocks.length) as LearnerPopulatedBlock[];
          const orderedStages = lesson.stages.slice().sort((a, b) => a.orderIndex - b.orderIndex);
          const firstStage = orderedStages[0];
          const mergedFirstStage = {
            ...firstStage,
            blocks: [...adaptiveStage.blocks, ...(firstStage.blocks || [])]
          };
          flowLesson = {
            ...lesson,
            stages: [mergedFirstStage, ...orderedStages.slice(1)]
          };
          flowBlocks = [...personalizedBlocks, ...populatedBlocks];
        }
      }
    }

    return {
      lesson: flowLesson,
      blocks: flowBlocks,
      progress: {
        ...progress,
        stageProgress: syncedProgress.stageProgress,
        currentStageIndex: syncedProgress.currentStageIndex
      }
    };
  }

  private async ensureProgress(userId: string, lesson: LessonEntity): Promise<LessonProgressEntity> {
    const existing = await this.progress.findByUserAndLessonId(userId, lesson.id);
    if (existing) return existing;

    return this.progress.create({
      userId,
      lessonId: lesson.id,
      status: "not_started",
      progressPercent: 0,
      stepProgress: LESSON_STEPS.map((step, idx) => ({
        stepKey: step.key,
        status: idx === 3 ? "locked" : "available",
        score: 0
      })),
      stageProgress: buildStageProgress(lesson),
      currentStageIndex: 0
    });
  }

  async getNextLesson(userId: string) {
    const profile = await this.learnerProfiles.findByUserId(userId);
    if (!profile) return "profile_not_found" as const;

    const [units, lessons] = await Promise.all([
      this.units.list({ status: "published", language: profile.currentLanguage }),
      this.lessons.list({ status: "published", language: profile.currentLanguage })
    ]);
    const orderedLessons = buildOrderedPublishedLessons(units, lessons);

    const progresses = await this.progress.listByUserAndLessonIds(
      userId,
      orderedLessons.map((lesson) => lesson.id)
    );
    const completed = new Set(progresses.filter((p) => p.status === "completed").map((p) => p.lessonId));

    const next = orderedLessons.find((lesson) => !completed.has(lesson.id)) || orderedLessons[0];
    return next || null;
  }

  async getLessonOverview(userId: string, lessonId: string) {
    const lesson = await this.lessons.findById(lessonId);
    if (!lesson || lesson.status !== "published") return null;

    const progress = await this.ensureProgress(userId, lesson);
    const syncedProgress = syncStageProgress(lesson, progress);
    const steps = toStepProgress(progress.stepProgress);

    const profile = await this.learnerProfiles.findByUserId(userId);
    const language = profile?.currentLanguage || lesson.language;
    const [units, allLanguageLessons] = await Promise.all([
      this.units.list({ status: "published", language }),
      this.lessons.list({ status: "published", language })
    ]);
    const orderedLessons = buildOrderedPublishedLessons(units, allLanguageLessons);
    const lessonIndex = orderedLessons.findIndex((item) => item.id === lesson.id);
    const futureLessons =
      lessonIndex >= 0
        ? orderedLessons.slice(lessonIndex + 1, lessonIndex + 4)
        : [];

    return {
      lesson,
      progress: {
        ...progress,
        stageProgress: syncedProgress.stageProgress,
        currentStageIndex: syncedProgress.currentStageIndex
      },
      steps,
      comingNext: futureLessons.map((item) => ({ id: item.id, title: item.title }))
    };
  }

  async getLessonSteps(userId: string, lessonId: string) {
    const lesson = await this.lessons.findById(lessonId);
    if (!lesson || lesson.status !== "published") return null;

    const progress = await this.ensureProgress(userId, lesson);
    return { steps: toStepProgress(progress.stepProgress), progressPercent: progress.progressPercent };
  }

  async completeStep(input: { userId: string; lessonId: string; stepKey: string; score?: number }) {
    const lesson = await this.lessons.findById(input.lessonId);
    if (!lesson || lesson.status !== "published") return "lesson_not_found" as const;

    if (!LESSON_STEPS.some((step) => step.key === input.stepKey)) {
      return "invalid_step_key" as const;
    }

    const progress = await this.ensureProgress(input.userId, lesson);
    const stepProgress = [...progress.stepProgress];
    const idx = stepProgress.findIndex((item) => item.stepKey === input.stepKey);
    if (idx === -1) return "step_not_found" as const;

    stepProgress[idx] = {
      ...stepProgress[idx],
      status: "completed",
      score: Number(input.score) || stepProgress[idx].score || 0,
      completedAt: new Date()
    };

    if (idx + 1 < stepProgress.length && stepProgress[idx + 1].status === "locked") {
      stepProgress[idx + 1] = { ...stepProgress[idx + 1], status: "available" };
    }

    const completedCount = stepProgress.filter((item) => item.status === "completed").length;
    const progressPercent = Math.round((completedCount / LESSON_STEPS.length) * 100);
    const status = progressPercent >= 100 ? "completed" : "in_progress";

    const updated = await this.progress.updateById(progress.id, {
      stepProgress,
      progressPercent,
      status,
      startedAt: progress.startedAt || new Date(),
      completedAt: status === "completed" ? progress.completedAt || new Date() : progress.completedAt
    });

    if (!updated) return "lesson_not_found" as const;

    return {
      progressPercent: updated.progressPercent,
      status: updated.status,
      steps: toStepProgress(updated.stepProgress)
    };
  }

  async completeStage(input: {
    userId: string;
    lessonId: string;
    stageIndex: number;
    xpEarned?: number;
    minutesSpent?: number;
    questionResults?: StageQuestionResultInput[];
  }) {
    const lesson = await this.lessons.findById(input.lessonId);
    if (!lesson || lesson.status !== "published") return "lesson_not_found" as const;

    const stages = Array.isArray(lesson.stages) ? lesson.stages.slice().sort((a, b) => a.orderIndex - b.orderIndex) : [];
    if (input.stageIndex < 0 || input.stageIndex >= stages.length) {
      return "invalid_stage_index" as const;
    }

    const progress = await this.ensureProgress(input.userId, lesson);
    const syncedProgress = syncStageProgress(lesson, progress);
    const stageProgress = syncedProgress.stageProgress.map((stage) => ({ ...stage }));
    const stage = stageProgress.find((item) => item.stageIndex === input.stageIndex);
    if (!stage) return "invalid_stage_index" as const;
    const wasStageAlreadyCompleted = stage.status === "completed";

    stage.status = "completed";
    stage.completedAt = stage.completedAt || new Date();

    const nextStage = stageProgress.find((item) => item.stageIndex === input.stageIndex + 1);
    if (nextStage && nextStage.status === "not_started") {
      nextStage.status = "in_progress";
    }

    const completedCount = stageProgress.filter((item) => item.status === "completed").length;
    const progressPercent = stageProgress.length > 0 ? Math.round((completedCount / stageProgress.length) * 100) : 0;
    const status = completedCount >= stageProgress.length && stageProgress.length > 0 ? "completed" as const : "in_progress" as const;
    const currentStageIndex = status === "completed"
      ? 0
      : Math.min(input.stageIndex + 1, Math.max(stageProgress.length - 1, 0));

    const updated = await this.progress.updateById(progress.id, {
      stageProgress,
      currentStageIndex,
      progressPercent,
      status,
      startedAt: progress.startedAt || new Date(),
      completedAt: status === "completed" ? progress.completedAt || new Date() : progress.completedAt
    });

    if (!updated) return "lesson_not_found" as const;

    await this.recordStageQuestionResults({
      userId: input.userId,
      lesson,
      questionResults: input.questionResults
    });

    const stageBlockCount = Array.isArray(stages[input.stageIndex]?.blocks)
      ? stages[input.stageIndex].blocks.length
      : 0;
    const stageQuestionCount = (stages[input.stageIndex]?.blocks || []).filter((block) => block.type === "question").length;
    const stageXpEarned = Number.isFinite(input.xpEarned)
      ? Math.max(0, Number(input.xpEarned))
      : stageQuestionCount * DEFAULT_XP_PER_QUESTION;
    const stageMinutesSpent = Number.isFinite(input.minutesSpent)
      ? Math.max(1, Math.round(Number(input.minutesSpent)))
      : Math.max(1, stageBlockCount);

    const learnerStats = wasStageAlreadyCompleted
      ? await (async () => {
          const profile = await this.learnerProfiles.findByUserId(input.userId);
          return profile
            ? {
                totalXp: profile.totalXp,
                currentStreak: profile.currentStreak,
                longestStreak: profile.longestStreak,
                todayMinutes: getTodayMinutes(profile.weeklyActivity),
                dailyGoalMinutes: profile.dailyGoalMinutes
              }
            : null;
        })()
      : await this.recordLearnerStageActivity({
          userId: input.userId,
          xpEarned: stageXpEarned,
          minutesSpent: stageMinutesSpent
        });

    return {
      lessonId: lesson.id,
      currentStageIndex: updated.currentStageIndex,
      progressPercent: updated.progressPercent,
      status: updated.status,
      stageProgress: updated.stageProgress,
      learnerStats
    };
  }

  async completeLesson(input: {
    userId: string;
    lessonId: string;
    xpEarned?: number;
    minutesSpent?: number;
  }) {
    const lesson = await this.lessons.findById(input.lessonId);
    if (!lesson || lesson.status !== "published") return "lesson_not_found" as const;

    const progress = await this.ensureProgress(input.userId, lesson);
    const wasCompleted = progress.status === "completed";

    const stepProgress = progress.stepProgress.map((step) => ({ ...step, status: "completed" as const }));
    const xpEarned = Math.max(progress.xpEarned, Number(input.xpEarned) || 50);

    const syncedProgress = syncStageProgress(lesson, progress);
    const stageProgress = syncedProgress.stageProgress.map((stage) => ({
      ...stage,
      status: "completed" as const,
      completedAt: stage.completedAt || new Date()
    }));

    const updatedProgress = await this.progress.updateById(progress.id, {
      stepProgress,
      stageProgress,
      currentStageIndex: 0,
      status: "completed",
      progressPercent: 100,
      xpEarned,
      startedAt: progress.startedAt || new Date(),
      completedAt: new Date()
    });

    if (!updatedProgress) return "lesson_not_found" as const;

    let learnerStats: {
      totalXp: number;
      currentStreak: number;
      longestStreak: number;
      todayMinutes: number;
      dailyGoalMinutes: number;
    } | null = null;

    const profile = await this.learnerProfiles.findByUserId(input.userId);
    if (profile && !wasCompleted) {
      const achievements = [...profile.achievements];
      if (!achievements.includes("First Step")) {
        achievements.push("First Step");
      }

      const updatedProfile = await this.learnerProfiles.updateByUserId(input.userId, {
        completedLessonsCount: profile.completedLessonsCount + 1,
        achievements
      });

      if (updatedProfile) {
        learnerStats = {
          totalXp: updatedProfile.totalXp,
          currentStreak: updatedProfile.currentStreak,
          longestStreak: updatedProfile.longestStreak,
          todayMinutes: getTodayMinutes(updatedProfile.weeklyActivity),
          dailyGoalMinutes: updatedProfile.dailyGoalMinutes
        };
      }
    } else if (profile) {
      learnerStats = {
        totalXp: profile.totalXp,
        currentStreak: profile.currentStreak,
        longestStreak: profile.longestStreak,
        todayMinutes: getTodayMinutes(profile.weeklyActivity),
        dailyGoalMinutes: profile.dailyGoalMinutes
      };
    }

    return {
      lessonId: lesson.id,
      xpEarned: updatedProgress.xpEarned,
      progressPercent: updatedProgress.progressPercent,
      status: updatedProgress.status,
      learnerStats
    };
  }

  async getLessonExpressions(lessonId: string): Promise<LessonDisplayContent[] | null> {
    const lesson = await this.lessons.findById(lessonId);
    if (!lesson || lesson.status !== "published") return null;

    const lessonBlocks = getLessonBlocks(lesson);
    const manualContentRefs = lessonBlocks
      .filter((b): b is Extract<LessonEntity["stages"][number]["blocks"][number], { type: "content" }> => b.type === "content")
      .map((b) => ({ type: b.contentType, id: b.refId }));
    const questionIds = lessonBlocks
      .filter((b) => b.type === "question")
      .map((b) => (b.type === "question" ? b.refId : ""));
    const questions = questionIds.length ? await Promise.all(questionIds.map((id) => this.questions.findById(id))) : [];
    const referencedContentRefs = questions
      .filter(Boolean)
      .flatMap((q) => {
        const refs: Array<{ type: ContentType; id: string }> = [];
        const primary = getQuestionSourceRef(q!);
        if (primary) refs.push(primary);
        if (Array.isArray(q!.relatedSourceRefs)) refs.push(...q!.relatedSourceRefs);
        if (Array.isArray(q!.interactionData?.matchingPairs)) {
          for (const pair of q!.interactionData.matchingPairs) {
            if (pair.contentType && pair.contentId) refs.push({ type: pair.contentType, id: pair.contentId });
          }
        }
        return refs;
      });

    const selectedIndexByContentKey = new Map<string, number>();
    const contentOrderMap = buildContentOrderMap(lessonBlocks);
    for (const block of lessonBlocks) {
      if (block.type === "content") {
        const key = `${block.contentType}:${block.refId}`;
        const index = Number(block.translationIndex ?? 0);
        if (!selectedIndexByContentKey.has(key)) {
          selectedIndexByContentKey.set(key, Number.isInteger(index) && index >= 0 ? index : 0);
        }
      }
    }
    for (const question of questions.filter(Boolean)) {
      const primary = getQuestionSourceRef(question!);
      if (primary) {
        const key = `${primary.type}:${primary.id}`;
        if (!selectedIndexByContentKey.has(key)) {
          selectedIndexByContentKey.set(key, question!.translationIndex);
        }
      }
    }

    const [resolvedContentMap] = await Promise.all([
      this.contentLookup.findMany([...manualContentRefs, ...referencedContentRefs])
    ]);

    const contentItems = Array.from(resolvedContentMap.values()).map((item) => {
      const key = `${item.kind}:${item.id}`;
      return {
        order: contentOrderMap.get(key) ?? Number.MAX_SAFE_INTEGER,
        createdAt: item.createdAt,
        value: toDisplayContent(item, selectedIndexByContentKey.get(key) ?? 0)
      };
    });

    return contentItems
      .sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return a.createdAt.getTime() - b.createdAt.getTime();
      })
      .map((item) => item.value);
  }

  async getLessonQuestions(lessonId: string, type: QuestionEntity["type"]) {
    const lesson = await this.lessons.findById(lessonId);
    if (!lesson || lesson.status !== "published") return null;

    const lessonBlocks = getLessonBlocks(lesson);
    const contentTranslationIndexMap = buildContentTranslationIndexMap(lessonBlocks);
    const questionOrderMap = buildQuestionOrderMap(lessonBlocks);
    const questions = await this.questions.list({ lessonId, type, status: "published" });
    const contentRefs = questions
      .map((q) => getQuestionSourceRef(q))
      .filter((item): item is { type: ContentType; id: string } => Boolean(item));
    const resolvedContentMap = await this.contentLookup.findMany(contentRefs);

    const mapped = questions
      .sort((a, b) => {
        const orderA = questionOrderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const orderB = questionOrderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;
        return a.createdAt.getTime() - b.createdAt.getTime();
      })
      .map((q) => {
        const sourceRef = getQuestionSourceRef(q);
        const content = sourceRef ? resolvedContentMap.get(`${sourceRef.type}:${sourceRef.id}`) || null : null;
        const displayEntity = content;
        if (!displayEntity || !sourceRef) return null;
        const selectedTranslationIndex = contentTranslationIndexMap.get(`${sourceRef.type}:${sourceRef.id}`) ?? q.translationIndex;
        const selectedTranslation = getTranslationByIndex(displayEntity.translations, selectedTranslationIndex);
        const review = buildReviewFallback({
          source: {
            text: displayEntity.text,
            translation: selectedTranslation
          },
          reviewData: q.reviewData
        });
        const prompt = String(q.promptTemplate || "")
          .replace(/\{phrase\}/g, String(displayEntity.text || ""))
          .replace(/\{meaning\}/g, review.meaning)
          .replace(/\{sentence\}/g, review.sentence);

        return {
          id: q.id,
          source: toDisplayContent(displayEntity, selectedTranslationIndex),
          prompt,
          options: q.options,
          correctIndex: q.correctIndex,
          explanation: q.explanation,
          type: q.type,
          subtype: q.subtype,
          reviewData: q.reviewData,
          interactionData: review
        };
      })
      .filter(Boolean);

    return mapped;
  }

  async getLessonReviewExercises(lessonId: string) {
    const lesson = await this.lessons.findById(lessonId);
    if (!lesson || lesson.status !== "published") return null;

    const lessonBlocks = getLessonBlocks(lesson);
    const contentTranslationIndexMap = buildContentTranslationIndexMap(lessonBlocks);
    const questionOrderMap = buildQuestionOrderMap(lessonBlocks);
    const questions = await this.questions.list({ lessonId, type: "fill-in-the-gap", status: "published" });
    const contentRefs = questions
      .map((q) => getQuestionSourceRef(q))
      .filter((item): item is { type: ContentType; id: string } => Boolean(item));
    const resolvedContentMap = await this.contentLookup.findMany(contentRefs);

    return questions
      .sort((a, b) => {
        const orderA = questionOrderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const orderB = questionOrderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;
        return a.createdAt.getTime() - b.createdAt.getTime();
      })
      .map((q) => {
        const sourceRef = getQuestionSourceRef(q);
        const content = sourceRef ? resolvedContentMap.get(`${sourceRef.type}:${sourceRef.id}`) || null : null;
        const displayEntity = content;
        if (!displayEntity || !sourceRef) return null;
        const selectedTranslationIndex = contentTranslationIndexMap.get(`${sourceRef.type}:${sourceRef.id}`) ?? q.translationIndex;
        const selectedTranslation = getTranslationByIndex(displayEntity.translations, selectedTranslationIndex);

        const review = buildReviewFallback({
          source: {
            text: displayEntity.text,
            translation: selectedTranslation
          },
          reviewData: q.reviewData
        });

        return {
          id: q.id,
          prompt: String(q.promptTemplate || "")
            .replace(/\{phrase\}/g, String(displayEntity.text || ""))
            .replace(/\{meaning\}/g, review.meaning)
            .replace(/\{sentence\}/g, review.sentence),
          sentence: review.sentence,
          words: review.words,
          correctOrder: review.correctOrder,
          meaning: review.meaning,
          source: toDisplayContent(displayEntity, selectedTranslationIndex)
        };
      })
      .filter(Boolean);
  }
}
