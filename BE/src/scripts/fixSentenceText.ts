/**
 * Correct one word in one sentence, everywhere that sentence's text was copied.
 *
 * A generated sentence can be wrong Yoruba that the reviewer let through -- `Rárá, mi fẹ́ mu.`
 * uses the negation-only pronoun `mi` as a plain subject, where `mo` belongs. Regenerating the
 * lesson to fix one word throws away everything else in it, and editing the sentence row alone
 * strands the exercises, which copy the text rather than reference it.
 *
 * This rewrites the word as a whole word (so `mi` never touches `omi`) in: the sentence's
 * text and normalized text; its component for that word, repointed to the correct word row;
 * and every live exercise on that sentence -- options, prompt, explanation, and the sentence
 * and tokens in review_data. Letter-order questions spell a single word, never a sentence, so
 * none can be on a sentence source and none need rebuilding.
 *
 *   npx tsx src/scripts/fixSentenceText.ts --sentence <id> --from mi --to mo
 *   npx tsx src/scripts/fixSentenceText.ts --sentence <id> --from mi --to mo --apply
 */
import "dotenv/config";
import { Client } from "pg";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

const APPLY = process.argv.includes("--apply");
const arg = (name: string) => {
  const at = process.argv.indexOf(`--${name}`);
  return at < 0 ? "" : String(process.argv[at + 1] || "").trim();
};
const SENTENCE_ID = arg("sentence");
const FROM = arg("from");
const TO = arg("to");

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const lowerFirst = (s: string) => (s ? s[0]!.toLowerCase() + s.slice(1) : s);
const upperFirst = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
/** Whole-word, in either capitalisation, keeping the capitalisation of each occurrence. */
function swapWord(text: string): string {
  const lower = lowerFirst(FROM);
  const upper = upperFirst(FROM);
  const boundary = (w: string) => new RegExp(`(^|[^\\p{L}\\p{M}])${escapeRegExp(w)}(?![\\p{L}\\p{M}])`, "gu");
  return text.replace(boundary(upper), `$1${upperFirst(TO)}`).replace(boundary(lower), `$1${lowerFirst(TO)}`);
}
const mentions = (v: unknown) => typeof v === "string" && swapWord(v) !== v;

async function main() {
  if (!SENTENCE_ID || !FROM || !TO) throw new Error("--sentence <id> --from <word> --to <word> are required");
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  c.on("error", (err) => console.error(`database connection error: ${err.message}`));
  await c.connect();
  const q = async (sql: string, params?: unknown[]) => (await c.query(sql, params)).rows;

  try {
    const sentence = (await q(`SELECT * FROM sentences WHERE id = $1 AND is_deleted = false`, [SENTENCE_ID]))[0];
    if (!sentence) throw new Error("sentence not found");
    const nextText = swapWord(sentence.text);
    if (nextText === sentence.text) throw new Error(`"${FROM}" does not occur as a whole word in "${sentence.text}"`);
    const clash = await q(`SELECT id FROM sentences WHERE language = $1 AND is_deleted = false AND text = $2 AND id <> $3`, [
      sentence.language,
      nextText,
      SENTENCE_ID
    ]);
    if (clash.length) throw new Error(`a sentence already reads "${nextText}" (${clash[0].id}); merge instead of rewriting`);
    console.log(`"${sentence.text}"  ->  "${nextText}"`);

    const toWord = (await q(`SELECT id, text FROM words WHERE language = $1 AND is_deleted = false AND lower(text) = lower($2) LIMIT 1`, [
      sentence.language,
      TO
    ]))[0];
    if (!toWord) throw new Error(`no word row for "${TO}" -- the component would point at nothing`);
    const components = await q(`SELECT * FROM sentence_components WHERE sentence_id = $1 ORDER BY order_index`, [SENTENCE_ID]);
    const componentUpdates = components.filter((comp) => mentions(comp.text_snapshot));
    for (const comp of componentUpdates)
      console.log(`   component ${comp.order_index}: "${comp.text_snapshot}" -> "${swapWord(comp.text_snapshot)}" (ref -> ${toWord.text} ${toWord.id})`);
    if (!componentUpdates.length) console.log("   (no component carries the word; sentence text only)");

    const questions = await q(
      `SELECT eq.*, l.title AS lesson FROM exercise_questions eq JOIN lessons l ON l.id = eq.lesson_id
        WHERE eq.source_type = 'sentence' AND eq.source_id = $1 AND eq.is_deleted = false`,
      [SENTENCE_ID]
    );
    const questionUpdates: Array<{ id: string; fields: Record<string, unknown> }> = [];
    for (const row of questions) {
      const fields: Record<string, unknown> = {};
      const options: string[] = Array.isArray(row.options) ? row.options : [];
      if (options.some(mentions)) {
        const next = options.map((o) => (mentions(o) ? swapWord(o) : o));
        if (new Set(next).size !== next.length) throw new Error(`question ${row.id}: swap would duplicate an option`);
        fields.options = next;
      }
      if (mentions(row.prompt_template)) fields.prompt_template = swapWord(row.prompt_template);
      if (mentions(row.explanation)) fields.explanation = swapWord(row.explanation);
      const review = { ...(row.review_data || {}) } as Record<string, unknown>;
      let reviewChanged = false;
      if (mentions(review.sentence)) {
        review.sentence = swapWord(review.sentence as string);
        reviewChanged = true;
      }
      if (Array.isArray(review.words) && (review.words as unknown[]).some(mentions)) {
        review.words = (review.words as unknown[]).map((w) => (mentions(w) ? swapWord(w as string) : w));
        reviewChanged = true;
      }
      if (reviewChanged) fields.review_data = review;
      const touched = Object.keys(fields);
      console.log(`   ${row.subtype.padEnd(26)} in "${row.lesson}": ${touched.length ? touched.join(", ") : "nothing copied the word"}`);
      if (touched.length) questionUpdates.push({ id: row.id, fields });
    }
    console.log(`\n${componentUpdates.length} component(s), ${questionUpdates.length} of ${questions.length} question(s) to update`);
    if (!APPLY) return console.log("\ndry run -- pass --apply to write");

    mkdirSync("scratch", { recursive: true });
    const backupPath = path.resolve("scratch", `fix-sentence-${SENTENCE_ID}-${Date.now()}.json`);
    writeFileSync(backupPath, JSON.stringify({ sentence, components, questions }, null, 2));
    await c.query("BEGIN");
    try {
      await c.query(`UPDATE sentences SET text = $1, text_normalized = $2, updated_at = now() WHERE id = $3`, [
        nextText,
        nextText.normalize("NFC").toLowerCase(),
        SENTENCE_ID
      ]);
      for (const comp of componentUpdates)
        await c.query(`UPDATE sentence_components SET text_snapshot = $1, ref_id = $2 WHERE id = $3`, [
          swapWord(comp.text_snapshot),
          toWord.id,
          comp.id
        ]);
      for (const u of questionUpdates) {
        const sets: string[] = [];
        const params: unknown[] = [];
        for (const [k, v] of Object.entries(u.fields)) {
          params.push(k === "review_data" ? JSON.stringify(v) : v);
          sets.push(`${k} = $${params.length}${k === "review_data" ? "::jsonb" : ""}`);
        }
        params.push(u.id);
        await c.query(`UPDATE exercise_questions SET ${sets.join(", ")}, updated_at = now() WHERE id = $${params.length}`, params);
      }
      await c.query("COMMIT");
    } catch (err) {
      await c.query("ROLLBACK");
      throw err;
    }
    console.log(`\napplied. previous state saved to ${backupPath}`);
  } finally {
    await c.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
