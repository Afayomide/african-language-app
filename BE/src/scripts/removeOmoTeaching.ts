/**
 * Remove Ọmọ entirely, so the word can be taught properly from scratch later.
 *
 * Ọmọ is the only one of the course's 111 introduced words with no usage of any kind: zero
 * sentence components, zero expression components, no sentence anywhere contains it. It was
 * taught in exactly one lesson -- unit 4 "The Destination Check (Where)", lesson 4 "Tracking
 * the Crowd" -- as a card plus four drills, none of which put it in a Yoruba sentence. The
 * learner was asked to recognise and pronounce a word the course never shows in use.
 *
 * Everything goes: the card, the four questions, the curriculum index rows, and the word row
 * itself. Hard deletes throughout, matching the standing decision that soft-deleted content is
 * worse than gone -- the next generation reads existing rows to decide what already exists, so
 * a soft-deleted Ọmọ would be revived rather than re-taught.
 *
 * The 12 rows were found by scanning every column of every table for the word id and the four
 * question ids, not by listing the tables I expected. That matters: the obvious query -- one
 * predicate concatenating a table's columns -- silently misses rows where any other column is
 * NULL, because NULL propagates through `||`. It hid `lesson_blocks` and `unit_content_items`
 * on the first pass. The verification below repeats the per-column scan after deleting.
 *
 * order_index is rewritten afterwards so blocks stay contiguous within each stage and the
 * lesson's content items stay contiguous. Relative order is preserved.
 *
 *   npx tsx src/scripts/removeOmoTeaching.ts           # dry run
 *   npx tsx src/scripts/removeOmoTeaching.ts --apply
 */
import "dotenv/config";
import { Client } from "pg";

const APPLY = process.argv.includes("--apply");

const WORD = "69e43090d08b4ae542444249";
const LESSON = "6a69e58c19f3951b34ec4352";

let client: Client | null = null;

/** Every column of every table, tested separately so a NULL cannot hide a match. */
async function scan(c: Client, needles: string[]) {
  const pattern = needles.join("|");
  const cols = (await c.query(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`)).rows as any[];
  const byTable = new Map<string, string[]>();
  for (const x of cols) {
    if (!byTable.has(x.table_name)) byTable.set(x.table_name, []);
    byTable.get(x.table_name)!.push(x.column_name);
  }
  const found: { table: string; n: number }[] = [];
  for (const [table, list] of byTable) {
    const preds = list.map((k) => `coalesce("${k}"::text,'') ~ $1`).join(" OR ");
    const n = (await c.query(`SELECT count(*)::int AS n FROM "${table}" WHERE ${preds}`, [pattern])).rows[0].n;
    if (n > 0) found.push({ table, n });
  }
  return found;
}

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  client = c;
  await c.connect();
  console.log(APPLY ? "=== APPLYING ===\n" : "=== DRY RUN (pass --apply to write) ===\n");

  const word = (await c.query(`SELECT id, text, translations FROM words WHERE id = $1`, [WORD])).rows[0] as any;
  if (!word) throw new Error(`word ${WORD} not found`);

  // The entire justification is that nothing uses it. Re-verify rather than trust the header.
  const usage = (await c.query(
    `SELECT (SELECT count(*)::int FROM sentence_components WHERE ref_id = $1) AS sc,
            (SELECT count(*)::int FROM expression_components WHERE ref_id = $1) AS ec,
            (SELECT count(*)::int FROM sentences s WHERE s.is_deleted = false
               AND lower(regexp_replace(normalize(s.text,NFD),'[̀-ͯ]','','g')) ~ '(^|[^a-z])omo') AS stext`,
    [WORD])).rows[0];
  if (usage.sc || usage.ec || usage.stext)
    throw new Error(`Ọmọ is in use (components ${usage.sc}/${usage.ec}, sentences ${usage.stext}); refusing`);

  const questions = (await c.query(
    `SELECT id, type, subtype FROM exercise_questions WHERE source_id = $1`, [WORD])).rows as any[];
  const qids = questions.map((q) => q.id);
  const blocks = (await c.query(
    `SELECT b.id, st.order_index AS si, b.order_index AS bi, b.type
     FROM lesson_blocks b JOIN lesson_stages st ON st.id = b.stage_id
     WHERE b.ref_id = $1 OR b.ref_id = ANY($2::text[])
     ORDER BY st.order_index, b.order_index`, [WORD, qids])).rows as any[];

  console.log(`"${word.text}"  ${JSON.stringify(word.translations)}   (0 uses, verified)\n`);
  console.log(`   lesson_blocks       ${blocks.length}`);
  for (const b of blocks) console.log(`      stage ${b.si + 1} block ${b.bi + 1}  ${b.type}`);
  console.log(`   exercise_questions  ${questions.length}`);
  for (const q of questions) console.log(`      ${q.type} / ${q.subtype}`);
  const lci = (await c.query(`SELECT count(*)::int AS n FROM lesson_content_items WHERE content_id = $1`, [WORD])).rows[0].n;
  const uci = (await c.query(`SELECT count(*)::int AS n FROM unit_content_items WHERE content_id = $1`, [WORD])).rows[0].n;
  console.log(`   lesson_content_items ${lci}`);
  console.log(`   unit_content_items   ${uci}`);
  console.log(`   words                1`);
  console.log(`   TOTAL                ${blocks.length + questions.length + lci + uci + 1} rows`);

  if (!APPLY) {
    console.log(`\ncurrent references: ${JSON.stringify(await scan(c, [WORD, ...qids]))}`);
    console.log("\n(nothing written)");
    await c.end();
    return;
  }

  await c.query("BEGIN");
  await c.query(`DELETE FROM lesson_blocks WHERE ref_id = $1 OR ref_id = ANY($2::text[])`, [WORD, qids]);
  await c.query(`DELETE FROM exercise_questions WHERE id = ANY($1::text[])`, [qids]);
  await c.query(`DELETE FROM lesson_content_items WHERE content_id = $1`, [WORD]);
  await c.query(`DELETE FROM unit_content_items WHERE content_id = $1`, [WORD]);
  await c.query(`DELETE FROM words WHERE id = $1`, [WORD]);

  // Close the gaps, preserving order.
  const stages = (await c.query(
    `SELECT id FROM lesson_stages WHERE lesson_id = $1 ORDER BY order_index`, [LESSON])).rows as any[];
  for (const st of stages) {
    const rows = (await c.query(
      `SELECT id FROM lesson_blocks WHERE stage_id = $1 ORDER BY order_index`, [st.id])).rows as any[];
    for (const [i, r] of rows.entries())
      await c.query(`UPDATE lesson_blocks SET order_index = $1 WHERE id = $2`, [i, r.id]);
  }
  const items = (await c.query(
    `SELECT id FROM lesson_content_items WHERE lesson_id = $1 ORDER BY order_index`, [LESSON])).rows as any[];
  for (const [i, r] of items.entries())
    await c.query(`UPDATE lesson_content_items SET order_index = $1 WHERE id = $2`, [i, r.id]);

  const left = await scan(c, [WORD, ...qids]);
  if (left.length) {
    await c.query("ROLLBACK");
    throw new Error(`references still present after delete: ${JSON.stringify(left)}; rolled back`);
  }
  const remaining = (await c.query(
    `SELECT count(*)::int AS n FROM lesson_blocks b JOIN lesson_stages st ON st.id = b.stage_id
     WHERE st.lesson_id = $1`, [LESSON])).rows[0].n;
  if (remaining !== 12) {
    await c.query("ROLLBACK");
    throw new Error(`expected 12 blocks left, found ${remaining}; rolled back`);
  }

  await c.query("COMMIT");
  console.log(`\ndeleted. "Tracking the Crowd" now has ${remaining} blocks; no reference to Ọmọ remains anywhere.`);
  await c.end();
}

main().catch(async (error) => {
  console.error(error?.message ?? error);
  if (APPLY) await client?.query("ROLLBACK").catch(() => {});
  process.exit(1);
});
