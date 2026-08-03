import "dotenv/config";
import mongoose from "mongoose";
import LessonModel from "../models/Lesson.js";
import SentenceModel from "../models/Sentence.js";
import WordModel from "../models/Word.js";
import ExpressionModel from "../models/Expression.js";
import LessonContentItemModel from "../models/LessonContentItem.js";
import UnitContentItemModel from "../models/UnitContentItem.js";
import ExerciseQuestionModel from "../models/ExerciseQuestion.js";
import ProverbModel from "../models/Proverb.js";

// Hard-deletes content created within a single local calendar day (default: today).
// Targets the four collections requested (lessons, sentences, words, expressions) and,
// with --include-related, the join/exercise records created the same day so nothing is
// left dangling. Units are intentionally NOT touched. Dry-run by default.
//
//   Dry run (default):
//     node --enable-source-maps --import tsx src/scripts/hardDeleteGeneratedToday.ts
//   Execute:
//     DELETE_TODAY_CONFIRM=delete-today node --enable-source-maps --import tsx \
//       src/scripts/hardDeleteGeneratedToday.ts --execute --include-related
//   Options: --yesterday  --date=YYYY-MM-DD  --language=yoruba  --include-related
//   (--date wins over --yesterday; both override the default of today)

const CONFIRM_VALUE = "delete-today";

function hasFlag(name: string) {
  return process.argv.includes(name);
}

function getArgValue(name: string) {
  const prefix = `${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : "";
}

// Build a [start, end) window covering one local calendar day. Mongo stores createdAt in
// UTC; JS Date objects created from local parts represent the correct UTC instants, so the
// comparison lands exactly on the intended local day.
function localDayWindow(dateStr: string) {
  let year: number;
  let month: number;
  let day: number;
  if (dateStr) {
    const parts = dateStr.split("-").map((value) => Number(value));
    if (parts.length !== 3 || parts.some((value) => !Number.isFinite(value))) {
      throw new Error(`Invalid --date "${dateStr}". Use YYYY-MM-DD.`);
    }
    [year, month, day] = parts;
  } else {
    const now = new Date();
    year = now.getFullYear();
    month = now.getMonth() + 1;
    day = now.getDate();
  }
  const start = new Date(year, month - 1, day, 0, 0, 0, 0);
  const end = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
  return { start, end };
}

async function count(model: mongoose.Model<any>, filter: Record<string, unknown>) {
  return model.countDocuments(filter);
}

async function deleteMany(model: mongoose.Model<any>, filter: Record<string, unknown>, dryRun: boolean) {
  if (dryRun) return count(model, filter);
  const result = await model.deleteMany(filter);
  return result.deletedCount || 0;
}

function printJson(label: string, value: unknown) {
  console.log(`[HARD_DELETE_TODAY] ${label}`, JSON.stringify(value, null, 2));
}

async function main() {
  const mongoUri = process.env.MONGODB_URI || "";
  if (!mongoUri) throw new Error("Missing MONGODB_URI");

  const execute = hasFlag("--execute");
  const dryRun = !execute;
  const includeRelated = hasFlag("--include-related");
  const language = getArgValue("--language").trim().toLowerCase();
  // Resolve which local calendar day to target: explicit --date wins, then --yesterday,
  // otherwise today. --yesterday is convenience for cleaning up a previous day's run.
  let resolvedDate = getArgValue("--date").trim();
  if (!resolvedDate && hasFlag("--yesterday")) {
    const now = new Date();
    const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    resolvedDate = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`;
  }
  const { start, end } = localDayWindow(resolvedDate);

  if (execute && process.env.DELETE_TODAY_CONFIRM !== CONFIRM_VALUE) {
    throw new Error(`Refusing to execute. Set DELETE_TODAY_CONFIRM=${CONFIRM_VALUE} and pass --execute.`);
  }

  await mongoose.connect(mongoUri);

  const dateWindow = { createdAt: { $gte: start, $lt: end } };
  // The four requested collections carry a `language` field, so honor --language when given.
  const scoped = language ? { ...dateWindow, language } : dateWindow;

  const filters = {
    lessons: scoped,
    sentences: scoped,
    words: scoped,
    expressions: scoped
  };
  // Related records are keyed by ref ids, not language, so they are scoped by date only.
  const relatedFilters = {
    lessonContentItems: dateWindow,
    unitContentItems: dateWindow,
    questions: dateWindow,
    proverbs: scoped
  };

  const [lessonSample, sentenceSample] = await Promise.all([
    LessonModel.find(filters.lessons).select("_id title language unitId createdAt").sort({ createdAt: -1 }).limit(8).lean(),
    SentenceModel.find(filters.sentences).select("_id text language createdAt").sort({ createdAt: -1 }).limit(8).lean()
  ]);

  printJson("window", {
    dryRun,
    date: start.toISOString().slice(0, 10),
    startLocal: start.toString(),
    endLocal: end.toString(),
    language: language || "(all)",
    includeRelated
  });
  printJson("sampleLessons", lessonSample.map((item) => ({ id: String(item._id), title: item.title, unitId: String(item.unitId || "") })));
  printJson("sampleSentences", sentenceSample.map((item) => ({ id: String(item._id), text: item.text })));

  const plannedCounts: Record<string, number> = {
    lessons: await count(LessonModel, filters.lessons),
    sentences: await count(SentenceModel, filters.sentences),
    words: await count(WordModel, filters.words),
    expressions: await count(ExpressionModel, filters.expressions)
  };
  const relatedCounts: Record<string, number> = {
    lessonContentItems: await count(LessonContentItemModel, relatedFilters.lessonContentItems),
    unitContentItems: await count(UnitContentItemModel, relatedFilters.unitContentItems),
    questions: await count(ExerciseQuestionModel, relatedFilters.questions),
    proverbs: await count(ProverbModel, relatedFilters.proverbs)
  };
  printJson("plannedCounts", plannedCounts);
  printJson(includeRelated ? "relatedCounts (WILL be deleted)" : "relatedCounts (FYI only, pass --include-related to remove)", relatedCounts);

  if (dryRun) {
    console.log(
      `[HARD_DELETE_TODAY] dry run only. To execute: DELETE_TODAY_CONFIRM=${CONFIRM_VALUE} ` +
        `node --enable-source-maps --import tsx src/scripts/hardDeleteGeneratedToday.ts --execute` +
        `${includeRelated ? " --include-related" : ""}${language ? ` --language=${language}` : ""}` +
        `${resolvedDate ? ` --date=${resolvedDate}` : ""}`
    );
    return;
  }

  const deletedCounts: Record<string, number> = {
    lessons: await deleteMany(LessonModel, filters.lessons, dryRun),
    sentences: await deleteMany(SentenceModel, filters.sentences, dryRun),
    words: await deleteMany(WordModel, filters.words, dryRun),
    expressions: await deleteMany(ExpressionModel, filters.expressions, dryRun)
  };
  if (includeRelated) {
    deletedCounts.lessonContentItems = await deleteMany(LessonContentItemModel, relatedFilters.lessonContentItems, dryRun);
    deletedCounts.unitContentItems = await deleteMany(UnitContentItemModel, relatedFilters.unitContentItems, dryRun);
    deletedCounts.questions = await deleteMany(ExerciseQuestionModel, relatedFilters.questions, dryRun);
    deletedCounts.proverbs = await deleteMany(ProverbModel, relatedFilters.proverbs, dryRun);
  }
  printJson("deletedCounts", deletedCounts);
}

main()
  .catch((error) => {
    console.error("[HARD_DELETE_TODAY] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
