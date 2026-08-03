import type {
  UnitAiPreviewPlanLesson,
  UnitAiPreviewPlanSummary,
  UnitAiRunSummary
} from "../../../../domain/entities/Unit.js";

/**
 * Normalizers for the two AI telemetry blobs stored as jsonb on `units`.
 *
 * Note the createdAt handling: in Mongo these were real Date objects, but jsonb
 * round-trips them as ISO strings. Both branches are handled, so the entity
 * always comes back with a Date regardless of which store produced the row.
 */

export function normalizeAiRun(value: unknown): UnitAiRunSummary | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  return {
    mode: String(input.mode || "generate") as UnitAiRunSummary["mode"],
    createdBy: String(input.createdBy || ""),
    createdAt:
      input.createdAt instanceof Date
        ? input.createdAt
        : new Date(String(input.createdAt || new Date().toISOString())),
    requestedLessons: Number(input.requestedLessons || 0),
    createdLessons: Number(input.createdLessons || 0),
    updatedLessons: input.updatedLessons == null ? undefined : Number(input.updatedLessons),
    clearedLessons: input.clearedLessons == null ? undefined : Number(input.clearedLessons),
    skippedLessons: Array.isArray(input.skippedLessons)
      ? input.skippedLessons.map((item) => {
          const row = item as Record<string, unknown>;
          return {
            reason: String(row.reason || ""),
            topic: row.topic ? String(row.topic) : undefined,
            title: row.title ? String(row.title) : undefined
          };
        })
      : [],
    lessonGenerationErrors: Array.isArray(input.lessonGenerationErrors)
      ? input.lessonGenerationErrors.map((item) => {
          const row = item as Record<string, unknown>;
          return {
            topic: row.topic ? String(row.topic) : undefined,
            error: String(row.error || "")
          };
        })
      : [],
    contentErrors: Array.isArray(input.contentErrors)
      ? input.contentErrors.map((item) => {
          const row = item as Record<string, unknown>;
          return {
            lessonId: row.lessonId ? String(row.lessonId) : undefined,
            title: row.title ? String(row.title) : undefined,
            error: String(row.error || "")
          };
        })
      : [],
    lessons: Array.isArray(input.lessons)
      ? input.lessons.map((item) => {
          const row = item as Record<string, unknown>;
          return {
            lessonId: String(row.lessonId || ""),
            title: String(row.title || ""),
            contentGenerated: Number(row.contentGenerated || 0),
            sentencesGenerated: Number(row.sentencesGenerated || 0),
            existingContentLinked: Number(row.existingContentLinked || 0),
            newContentSelected: Number(row.newContentSelected || 0),
            reviewContentSelected: Number(row.reviewContentSelected || 0),
            contentDroppedFromCandidates: Number(row.contentDroppedFromCandidates || 0),
            proverbsGenerated: Number(row.proverbsGenerated || 0),
            questionsGenerated: Number(row.questionsGenerated || 0),
            blocksGenerated: Number(row.blocksGenerated || 0)
          };
        })
      : []
  };
}

function normalizePreviewPlanLesson(value: unknown): UnitAiPreviewPlanLesson {
  const input = (value || {}) as Record<string, unknown>;
  const lessonMode = input.lessonMode === "core" || input.lessonMode === "review" ? input.lessonMode : undefined;
  const normalizeTargets = (targets: unknown) =>
    Array.isArray(targets)
      ? targets
          .map((target) => {
            const row = (target || {}) as Record<string, unknown>;
            const text = String(row.text || "").trim();
            if (!text) return null;
            return {
              text,
              translations: Array.isArray(row.translations)
                ? row.translations.map(String).map((item) => item.trim()).filter(Boolean)
                : []
            };
          })
          .filter((target): target is { text: string; translations: string[] } => Boolean(target))
      : [];
  return {
    title: String(input.title || ""),
    description: input.description ? String(input.description) : undefined,
    objectives: Array.isArray(input.objectives) ? input.objectives.map(String) : [],
    conversationGoal: String(input.conversationGoal || ""),
    situations: Array.isArray(input.situations) ? input.situations.map(String) : [],
    sentenceGoals: Array.isArray(input.sentenceGoals) ? input.sentenceGoals.map(String) : [],
    focusSummary: input.focusSummary ? String(input.focusSummary) : undefined,
    targetWords: normalizeTargets(input.targetWords),
    targetExpressions: normalizeTargets(input.targetExpressions),
    lessonMode,
    sourceCoreLessonIndexes: Array.isArray(input.sourceCoreLessonIndexes)
      ? input.sourceCoreLessonIndexes.map(Number).filter((item) => Number.isInteger(item) && item >= 0)
      : undefined,
    reviewSourceLessonIds: Array.isArray(input.reviewSourceLessonIds)
      ? input.reviewSourceLessonIds.map(String).filter(Boolean)
      : undefined,
    reviewAnchorSentenceIds: Array.isArray(input.reviewAnchorSentenceIds)
      ? input.reviewAnchorSentenceIds.map(String).filter(Boolean)
      : undefined
  };
}

export function normalizeAiPreviewPlan(value: unknown): UnitAiPreviewPlanSummary | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const settings = (input.settings || {}) as Record<string, unknown>;
  const mode = input.mode === "regenerate" ? "regenerate" : "generate";
  return {
    mode,
    createdBy: String(input.createdBy || ""),
    createdAt:
      input.createdAt instanceof Date
        ? input.createdAt
        : new Date(String(input.createdAt || new Date().toISOString())),
    requestedLessons: Number(input.requestedLessons || 0),
    actualLessonCount: Number(input.actualLessonCount || 0),
    settings: {
      lessonCount: Number(settings.lessonCount || input.requestedLessons || 0),
      sentencesPerLesson: Number(settings.sentencesPerLesson || 0),
      reviewContentPerLesson:
        settings.reviewContentPerLesson == null ? undefined : Number(settings.reviewContentPerLesson),
      proverbsPerLesson: Number(settings.proverbsPerLesson || 0),
      topics: Array.isArray(settings.topics) ? settings.topics.map(String).filter(Boolean) : undefined,
      extraInstructions: settings.extraInstructions ? String(settings.extraInstructions) : undefined
    },
    coreLessons: Array.isArray(input.coreLessons) ? input.coreLessons.map(normalizePreviewPlanLesson) : [],
    lessonSequence: Array.isArray(input.lessonSequence) ? input.lessonSequence.map(normalizePreviewPlanLesson) : []
  };
}
