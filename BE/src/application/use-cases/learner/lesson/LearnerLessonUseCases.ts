import type { LessonEntity } from "../../../../domain/entities/Lesson.js";
import type { PhraseEntity } from "../../../../domain/entities/Phrase.js";
import type { QuestionEntity } from "../../../../domain/entities/Question.js";
import type { LessonRepository } from "../../../../domain/repositories/LessonRepository.js";
import type { PhraseRepository } from "../../../../domain/repositories/PhraseRepository.js";
import type { ProverbRepository } from "../../../../domain/repositories/ProverbRepository.js";
import type { QuestionRepository } from "../../../../domain/repositories/QuestionRepository.js";
import type { LearnerProfileRepository } from "../../../../domain/repositories/LearnerProfileRepository.js";
import type { UnitRepository } from "../../../../domain/repositories/UnitRepository.js";
import type {
  LessonProgressEntity,
  LessonStageProgressEntity,
  LessonStepProgressEntity
} from "../../../../domain/entities/LessonProgress.js";
import type { LessonProgressRepository } from "../../../../domain/repositories/LessonProgressRepository.js";

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
  phraseId?: string;
  translationIndex?: number;
  image?: {
    imageAssetId?: string;
    url: string;
    thumbnailUrl?: string;
    altText: string;
  } | null;
};

type LessonPhraseView = PhraseEntity & {
  selectedTranslation: string;
  selectedTranslationIndex: number;
};

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
  phrase?: { text: string; translation: string };
  reviewData?: QuestionEntity["reviewData"];
}) {
  const sentence = String(question.reviewData?.sentence || question.phrase?.text || "").trim();
  const meaning = String(question.reviewData?.meaning || question.phrase?.translation || "").trim();
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
    label: pair.phraseText,
    phraseId: pair.phraseId,
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

function buildPhraseTranslationIndexMap(lessonBlocks: LessonEntity["stages"][number]["blocks"]) {
  const translationIndexMap = new Map<string, number>();
  for (const block of lessonBlocks) {
    if (block.type !== "phrase") continue;
    if (!translationIndexMap.has(block.refId)) {
      translationIndexMap.set(block.refId, block.translationIndex ?? 0);
    }
  }
  return translationIndexMap;
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

function buildPhraseOrderMap(lessonBlocks: LessonEntity["stages"][number]["blocks"]) {
  const orderMap = new Map<string, number>();
  let cursor = 0;
  for (const block of lessonBlocks) {
    if (block.type === "phrase" && !orderMap.has(block.refId)) {
      orderMap.set(block.refId, cursor);
    }
    cursor += 1;
  }
  return orderMap;
}

export class LearnerLessonUseCases {
  constructor(
    private readonly lessons: LessonRepository,
    private readonly units: UnitRepository,
    private readonly phrases: PhraseRepository,
    private readonly proverbs: ProverbRepository,
    private readonly questions: QuestionRepository,
    private readonly progress: LessonProgressRepository,
    private readonly learnerProfiles: LearnerProfileRepository
  ) {}

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

  async getLessonFlow(userId: string, lessonId: string) {
    const lesson = await this.lessons.findById(lessonId);
    if (!lesson || lesson.status !== "published") return null;

    const progress = await this.ensureProgress(userId, lesson);
    const syncedProgress = syncStageProgress(lesson, progress);

    // 1. Identify all question/proverb/phrase refs in the blocks
    const lessonBlocks = getLessonBlocks(lesson);
    const phraseTranslationIndexMap = buildPhraseTranslationIndexMap(lessonBlocks);
    const questionIds = lessonBlocks
      .filter((b) => b.type === "question")
      .map((b) => (b.type === "question" ? b.refId : ""))
      .filter(Boolean);
    const proverbIds = lessonBlocks
      .filter((b) => b.type === "proverb")
      .map((b) => (b.type === "proverb" ? b.refId : ""))
      .filter(Boolean);
    const manualPhraseIds = lessonBlocks
      .filter((b) => b.type === "phrase")
      .map((b) => (b.type === "phrase" ? b.refId : ""))
      .filter(Boolean);

    // 2. Fetch questions and proverbs first to see what phrases they reference
    const [questions, proverbs] = await Promise.all([
      questionIds.length ? Promise.all(questionIds.map((id) => this.questions.findById(id))) : Promise.resolve([]),
      proverbIds.length ? Promise.all(proverbIds.map((id) => this.proverbs.findById(id))) : Promise.resolve([])
    ]);

    const questionMap = new Map(questions.filter(Boolean).map(q => [q!.id, q!]));
    const proverbMap = new Map(proverbs.filter(Boolean).map(p => [p!.id, p!]));

    // 3. Collect ALL phrase IDs (those from phrase blocks + those referenced by questions)
    const referencedPhraseIds = questions
      .filter(Boolean)
      .flatMap((question) => {
        const value = question!;
        return [
          value.phraseId,
          ...(Array.isArray(value.relatedPhraseIds) ? value.relatedPhraseIds : []),
          ...(Array.isArray(value.interactionData?.matchingPairs)
            ? value.interactionData.matchingPairs.map((pair) => pair.phraseId)
            : [])
        ];
      });
    const allPhraseIds = Array.from(new Set([...manualPhraseIds, ...referencedPhraseIds]));

    // 4. Fetch all phrases
    const phrases = allPhraseIds.length ? await this.phrases.findByIds(allPhraseIds) : [];
    const phraseMap = new Map(phrases.map(p => [p.id, p]));

    // 5. Populate blocks with full data
    const populatedBlocks = lessonBlocks.map((block) => {
      if (block.type === "text") return block;

      const refId = block.refId;
      if (block.type === "phrase") {
        const data = phraseMap.get(refId);
        if (!data) return null;
        const selectedTranslation = getTranslationByIndex(data.translations, block.translationIndex);
        return {
          ...block,
          data: {
            ...data,
            selectedTranslation,
            selectedTranslationIndex: block.translationIndex ?? 0
          }
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

          return {
            ...block,
            data: {
              ...q,
              prompt: String(q.promptTemplate || ""),
              phrase: null,
              interactionData: matchingInteractionData
            }
          };
        }

        const phrase = phraseMap.get(q.phraseId) || null;
        const selectedTranslationIndex = phrase
          ? (phraseTranslationIndexMap.get(phrase.id) ?? q.translationIndex ?? 0)
          : 0;
        const selectedTranslation = phrase
          ? getTranslationByIndex(phrase.translations, selectedTranslationIndex)
          : "";
        const interactionData =
          q.type === "fill-in-the-gap" || q.subtype.includes("fg-") || q.subtype.includes("missing-word")
            ? buildReviewFallback({
                phrase: phrase ? { text: phrase.text, translation: selectedTranslation } : undefined,
                reviewData: q.reviewData
              })
            : undefined;
        const meaning = interactionData?.meaning || selectedTranslation;
        const sentence = interactionData?.sentence || "";
        const prompt = String(q.promptTemplate || "")
          .replace(/\{phrase\}/g, phrase?.text || "")
          .replace(/\{meaning\}/g, meaning)
          .replace(/\{sentence\}/g, sentence);

        return {
          ...block,
          data: {
            ...q,
            prompt,
            phrase: phrase
              ? {
                  ...phrase,
                  selectedTranslation,
                  selectedTranslationIndex
                }
              : null,
            interactionData
          }
        };
      }
      return null;
    }).filter(Boolean);

    return {
      lesson,
      blocks: populatedBlocks,
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

  async getLessonPhrases(lessonId: string): Promise<LessonPhraseView[] | null> {
    const lesson = await this.lessons.findById(lessonId);
    if (!lesson || lesson.status !== "published") return null;

    // 1. Get phrases manually added to lessonId
    const lessonPhrases = await this.phrases.list({ lessonId, status: "published" });

    // 2. Get phrases referenced in questions within the block flow
    const lessonBlocks = getLessonBlocks(lesson);
    const questionIds = lessonBlocks
      .filter((b) => b.type === "question")
      .map((b) => (b.type === "question" ? b.refId : ""));
    
    let referencedPhrases: PhraseEntity[] = [];
    if (questionIds.length > 0) {
      const questions = await Promise.all(questionIds.map((id) => this.questions.findById(id)));
      const phraseIds = questions.filter(Boolean).map((q) => q!.phraseId);
      if (phraseIds.length > 0) {
        referencedPhrases = await this.phrases.findByIds(phraseIds);
      }
    }

    const selectedIndexByPhraseId = new Map<string, number>();
    const phraseOrderMap = buildPhraseOrderMap(lessonBlocks);
    for (const block of lessonBlocks) {
      if (block.type === "phrase") {
        const index = Number(block.translationIndex ?? 0);
        if (!selectedIndexByPhraseId.has(block.refId)) {
          selectedIndexByPhraseId.set(block.refId, Number.isInteger(index) && index >= 0 ? index : 0);
        }
      }
    }
    for (const questionId of questionIds) {
      const question = await this.questions.findById(String(questionId));
      if (question && !selectedIndexByPhraseId.has(question.phraseId)) {
        selectedIndexByPhraseId.set(question.phraseId, question.translationIndex);
      }
    }

    // 3. Merge and unique
    const allPhrases = [...lessonPhrases, ...referencedPhrases];
    const uniqueMap = new Map(allPhrases.map(p => [p.id, p]));

    return Array.from(uniqueMap.values())
      .sort((a, b) => {
        const orderA = phraseOrderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const orderB = phraseOrderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;
        return a.createdAt.getTime() - b.createdAt.getTime();
      })
      .map((phrase) => {
        const selectedTranslationIndex = selectedIndexByPhraseId.get(phrase.id) ?? 0;
        return {
          ...phrase,
          selectedTranslationIndex,
          selectedTranslation: getTranslationByIndex(phrase.translations, selectedTranslationIndex)
        };
      });
  }

  async getLessonQuestions(lessonId: string, type: QuestionEntity["type"]) {
    const lesson = await this.lessons.findById(lessonId);
    if (!lesson || lesson.status !== "published") return null;

    const lessonBlocks = getLessonBlocks(lesson);
    const phraseTranslationIndexMap = buildPhraseTranslationIndexMap(lessonBlocks);
    const questionOrderMap = buildQuestionOrderMap(lessonBlocks);
    const questions = await this.questions.list({ lessonId, type, status: "published" });
    const phrases = await this.phrases.findByIds(questions.map((q) => q.phraseId));
    const phraseById = new Map(phrases.map((p) => [p.id, p]));

    const mapped = questions
      .sort((a, b) => {
        const orderA = questionOrderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const orderB = questionOrderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;
        return a.createdAt.getTime() - b.createdAt.getTime();
      })
      .map((q) => {
        const phrase = phraseById.get(q.phraseId);
        if (!phrase) return null;
        const selectedTranslationIndex = phraseTranslationIndexMap.get(phrase.id) ?? q.translationIndex;
        const selectedTranslation = getTranslationByIndex(phrase.translations, selectedTranslationIndex);
        const review = buildReviewFallback({
          phrase: {
            text: phrase.text,
            translation: selectedTranslation
          },
          reviewData: q.reviewData
        });
        const prompt = String(q.promptTemplate || "")
          .replace(/\{phrase\}/g, String(phrase.text || ""))
          .replace(/\{meaning\}/g, review.meaning)
          .replace(/\{sentence\}/g, review.sentence);

        return {
          id: q.id,
          phrase: {
            _id: phrase.id,
            text: phrase.text,
            selectedTranslation,
            selectedTranslationIndex,
            translations: phrase.translations,
            pronunciation: phrase.pronunciation,
            explanation: phrase.explanation,
            audio: phrase.audio
          },
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
    const phraseTranslationIndexMap = buildPhraseTranslationIndexMap(lessonBlocks);
    const questionOrderMap = buildQuestionOrderMap(lessonBlocks);
    const questions = await this.questions.list({ lessonId, type: "fill-in-the-gap", status: "published" });
    const phrases = await this.phrases.findByIds(questions.map((q) => q.phraseId));
    const phraseById = new Map(phrases.map((p) => [p.id, p]));

    return questions
      .sort((a, b) => {
        const orderA = questionOrderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const orderB = questionOrderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;
        return a.createdAt.getTime() - b.createdAt.getTime();
      })
      .map((q) => {
        const phrase = phraseById.get(q.phraseId);
        if (!phrase) return null;
        const selectedTranslationIndex = phraseTranslationIndexMap.get(phrase.id) ?? q.translationIndex;
        const selectedTranslation = getTranslationByIndex(phrase.translations, selectedTranslationIndex);

        const review = buildReviewFallback({
          phrase: {
            text: phrase.text,
            translation: selectedTranslation
          },
          reviewData: q.reviewData
        });

        return {
          id: q.id,
          prompt: String(q.promptTemplate || "")
            .replace(/\{phrase\}/g, String(phrase.text || ""))
            .replace(/\{meaning\}/g, review.meaning)
            .replace(/\{sentence\}/g, review.sentence),
          sentence: review.sentence,
          words: review.words,
          correctOrder: review.correctOrder,
          meaning: review.meaning,
          phrase: {
            _id: phrase.id,
            text: phrase.text,
            selectedTranslation,
            selectedTranslationIndex,
            translations: phrase.translations,
            pronunciation: phrase.pronunciation,
            explanation: phrase.explanation,
            audio: phrase.audio
          }
        };
      })
      .filter(Boolean);
  }
}
