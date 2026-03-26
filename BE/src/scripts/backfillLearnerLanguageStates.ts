import "dotenv/config";
import mongoose from "mongoose";
import LanguageModel from "../models/Language.js";
import LearnerProfileModel from "../models/learner/LearnerProfile.js";
import LessonModel from "../models/Lesson.js";
import LessonProgressModel from "../models/learner/LessonProgress.js";
import LearnerLanguageStateModel from "../models/learner/LearnerLanguageState.js";

type LanguageCode = "yoruba" | "igbo" | "hausa";

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required");

  await mongoose.connect(uri);

  const [languages, profiles, lessons, progresses] = await Promise.all([
    LanguageModel.find({}).select("_id code").lean(),
    LearnerProfileModel.find({}).lean(),
    LessonModel.find({}).select("_id language languageId").lean(),
    LessonProgressModel.find({}).select("userId lessonId status xpEarned").lean()
  ]);

  const languageIdByCode = new Map<LanguageCode, string>();
  for (const language of languages) {
    if (language.code === "yoruba" || language.code === "igbo" || language.code === "hausa") {
      languageIdByCode.set(language.code, String(language._id));
    }
  }

  const lessonLanguageById = new Map<string, { code: LanguageCode; languageId: string | null }>();
  for (const lesson of lessons) {
    if (lesson.language === "yoruba" || lesson.language === "igbo" || lesson.language === "hausa") {
      lessonLanguageById.set(String(lesson._id), {
        code: lesson.language,
        languageId: lesson.languageId ? String(lesson.languageId) : languageIdByCode.get(lesson.language) || null
      });
    }
  }

  const progressBuckets = new Map<string, {
    userId: string;
    languageCode: LanguageCode;
    totalXp: number;
    completedLessons: Set<string>;
  }>();

  for (const progress of progresses) {
    const lessonMeta = lessonLanguageById.get(String(progress.lessonId));
    if (!lessonMeta) continue;
    const key = `${String(progress.userId)}:${lessonMeta.code}`;
    const bucket = progressBuckets.get(key) || {
      userId: String(progress.userId),
      languageCode: lessonMeta.code,
      totalXp: 0,
      completedLessons: new Set<string>()
    };
    bucket.totalXp += Number(progress.xpEarned || 0);
    if (progress.status === "completed") {
      bucket.completedLessons.add(String(progress.lessonId));
    }
    progressBuckets.set(key, bucket);
  }

  let upserts = 0;

  for (const profile of profiles) {
    const currentLanguage = profile.currentLanguage as LanguageCode;
    const allLanguages = new Set<LanguageCode>([currentLanguage]);

    for (const key of progressBuckets.keys()) {
      const [userId, languageCode] = key.split(":");
      if (userId === String(profile.userId) && (languageCode === "yoruba" || languageCode === "igbo" || languageCode === "hausa")) {
        allLanguages.add(languageCode);
      }
    }

    for (const languageCode of allLanguages) {
      const bucket = progressBuckets.get(`${String(profile.userId)}:${languageCode}`);
      const isActive = currentLanguage === languageCode;
      const languageId = languageIdByCode.get(languageCode) || null;

      await LearnerLanguageStateModel.findOneAndUpdate(
        { userId: profile.userId, languageCode },
        {
          $set: {
            languageId,
            isEnrolled: true,
            dailyGoalMinutes: isActive ? profile.dailyGoalMinutes : 10,
            totalXp: bucket?.totalXp || 0,
            currentStreak: isActive ? profile.currentStreak : 0,
            longestStreak: isActive ? profile.longestStreak : 0,
            lastActiveDate: isActive ? profile.lastActiveDate || null : null,
            completedLessonsCount: bucket?.completedLessons.size || 0,
            weeklyActivity: isActive ? profile.weeklyActivity || [] : [],
            achievements: isActive ? profile.achievements || [] : []
          }
        },
        { upsert: true, new: true }
      );
      upserts += 1;
    }
  }

  console.log("[BACKFILL_LEARNER_LANGUAGE_STATES] complete", {
    profiles: profiles.length,
    progresses: progresses.length,
    statesUpserted: upserts
  });

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error("[BACKFILL_LEARNER_LANGUAGE_STATES] failed", error);
  process.exit(1);
});
