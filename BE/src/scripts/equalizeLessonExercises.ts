/**
 * Drill every sentence in a lesson evenly, by appending only.
 *
 * The thin lessons are not short of exercises evenly -- they are lopsided. In every lesson of
 * Nutrition (Jẹ) one sentence carries three exercises and one carries none, and the selector's
 * own picks cannot help because they fall on the sentences already loaded. So this does not
 * ask the selector what it would choose; it takes every exercise the builders can make for the
 * lesson and fills from the least-drilled sentence up, until each sentence holds --per-sentence
 * exercises. Nothing existing is removed, reordered or rewritten. Generation is not touched.
 *
 * Three rules are absolute: the same sentence never gets the same exercise type twice, in any
 * stage; nor the same option set twice under different prompts; and a sentence gets at most
 * one exercise per stage. The rest are policy, as flags:
 *   --per-sentence 3   exercises each sentence should reach
 *   --stage1-cap 2     sentence exercises stage 1 may hold (the opening stage is left as it is)
 *   --stage-cap 6      exercises stages 2 and 3 may hold
 *   --per-kind 2       stage-3 sentence exercises per kind: speaking, listening, meaning-or-order
 *   --per-word 2       exercises a reviewed word may hold, so the words the lesson reviews are
 *                      drilled too, not only its sentences
 *   --only-under 12    lessons already holding this many exercises are left alone
 *   --allow-gloss-distractors   accept a translation question whose options mix a word gloss
 *                      ("mother") in with the sentence translations; refused by default
 *
 *   npx tsx src/scripts/equalizeLessonExercises.ts --unit <id>            # dry run
 *   npx tsx src/scripts/equalizeLessonExercises.ts --unit <id> --apply
 *   npx tsx src/scripts/equalizeLessonExercises.ts --lesson <id> [--apply]
 *   npx tsx src/scripts/equalizeLessonExercises.ts --undo scratch/equalize-backup-<lesson>-<time>.json
 */
import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { pool } from "../infrastructure/db/drizzle/client.js";
import { getLlmClient } from "../services/llm/index.js";
import {
  AdminUnitAiContentUseCases,
  type RebuildLessonExercisesResult
} from "../application/use-cases/admin/lesson-ai/AdminUnitAiContentUseCases.js";
import { createLessonQuestionSelectionState, getQuestionFamily } from "../application/services/lessonQuestionSelection.js";
import type { LessonBlock, LessonStage } from "../domain/entities/Lesson.js";
import type { QuestionEntity } from "../domain/entities/Question.js";
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
const arg = (name: string, fallback: string) => {
  const at = process.argv.indexOf(`--${name}`);
  return at < 0 ? fallback : String(process.argv[at + 1] || fallback).trim();
};
const PER_SENTENCE = Number(arg("per-sentence", "3"));
const STAGE1_CAP = Number(arg("stage1-cap", "2"));
const STAGE_CAP = Number(arg("stage-cap", "6"));
const PER_KIND = Number(arg("per-kind", "2"));
const PER_WORD = Number(arg("per-word", "2"));
const ONLY_UNDER = Number(arg("only-under", "12"));
const ALLOW_GLOSS_DISTRACTORS = process.argv.includes("--allow-gloss-distractors");

const lessons = new DrizzleLessonRepository();
const questions = new DrizzleQuestionRepository();
const units = new DrizzleUnitRepository();
const wordRepo = new DrizzleWordRepository();
const expressionRepo = new DrizzleExpressionRepository();
const sentenceRepo = new DrizzleSentenceRepository();
const useCases = new AdminUnitAiContentUseCases(
  lessons,
  wordRepo,
  expressionRepo,
  sentenceRepo,
  new DrizzleChapterRepository(),
  new DrizzleLessonContentItemRepository(),
  new DrizzleUnitContentItemRepository(),
  new DrizzleProverbRepository(),
  questions,
  units,
  getLlmClient()
);

type Candidate = RebuildLessonExercisesResult["drafts"][number];
type Kind = "speaking" | "listening" | "meaning_or_order" | null;
const kindOf = (family: string): Kind =>
  family === "speaking"
    ? "speaking"
    : family.includes("listening")
      ? "listening"
      : family === "translation" || family === "order"
        ? "meaning_or_order"
        : null;

type Placed = { stage: 1 | 2 | 3; sourceKey: string; sourceType: string; subtype: string; family: string; options: string[] };

function readLesson(stages: LessonStage[], live: QuestionEntity[]): Placed[] {
  const byId = new Map(live.map((q) => [q.id, q] as const));
  const placed: Placed[] = [];
  for (const stage of [...stages].sort((a, b) => a.orderIndex - b.orderIndex))
    for (const block of stage.blocks) {
      if (block.type !== "question") continue;
      const q = byId.get(block.refId);
      if (!q) continue;
      placed.push({
        stage: (stage.orderIndex + 1) as 1 | 2 | 3,
        sourceKey: `${q.sourceType}:${q.sourceId}`,
        sourceType: q.sourceType || "?",
        subtype: q.subtype,
        family: getQuestionFamily(q.type, q.subtype),
        options: q.options || []
      });
    }
  return placed;
}

const sameOptions = (a: string[], b: string[]) =>
  a.length > 0 && a.length === b.length && [...a].sort().join("\u0001") === [...b].sort().join("\u0001");

async function textOf(sourceType: string, id: string) {
  const row =
    sourceType === "sentence"
      ? (await sentenceRepo.findByIds([id]))[0]
      : sourceType === "word"
        ? (await wordRepo.findByIds([id]))[0]
        : (await expressionRepo.findByIds([id]))[0];
  return row?.text || id;
}

/** Why a candidate cannot be added to the union as it stands, or "" if it can. */
function refusal(c: Candidate, union: Placed[], sentenceMeanings: Set<string>): string {
  const key = `${c.sourceType}:${c.createInput.sourceId}`;
  const inStage = union.filter((p) => p.stage === c.stage);
  const onSource = union.filter((p) => p.sourceKey === key);
  const family = getQuestionFamily(c.type, c.subtype);
  // A lesson with fewer than four sentences pads a translation question's options with word
  // glosses ("mother" beside "Good morning, Mother."), which gives the answer away.
  if (
    !ALLOW_GLOSS_DISTRACTORS &&
    c.sourceType === "sentence" &&
    /select-translation$/.test(c.subtype) &&
    c.createInput.options.some((o) => !sentenceMeanings.has(o))
  )
    return "a word gloss stands among the sentence options";
  // The same four options under a different prompt is the same exercise to the learner.
  if (onSource.some((p) => sameOptions(p.options, c.createInput.options))) return "an exercise with these exact options is already on this source";
  if (onSource.some((p) => p.subtype === c.subtype)) return "same exercise type already on this source";
  if (onSource.some((p) => p.stage === c.stage)) return `already has an exercise in stage ${c.stage}`;
  if (c.sourceType === "sentence" && onSource.length >= PER_SENTENCE) return `sentence already at ${PER_SENTENCE}`;
  if (c.sourceType !== "sentence" && onSource.length >= PER_WORD) return `word already at ${PER_WORD}`;
  if (c.stage === 1 && c.sourceType === "sentence" && inStage.filter((p) => p.sourceType === "sentence").length >= STAGE1_CAP)
    return `stage 1 holds ${STAGE1_CAP} sentence exercises`;
  if (c.stage >= 2 && inStage.length >= STAGE_CAP) return `stage ${c.stage} at ${STAGE_CAP}`;
  if (c.stage === 3 && c.sourceType === "sentence") {
    const kind = kindOf(family);
    if (kind && inStage.filter((p) => p.sourceType === "sentence" && kindOf(p.family) === kind).length >= PER_KIND)
      return `stage 3 already has ${PER_KIND} ${kind.replace(/_/g, " ")} sentence exercises`;
  }
  return "";
}

/** Put a lesson back the way its backup recorded it: stages restored, questions added since soft-deleted. */
async function undo(backupPath: string) {
  const backup = JSON.parse(readFileSync(backupPath, "utf8")) as { lesson: { id: string; title: string; stages: LessonStage[] }; questions: QuestionEntity[] };
  const known = new Set(backup.questions.map((q) => q.id));
  const live = await questions.list({ lessonId: backup.lesson.id });
  const added = live.filter((q) => !known.has(q.id));
  console.log(`undo "${backup.lesson.title}": ${added.length} questions to soft-delete, stages restored from backup`);
  for (const q of added) console.log(`   -  ${q.subtype.padEnd(26)} ${q.sourceType}:${q.sourceId}`);
  const now = new Date();
  for (const q of added) await questions.softDeleteById(q.id, now);
  await lessons.updateById(backup.lesson.id, { stages: backup.lesson.stages });
  const after = readLesson((await lessons.findById(backup.lesson.id))?.stages || [], await questions.list({ lessonId: backup.lesson.id }));
  console.log(`   lesson now ${after.length} exercises (stages ${[1, 2, 3].map((s) => after.filter((p) => p.stage === s).length).join(" / ")})`);
}

async function main() {
  const undoPath = arg("undo", "");
  if (undoPath) return undo(undoPath);
  const lessonId = arg("lesson", "");
  const unitId = arg("unit", "");
  if (!lessonId && !unitId) throw new Error("pass --lesson <id> or --unit <id>");
  const targetUnitId = unitId || (await lessons.findById(lessonId))?.unitId;
  if (!targetUnitId) throw new Error(`lesson ${lessonId} not found`);
  const unit = await units.findById(targetUnitId);
  const unitLessons = (await lessons.list({ unitId: targetUnitId })).sort((a, b) => a.orderIndex - b.orderIndex);
  const isReview = (l: { kind: string; title: string }) => unit?.kind === "review" || l.kind === "review" || /^review/i.test(l.title);
  const selectionState = createLessonQuestionSelectionState({
    lessons: unitLessons.map((l) => ({ lessonKey: l.id, lessonMode: isReview(l) ? "review" : "core" }))
  });
  const targets = lessonId ? unitLessons.filter((l) => l.id === lessonId) : unitLessons.filter((l) => !isReview(l));

  mkdirSync("scratch", { recursive: true });
  console.log(
    `unit "${unit?.title}" -- ${unitLessons.length} lessons; per-sentence ${PER_SENTENCE}, stage-1 cap ${STAGE1_CAP}, stage cap ${STAGE_CAP}, per-kind ${PER_KIND}, per-word ${PER_WORD}; ${APPLY ? "APPLYING" : "dry run"}`
  );

  let totalBefore = 0;
  let totalAfter = 0;
  for (const lessonRow of unitLessons) {
    if (isReview(lessonRow)) continue;
    if (!targets.some((t) => t.id === lessonRow.id)) {
      await useCases.rebuildLessonExercises({ lessonId: lessonRow.id, apply: false, selectionState, record: true });
      continue;
    }
    const lesson = await lessons.findById(lessonRow.id);
    if (!lesson) continue;
    const live = await questions.list({ lessonId: lesson.id });
    const stages = [...(lesson.stages || [])].sort((a, b) => a.orderIndex - b.orderIndex);
    const placed = readLesson(stages, live);
    const plan = await useCases.rebuildLessonExercises({ lessonId: lesson.id, apply: false, selectionState, record: true });
    if (placed.length >= ONLY_UNDER) {
      console.log(`\n=== "${lesson.title}" ===  ${placed.length} exercises, already at ${ONLY_UNDER} or more; left alone`);
      totalBefore += placed.length;
      totalAfter += placed.length;
      continue;
    }
    // The English of every sentence in the lesson: the answer of any translation draft on it.
    const sentenceMeanings = new Set(
      plan.drafts
        .filter((c) => c.sourceType === "sentence" && /select-translation$/.test(c.subtype))
        .map((c) => c.createInput.options[c.createInput.correctIndex])
        .filter((o): o is string => typeof o === "string")
    );

    const loadOf = (list: Placed[], key: string) => list.filter((p) => p.sourceKey === key).length;
    const perStage = (list: Placed[]) => [1, 2, 3].map((s) => list.filter((p) => p.stage === s).length);
    const sentenceKeys = Array.from(
      new Set(plan.drafts.filter((c) => c.sourceType === "sentence").map((c) => `sentence:${c.createInput.sourceId}`))
    );
    const wordKeys = Array.from(
      new Set(plan.drafts.filter((c) => c.sourceType !== "sentence" && c.sourceGroup === "target").map((c) => `${c.sourceType}:${c.createInput.sourceId}`))
    );

    console.log(`\n=== "${lesson.title}" ===  now ${placed.length} exercises (stages ${perStage(placed).join(" / ")})`);
    for (const key of sentenceKeys) console.log(`   ${String(loadOf(placed, key)).padStart(2)}  ${await textOf("sentence", key.split(":")[1]!)}`);
    for (const key of wordKeys) console.log(`   ${String(loadOf(placed, key)).padStart(2)}  ${key.split(":")[0]} reviewed: ${await textOf(key.split(":")[0]!, key.split(":")[1]!)}`);

    const union: Placed[] = [...placed];
    const accepted: Candidate[] = [];
    const subtypeCount = (subtype: string) => union.filter((p) => p.subtype === subtype).length;

    // Fill from the least-drilled source up. Each pass adds one exercise to the emptiest source
    // that still has an admissible candidate, preferring a type the lesson has fewest of.
    // Among sources equally drilled, the one with the fewest ways forward goes first: when a
    // stage has a single slot left, it should go to the sentence that has no other route up,
    // not to one that could still be lifted elsewhere.
    for (;;) {
      const admissible = (key: string) =>
        plan.drafts.filter((c) => `${c.sourceType}:${c.createInput.sourceId}` === key && !refusal(c, union, sentenceMeanings));
      const sources = [...sentenceKeys, ...wordKeys]
        .map((key) => ({ key, load: loadOf(union, key), isSentence: key.startsWith("sentence:"), options: admissible(key) }))
        .filter((s) => s.load < (s.isSentence ? PER_SENTENCE : PER_WORD) && s.options.length > 0)
        .sort((a, b) => a.load - b.load || a.options.length - b.options.length);
      let added = false;
      for (const source of sources) {
        // Look one step ahead: a stage that other under-drilled sources also need is contested,
        // and a source with more than one way up should leave it to them. Otherwise the empty
        // sentence takes the single free stage-2 slot and the sentence at one stays at one.
        const contested = (stage: number) =>
          sources.filter((other) => other.key !== source.key && other.options.some((c) => c.stage === stage)).length;
        const options = [...source.options].sort(
          (a, b) =>
            contested(a.stage) - contested(b.stage) ||
            subtypeCount(a.subtype) - subtypeCount(b.subtype) ||
            a.stage - b.stage
        );
        const pick = options[0];
        if (!pick) continue;
        union.push({
          stage: pick.stage,
          sourceKey: source.key,
          sourceType: pick.sourceType,
          subtype: pick.subtype,
          family: getQuestionFamily(pick.type, pick.subtype),
          options: pick.createInput.options
        });
        accepted.push(pick);
        added = true;
        break;
      }
      if (!added) break;
    }

    for (const c of accepted) {
      const key = `${c.sourceType}:${c.createInput.sourceId}`;
      // Twins can be an existing exercise or another one appended in this same run.
      const twin = union.find(
        (p) => p.sourceKey === key && p.subtype !== c.subtype && sameOptions(p.options, c.createInput.options)
      );
      const twinIsNew = twin && !placed.includes(twin);
      const answer = c.createInput.options[c.createInput.correctIndex];
      console.log(`   +  ${c.subtype.padEnd(26)} stage ${c.stage}  ${c.sourceType}: ${await textOf(c.sourceType, c.createInput.sourceId)}${twin ? `   !! same options as its ${twinIsNew ? "new" : "existing"} ${twin.subtype}` : ""}`);
      console.log(`        ${c.createInput.promptTemplate}`);
      if (c.createInput.options.length) console.log(`        ${c.createInput.options.map((o) => (o === answer ? `[${o}]` : o)).join("  |  ")}`);
    }
    // What still could not be reached, and why -- one line per source left under target.
    for (const key of [...sentenceKeys, ...wordKeys]) {
      const target = key.startsWith("sentence:") ? PER_SENTENCE : PER_WORD;
      if (loadOf(union, key) >= target) continue;
      const reasons = Array.from(
        new Set(plan.drafts.filter((c) => `${c.sourceType}:${c.createInput.sourceId}` === key).map((c) => refusal(c, union, sentenceMeanings)).filter(Boolean))
      );
      console.log(`   .  ${await textOf(key.split(":")[0]!, key.split(":")[1]!)} stays at ${loadOf(union, key)}: ${reasons.join("; ") || "no candidate types left"}`);
    }
    console.log(
      `   => ${placed.length} -> ${union.length} exercises (stages ${perStage(placed).join(" / ")} -> ${perStage(union).join(" / ")}); ` +
        `per sentence ${sentenceKeys.map((k) => loadOf(placed, k)).join(",")} -> ${sentenceKeys.map((k) => loadOf(union, k)).join(",")}`
    );
    totalBefore += placed.length;
    totalAfter += union.length;

    if (!APPLY || !accepted.length) continue;
    const backupPath = path.resolve("scratch", `equalize-backup-${lesson.id}-${Date.now()}.json`);
    writeFileSync(backupPath, JSON.stringify({ lesson, questions: live }, null, 2));
    const nextStages: LessonStage[] = stages.map((s) => ({ ...s, blocks: [...s.blocks] }));
    for (const c of accepted) {
      const created = await questions.create(c.createInput);
      const stage = nextStages[c.stage - 1];
      if (!stage) continue;
      const block: LessonBlock = { type: "question", refId: created.id };
      const proverbAt = stage.blocks.findIndex((b) => b.type === "proverb");
      if (c.stage === 3 && proverbAt >= 0) stage.blocks.splice(proverbAt, 0, block);
      else stage.blocks.push(block);
    }
    await lessons.updateById(lesson.id, { stages: nextStages });
    const after = readLesson((await lessons.findById(lesson.id))?.stages || [], await questions.list({ lessonId: lesson.id }));
    console.log(`   applied: ${accepted.length} appended; lesson now ${after.length} exercises (stages ${perStage(after).join(" / ")}); backup ${backupPath}`);
  }
  console.log(`\nunit total: ${totalBefore} -> ${totalAfter} exercises${APPLY ? "" : " (nothing written)"}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
