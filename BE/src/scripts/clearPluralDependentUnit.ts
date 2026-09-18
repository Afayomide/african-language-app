/**
 * Empty unit 46, "The Plural Dependent (Àwọn Ọmọ)", so it can be regenerated from scratch.
 *
 * The unit generated half way and stopped: lessons 0-2 have stages, blocks and questions,
 * lessons 3-5 are bare stage shells with nothing in them. Regenerating over that would leave
 * the finished half untouched, so everything the unit produced goes.
 *
 * The unit row itself stays -- same id, title, description, order and chapter -- so the
 * regeneration writes into the same slot.
 *
 * WHAT ELSE GOES. The unit authored one expression and five sentences, and nothing outside
 * this unit references any of them:
 *
 *   Àwọn ọmọ (children)          the unit's only `introduce` claim
 *   Àwọn ọmọ yẹn ò sí níbí.
 *   Àwọn ọmọ méjì ń bọ̀.
 *   Ṣé àwọn ọmọ mẹ́ta wà níbí?
 *   Àwọn ọmọ yẹn ò sí ní ilé.
 *   Ṣé àwọn ọmọ wà níbí?         the one sentence built on the expression
 *
 * They go with the lessons. Left behind they would be unreachable rows that the next
 * generation's "what already exists" check still reads -- which is how a regenerated unit ends
 * up introducing nothing, because `Àwọn ọmọ` would already be in the corpus.
 *
 * WHAT STAYS. Everything the unit merely borrowed: the words àwọn, Ṣé, níbí, ò, sí, bọ̀, ilé,
 * mẹ́ta, the sentences from "The Plural Switch", "The Essentials" and "The Want Multiplier",
 * and the whole of unit 45 "The Dependent (Singular Ọmọ)" -- the word `ọmọ` and its seven
 * sentences were authored there, not here. The unit holds no `introduce` claim on any word
 * (its word slots are all `review`), so nothing needs demoting.
 *
 * No learner has touched it: lesson_progress, learner_question_misses and
 * learner_content_performance are all empty for this unit's rows.
 *
 * Hard delete throughout, matching the rest of these scripts: a soft-deleted row is read by
 * the next generation and resurrects exactly what is being cleared.
 *
 *   npx tsx src/scripts/clearPluralDependentUnit.ts           # dry run
 *   npx tsx src/scripts/clearPluralDependentUnit.ts --apply
 */
import "dotenv/config";
import { Client } from "pg";

const APPLY = process.argv.includes("--apply");

const UNIT = "6a8d5963dc7a54dcd2d8bb59"; // The Plural Dependent (Àwọn Ọmọ)

/** Authored by this unit and referenced nowhere else. Verified again at run time. */
const OWNED_SENTENCES = [
  "6a92b949f9d6f310d84be123", // Àwọn ọmọ yẹn ò sí níbí.
  "6a92b9c3dee6324c26d5996e", // Àwọn ọmọ méjì ń bọ̀.
  "6a92b9c61a16e530ba9acd75", // Ṣé àwọn ọmọ mẹ́ta wà níbí?
  "6a92b9c823128692c9f93660", // Àwọn ọmọ yẹn ò sí ní ilé.
  "6a92b9ed13e9dadbf53bd578"  // Ṣé àwọn ọmọ wà níbí?
];
const OWNED_EXPRESSIONS = ["6a92b947480a6c7b528fa8df"]; // Àwọn ọmọ

let client: Client | null = null;

/**
 * Every column of every table tested separately. Concatenating a row's columns hides a match
 * whenever any one of them is NULL, which is how a live reference stays invisible.
 */
async function danglingRefs(c: Client, ids: string[], goneLessons: string[]) {
  const cols = (await c.query(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`)).rows as any[];
  const byTable = new Map<string, string[]>();
  for (const col of cols) {
    if (!byTable.has(col.table_name)) byTable.set(col.table_name, []);
    byTable.get(col.table_name)!.push(col.column_name);
  }
  const pattern = ids.join("|");
  const hits: string[] = [];
  for (const [table, list] of byTable) {
    const preds = list.map((k) => `coalesce("${k}"::text, '') ~ $1`).join(" OR ");
    const rows = (await c.query(`SELECT * FROM "${table}" WHERE ${preds}`, [pattern])).rows as any[];
    for (const row of rows) {
      // A row that is itself gone, or that belongs to this unit, is not a dangling reference.
      if (ids.includes(row.id)) continue;
      if (goneLessons.includes(row.lesson_id)) continue;
      if (row.unit_id === UNIT) continue;
      hits.push(`${table} id=${row.id}`);
    }
  }
  return hits;
}

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  client = c;
  await c.connect();
  console.log(APPLY ? "=== APPLYING (irreversible) ===\n" : "=== DRY RUN (pass --apply to write) ===\n");

  const unit = (await c.query(
    `SELECT title, order_index, status FROM units WHERE id = $1 AND is_deleted = false`, [UNIT])).rows[0] as any;
  if (!unit) throw new Error(`no unit ${UNIT}`);
  console.log(`unit ${unit.order_index}: "${unit.title}" [${unit.status}]  -- the unit row is kept\n`);

  const lessons = (await c.query(
    `SELECT id, title, order_index FROM lessons WHERE unit_id = $1 ORDER BY order_index`, [UNIT])).rows as any[];
  const lessonIds = lessons.map((l) => l.id);
  if (!lessonIds.length) throw new Error("nothing to clear: the unit already has no lessons");

  console.log(`--- lessons (${lessons.length}) ---`);
  for (const l of lessons) {
    const stages = (await c.query(
      `SELECT count(*)::int AS n FROM lesson_stages WHERE lesson_id = $1`, [l.id])).rows[0].n;
    const blocks = (await c.query(
      `SELECT count(*)::int AS n FROM lesson_blocks lb JOIN lesson_stages s ON s.id = lb.stage_id
       WHERE s.lesson_id = $1`, [l.id])).rows[0].n;
    const questions = (await c.query(
      `SELECT count(*)::int AS n FROM exercise_questions WHERE lesson_id = $1`, [l.id])).rows[0].n;
    console.log(`   [${l.order_index}] "${l.title}"  stages ${stages}, blocks ${blocks}, questions ${questions}`);
  }

  const totals = {
    stages: (await c.query(`SELECT count(*)::int AS n FROM lesson_stages WHERE lesson_id = ANY($1::text[])`, [lessonIds])).rows[0].n,
    blocks: (await c.query(`SELECT count(*)::int AS n FROM lesson_blocks lb JOIN lesson_stages s ON s.id = lb.stage_id WHERE s.lesson_id = ANY($1::text[])`, [lessonIds])).rows[0].n,
    questions: (await c.query(`SELECT count(*)::int AS n FROM exercise_questions WHERE lesson_id = ANY($1::text[])`, [lessonIds])).rows[0].n,
    slots: (await c.query(`SELECT count(*)::int AS n FROM lesson_content_items WHERE lesson_id = ANY($1::text[])`, [lessonIds])).rows[0].n,
    unitSlots: (await c.query(`SELECT count(*)::int AS n FROM unit_content_items WHERE unit_id = $1`, [UNIT])).rows[0].n
  };
  console.log(`\n   totals: ${totals.stages} stages, ${totals.blocks} blocks, ${totals.questions} questions,`
    + ` ${totals.slots} lesson slots, ${totals.unitSlots} unit slots`);

  // Nothing may be introduced here and nowhere else: deleting such a slot would strip a
  // teaching claim rather than free it, leaving the word taught by nobody.
  const introduced = (await c.query(
    `SELECT li.content_type, li.content_id, coalesce(w.text, s.text, e.text) AS text
     FROM lesson_content_items li
     LEFT JOIN words w ON w.id = li.content_id AND li.content_type = 'word'
     LEFT JOIN sentences s ON s.id = li.content_id AND li.content_type = 'sentence'
     LEFT JOIN expressions e ON e.id = li.content_id AND li.content_type = 'expression'
     WHERE li.lesson_id = ANY($1::text[]) AND li.role = 'introduce'`, [lessonIds])).rows as any[];
  console.log(`\n--- introduce claims held by this unit (${introduced.length}) ---`);
  for (const i of introduced) {
    const owned = OWNED_SENTENCES.includes(i.content_id) || OWNED_EXPRESSIONS.includes(i.content_id);
    console.log(`   ${i.content_type.padEnd(10)} "${i.text}"  ${owned ? "-> deleted with the unit" : "-> FREED, the row survives with no introduction"}`);
  }

  // Refuse to delete authored content that anything outside the unit uses.
  const owned = [...OWNED_SENTENCES, ...OWNED_EXPRESSIONS];
  console.log(`\n--- content authored here, deleted with it (${owned.length}) ---`);
  for (const id of owned) {
    const row = (await c.query(
      `SELECT text, 'sentence' AS kind FROM sentences WHERE id = $1
       UNION ALL SELECT text, 'expression' FROM expressions WHERE id = $1`, [id])).rows[0] as any;
    if (!row) throw new Error(`${id} is already gone; refusing to run against a moved target`);

    const elsewhere = (await c.query(
      `SELECT DISTINCT u.title FROM lesson_content_items li
         JOIN lessons l ON l.id = li.lesson_id JOIN units u ON u.id = l.unit_id
       WHERE li.content_id = $1 AND l.unit_id <> $2
       UNION
       SELECT DISTINCT u.title FROM lesson_blocks lb
         JOIN lesson_stages st ON st.id = lb.stage_id
         JOIN lessons l ON l.id = st.lesson_id JOIN units u ON u.id = l.unit_id
       WHERE lb.ref_id = $1 AND l.unit_id <> $2
       UNION
       SELECT DISTINCT u.title FROM exercise_questions q
         JOIN lessons l ON l.id = q.lesson_id JOIN units u ON u.id = l.unit_id
       WHERE q.source_id = $1 AND l.unit_id <> $2
       UNION
       SELECT DISTINCT u.title FROM unit_content_items x JOIN units u ON u.id = x.unit_id
       WHERE x.content_id = $1 AND x.unit_id <> $2`, [id, UNIT])).rows as any[];
    if (elsewhere.length) throw new Error(
      `"${row.text}" is used outside this unit (${elsewhere.map((e) => `"${e.title}"`).join(", ")}); refusing to delete it`);

    // A surviving sentence built on a deleted expression would lose a component.
    const carriers = (await c.query(
      `SELECT s.id, s.text FROM sentence_components sc JOIN sentences s ON s.id = sc.sentence_id
       WHERE sc.ref_id = $1 AND s.id <> ALL($2::text[])`, [id, OWNED_SENTENCES])).rows as any[];
    if (carriers.length) throw new Error(
      `"${row.text}" is a component of sentences that survive (${carriers.map((s) => `"${s.text}"`).join(", ")}); refusing to delete it`);

    console.log(`   ${row.kind.padEnd(10)} "${row.text}"`);
  }

  if (!APPLY) { console.log("\n(nothing written)"); await c.end(); return; }

  await c.query("BEGIN");
  await c.query(`DELETE FROM exercise_questions WHERE lesson_id = ANY($1::text[])`, [lessonIds]);
  await c.query(`DELETE FROM lesson_content_items WHERE lesson_id = ANY($1::text[])`, [lessonIds]);
  await c.query(`DELETE FROM unit_content_items WHERE unit_id = $1`, [UNIT]);
  // Stages cascade from the lesson, and blocks cascade from the stage.
  await c.query(`DELETE FROM lessons WHERE id = ANY($1::text[])`, [lessonIds]);
  // Components cascade from their parent row.
  await c.query(`DELETE FROM sentences WHERE id = ANY($1::text[])`, [OWNED_SENTENCES]);
  await c.query(`DELETE FROM expressions WHERE id = ANY($1::text[])`, [OWNED_EXPRESSIONS]);

  const left = (await c.query(`SELECT count(*)::int AS n FROM lessons WHERE unit_id = $1`, [UNIT])).rows[0].n;
  const strayStages = (await c.query(
    `SELECT count(*)::int AS n FROM lesson_stages st
     WHERE NOT EXISTS (SELECT 1 FROM lessons l WHERE l.id = st.lesson_id)`)).rows[0].n;
  const straySlots = (await c.query(
    `SELECT count(*)::int AS n FROM lesson_content_items li
     WHERE NOT EXISTS (SELECT 1 FROM lessons l WHERE l.id = li.lesson_id)`)).rows[0].n;
  const dangling = await danglingRefs(c, [...lessonIds, ...owned], lessonIds);
  const stillThere = (await c.query(`SELECT id FROM units WHERE id = $1 AND is_deleted = false`, [UNIT])).rows.length;

  if (left || strayStages || straySlots || dangling.length || !stillThere) {
    await c.query("ROLLBACK");
    throw new Error(`post-check failed (lessons ${left}, orphan stages ${strayStages}, orphan slots ${straySlots},`
      + ` dangling refs ${dangling.length}${dangling.length ? ": " + dangling.slice(0, 10).join("; ") : ""},`
      + ` unit present ${stillThere}); rolled back`);
  }

  await c.query("COMMIT");
  console.log(`\ncleared: ${lessons.length} lessons, ${totals.stages} stages, ${totals.blocks} blocks,`
    + ` ${totals.questions} questions, ${totals.slots} slots`);
  console.log(`deleted: ${OWNED_SENTENCES.length} sentences, ${OWNED_EXPRESSIONS.length} expression`);
  console.log(`unit "${unit.title}" kept, empty, ready to regenerate`);
  await c.end();
}

main().catch(async (error) => {
  console.error(error?.message ?? error);
  if (APPLY) await client?.query("ROLLBACK").catch(() => {});
  process.exit(1);
});
