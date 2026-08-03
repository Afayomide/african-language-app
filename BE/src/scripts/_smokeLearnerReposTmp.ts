import "dotenv/config";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "../infrastructure/db/drizzle/client.js";
import {
  learnerActivityDays, learnerContentPerformance, learnerLanguageStates,
  learnerProfiles, learnerQuestionMisses, lessonProgress, lessonStepProgress
} from "../infrastructure/db/drizzle/schema.js";
import { DrizzleLearnerProfileRepository } from "../infrastructure/db/drizzle/repositories/DrizzleLearnerProfileRepository.js";
import { DrizzleLearnerLanguageStateRepository } from "../infrastructure/db/drizzle/repositories/DrizzleLearnerLanguageStateRepository.js";
import { DrizzleLessonProgressRepository } from "../infrastructure/db/drizzle/repositories/DrizzleLessonProgressRepository.js";
import { DrizzleLearnerContentPerformanceRepository } from "../infrastructure/db/drizzle/repositories/DrizzleLearnerContentPerformanceRepository.js";
import { DrizzleLearnerQuestionMissRepository } from "../infrastructure/db/drizzle/repositories/DrizzleLearnerQuestionMissRepository.js";
import { genObjectId } from "../infrastructure/db/drizzle/ids.js";

const profileRepo = new DrizzleLearnerProfileRepository();
const stateRepo = new DrizzleLearnerLanguageStateRepository();
const progressRepo = new DrizzleLessonProgressRepository();
const perfRepo = new DrizzleLearnerContentPerformanceRepository();
const missRepo = new DrizzleLearnerQuestionMissRepository();

const USER = genObjectId();
const LESSON = genObjectId();
const WORD = genObjectId();
const QUESTION = genObjectId();
const D1 = new Date("2026-07-01T00:00:00.000Z");
const D2 = new Date("2026-07-02T00:00:00.000Z");

function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail === undefined ? "" : ` -> ${JSON.stringify(detail)}`}`);
  if (!ok) process.exitCode = 1;
}

async function main() {
  /* ---------------- LearnerProfile (+ NULL-scoped activity) ---------------- */
  const profile = await profileRepo.create({
    userId: USER, name: "Seyi", username: "seyi", currentLanguage: "yoruba", dailyGoalMinutes: 15
  });
  check("profile: create works", profile.name === "Seyi" && profile.dailyGoalMinutes === 15);
  check("profile: weeklyActivity starts empty", profile.weeklyActivity.length === 0);
  check("profile: findByUsername works", (await profileRepo.findByUsername("seyi"))?.id === profile.id);

  const withActivity = await profileRepo.updateByUserId(USER, {
    totalXp: 500,
    weeklyActivity: [{ date: D1, minutes: 20 }, { date: D2, minutes: 35 }]
  });
  check("profile: weeklyActivity written to its own table", withActivity?.weeklyActivity.length === 2);
  check("profile: activity ordered by date", withActivity?.weeklyActivity[0].minutes === 20);
  check("profile: activity date round-trips", withActivity?.weeklyActivity[0].date.toISOString() === D1.toISOString(),
    withActivity?.weeklyActivity[0].date);
  check("profile: totalXp (bigint) persists", withActivity?.totalXp === 500);

  const dbActivity = await db.select().from(learnerActivityDays).where(eq(learnerActivityDays.userId, USER));
  check("profile activity stored with NULL language scope",
    dbActivity.length === 2 && dbActivity.every((r) => r.languageCode === null), dbActivity.map((r) => r.languageCode));

  const replacedActivity = await profileRepo.updateByUserId(USER, {
    weeklyActivity: [{ date: D1, minutes: 99 }]
  });
  check("profile: weeklyActivity replace wipes old days", replacedActivity?.weeklyActivity.length === 1);
  check("profile: replaced value applied", replacedActivity?.weeklyActivity[0].minutes === 99);
  check("profile: countWithHigherTotalXp", (await profileRepo.countWithHigherTotalXp(100)) === 1);
  check("profile: countWithHigherTotalXp excludes equal/lower", (await profileRepo.countWithHigherTotalXp(500)) === 0);

  /* ---------------- LearnerLanguageState (+ language-scoped activity) ------- */
  const state = await stateRepo.create({
    userId: USER, languageCode: "yoruba", dailyGoalMinutes: 10,
    weeklyActivity: [{ date: D1, minutes: 7 }]
  });
  check("state: create works", state.languageCode === "yoruba" && state.isEnrolled === true);
  check("state: its own activity series", state.weeklyActivity.length === 1 && state.weeklyActivity[0].minutes === 7);

  const profileStillIntact = await profileRepo.findByUserId(USER);
  check("state activity did NOT leak into profile's NULL-scoped series",
    profileStillIntact?.weeklyActivity.length === 1 && profileStillIntact.weeklyActivity[0].minutes === 99,
    profileStillIntact?.weeklyActivity);

  // upsert must UPDATE, not duplicate, and create-only defaults must not clobber
  const upserted = await stateRepo.upsertByUserAndLanguage(
    USER, "yoruba",
    { userId: USER, languageCode: "yoruba", dailyGoalMinutes: 99, totalXp: 111 },
    { totalXp: 42 }
  );
  check("state: upsert updates existing row", upserted.id === state.id, upserted.id);
  check("state: upsert applied the $set field", upserted.totalXp === 42, upserted.totalXp);
  check("state: upsert did NOT clobber with create-only default", upserted.dailyGoalMinutes === 10,
    upserted.dailyGoalMinutes);
  check("state: only one row for user", (await stateRepo.listByUser(USER)).length === 1);

  const igbo = await stateRepo.upsertByUserAndLanguage(
    USER, "igbo", { userId: USER, languageCode: "igbo", dailyGoalMinutes: 5 }, {}
  );
  check("state: upsert INSERTS for a new language", igbo.languageCode === "igbo");
  check("state: user now has two states", (await stateRepo.listByUser(USER)).length === 2);
  check("state: updateByUserAndLanguage scoped correctly",
    (await stateRepo.updateByUserAndLanguage(USER, "igbo", { currentStreak: 3 }))?.currentStreak === 3);
  check("state: yoruba streak untouched",
    (await stateRepo.findByUserAndLanguage(USER, "yoruba"))?.currentStreak === 0);

  /* ---------------- LessonProgress (+ step/stage child tables) ------------- */
  const progress = await progressRepo.create({
    userId: USER, lessonId: LESSON, status: "in_progress", progressPercent: 25,
    stepProgress: [
      { stepKey: "b", status: "available", score: 0 },
      { stepKey: "a", status: "completed", score: 10, completedAt: D1 }
    ],
    stageProgress: [
      { stageId: "s2", stageIndex: 1, status: "not_started" },
      { stageId: "s1", stageIndex: 0, status: "completed", completedAt: D1 }
    ],
    currentStageIndex: 0
  });
  check("progress: create works", progress.status === "in_progress" && progress.progressPercent === 25);
  check("progress: stepProgress in child table", progress.stepProgress.length === 2);
  check("progress: stageProgress ordered by stageIndex",
    progress.stageProgress.map((s) => s.stageId).join(",") === "s1,s2", progress.stageProgress.map((s) => s.stageId));
  check("progress: step completedAt round-trips",
    progress.stepProgress.find((s) => s.stepKey === "a")?.completedAt?.toISOString() === D1.toISOString());
  check("progress: step score persists", progress.stepProgress.find((s) => s.stepKey === "a")?.score === 10);

  // create is upsert-like: calling again must NOT duplicate or reset
  const again = await progressRepo.create({
    userId: USER, lessonId: LESSON, status: "not_started", progressPercent: 0,
    stepProgress: [], stageProgress: [], currentStageIndex: 0
  });
  check("progress: create returns existing row instead of duplicating", again.id === progress.id);
  check("progress: existing values not reset by second create", again.progressPercent === 25, again.progressPercent);
  check("progress: existing children not wiped by second create", again.stepProgress.length === 2);

  const advanced = await progressRepo.updateById(progress.id, {
    status: "completed", progressPercent: 100, xpEarned: 50, completedAt: D2,
    stepProgress: [{ stepKey: "a", status: "completed", score: 20 }]
  });
  check("progress: update scalars", advanced?.status === "completed" && advanced.xpEarned === 50);
  check("progress: update replaces stepProgress", advanced?.stepProgress.length === 1);
  check("progress: stageProgress untouched when not supplied", advanced?.stageProgress.length === 2);

  const orphanSteps = await db.select().from(lessonStepProgress)
    .where(eq(lessonStepProgress.lessonProgressId, progress.id));
  check("progress: no orphan step rows after replace", orphanSteps.length === 1, orphanSteps.length);
  check("progress: listByUserAndLessonIds hydrates children",
    (await progressRepo.listByUserAndLessonIds(USER, [LESSON]))[0].stageProgress.length === 2);

  // FK cascade
  await db.delete(lessonProgress).where(eq(lessonProgress.id, progress.id));
  const cascaded = await db.select().from(lessonStepProgress)
    .where(eq(lessonStepProgress.lessonProgressId, progress.id));
  check("progress: FK CASCADE removes step rows on delete", cascaded.length === 0);

  /* ---------------- LearnerContentPerformance ($inc upsert) --------------- */
  await perfRepo.upsertMany([
    { userId: USER, language: "yoruba", contentType: "word", contentId: WORD,
      exposureIncrement: 1, attemptIncrement: 1, correctIncrement: 1, wrongIncrement: 0, retryIncrement: 0,
      speakingFailureIncrement: 0, listeningFailureIncrement: 0, contextScenarioFailureIncrement: 0,
      lastLessonId: LESSON, lastQuestionType: "multiple-choice", seenAt: D1 }
  ]);
  let perf = (await perfRepo.listByUserAndLanguage(USER, "yoruba"))[0];
  check("perf: first upsert inserts", perf.exposureCount === 1 && perf.correctCount === 1);
  check("perf: firstSeenAt set", perf.firstSeenAt.toISOString() === D1.toISOString());

  await perfRepo.upsertMany([
    { userId: USER, language: "yoruba", contentType: "word", contentId: WORD,
      exposureIncrement: 2, attemptIncrement: 2, correctIncrement: 0, wrongIncrement: 2, retryIncrement: 1,
      speakingFailureIncrement: 0, listeningFailureIncrement: 0, contextScenarioFailureIncrement: 0,
      lastLessonId: LESSON, lastQuestionType: "listening", seenAt: D2 }
  ]);
  perf = (await perfRepo.listByUserAndLanguage(USER, "yoruba"))[0];
  check("perf: second upsert INCREMENTS not overwrites", perf.exposureCount === 3 && perf.wrongCount === 2,
    { exposure: perf.exposureCount, wrong: perf.wrongCount });
  check("perf: firstSeenAt preserved ($setOnInsert)", perf.firstSeenAt.toISOString() === D1.toISOString());
  check("perf: lastSeenAt updated ($set)", perf.lastSeenAt.toISOString() === D2.toISOString());
  check("perf: lastQuestionType updated", perf.lastQuestionType === "listening");
  check("perf: still a single row", (await perfRepo.listByUserAndLanguage(USER, "yoruba")).length === 1);

  // two rows for the SAME key in ONE batch must fold, not crash
  await perfRepo.upsertMany([
    { userId: USER, language: "yoruba", contentType: "word", contentId: WORD,
      exposureIncrement: 5, attemptIncrement: 0, correctIncrement: 0, wrongIncrement: 0, retryIncrement: 0,
      speakingFailureIncrement: 0, listeningFailureIncrement: 0, contextScenarioFailureIncrement: 0, seenAt: D1 },
    { userId: USER, language: "yoruba", contentType: "word", contentId: WORD,
      exposureIncrement: 7, attemptIncrement: 0, correctIncrement: 0, wrongIncrement: 0, retryIncrement: 0,
      speakingFailureIncrement: 0, listeningFailureIncrement: 0, contextScenarioFailureIncrement: 0, seenAt: D2 }
  ]);
  perf = (await perfRepo.listByUserAndLanguage(USER, "yoruba"))[0];
  check("perf: duplicate keys in one batch fold (3+5+7=15)", perf.exposureCount === 15, perf.exposureCount);

  /* ---------------- LearnerQuestionMiss ---------------- */
  await missRepo.upsertMany([
    { userId: USER, lessonId: LESSON, questionId: QUESTION, questionType: "multiple-choice",
      questionSubtype: "mc-select-translation", sourceType: "word", sourceId: WORD, missIncrement: 1, seenAt: D1 }
  ]);
  let miss = (await missRepo.listByUserAndLessonIds(USER, [LESSON]))[0];
  check("miss: first upsert inserts", miss.missCount === 1);
  check("miss: sourceType/sourceId persist", miss.sourceType === "word" && miss.sourceId === WORD);

  await missRepo.upsertMany([
    { userId: USER, lessonId: LESSON, questionId: QUESTION, questionType: "multiple-choice",
      questionSubtype: "mc-select-translation", missIncrement: 0, seenAt: D2 }
  ]);
  miss = (await missRepo.listByUserAndLessonIds(USER, [LESSON]))[0];
  check("miss: increment floors at 1 (Math.max(1,0))", miss.missCount === 2, miss.missCount);
  check("miss: firstMissedAt preserved", miss.firstMissedAt.toISOString() === D1.toISOString());
  check("miss: lastMissedAt updated", miss.lastMissedAt.toISOString() === D2.toISOString());

  // cleanup
  await db.delete(learnerQuestionMisses).where(eq(learnerQuestionMisses.userId, USER));
  await db.delete(learnerContentPerformance).where(eq(learnerContentPerformance.userId, USER));
  await db.delete(learnerActivityDays).where(eq(learnerActivityDays.userId, USER));
  await db.delete(learnerLanguageStates).where(eq(learnerLanguageStates.userId, USER));
  await db.delete(learnerProfiles).where(eq(learnerProfiles.userId, USER));
  await db.delete(lessonProgress).where(inArray(lessonProgress.userId, [USER]));
  console.log("\ncleanup done");
}

main()
  .catch((error) => {
    console.error("SMOKE TEST ERROR", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
