import "dotenv/config";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "../infrastructure/db/drizzle/client.js";
import { lessonBlocks, lessonStages, lessons } from "../infrastructure/db/drizzle/schema.js";
import { DrizzleLessonRepository } from "../infrastructure/db/drizzle/repositories/DrizzleLessonRepository.js";
import { genObjectId } from "../infrastructure/db/drizzle/ids.js";
import type { LessonStage } from "../domain/entities/Lesson.js";

const repo = new DrizzleLessonRepository();
const UNIT_ID = genObjectId();
const USER_ID = genObjectId();
const created: string[] = [];

function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail === undefined ? "" : ` -> ${JSON.stringify(detail)}`}`);
  if (!ok) process.exitCode = 1;
}

// deliberately out of order to prove orderIndex sorting on read
const STAGES: LessonStage[] = [
  {
    id: "not-a-valid-id",
    title: "Second stage",
    description: "b",
    orderIndex: 1,
    blocks: [{ type: "proverb", refId: genObjectId() }]
  },
  {
    id: genObjectId(),
    title: "First stage",
    description: "a",
    orderIndex: 0,
    blocks: [
      { type: "text", content: "Welcome" },
      { type: "content", contentType: "sentence", refId: genObjectId(), translationIndex: 2 },
      { type: "question", refId: genObjectId() }
    ]
  }
];

async function main() {
  const lesson = await repo.create({
    title: "Market Basics",
    unitId: UNIT_ID,
    language: "yoruba",
    level: "beginner",
    kind: "core",
    orderIndex: 0,
    description: "buying things",
    topics: ["market", "money"],
    proverbs: [{ text: "Owó ni koko", translation: "Money matters", contextNote: "note" }],
    stages: STAGES,
    status: "draft",
    createdBy: USER_ID
  });
  created.push(lesson.id);

  check("create returns hex id", /^[a-f\d]{24}$/i.test(lesson.id), lesson.id);
  check("create persists scalar fields", lesson.title === "Market Basics" && lesson.orderIndex === 0);
  check("create persists topics array", lesson.topics.length === 2, lesson.topics);
  check("create persists inline proverbs jsonb", lesson.proverbs[0]?.text === "Owó ni koko");

  // stages come back sorted by orderIndex, not insertion order
  check("stages sorted by orderIndex", lesson.stages.map((s) => s.title).join("|") === "First stage|Second stage",
    lesson.stages.map((s) => s.title));
  check("valid stage id PRESERVED", lesson.stages[0].id === STAGES[1].id, lesson.stages[0].id);
  check("invalid stage id REGENERATED as hex", /^[a-f\d]{24}$/i.test(lesson.stages[1].id), lesson.stages[1].id);

  const first = lesson.stages[0];
  check("block order preserved", first.blocks.map((b) => b.type).join("|") === "text|content|question",
    first.blocks.map((b) => b.type));

  const textBlock = first.blocks[0];
  check("text block round-trips content", textBlock.type === "text" && textBlock.content === "Welcome");

  const contentBlock = first.blocks[1];
  check("content block keeps contentType/refId/translationIndex",
    contentBlock.type === "content" && contentBlock.contentType === "sentence" && contentBlock.translationIndex === 2,
    contentBlock);

  const proverbBlock = lesson.stages[1].blocks[0];
  check("proverb block keeps refId", proverbBlock.type === "proverb" && !!proverbBlock.refId);

  // read path
  const found = await repo.findById(lesson.id);
  check("findById hydrates stages", found?.stages.length === 2, found?.stages.length);
  check("findById hydrates blocks", found?.stages[0].blocks.length === 3);

  const scoped = await repo.findByIdAndLanguage(lesson.id, "yoruba");
  check("findByIdAndLanguage matches", scoped?.id === lesson.id);
  check("findByIdAndLanguage rejects wrong language", (await repo.findByIdAndLanguage(lesson.id, "igbo")) === null);

  // update: replacing stages must not orphan blocks
  const keptStageId = found!.stages[0].id;
  const updated = await repo.updateById(lesson.id, {
    title: "Market Basics v2",
    stages: [{ id: keptStageId, title: "Only stage", description: "", orderIndex: 0, blocks: [{ type: "text", content: "Just one" }] }]
  });
  check("update changes scalar", updated?.title === "Market Basics v2");
  check("update replaces stages", updated?.stages.length === 1, updated?.stages.length);
  check("update preserves round-tripped stage id", updated?.stages[0].id === keptStageId);
  check("update replaces blocks", updated?.stages[0].blocks.length === 1);

  const orphanBlocks = await db.select().from(lessonBlocks)
    .where(inArray(lessonBlocks.stageId, [found!.stages[1].id]));
  check("removed stage's blocks cascade-deleted", orphanBlocks.length === 0, orphanBlocks.length);

  const totalStages = await db.select().from(lessonStages).where(eq(lessonStages.lessonId, lesson.id));
  check("no orphan stage rows left", totalStages.length === 1, totalStages.length);

  // summaries
  const summaries = await repo.listSummaries({ unitId: UNIT_ID });
  check("listSummaries returns lesson", summaries.length === 1, summaries.length);
  check("listSummaries computes stageCount", summaries[0].stageCount === 1, summaries[0].stageCount);

  // ordering helpers
  const second = await repo.create({
    title: "Second lesson", unitId: UNIT_ID, language: "yoruba", level: "beginner",
    orderIndex: 7, description: "", status: "draft", createdBy: USER_ID
  });
  created.push(second.id);

  check("findLastOrderIndex returns max", (await repo.findLastOrderIndex(UNIT_ID)) === 7);

  await repo.reorderByIds([second.id, lesson.id]);
  const reordered = await repo.listByUnitId(UNIT_ID);
  check("reorderByIds applies array position",
    reordered[0].id === second.id && reordered[0].orderIndex === 0 && reordered[1].orderIndex === 1,
    reordered.map((l) => [l.title, l.orderIndex]));

  await db.update(lessons).set({ orderIndex: 50 }).where(eq(lessons.id, second.id));
  await repo.compactOrderIndexesByUnit(UNIT_ID);
  const compacted = await repo.listByUnitId(UNIT_ID);
  check("compactOrderIndexes renumbers 0..n",
    compacted.map((l) => l.orderIndex).join(",") === "0,1", compacted.map((l) => l.orderIndex));

  // status transitions
  check("publish rejects non-finished lesson", (await repo.publishById(lesson.id, new Date())) === null);
  const finished = await repo.finishByIdAndLanguage(lesson.id, "yoruba");
  check("finish sets status", finished?.status === "finished");
  const published = await repo.publishById(lesson.id, new Date());
  check("publish works once finished", published?.status === "published");
  check("publish sets publishedAt", !!published?.publishedAt);

  // id lookups
  check("findByIdsAndUnit filters by unit",
    (await repo.findByIdsAndUnit([lesson.id, genObjectId()], UNIT_ID)).length === 1);
  check("findByIdsAndLanguage filters by language",
    (await repo.findByIdsAndLanguage([lesson.id], "igbo")).length === 0);

  // soft delete / restore
  const deleted = await repo.softDeleteById(lesson.id);
  check("softDelete sets deletedAt", !!deleted?.deletedAt);
  check("findById hides soft-deleted", (await repo.findById(lesson.id)) === null);
  check("listDeletedByUnitId surfaces it", (await repo.listDeletedByUnitId(UNIT_ID)).length === 1);

  const restored = await repo.restoreById(lesson.id, 3);
  check("restore clears deletedAt", restored?.deletedAt === null);
  check("restore applies new orderIndex", restored?.orderIndex === 3, restored?.orderIndex);
  check("restore keeps stages intact", restored?.stages.length === 1, restored?.stages.length);

  // cleanup + verify cascade
  const stageIds = (await db.select().from(lessonStages).where(inArray(lessonStages.lessonId, created))).map((s) => s.id);
  await db.delete(lessons).where(inArray(lessons.id, created));
  const leftStages = await db.select().from(lessonStages).where(inArray(lessonStages.lessonId, created));
  const leftBlocks = stageIds.length
    ? await db.select().from(lessonBlocks).where(inArray(lessonBlocks.stageId, stageIds))
    : [];
  check("deleting lesson cascades stages", leftStages.length === 0);
  check("deleting lesson cascades blocks", leftBlocks.length === 0);
  console.log("\ncleanup done");
}

main()
  .catch(async (error) => {
    console.error("SMOKE TEST ERROR", error);
    process.exitCode = 1;
    if (created.length) await db.delete(lessons).where(inArray(lessons.id, created));
  })
  .finally(async () => {
    await pool.end();
  });
