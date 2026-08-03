/**
 * Find (and optionally soft-delete) content no learner can reach.
 *
 * Reachability is transitive, not a single reference check. A word can be absent from every
 * lesson roster and still be needed, because a sentence that IS on a roster lists it as a
 * component; deleting it would break that sentence's gloss. So roots are expanded through
 * sentence_components and expression_components before anything is judged unused.
 *
 * Roots (live lessons only -- a soft-deleted lesson keeps nothing alive):
 *   live lesson -> lesson_content_items -> sentence | word | expression
 *   live lesson -> exercise_questions.source_id / related_source_refs
 *   live lesson id present in proverbs.lesson_ids
 *
 * Expansion:
 *   reachable sentence   -> sentence_components   -> word | expression
 *   reachable expression -> expression_components -> word
 *
 * Run with --apply to write; defaults to a report.
 */
import "dotenv/config";
import { Client } from "pg";

const APPLY = process.argv.includes("--apply");

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const now = new Date();

  const liveLessonIds: string[] = (await c.query(
    `SELECT l.id FROM lessons l JOIN units u ON u.id=l.unit_id
     WHERE l.is_deleted=false AND u.is_deleted=false`
  )).rows.map((r: any) => r.id);
  console.log(`live lessons: ${liveLessonIds.length}`);

  // ---- roots -------------------------------------------------------------
  const rootSentences = new Set<string>();
  const rootWords = new Set<string>();
  const rootExpressions = new Set<string>();

  for (const r of (await c.query(
    `SELECT content_type, content_id FROM lesson_content_items WHERE lesson_id = ANY($1)`,
    [liveLessonIds]
  )).rows as any[]) {
    if (r.content_type === "sentence") rootSentences.add(r.content_id);
    else if (r.content_type === "word") rootWords.add(r.content_id);
    else if (r.content_type === "expression") rootExpressions.add(r.content_id);
  }

  // Unit-level roster. Holds content no lesson roster lists (3 sentences at time of
  // writing), so leaving it out would delete rows a live unit still points at.
  for (const r of (await c.query(
    `SELECT uci.content_type, uci.content_id FROM unit_content_items uci
     JOIN units u ON u.id=uci.unit_id AND u.is_deleted=false`
  )).rows as any[]) {
    if (r.content_type === "sentence") rootSentences.add(r.content_id);
    else if (r.content_type === "word") rootWords.add(r.content_id);
    else if (r.content_type === "expression") rootExpressions.add(r.content_id);
  }

  // Anything a learner has already practised. Their history references content_id, and
  // deleting the target would leave that history pointing at nothing.
  for (const r of (await c.query(
    `SELECT DISTINCT content_type, content_id FROM learner_content_performance`
  )).rows as any[]) {
    if (r.content_type === "sentence") rootSentences.add(r.content_id);
    else if (r.content_type === "word") rootWords.add(r.content_id);
    else if (r.content_type === "expression") rootExpressions.add(r.content_id);
  }

  // Questions can outlive their roster entry, so their sources count as roots too.
  for (const r of (await c.query(
    `SELECT DISTINCT source_id AS id FROM exercise_questions
      WHERE lesson_id = ANY($1) AND is_deleted=false AND source_id IS NOT NULL
     UNION
     SELECT DISTINCT e->>'id' AS id FROM exercise_questions x,
       jsonb_array_elements(COALESCE(x.related_source_refs,'[]'::jsonb)) e
      WHERE x.lesson_id = ANY($1) AND x.is_deleted=false`,
    [liveLessonIds]
  )).rows as any[]) {
    // type unknown here; add to all three candidate sets and let the id space disambiguate
    rootSentences.add(r.id); rootWords.add(r.id); rootExpressions.add(r.id);
  }

  // ---- transitive expansion ----------------------------------------------
  const reachableSentences = new Set(rootSentences);
  const reachableExpressions = new Set(rootExpressions);
  const reachableWords = new Set(rootWords);

  for (const r of (await c.query(
    `SELECT sc.sentence_id, sc.ref_id, sc.type FROM sentence_components sc
     WHERE sc.sentence_id = ANY($1)`, [Array.from(reachableSentences)]
  )).rows as any[]) {
    if (r.type === "expression") reachableExpressions.add(r.ref_id);
    else reachableWords.add(r.ref_id);
  }

  for (const r of (await c.query(
    `SELECT ec.ref_id FROM expression_components ec WHERE ec.expression_id = ANY($1)`,
    [Array.from(reachableExpressions)]
  )).rows as any[]) {
    reachableWords.add(r.ref_id);
  }

  // ---- unused = live rows outside the reachable sets ----------------------
  const unusedSentences = (await c.query(
    `SELECT id, text, created_at FROM sentences WHERE is_deleted=false AND NOT (id = ANY($1)) ORDER BY created_at`,
    [Array.from(reachableSentences)]
  )).rows as any[];
  const unusedExpressions = (await c.query(
    `SELECT id, text, created_at FROM expressions WHERE is_deleted=false AND NOT (id = ANY($1)) ORDER BY created_at`,
    [Array.from(reachableExpressions)]
  )).rows as any[];
  const unusedWords = (await c.query(
    `SELECT id, text, created_at FROM words WHERE is_deleted=false AND NOT (id = ANY($1)) ORDER BY created_at`,
    [Array.from(reachableWords)]
  )).rows as any[];
  const unusedProverbs = (await c.query(
    `SELECT id, text FROM proverbs p WHERE p.is_deleted=false
       AND NOT EXISTS (SELECT 1 FROM unnest(p.lesson_ids) x WHERE x = ANY($1))`,
    [liveLessonIds]
  )).rows as any[];

  const liveCounts = (await c.query(
    `SELECT (SELECT count(*)::int FROM sentences WHERE is_deleted=false) AS s,
            (SELECT count(*)::int FROM words WHERE is_deleted=false) AS w,
            (SELECT count(*)::int FROM expressions WHERE is_deleted=false) AS e,
            (SELECT count(*)::int FROM proverbs WHERE is_deleted=false) AS p`
  )).rows[0] as any;

  const report = (label: string, rows: any[], total: number) => {
    console.log(`\n${label}: ${rows.length} unreachable of ${total} live (${Math.round(100 * rows.length / (total || 1))}%)`);
    rows.slice(0, 12).forEach((r: any) => console.log(`   ${r.text}`));
    if (rows.length > 12) console.log(`   ... and ${rows.length - 12} more`);
  };
  report("sentences", unusedSentences, liveCounts.s);
  report("expressions", unusedExpressions, liveCounts.e);
  report("words", unusedWords, liveCounts.w);
  report("proverbs", unusedProverbs, liveCounts.p);

  if (!APPLY) {
    console.log("\n(report only -- pass --apply to soft-delete)");
    await c.end();
    return;
  }

  try {
    await c.query("BEGIN");
    // Sentences first: their components are what keep words/expressions alive, and those
    // sets were computed before this transaction, so ordering here is presentational only.
    const s = await c.query(`UPDATE sentences SET is_deleted=true, deleted_at=$2, updated_at=$2 WHERE id = ANY($1)`,
      [unusedSentences.map((r) => r.id), now]);
    const e = await c.query(`UPDATE expressions SET is_deleted=true, deleted_at=$2, updated_at=$2 WHERE id = ANY($1)`,
      [unusedExpressions.map((r) => r.id), now]);
    const w = await c.query(`UPDATE words SET is_deleted=true, deleted_at=$2, updated_at=$2 WHERE id = ANY($1)`,
      [unusedWords.map((r) => r.id), now]);
    const p = await c.query(`UPDATE proverbs SET is_deleted=true, deleted_at=$2, updated_at=$2 WHERE id = ANY($1)`,
      [unusedProverbs.map((r) => r.id), now]);
    // Roster rows pointing at content that is gone, or at a dead lesson.
    const orphanItems = await c.query(
      `DELETE FROM lesson_content_items lci
        WHERE NOT (lci.lesson_id = ANY($1))
           OR lci.content_id = ANY($2)`,
      [liveLessonIds, [...unusedSentences, ...unusedWords, ...unusedExpressions].map((r) => r.id)]);
    await c.query("COMMIT");
    console.log(`\nsoft-deleted: ${s.rowCount} sentences, ${e.rowCount} expressions, ${w.rowCount} words, ${p.rowCount} proverbs`);
    console.log(`removed ${orphanItems.rowCount} stale lesson_content_items rows`);
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  }

  await c.end();
}

main().catch((error) => { console.error(error); process.exit(1); });
