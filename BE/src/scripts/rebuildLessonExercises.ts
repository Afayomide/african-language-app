/**
 * Rebuild a lesson's exercises under today's selection rules, and show what changed.
 *
 * A lesson's blocks are written at generation and never revisited, so lessons built before
 * the selector's limits were raised are still short -- clusters at exactly 9 and 11 exercises
 * against 12-14 for lessons built since. The exercise phase is deterministic code over content
 * the lesson already has, so it can be run again without a model and without touching what
 * the lesson teaches. The rules live in AdminUnitAiContentUseCases.rebuildLessonExercises;
 * this is the plumbing: snapshot, dry run, apply, compare.
 *
 *   npx tsx src/scripts/rebuildLessonExercises.ts --lesson <id>            # dry run
 *   npx tsx src/scripts/rebuildLessonExercises.ts --lesson <id> --apply
 *   npx tsx src/scripts/rebuildLessonExercises.ts --unit <id> [--apply]    # every lesson, in order
 *
 * A single lesson is rebuilt in the context of its unit: the lessons before it are replayed as
 * dry runs into the selection state, so the subtype coverage it is scheduled for is the same
 * as in a full-unit run. Review lessons are skipped unless --include-review is passed.
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { pool } from "../infrastructure/db/drizzle/client.js";
import { getLlmClient } from "../services/llm/index.js";
import { AdminUnitAiContentUseCases } from "../application/use-cases/admin/lesson-ai/AdminUnitAiContentUseCases.js";
import { createLessonQuestionSelectionState } from "../application/services/lessonQuestionSelection.js";
import { DrizzleLessonRepository } from "../infrastructure/db/drizzle/repositories/DrizzleLessonRepository.js";
import { DrizzleWordRepository } from "../infrastructure/db/drizzle/repositories/DrizzleWordRepository.js";
import { DrizzleExpressionRepository } from "../infrastructure/db/drizzle/repositories/DrizzleExpressionRepository.js";
import { DrizzleSentenceRepository } from "../infrastructure/db/drizzle/repositories/DrizzleSentenceRepository.js";
import { DrizzleChapterRepository } from "../infrastructure/db/drizzle/repositories/DrizzleChapterRepository.js";
import { DrizzleLessonContentItemRepository } from "../infrastructure/db/drizzle/repositories/DrizzleLessonContentItemRepository.js";
import { DrizzleUnitContentItemRepository } from "../infrastructure/db/drizzle/repositories/DrizzleUnitContentItemRepository.js";
import { DrizzleProverbRepository } from "../infrastructure/db/drizzle/repositories/DrizzleProverbRepository.js";
import { DrizzleQuestionRepository } from "../infrastructure/db/drizzle/repositories/DrizzleQuestionRepository.js";
import { DrizzleUnitRepository } from "../infrastructure/db/drizzle/repositories/DrizzleUnitRepository.js";

const APPLY = process.argv.includes("--apply");
const INCLUDE_REVIEW = process.argv.includes("--include-review");
const arg = (name: string) => {
  const at = process.argv.indexOf(`--${name}`);
  return at < 0 ? "" : String(process.argv[at + 1] || "").trim();
};

const lessons = new DrizzleLessonRepository();
const questions = new DrizzleQuestionRepository();
const units = new DrizzleUnitRepository();
const useCases = new AdminUnitAiContentUseCases(
  lessons,
  new DrizzleWordRepository(),
  new DrizzleExpressionRepository(),
  new DrizzleSentenceRepository(),
  new DrizzleChapterRepository(),
  new DrizzleLessonContentItemRepository(),
  new DrizzleUnitContentItemRepository(),
  new DrizzleProverbRepository(),
  questions,
  units,
  getLlmClient()
);

type Shape = { stage: number; kind: string; subtype: string; source: string }[];

/** The lesson as the learner meets it: every block, in order, with what each question is. */
async function snapshot(lessonId: string) {
  const lesson = await lessons.findById(lessonId);
  if (!lesson) throw new Error(`lesson ${lessonId} not found`);
  const live = await questions.list({ lessonId });
  const byId = new Map(live.map((question) => [question.id, question] as const));
  const shape: Shape = [];
  for (const stage of [...(lesson.stages || [])].sort((a, b) => a.orderIndex - b.orderIndex)) {
    for (const block of stage.blocks) {
      if (block.type === "question") {
        const question = byId.get(block.refId);
        shape.push({
          stage: stage.orderIndex + 1,
          kind: "question",
          subtype: question?.subtype || "(missing)",
          source: question?.sourceType || "?"
        });
      } else if (block.type === "content") shape.push({ stage: stage.orderIndex + 1, kind: `card:${block.contentType}`, subtype: "", source: "" });
      else shape.push({ stage: stage.orderIndex + 1, kind: block.type, subtype: "", source: "" });
    }
  }
  return { lesson, live, shape };
}

function summarize(shape: Shape) {
  const perStage = [1, 2, 3].map((stage) => shape.filter((b) => b.stage === stage && b.kind === "question").length);
  const subtypes = shape.filter((b) => b.kind === "question").map((b) => `${b.subtype}/${b.source}`);
  return { exercises: perStage.reduce((a, b) => a + b, 0), perStage, subtypes };
}

function printShape(label: string, shape: Shape) {
  const s = summarize(shape);
  console.log(`${label}: ${s.exercises} exercises  (stages ${s.perStage.join(" / ")})`);
  for (const stage of [1, 2, 3]) {
    const blocks = shape.filter((b) => b.stage === stage);
    if (!blocks.length) continue;
    console.log(`   stage ${stage}: ${blocks.map((b) => (b.kind === "question" ? `${b.subtype}[${b.source[0]}]` : b.kind)).join("  ")}`);
  }
}

function diff(before: Shape, after: Shape) {
  const count = (shape: Shape) => {
    const m = new Map<string, number>();
    for (const b of shape) if (b.kind === "question") m.set(`${b.subtype}/${b.source}`, (m.get(`${b.subtype}/${b.source}`) || 0) + 1);
    return m;
  };
  const a = count(before);
  const b = count(after);
  const added: string[] = [];
  const removed: string[] = [];
  for (const [key, n] of b) if (n > (a.get(key) || 0)) added.push(`${key} ×${n - (a.get(key) || 0)}`);
  for (const [key, n] of a) if (n > (b.get(key) || 0)) removed.push(`${key} ×${n - (b.get(key) || 0)}`);
  return { added, removed };
}

async function main() {
  const lessonId = arg("lesson");
  const unitId = arg("unit");
  if (!lessonId && !unitId) throw new Error("pass --lesson <id> or --unit <id>");

  const targetUnitId = unitId || (await lessons.findById(lessonId))?.unitId;
  if (!targetUnitId) throw new Error(`lesson ${lessonId} not found`);
  const unit = await units.findById(targetUnitId);
  const unitLessons = (await lessons.list({ unitId: targetUnitId })).sort((a, b) => a.orderIndex - b.orderIndex);
  const isReview = (l: { kind: string; title: string }) => unit?.kind === "review" || l.kind === "review" || /^review/i.test(l.title);

  // The selection state must be the unit's, in lesson order, or the scheduled subtype
  // coverage for a given lesson comes out different from a real generation run.
  const selectionState = createLessonQuestionSelectionState({
    lessons: unitLessons.map((l) => ({ lessonKey: l.id, lessonMode: isReview(l) ? "review" : "core" }))
  });

  const targets = lessonId ? unitLessons.filter((l) => l.id === lessonId) : unitLessons;
  if (!targets.length) throw new Error(`lesson ${lessonId} is not in unit ${targetUnitId}`);

  mkdirSync("scratch", { recursive: true });
  console.log(`unit "${unit?.title}" -- ${unitLessons.length} lessons; ${APPLY ? "APPLYING" : "dry run"}\n`);

  for (const lesson of unitLessons) {
    const isTarget = targets.some((t) => t.id === lesson.id);
    const skipReview = isReview(lesson) && !INCLUDE_REVIEW;

    if (!isTarget || skipReview) {
      // Not being rebuilt, but it still occupies its place in the unit's rhythm: replay it into
      // the state so the lessons after it are scheduled as they would be in a full run.
      if (!skipReview) await useCases.rebuildLessonExercises({ lessonId: lesson.id, apply: false, selectionState, record: true });
      else console.log(`skip   "${lesson.title}"  (review lesson)`);
      continue;
    }

    const before = await snapshot(lesson.id);
    const backupPath = path.resolve("scratch", `rebuild-backup-${lesson.id}-${Date.now()}.json`);
    writeFileSync(backupPath, JSON.stringify({ lesson: before.lesson, questions: before.live }, null, 2));

    console.log(`\n=== "${lesson.title}" ===`);
    printShape("BEFORE", before.shape);

    const plan = await useCases.rebuildLessonExercises({ lessonId: lesson.id, apply: APPLY, selectionState, record: true });
    console.log(
      `\nplan: ${plan.candidates} candidates -> ${plan.selected.length} selected (profile ${plan.profile}); ` +
        `keeping ${plan.kept.length} model-written question(s), ${plan.cards.length} card(s), ${plan.proverbIds.length} proverb(s); replacing ${plan.replaced.length}`
    );

    if (!APPLY) {
      const planned: Shape = plan.selected.map((s) => ({ stage: s.stage, kind: "question", subtype: s.subtype, source: s.sourceType }));
      for (const k of plan.kept) planned.push({ stage: 1, kind: "question", subtype: k.subtype, source: "kept" });
      printShape("AFTER (planned)", planned);
      const d = diff(before.shape, planned);
      console.log(`   added:   ${d.added.join(", ") || "-"}`);
      console.log(`   removed: ${d.removed.join(", ") || "-"}`);
      console.log(`   backup written to ${backupPath} (nothing changed)`);
      continue;
    }

    const after = await snapshot(lesson.id);
    printShape("AFTER", after.shape);
    const d = diff(before.shape, after.shape);
    console.log(`   added:   ${d.added.join(", ") || "-"}`);
    console.log(`   removed: ${d.removed.join(", ") || "-"}`);
    const cardsBefore = before.shape.filter((b) => b.kind.startsWith("card")).length;
    const cardsAfter = after.shape.filter((b) => b.kind.startsWith("card")).length;
    const proverbsBefore = before.shape.filter((b) => b.kind === "proverb").length;
    const proverbsAfter = after.shape.filter((b) => b.kind === "proverb").length;
    console.log(`   cards ${cardsBefore} -> ${cardsAfter}, proverbs ${proverbsBefore} -> ${proverbsAfter}, exercises ${summarize(before.shape).exercises} -> ${summarize(after.shape).exercises}`);
    console.log(`   previous state saved to ${backupPath}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
