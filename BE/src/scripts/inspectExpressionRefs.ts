import "dotenv/config";
import mongoose from "mongoose";
import ExpressionModel from "../models/Expression.js";
import SentenceModel from "../models/Sentence.js";
import LessonModel from "../models/Lesson.js";
import LessonContentItemModel from "../models/LessonContentItem.js";
import ExerciseQuestionModel from "../models/ExerciseQuestion.js";

// READ-ONLY. Reports what references the "sentence-like" expressions (full sentences that
// were wrongly stored as expressions). Use this to see the blast radius BEFORE deleting any
// of them: which lessons would lose study blocks or questions, and which sentences point at
// them as components.
//
//   node --enable-source-maps --import tsx src/scripts/inspectExpressionRefs.ts
//   Options: --language=yoruba  --date=YYYY-MM-DD (only expressions created that local day)
//            --ids=<id>,<id>     (inspect specific expression ids instead of the heuristic)
//            --all-expressions   (inspect EVERY expression, not just sentence-like ones)

function getArg(name: string) {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : "";
}
function hasFlag(name: string) {
  return process.argv.includes(name);
}

// Same discriminator as the generation guard (isSentenceLikeExpressionText).
function splitTokens(value: string) {
  return String(value || "")
    .split(/\s+/)
    .map((t) => t.trim().replace(/^[.,!?;:"'()\[\]{}]+|[.,!?;:"'()\[\]{}]+$/g, ""))
    .filter(Boolean);
}
const MAX_FIXED_EXPRESSION_WORDS = 4;
function isSentenceLike(value: string): boolean {
  const raw = String(value || "").trim();
  if (!raw) return false;
  if (/\.\s*$/.test(raw)) return true;
  const tokens = splitTokens(raw);
  if (tokens.length > MAX_FIXED_EXPRESSION_WORDS) return true;
  if (raw.includes(",") && tokens.length >= 4) return true;
  return false;
}

function localDayWindow(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return {
    start: new Date(y, m - 1, d, 0, 0, 0, 0),
    end: new Date(y, m - 1, d + 1, 0, 0, 0, 0)
  };
}

async function main() {
  const uri = process.env.MONGODB_URI || "";
  if (!uri) throw new Error("Missing MONGODB_URI");
  const language = getArg("--language").trim().toLowerCase();
  const date = getArg("--date").trim();
  const idsArg = getArg("--ids").trim();
  const allExpressions = hasFlag("--all-expressions");

  await mongoose.connect(uri);

  const exprFilter: Record<string, unknown> = { isDeleted: { $ne: true } };
  if (language) exprFilter.language = language;
  if (date) {
    const { start, end } = localDayWindow(date);
    exprFilter.createdAt = { $gte: start, $lt: end };
  }
  if (idsArg) exprFilter._id = { $in: idsArg.split(",").map((s) => s.trim()).filter(Boolean) };

  const candidates = await ExpressionModel.find(exprFilter).select("_id text translations createdAt").lean();
  const targets = idsArg || allExpressions ? candidates : candidates.filter((e) => isSentenceLike(String(e.text)));

  if (targets.length === 0) {
    console.log("[INSPECT] No matching expressions found for the given filters.");
    return;
  }

  const ids = targets.map((e) => String(e._id));
  const idSet = new Set(ids);
  const textById = new Map(targets.map((e) => [String(e._id), String(e.text)]));

  // Reference sources -------------------------------------------------------
  const [blockLessons, contentItems, refSentences, questions] = await Promise.all([
    LessonModel.find({ "stages.blocks.refId": { $in: ids }, "stages.blocks.contentType": "expression" })
      .select("_id title createdAt stages").lean(),
    LessonContentItemModel.find({ contentType: "expression", contentId: { $in: ids } })
      .select("_id lessonId contentId role stageIndex").lean(),
    SentenceModel.find({ "components.refId": { $in: ids }, "components.type": "expression" })
      .select("_id text components").lean(),
    ExerciseQuestionModel.find({
      $or: [
        { sourceType: "expression", sourceId: { $in: ids } },
        { "relatedSourceRefs.id": { $in: ids } },
        { "interactionData.matchingPairs.contentId": { $in: ids } }
      ]
    }).select("_id lessonId sourceId subtype relatedSourceRefs interactionData").lean()
  ]);

  // Per-expression tallies --------------------------------------------------
  const perExpr = new Map<string, { blocks: number; contentItems: number; sentences: number; questions: number }>();
  const bump = (id: string, key: "blocks" | "contentItems" | "sentences" | "questions") => {
    if (!idSet.has(id)) return;
    const row = perExpr.get(id) || { blocks: 0, contentItems: 0, sentences: 0, questions: 0 };
    row[key] += 1;
    perExpr.set(id, row);
  };

  // Per-lesson impact -------------------------------------------------------
  const lessonImpact = new Map<string, { title: string; lostBlocks: number; lostQuestions: number; sentenceRefs: number }>();
  const lesson = (id: string, title: string) =>
    lessonImpact.get(id) || { title, lostBlocks: 0, lostQuestions: 0, sentenceRefs: 0 };

  for (const l of blockLessons) {
    const lid = String(l._id);
    const row = lesson(lid, String(l.title || ""));
    for (const stage of (l.stages || []) as Array<{ blocks?: Array<{ contentType?: string; refId?: unknown }> }>) {
      for (const b of stage.blocks || []) {
        if (b.contentType === "expression" && b.refId && idSet.has(String(b.refId))) {
          row.lostBlocks += 1;
          bump(String(b.refId), "blocks");
        }
      }
    }
    lessonImpact.set(lid, row);
  }
  for (const item of contentItems) bump(String(item.contentId), "contentItems");
  for (const s of refSentences) {
    for (const c of (s.components || []) as Array<{ type?: string; refId?: unknown }>) {
      if (c.type === "expression" && c.refId && idSet.has(String(c.refId))) bump(String(c.refId), "sentences");
    }
  }
  for (const q of questions) {
    const lid = String(q.lessonId || "");
    const refs = new Set<string>();
    if (q.sourceId && idSet.has(String(q.sourceId))) refs.add(String(q.sourceId));
    for (const r of (q.relatedSourceRefs || []) as Array<{ id?: unknown }>) if (r.id && idSet.has(String(r.id))) refs.add(String(r.id));
    const mp = (q.interactionData as { matchingPairs?: Array<{ contentId?: unknown }> } | undefined)?.matchingPairs || [];
    for (const p of mp) if (p.contentId && idSet.has(String(p.contentId))) refs.add(String(p.contentId));
    if (refs.size === 0) continue;
    for (const rid of refs) bump(rid, "questions");
    if (lid) {
      const row = lessonImpact.get(lid) || { title: "(lesson not in block set)", lostBlocks: 0, lostQuestions: 0, sentenceRefs: 0 };
      row.lostQuestions += 1;
      lessonImpact.set(lid, row);
    }
  }
  // Fold sentence-component references up to their lessons is skipped (sentences are shared
  // across lessons); sentence refs are reported per-expression and in the totals instead.

  // Report ------------------------------------------------------------------
  console.log(`\n[INSPECT] ${targets.length} target expression(s)${date ? ` created ${date}` : ""}${language ? ` (${language})` : ""}:\n`);
  for (const id of ids) {
    const r = perExpr.get(id) || { blocks: 0, contentItems: 0, sentences: 0, questions: 0 };
    console.log(
      `  "${textById.get(id)}"\n` +
      `      lesson study-blocks: ${r.blocks} | lessonContentItem rows: ${r.contentItems} | ` +
      `sentence components: ${r.sentences} | questions: ${r.questions}`
    );
  }

  const totals = ids.reduce(
    (acc, id) => {
      const r = perExpr.get(id) || { blocks: 0, contentItems: 0, sentences: 0, questions: 0 };
      acc.blocks += r.blocks; acc.contentItems += r.contentItems; acc.sentences += r.sentences; acc.questions += r.questions;
      return acc;
    },
    { blocks: 0, contentItems: 0, sentences: 0, questions: 0 }
  );

  console.log(`\n[INSPECT] Lessons affected: ${lessonImpact.size}`);
  for (const [lid, row] of lessonImpact) {
    console.log(`  - ${row.title || lid}: would drop ${row.lostBlocks} study block(s), ${row.lostQuestions} question(s)`);
  }
  console.log(
    `\n[INSPECT] Totals across targets: ` +
      `${totals.blocks} study blocks, ${totals.contentItems} content-item rows, ` +
      `${totals.sentences} sentence-component references, ${totals.questions} questions.`
  );
  console.log(
    "\n[INSPECT] Meaning: deleting these expressions removes the study blocks and questions above from those lessons.\n" +
      "          Sentences that used them as components keep rendering, but that slot falls back to a placeholder\n" +
      "          unless the sentence is regenerated. Nothing errors; the lessons just get thinner where they leaned on them.\n"
  );
}

main()
  .catch((error) => {
    console.error("[INSPECT] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
