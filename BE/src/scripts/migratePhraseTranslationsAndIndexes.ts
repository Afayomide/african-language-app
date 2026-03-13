import dotenv from "dotenv";
import mongoose from "mongoose";
import LessonModel from "../models/Lesson.js";
import PhraseModel from "../models/Phrase.js";
import ExerciseQuestionModel from "../models/ExerciseQuestion.js";

dotenv.config();

type PhraseRaw = {
  _id: mongoose.Types.ObjectId;
  text?: string;
  textNormalized?: string;
  translations?: string[];
  translation?: string;
};

type LessonBlockRaw = {
  type?: string;
  translationIndex?: number;
  [key: string]: string | number | boolean | null | undefined | mongoose.Types.ObjectId;
};

type LessonStageRaw = {
  blocks?: LessonBlockRaw[];
};

type LessonRaw = {
  _id: mongoose.Types.ObjectId;
  stages?: LessonStageRaw[];
};

function normalizeTranslations(input: string[] | undefined, fallback: string | undefined) {
  const base = Array.isArray(input) ? input : [];
  const trimmed = base.map((item) => String(item || "").trim()).filter(Boolean);
  if (trimmed.length > 0) {
    return Array.from(new Set(trimmed));
  }

  const legacy = String(fallback || "").trim();
  if (legacy) return [legacy];
  return [];
}

function normalizeText(text: string | undefined) {
  return String(text || "").trim().toLowerCase();
}

async function migratePhrases() {
  const collection = mongoose.connection.collection<PhraseRaw>(PhraseModel.collection.collectionName);

  let scanned = 0;
  let updated = 0;
  let skipped = 0;

  const cursor = collection.find({});
  for await (const row of cursor) {
    scanned += 1;
    const translations = normalizeTranslations(row.translations, row.translation);
    const textNormalized = normalizeText(row.text);

    if (translations.length === 0) {
      skipped += 1;
      continue;
    }

    const needsTranslations =
      !Array.isArray(row.translations) ||
      row.translations.length !== translations.length ||
      row.translations.some((value, index) => String(value || "").trim() !== translations[index]);
    const needsTextNormalized = String(row.textNormalized || "").trim() !== textNormalized;
    const hasLegacyTranslation = typeof row.translation === "string";

    if (!needsTranslations && !needsTextNormalized && !hasLegacyTranslation) {
      continue;
    }

    await collection.updateOne(
      { _id: row._id },
      {
        $set: {
          translations,
          textNormalized
        },
        $unset: {
          translation: ""
        }
      }
    );
    updated += 1;
  }

  const unsetResult = await collection.updateMany(
    { translation: { $exists: true } },
    { $unset: { translation: "" } }
  );

  return {
    scanned,
    updated,
    skipped,
    legacyFieldRemoved: unsetResult.modifiedCount
  };
}

async function migrateQuestionTranslationIndexes() {
  const collection = mongoose.connection.collection<{ translationIndex?: number | null }>(
    ExerciseQuestionModel.collection.collectionName
  );

  const result = await collection.updateMany(
    {
      $or: [
        { translationIndex: { $exists: false } },
        { translationIndex: null }
      ]
    },
    {
      $set: { translationIndex: 0 }
    }
  );

  return { matched: result.matchedCount, updated: result.modifiedCount };
}

async function migrateLessonBlockTranslationIndexes() {
  const collection = mongoose.connection.collection<LessonRaw>(LessonModel.collection.collectionName);

  let scanned = 0;
  let updated = 0;

  const cursor = collection.find({ "stages.blocks.type": "phrase" });
  for await (const lesson of cursor) {
    scanned += 1;
    const stages = Array.isArray(lesson.stages) ? lesson.stages : [];
    let changed = false;

    const nextStages = stages.map((stage) => {
      const blocks = Array.isArray(stage.blocks) ? stage.blocks : [];
      const nextBlocks = blocks.map((block) => {
        if (block.type !== "phrase") return block;

        const index = Number(block.translationIndex);
        const valid = Number.isInteger(index) && index >= 0;
        if (valid) return block;

        changed = true;
        return {
          ...block,
          translationIndex: 0
        };
      });

      return {
        ...stage,
        blocks: nextBlocks
      };
    });

    if (!changed) continue;

      await collection.updateOne(
      { _id: lesson._id },
      { $set: { stages: nextStages } }
    );
    updated += 1;
  }

  return { scanned, updated };
}

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is required");
  }

  await mongoose.connect(mongoUri);

  const phraseStats = await migratePhrases();
  const questionStats = await migrateQuestionTranslationIndexes();
  const lessonStats = await migrateLessonBlockTranslationIndexes();

  console.log("Migration complete:");
  console.log(
    `- phrases: scanned=${phraseStats.scanned}, updated=${phraseStats.updated}, skippedNoTranslation=${phraseStats.skipped}, translationFieldRemoved=${phraseStats.legacyFieldRemoved}`
  );
  console.log(`- questions: matched=${questionStats.matched}, updated=${questionStats.updated}`);
  console.log(`- lessons: scanned=${lessonStats.scanned}, updated=${lessonStats.updated}`);

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Migration failed", error);
  await mongoose.disconnect();
  process.exit(1);
});
