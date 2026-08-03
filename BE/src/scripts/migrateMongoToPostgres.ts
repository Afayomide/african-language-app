import "dotenv/config";
import mongoose from "mongoose";
import { sql } from "drizzle-orm";

import { db, pool } from "../infrastructure/db/drizzle/client.js";
import * as t from "../infrastructure/db/drizzle/schema.js";
import { genObjectId, isValidId } from "../utils/ids.js";

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
 * One-shot Mongo -> Postgres data migration.
 *
 * Idempotent: it TRUNCATEs every target table first, so it can be re-run freely
 * until the cutover. Run `migrationPreflight.ts` before this.
 *
 * Guard: set MIGRATE_CONFIRM=migrate-to-postgres to actually write.
 */

const CONFIRM = process.env.MIGRATE_CONFIRM === "migrate-to-postgres";
const CHUNK = 500;

const counts: Array<[string, number]> = [];

const id = (v: unknown): string => String(v ?? "");
const idOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const str = (v: unknown): string => String(v ?? "");
const num = (v: unknown, d = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : d;
};
const bool = (v: unknown): boolean => Boolean(v);
const date = (v: unknown): Date | null => (v ? new Date(v as string) : null);
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x ?? "")).filter(Boolean) : []);

function chunk<T>(rows: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

async function insertAll(label: string, table: any, rows: any[]) {
  if (rows.length === 0) {
    counts.push([label, 0]);
    console.log(`  ${label.padEnd(30)} 0`);
    return;
  }
  for (const part of chunk(rows)) {
    await db.insert(table).values(part);
  }
  counts.push([label, rows.length]);
  console.log(`  ${label.padEnd(30)} ${rows.length}`);
}

/** Mongoose's pre("validate") hooks do not run here — recompute normalization. */
function normalized(text: unknown) {
  const clean = String(text ?? "").trim();
  return { text: clean, textNormalized: clean.toLowerCase() };
}

function contentBase(d: any) {
  const n = normalized(d.text);
  return {
    id: id(d._id),
    languageId: idOrNull(d.languageId),
    language: d.language,
    text: n.text,
    textNormalized: n.textNormalized,
    translations: strArr(d.translations),
    pronunciation: str(d.pronunciation),
    explanation: str(d.explanation),
    examples: Array.isArray(d.examples) ? d.examples : [],
    difficulty: num(d.difficulty, 1) || 1,
    aiMeta: d.aiMeta ?? {},
    audio: d.audio ?? {},
    status: d.status ?? "draft",
    isDeleted: bool(d.isDeleted),
    deletedAt: date(d.deletedAt),
    createdAt: date(d.createdAt) ?? new Date(),
    updatedAt: date(d.updatedAt) ?? new Date()
  };
}

function componentRows(parentKey: string, parentId: string, components: any) {
  if (!Array.isArray(components)) return [];
  return components.map((c: any, i: number) => ({
    [parentKey]: parentId,
    type: c?.type === "expression" ? "expression" : "word",
    refId: id(c?.refId),
    orderIndex: Number.isInteger(c?.orderIndex) ? Number(c.orderIndex) : i,
    textSnapshot: str(c?.textSnapshot)
  }));
}

function activityRows(userId: string, languageCode: string | null, weekly: any) {
  if (!Array.isArray(weekly)) return [];
  const byDay = new Map<string, number>();
  for (const entry of weekly) {
    if (!entry?.date) continue;
    byDay.set(new Date(entry.date).toISOString().slice(0, 10), num(entry.minutes));
  }
  return Array.from(byDay.entries()).map(([activityDate, minutes]) => ({
    userId,
    languageCode,
    activityDate,
    minutes
  }));
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

  if (!CONFIRM) {
    console.log("DRY RUN — set MIGRATE_CONFIRM=migrate-to-postgres to write.\n");
  }

  await mongoose.connect(uri);
  console.log("connected to mongo + postgres\n");

  if (!CONFIRM) {
    const n = await LessonModel.countDocuments({});
    console.log(`would migrate (lessons sample count: ${n}). Exiting without writing.`);
    return;
  }

  console.log("truncating target tables...");
  await db.execute(sql`truncate table
    ${sql.identifier("languages")}, ${sql.identifier("users")}, ${sql.identifier("chapters")},
    ${sql.identifier("units")}, ${sql.identifier("lessons")}, ${sql.identifier("lesson_stages")},
    ${sql.identifier("lesson_blocks")}, ${sql.identifier("words")}, ${sql.identifier("expressions")},
    ${sql.identifier("sentences")}, ${sql.identifier("sentence_components")}, ${sql.identifier("expression_components")},
    ${sql.identifier("proverbs")}, ${sql.identifier("exercise_questions")}, ${sql.identifier("lesson_content_items")},
    ${sql.identifier("unit_content_items")}, ${sql.identifier("image_assets")}, ${sql.identifier("expression_image_links")},
    ${sql.identifier("learner_profiles")}, ${sql.identifier("learner_language_states")}, ${sql.identifier("learner_activity_days")},
    ${sql.identifier("learner_content_performance")}, ${sql.identifier("learner_question_misses")},
    ${sql.identifier("lesson_progress")}, ${sql.identifier("lesson_step_progress")}, ${sql.identifier("lesson_stage_progress")},
    ${sql.identifier("tutor_profiles")}, ${sql.identifier("voice_artist_profiles")}, ${sql.identifier("voice_audio_submissions")},
    ${sql.identifier("curriculum_build_jobs")}, ${sql.identifier("curriculum_build_artifacts")}
    cascade`);

  console.log("\n=== migrating ===");

  // ---------- languages ----------
  const languages = await LanguageModel.find({}).lean();
  await insertAll("languages", t.languages, languages.map((d: any) => ({
    id: id(d._id), code: d.code, name: str(d.name), nativeName: str(d.nativeName),
    status: d.status ?? "active", orderIndex: num(d.orderIndex), locale: str(d.locale), region: str(d.region),
    branding: d.branding ?? {}, speechConfig: d.speechConfig ?? {}, learningConfig: d.learningConfig ?? {},
    createdAt: date(d.createdAt) ?? new Date(), updatedAt: date(d.updatedAt) ?? new Date()
  })));

  // ---------- users ----------
  const users = await UserModel.find({}).lean();
  await insertAll("users", t.users, users.map((d: any) => ({
    id: id(d._id), email: str(d.email).trim().toLowerCase(), passwordHash: str(d.passwordHash),
    roles: strArr(d.roles).length ? strArr(d.roles) : ["learner"],
    createdAt: date(d.createdAt) ?? new Date(), updatedAt: date(d.updatedAt) ?? new Date()
  })));

  // ---------- chapters ----------
  const chapters = await ChapterModel.find({}).lean();
  await insertAll("chapters", t.chapters, chapters.map((d: any) => ({
    id: id(d._id), title: str(d.title), description: str(d.description), languageId: idOrNull(d.languageId),
    language: d.language, level: d.level, orderIndex: num(d.orderIndex), status: d.status ?? "draft",
    createdBy: id(d.createdBy), publishedAt: date(d.publishedAt),
    isDeleted: bool(d.isDeleted), deletedAt: date(d.deletedAt),
    createdAt: date(d.createdAt) ?? new Date(), updatedAt: date(d.updatedAt) ?? new Date()
  })));

  // ---------- units ----------
  const units = await UnitModel.find({}).lean();
  await insertAll("units", t.units, units.map((d: any) => ({
    id: id(d._id), chapterId: idOrNull(d.chapterId), languageId: idOrNull(d.languageId),
    title: str(d.title), description: str(d.description), language: d.language, level: d.level,
    kind: d.kind ?? "core", reviewStyle: d.reviewStyle ?? "none",
    reviewSourceUnitIds: strArr(d.reviewSourceUnitIds),
    orderIndex: num(d.orderIndex), status: d.status ?? "draft", createdBy: id(d.createdBy),
    lastAiRun: d.lastAiRun ?? null, lastAiPreviewPlan: d.lastAiPreviewPlan ?? null,
    publishedAt: date(d.publishedAt), isDeleted: bool(d.isDeleted), deletedAt: date(d.deletedAt),
    createdAt: date(d.createdAt) ?? new Date(), updatedAt: date(d.updatedAt) ?? new Date()
  })));

  // ---------- lessons + stages + blocks ----------
  const lessons = await LessonModel.find({}).lean();
  await insertAll("lessons", t.lessons, lessons.map((d: any) => ({
    id: id(d._id), title: str(d.title), unitId: id(d.unitId), languageId: idOrNull(d.languageId),
    language: d.language, level: d.level, orderIndex: num(d.orderIndex), description: str(d.description),
    topics: strArr(d.topics), kind: d.kind ?? "core",
    proverbs: Array.isArray(d.proverbs) ? d.proverbs : [],
    status: d.status ?? "draft", createdBy: id(d.createdBy), publishedAt: date(d.publishedAt),
    isDeleted: bool(d.isDeleted), deletedAt: date(d.deletedAt),
    createdAt: date(d.createdAt) ?? new Date(), updatedAt: date(d.updatedAt) ?? new Date()
  })));

  const stageRows: any[] = [];
  const blockRows: any[] = [];
  for (const lesson of lessons as any[]) {
    const stages = Array.isArray(lesson.stages) ? lesson.stages : [];
    stages.forEach((stage: any, si: number) => {
      // preserve the embedded subdocument _id so learner stageProgress keeps resolving
      const stageId = isValidId(id(stage?._id)) ? id(stage._id) : genObjectId();
      stageRows.push({
        id: stageId,
        lessonId: id(lesson._id),
        orderIndex: Number.isFinite(stage?.orderIndex) ? num(stage.orderIndex) : si,
        title: str(stage?.title),
        description: str(stage?.description)
      });
      const blocks = Array.isArray(stage?.blocks) ? stage.blocks : [];
      blocks.forEach((block: any, bi: number) => {
        blockRows.push({
          stageId,
          orderIndex: bi, // Mongo relied on array position; make it explicit
          type: block?.type,
          content: block?.type === "text" ? str(block?.content) : null,
          contentType: block?.contentType ?? null,
          refId: block?.refId ? id(block.refId) : null,
          translationIndex: num(block?.translationIndex)
        });
      });
    });
  }
  await insertAll("lesson_stages", t.lessonStages, stageRows);
  await insertAll("lesson_blocks", t.lessonBlocks, blockRows);

  // ---------- words ----------
  const words = await WordModel.find({}).lean();
  await insertAll("words", t.words, words.map((d: any) => ({
    ...contentBase(d),
    lemma: str(d.lemma), partOfSpeech: str(d.partOfSpeech),
    image: d.image?.url ? d.image : {}
  })));

  // ---------- expressions + components ----------
  const expressions = await ExpressionModel.find({}).lean();
  await insertAll("expressions", t.expressions, expressions.map((d: any) => ({
    ...contentBase(d),
    register: d.register ?? "neutral"
  })));
  await insertAll("expression_components", t.expressionComponents,
    (expressions as any[]).flatMap((d) => componentRows("expressionId", id(d._id), d.components)));

  // ---------- sentences + components ----------
  const sentences = await SentenceModel.find({}).lean();
  await insertAll("sentences", t.sentences, sentences.map((d: any) => ({
    ...contentBase(d),
    literalTranslation: str(d.literalTranslation), usageNotes: str(d.usageNotes),
    meaningSegments: Array.isArray(d.meaningSegments) ? d.meaningSegments : []
  })));
  await insertAll("sentence_components", t.sentenceComponents,
    (sentences as any[]).flatMap((d) => componentRows("sentenceId", id(d._id), d.components)));

  // ---------- proverbs ----------
  const proverbs = await ProverbModel.find({}).lean();
  await insertAll("proverbs", t.proverbs, proverbs.map((d: any) => {
    const clean = str(d.text).trim();
    return {
      id: id(d._id), lessonIds: strArr(d.lessonIds), deletedLessonIds: strArr(d.deletedLessonIds),
      languageId: idOrNull(d.languageId), language: d.language,
      text: clean, normalizedText: clean.toLowerCase(),
      translation: str(d.translation), contextNote: str(d.contextNote),
      aiMeta: d.aiMeta ?? {}, status: d.status ?? "draft",
      isDeleted: bool(d.isDeleted), deletedAt: date(d.deletedAt),
      createdAt: date(d.createdAt) ?? new Date(), updatedAt: date(d.updatedAt) ?? new Date()
    };
  }));

  // ---------- exercise questions ----------
  const questions = await ExerciseQuestionModel.find({}).lean();
  await insertAll("exercise_questions", t.exerciseQuestions, questions.map((d: any) => ({
    id: id(d._id), lessonId: id(d.lessonId),
    sourceType: d.sourceType ?? null, sourceId: idOrNull(d.sourceId),
    relatedSourceRefs: Array.isArray(d.relatedSourceRefs)
      ? d.relatedSourceRefs.map((r: any) => ({ type: r?.type, id: id(r?.id) })) : [],
    translationIndex: num(d.translationIndex), type: d.type, subtype: d.subtype,
    promptTemplate: str(d.promptTemplate), options: strArr(d.options), correctIndex: num(d.correctIndex),
    reviewData: d.reviewData ?? {}, interactionData: d.interactionData ?? {},
    explanation: str(d.explanation), status: d.status ?? "draft",
    isDeleted: bool(d.isDeleted), deletedAt: date(d.deletedAt),
    createdAt: date(d.createdAt) ?? new Date(), updatedAt: date(d.updatedAt) ?? new Date()
  })));

  // ---------- content links ----------
  const lci = await LessonContentItemModel.find({}).lean();
  await insertAll("lesson_content_items", t.lessonContentItems, lci.map((d: any) => ({
    id: id(d._id), lessonId: id(d.lessonId), unitId: id(d.unitId), contentType: d.contentType,
    contentId: id(d.contentId), role: d.role,
    stageIndex: d.stageIndex === null || d.stageIndex === undefined ? null : num(d.stageIndex),
    orderIndex: num(d.orderIndex), createdBy: id(d.createdBy),
    createdAt: date(d.createdAt) ?? new Date(), updatedAt: date(d.updatedAt) ?? new Date()
  })));

  const uci = await UnitContentItemModel.find({}).lean();
  await insertAll("unit_content_items", t.unitContentItems, uci.map((d: any) => ({
    id: id(d._id), unitId: id(d.unitId), contentType: d.contentType, contentId: id(d.contentId),
    role: d.role, orderIndex: num(d.orderIndex), sourceUnitId: idOrNull(d.sourceUnitId),
    createdBy: id(d.createdBy),
    createdAt: date(d.createdAt) ?? new Date(), updatedAt: date(d.updatedAt) ?? new Date()
  })));

  // ---------- images ----------
  const images = await ImageAssetModel.find({}).lean();
  await insertAll("image_assets", t.imageAssets, images.map((d: any) => ({
    id: id(d._id), url: str(d.url), thumbnailUrl: str(d.thumbnailUrl), storageKey: str(d.storageKey),
    mimeType: str(d.mimeType), width: d.width ?? null, height: d.height ?? null,
    description: str(d.description), altText: str(d.altText), tags: strArr(d.tags),
    languageNeutralLabel: str(d.languageNeutralLabel), status: d.status ?? "draft",
    uploadedBy: id(d.uploadedBy), isDeleted: bool(d.isDeleted), deletedAt: date(d.deletedAt),
    createdAt: date(d.createdAt) ?? new Date(), updatedAt: date(d.updatedAt) ?? new Date()
  })));

  const links = await ExpressionImageLinkModel.find({}).lean();
  await insertAll("expression_image_links", t.expressionImageLinks, links.map((d: any) => ({
    id: id(d._id), expressionId: id(d.expressionId),
    translationIndex: Number.isInteger(d.translationIndex) ? num(d.translationIndex) : null,
    imageAssetId: id(d.imageAssetId), isPrimary: bool(d.isPrimary), notes: str(d.notes),
    createdBy: id(d.createdBy), isDeleted: bool(d.isDeleted), deletedAt: date(d.deletedAt),
    createdAt: date(d.createdAt) ?? new Date(), updatedAt: date(d.updatedAt) ?? new Date()
  })));

  // ---------- learner ----------
  const profiles = await LearnerProfileModel.find({}).lean();
  await insertAll("learner_profiles", t.learnerProfiles, profiles.map((d: any) => ({
    id: id(d._id), userId: id(d.userId), activeLanguageId: idOrNull(d.activeLanguageId),
    name: str(d.name || d.displayName), displayName: str(d.displayName || d.name),
    username: str(d.username), avatarUrl: str(d.avatarUrl),
    proficientLanguage: str(d.proficientLanguage), countryOfOrigin: str(d.countryOfOrigin),
    onboardingCompleted: bool(d.onboardingCompleted), currentLanguage: d.currentLanguage ?? "yoruba",
    dailyGoalMinutes: num(d.dailyGoalMinutes, 10) || 10, totalXp: num(d.totalXp),
    currentStreak: num(d.currentStreak), longestStreak: num(d.longestStreak),
    lastActiveDate: date(d.lastActiveDate), completedLessonsCount: num(d.completedLessonsCount),
    achievements: strArr(d.achievements),
    createdAt: date(d.createdAt) ?? new Date(), updatedAt: date(d.updatedAt) ?? new Date()
  })));

  const states = await LearnerLanguageStateModel.find({}).lean();
  await insertAll("learner_language_states", t.learnerLanguageStates, states.map((d: any) => ({
    id: id(d._id), userId: id(d.userId), languageId: idOrNull(d.languageId), languageCode: d.languageCode,
    isEnrolled: d.isEnrolled === undefined ? true : bool(d.isEnrolled),
    dailyGoalMinutes: num(d.dailyGoalMinutes, 10) || 10, totalXp: num(d.totalXp),
    currentStreak: num(d.currentStreak), longestStreak: num(d.longestStreak),
    lastActiveDate: date(d.lastActiveDate), completedLessonsCount: num(d.completedLessonsCount),
    achievements: strArr(d.achievements),
    currentChapterId: idOrNull(d.currentChapterId), currentUnitId: idOrNull(d.currentUnitId),
    createdAt: date(d.createdAt) ?? new Date(), updatedAt: date(d.updatedAt) ?? new Date()
  })));

  // weeklyActivity from BOTH sources -> one table (NULL scope = profile-level)
  const activity = [
    ...(profiles as any[]).flatMap((d) => activityRows(id(d.userId), null, d.weeklyActivity)),
    ...(states as any[]).flatMap((d) => activityRows(id(d.userId), d.languageCode, d.weeklyActivity))
  ];
  await insertAll("learner_activity_days", t.learnerActivityDays, activity);

  const perf = await LearnerContentPerformanceModel.find({}).lean();
  await insertAll("learner_content_performance", t.learnerContentPerformance, perf.map((d: any) => ({
    id: id(d._id), userId: id(d.userId), language: d.language, contentType: d.contentType,
    contentId: id(d.contentId),
    exposureCount: num(d.exposureCount), attemptCount: num(d.attemptCount), correctCount: num(d.correctCount),
    wrongCount: num(d.wrongCount), retryCount: num(d.retryCount),
    speakingFailureCount: num(d.speakingFailureCount), listeningFailureCount: num(d.listeningFailureCount),
    contextScenarioFailureCount: num(d.contextScenarioFailureCount),
    lastLessonId: idOrNull(d.lastLessonId), lastQuestionType: d.lastQuestionType ?? null,
    lastQuestionSubtype: d.lastQuestionSubtype ?? null,
    firstSeenAt: date(d.firstSeenAt) ?? new Date(), lastSeenAt: date(d.lastSeenAt) ?? new Date(),
    createdAt: date(d.createdAt) ?? new Date(), updatedAt: date(d.updatedAt) ?? new Date()
  })));

  const misses = await LearnerQuestionMissModel.find({}).lean();
  await insertAll("learner_question_misses", t.learnerQuestionMisses, misses.map((d: any) => ({
    id: id(d._id), userId: id(d.userId), lessonId: id(d.lessonId), questionId: id(d.questionId),
    questionType: d.questionType, questionSubtype: d.questionSubtype,
    sourceType: d.sourceType ?? null, sourceId: idOrNull(d.sourceId), missCount: num(d.missCount),
    firstMissedAt: date(d.firstMissedAt) ?? new Date(), lastMissedAt: date(d.lastMissedAt) ?? new Date(),
    createdAt: date(d.createdAt) ?? new Date(), updatedAt: date(d.updatedAt) ?? new Date()
  })));

  const progress = await LessonProgressModel.find({}).lean();
  await insertAll("lesson_progress", t.lessonProgress, progress.map((d: any) => ({
    id: id(d._id), userId: id(d.userId), lessonId: id(d.lessonId), status: d.status ?? "not_started",
    progressPercent: num(d.progressPercent), xpEarned: num(d.xpEarned),
    currentStageIndex: num(d.currentStageIndex),
    startedAt: date(d.startedAt), completedAt: date(d.completedAt),
    createdAt: date(d.createdAt) ?? new Date(), updatedAt: date(d.updatedAt) ?? new Date()
  })));

  await insertAll("lesson_step_progress", t.lessonStepProgress,
    (progress as any[]).flatMap((d) => {
      const seen = new Set<string>();
      return (Array.isArray(d.stepProgress) ? d.stepProgress : [])
        .filter((s: any) => s?.stepKey && !seen.has(String(s.stepKey)) && seen.add(String(s.stepKey)))
        .map((s: any) => ({
          lessonProgressId: id(d._id), stepKey: str(s.stepKey), status: s.status ?? "available",
          score: Number(s.score) || 0, completedAt: date(s.completedAt)
        }));
    }));

  await insertAll("lesson_stage_progress", t.lessonStageProgress,
    (progress as any[]).flatMap((d) => {
      const seen = new Set<string>();
      return (Array.isArray(d.stageProgress) ? d.stageProgress : [])
        .filter((s: any) => s?.stageId && !seen.has(String(s.stageId)) && seen.add(String(s.stageId)))
        .map((s: any) => ({
          lessonProgressId: id(d._id), stageId: str(s.stageId), stageIndex: num(s.stageIndex),
          status: s.status ?? "not_started", completedAt: date(s.completedAt)
        }));
    }));

  // ---------- tutor / voice ----------
  const tutors = await TutorProfileModel.find({}).lean();
  await insertAll("tutor_profiles", t.tutorProfiles, tutors.map((d: any) => ({
    id: id(d._id), userId: id(d.userId), language: d.language ?? null,
    displayName: str(d.displayName), isActive: bool(d.isActive),
    createdAt: date(d.createdAt) ?? new Date(), updatedAt: date(d.updatedAt) ?? new Date()
  })));

  const artists = await VoiceArtistProfileModel.find({}).lean();
  await insertAll("voice_artist_profiles", t.voiceArtistProfiles, artists.map((d: any) => ({
    id: id(d._id), userId: id(d.userId), language: d.language,
    displayName: str(d.displayName), isActive: bool(d.isActive),
    createdAt: date(d.createdAt) ?? new Date(), updatedAt: date(d.updatedAt) ?? new Date()
  })));

  const submissions = await VoiceAudioSubmissionModel.find({}).lean();
  await insertAll("voice_audio_submissions", t.voiceAudioSubmissions, submissions.map((d: any) => ({
    id: id(d._id), contentType: d.contentType, contentId: id(d.contentId),
    voiceArtistUserId: id(d.voiceArtistUserId), voiceArtistProfileId: id(d.voiceArtistProfileId),
    language: d.language, audio: d.audio ?? {}, status: d.status ?? "pending",
    rejectionReason: str(d.rejectionReason), reviewedBy: idOrNull(d.reviewedBy), reviewedAt: date(d.reviewedAt),
    createdAt: date(d.createdAt) ?? new Date(), updatedAt: date(d.updatedAt) ?? new Date()
  })));

  // ---------- curriculum build ----------
  const jobs = await CurriculumBuildJobModel.find({}).lean();
  await insertAll("curriculum_build_jobs", t.curriculumBuildJobs, jobs.map((d: any) => ({
    id: id(d._id), languageId: idOrNull(d.languageId), language: d.language, level: d.level,
    requestedChapterCount: num(d.requestedChapterCount, 1) || 1,
    topic: str(d.topic), extraInstructions: str(d.extraInstructions), cefrTarget: str(d.cefrTarget),
    status: d.status ?? "queued", currentStepKey: d.currentStepKey ?? "architect",
    steps: Array.isArray(d.steps) ? d.steps : [], artifacts: d.artifacts ?? {},
    errors: Array.isArray(d.errors) ? d.errors : [], createdBy: id(d.createdBy),
    startedAt: date(d.startedAt), finishedAt: date(d.finishedAt),
    createdAt: date(d.createdAt) ?? new Date(), updatedAt: date(d.updatedAt) ?? new Date()
  })));

  const artifacts = await CurriculumBuildArtifactModel.find({}).lean();
  await insertAll("curriculum_build_artifacts", t.curriculumBuildArtifacts, artifacts.map((d: any) => ({
    id: id(d._id), jobId: id(d.jobId), stepKey: d.stepKey, phaseKey: d.phaseKey, scopeType: d.scopeType,
    scopeId: d.scopeId ? String(d.scopeId) : null, scopeTitle: d.scopeTitle ? String(d.scopeTitle) : null,
    attempt: num(d.attempt, 1) || 1, status: d.status, summary: str(d.summary),
    input: d.input ?? null, output: d.output ?? null, critic: d.critic ?? null, refiner: d.refiner ?? null,
    createdAt: date(d.createdAt) ?? new Date(), updatedAt: date(d.updatedAt) ?? new Date()
  })));

  console.log("\n=== migration complete ===");
  console.log(`total rows written: ${counts.reduce((sum, [, n]) => sum + n, 0)}`);
}

main()
  .catch((error) => {
    console.error("MIGRATION ERROR", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
    await pool.end();
  });
