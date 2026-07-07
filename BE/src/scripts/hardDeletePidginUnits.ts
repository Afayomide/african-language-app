import "dotenv/config";
import mongoose, { Types } from "mongoose";
import UnitModel from "../models/Unit.js";
import LessonModel from "../models/Lesson.js";
import LessonContentItemModel from "../models/LessonContentItem.js";
import UnitContentItemModel from "../models/UnitContentItem.js";
import ExerciseQuestionModel from "../models/ExerciseQuestion.js";
import WordModel from "../models/Word.js";
import ExpressionModel from "../models/Expression.js";
import SentenceModel from "../models/Sentence.js";
import ProverbModel from "../models/Proverb.js";
import LessonProgressModel from "../models/learner/LessonProgress.js";
import LearnerQuestionMissModel from "../models/learner/LearnerQuestionMiss.js";
import LearnerContentPerformanceModel from "../models/learner/LearnerContentPerformance.js";
import VoiceAudioSubmissionModel from "../models/voice/VoiceAudioSubmission.js";
import ExpressionImageLinkModel from "../models/ExpressionImageLink.js";

const LANGUAGE = "pidgin";
const CONFIRM_VALUE = "delete-pidgin-units";

function hasFlag(name: string) {
  return process.argv.includes(name);
}

function getArgValue(name: string) {
  const prefix = `${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : "";
}

function objectIds(ids: string[]) {
  return ids.map((id) => new Types.ObjectId(id));
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
  console.log(`[HARD_DELETE_PIDGIN_UNITS] ${label}`, JSON.stringify(value, null, 2));
}

async function main() {
  const mongoUri = process.env.MONGODB_URI || "";
  if (!mongoUri) throw new Error("Missing MONGODB_URI");

  const execute = hasFlag("--execute");
  const dryRun = !execute;
  const includeSoftDeleted = hasFlag("--include-soft-deleted");
  const expectedUnitsRaw = getArgValue("--expected-units");
  const expectedUnits = expectedUnitsRaw ? Number(expectedUnitsRaw) : null;

  if (execute && process.env.DELETE_PIDGIN_UNITS_CONFIRM !== CONFIRM_VALUE) {
    throw new Error(`Refusing to execute. Set DELETE_PIDGIN_UNITS_CONFIRM=${CONFIRM_VALUE}.`);
  }

  await mongoose.connect(mongoUri);

  const unitFilter = includeSoftDeleted
    ? { language: LANGUAGE }
    : { language: LANGUAGE, isDeleted: { $ne: true } };
  const softDeletedUnitCount = await UnitModel.countDocuments({ language: LANGUAGE, isDeleted: true });
  const unitDocs = await UnitModel.find(unitFilter).select("_id title language isDeleted").lean();
  const unitIds = unitDocs.map((unit) => String(unit._id));
  if (expectedUnits !== null && unitIds.length !== expectedUnits) {
    throw new Error(`Expected ${expectedUnits} ${LANGUAGE} units, found ${unitIds.length}. Aborting.`);
  }

  const lessonDocs = unitIds.length > 0
    ? await LessonModel.find({ unitId: { $in: objectIds(unitIds) }, language: LANGUAGE }).select("_id title language unitId").lean()
    : [];
  const lessonIds = lessonDocs.map((lesson) => String(lesson._id));

  const lessonContentLinks = unitIds.length > 0 || lessonIds.length > 0
    ? await LessonContentItemModel.find({
        $or: [
          { unitId: { $in: objectIds(unitIds) } },
          { lessonId: { $in: objectIds(lessonIds) } }
        ]
      }).select("contentType contentId").lean()
    : [];
  const unitContentLinks = unitIds.length > 0
    ? await UnitContentItemModel.find({ unitId: { $in: objectIds(unitIds) } }).select("contentType contentId").lean()
    : [];
  const questionDocs = lessonIds.length > 0
    ? await ExerciseQuestionModel.find({ lessonId: { $in: objectIds(lessonIds) } })
        .select("_id sourceType sourceId relatedSourceRefs interactionData.matchingPairs")
        .lean()
    : [];

  const linkedContentIds = {
    word: new Set<string>(),
    expression: new Set<string>(),
    sentence: new Set<string>()
  };

  for (const link of [...lessonContentLinks, ...unitContentLinks]) {
    const type = String(link.contentType || "") as keyof typeof linkedContentIds;
    if (type in linkedContentIds && link.contentId) linkedContentIds[type].add(String(link.contentId));
  }

  for (const question of questionDocs) {
    const sourceType = String(question.sourceType || "") as keyof typeof linkedContentIds;
    if (sourceType in linkedContentIds && question.sourceId) linkedContentIds[sourceType].add(String(question.sourceId));
    for (const ref of Array.isArray(question.relatedSourceRefs) ? question.relatedSourceRefs : []) {
      const type = String(ref?.type || "") as keyof typeof linkedContentIds;
      if (type in linkedContentIds && ref?.id) linkedContentIds[type].add(String(ref.id));
    }
    const pairs = question.interactionData?.matchingPairs;
    for (const pair of Array.isArray(pairs) ? pairs : []) {
      const type = String(pair?.contentType || "") as keyof typeof linkedContentIds;
      if (type in linkedContentIds && pair?.contentId) linkedContentIds[type].add(String(pair.contentId));
    }
  }

  const linkedWordIds = Array.from(linkedContentIds.word);
  const linkedExpressionIds = Array.from(linkedContentIds.expression);
  const linkedSentenceIds = Array.from(linkedContentIds.sentence);

  const allPidginWordIds = (await WordModel.find({ language: LANGUAGE }).select("_id").lean()).map((item) => String(item._id));
  const allPidginExpressionIds = (await ExpressionModel.find({ language: LANGUAGE }).select("_id").lean()).map((item) => String(item._id));
  const allPidginSentenceIds = (await SentenceModel.find({ language: LANGUAGE }).select("_id").lean()).map((item) => String(item._id));
  const contentIds = {
    word: Array.from(new Set([...linkedWordIds, ...allPidginWordIds])),
    expression: Array.from(new Set([...linkedExpressionIds, ...allPidginExpressionIds])),
    sentence: Array.from(new Set([...linkedSentenceIds, ...allPidginSentenceIds]))
  };
  const allContentIds = [...contentIds.word, ...contentIds.expression, ...contentIds.sentence];

  const filters = {
    units: { _id: { $in: objectIds(unitIds) }, language: LANGUAGE },
    lessons: { _id: { $in: objectIds(lessonIds) }, unitId: { $in: objectIds(unitIds) }, language: LANGUAGE },
    lessonContentItems: {
      $or: [
        { unitId: { $in: objectIds(unitIds) } },
        { lessonId: { $in: objectIds(lessonIds) } }
      ]
    },
    unitContentItems: { unitId: { $in: objectIds(unitIds) } },
    questions: { lessonId: { $in: objectIds(lessonIds) } },
    lessonProgress: { lessonId: { $in: objectIds(lessonIds) } },
    learnerQuestionMisses: {
      $or: [
        { lessonId: { $in: objectIds(lessonIds) } },
        { questionId: { $in: questionDocs.map((question) => question._id) } }
      ]
    },
    learnerContentPerformance: {
      language: LANGUAGE,
      contentId: { $in: objectIds(allContentIds) }
    },
    voiceAudioSubmissions: {
      language: LANGUAGE,
      contentId: { $in: objectIds(allContentIds) }
    },
    expressionImageLinks: {
      expressionId: { $in: objectIds(contentIds.expression) }
    },
    words: { _id: { $in: objectIds(contentIds.word) }, language: LANGUAGE },
    expressions: { _id: { $in: objectIds(contentIds.expression) }, language: LANGUAGE },
    sentences: { _id: { $in: objectIds(contentIds.sentence) }, language: LANGUAGE },
    proverbs: {
      language: LANGUAGE,
      $or: [
        { lessonIds: { $in: objectIds(lessonIds) } },
        { deletedLessonIds: { $in: objectIds(lessonIds) } },
        { language: LANGUAGE }
      ]
    }
  };

  const summary = {
    dryRun,
    language: LANGUAGE,
    includeSoftDeleted,
    softDeletedUnitCount,
    unitCount: unitIds.length,
    lessonCount: lessonIds.length,
    linkedContentIds: {
      words: linkedWordIds.length,
      expressions: linkedExpressionIds.length,
      sentences: linkedSentenceIds.length
    },
    pidginContentIds: {
      words: allPidginWordIds.length,
      expressions: allPidginExpressionIds.length,
      sentences: allPidginSentenceIds.length
    },
    unitSample: unitDocs.slice(0, 8).map((unit) => ({ id: String(unit._id), title: unit.title }))
  };
  printJson("summary", summary);

  const plannedCounts = {
    learnerQuestionMisses: await count(LearnerQuestionMissModel, filters.learnerQuestionMisses),
    lessonProgress: await count(LessonProgressModel, filters.lessonProgress),
    learnerContentPerformance: await count(LearnerContentPerformanceModel, filters.learnerContentPerformance),
    voiceAudioSubmissions: await count(VoiceAudioSubmissionModel, filters.voiceAudioSubmissions),
    expressionImageLinks: await count(ExpressionImageLinkModel, filters.expressionImageLinks),
    questions: await count(ExerciseQuestionModel, filters.questions),
    proverbs: await count(ProverbModel, filters.proverbs),
    lessonContentItems: await count(LessonContentItemModel, filters.lessonContentItems),
    unitContentItems: await count(UnitContentItemModel, filters.unitContentItems),
    lessons: await count(LessonModel, filters.lessons),
    words: await count(WordModel, filters.words),
    expressions: await count(ExpressionModel, filters.expressions),
    sentences: await count(SentenceModel, filters.sentences),
    units: await count(UnitModel, filters.units)
  };
  printJson("plannedCounts", plannedCounts);

  if (dryRun) {
    console.log(`[HARD_DELETE_PIDGIN_UNITS] dry run only. To execute: DELETE_PIDGIN_UNITS_CONFIRM=${CONFIRM_VALUE} pnpm run db:hard-delete-pidgin-units -- --execute --expected-units=${unitIds.length}${includeSoftDeleted ? " --include-soft-deleted" : ""}`);
    return;
  }

  const deletedCounts = {
    learnerQuestionMisses: await deleteMany(LearnerQuestionMissModel, filters.learnerQuestionMisses, dryRun),
    lessonProgress: await deleteMany(LessonProgressModel, filters.lessonProgress, dryRun),
    learnerContentPerformance: await deleteMany(LearnerContentPerformanceModel, filters.learnerContentPerformance, dryRun),
    voiceAudioSubmissions: await deleteMany(VoiceAudioSubmissionModel, filters.voiceAudioSubmissions, dryRun),
    expressionImageLinks: await deleteMany(ExpressionImageLinkModel, filters.expressionImageLinks, dryRun),
    questions: await deleteMany(ExerciseQuestionModel, filters.questions, dryRun),
    proverbs: await deleteMany(ProverbModel, filters.proverbs, dryRun),
    lessonContentItems: await deleteMany(LessonContentItemModel, filters.lessonContentItems, dryRun),
    unitContentItems: await deleteMany(UnitContentItemModel, filters.unitContentItems, dryRun),
    lessons: await deleteMany(LessonModel, filters.lessons, dryRun),
    words: await deleteMany(WordModel, filters.words, dryRun),
    expressions: await deleteMany(ExpressionModel, filters.expressions, dryRun),
    sentences: await deleteMany(SentenceModel, filters.sentences, dryRun),
    units: await deleteMany(UnitModel, filters.units, dryRun)
  };
  printJson("deletedCounts", deletedCounts);

  const remaining = {
    units: await UnitModel.countDocuments({ language: LANGUAGE }),
    lessons: await LessonModel.countDocuments({ language: LANGUAGE }),
    words: await WordModel.countDocuments({ language: LANGUAGE }),
    expressions: await ExpressionModel.countDocuments({ language: LANGUAGE }),
    sentences: await SentenceModel.countDocuments({ language: LANGUAGE }),
    proverbs: await ProverbModel.countDocuments({ language: LANGUAGE })
  };
  printJson("remainingPidginCounts", remaining);
}

main()
  .catch((error) => {
    console.error("[HARD_DELETE_PIDGIN_UNITS] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
