import "dotenv/config";
import mongoose from "mongoose";
import ProverbModel from "../models/Proverb.js";
import LessonModel from "../models/Lesson.js";

const mongoUri = process.env.MONGODB_URI || "";

function splitWords(value: string) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getReasons(input: {
  text: string;
  translation: string;
  contextNote: string;
}) {
  const reasons: string[] = [];
  const textWordCount = splitWords(input.text).length;
  const translationWordCount = splitWords(input.translation).length;
  const contextWordCount = splitWords(input.contextNote).length;

  if (!input.translation.trim()) reasons.push("missing translation");
  if (!input.contextNote.trim()) reasons.push("missing context note");
  if (input.contextNote.trim() && contextWordCount < 5) reasons.push("context note too short");
  if (textWordCount < 2) reasons.push("proverb too short");
  if (translationWordCount < 3) reasons.push("translation too short for proverb");
  if (textWordCount < 4 && translationWordCount < 4) reasons.push("looks like ordinary phrase, not proverb");

  return reasons;
}

async function main() {
  if (!mongoUri) {
    console.error("Missing MONGODB_URI in environment variables");
    process.exit(1);
  }

  const shouldDelete = process.argv.includes("--delete");

  await mongoose.connect(mongoUri);

  try {
    const proverbs = await ProverbModel.find({ isDeleted: { $ne: true } }).lean();
    const lessonIds = Array.from(
      new Set(
        proverbs.flatMap((item) =>
          Array.isArray(item.lessonIds) ? item.lessonIds.map((lessonId) => String(lessonId)) : []
        )
      )
    );
    const lessons = lessonIds.length > 0
      ? await LessonModel.find({ _id: { $in: lessonIds } }).lean()
      : [];
    const lessonTitleMap = new Map(lessons.map((lesson) => [String(lesson._id), String(lesson.title || "")]));

    const suspicious = proverbs
      .map((proverb) => {
        const reasons = getReasons({
          text: String(proverb.text || ""),
          translation: String(proverb.translation || ""),
          contextNote: String(proverb.contextNote || "")
        });

        return {
          proverb,
          reasons
        };
      })
      .filter((item) => item.reasons.length > 0);

    if (suspicious.length === 0) {
      console.log("No suspicious proverbs found.");
      return;
    }

    console.log(`Found ${suspicious.length} suspicious proverbs.`);

    for (const item of suspicious) {
      const lessonTitles = Array.isArray(item.proverb.lessonIds)
        ? item.proverb.lessonIds
            .map((lessonId) => lessonTitleMap.get(String(lessonId)) || String(lessonId))
            .filter(Boolean)
        : [];

      console.dir(
        {
          id: String(item.proverb._id),
          text: String(item.proverb.text || ""),
          translation: String(item.proverb.translation || ""),
          contextNote: String(item.proverb.contextNote || ""),
          status: String(item.proverb.status || ""),
          lessons: lessonTitles,
          reasons: item.reasons
        },
        { depth: null }
      );
    }

    if (shouldDelete) {
      const ids = suspicious.map((item) => item.proverb._id);
      const result = await ProverbModel.deleteMany({ _id: { $in: ids } });
      console.log(`Deleted ${result.deletedCount} suspicious proverbs.`);
    } else {
      console.log("Dry run only. Re-run with --delete to remove these proverb records.");
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error("Failed to inspect suspicious proverbs:", error);
  process.exit(1);
});
