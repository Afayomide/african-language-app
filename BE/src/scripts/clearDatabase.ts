import "dotenv/config";
import mongoose from "mongoose";
import LessonModel from "../models/Lesson.js";
import UnitModel from "../models/Unit.js";
import PhraseModel from "../models/Phrase.js";
import ProverbModel from "../models/Proverb.js";
import ExerciseQuestionModel from "../models/ExerciseQuestion.js";
import LessonProgressModel from "../models/learner/LessonProgress.js";
import LearnerProfileModel from "../models/learner/LearnerProfile.js";
import VoiceAudioSubmissionModel from "../models/voice/VoiceAudioSubmission.js";

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

    const lessonProgressResult = await LessonProgressModel.deleteMany({});
    console.log(`Deleted ${lessonProgressResult.deletedCount} lesson progress records.`);

    const learnerProfilesResult = await LearnerProfileModel.deleteMany({});
    console.log(`Deleted ${learnerProfilesResult.deletedCount} learner profiles.`);

    const voiceSubmissionResult = await VoiceAudioSubmissionModel.deleteMany({});
    console.log(`Deleted ${voiceSubmissionResult.deletedCount} voice submissions.`);

    const questionsResult = await ExerciseQuestionModel.deleteMany({});
    console.log(`Deleted ${questionsResult.deletedCount} questions.`);

    const proverbsResult = await ProverbModel.deleteMany({});
    console.log(`Deleted ${proverbsResult.deletedCount} proverbs.`);

    const phrasesResult = await PhraseModel.deleteMany({});
    console.log(`Deleted ${phrasesResult.deletedCount} phrases.`);

    const lessonsResult = await LessonModel.deleteMany({});
    console.log(`Deleted ${lessonsResult.deletedCount} lessons.`);

    const unitsResult = await UnitModel.deleteMany({});
    console.log(`Deleted ${unitsResult.deletedCount} units.`);

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
