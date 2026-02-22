import "dotenv/config";
import mongoose from "mongoose";
import LessonModel from "../models/Lesson.js";
import PhraseModel from "../models/Phrase.js";
import ExerciseQuestionModel from "../models/ExerciseQuestion.js";

const mongoUri = process.env.MONGODB_URI || "";

async function backfillSoftDeleteFields() {
  if (!mongoUri) {
    throw new Error("Missing MONGODB_URI");
  }

  await mongoose.connect(mongoUri);

  const [lessonsResult, phrasesResult, questionsResult] = await Promise.all([
    LessonModel.updateMany(
      { isDeleted: { $exists: false } },
      { $set: { isDeleted: false, deletedAt: null } }
    ),
    PhraseModel.updateMany(
      { isDeleted: { $exists: false } },
      { $set: { isDeleted: false, deletedAt: null } }
    ),
    ExerciseQuestionModel.updateMany(
      { isDeleted: { $exists: false } },
      { $set: { isDeleted: false, deletedAt: null } }
    )
  ]);

  console.log("Soft-delete backfill complete");
  console.log(`Lessons updated: ${lessonsResult.modifiedCount}`);
  console.log(`Phrases updated: ${phrasesResult.modifiedCount}`);
  console.log(`Questions updated: ${questionsResult.modifiedCount}`);

  await mongoose.disconnect();
}

backfillSoftDeleteFields().catch((error) => {
  console.error(error);
  process.exit(1);
});
