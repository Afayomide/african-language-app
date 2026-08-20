/**
 * Clear a unit's generated lessons and free the vocabulary it should be teaching.
 *
 * A regenerated unit can end up introducing nothing. Stage-1 introductions are filtered by
 * `wasContentIntroducedBeforeLesson`, so a word already carrying an `introduce` row in any
 * other lesson is dropped from the introduction list -- and after a regeneration the unit's
 * own vocabulary is usually already somewhere in the corpus. The result is a unit that only
 * drills, and "The Quantities (One)" produced exactly that: 0 introductions across 6 lessons.
 *
 * Freeing a word is NOT the same as deleting its introduction. The row is demoted to `review`,
 * so the lesson that had it still teaches the word -- it just stops claiming to be the first
 * to do so. Deleting would leave that lesson silently missing content.
 *
 * Only demote where the curriculum order says the claim is wrong: a word must be introduced by
 * the EARLIEST unit that teaches it. `kan` was introduced at unit 23 while the unit named for
 * it sits at 18; `omi`, `iṣẹ́`, `Fún` and `Èló` are introduced by units that genuinely come
 * first, so those stay untouched and this unit reviews them, which is correct.
 *
 * Lessons are hard-deleted, matching the decision that soft-deleted content is worse than
 * gone: the next generation reads existing rows to decide what already exists.
 *
 *   npx tsx src/scripts/resetUnitForRegeneration.ts           # dry run
 *   npx tsx src/scripts/resetUnitForRegeneration.ts --apply
 */
import "dotenv/config";
import { Client } from "pg";

const APPLY = process.argv.includes("--apply");

const UNIT = "6a137ba15c319d08e5cf6b6a"; // The Quantities (One)

/**
 * Words this unit should introduce, currently claimed by a LATER unit. Named explicitly with
 * the reason, because demoting the wrong one silently removes an earlier unit's introduction.
 */
const FREE: { word: string; fromLesson: string; why: string }[] = [
  {
    word: "kan",
    fromLesson: "The Quick Price Check",
    why: "introduced at unit 23; the unit named for it sits at 18, so the claim is inverted"
  }
];

let client: Client | null = null;

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  client = c;
  await c.connect();
  console.log(APPLY ? "=== APPLYING (irreversible) ===\n" : "=== DRY RUN (pass --apply to write) ===\n");

  const unit = (await c.query(`SELECT title FROM units WHERE id = $1`, [UNIT])).rows[0] as any;
  if (!unit) throw new Error(`no unit ${UNIT}`);
  console.log(`unit: "${unit.title}"\n`);

  const lessons = (await c.query(
    `SELECT id, title, order_index FROM lessons WHERE unit_id = $1 AND is_deleted = false
     ORDER BY order_index`, [UNIT])).rows as any[];
  console.log(`--- lessons to remove (${lessons.length}) ---`);
  lessons.forEach((l) => console.log(`   [${l.order_index}] "${l.title}"`));
  const lessonIds = lessons.map((l) => l.id);

  // Proverbs used ONLY by these lessons go too; one shared with another lesson stays.
  const proverbs = lessonIds.length
    ? (await c.query(
        `SELECT DISTINCT p.id, p.text FROM proverbs p
         JOIN lesson_blocks lb ON lb.ref_id = p.id AND lb.type = 'proverb'
         JOIN lesson_stages st ON st.id = lb.stage_id
         WHERE st.lesson_id = ANY($1::text[]) AND p.is_deleted = false
           AND NOT EXISTS (
             SELECT 1 FROM lesson_blocks lb2
             JOIN lesson_stages st2 ON st2.id = lb2.stage_id
             WHERE lb2.ref_id = p.id AND st2.lesson_id <> ALL($1::text[]))`,
        [lessonIds])).rows as any[]
    : [];
  console.log(`\n--- proverbs used only by them (${proverbs.length}) ---`);
  proverbs.forEach((p) => console.log(`   "${p.text}"`));

  const questions = lessonIds.length
    ? (await c.query(
        `SELECT count(*)::int AS n FROM exercise_questions WHERE lesson_id = ANY($1::text[])`,
        [lessonIds])).rows[0].n
    : 0;
  console.log(`\nquestions attached: ${questions}`);

  console.log(`\n--- vocabulary to free ---`);
  const demotions: { id: string; word: string; lesson: string }[] = [];
  for (const f of FREE) {
    const rows = (await c.query(
      `SELECT li.id, l.title AS lesson, u.title AS unit, u.order_index AS unit_order
       FROM lesson_content_items li
       JOIN words w ON w.id = li.content_id AND li.content_type = 'word'
       JOIN lessons l ON l.id = li.lesson_id AND l.is_deleted = false
       JOIN units u ON u.id = l.unit_id
       WHERE lower(w.text) = lower($1) AND li.role = 'introduce' AND l.title = $2`,
      [f.word, f.fromLesson])).rows as any[];
    if (rows.length !== 1) {
      throw new Error(`"${f.word}" in "${f.fromLesson}": found ${rows.length} introduce rows, expected 1`);
    }
    const row = rows[0];
    console.log(`   "${f.word}"  introduce -> review  in "${row.lesson}" [${row.unit}, unit ${row.unit_order}]`);
    console.log(`      ${f.why}`);
    demotions.push({ id: row.id, word: f.word, lesson: row.lesson });
  }

  if (!APPLY) { console.log("\n(nothing written)"); await c.end(); return; }

  await c.query("BEGIN");

  // Demote first: if this fails, the lessons are still intact.
  for (const d of demotions) {
    await c.query(`UPDATE lesson_content_items SET role = 'review' WHERE id = $1`, [d.id]);
  }

  if (lessonIds.length) {
    await c.query(`DELETE FROM exercise_questions WHERE lesson_id = ANY($1::text[])`, [lessonIds]);
    await c.query(`DELETE FROM lesson_content_items WHERE lesson_id = ANY($1::text[])`, [lessonIds]);
    await c.query(`DELETE FROM unit_content_items WHERE unit_id = $1`, [UNIT]);
    if (proverbs.length) {
      const pids = proverbs.map((p) => p.id);
      await c.query(`DELETE FROM lesson_blocks WHERE ref_id = ANY($1::text[])`, [pids]);
      await c.query(`DELETE FROM proverbs WHERE id = ANY($1::text[])`, [pids]);
    }
    // Stages and their blocks are FK-cascaded from the lesson row.
    await c.query(`DELETE FROM lessons WHERE id = ANY($1::text[])`, [lessonIds]);
  }

  const left = (await c.query(
    `SELECT count(*)::int AS n FROM lessons WHERE unit_id = $1`, [UNIT])).rows[0].n;
  const stray = (await c.query(
    `SELECT count(*)::int AS n FROM lesson_content_items li
     WHERE NOT EXISTS (SELECT 1 FROM lessons l WHERE l.id = li.lesson_id)`)).rows[0].n;
  if (left || stray) {
    await c.query("ROLLBACK");
    throw new Error(`lessons left: ${left}, orphan slots: ${stray}; rolled back`);
  }

  await c.query("COMMIT");
  console.log(`\nremoved ${lessons.length} lessons, ${questions} questions, ${proverbs.length} proverbs`);
  console.log(`freed ${demotions.length} word(s) for reintroduction`);
  await c.end();
}

main().catch(async (error) => {
  console.error(error?.message ?? error);
  if (APPLY) await client?.query("ROLLBACK").catch(() => {});
  process.exit(1);
});
