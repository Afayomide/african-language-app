/**
 * Fold expression rows that are really sentences into their existing sentence twin, keeping
 * every lesson that used them intact. The reverse of mergeSentencesIntoContent.ts.
 *
 * WHY. The unit planner puts any multi-word target or line into targetExpressions, and the
 * only guard on minting an expression from that list is shape (trailing full stop, length,
 * comma + length). So complete clauses such as "Ọ dị mma" and full replies such as
 * "Ee, biko" were stored as expressions next to the sentences "Ọ dị mma." and "Ee, biko."
 * that teach the same utterance.
 *
 * WHAT MOVES.
 *   exercise_questions    source -> the twin sentence; translation_index remapped by text;
 *                         prompt swapped for the sentence wording the app already uses for
 *                         that subtype when one exists with the same placeholders, else the
 *                         wording stays (payloads are self-contained). Token payloads are
 *                         left alone: they already match each other.
 *   lesson_blocks         the expression's introduce card is repointed to the sentence.
 *                         The block type allows contentType "sentence"; no such block exists
 *                         in the data yet, so the dry run calls this out.
 *   lesson_content_items  dropped when the lesson already lists the twin, else repointed as
 *                         a practice item (what every sentence item is).
 *   unit_content_items    dropped when the unit already lists the twin, else repointed as
 *                         review (what every unit sentence item is).
 *   sentence_components   a sentence built ON the expression ("Ee, ọ dị mma, daalụ.") gets
 *                         that component expanded into the expression's own word
 *                         components, glosses copied from the twin sentence's components,
 *                         and its meaning_segments component indexes shifted to match.
 *   expressions           hard deleted; expression_components cascade.
 *
 * TWIN LOOKUP. The expression text plus a trailing full stop, matched case-insensitively
 * against live sentences; an exact no-period match also counts. An expression with no twin
 * stops the run -- it is a decision, not a merge.
 *
 * SAFETY. Refuses on any learner progress row, voice submission, or related_source_refs
 * entry pointing at an expression being merged. One transaction.
 *
 *   npx tsx src/scripts/mergeExpressionsIntoSentences.ts --language=igbo --from=list.json
 *   npx tsx src/scripts/mergeExpressionsIntoSentences.ts --language=igbo --from=list.json --apply
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { Client } from "pg";

import { contentTextKey } from "../services/content/contentTextKey.js";

const APPLY = process.argv.includes("--apply");
const LANGUAGE = (process.argv.find((arg) => arg.startsWith("--language="))?.slice("--language=".length) || "").trim();
const FROM = (process.argv.find((arg) => arg.startsWith("--from="))?.slice("--from=".length) || "").trim();

if (!LANGUAGE) throw new Error("pass --language=<language>");
if (!FROM) throw new Error("pass --from=<json file listing expression texts>");

const TEXTS: string[] = JSON.parse(readFileSync(FROM, "utf8"));
if (!Array.isArray(TEXTS) || TEXTS.some((item) => typeof item !== "string" || !item.trim())) {
  throw new Error("--from must be a JSON array of non-empty strings");
}

type Segment = { text: string; sourceWordIndexes?: number[]; sourceComponentIndexes?: number[] };

type Plan = {
  expression: { id: string; text: string; translations: string[] };
  twin: { id: string; text: string; translations: string[] };
  questions: Array<{ id: string; subtype: string; oldTranslationIndex: number; newTranslationIndex: number; oldPrompt: string; newPrompt: string }>;
  blocks: Array<{ id: string; lessonTitle: string }>;
  lessonItems: Array<{ id: string; lessonTitle: string; action: "drop" | "repoint" }>;
  unitItems: Array<{ id: string; unitTitle: string; action: "drop" | "repoint" }>;
  hostSentences: Array<{
    id: string;
    text: string;
    componentId: string;
    position: number;
    expandTo: Array<{ type: string; ref_id: string; text_snapshot: string; gloss: string | null }>;
    oldSegments: Segment[];
    newSegments: Segment[];
  }>;
};

const newId = () => randomBytes(12).toString("hex");
const placeholders = (prompt: string) =>
  Array.from(String(prompt || "").matchAll(/\{(\w+)\}/g), (match) => match[1])
    .sort()
    .join(",");

/** Replace component index `position` with `count` indexes and shift everything after it. */
function expandSegments(segments: Segment[], position: number, count: number): Segment[] {
  return segments.map((segment) => {
    const indexes = Array.isArray(segment.sourceComponentIndexes) ? segment.sourceComponentIndexes : [];
    const next: number[] = [];
    for (const index of indexes) {
      if (index < position) next.push(index);
      else if (index === position) for (let k = 0; k < count; k += 1) next.push(position + k);
      else next.push(index + count - 1);
    }
    return { ...segment, sourceComponentIndexes: next };
  });
}

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const problems: string[] = [];
  const notes: string[] = [];
  const plans: Plan[] = [];
  const promptCache = new Map<string, string | null>();

  async function canonicalSentencePrompt(subtype: string): Promise<string | null> {
    if (promptCache.has(subtype)) return promptCache.get(subtype) ?? null;
    const sameLanguage = await c.query(
      `select q.prompt_template from exercise_questions q join lessons l on l.id = q.lesson_id
       where q.source_type = 'sentence' and q.subtype = $1 and q.is_deleted = false and l.is_deleted = false and l.language = $2
       order by q.created_at desc limit 1`,
      [subtype, LANGUAGE]
    );
    const any = sameLanguage.rows[0]
      ? sameLanguage
      : await c.query(
          `select prompt_template from exercise_questions where source_type = 'sentence' and subtype = $1 and is_deleted = false order by created_at desc limit 1`,
          [subtype]
        );
    const prompt = any.rows[0]?.prompt_template ? String(any.rows[0].prompt_template) : null;
    promptCache.set(subtype, prompt);
    return prompt;
  }

  try {
    console.log(APPLY ? "=== APPLYING (irreversible) ===" : "=== DRY RUN (pass --apply to write) ===");
    console.log(`language: ${LANGUAGE}   expressions listed: ${TEXTS.length}\n`);

    for (const text of TEXTS) {
      const expression = (
        await c.query(`select id, text, translations from expressions where language = $1 and is_deleted = false and text = $2`, [LANGUAGE, text])
      ).rows[0];
      if (!expression) {
        problems.push(`expression not found (live, exact text): ${JSON.stringify(text)}`);
        continue;
      }

      const twin = (
        await c.query(
          `select id, text, translations from sentences where language = $1 and is_deleted = false
           and (lower(text) = lower($2) or lower(text) = lower($3)) order by length(text) desc limit 1`,
          [LANGUAGE, `${expression.text.trim()}.`, expression.text.trim()]
        )
      ).rows[0];
      if (!twin) {
        problems.push(`no sentence twin for ${JSON.stringify(expression.text)} -- decide what this should become before merging`);
        continue;
      }

      const guards: Array<[string, string]> = [
        ["question related_source_refs mentioning the expression", `select count(*) n from exercise_questions where is_deleted = false and related_source_refs::text like '%' || $1 || '%'`],
        ["learner_content_performance rows", `select count(*) n from learner_content_performance where content_id = $1`],
        ["learner_question_misses rows", `select count(*) n from learner_question_misses where source_id = $1`],
        ["voice_audio_submissions rows", `select count(*) n from voice_audio_submissions where content_id = $1`],
        ["expression used inside another expression", `select count(*) n from expression_components where ref_id = $1`]
      ];
      for (const [label, sql] of guards) {
        const n = Number((await c.query(sql, [expression.id])).rows[0].n);
        if (n > 0) problems.push(`${JSON.stringify(expression.text)}: ${n} ${label}`);
      }

      const twinKeys = twin.translations.map((item: string) => contentTextKey(item));
      const questions = (
        await c.query(`select id, subtype, translation_index, prompt_template from exercise_questions where source_id = $1 order by created_at`, [expression.id])
      ).rows;
      const plannedQuestions: Plan["questions"] = [];
      for (const question of questions) {
        const oldPrompt = String(question.prompt_template || "");
        const canonical = await canonicalSentencePrompt(question.subtype);
        if (!canonical) notes.push(`${question.subtype}: no sentence-sourced question of this subtype exists anywhere; wording kept as-is`);
        const newPrompt = canonical && placeholders(canonical) === placeholders(oldPrompt) ? canonical : oldPrompt;
        const oldIndex = Number(question.translation_index) || 0;
        const oldTranslation = expression.translations[oldIndex] ?? expression.translations[0] ?? "";
        const matched = twinKeys.indexOf(contentTextKey(oldTranslation));
        plannedQuestions.push({ id: question.id, subtype: question.subtype, oldTranslationIndex: oldIndex, newTranslationIndex: matched >= 0 ? matched : 0, oldPrompt, newPrompt });
      }

      const blocks = (
        await c.query(
          `select b.id, l.title from lesson_blocks b join lesson_stages st on st.id = b.stage_id join lessons l on l.id = st.lesson_id
           where b.ref_id = $1 and b.type = 'content'`,
          [expression.id]
        )
      ).rows;

      const lessonItems = (
        await c.query(
          `select i.id, l.title, exists (select 1 from lesson_content_items x where x.lesson_id = i.lesson_id and x.content_id = $2) as has_twin
           from lesson_content_items i join lessons l on l.id = i.lesson_id where i.content_id = $1`,
          [expression.id, twin.id]
        )
      ).rows;
      const unitItems = (
        await c.query(
          `select i.id, u.title, exists (select 1 from unit_content_items x where x.unit_id = i.unit_id and x.content_id = $2) as has_twin
           from unit_content_items i join units u on u.id = i.unit_id where i.content_id = $1`,
          [expression.id, twin.id]
        )
      ).rows;

      // Sentences that carry this expression as a fixed component. A sentence cannot be a
      // component, so the slot is expanded into the expression's own word components.
      const ownComponents = (
        await c.query(`select type, ref_id, text_snapshot from expression_components where expression_id = $1 order by order_index`, [expression.id])
      ).rows;
      const twinGlossByRef = new Map<string, string | null>(
        (await c.query(`select ref_id, gloss from sentence_components where sentence_id = $1`, [twin.id])).rows.map((row) => [row.ref_id, row.gloss])
      );
      const hosts = (
        await c.query(
          `select sc.id as component_id, sc.order_index, s.id, s.text, s.meaning_segments
           from sentence_components sc join sentences s on s.id = sc.sentence_id where sc.ref_id = $1`,
          [expression.id]
        )
      ).rows;
      const hostSentences: Plan["hostSentences"] = [];
      for (const host of hosts) {
        if (ownComponents.length < 2 || ownComponents.some((component) => component.type !== "word")) {
          problems.push(`${JSON.stringify(expression.text)} is a component of ${JSON.stringify(host.text)} but has no word components to expand into`);
          continue;
        }
        const oldSegments: Segment[] = Array.isArray(host.meaning_segments) ? host.meaning_segments : [];
        hostSentences.push({
          id: host.id,
          text: host.text,
          componentId: host.component_id,
          position: Number(host.order_index),
          expandTo: ownComponents.map((component) => ({
            type: component.type,
            ref_id: component.ref_id,
            text_snapshot: component.text_snapshot,
            gloss: twinGlossByRef.get(component.ref_id) ?? null
          })),
          oldSegments,
          newSegments: expandSegments(oldSegments, Number(host.order_index), ownComponents.length)
        });
      }

      plans.push({
        expression: { id: expression.id, text: expression.text, translations: expression.translations },
        twin: { id: twin.id, text: twin.text, translations: twin.translations },
        questions: plannedQuestions,
        blocks: blocks.map((block) => ({ id: block.id, lessonTitle: block.title })),
        lessonItems: lessonItems.map((item) => ({ id: item.id, lessonTitle: item.title, action: item.has_twin ? "drop" : "repoint" })),
        unitItems: unitItems.map((item) => ({ id: item.id, unitTitle: item.title, action: item.has_twin ? "drop" : "repoint" })),
        hostSentences
      });
    }

    for (const plan of plans) {
      console.log(`expression ${JSON.stringify(plan.expression.text)}  ->  sentence ${JSON.stringify(plan.twin.text)}`);
      for (const q of plan.questions) {
        const flags = [
          q.oldTranslationIndex !== q.newTranslationIndex ? `tr ${q.oldTranslationIndex}->${q.newTranslationIndex}` : "",
          q.oldPrompt === q.newPrompt ? "wording kept" : ""
        ].filter(Boolean);
        console.log(`   question ${q.subtype.padEnd(26)} ${JSON.stringify(q.oldPrompt)}${q.oldPrompt !== q.newPrompt ? ` -> ${JSON.stringify(q.newPrompt)}` : ""}${flags.length ? `   [${flags.join(", ")}]` : ""}`);
      }
      for (const block of plan.blocks) console.log(`   introduce card -> sentence  in ${JSON.stringify(block.lessonTitle)}   [no sentence content block exists in the data yet]`);
      for (const item of plan.lessonItems) console.log(`   lesson item ${item.action.padEnd(7)} ${JSON.stringify(item.lessonTitle)}${item.action === "repoint" ? " as practice" : "  (lesson already lists the twin)"}`);
      for (const item of plan.unitItems) console.log(`   unit item   ${item.action.padEnd(7)} ${JSON.stringify(item.unitTitle)}${item.action === "repoint" ? " as review" : "  (unit already lists the twin)"}`);
      for (const host of plan.hostSentences) {
        console.log(`   host sentence ${JSON.stringify(host.text)}: component ${host.position} expands to ${JSON.stringify(host.expandTo.map((component) => `${component.text_snapshot}${component.gloss ? `=${component.gloss}` : ""}`))}`);
        console.log(`      segments ${JSON.stringify(host.oldSegments.map((segment) => segment.sourceComponentIndexes))} -> ${JSON.stringify(host.newSegments.map((segment) => segment.sourceComponentIndexes))}`);
      }
      console.log();
    }

    for (const note of Array.from(new Set(notes))) console.log(`note: ${note}`);
    if (notes.length) console.log();

    if (problems.length) {
      console.log("REFUSING -- fix these first:");
      for (const problem of problems) console.log(`   - ${problem}`);
      return;
    }

    const totalQuestions = plans.reduce((sum, plan) => sum + plan.questions.length, 0);
    console.log(`${plans.length} expression(s), ${totalQuestions} question(s) to move.`);

    if (!APPLY) {
      console.log("\ndry run -- nothing written.");
      return;
    }

    await c.query("begin");
    try {
      for (const plan of plans) {
        for (const q of plan.questions) {
          await c.query(
            `update exercise_questions set source_type = 'sentence', source_id = $1, translation_index = $2, prompt_template = $3, updated_at = now() where id = $4`,
            [plan.twin.id, q.newTranslationIndex, q.newPrompt, q.id]
          );
        }
        for (const block of plan.blocks) {
          await c.query(`update lesson_blocks set content_type = 'sentence', ref_id = $1 where id = $2`, [plan.twin.id, block.id]);
        }
        for (const item of plan.lessonItems) {
          if (item.action === "drop") await c.query(`delete from lesson_content_items where id = $1`, [item.id]);
          else await c.query(`update lesson_content_items set content_type = 'sentence', content_id = $1, role = 'practice', stage_index = 2, updated_at = now() where id = $2`, [plan.twin.id, item.id]);
        }
        for (const item of plan.unitItems) {
          if (item.action === "drop") await c.query(`delete from unit_content_items where id = $1`, [item.id]);
          else await c.query(`update unit_content_items set content_type = 'sentence', content_id = $1, role = 'review', updated_at = now() where id = $2`, [plan.twin.id, item.id]);
        }
        for (const host of plan.hostSentences) {
          const count = host.expandTo.length;
          // Make room after the slot, then fill the slot and the gap with the word components.
          await c.query(`update sentence_components set order_index = order_index + $1 where sentence_id = $2 and order_index > $3`, [count - 1, host.id, host.position]);
          await c.query(`delete from sentence_components where id = $1`, [host.componentId]);
          for (let k = 0; k < count; k += 1) {
            const component = host.expandTo[k];
            await c.query(
              `insert into sentence_components (id, sentence_id, type, ref_id, order_index, text_snapshot, gloss) values ($1, $2, $3, $4, $5, $6, $7)`,
              [newId(), host.id, component.type, component.ref_id, host.position + k, component.text_snapshot, component.gloss]
            );
          }
          await c.query(`update sentences set meaning_segments = $1, updated_at = now() where id = $2`, [JSON.stringify(host.newSegments), host.id]);
        }
        // expression_components cascade
        await c.query(`delete from expressions where id = $1`, [plan.expression.id]);
      }
      await c.query("commit");
    } catch (error) {
      await c.query("rollback");
      throw error;
    }

    console.log("\nmerge complete.");
  } finally {
    await c.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
