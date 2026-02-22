import mongoose from "mongoose";
import dotenv from "dotenv";
import PhraseModel from "../models/Phrase.js";
import LessonModel from "../models/Lesson.js";

dotenv.config();

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGO_URI is required");
  }

  await mongoose.connect(mongoUri);

  let scanned = 0;
  let updated = 0;

  const cursor = PhraseModel.find({}).cursor();
  for await (const phraseDoc of cursor) {
    scanned += 1;
    const raw = phraseDoc.toObject() as {
      _id: mongoose.Types.ObjectId;
      lessonIds?: Array<mongoose.Types.ObjectId | string>;
      lessonId?: mongoose.Types.ObjectId | string;
      language?: string;
    };

    const mergedLessonIds = Array.from(
      new Set(
        [
          ...(Array.isArray(raw.lessonIds) ? raw.lessonIds : []),
          ...(raw.lessonId ? [raw.lessonId] : [])
        ]
          .map((id) => String(id || ""))
          .filter(Boolean)
          .filter((id) => mongoose.Types.ObjectId.isValid(id))
      )
    );

    let language = raw.language ? String(raw.language) : "";
    if (!language && mergedLessonIds.length > 0) {
      const lesson = await LessonModel.findById(mergedLessonIds[0]).select("language").lean();
      if (lesson?.language) {
        language = String(lesson.language);
      }
    }
    if (!language) {
      language = "yoruba";
    }

    const updatePayload: Record<string, unknown> = {
      $set: {
        lessonIds: mergedLessonIds,
        language
      }
    };
    if (raw.lessonId !== undefined) {
      updatePayload.$unset = { lessonId: 1 };
    }

    await PhraseModel.updateOne({ _id: raw._id }, updatePayload);
    updated += 1;
  }

  console.log(`Phrase lesson migration complete. Scanned: ${scanned}, Updated: ${updated}`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Phrase lesson migration failed", error);
  await mongoose.disconnect();
  process.exit(1);
});
