import "dotenv/config";
import { inArray } from "drizzle-orm";
import { db, pool } from "../infrastructure/db/drizzle/client.js";
import { exerciseQuestions, lessonContentItems, lessons, proverbs, unitContentItems } from "../infrastructure/db/drizzle/schema.js";
import { DrizzleLessonContentItemRepository } from "../infrastructure/db/drizzle/repositories/DrizzleLessonContentItemRepository.js";
import { DrizzleUnitContentItemRepository } from "../infrastructure/db/drizzle/repositories/DrizzleUnitContentItemRepository.js";
import { DrizzleProverbRepository } from "../infrastructure/db/drizzle/repositories/DrizzleProverbRepository.js";
import { DrizzleQuestionRepository } from "../infrastructure/db/drizzle/repositories/DrizzleQuestionRepository.js";
import { DrizzleLessonRepository } from "../infrastructure/db/drizzle/repositories/DrizzleLessonRepository.js";
import { genObjectId } from "../infrastructure/db/drizzle/ids.js";

const lciRepo = new DrizzleLessonContentItemRepository();
const uciRepo = new DrizzleUnitContentItemRepository();
const provRepo = new DrizzleProverbRepository();
const qRepo = new DrizzleQuestionRepository();
const lessonRepo = new DrizzleLessonRepository();

const UNIT = genObjectId();
const USER = genObjectId();
const WORD = genObjectId();
const lessonIds: string[] = [];
const proverbIds: string[] = [];

function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail === undefined ? "" : ` -> ${JSON.stringify(detail)}`}`);
  if (!ok) process.exitCode = 1;
}

async function main() {
  const lessonA = await lessonRepo.create({
    title: "Lesson A", unitId: UNIT, language: "yoruba", level: "beginner",
    orderIndex: 0, description: "", status: "draft", createdBy: USER
  });
  const lessonB = await lessonRepo.create({
    title: "Lesson B", unitId: UNIT, language: "yoruba", level: "beginner",
    orderIndex: 1, description: "", status: "draft", createdBy: USER
  });
  lessonIds.push(lessonA.id, lessonB.id);

  /* ---------------- LessonContentItem ---------------- */
  const items = await lciRepo.replaceForLesson(lessonA.id, [
    { lessonId: lessonA.id, unitId: UNIT, contentType: "word", contentId: WORD, role: "introduce", stageIndex: 0, orderIndex: 0, createdBy: USER },
    { lessonId: lessonA.id, unitId: UNIT, contentType: "sentence", contentId: genObjectId(), role: "practice", stageIndex: 1, orderIndex: 1, createdBy: USER }
  ]);
  check("lci: replaceForLesson inserts", items.length === 2, items.length);
  check("lci: stageIndex persists", items[0].stageIndex === 0);
  check("lci: list orders by orderIndex", (await lciRepo.list({ lessonId: lessonA.id }))[0].orderIndex === 0);
  check("lci: list filters by contentType",
    (await lciRepo.list({ lessonId: lessonA.id, contentType: "word" })).length === 1);
  check("lci: listByContent finds by contentId", (await lciRepo.listByContent("word", [WORD])).length === 1);

  const replaced = await lciRepo.replaceForLesson(lessonA.id, [
    { lessonId: lessonA.id, unitId: UNIT, contentType: "word", contentId: WORD, role: "review", stageIndex: null, orderIndex: 0, createdBy: USER }
  ]);
  check("lci: replaceForLesson wipes previous rows", replaced.length === 1);
  check("lci: null stageIndex round-trips as null", replaced[0].stageIndex === null, replaced[0].stageIndex);
  check("lci: total rows for lesson is 1", (await lciRepo.list({ lessonId: lessonA.id })).length === 1);

  let uniqueViolation = false;
  try {
    await lciRepo.create({ lessonId: lessonA.id, unitId: UNIT, contentType: "word", contentId: WORD, role: "introduce", stageIndex: 0, orderIndex: 5, createdBy: USER });
  } catch { uniqueViolation = true; }
  check("lci: unique (lesson, contentType, contentId) enforced", uniqueViolation);

  await lciRepo.deleteByLessonId(lessonA.id);
  check("lci: deleteByLessonId clears", (await lciRepo.list({ lessonId: lessonA.id })).length === 0);

  /* ---------------- UnitContentItem ---------------- */
  const uItems = await uciRepo.replaceForUnit(UNIT, [
    { unitId: UNIT, contentType: "word", contentId: WORD, role: "introduce", orderIndex: 0, sourceUnitId: null, createdBy: USER },
    { unitId: UNIT, contentType: "expression", contentId: genObjectId(), role: "review", orderIndex: 1, sourceUnitId: genObjectId(), createdBy: USER }
  ]);
  check("uci: replaceForUnit inserts", uItems.length === 2);
  check("uci: sourceUnitId null round-trips", uItems[0].sourceUnitId === null);
  check("uci: sourceUnitId value round-trips", !!uItems[1].sourceUnitId);
  check("uci: list filters by role", (await uciRepo.list({ unitId: UNIT, role: "review" })).length === 1);
  await uciRepo.deleteByUnitId(UNIT);
  check("uci: deleteByUnitId clears", (await uciRepo.list({ unitId: UNIT })).length === 0);

  /* ---------------- Proverb (array ops) ---------------- */
  const prov = await provRepo.create({
    lessonIds: [lessonA.id, lessonB.id, lessonA.id], language: "yoruba",
    text: "  Àgbà kì í wà lọ́jà  ", translation: "An elder is not at the market",
    contextNote: "note", aiMeta: { generatedByAI: true, model: "m" }, status: "draft"
  });
  proverbIds.push(prov.id);
  check("prov: text trimmed", prov.text === "Àgbà kì í wà lọ́jà", prov.text);
  check("prov: lessonIds deduped", prov.lessonIds.length === 2, prov.lessonIds.length);
  check("prov: aiMeta persists", prov.aiMeta.generatedByAI === true && prov.aiMeta.model === "m");
  check("prov: findReusable matches on normalizedText (case-insensitive)",
    (await provRepo.findReusable("yoruba", "  ÀGBÀ KÌ Í WÀ LỌ́JÀ "))?.id === prov.id);
  check("prov: findByLessonId uses array containment", (await provRepo.findByLessonId(lessonA.id)).length === 1);
  check("prov: list by lessonIds uses array overlap",
    (await provRepo.list({ lessonIds: [lessonB.id] })).length === 1);
  check("prov: list by unrelated lesson finds nothing",
    (await provRepo.list({ lessonIds: [genObjectId()] })).length === 0);

  // detach ONE lesson — proverb should survive with the other still attached
  await provRepo.softDeleteByLessonId(lessonA.id, new Date());
  const afterDetach = await provRepo.findById(prov.id);
  check("prov: still alive after detaching one of two lessons", afterDetach !== null);
  check("prov: detached lesson pulled from lessonIds",
    afterDetach?.lessonIds.length === 1 && afterDetach.lessonIds[0] === lessonB.id, afterDetach?.lessonIds);

  // detach the LAST lesson — now it should auto-soft-delete
  await provRepo.softDeleteByLessonId(lessonB.id, new Date());
  check("prov: auto soft-deleted once no lessons remain", (await provRepo.findById(prov.id)) === null);
  check("prov: listDeleted finds it via deletedLessonIds",
    (await provRepo.listDeleted({ lessonIds: [lessonA.id] })).length === 1);

  await provRepo.restoreByLessonId(lessonA.id);
  const restored = await provRepo.findById(prov.id);
  check("prov: restoreByLessonId revives it", restored !== null);
  check("prov: restored lesson re-added to lessonIds", restored?.lessonIds.includes(lessonA.id) === true, restored?.lessonIds);

  await provRepo.updateById(prov.id, { status: "finished" });
  const published = await provRepo.publishById(prov.id, true);
  check("prov: publish requires finished + sets published", published?.status === "published");
  check("prov: publish sets reviewedByAdmin on AI content", published?.aiMeta.reviewedByAdmin === true);

  /* ---------------- Question ---------------- */
  const SENT = genObjectId();
  const q1 = await qRepo.create({
    lessonId: lessonA.id, sourceType: "sentence", sourceId: SENT,
    relatedSourceRefs: [{ type: "word", id: WORD }],
    type: "multiple-choice", subtype: "mc-select-translation",
    promptTemplate: "What is {phrase}?", options: ["a", "b"], correctIndex: 1,
    interactionData: { matchingPairs: [{ pairId: "p1", contentType: "word", contentId: WORD, translationIndex: 0, translation: "water" }] },
    status: "draft"
  });
  check("q: create persists options/correctIndex", q1.options.length === 2 && q1.correctIndex === 1);
  check("q: relatedSourceRefs jsonb round-trips", q1.relatedSourceRefs?.[0]?.id === WORD);
  check("q: matchingPairs jsonb round-trips", q1.interactionData?.matchingPairs?.[0]?.contentId === WORD);
  check("q: list filters by type", (await qRepo.list({ lessonId: lessonA.id, type: "multiple-choice" })).length === 1);
  check("q: list filters by status array", (await qRepo.list({ lessonId: lessonA.id, status: ["draft"] })).length === 1);

  // status transitions
  check("q: publish rejects non-finished", (await qRepo.publishById(q1.id)) === null);
  await qRepo.finishById(q1.id);
  check("q: publish works once finished", (await qRepo.publishById(q1.id))?.status === "published");
  await qRepo.finishById(q1.id);
  check("q: sendBackToTutor returns to draft", (await qRepo.sendBackToTutorById(q1.id))?.status === "draft");

  // jsonb containment deletion paths
  const q2 = await qRepo.create({
    lessonId: lessonA.id, type: "matching", subtype: "mt-match-translation",
    promptTemplate: "match", options: [], correctIndex: 0,
    interactionData: { matchingPairs: [{ pairId: "p1", contentType: "word", contentId: WORD, translationIndex: 0, translation: "water" }] },
    status: "draft"
  });
  await qRepo.softDeleteBySource("word", WORD, new Date());
  check("q: softDeleteBySource hits relatedSourceRefs (jsonb @>)", (await qRepo.findById(q1.id)) === null);
  check("q: softDeleteBySource hits matchingPairs (jsonb @>)", (await qRepo.findById(q2.id)) === null);

  await qRepo.restoreByLessonId(lessonA.id);
  check("q: restoreByLessonId revives both", (await qRepo.list({ lessonId: lessonA.id })).length === 2);

  // the reused-question preservation join
  const shared = await qRepo.create({
    lessonId: lessonA.id, type: "listening", subtype: "ls-dictation",
    promptTemplate: "listen", options: [], correctIndex: 0, status: "draft"
  });
  // lesson B references `shared` via a question block
  await lessonRepo.updateById(lessonB.id, {
    stages: [{ id: genObjectId(), title: "s", description: "", orderIndex: 0,
      blocks: [{ type: "question", refId: shared.id }] }]
  });

  await qRepo.softDeleteByLessonId(lessonA.id, new Date());
  check("q: question reused by another lesson is PRESERVED", (await qRepo.findById(shared.id)) !== null);
  check("q: non-reused questions of that lesson are deleted", (await qRepo.list({ lessonId: lessonA.id })).length === 1);

  // cleanup
  await db.delete(exerciseQuestions).where(inArray(exerciseQuestions.lessonId, lessonIds));
  await db.delete(lessonContentItems).where(inArray(lessonContentItems.lessonId, lessonIds));
  await db.delete(unitContentItems).where(inArray(unitContentItems.unitId, [UNIT]));
  await db.delete(proverbs).where(inArray(proverbs.id, proverbIds));
  await db.delete(lessons).where(inArray(lessons.id, lessonIds));
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
