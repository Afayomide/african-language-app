/**
 * Hard-delete every soft-deleted row, and sweep up what pointed at it.
 *
 * Soft-deleted content is not inert here. Generation reads existing rows when it decides what
 * already exists, so a retired duplicate can be picked up and revived, and a merge that walks
 * "every sentence" has to remember to exclude it every single time. Removing it for good is
 * cheaper than remembering.
 *
 * Only six foreign keys exist in this schema. Everything else -- lesson slots, unit slots,
 * block refs, question sources, learner progress -- is a loose text id with nothing enforcing
 * it, so deleting a parent leaves those rows pointing at nothing. They are swept explicitly,
 * by content_type where the table records one.
 *
 * REFUSES TO RUN if anything still live points at a soft-deleted row. That would not be a
 * cleanup, it would be breakage: a live lesson slot whose word is deleted becomes a slot with
 * no word. Fix the reference first, then purge.
 *
 * Irreversible. Take a dump first:
 *   pg_dump -Fc -f backup.dump <db>
 *
 *   npx tsx src/scripts/purgeSoftDeleted.ts           # dry run
 *   npx tsx src/scripts/purgeSoftDeleted.ts --apply
 */
import "dotenv/config";
import { Client } from "pg";

const APPLY = process.argv.includes("--apply");

/**
 * Content tables addressed by a loose id. Used for the "is anything still pointing here"
 * checks, which compare ids directly and so cover every kind.
 */
const CONTENT = { sentence: "sentences", word: "words", expression: "expressions", proverb: "proverbs" };

/**
 * The subset reachable through a typed slot. `content_type` is a Postgres enum of exactly
 * word | expression | sentence -- there is no 'proverb' member, and passing one is a type
 * error, not an empty result. Proverbs are only ever reached through lesson_blocks.ref_id,
 * whose blocks disappear with their stage.
 */
const SLOT_CONTENT = { sentence: "sentences", word: "words", expression: "expressions" };

/**
 * Delete order. Rows that reference others go first, so a sweep never runs against a table
 * whose parent has already vanished. The six real foreign keys cascade on their own:
 * lessons -> lesson_stages -> lesson_blocks, sentences -> sentence_components,
 * expressions -> expression_components.
 */
const PURGE = [
  "exercise_questions",
  "lessons",
  "units",
  "chapters",
  "sentences",
  "expressions",
  "words",
  "proverbs"
];

async function count(c: Client, sql: string, params: any[] = []) {
  return (await c.query(sql, params)).rows[0].n as number;
}

/** Every way a live row can name something that is about to stop existing. */
async function liveReferencesToDeleted(c: Client) {
  const problems: string[] = [];
  const contentTables = Object.values(CONTENT);
  const anyDeleted = (col: string) =>
    contentTables.map((t) => `EXISTS (SELECT 1 FROM ${t} x WHERE x.id = ${col} AND x.is_deleted)`).join(" OR ");

  const checks: [string, string][] = [
    ["lesson slot -> deleted content",
     `SELECT count(*)::int AS n FROM lesson_content_items li
      JOIN lessons l ON l.id = li.lesson_id AND l.is_deleted = false
      WHERE ${anyDeleted("li.content_id")}`],
    ["unit slot -> deleted content",
     `SELECT count(*)::int AS n FROM unit_content_items ui
      JOIN units u ON u.id = ui.unit_id AND u.is_deleted = false
      WHERE ${anyDeleted("ui.content_id")}`],
    ["live lesson block -> deleted content",
     `SELECT count(*)::int AS n FROM lesson_blocks lb
      JOIN lesson_stages st ON st.id = lb.stage_id
      JOIN lessons l ON l.id = st.lesson_id AND l.is_deleted = false
      WHERE lb.ref_id IS NOT NULL AND (${anyDeleted("lb.ref_id")})`],
    ["live question -> deleted source",
     `SELECT count(*)::int AS n FROM exercise_questions q
      WHERE q.is_deleted = false AND (${anyDeleted("q.source_id")})`],
    ["live sentence component -> deleted ref",
     `SELECT count(*)::int AS n FROM sentence_components sc
      JOIN sentences s ON s.id = sc.sentence_id AND s.is_deleted = false
      WHERE ${anyDeleted("sc.ref_id")}`],
    ["live expression component -> deleted ref",
     `SELECT count(*)::int AS n FROM expression_components ec
      JOIN expressions e ON e.id = ec.expression_id AND e.is_deleted = false
      WHERE ${anyDeleted("ec.ref_id")}`],
    ["live unit -> deleted chapter",
     `SELECT count(*)::int AS n FROM units u
      JOIN chapters ch ON ch.id = u.chapter_id AND ch.is_deleted = true WHERE u.is_deleted = false`],
    ["live lesson -> deleted unit",
     `SELECT count(*)::int AS n FROM lessons l
      JOIN units u ON u.id = l.unit_id AND u.is_deleted = true WHERE l.is_deleted = false`],
    ["learner progress -> deleted lesson",
     `SELECT count(*)::int AS n FROM lesson_progress lp
      JOIN lessons l ON l.id = lp.lesson_id AND l.is_deleted = true`],
    ["learner performance -> deleted content",
     `SELECT count(*)::int AS n FROM learner_content_performance p WHERE ${anyDeleted("p.content_id")}`]
  ];

  for (const [label, sql] of checks) {
    const n = await count(c, sql);
    if (n) problems.push(`   ${label}: ${n}`);
  }
  return problems;
}

let client: Client | null = null;

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  client = c;
  await c.connect();
  console.log(APPLY ? "=== APPLYING (irreversible) ===\n" : "=== DRY RUN (pass --apply to write) ===\n");

  const problems = await liveReferencesToDeleted(c);
  if (problems.length) {
    console.error("REFUSING: live rows still point at soft-deleted rows.\n");
    problems.forEach((p) => console.error(p));
    console.error("\nPurging now would turn each of these into a dangling id. Repoint them first.");
    process.exit(1);
  }
  console.log("checked: nothing live points at a soft-deleted row\n");

  console.log("--- rows to remove ---");
  let total = 0;
  for (const table of PURGE) {
    const n = await count(c, `SELECT count(*)::int AS n FROM ${table} WHERE is_deleted = true`);
    total += n;
    console.log(`   ${table.padEnd(22)} ${String(n).padStart(6)}`);
  }
  console.log(`   ${"TOTAL".padEnd(22)} ${String(total).padStart(6)}`);

  const cascades: [string, string][] = [
    ["lesson_stages", `SELECT count(*)::int AS n FROM lesson_stages st JOIN lessons l ON l.id = st.lesson_id AND l.is_deleted = true`],
    ["lesson_blocks", `SELECT count(*)::int AS n FROM lesson_blocks b JOIN lesson_stages st ON st.id = b.stage_id JOIN lessons l ON l.id = st.lesson_id AND l.is_deleted = true`],
    ["sentence_components", `SELECT count(*)::int AS n FROM sentence_components sc JOIN sentences s ON s.id = sc.sentence_id AND s.is_deleted = true`],
    ["expression_components", `SELECT count(*)::int AS n FROM expression_components ec JOIN expressions e ON e.id = ec.expression_id AND e.is_deleted = true`]
  ];
  console.log("\n--- removed with them, by foreign key ---");
  for (const [label, sql] of cascades) {
    console.log(`   ${label.padEnd(22)} ${String(await count(c, sql)).padStart(6)}`);
  }

  if (!APPLY) {
    console.log("\n(nothing written -- pass --apply)");
    await c.end();
    return;
  }

  await c.query("BEGIN");

  for (const table of PURGE) {
    const r = await c.query(`DELETE FROM ${table} WHERE is_deleted = true`);
    console.log(`deleted ${String(r.rowCount).padStart(5)} from ${table}`);
  }

  // Nothing enforced these, so nothing removed them.
  console.log("\n--- sweeping rows left pointing at nothing ---");
  const sweeps: [string, string][] = [
    ["lesson_content_items (lesson gone)",
     `DELETE FROM lesson_content_items a WHERE NOT EXISTS (SELECT 1 FROM lessons l WHERE l.id = a.lesson_id)`],
    ["unit_content_items (unit gone)",
     `DELETE FROM unit_content_items a WHERE NOT EXISTS (SELECT 1 FROM units u WHERE u.id = a.unit_id)`],
    ["lesson_progress (lesson gone)",
     `DELETE FROM lesson_progress a WHERE NOT EXISTS (SELECT 1 FROM lessons l WHERE l.id = a.lesson_id)`],
    ["learner_question_misses (question gone)",
     `DELETE FROM learner_question_misses a WHERE NOT EXISTS (SELECT 1 FROM exercise_questions q WHERE q.id = a.question_id)`]
  ];
  for (const [label, sql] of sweeps) {
    const r = await c.query(sql);
    console.log(`   ${label.padEnd(42)} ${String(r.rowCount).padStart(5)}`);
  }

  // Content slots are typed, so each is checked against the one table it names.
  for (const [type, table] of Object.entries(SLOT_CONTENT)) {
    for (const [slot, col] of [["lesson_content_items", "content_id"], ["unit_content_items", "content_id"]] as const) {
      const r = await c.query(
        `DELETE FROM ${slot} a WHERE a.content_type = $1
           AND NOT EXISTS (SELECT 1 FROM ${table} x WHERE x.id = a.${col})`, [type]);
      if (r.rowCount) console.log(`   ${slot} (${type} gone)`.padEnd(45) + String(r.rowCount).padStart(5));
    }
    const perf = await c.query(
      `DELETE FROM learner_content_performance a WHERE a.content_type = $1
         AND NOT EXISTS (SELECT 1 FROM ${table} x WHERE x.id = a.content_id)`, [type]);
    if (perf.rowCount) console.log(`   learner_content_performance (${type} gone)`.padEnd(45) + String(perf.rowCount).padStart(5));
  }

  console.log("\n--- verifying ---");
  const after = await liveReferencesToDeleted(c);
  const leftover = await count(c,
    `SELECT (${PURGE.map((t) => `(SELECT count(*) FROM ${t} WHERE is_deleted = true)`).join(" + ")})::int AS n`);
  const dangling = await count(c,
    `SELECT (
       (SELECT count(*) FROM lesson_content_items a WHERE NOT EXISTS (SELECT 1 FROM lessons l WHERE l.id = a.lesson_id))
     + (SELECT count(*) FROM unit_content_items a WHERE NOT EXISTS (SELECT 1 FROM units u WHERE u.id = a.unit_id))
     )::int AS n`);
  console.log(`   soft-deleted rows remaining : ${leftover}`);
  console.log(`   dangling slots remaining    : ${dangling}`);
  console.log(`   live -> deleted references  : ${after.length}`);

  if (leftover || dangling || after.length) {
    await c.query("ROLLBACK");
    throw new Error("post-purge check failed; rolled back");
  }

  await c.query("COMMIT");
  console.log("\ncommitted");
  await c.end();
}

main().catch(async (error) => {
  console.error(error?.message ?? error);
  // A half-finished purge is worse than none: parents gone, references left naming them.
  if (APPLY) await client?.query("ROLLBACK").catch(() => {});
  process.exit(1);
});
