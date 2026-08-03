import "dotenv/config";
import mongoose from "mongoose";

import ChapterModel from "../models/Chapter.js";
import CurriculumBuildArtifactModel from "../models/CurriculumBuildArtifact.js";
import CurriculumBuildJobModel from "../models/CurriculumBuildJob.js";
import ExerciseQuestionModel from "../models/ExerciseQuestion.js";
import ExpressionModel from "../models/Expression.js";
import ExpressionImageLinkModel from "../models/ExpressionImageLink.js";
import ImageAssetModel from "../models/ImageAsset.js";
import LanguageModel from "../models/Language.js";
import LessonModel from "../models/Lesson.js";
import LessonContentItemModel from "../models/LessonContentItem.js";
import ProverbModel from "../models/Proverb.js";
import SentenceModel from "../models/Sentence.js";
import UnitModel from "../models/Unit.js";
import UnitContentItemModel from "../models/UnitContentItem.js";
import UserModel from "../models/User.js";
import WordModel from "../models/Word.js";
import LearnerContentPerformanceModel from "../models/learner/LearnerContentPerformance.js";
import LearnerLanguageStateModel from "../models/learner/LearnerLanguageState.js";
import LearnerProfileModel from "../models/learner/LearnerProfile.js";
import LearnerQuestionMissModel from "../models/learner/LearnerQuestionMiss.js";
import LessonProgressModel from "../models/learner/LessonProgress.js";
import TutorProfileModel from "../models/tutor/TutorProfile.js";
import VoiceArtistProfileModel from "../models/voice/VoiceArtistProfile.js";
import VoiceAudioSubmissionModel from "../models/voice/VoiceAudioSubmission.js";

/**
 * READ-ONLY pre-flight for the Mongo -> Postgres migration.
 *
 * Reports anything that would make the Postgres insert fail:
 *   - values outside the five pgEnum types
 *   - NULLs in columns declared NOT NULL
 *   - rows that would violate a unique / partial-unique index
 *   - CHECK-constraint range violations
 * Writes nothing.
 */

const LANGUAGES = ["yoruba", "igbo", "hausa", "pidgin"];
const LEVELS = ["beginner", "intermediate", "advanced"];
const CONTENT_STATUS = ["draft", "finished", "published"];
const CONTENT_TYPES = ["word", "expression", "sentence"];
const LESSON_KINDS = ["core", "review"];

const problems: string[] = [];
function flag(msg: string) {
  problems.push(msg);
  console.log("  ISSUE  " + msg);
}

const MODELS: Array<[string, mongoose.Model<any>]> = [
  ["languages", LanguageModel],
  ["users", UserModel],
  ["chapters", ChapterModel],
  ["units", UnitModel],
  ["lessons", LessonModel],
  ["words", WordModel],
  ["expressions", ExpressionModel],
  ["sentences", SentenceModel],
  ["proverbs", ProverbModel],
  ["exercise_questions", ExerciseQuestionModel],
  ["lesson_content_items", LessonContentItemModel],
  ["unit_content_items", UnitContentItemModel],
  ["image_assets", ImageAssetModel],
  ["expression_image_links", ExpressionImageLinkModel],
  ["learner_profiles", LearnerProfileModel],
  ["learner_language_states", LearnerLanguageStateModel],
  ["learner_content_performance", LearnerContentPerformanceModel],
  ["learner_question_misses", LearnerQuestionMissModel],
  ["lesson_progress", LessonProgressModel],
  ["tutor_profiles", TutorProfileModel],
  ["voice_artist_profiles", VoiceArtistProfileModel],
  ["voice_audio_submissions", VoiceAudioSubmissionModel],
  ["curriculum_build_jobs", CurriculumBuildJobModel],
  ["curriculum_build_artifacts", CurriculumBuildArtifactModel]
];

async function checkEnum(model: mongoose.Model<any>, field: string, allowed: string[], label: string) {
  const values: unknown[] = await model.distinct(field);
  const bad = values.filter((v) => v !== null && v !== undefined && !allowed.includes(String(v)));
  if (bad.length > 0) {
    flag(`${label}.${field} has values outside the enum: ${JSON.stringify(bad)}`);
  }
}

async function checkRequired(model: mongoose.Model<any>, field: string, label: string) {
  const n = await model.countDocuments({ $or: [{ [field]: null }, { [field]: { $exists: false } }] } as any);
  if (n > 0) flag(`${label}.${field} is NULL/missing in ${n} doc(s) but is NOT NULL in Postgres`);
}

async function checkActiveTextDuplicates(model: mongoose.Model<any>, label: string) {
  const dupes = await model.aggregate([
    { $match: { isDeleted: { $ne: true } } },
    { $group: { _id: { language: "$language", textNormalized: "$textNormalized" }, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
    { $limit: 10 }
  ]);
  if (dupes.length > 0) {
    flag(
      `${label} has ${dupes.length}+ duplicate ACTIVE (language, textNormalized) groups — ` +
        `violates the partial unique index. e.g. ${JSON.stringify(dupes.slice(0, 3))}`
    );
  }
}

async function checkRange(model: mongoose.Model<any>, field: string, min: number, max: number, label: string) {
  const n = await model.countDocuments({
    $and: [{ [field]: { $ne: null } }, { $or: [{ [field]: { $lt: min } }, { [field]: { $gt: max } }] }]
  } as any);
  if (n > 0) flag(`${label}.${field} out of CHECK range [${min}..${max}] in ${n} doc(s)`);
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(uri);
  console.log("connected to mongo\n");

  console.log("=== collection counts ===");
  let grandTotal = 0;
  for (const [label, model] of MODELS) {
    const n = await model.countDocuments({});
    grandTotal += n;
    console.log(`  ${label.padEnd(30)} ${n}`);
  }
  console.log(`  ${"TOTAL".padEnd(30)} ${grandTotal}\n`);

  console.log("=== enum value checks (pgEnum will REJECT anything unlisted) ===");
  for (const [label, model] of [
    ["words", WordModel], ["expressions", ExpressionModel], ["sentences", SentenceModel],
    ["lessons", LessonModel], ["units", UnitModel], ["chapters", ChapterModel],
    ["proverbs", ProverbModel], ["curriculum_build_jobs", CurriculumBuildJobModel]
  ] as Array<[string, mongoose.Model<any>]>) {
    await checkEnum(model, "language", LANGUAGES, label);
  }
  await checkEnum(LanguageModel, "code", LANGUAGES, "languages");
  await checkEnum(LearnerProfileModel, "currentLanguage", LANGUAGES, "learner_profiles");
  await checkEnum(LearnerLanguageStateModel, "languageCode", LANGUAGES, "learner_language_states");
  await checkEnum(LearnerContentPerformanceModel, "language", LANGUAGES, "learner_content_performance");
  await checkEnum(VoiceArtistProfileModel, "language", LANGUAGES, "voice_artist_profiles");
  await checkEnum(VoiceAudioSubmissionModel, "language", LANGUAGES, "voice_audio_submissions");
  await checkEnum(TutorProfileModel, "language", LANGUAGES, "tutor_profiles");

  for (const [label, model] of [
    ["lessons", LessonModel], ["units", UnitModel], ["chapters", ChapterModel],
    ["curriculum_build_jobs", CurriculumBuildJobModel]
  ] as Array<[string, mongoose.Model<any>]>) {
    await checkEnum(model, "level", LEVELS, label);
  }

  for (const [label, model] of [
    ["words", WordModel], ["expressions", ExpressionModel], ["sentences", SentenceModel],
    ["lessons", LessonModel], ["units", UnitModel], ["chapters", ChapterModel],
    ["proverbs", ProverbModel], ["exercise_questions", ExerciseQuestionModel]
  ] as Array<[string, mongoose.Model<any>]>) {
    await checkEnum(model, "status", CONTENT_STATUS, label);
  }

  await checkEnum(LessonContentItemModel, "contentType", CONTENT_TYPES, "lesson_content_items");
  await checkEnum(UnitContentItemModel, "contentType", CONTENT_TYPES, "unit_content_items");
  await checkEnum(LearnerContentPerformanceModel, "contentType", CONTENT_TYPES, "learner_content_performance");
  await checkEnum(VoiceAudioSubmissionModel, "contentType", CONTENT_TYPES, "voice_audio_submissions");
  await checkEnum(LessonModel, "kind", LESSON_KINDS, "lessons");
  await checkEnum(UnitModel, "kind", LESSON_KINDS, "units");

  console.log("\n=== NOT NULL checks ===");
  await checkRequired(LessonModel, "createdBy", "lessons");
  await checkRequired(LessonModel, "unitId", "lessons");
  await checkRequired(UnitModel, "createdBy", "units");
  await checkRequired(ChapterModel, "createdBy", "chapters");
  await checkRequired(ImageAssetModel, "uploadedBy", "image_assets");
  await checkRequired(ImageAssetModel, "mimeType", "image_assets");
  await checkRequired(ImageAssetModel, "altText", "image_assets");
  await checkRequired(LessonContentItemModel, "createdBy", "lesson_content_items");
  await checkRequired(UnitContentItemModel, "createdBy", "unit_content_items");
  await checkRequired(ExerciseQuestionModel, "lessonId", "exercise_questions");
  await checkRequired(ExerciseQuestionModel, "promptTemplate", "exercise_questions");
  await checkRequired(ExpressionImageLinkModel, "createdBy", "expression_image_links");
  await checkRequired(VoiceAudioSubmissionModel, "voiceArtistProfileId", "voice_audio_submissions");
  await checkRequired(LearnerContentPerformanceModel, "firstSeenAt", "learner_content_performance");
  await checkRequired(LearnerContentPerformanceModel, "lastSeenAt", "learner_content_performance");
  await checkRequired(LearnerQuestionMissModel, "firstMissedAt", "learner_question_misses");
  await checkRequired(CurriculumBuildJobModel, "createdBy", "curriculum_build_jobs");
  for (const [label, model] of [
    ["words", WordModel], ["expressions", ExpressionModel], ["sentences", SentenceModel]
  ] as Array<[string, mongoose.Model<any>]>) {
    await checkRequired(model, "text", label);
    await checkRequired(model, "textNormalized", label);
  }

  console.log("\n=== unique / partial-unique index checks ===");
  await checkActiveTextDuplicates(WordModel, "words");
  await checkActiveTextDuplicates(ExpressionModel, "expressions");
  await checkActiveTextDuplicates(SentenceModel, "sentences");

  const emailDupes = await UserModel.aggregate([
    { $group: { _id: { $toLower: "$email" }, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
    { $limit: 10 }
  ]);
  if (emailDupes.length > 0) {
    flag(`users has case-insensitive duplicate emails (unique index is on lower(email)): ${JSON.stringify(emailDupes)}`);
  }

  const usernameDupes = await LearnerProfileModel.aggregate([
    { $match: { username: { $nin: [null, ""] } } },
    { $group: { _id: "$username", n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
    { $limit: 10 }
  ]);
  if (usernameDupes.length > 0) {
    flag(`learner_profiles has duplicate non-empty usernames: ${JSON.stringify(usernameDupes)}`);
  }

  console.log("\n=== CHECK constraint range checks ===");
  await checkRange(WordModel, "difficulty", 1, 5, "words");
  await checkRange(ExpressionModel, "difficulty", 1, 5, "expressions");
  await checkRange(SentenceModel, "difficulty", 1, 5, "sentences");
  await checkRange(LearnerProfileModel, "dailyGoalMinutes", 1, 120, "learner_profiles");
  await checkRange(LearnerLanguageStateModel, "dailyGoalMinutes", 1, 120, "learner_language_states");
  await checkRange(LessonProgressModel, "progressPercent", 0, 100, "lesson_progress");
  await checkRange(CurriculumBuildJobModel, "requestedChapterCount", 1, 30, "curriculum_build_jobs");

  console.log("\n=== fractional-value checks (Postgres columns are integer) ===");
  for (const [label, model, field] of [
    ["lesson_progress", LessonProgressModel, "progressPercent"],
    ["learner_profiles", LearnerProfileModel, "totalXp"],
    ["learner_language_states", LearnerLanguageStateModel, "totalXp"]
  ] as Array<[string, mongoose.Model<any>, string]>) {
    const docs = await model.find({ [field]: { $ne: null } } as any).select(field).lean();
    const frac = docs.filter((d: any) => typeof d[field] === "number" && !Number.isInteger(d[field]));
    if (frac.length > 0) flag(`${label}.${field} has ${frac.length} fractional value(s) — integer column would truncate`);
  }

  console.log("\n============================================");
  if (problems.length === 0) {
    console.log("PRE-FLIGHT CLEAN — no blocking issues found.");
  } else {
    console.log(`PRE-FLIGHT FOUND ${problems.length} ISSUE(S):`);
    problems.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
  }
  console.log("============================================");
}

main()
  .catch((error) => {
    console.error("PREFLIGHT ERROR", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
