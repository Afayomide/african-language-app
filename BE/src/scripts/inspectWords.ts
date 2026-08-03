import "dotenv/config";
import mongoose from "mongoose";
import WordModel from "../models/Word.js";
import ExpressionModel from "../models/Expression.js";

// Read-only. Reports whether specific words/expressions exist for a language, split by
// live vs soft-deleted, so we can see if a component the assembler "can't find" is actually
// in the DB (and in what state). Default checks the tokens from the failing sentence.
//   node --enable-source-maps --import tsx src/scripts/inspectWords.ts --language=yoruba owó ń fẹ́ fún bàbá ni

function getArgValue(name: string) {
  const prefix = `${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : "";
}

async function main() {
  const mongoUri = process.env.MONGODB_URI || "";
  if (!mongoUri) throw new Error("Missing MONGODB_URI");
  const language = (getArgValue("--language") || "yoruba").trim().toLowerCase();

  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const texts = positional.length > 0
    ? positional
    : ["owó", "ń", "mi", "ò", "fẹ́", "fún", "bàbá", "ni", "lọ", "sí", "ibi", "iṣẹ́", "Mo", "ó"];

  await mongoose.connect(mongoUri);

  const liveTotal = await WordModel.countDocuments({ language, isDeleted: { $ne: true } });
  const deletedTotal = await WordModel.countDocuments({ language, isDeleted: true });
  console.log(`[INSPECT_WORDS] ${language} word totals`, { live: liveTotal, softDeleted: deletedTotal });

  for (const text of texts) {
    const key = text.trim().toLowerCase();
    const matches = await WordModel.find({ language, textNormalized: key })
      .select("_id text textNormalized isDeleted createdAt translations")
      .lean();
    console.log(
      `[INSPECT_WORDS] "${text}" (normalized "${key}"):`,
      matches.length === 0
        ? "NOT FOUND in words"
        : matches.map((m) => ({
            id: String(m._id),
            text: m.text,
            isDeleted: Boolean(m.isDeleted),
            translations: m.translations,
            createdAt: m.createdAt
          }))
    );
    // Also check if it lives only as part of a multi-word expression.
    const asExpression = await ExpressionModel.find({ language, textNormalized: key })
      .select("_id text isDeleted")
      .lean();
    if (asExpression.length > 0) {
      console.log(
        `[INSPECT_WORDS] "${text}" also exists as expression:`,
        asExpression.map((m) => ({ id: String(m._id), text: m.text, isDeleted: Boolean(m.isDeleted) }))
      );
    }
  }
}

main()
  .catch((error) => {
    console.error("[INSPECT_WORDS] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
