import "dotenv/config";
import mongoose from "mongoose";
import LanguageModel from "../models/Language.js";
import ChapterModel from "../models/Chapter.js";
import UnitModel from "../models/Unit.js";
import LessonModel from "../models/Lesson.js";
import WordModel from "../models/Word.js";
import ExpressionModel from "../models/Expression.js";
import SentenceModel from "../models/Sentence.js";
import ProverbModel from "../models/Proverb.js";
import LearnerProfileModel from "../models/learner/LearnerProfile.js";

type LanguageCode = "yoruba" | "igbo" | "hausa";

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is required");
  }

  await mongoose.connect(uri);

  const languages = await LanguageModel.find({}).select("_id code").lean();
  const idByCode = new Map<LanguageCode, string>();

  for (const language of languages) {
    if (
      language.code === "yoruba" ||
      language.code === "igbo" ||
      language.code === "hausa"
    ) {
      idByCode.set(language.code, String(language._id));
    }
  }

  const requiredCodes: LanguageCode[] = ["yoruba", "igbo", "hausa"];
  const missingCodes = requiredCodes.filter((code) => !idByCode.has(code));
  if (missingCodes.length > 0) {
    throw new Error(`Missing Language docs for codes: ${missingCodes.join(", ")}. Run seedLanguages first.`);
  }

  const operations = [
    { name: "chapters", model: ChapterModel, field: "language", targetField: "languageId" },
    { name: "units", model: UnitModel, field: "language", targetField: "languageId" },
    { name: "lessons", model: LessonModel, field: "language", targetField: "languageId" },
    { name: "words", model: WordModel, field: "language", targetField: "languageId" },
    { name: "expressions", model: ExpressionModel, field: "language", targetField: "languageId" },
    { name: "sentences", model: SentenceModel, field: "language", targetField: "languageId" },
    { name: "proverbs", model: ProverbModel, field: "language", targetField: "languageId" },
    { name: "learnerProfiles", model: LearnerProfileModel, field: "currentLanguage", targetField: "activeLanguageId" }
  ] as const;

  const results: Array<{ name: string; matched: number; modified: number }> = [];

  for (const operation of operations) {
    let matched = 0;
    let modified = 0;

    for (const code of requiredCodes) {
      const languageId = idByCode.get(code)!;
      const response = await operation.model.updateMany(
        {
          [operation.field]: code,
          $or: [
            { [operation.targetField]: { $exists: false } },
            { [operation.targetField]: null }
          ]
        },
        {
          $set: {
            [operation.targetField]: new mongoose.Types.ObjectId(languageId)
          }
        }
      );

      matched += response.matchedCount;
      modified += response.modifiedCount;
    }

    results.push({ name: operation.name, matched, modified });
  }

  console.log("[BACKFILL_LANGUAGE_IDS] complete", results);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error("[BACKFILL_LANGUAGE_IDS] failed", error);
  process.exit(1);
});
