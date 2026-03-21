import "dotenv/config";
import mongoose from "mongoose";
import ChapterModel from "../models/Chapter.js";
import ExpressionModel from "../models/Expression.js";
import ExpressionImageLinkModel from "../models/ExpressionImageLink.js";
import ImageAssetModel from "../models/ImageAsset.js";
import LessonModel from "../models/Lesson.js";
import LessonContentItemModel from "../models/LessonContentItem.js";
import UnitModel from "../models/Unit.js";
import ProverbModel from "../models/Proverb.js";
import ExerciseQuestionModel from "../models/ExerciseQuestion.js";
import SentenceModel from "../models/Sentence.js";
import UnitContentItemModel from "../models/UnitContentItem.js";
import WordModel from "../models/Word.js";
import LearnerContentPerformanceModel from "../models/learner/LearnerContentPerformance.js";
import LearnerQuestionMissModel from "../models/learner/LearnerQuestionMiss.js";
import LessonProgressModel from "../models/learner/LessonProgress.js";
import LearnerProfileModel from "../models/learner/LearnerProfile.js";
import VoiceAudioSubmissionModel from "../models/voice/VoiceAudioSubmission.js";
import { deleteObjects } from "../services/storage/s3.js";

const mongoUri = process.env.MONGODB_URI || "";
const LEGACY_COLLECTIONS = ["phrases", "phraseimagelinks"] as const;

function toStorageKey(value: unknown) {
  return String(value || "").trim();
}

async function listCollectionNames() {
  const db = mongoose.connection.db;
  if (!db) return new Set<string>();
  const collections = await db.listCollections().toArray();
  return new Set(collections.map((collection) => collection.name));
}

async function collectModelAudioKeys() {
  const [words, expressions, sentences, submissions, images] = await Promise.all([
    WordModel.find({}, { "audio.s3Key": 1 }).lean(),
    ExpressionModel.find({}, { "audio.s3Key": 1 }).lean(),
    SentenceModel.find({}, { "audio.s3Key": 1 }).lean(),
    VoiceAudioSubmissionModel.find({}, { "audio.s3Key": 1 }).lean(),
    ImageAssetModel.find({}, { storageKey: 1 }).lean()
  ]);

  return [
    ...words.map((item) => toStorageKey(item.audio?.s3Key)),
    ...expressions.map((item) => toStorageKey(item.audio?.s3Key)),
    ...sentences.map((item) => toStorageKey(item.audio?.s3Key)),
    ...submissions.map((item) => toStorageKey(item.audio?.s3Key)),
    ...images.map((item) => toStorageKey(item.storageKey))
  ].filter(Boolean);
}

async function collectLegacyAudioKeys(collectionNames: Set<string>) {
  const db = mongoose.connection.db;
  if (!db) return [];

  const keys: string[] = [];
  if (collectionNames.has("phrases")) {
    const legacyPhrases = await db.collection("phrases").find({}, { projection: { audio: 1 } }).toArray();
    for (const phrase of legacyPhrases) keys.push(toStorageKey(phrase.audio?.s3Key));
  }

  return keys.filter(Boolean);
}

async function deleteLegacyCollections(collectionNames: Set<string>) {
  const db = mongoose.connection.db;
  if (!db) return;

  for (const name of LEGACY_COLLECTIONS) {
    if (!collectionNames.has(name)) continue;
    const result = await db.collection(name).deleteMany({});
    console.log(`Deleted ${result.deletedCount} documents from legacy collection ${name}.`);
  }
}

async function clearDatabase() {
  if (!mongoUri) {
    console.error("Missing MONGODB_URI in environment variables");
    process.exit(1);
  }

  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(mongoUri);
    console.log("Connected successfully.");

    const collectionNames = await listCollectionNames();
    const storageKeys = Array.from(new Set([
      ...(await collectModelAudioKeys()),
      ...(await collectLegacyAudioKeys(collectionNames))
    ]));

    if (storageKeys.length > 0) {
      try {
        const deletedObjectCount = await deleteObjects(storageKeys);
        console.log(`Deleted ${deletedObjectCount} media objects from storage.`);
      } catch (error) {
        console.warn("Failed to delete media objects from storage. Continuing with database clear.");
        console.warn(error);
      }
    } else {
      console.log("No media objects found in storage metadata.");
    }

    console.log("Starting deletion process...");

    const lessonProgressResult = await LessonProgressModel.deleteMany({});
    console.log(`Deleted ${lessonProgressResult.deletedCount} lesson progress records.`);

    const learnerProfilesResult = await LearnerProfileModel.deleteMany({});
    console.log(`Deleted ${learnerProfilesResult.deletedCount} learner profiles.`);

    const learnerContentPerformanceResult = await LearnerContentPerformanceModel.deleteMany({});
    console.log(`Deleted ${learnerContentPerformanceResult.deletedCount} learner content performance records.`);

    const learnerQuestionMissResult = await LearnerQuestionMissModel.deleteMany({});
    console.log(`Deleted ${learnerQuestionMissResult.deletedCount} learner question miss records.`);

    const voiceSubmissionResult = await VoiceAudioSubmissionModel.deleteMany({});
    console.log(`Deleted ${voiceSubmissionResult.deletedCount} voice submissions.`);

    const questionsResult = await ExerciseQuestionModel.deleteMany({});
    console.log(`Deleted ${questionsResult.deletedCount} questions.`);

    const proverbsResult = await ProverbModel.deleteMany({});
    console.log(`Deleted ${proverbsResult.deletedCount} proverbs.`);

    const expressionImageLinksResult = await ExpressionImageLinkModel.deleteMany({});
    console.log(`Deleted ${expressionImageLinksResult.deletedCount} expression image links.`);

    const imageAssetsResult = await ImageAssetModel.deleteMany({});
    console.log(`Deleted ${imageAssetsResult.deletedCount} image assets.`);

    const wordsResult = await WordModel.deleteMany({});
    console.log(`Deleted ${wordsResult.deletedCount} words.`);

    const expressionsResult = await ExpressionModel.deleteMany({});
    console.log(`Deleted ${expressionsResult.deletedCount} expressions.`);

    const sentencesResult = await SentenceModel.deleteMany({});
    console.log(`Deleted ${sentencesResult.deletedCount} sentences.`);

    const lessonsResult = await LessonModel.deleteMany({});
    console.log(`Deleted ${lessonsResult.deletedCount} lessons.`);

    const lessonContentItemsResult = await LessonContentItemModel.deleteMany({});
    console.log(`Deleted ${lessonContentItemsResult.deletedCount} lesson content items.`);

    const unitsResult = await UnitModel.deleteMany({});
    console.log(`Deleted ${unitsResult.deletedCount} units.`);

    const unitContentItemsResult = await UnitContentItemModel.deleteMany({});
    console.log(`Deleted ${unitContentItemsResult.deletedCount} unit content items.`);

    const chaptersResult = await ChapterModel.deleteMany({});
    console.log(`Deleted ${chaptersResult.deletedCount} chapters.`);

    await deleteLegacyCollections(collectionNames);

    console.log("Database cleared successfully.");
  } catch (error) {
    console.error("Error clearing database:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
    process.exit(0);
  }
}

clearDatabase();
