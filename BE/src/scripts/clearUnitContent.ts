/**
 * Empty a unit so it can be regenerated: its lessons, their questions, its content links, and
 * any content row it authored that nothing else still uses.
 *
 * The unit row itself SURVIVES -- same id, title, chapter and order -- so the regeneration
 * writes back into the same slot.
 *
 * HARD DELETE THROUGHOUT. A soft-deleted row is still read by the next generation's "what
 * already exists" check, so a soft delete here would leave the regenerated unit unable to
 * introduce the very content it was cleared to re-teach: the words look already-taught while
 * no lesson can reach them.
 *
 * WHAT COUNTS AS "AUTHORED BY THIS UNIT". The unit's content links are captured before
 * anything is deleted; afterwards each of those rows is re-checked, and it is only deleted if
 * NOTHING anywhere still points at it -- no lesson content item, no unit content item, no
 * exercise question, no lesson block, and no sentence or expression component. That last check
 * is what keeps a shared word alive: `ọma` is linked to this unit, but it is also a component
 * of sentences in other units, so it stays.
 *
 * Failed attempts leave soft-deleted lessons behind, and those are cleared too -- they are
 * dead weight that nothing can reach.
 *
 *   npx tsx src/scripts/clearUnitContent.ts <unitId>            # dry run
 *   npx tsx src/scripts/clearUnitContent.ts <unitId> --apply
 */
import "dotenv/config";
import { Client } from "pg";

const APPLY = process.argv.includes("--apply");
const UNIT_ID = process.argv.find((arg) => /^[0-9a-f]{24}$/i.test(arg)) || "";

if (!UNIT_ID) {
  throw new Error("pass a 24-character unit id");
}

type ContentRef = { table: "words" | "expressions" | "sentences"; id: string; text: string };

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  try {
    const unit = (await c.query(`select id, title, language::text as language, order_index from units where id = $1`, [UNIT_ID])).rows[0];
    if (!unit) throw new Error(`unit ${UNIT_ID} not found`);

    console.log(APPLY ? "=== APPLYING (irreversible) ===" : "=== DRY RUN (pass --apply to write) ===");
    console.log(`unit ${unit.order_index}  ${JSON.stringify(unit.title)}  [${unit.language}]\n`);

    const lessons = (await c.query(`select id, title, order_index, is_deleted from lessons where unit_id = $1 order by is_deleted, order_index`, [UNIT_ID])).rows;
    const lessonIds = lessons.map((l) => l.id);
    console.log(`lessons: ${lessons.filter((l) => !l.is_deleted).length} live, ${lessons.filter((l) => l.is_deleted).length} already soft-deleted`);

    const questionIds = lessonIds.length
      ? (
          await c.query(
            `select distinct b.ref_id as id
             from lesson_blocks b
             join lesson_stages s on s.id = b.stage_id
             where s.lesson_id = any($1) and b.type = 'question' and b.ref_id is not null`,
            [lessonIds]
          )
        ).rows.map((r) => r.id)
      : [];
    console.log(`questions: ${questionIds.length}`);

    // Captured BEFORE deletion -- afterwards the links are gone and the rows look orphaned
    // whether this unit authored them or not.
    const linked: ContentRef[] = [];
    for (const table of ["words", "expressions", "sentences"] as const) {
      const type = table.slice(0, -1);
      const { rows } = await c.query(
        `select distinct t.id, t.text from ${table} t
         where t.id in (
           select content_id from lesson_content_items where unit_id = $1 and content_type = $2
           union
           select content_id from unit_content_items where unit_id = $1 and content_type = $2
         )`,
        [UNIT_ID, type]
      );
      for (const row of rows) linked.push({ table, id: row.id, text: row.text });
    }
    console.log(`content rows linked to this unit: ${linked.length}\n`);

    if (!APPLY) {
      // Predict the orphan set without touching anything: a row is orphaned if every
      // reference to it comes from inside this unit.
      const survivors: ContentRef[] = [];
      const doomed: ContentRef[] = [];
      for (const ref of linked) {
        const { rows } = await c.query(
          `select
             (select count(*) from lesson_content_items i join lessons l on l.id = i.lesson_id
               where i.content_id = $1 and l.unit_id <> $2) as other_lessons,
             (select count(*) from unit_content_items where content_id = $1 and unit_id <> $2) as other_units,
             (select count(*) from sentence_components where ref_id = $1) as sentence_uses,
             (select count(*) from expression_components where ref_id = $1) as expression_uses`,
          [ref.id, UNIT_ID]
        );
        const r = rows[0];
        const held = Number(r.other_lessons) + Number(r.other_units) + Number(r.sentence_uses) + Number(r.expression_uses);
        (held > 0 ? survivors : doomed).push(ref);
      }

      console.log(`WOULD DELETE ${doomed.length} content row(s) authored only by this unit:`);
      for (const ref of doomed) console.log(`   ${ref.table.slice(0, -1)}  ${JSON.stringify(ref.text)}`);
      console.log(`\nWOULD KEEP ${survivors.length} row(s) still used elsewhere:`);
      for (const ref of survivors) console.log(`   ${ref.table.slice(0, -1)}  ${JSON.stringify(ref.text)}`);
      console.log("\ndry run -- nothing written.");
      return;
    }

    if (questionIds.length) await c.query(`delete from exercise_questions where id = any($1)`, [questionIds]);
    await c.query(`delete from lesson_content_items where unit_id = $1`, [UNIT_ID]);
    await c.query(`delete from unit_content_items where unit_id = $1`, [UNIT_ID]);
    // stages and blocks cascade from the lesson.
    await c.query(`delete from lessons where unit_id = $1`, [UNIT_ID]);
    // The unit row is not touched at all. `last_ai_preview_plan.settings.extraInstructions`
    // holds the instructions the unit is regenerated FROM -- nulling it as "stale run
    // metadata" destroys the input, not the output.
    console.log(`deleted ${lessons.length} lesson(s) and ${questionIds.length} question(s).`);

    let removed = 0;
    let removedThisPass = 0;
    do {
      removedThisPass = 0;
      for (const ref of linked) {
        const { rows } = await c.query(
          `select
             (select count(*) from lesson_content_items where content_id = $1) as lesson_links,
             (select count(*) from unit_content_items where content_id = $1) as unit_links,
             (select count(*) from exercise_questions where source_id = $1) as questions,
             (select count(*) from lesson_blocks where ref_id = $1) as blocks,
             (select count(*) from sentence_components where ref_id = $1) as sentence_uses,
             (select count(*) from expression_components where ref_id = $1) as expression_uses`,
          [ref.id]
        );
        const r = rows[0];
        const held =
          Number(r.lesson_links) + Number(r.unit_links) + Number(r.questions) + Number(r.blocks) + Number(r.sentence_uses) + Number(r.expression_uses);
        if (held > 0) continue;
        await c.query(`delete from ${ref.table} where id = $1`, [ref.id]);
        console.log(`   dropped ${ref.table.slice(0, -1)} ${JSON.stringify(ref.text)}`);
        linked.splice(linked.indexOf(ref), 1);
        removed += 1;
        removedThisPass += 1;
      }
    } while (removedThisPass > 0);

    console.log(`\nhard deleted ${removed} orphaned content row(s). The unit row is intact and empty.`);
  } finally {
    await c.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
