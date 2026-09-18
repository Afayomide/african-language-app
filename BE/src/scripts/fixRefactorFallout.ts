/**
 * Repair the wrong spelling at its source, and clean up what it produced.
 *
 * `Eló` was merged into `Èló` and purged from every sentence, expression, word row and question
 * -- and then a lesson refactor put it straight back. The sweep had missed the place that
 * actually matters: the curriculum metadata. A unit description reading "Introduce exactly two
 * new targets -- the question Eló ni? and the verb Fún" is not content, it is the INSTRUCTION
 * the generator is given, so the model reproduced the spelling it was handed. Content was
 * clean; the brief was not.
 *
 * It also created two phrase-shaped rows in `words` -- "Eló ni?" and "Fún mi", the first with
 * punctuation in it. A word row is one token; these are expressions, and both already existed
 * as expressions. They are retired and the lesson is pointed at the real ones, so the lesson
 * keeps its content and the corpus stops carrying the same phrase in two tables.
 *
 * Word lookup normalises case but keeps diacritics (`èló` vs `eló`), which is correct -- tone
 * marks distinguish real words -- but it does mean a misspelling never matches an existing row
 * and silently becomes a new one. Fixing the brief is what prevents that.
 *
 *   npx tsx src/scripts/fixRefactorFallout.ts           # dry run
 *   npx tsx src/scripts/fixRefactorFallout.ts --apply
 */
import "dotenv/config";
import { Client } from "pg";

const APPLY = process.argv.includes("--apply");

/** Whole-word respellings applied to curriculum text. Case-preserving. */
const RESPELL: { from: string; to: string }[] = [
  { from: "Eló", to: "Èló" },
  { from: "eló", to: "èló" }
];

const respell = (s: string) => RESPELL.reduce((acc, r) => acc.split(r.from).join(r.to), s);

/** Phrase-shaped rows wrongly created in `words`, and the expression that already covers each. */
const PHRASE_WORDS: { word: string; useExpression: string }[] = [
  { word: "Eló ni?", useExpression: "Èló ni?" },
  { word: "Fún mi", useExpression: "Fún mi" }
];

let client: Client | null = null;

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  client = c;
  await c.connect();
  console.log(APPLY ? "=== APPLYING ===\n" : "=== DRY RUN (pass --apply to write) ===\n");
  if (APPLY) await c.query("BEGIN");

  // 1. The brief. This is the fix that stops it recurring.
  console.log("--- curriculum metadata (the instructions the model reads) ---");
  for (const [table, column] of [
    ["units", "description"],
    ["lessons", "description"],
    ["chapters", "description"],
    ["units", "title"],
    ["lessons", "title"],
    ["chapters", "title"]
  ] as const) {
    const rows = (await c.query(
      `SELECT id, ${column} AS value FROM ${table}
       WHERE is_deleted = false AND ${column} IS NOT NULL AND ${column} <> ''`)).rows as any[];
    for (const row of rows) {
      const next = respell(String(row.value));
      if (next === String(row.value)) continue;
      console.log(`   ${table}.${column}: "${String(row.value).slice(0, 90)}..."`);
      console.log(`                 -> "${next.slice(0, 90)}..."`);
      if (APPLY) await c.query(`UPDATE ${table} SET ${column} = $1, updated_at = now() WHERE id = $2`, [next, row.id]);
    }
  }

  // `topics` is a text[] on lessons.
  const topicRows = (await c.query(
    `SELECT id, title, topics FROM lessons WHERE is_deleted = false AND topics IS NOT NULL`)).rows as any[];
  for (const row of topicRows) {
    const next = (row.topics as string[]).map(respell);
    if (JSON.stringify(next) === JSON.stringify(row.topics)) continue;
    console.log(`   lessons.topics ("${row.title}"): ${JSON.stringify(row.topics)}`);
    console.log(`                                -> ${JSON.stringify(next)}`);
    if (APPLY) await c.query(`UPDATE lessons SET topics = $1, updated_at = now() WHERE id = $2`, [next, row.id]);
  }

  // 2. The sentence it wrote.
  console.log("\n--- sentences ---");
  const sentences = (await c.query(
    `SELECT id, text FROM sentences WHERE is_deleted = false AND text ~ '(^|[^È])[Ee]ló'`)).rows as any[];
  for (const s of sentences) {
    const next = respell(s.text);
    console.log(`   "${s.text}" -> "${next}"`);
    if (APPLY) {
      await c.query(`UPDATE sentences SET text = $1, updated_at = now() WHERE id = $2`, [next, s.id]);
      for (const comp of (await c.query(
        `SELECT id, text_snapshot FROM sentence_components WHERE sentence_id = $1`, [s.id])).rows as any[]) {
        const nextSnap = respell(comp.text_snapshot);
        if (nextSnap !== comp.text_snapshot) {
          await c.query(`UPDATE sentence_components SET text_snapshot = $1 WHERE id = $2`, [nextSnap, comp.id]);
        }
      }
    }
  }

  // 3. Questions carry baked copies, including letter/word-order tiles.
  console.log("\n--- exercise questions ---");
  const questions = (await c.query(
    `SELECT id, subtype, options, review_data FROM exercise_questions
     WHERE is_deleted = false
       AND (array_to_string(options, ' | ') ~ '(^|[^È])[Ee]ló' OR review_data::text ~ '(^|[^È])[Ee]ló')`)).rows as any[];
  for (const q of questions) {
    const options = (q.options as string[]).map(respell);
    const review = JSON.parse(respell(JSON.stringify(q.review_data ?? null)));
    console.log(`   ${q.subtype}: ${JSON.stringify(q.options)} -> ${JSON.stringify(options)}`);
    if (APPLY) {
      await c.query(
        `UPDATE exercise_questions SET options = $1, review_data = $2, updated_at = now() WHERE id = $3`,
        [options, JSON.stringify(review), q.id]);
    }
  }

  // 4. Phrase-shaped word rows: point the lesson at the expression that already says this.
  console.log("\n--- phrase rows wrongly created in `words` ---");
  for (const p of PHRASE_WORDS) {
    const word = (await c.query(
      `SELECT id, text FROM words WHERE text = $1 AND is_deleted = false`, [p.word])).rows[0] as any;
    if (!word) { console.log(`   "${p.word}" -- already gone`); continue; }
    const expression = (await c.query(
      `SELECT id, text FROM expressions WHERE text = $1 AND is_deleted = false
       ORDER BY created_at LIMIT 1`, [p.useExpression])).rows[0] as any;
    if (!expression) throw new Error(`no expression "${p.useExpression}" to point at`);

    const slots = (await c.query(
      `SELECT count(*)::int AS n FROM lesson_content_items WHERE content_id = $1`, [word.id])).rows[0].n;
    const blocks = (await c.query(
      `SELECT count(*)::int AS n FROM lesson_blocks WHERE ref_id = $1`, [word.id])).rows[0].n;
    console.log(`   word "${word.text}" -> expression "${expression.text}"  (${slots} slots, ${blocks} blocks)`);

    if (APPLY) {
      await c.query(
        `UPDATE lesson_content_items SET content_id = $1, content_type = 'expression' WHERE content_id = $2`,
        [expression.id, word.id]);
      await c.query(
        `UPDATE lesson_blocks SET ref_id = $1, content_type = 'expression' WHERE ref_id = $2`,
        [expression.id, word.id]);
      await c.query(`UPDATE exercise_questions SET source_id = $1, source_type = 'expression'
                     WHERE source_id = $2 AND is_deleted = false`, [expression.id, word.id]);
      await c.query(`DELETE FROM sentence_components WHERE ref_id = $1`, [word.id]);
      await c.query(`DELETE FROM words WHERE id = $1`, [word.id]);
    }
  }

  if (!APPLY) { console.log("\n(nothing written)"); await c.end(); return; }

  const left = (await c.query(
    `SELECT (SELECT count(*) FROM sentences WHERE is_deleted=false AND text ~ '(^|[^È])[Ee]ló')
          + (SELECT count(*) FROM words WHERE is_deleted=false AND text ~ '(^|[^È])[Ee]ló')
          + (SELECT count(*) FROM units WHERE is_deleted=false AND description ~ '(^|[^È])[Ee]ló')
          + (SELECT count(*) FROM chapters WHERE is_deleted=false AND description ~ '(^|[^È])[Ee]ló') AS n`
  )).rows[0].n;
  if (Number(left)) { await c.query("ROLLBACK"); throw new Error(`${left} occurrences remain; rolled back`); }

  await c.query("COMMIT");
  console.log("\ncommitted");
  await c.end();
}

main().catch(async (error) => {
  console.error(error?.message ?? error);
  if (APPLY) await client?.query("ROLLBACK").catch(() => {});
  process.exit(1);
});
