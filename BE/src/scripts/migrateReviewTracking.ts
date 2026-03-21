import "dotenv/config";
import mongoose from "mongoose";
import UnitModel from "../models/Unit.js";
import LessonModel from "../models/Lesson.js";
import LessonContentItemModel from "../models/LessonContentItem.js";
import ExerciseQuestionModel from "../models/ExerciseQuestion.js";
import LessonProgressModel from "../models/learner/LessonProgress.js";
import LearnerContentPerformanceModel from "../models/learner/LearnerContentPerformance.js";

type Language = "yoruba" | "igbo" | "hausa";
type ContentType = "word" | "expression" | "sentence";
type LessonKind = "core" | "review";

type ScriptOptions = {
  apply: boolean;
  seedExposures: boolean;
  includeInProgress: boolean;
};

type UnitLean = {
  _id: unknown;
  kind?: "core" | "review";
};

type LessonLean = {
  _id: unknown;
  unitId: unknown;
  language: Language;
  title?: string;
  kind?: LessonKind;
  orderIndex?: number;
  createdAt?: Date;
  isDeleted?: boolean;
};

type LessonContentItemLean = {
  lessonId: unknown;
  contentType: ContentType;
  contentId: unknown;
};

type QuestionLean = {
  lessonId: unknown;
  sourceType?: ContentType | null;
  sourceId?: unknown;
  relatedSourceRefs?: Array<{ type: ContentType; id: unknown }>;
  interactionData?: {
    matchingPairs?: Array<{
      contentType?: ContentType | null;
      contentId?: unknown;
    }>;
  };
};

type LessonProgressLean = {
  userId: unknown;
  lessonId: unknown;
  status: "not_started" | "in_progress" | "completed";
  updatedAt?: Date;
  completedAt?: Date;
};

type ExposureAggregate = {
  userId: string;
  language: Language;
  contentType: ContentType;
  contentId: string;
  exposureCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  lastLessonId: string;
  seenLessonIds: Set<string>;
};

function parseArgs(argv: string[]): ScriptOptions {
  const args = argv.filter((arg) => arg !== "--");
  return {
    apply: args.includes("--apply"),
    seedExposures: args.includes("--seed-exposures"),
    includeInProgress: args.includes("--include-in-progress")
  };
}

function normalize(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function isReviewTitle(title: unknown) {
  return /^review\b[:\s-]*/i.test(String(title || "").trim());
}

function toId(value: unknown) {
  return String(value);
}

function toDate(value: unknown, fallback: Date) {
  return value instanceof Date ? value : fallback;
}

async function backfillLessonKinds(apply: boolean) {
  const [units, lessons] = await Promise.all([
    UnitModel.find({}, { kind: 1 }).lean<UnitLean[]>(),
    LessonModel.find({}, { unitId: 1, language: 1, title: 1, kind: 1, orderIndex: 1, createdAt: 1, isDeleted: 1 }).lean<LessonLean[]>()
  ]);

  const unitKindById = new Map(units.map((unit) => [toId(unit._id), unit.kind ?? "core"]));
  const updates: Array<{ id: string; from: string; to: LessonKind; title: string }> = [];
  let reviewByUnitKind = 0;
  let reviewByTitle = 0;
  let alreadyCorrect = 0;

  for (const lesson of lessons) {
    const unitKind = unitKindById.get(toId(lesson.unitId)) ?? "core";
    const targetKind: LessonKind = unitKind === "review" ? "review" : isReviewTitle(lesson.title) ? "review" : "core";
    const currentKind = lesson.kind ?? "core";

    if (targetKind === "review") {
      if (unitKind === "review") {
        reviewByUnitKind += 1;
      } else {
        reviewByTitle += 1;
      }
    }

    if (currentKind === targetKind) {
      alreadyCorrect += 1;
      continue;
    }

    updates.push({
      id: toId(lesson._id),
      from: currentKind || "(missing)",
      to: targetKind,
      title: String(lesson.title || "")
    });
  }

  if (apply && updates.length > 0) {
    await LessonModel.bulkWrite(
      updates.map((update) => ({
        updateOne: {
          filter: { _id: update.id },
          update: { $set: { kind: update.to } }
        }
      }))
    );
  }

  return {
    totalLessons: lessons.length,
    alreadyCorrect,
    updatesNeeded: updates.length,
    reviewByUnitKind,
    reviewByTitle,
    mode: apply ? "apply" : "dry-run",
    sampleUpdates: updates.slice(0, 20)
  };
}

function addLessonRef(
  lessonRefsByLessonId: Map<string, Map<string, { contentType: ContentType; contentId: string }>>,
  lessonId: string,
  contentType: ContentType | null | undefined,
  contentId: unknown
) {
  if (!contentType || !contentId) return;
  const key = `${contentType}:${toId(contentId)}`;
  let refs = lessonRefsByLessonId.get(lessonId);
  if (!refs) {
    refs = new Map();
    lessonRefsByLessonId.set(lessonId, refs);
  }
  refs.set(key, { contentType, contentId: toId(contentId) });
}

async function seedExposureOnlyPerformance(options: { apply: boolean; includeInProgress: boolean }) {
  const progressStatuses = options.includeInProgress ? ["completed", "in_progress"] : ["completed"];
  const progresses = await LessonProgressModel.find(
    { status: { $in: progressStatuses } },
    { userId: 1, lessonId: 1, status: 1, updatedAt: 1, completedAt: 1 }
  ).lean<LessonProgressLean[]>();

  const lessonIds = Array.from(new Set(progresses.map((progress) => toId(progress.lessonId))));
  if (lessonIds.length === 0) {
    return {
      mode: options.apply ? "apply" : "dry-run",
      includeInProgress: options.includeInProgress,
      progressRows: 0,
      lessonsWithSignals: 0,
      candidateRows: 0,
      insertedRows: 0,
      skippedExistingRows: 0
    };
  }

  const [lessons, lessonContentItems, questions] = await Promise.all([
    LessonModel.find({ _id: { $in: lessonIds } }, { language: 1, isDeleted: 1 }).lean<LessonLean[]>(),
    LessonContentItemModel.find(
      { lessonId: { $in: lessonIds } },
      { lessonId: 1, contentType: 1, contentId: 1 }
    ).lean<LessonContentItemLean[]>(),
    ExerciseQuestionModel.find(
      { lessonId: { $in: lessonIds }, isDeleted: false },
      { lessonId: 1, sourceType: 1, sourceId: 1, relatedSourceRefs: 1, interactionData: 1 }
    ).lean<QuestionLean[]>()
  ]);

  const lessonById = new Map(lessons.map((lesson) => [toId(lesson._id), lesson]));
  const lessonRefsByLessonId = new Map<string, Map<string, { contentType: ContentType; contentId: string }>>();

  for (const item of lessonContentItems) {
    addLessonRef(lessonRefsByLessonId, toId(item.lessonId), item.contentType, item.contentId);
  }

  for (const question of questions) {
    const lessonId = toId(question.lessonId);
    addLessonRef(lessonRefsByLessonId, lessonId, question.sourceType ?? undefined, question.sourceId);

    for (const related of question.relatedSourceRefs || []) {
      addLessonRef(lessonRefsByLessonId, lessonId, related.type, related.id);
    }

    for (const pair of question.interactionData?.matchingPairs || []) {
      addLessonRef(lessonRefsByLessonId, lessonId, pair.contentType ?? undefined, pair.contentId);
    }
  }

  const aggregates = new Map<string, ExposureAggregate>();
  const now = new Date();

  for (const progress of progresses) {
    const lessonId = toId(progress.lessonId);
    const lesson = lessonById.get(lessonId);
    const refs = lessonRefsByLessonId.get(lessonId);
    if (!lesson || lesson.isDeleted || !refs || refs.size === 0) continue;

    const seenAt = toDate(progress.completedAt ?? progress.updatedAt, now);
    for (const ref of refs.values()) {
      const aggregateKey = `${toId(progress.userId)}:${ref.contentType}:${ref.contentId}`;
      let aggregate = aggregates.get(aggregateKey);

      if (!aggregate) {
        aggregate = {
          userId: toId(progress.userId),
          language: lesson.language,
          contentType: ref.contentType,
          contentId: ref.contentId,
          exposureCount: 0,
          firstSeenAt: seenAt,
          lastSeenAt: seenAt,
          lastLessonId: lessonId,
          seenLessonIds: new Set<string>()
        };
        aggregates.set(aggregateKey, aggregate);
      }

      if (!aggregate.seenLessonIds.has(lessonId)) {
        aggregate.seenLessonIds.add(lessonId);
        aggregate.exposureCount += 1;
      }

      if (seenAt < aggregate.firstSeenAt) {
        aggregate.firstSeenAt = seenAt;
      }
      if (seenAt >= aggregate.lastSeenAt) {
        aggregate.lastSeenAt = seenAt;
        aggregate.lastLessonId = lessonId;
      }
    }
  }

  const rows = Array.from(aggregates.values());
  let insertedRows = 0;
  let skippedExistingRows = 0;

  if (options.apply && rows.length > 0) {
    const result = await LearnerContentPerformanceModel.bulkWrite(
      rows.map((row) => ({
        updateOne: {
          filter: {
            userId: row.userId,
            contentType: row.contentType,
            contentId: row.contentId
          },
          update: {
            $setOnInsert: {
              userId: row.userId,
              language: row.language,
              contentType: row.contentType,
              contentId: row.contentId,
              exposureCount: row.exposureCount,
              attemptCount: 0,
              correctCount: 0,
              wrongCount: 0,
              retryCount: 0,
              speakingFailureCount: 0,
              listeningFailureCount: 0,
              lastLessonId: row.lastLessonId,
              lastQuestionType: null,
              lastQuestionSubtype: null,
              firstSeenAt: row.firstSeenAt,
              lastSeenAt: row.lastSeenAt
            }
          },
          upsert: true
        }
      })) as any
    );

    insertedRows = result.upsertedCount ?? 0;
    skippedExistingRows = rows.length - insertedRows;
  }

  return {
    mode: options.apply ? "apply" : "dry-run",
    includeInProgress: options.includeInProgress,
    progressRows: progresses.length,
    lessonsWithSignals: lessonRefsByLessonId.size,
    candidateRows: rows.length,
    insertedRows,
    skippedExistingRows,
    sampleRows: rows.slice(0, 20).map((row) => ({
      userId: row.userId,
      language: row.language,
      contentType: row.contentType,
      contentId: row.contentId,
      exposureCount: row.exposureCount,
      lastLessonId: row.lastLessonId
    }))
  };
}

async function main() {
  const mongoUri = process.env.MONGODB_URI || "";
  if (!mongoUri) {
    console.error("Missing MONGODB_URI in environment variables");
    process.exit(1);
  }

  const options = parseArgs(process.argv.slice(2));
  await mongoose.connect(mongoUri);

  try {
    const lessonKindSummary = await backfillLessonKinds(options.apply);
    console.log("Lesson kind backfill");
    console.log(JSON.stringify(lessonKindSummary, null, 2));

    if (options.seedExposures) {
      const exposureSummary = await seedExposureOnlyPerformance({
        apply: options.apply,
        includeInProgress: options.includeInProgress
      });
      console.log("Exposure-only learner performance seed");
      console.log(JSON.stringify(exposureSummary, null, 2));
    } else {
      console.log("Exposure-only learner performance seed skipped. Re-run with --seed-exposures to include it.");
    }

    if (!options.apply) {
      console.log("Dry run only. Re-run with --apply to persist changes.");
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error("Failed to migrate review tracking:", error);
  process.exit(1);
});
