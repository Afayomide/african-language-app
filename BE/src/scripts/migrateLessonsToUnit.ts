import "dotenv/config";
import mongoose from "mongoose";
import LessonModel from "../models/Lesson.js";
import UnitModel from "../models/Unit.js";

type CliOptions = {
  unitId: string;
  language?: "yoruba" | "igbo" | "hausa";
  onlyWithoutUnit: boolean;
  dryRun: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  const args = new Map<string, string>();
  for (const raw of argv) {
    if (!raw.startsWith("--")) continue;
    const [key, value] = raw.slice(2).split("=");
    args.set(key, value ?? "true");
  }

  const unitId = String(args.get("unitId") || "").trim();
  if (!unitId) {
    throw new Error("Missing --unitId=<unit_object_id>");
  }
  if (!mongoose.Types.ObjectId.isValid(unitId)) {
    throw new Error("Invalid --unitId value.");
  }

  const rawLanguage = String(args.get("language") || "").trim().toLowerCase();
  let language: "yoruba" | "igbo" | "hausa" | undefined;
  if (rawLanguage) {
    if (rawLanguage !== "yoruba" && rawLanguage !== "igbo" && rawLanguage !== "hausa") {
      throw new Error("Invalid --language. Use yoruba, igbo, or hausa.");
    }
    language = rawLanguage;
  }

  const onlyWithoutUnit = args.get("onlyWithoutUnit") === "true" || args.get("onlyWithoutUnit") === "1";
  const dryRun = args.get("dryRun") === "true" || args.get("dryRun") === "1";

  return { unitId, language, onlyWithoutUnit, dryRun };
}

async function migrateLessonsToUnit(options: CliOptions) {
  const mongoUri = process.env.MONGODB_URI || "";
  if (!mongoUri) {
    throw new Error("Missing MONGODB_URI");
  }

  await mongoose.connect(mongoUri);

  const targetUnit = await UnitModel.findOne({
    _id: options.unitId,
    isDeleted: { $ne: true }
  }).lean();

  if (!targetUnit) {
    throw new Error("Target unit not found.");
  }

  const query: Record<string, unknown> = { isDeleted: { $ne: true } };
  if (options.language) query.language = options.language;
  if (options.onlyWithoutUnit) {
    query.$or = [{ unitId: { $exists: false } }, { unitId: null }, { unitId: "" }];
  }

  const lessons = await LessonModel.find(query)
    .sort({ orderIndex: 1, createdAt: 1 })
    .select("_id title language level unitId orderIndex createdAt")
    .lean();

  if (lessons.length === 0) {
    console.log("No lessons matched the filter.");
    await mongoose.disconnect();
    return;
  }

  const updatedLessons = lessons.map((lesson, index) => ({
    id: String(lesson._id),
    title: String(lesson.title || ""),
    fromUnitId: lesson.unitId ? String(lesson.unitId) : null,
    toUnitId: String(targetUnit._id),
    newLanguage: String(targetUnit.language),
    newLevel: String(targetUnit.level),
    newOrderIndex: index
  }));

  console.log(`Target unit: ${targetUnit.title} (${targetUnit._id.toString()})`);
  console.log(`Matched lessons: ${updatedLessons.length}`);

  if (options.dryRun) {
    console.log("Dry run enabled. No updates were written.");
    console.log("Preview (first 10):");
    for (const item of updatedLessons.slice(0, 10)) {
      console.log(
        `- ${item.title} | ${item.fromUnitId || "none"} -> ${item.toUnitId} | order=${item.newOrderIndex}`
      );
    }
    await mongoose.disconnect();
    return;
  }

  await LessonModel.bulkWrite(
    updatedLessons.map((lesson) => ({
      updateOne: {
        filter: { _id: lesson.id, isDeleted: { $ne: true } },
        update: {
          $set: {
            unitId: targetUnit._id,
            language: targetUnit.language,
            level: targetUnit.level,
            orderIndex: lesson.newOrderIndex
          }
        }
      }
    }))
  );

  console.log(`Migration complete. Updated lessons: ${updatedLessons.length}`);
  await mongoose.disconnect();
}

const options = parseArgs(process.argv.slice(2));
migrateLessonsToUnit(options).catch(async (error) => {
  console.error("Lesson migration failed:", error);
  await mongoose.disconnect();
  process.exit(1);
});

