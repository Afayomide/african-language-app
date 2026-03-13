import dotenv from "dotenv";
import mongoose from "mongoose";
import LessonModel from "../models/Lesson.js";

dotenv.config();

type LessonBlockRaw = {
  type?: string;
  content?: string;
  refId?: mongoose.Types.ObjectId | string;
  translationIndex?: number;
};

type LessonStageRaw = {
  _id?: mongoose.Types.ObjectId | string;
  title?: string;
  description?: string;
  orderIndex?: number;
  blocks?: LessonBlockRaw[];
  legacySource?: string;
};

type LessonRaw = {
  _id: mongoose.Types.ObjectId;
  blocks?: LessonBlockRaw[];
  stages?: LessonStageRaw[];
};

function normalizeStages(stages: LessonStageRaw[] | undefined): LessonStageRaw[] {
  if (!Array.isArray(stages)) return [];
  return [...stages].sort((a, b) => Number(a.orderIndex ?? 0) - Number(b.orderIndex ?? 0));
}

function buildDefaultStage(lessonId: string, blocks: LessonBlockRaw[]): LessonStageRaw {
  return {
    _id: new mongoose.Types.ObjectId(),
    title: "Stage 1",
    description: "Migrated from legacy lesson blocks",
    orderIndex: 0,
    blocks,
    legacySource: `lesson:${lessonId}`
  };
}

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is required");

  const dryRun = process.argv.includes("--dry-run");

  await mongoose.connect(mongoUri);

  const collection = mongoose.connection.collection<LessonRaw>(LessonModel.collection.collectionName);
  const cursor = collection.find({ $or: [{ blocks: { $exists: true } }, { "blocks.0": { $exists: true } }] });

  let scanned = 0;
  let migrated = 0;
  let onlyUnset = 0;

  for await (const lesson of cursor) {
    scanned += 1;
    const legacyBlocks = Array.isArray(lesson.blocks) ? lesson.blocks : [];
    const hasLegacyBlocks = legacyBlocks.length > 0;

    if (!hasLegacyBlocks) {
      if (!dryRun) {
        await collection.updateOne({ _id: lesson._id }, { $unset: { blocks: "" } });
      }
      onlyUnset += 1;
      continue;
    }

    const stages = normalizeStages(lesson.stages);
    let nextStages: LessonStageRaw[];

    if (stages.length === 0) {
      nextStages = [buildDefaultStage(lesson._id.toString(), legacyBlocks)];
    } else {
      const [first, ...rest] = stages;
      const existingBlocks = Array.isArray(first.blocks) ? first.blocks : [];
      nextStages = [{ ...first, blocks: [...legacyBlocks, ...existingBlocks] }, ...rest];
    }

    if (!dryRun) {
      await collection.updateOne(
        { _id: lesson._id },
        {
          $set: { stages: nextStages },
          $unset: { blocks: "" }
        }
      );
    }
    migrated += 1;
  }

  console.log(
    `${dryRun ? "Dry run complete" : "Migration complete"}: scanned=${scanned}, migrated=${migrated}, unsetOnly=${onlyUnset}`
  );

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Failed to migrate lesson blocks to stages", error);
  await mongoose.disconnect();
  process.exit(1);
});
