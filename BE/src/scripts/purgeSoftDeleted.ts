/**
 * Hard delete every row that is already soft deleted. Nothing live is touched.
 *
 * Soft deletes accumulate from failed generation attempts -- a unit that took three passes
 * leaves two sets of lessons behind -- and they are not inert. The generators' "what already
 * exists" checks read rows the learner cannot reach, so a soft-deleted word can make a
 * regenerated unit decline to introduce the very content it was cleared to teach.
 *
 * SAFETY. Before deleting anything the script proves that no LIVE row points at a soft-deleted
 * one: no live question sourced from deleted content, no live lesson item or block referencing
 * it, no live sentence built from a deleted component, and no live question reachable only
 * through a soft-deleted lesson. If any of those is non-zero the script refuses to run, because
 * hard deleting would turn a soft reference into a dangling one.
 *
 * ORDER. Questions first (nothing cascades to them -- blocks reference them by ref_id, not by
 * foreign key), then lessons (stages and blocks cascade), then content rows (their components
 * cascade), then proverbs.
 *
 *   npx tsx src/scripts/purgeSoftDeleted.ts           # dry run
 *   npx tsx src/scripts/purgeSoftDeleted.ts --apply
 */
import "dotenv/config";
import { Client } from "pg";

const APPLY = process.argv.includes("--apply");

/** Deletion order: dependents before the rows they hang off. */
const TABLES = ["exercise_questions", "lessons", "sentences", "expressions", "words", "proverbs", "chapters", "units"] as const;

const SAFETY_CHECKS: Array<[string, string]> = [
  [
    "live question sourced from deleted content",
    `select count(*) n from exercise_questions eq
     where eq.is_deleted = false and (
       exists (select 1 from sentences s where s.id = eq.source_id and s.is_deleted)
       or exists (select 1 from words w where w.id = eq.source_id and w.is_deleted)
       or exists (select 1 from expressions e where e.id = eq.source_id and e.is_deleted))`
  ],
  [
    "live lesson item referencing deleted content",
    `select count(*) n from lesson_content_items i
     join lessons l on l.id = i.lesson_id
     where l.is_deleted = false and (
       exists (select 1 from sentences s where s.id = i.content_id and s.is_deleted)
       or exists (select 1 from words w where w.id = i.content_id and w.is_deleted)
       or exists (select 1 from expressions e where e.id = i.content_id and e.is_deleted))`
  ],
  [
    "live block referencing deleted content or question",
    `select count(*) n from lesson_blocks b
     join lesson_stages st on st.id = b.stage_id
     join lessons l on l.id = st.lesson_id
     where l.is_deleted = false and b.ref_id is not null and (
       exists (select 1 from sentences s where s.id = b.ref_id and s.is_deleted)
       or exists (select 1 from words w where w.id = b.ref_id and w.is_deleted)
       or exists (select 1 from expressions e where e.id = b.ref_id and e.is_deleted)
       or exists (select 1 from exercise_questions q where q.id = b.ref_id and q.is_deleted))`
  ],
  [
    "live sentence built from a deleted word or expression",
    `select count(*) n from sentence_components sc
     join sentences s on s.id = sc.sentence_id
     where s.is_deleted = false and (
       exists (select 1 from words w where w.id = sc.ref_id and w.is_deleted)
       or exists (select 1 from expressions e where e.id = sc.ref_id and e.is_deleted))`
  ],
  [
    "live question reachable only through a soft-deleted lesson",
    `select count(*) n from exercise_questions eq
     where eq.is_deleted = false
       and exists (select 1 from lesson_blocks b join lesson_stages st on st.id = b.stage_id join lessons l on l.id = st.lesson_id
                   where b.ref_id = eq.id and l.is_deleted = true)
       and not exists (select 1 from lesson_blocks b join lesson_stages st on st.id = b.stage_id join lessons l on l.id = st.lesson_id
                       where b.ref_id = eq.id and l.is_deleted = false)`
  ]
];

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  try {
    console.log(APPLY ? "=== APPLYING (irreversible) ===\n" : "=== DRY RUN (pass --apply to write) ===\n");

    let unsafe = 0;
    for (const [label, sql] of SAFETY_CHECKS) {
      const n = Number((await c.query(sql)).rows[0].n);
      console.log(`${String(n).padStart(6)}  ${label}`);
      unsafe += n;
    }
    if (unsafe > 0) {
      console.log("\nREFUSING: a live row points at a soft-deleted one. Repoint or clear those first.");
      return;
    }
    console.log("\nnothing live depends on a soft-deleted row.\n");

    let total = 0;
    for (const table of TABLES) {
      const n = Number((await c.query(`select count(*) n from ${table} where is_deleted = true`)).rows[0].n);
      console.log(`${String(n).padStart(6)}  ${table}`);
      total += n;
    }
    console.log(`\n${total} row(s) to hard delete.`);

    if (!APPLY) {
      console.log("\ndry run -- nothing written.");
      return;
    }

    // Links to content that is about to go. These carry no is_deleted of their own, so they
    // are addressed by what they point at rather than by their own state.
    for (const links of ["lesson_content_items", "unit_content_items"] as const) {
      const { rowCount } = await c.query(
        `delete from ${links} where
           exists (select 1 from sentences s where s.id = content_id and s.is_deleted)
           or exists (select 1 from words w where w.id = content_id and w.is_deleted)
           or exists (select 1 from expressions e where e.id = content_id and e.is_deleted)`
      );
      if (rowCount) console.log(`  ${links}: ${rowCount} link(s) to deleted content removed`);
    }

    for (const table of TABLES) {
      const { rowCount } = await c.query(`delete from ${table} where is_deleted = true`);
      if (rowCount) console.log(`  ${table}: ${rowCount} deleted`);
    }

    console.log("\npurge complete.");
  } finally {
    await c.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
