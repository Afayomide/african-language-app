/**
 * Remove content a generation run created as the wrong kind of thing.
 *
 * A unit run on 2026-09-20 produced both halves of the same fault:
 *   - sentences that are really one word or one expression (`Màmá.`, `Ẹ káàárọ̀.`), because
 *     the unit instructions used single-item lines to isolate a new word
 *   - expressions that are really sentences (`Ẹ káàárọ̀, Màmá`), duplicating a sentence row
 *
 * Both pollute the inventory: the duplicate competes with the real row for reuse, and a
 * learner can be asked to "translate the sentence Màmá."
 *
 * Detection is by rule, not by a hand-written list: within the window, a sentence whose text
 * (minus end punctuation) equals an active word or expression, and an expression whose text
 * equals an active sentence. Everything found is printed for review before anything is written.
 *
 *   npx tsx src/scripts/cleanupDuplicateContentFromRun.ts --since 2026-09-20
 *   npx tsx src/scripts/cleanupDuplicateContentFromRun.ts --since 2026-09-20 --apply
 *   npx tsx src/scripts/cleanupDuplicateContentFromRun.ts --since 2026-09-20 --hard --apply
 *
 * Lesson links, questions and the blocks pointing at those questions always go, so no lesson
 * is left pointing at nothing. The content itself is soft-deleted by default, or removed
 * outright with --hard, which also picks up rows a previous soft run already hid. Either way
 * the rows are written to scratch/ first, so a hard delete can still be reconstructed.
 */
import "dotenv/config";
import { Client } from "pg";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

const APPLY = process.argv.includes("--apply");
const HARD = process.argv.includes("--hard");
const LANGUAGE = (() => {
  const at = process.argv.indexOf("--language");
  return at < 0 ? "yoruba" : String(process.argv[at + 1] || "yoruba");
})();
const SINCE = (() => {
  const at = process.argv.indexOf("--since");
  if (at < 0) throw new Error("--since <ISO date> is required, e.g. --since 2026-09-20");
  return String(process.argv[at + 1]);
})();

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  c.on("error", (err) => console.error(`database connection error: ${err.message}`));
  await c.connect();
  try {
    // With --hard, rows an earlier soft run already hid are picked up as well.
    const visible = HARD ? "" : "AND s.is_deleted = false";
    const visibleExpression = HARD ? "" : "AND e.is_deleted = false";

    // A sentence that is really one word or one expression.
    const sentences = (await c.query(
      `SELECT s.id, s.text, s.translations[1] AS english, s.is_deleted,
              (SELECT text FROM words w WHERE w.language = s.language AND w.is_deleted = false
                 AND lower(w.text) = lower(btrim(s.text, '.?! '))) AS same_word,
              (SELECT text FROM expressions e WHERE e.language = s.language AND e.is_deleted = false
                 AND lower(e.text) = lower(btrim(s.text, '.?! '))) AS same_expression
       FROM sentences s
       WHERE s.language = $1 ${visible} AND s.created_at > $2`,
      [LANGUAGE, SINCE]
    )).rows.filter((r) => r.same_word || r.same_expression);

    // An expression that is really a sentence.
    const expressions = (await c.query(
      `SELECT e.id, e.text, e.translations[1] AS english, e.is_deleted,
              (SELECT text FROM sentences s WHERE s.language = e.language
                 AND lower(btrim(s.text, '.?! ')) = lower(btrim(e.text, '.?! ')) AND s.id <> e.id) AS same_sentence
       FROM expressions e
       WHERE e.language = $1 ${visibleExpression} AND e.created_at > $2`,
      [LANGUAGE, SINCE]
    )).rows.filter((r) => r.same_sentence);

    const ids = [...sentences.map((r) => r.id), ...expressions.map((r) => r.id)];
    if (ids.length === 0) {
      console.log("nothing to clean up");
      return;
    }

    const questions = (await c.query(
      `SELECT id, lesson_id, subtype, is_deleted FROM exercise_questions
       WHERE ${HARD ? "TRUE" : "is_deleted = false"}
         AND (source_id = ANY($1) OR related_source_refs::text ~ ANY($1) OR interaction_data::text ~ ANY($1))`,
      [ids]
    )).rows;
    const lessonLinks = (await c.query(
      `SELECT lci.id, lci.role, l.title, l.is_deleted FROM lesson_content_items lci
       JOIN lessons l ON l.id = lci.lesson_id WHERE lci.content_id = ANY($1)`,
      [ids]
    )).rows;
    const blocks = (await c.query(
      `SELECT id, ref_id, type FROM lesson_blocks WHERE ref_id = ANY($1)`,
      [[...ids, ...questions.map((q) => q.id)]]
    )).rows;

    for (const r of sentences) {
      console.log(`SENTENCE "${r.text}" (${r.english}) is really the ${r.same_word ? "word" : "expression"} "${r.same_word || r.same_expression}"`);
    }
    for (const r of expressions) {
      console.log(`EXPRESSION "${r.text}" (${r.english}) is really the sentence "${r.same_sentence}"`);
    }
    console.log(`\nalso removing: ${lessonLinks.length} lesson links, ${questions.length} questions, ${blocks.length} blocks`);
    if (!APPLY) {
      console.log("dry run -- pass --apply to write");
      return;
    }

    mkdirSync("scratch", { recursive: true });
    const backup = path.resolve("scratch", `duplicate-content-backup-${Date.now()}.json`);
    writeFileSync(backup, JSON.stringify({ sentences, expressions, questions, lessonLinks, blocks }, null, 2));

    await c.query("BEGIN");
    try {
      if (blocks.length) await c.query(`DELETE FROM lesson_blocks WHERE id = ANY($1)`, [blocks.map((b) => b.id)]);
      if (lessonLinks.length) await c.query(`DELETE FROM lesson_content_items WHERE id = ANY($1)`, [lessonLinks.map((l) => l.id)]);
      if (questions.length) {
        const questionIds = questions.map((q) => q.id);
        if (HARD) await c.query(`DELETE FROM exercise_questions WHERE id = ANY($1)`, [questionIds]);
        else {
          await c.query(
            `UPDATE exercise_questions SET is_deleted = true, deleted_at = now(), updated_at = now() WHERE id = ANY($1)`,
            [questionIds]
          );
        }
      }
      if (sentences.length) {
        const sentenceIds = sentences.map((r) => r.id);
        // Components of the row itself cascade on a hard delete; these are the ones that point
        // AT it from elsewhere, which nothing cleans up.
        await c.query(`DELETE FROM sentence_components WHERE sentence_id = ANY($1) OR ref_id = ANY($1)`, [sentenceIds]);
        if (HARD) await c.query(`DELETE FROM sentences WHERE id = ANY($1)`, [sentenceIds]);
        else {
          await c.query(
            `UPDATE sentences SET is_deleted = true, deleted_at = now(), updated_at = now() WHERE id = ANY($1)`,
            [sentenceIds]
          );
        }
      }
      if (expressions.length) {
        const expressionIds = expressions.map((r) => r.id);
        await c.query(`DELETE FROM expression_components WHERE expression_id = ANY($1) OR ref_id = ANY($1)`, [expressionIds]);
        await c.query(`DELETE FROM sentence_components WHERE ref_id = ANY($1)`, [expressionIds]);
        if (HARD) await c.query(`DELETE FROM expressions WHERE id = ANY($1)`, [expressionIds]);
        else {
          await c.query(
            `UPDATE expressions SET is_deleted = true, deleted_at = now(), updated_at = now() WHERE id = ANY($1)`,
            [expressionIds]
          );
        }
      }
      await c.query("COMMIT");
    } catch (err) {
      await c.query("ROLLBACK");
      throw err;
    }
    console.log(`removed; previous values saved to ${backup}`);
  } finally {
    await c.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
