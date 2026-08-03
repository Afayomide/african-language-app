import "dotenv/config";
import { inArray, eq } from "drizzle-orm";
import { db, pool } from "../infrastructure/db/drizzle/client.js";
import { chapters, languages, units, users } from "../infrastructure/db/drizzle/schema.js";
import { DrizzleUnitRepository } from "../infrastructure/db/drizzle/repositories/DrizzleUnitRepository.js";
import { DrizzleChapterRepository } from "../infrastructure/db/drizzle/repositories/DrizzleChapterRepository.js";
import { DrizzleLanguageRepository } from "../infrastructure/db/drizzle/repositories/DrizzleLanguageRepository.js";
import { DrizzleUserRepository } from "../infrastructure/db/drizzle/repositories/DrizzleUserRepository.js";
import { genObjectId } from "../infrastructure/db/drizzle/ids.js";

const unitRepo = new DrizzleUnitRepository();
const chapterRepo = new DrizzleChapterRepository();
const langRepo = new DrizzleLanguageRepository();
const userRepo = new DrizzleUserRepository();

const USER = genObjectId();
const unitIds: string[] = [];
const chapterIds: string[] = [];
const userIds: string[] = [];

function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail === undefined ? "" : ` -> ${JSON.stringify(detail)}`}`);
  if (!ok) process.exitCode = 1;
}

async function main() {
  /* ---------------- Language (+ the languageId scoping everything depends on) --------- */
  const lang = await langRepo.create({
    code: "yoruba", name: "Yoruba", nativeName: "Yorùbá", status: "active", orderIndex: 0,
    locale: "yo-NG", region: "NG",
    branding: { heroGreeting: "Ẹ káàbọ̀", heroSubtitle: "", proverbLabel: "", primaryColor: "#111",
      secondaryColor: "", accentColor: "", iconName: "" },
    speechConfig: { ttsLocale: "yo-NG", sttLocale: "yo-NG", ttsVoiceId: "v1" },
    learningConfig: { scriptDirection: "ltr", usesToneMarks: true, usesDiacritics: true }
  });
  check("lang: create persists code", lang.code === "yoruba");
  check("lang: jsonb branding round-trips", lang.branding.heroGreeting === "Ẹ káàbọ̀");
  check("lang: empty proverbLabel defaults to 'Proverb'", lang.branding.proverbLabel === "Proverb", lang.branding.proverbLabel);
  check("lang: learningConfig booleans round-trip", lang.learningConfig.usesToneMarks === true);
  check("lang: findByCode works", (await langRepo.findByCode("yoruba"))?.id === lang.id);
  check("lang: listActive includes it", (await langRepo.listActive()).length === 1);

  const upserted = await langRepo.upsertByCode("yoruba", {
    code: "yoruba", name: "Yoruba Updated", nativeName: "Yorùbá", status: "active", orderIndex: 5,
    locale: "yo-NG", region: "NG",
    branding: lang.branding, speechConfig: lang.speechConfig, learningConfig: lang.learningConfig
  });
  check("lang: upsertByCode UPDATES instead of duplicating", upserted.id === lang.id, upserted.id);
  check("lang: upsert applied new values", upserted.name === "Yoruba Updated" && upserted.orderIndex === 5);
  check("lang: still only one row", (await langRepo.list()).length === 1);

  /* ---------------- Chapter ---------------- */
  const chapter = await chapterRepo.create({
    title: "Chapter One", description: "intro", language: "yoruba",
    level: "beginner", orderIndex: 0, status: "draft", createdBy: USER
  });
  chapterIds.push(chapter.id);
  check("chapter: create works", chapter.title === "Chapter One");
  check("chapter: languageId auto-resolved from code", chapter.languageId === lang.id, chapter.languageId);
  check("chapter: findLastOrderIndex", (await chapterRepo.findLastOrderIndex("yoruba")) === 0);

  const chapter2 = await chapterRepo.create({
    title: "Chapter Two", description: "", language: "yoruba",
    level: "beginner", orderIndex: 9, status: "draft", createdBy: USER
  });
  chapterIds.push(chapter2.id);
  await chapterRepo.reorderByIds([chapter2.id, chapter.id]);
  const chapterList = await chapterRepo.listByLanguage("yoruba");
  check("chapter: reorderByIds applies positions",
    chapterList[0].id === chapter2.id && chapterList[0].orderIndex === 0, chapterList.map((c) => c.orderIndex));

  check("chapter: publish rejects non-finished", (await chapterRepo.publishById(chapter.id, new Date())) === null);
  await chapterRepo.updateById(chapter.id, { status: "finished" });
  const chapPublished = await chapterRepo.publishById(chapter.id, new Date());
  check("chapter: publish works once finished", chapPublished?.status === "published");

  check("chapter: list filters by status array",
    (await chapterRepo.list({ language: "yoruba", status: ["published"] })).length === 1);
  const chapDeleted = await chapterRepo.softDeleteById(chapter2.id);
  check("chapter: softDelete sets deletedAt", !!chapDeleted?.deletedAt);
  check("chapter: soft-deleted hidden from list", (await chapterRepo.listByLanguage("yoruba")).length === 1);

  /* ---------------- Unit ---------------- */
  const unit = await unitRepo.create({
    chapterId: chapter.id, title: "Unit One", description: "market", language: "yoruba",
    level: "beginner", orderIndex: 0, status: "draft", createdBy: USER
  });
  unitIds.push(unit.id);
  check("unit: create works", unit.title === "Unit One");
  check("unit: languageId auto-resolved", unit.languageId === lang.id);
  check("unit: kind/reviewStyle defaults", unit.kind === "core" && unit.reviewStyle === "none");
  check("unit: lastAiRun null when unset", unit.lastAiRun === null);
  check("unit: listByChapterId finds it", (await unitRepo.listByChapterId(chapter.id)).length === 1);

  // chapterId null vs set — the isNull branch in findLastOrderIndex
  const orphanUnit = await unitRepo.create({
    chapterId: null, title: "Orphan Unit", description: "", language: "yoruba",
    level: "beginner", orderIndex: 4, status: "draft", createdBy: USER
  });
  unitIds.push(orphanUnit.id);
  check("unit: findLastOrderIndex scoped to chapterId", (await unitRepo.findLastOrderIndex("yoruba", chapter.id)) === 0);
  check("unit: findLastOrderIndex scoped to NULL chapter", (await unitRepo.findLastOrderIndex("yoruba", null)) === 4);

  // the AI telemetry jsonb — Date in, Date back out (via ISO string in the DB)
  const runAt = new Date("2026-07-01T10:00:00.000Z");
  const withRun = await unitRepo.updateLastAiRun(unit.id, {
    lastAiRun: {
      mode: "generate", createdBy: USER, createdAt: runAt,
      requestedLessons: 3, createdLessons: 3,
      skippedLessons: [{ reason: "dupe", topic: "market" }],
      lessonGenerationErrors: [], contentErrors: [],
      lessons: [{ lessonId: genObjectId(), title: "L1", contentGenerated: 5, sentencesGenerated: 4,
        existingContentLinked: 1, newContentSelected: 2, reviewContentSelected: 0,
        contentDroppedFromCandidates: 0, proverbsGenerated: 1, questionsGenerated: 6, blocksGenerated: 9 }]
    }
  });
  check("unit: lastAiRun jsonb persists", withRun?.lastAiRun?.requestedLessons === 3);
  check("unit: lastAiRun nested array persists", withRun?.lastAiRun?.lessons[0].questionsGenerated === 6);
  check("unit: lastAiRun createdAt comes back as a Date (not ISO string)",
    withRun?.lastAiRun?.createdAt instanceof Date, typeof withRun?.lastAiRun?.createdAt);
  check("unit: lastAiRun createdAt value preserved",
    withRun?.lastAiRun?.createdAt.toISOString() === runAt.toISOString(), withRun?.lastAiRun?.createdAt);

  const reread = await unitRepo.findById(unit.id);
  check("unit: lastAiRun survives re-read from DB", reread?.lastAiRun?.createdAt instanceof Date);

  const previewed = await unitRepo.updateLastAiPreviewPlan(unit.id, {
    lastAiPreviewPlan: {
      mode: "generate", createdBy: USER, createdAt: runAt, requestedLessons: 2, actualLessonCount: 2,
      settings: { lessonCount: 2, sentencesPerLesson: 5, proverbsPerLesson: 1 },
      coreLessons: [], lessonSequence: []
    }
  });
  check("unit: lastAiPreviewPlan persists", previewed?.lastAiPreviewPlan?.actualLessonCount === 2);
  check("unit: clearing lastAiRun to null works",
    (await unitRepo.updateLastAiRun(unit.id, { lastAiRun: null }))?.lastAiRun === null);

  check("unit: reviewSourceUnitIds array persists",
    (await unitRepo.updateById(unit.id, { reviewSourceUnitIds: [orphanUnit.id] }))?.reviewSourceUnitIds[0] === orphanUnit.id);
  check("unit: list filters by kind", (await unitRepo.list({ language: "yoruba", kind: "core" })).length === 2);
  check("unit: findByIdsAndLanguage rejects wrong language",
    (await unitRepo.findByIdsAndLanguage([unit.id], "igbo")).length === 0);

  /* ---------------- User ---------------- */
  const user = await userRepo.create({ email: "  Seyi@Example.COM ", passwordHash: "hash1", roles: ["learner"] });
  userIds.push(user.id);
  check("user: email lowercased + trimmed on create", user.email === "seyi@example.com", user.email);
  check("user: findByEmail is case-insensitive", (await userRepo.findByEmail("SEYI@EXAMPLE.com"))?.id === user.id);

  let dupeRejected = false;
  try {
    await userRepo.create({ email: "SEYI@example.com", passwordHash: "x", roles: ["learner"] });
  } catch { dupeRejected = true; }
  check("user: duplicate email rejected case-insensitively", dupeRejected);

  const withRole = await userRepo.addRole(user.id, "admin");
  check("user: addRole appends", withRole?.roles.join(",") === "learner,admin", withRole?.roles);
  const twice = await userRepo.addRole(user.id, "admin");
  check("user: addRole is idempotent (no duplicate)", twice?.roles.filter((r) => r === "admin").length === 1, twice?.roles);
  const removed = await userRepo.removeRole(user.id, "admin");
  check("user: removeRole pulls it", !removed?.roles.includes("admin"), removed?.roles);
  check("user: updateEmail normalizes",
    (await userRepo.updateEmail(user.id, " NEW@Example.com "))?.email === "new@example.com");
  check("user: findByIds works", (await userRepo.findByIds([user.id])).length === 1);

  // cleanup
  await db.delete(units).where(inArray(units.id, unitIds));
  await db.delete(chapters).where(inArray(chapters.id, chapterIds));
  await db.delete(users).where(inArray(users.id, userIds));
  await db.delete(languages).where(eq(languages.id, lang.id));
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
