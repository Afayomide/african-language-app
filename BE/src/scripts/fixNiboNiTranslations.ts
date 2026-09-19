/**
 * `Níbo ni` means "where is". Its translation list led with "where", so every exercise built
 * from it (all use translation index 0) taught `Níbo ni` = "where", and the word-gloss review
 * was handed "where" as the expression's meaning.
 *
 * The list is reordered to lead with "where is", and case-only duplicates ("Where is" beside
 * "where is") are dropped. Exercises whose meaning or correct option was the old "where" are
 * rewritten to "where is". Exercises only store translation index 0 (not the text) where they
 * do not copy it, so those follow the reorder by themselves.
 *
 *   npx tsx src/scripts/fixNiboNiTranslations.ts           # dry run
 *   npx tsx src/scripts/fixNiboNiTranslations.ts --apply
 *
 * The expression is only rewritten if its list is still the one audited. Previous values are
 * saved to scratch/ before anything is written.
 */
import "dotenv/config";
import { Client } from "pg";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

const APPLY = process.argv.includes("--apply");

const OLD_LIST = ["where", "where is", "where are", "where is it", "where did", "Where is", "Where are", "Where"];
const NEW_LIST = ["where is", "where are", "where", "where is it", "where did"];
const OLD = "where";
const NEW = "where is";

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  c.on("error", (err) => console.error(`database connection error: ${err.message}`));
  await c.connect();
  try {
    const expr = (await c.query(
      `SELECT id, translations FROM expressions WHERE language = 'yoruba' AND is_deleted = false AND text = 'Níbo ni'`
    )).rows;
    if (expr.length !== 1) throw new Error(`expected one active "Níbo ni" expression, found ${expr.length}`);
    const { id, translations } = expr[0];
    if (JSON.stringify(translations) !== JSON.stringify(OLD_LIST)) {
      throw new Error(`translations changed since the audit: ${JSON.stringify(translations)}`);
    }

    const questions = (await c.query(
      `SELECT id, subtype, options, correct_index, review_data, explanation FROM exercise_questions
       WHERE is_deleted = false AND source_type = 'expression' AND source_id = $1`,
      [id]
    )).rows;

    const updates: Array<{ id: string; options: string[]; review_data: any; explanation: string; notes: string[] }> = [];
    for (const q of questions) {
      const notes: string[] = [];
      const review = { ...(q.review_data || {}) };
      const options: string[] = [...q.options];
      let explanation: string = q.explanation;
      if (review.meaning === OLD) { review.meaning = NEW; notes.push(`meaning "${OLD}" -> "${NEW}"`); }
      if (options[q.correct_index] === OLD) { options[q.correct_index] = NEW; notes.push(`correct option "${OLD}" -> "${NEW}"`); }
      if (explanation === `The correct meaning is ${OLD}.`) {
        explanation = `The correct meaning is ${NEW}.`;
        notes.push(`explanation -> "${explanation}"`);
      } else if (/\bwhere\b/i.test(explanation)) {
        notes.push(`(explanation mentions "where", left as is: ${explanation})`);
      }
      if (notes.some((n) => !n.startsWith("("))) updates.push({ id: q.id, options, review_data: review, explanation, notes });
      console.log(`QUESTION ${q.id} ${q.subtype}: ${notes.join("; ") || "no change"}`);
    }
    console.log(`\nexpression: ${JSON.stringify(OLD_LIST)}\n         -> ${JSON.stringify(NEW_LIST)}`);
    console.log(`${updates.length} of ${questions.length} questions to update`);
    if (!APPLY) { console.log("dry run -- pass --apply to write"); return; }

    mkdirSync("scratch", { recursive: true });
    const backup = path.resolve("scratch", `nibo-ni-backup-${Date.now()}.json`);
    writeFileSync(backup, JSON.stringify({ expression: expr[0], questions }, null, 2));

    await c.query("BEGIN");
    try {
      await c.query(`UPDATE expressions SET translations = $1, updated_at = now() WHERE id = $2`, [NEW_LIST, id]);
      for (const u of updates) {
        await c.query(
          `UPDATE exercise_questions SET options = $1, review_data = $2::jsonb, explanation = $3, updated_at = now() WHERE id = $4`,
          [u.options, JSON.stringify(u.review_data), u.explanation, u.id]
        );
      }
      await c.query("COMMIT");
    } catch (err) {
      await c.query("ROLLBACK");
      throw err;
    }
    console.log(`written; previous values saved to ${backup}`);
  } finally {
    await c.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
