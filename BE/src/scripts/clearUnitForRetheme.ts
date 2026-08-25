/**
 * Empty a unit and remove the vocabulary it existed to teach.
 *
 * "Inside and Outside" introduced `inú` and `ìta`, and nothing in the curriculum ever used
 * them again -- three sentences each, confined to that one unit, with no later unit reviewing
 * them. A word introduced once and never revisited cannot be learned, so the unit is cleared
 * and the words go with it.
 *
 * `ò sí` (the negative existential) is deliberately KEPT. It was introduced by the same unit
 * but is central to the chapter -- "complain when someone or something is not where it should
 * be" -- and the following review unit's description depends on it. Clearing the lessons drops
 * its only `introduce` row, which is what makes it eligible to be introduced again: stage-1
 * introductions skip any word already introduced elsewhere.
 *
 * Hard delete throughout. A soft-deleted row is read by the next generation's "what already
 * exists" check, which would resurrect exactly what is being removed here.
 *
 * The unit row itself survives, empty, ready to be retitled and regenerated.
 *
 *   npx tsx src/scripts/clearUnitForRetheme.ts           # dry run
 *   npx tsx src/scripts/clearUnitForRetheme.ts --apply
 */
import "dotenv/config";
import { Client } from "pg";

const APPLY = process.argv.includes("--apply");

const UNIT = "6a886290b34f71bdabc6e24f"; // Inside and Outside
/** Words the unit taught that nothing else uses. */
const DROP_WORDS = ["inú", "ìta"];
/** Kept: introduced here but needed by the rest of the chapter. */
const KEEP = "ò sí";

let client: Client | null = null;

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  client = c;
  await c.connect();
  console.log(APPLY ? "=== APPLYING (irreversible) ===\n" : "=== DRY RUN (pass --apply to write) ===\n");

  const unit = (await c.query(`SELECT title FROM units WHERE id = $1`, [UNIT])).rows[0] as any;
  if (!unit) throw new Error(`no unit ${UNIT}`);
  console.log(`unit: "${unit.title}"\n`);

  const words = (await c.query(
    `SELECT id, text FROM words WHERE lower(text) = ANY($1::text[])`,
    [DROP_WORDS.map((w) => w.toLowerCase())])).rows as any[];
  const wordIds = words.map((w) => w.id);
  console.log(`words to delete: ${words.map((w) => `"${w.text}"`).join(", ")}`);

  // Every sentence built on them, wherever it is used.
  const sentences = wordIds.length
    ? (await c.query(
        `SELECT DISTINCT s.id, s.text FROM sentences s
         JOIN sentence_components sc ON sc.sentence_id = s.id
         WHERE sc.ref_id = ANY($1::text[])`, [wordIds])).rows as any[]
    : [];
  const sentenceIds = sentences.map((s) => s.id);
  console.log(`\nsentences to delete: ${sentences.length}`);
  for (const s of sentences) {
    const others = (await c.query(
      `SELECT DISTINCT u.title FROM lesson_content_items li
       JOIN lessons l ON l.id = li.lesson_id AND l.is_deleted = false
       JOIN units u ON u.id = l.unit_id
       WHERE li.content_id = $1 AND l.unit_id <> $2`, [s.id, UNIT])).rows as any[];
    console.log(`   "${s.text}"${others.length ? `   also used by: ${others.map((o) => `"${o.title}"`).join(", ")}` : ""}`);
  }

  const lessons = (await c.query(
    `SELECT id, title FROM lessons WHERE unit_id = $1`, [UNIT])).rows as any[];
  const lessonIds = lessons.map((l) => l.id);
  console.log(`\nlessons to delete: ${lessons.length}`);
  lessons.forEach((l) => console.log(`   "${l.title}"`));

  const keptExpr = (await c.query(
    `SELECT id, text FROM expressions WHERE lower(text) = lower($1) AND is_deleted = false`,
    [KEEP])).rows[0] as any;
  if (!keptExpr) throw new Error(`"${KEEP}" not found; refusing to run without it`);
  const keptSentences = (await c.query(
    `SELECT count(*)::int AS n FROM sentences s
     WHERE s.is_deleted = false AND s.text ~ $1 AND s.id <> ALL($2::text[])`,
    [KEEP, sentenceIds])).rows[0].n;
  console.log(`\nkeeping "${keptExpr.text}"  (survives in ${keptSentences} sentences)`);

  const questions = (await c.query(
    `SELECT count(*)::int AS n FROM exercise_questions
     WHERE is_deleted = false AND (lesson_id = ANY($1::text[]) OR source_id = ANY($2::text[]))`,
    [lessonIds, [...wordIds, ...sentenceIds]])).rows[0].n;
  console.log(`questions to delete: ${questions}`);

  if (!APPLY) { console.log("\n(nothing written)"); await c.end(); return; }

  await c.query("BEGIN");

  // Questions first: they reference lessons, words and sentences.
  await c.query(
    `DELETE FROM exercise_questions WHERE lesson_id = ANY($1::text[]) OR source_id = ANY($2::text[])`,
    [lessonIds, [...wordIds, ...sentenceIds]]);
  // Blocks pointing at the doomed content, wherever they live -- a block in ANOTHER unit can
  // reference one of these sentences, and stage cascade only covers this unit's own lessons.
  await c.query(
    `DELETE FROM lesson_blocks WHERE ref_id = ANY($1::text[])`, [[...wordIds, ...sentenceIds]]);
  await c.query(
    `DELETE FROM lesson_content_items WHERE lesson_id = ANY($1::text[]) OR content_id = ANY($2::text[])`,
    [lessonIds, [...wordIds, ...sentenceIds]]);
  await c.query(
    `DELETE FROM unit_content_items WHERE unit_id = $1 OR content_id = ANY($2::text[])`,
    [UNIT, [...wordIds, ...sentenceIds]]);
  await c.query(`DELETE FROM learner_content_performance WHERE content_id = ANY($1::text[])`,
    [[...wordIds, ...sentenceIds]]);
  // Stages and their blocks cascade from the lesson row.
  await c.query(`DELETE FROM lessons WHERE id = ANY($1::text[])`, [lessonIds]);
  // Components cascade from the sentence row.
  await c.query(`DELETE FROM sentences WHERE id = ANY($1::text[])`, [sentenceIds]);
  await c.query(`DELETE FROM sentence_components WHERE ref_id = ANY($1::text[])`, [wordIds]);
  await c.query(`DELETE FROM expression_components WHERE ref_id = ANY($1::text[])`, [wordIds]);
  await c.query(`DELETE FROM words WHERE id = ANY($1::text[])`, [wordIds]);

  // Nothing anywhere may still point at what was removed.
  const gone = [...wordIds, ...sentenceIds];
  const dangling = (await c.query(
    `SELECT (SELECT count(*) FROM lesson_content_items WHERE content_id = ANY($1::text[]))
          + (SELECT count(*) FROM unit_content_items WHERE content_id = ANY($1::text[]))
          + (SELECT count(*) FROM lesson_blocks WHERE ref_id = ANY($1::text[]))
          + (SELECT count(*) FROM exercise_questions WHERE source_id = ANY($1::text[]) AND is_deleted = false)
          + (SELECT count(*) FROM sentence_components WHERE ref_id = ANY($1::text[])) AS n`,
    [gone])).rows[0].n;
  const stillThere = (await c.query(
    `SELECT count(*)::int AS n FROM expressions WHERE lower(text) = lower($1) AND is_deleted = false`,
    [KEEP])).rows[0].n;
  if (Number(dangling) || !stillThere) {
    await c.query("ROLLBACK");
    throw new Error(`dangling references: ${dangling}, "${KEEP}" present: ${stillThere}; rolled back`);
  }

  await c.query("COMMIT");
  console.log(`\ndeleted ${lessons.length} lessons, ${sentences.length} sentences, ${words.length} words, ${questions} questions`);
  console.log(`unit shell kept, now empty`);
  await c.end();
}

main().catch(async (error) => {
  console.error(error?.message ?? error);
  if (APPLY) await client?.query("ROLLBACK").catch(() => {});
  process.exit(1);
});
