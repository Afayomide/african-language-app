import "dotenv/config";
import mongoose from "mongoose";
import LessonModel from "../models/Lesson.js";
import PhraseModel from "../models/Phrase.js";
import ProverbModel from "../models/Proverb.js";
import ExerciseQuestionModel from "../models/ExerciseQuestion.js";

const mongoUri = process.env.MONGODB_URI || "";

async function clearDatabase() {
  if (!mongoUri) {
    console.error("Missing MONGODB_URI in environment variables");
    process.exit(1);
  }

  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(mongoUri);
    console.log("Connected successfully.");

    console.log("Starting deletion process...");

    const questionsResult = await ExerciseQuestionModel.deleteMany({});
    console.log(`Deleted ${questionsResult.deletedCount} questions.`);

    const proverbsResult = await ProverbModel.deleteMany({});
    console.log(`Deleted ${proverbsResult.deletedCount} proverbs.`);

    const phrasesResult = await PhraseModel.deleteMany({});
    console.log(`Deleted ${phrasesResult.deletedCount} phrases.`);

    const lessonsResult = await LessonModel.deleteMany({});
    console.log(`Deleted ${lessonsResult.deletedCount} lessons.`);

    console.log("Database cleared successfully.");
  } catch (error) {
    console.error("Error clearing database:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
    process.exit(0);
  }
}

// Run the script
clearDatabase();
