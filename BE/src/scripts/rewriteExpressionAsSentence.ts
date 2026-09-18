/**
 * Turn one expression into a NEW sentence with edited text, carrying its questions, lesson
 * links and introduce card along. Used for "Daalụ. Kedu?" -> "Daalụ, kedu?": two utterances
 * filed as an expression, rewritten as the single utterance the sentence guard accepts, in
 * the same shape as the existing "Nna, kedu?" / "Ehihie ọma, kedu?".
 *
 * The rewrite is a MAPPING FILE, not a heuristic. Every literal that changes -- the text,
 * the English meaning, each token as it appears in question payloads -- is listed
 * explicitly, and the script applies exact replacements only. Nothing is guessed.
 *
 * Mapping file shape:
 * {
 *   "expression": "Daalụ. Kedu?",
 *   "sentence": "Daalụ, kedu?",
 *   "translation": "Thank you, how are you?",
 *   "components": [ { "snapshot": "Daalụ" }, { "snapshot": "kedu" } ],   // in order, one per expression component
 *   "meaningSegments": [ { "text": "Thank you", "index": 0 }, { "text": "how are you", "index": 1 } ],
 *   "replace": { "Daalụ. Kedu?": "Daalụ, kedu?", "Daalụ.": "Daalụ,", "Kedu?": "kedu?", "Thank you. How are you?": "Thank you, how are you?" }
 * }
 *
 *   npx tsx src/scripts/rewriteExpressionAsSentence.ts --language=igbo --map=map.json
 *   npx tsx src/scripts/rewriteExpressionAsSentence.ts --language=igbo --map=map.json --apply
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { Client } from "pg";

import { contentTextKey } from "../services/content/contentTextKey.js";

const APPLY = process.argv.includes("--apply");
const LANGUAGE = (process.argv.find((arg) => arg.startsWith("--language="))?.slice("--language=".length) || "").trim();
const MAP = (process.argv.find((arg) => arg.startsWith("--map="))?.slice("--map=".length) || "").trim();
if (!LANGUAGE) throw new Error("pass --language=<language>");
if (!MAP) throw new Error("pass --map=<json mapping file>");

type Mapping = {
  expression: string;
  sentence: string;
  translation: string;
  components: Array<{ snapshot: string }>;
  meaningSegments: Array<{ text: string; index: number }>;
  replace: Record<string, string>;
};
const mapping: Mapping = JSON.parse(readFileSync(MAP, "utf8"));

const newId = () => randomBytes(12).toString("hex");

/** Exact, whole-string replacement on every string inside a JSON value; longest keys first. */
function rewrite(value: unknown, replacements: Array<[string, string]>, touched: Set<string>): unknown {
  if (typeof value === "string") {
    for (const [from, to] of replacements) {
      if (value === from) {
        touched.add(`${JSON.stringify(from)} -> ${JSON.stringify(to)}`);
        return to;
      }
    }
    // Gap-fill sentences carry a blank plus the surrounding tokens ("____ Kedu?").
    let next = value;
    for (const [from, to] of replacements) {
      if (next.includes(from) && /____/.test(next)) {
        next = next.split(from).join(to);
        touched.add(`${JSON.stringify(from)} -> ${JSON.stringify(to)} (inside gap text)`);
      }
    }
    return next;
  }
  if (Array.isArray(value)) return value.map((item) => rewrite(item, replacements, touched));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, rewrite(item, replacements, touched)]));
  }
  return value;
}

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    console.log(APPLY ? "=== APPLYING (irreversible) ===" : "=== DRY RUN (pass --apply to write) ===");
    const expression = (
      await c.query(`select * from expressions where language = $1 and is_deleted = false and text = $2`, [LANGUAGE, mapping.expression])
    ).rows[0];
    if (!expression) throw new Error(`expression ${JSON.stringify(mapping.expression)} not found`);

    const clash = (
      await c.query(`select text from sentences where language = $1 and is_deleted = false and text_normalized = $2`, [LANGUAGE, contentTextKey(mapping.sentence)])
    ).rows[0];
    if (clash) throw new Error(`a sentence with that key already exists: ${JSON.stringify(clash.text)}`);

    const components = (await c.query(`select type, ref_id, text_snapshot from expression_components where expression_id = $1 order by order_index`, [expression.id])).rows;
    if (components.length !== mapping.components.length) throw new Error(`expression has ${components.length} components, mapping lists ${mapping.components.length}`);
    const tokens = mapping.sentence.split(/\s+/).map((token) => token.replace(/^[.,!?;:]+|[.,!?;:]+$/g, ""));
    mapping.components.forEach((component, index) => {
      if (component.snapshot.toLowerCase() !== tokens[index]?.toLowerCase()) throw new Error(`component ${index} snapshot ${JSON.stringify(component.snapshot)} does not match sentence token ${JSON.stringify(tokens[index])}`);
    });

    const replacements = Object.entries(mapping.replace).sort((a, b) => b[0].length - a[0].length);
    const questions = (await c.query(`select id, subtype, prompt_template, options, review_data from exercise_questions where source_id = $1 order by subtype`, [expression.id])).rows;
    const plannedQuestions = questions.map((question) => {
      const touched = new Set<string>();
      return {
        id: question.id,
        subtype: question.subtype,
        options: rewrite(question.options, replacements, touched) as string[],
        reviewData: rewrite(question.review_data, replacements, touched),
        touched: Array.from(touched)
      };
    });
    const blocks = (await c.query(`select b.id, l.title from lesson_blocks b join lesson_stages st on st.id = b.stage_id join lessons l on l.id = st.lesson_id where b.ref_id = $1 and b.type = 'content'`, [expression.id])).rows;
    const lessonItems = (await c.query(`select i.id, l.title from lesson_content_items i join lessons l on l.id = i.lesson_id where i.content_id = $1`, [expression.id])).rows;
    const unitItems = (await c.query(`select i.id, u.title from unit_content_items i join units u on u.id = i.unit_id where i.content_id = $1`, [expression.id])).rows;
    const otherRefs = Number(
      (
        await c.query(
          `select (select count(*) from sentence_components where ref_id = $1) + (select count(*) from expression_components where ref_id = $1)
                + (select count(*) from learner_content_performance where content_id = $1) + (select count(*) from learner_question_misses where source_id = $1)
                + (select count(*) from voice_audio_submissions where content_id = $1) as n`,
          [expression.id]
        )
      ).rows[0].n
    );
    if (otherRefs > 0) throw new Error(`expression is still referenced elsewhere (${otherRefs} rows); refusing`);

    const meaningSegments = mapping.meaningSegments.map((segment) => ({ text: segment.text, sourceWordIndexes: [segment.index], sourceComponentIndexes: [segment.index] }));

    console.log(`expression ${JSON.stringify(expression.text)}  ->  NEW sentence ${JSON.stringify(mapping.sentence)}  = ${JSON.stringify(mapping.translation)}`);
    console.log(`   components: ${JSON.stringify(mapping.components.map((component) => component.snapshot))}   segments: ${JSON.stringify(meaningSegments.map((segment) => `${segment.text}->${segment.sourceComponentIndexes}`))}`);
    for (const q of plannedQuestions) console.log(`   question ${q.subtype.padEnd(26)} ${q.touched.length ? q.touched.join("; ") : "no text to change"}`);
    for (const block of blocks) console.log(`   introduce card -> sentence in ${JSON.stringify(block.title)}`);
    for (const item of lessonItems) console.log(`   lesson item repoint ${JSON.stringify(item.title)} as practice`);
    for (const item of unitItems) console.log(`   unit item   repoint ${JSON.stringify(item.title)} as review`);

    if (!APPLY) {
      console.log("\ndry run -- nothing written.");
      return;
    }

    const sentenceId = newId();
    await c.query("begin");
    try {
      await c.query(
        `insert into sentences (id, language_id, language, text, text_normalized, translations, pronunciation, explanation, examples, difficulty, ai_meta, audio, status, is_deleted, literal_translation, usage_notes, meaning_segments)
         select $1, language_id, language, $2, $3, $4::text[], '', explanation, '[]'::jsonb, difficulty, ai_meta, audio, status, false, '', '', $5::jsonb from expressions where id = $6`,
        [sentenceId, mapping.sentence, contentTextKey(mapping.sentence), [mapping.translation], JSON.stringify(meaningSegments), expression.id]
      );
      for (let index = 0; index < components.length; index += 1) {
        await c.query(`insert into sentence_components (id, sentence_id, type, ref_id, order_index, text_snapshot, gloss) values ($1, $2, $3, $4, $5, $6, null)`, [
          newId(),
          sentenceId,
          components[index].type,
          components[index].ref_id,
          index,
          mapping.components[index].snapshot
        ]);
      }
      for (const q of plannedQuestions) {
        await c.query(`update exercise_questions set source_type = 'sentence', source_id = $1, translation_index = 0, options = $2::text[], review_data = $3, updated_at = now() where id = $4`, [
          sentenceId,
          q.options,
          JSON.stringify(q.reviewData ?? {}),
          q.id
        ]);
      }
      for (const block of blocks) await c.query(`update lesson_blocks set content_type = 'sentence', ref_id = $1 where id = $2`, [sentenceId, block.id]);
      for (const item of lessonItems) await c.query(`update lesson_content_items set content_type = 'sentence', content_id = $1, role = 'practice', stage_index = 2, updated_at = now() where id = $2`, [sentenceId, item.id]);
      for (const item of unitItems) await c.query(`update unit_content_items set content_type = 'sentence', content_id = $1, role = 'review', updated_at = now() where id = $2`, [sentenceId, item.id]);
      await c.query(`delete from expressions where id = $1`, [expression.id]);
      await c.query("commit");
    } catch (error) {
      await c.query("rollback");
      throw error;
    }
    console.log(`\ndone. new sentence id ${sentenceId}`);
  } finally {
    await c.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
