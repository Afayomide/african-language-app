/**
 * Remove the proverbs a unit generation produced, and the blocks that show them.
 *
 * Generated "proverbs" are not always proverbs. A run can emit sentences built from the
 * unit's own vocabulary in proverb shape -- "Fóònù tó bá sọnù, ó ti tán." is a sentence about
 * a lost phone, not something anyone says -- and a learner shown that as traditional wisdom is
 * being taught something false about the language.
 *
 * Hard delete, not soft: a retired row can be picked up again by the next generation's
 * "what already exists" check, which is the opposite of the intent here.
 *
 * REFUSES to delete a proverb that anything outside this unit uses -- another unit's block, a
 * lesson or unit slot, a question, or a learner's progress. Those are somebody else's content.
 *
 *   npx tsx src/scripts/deleteUnitProverbs.ts <unitId>
 *   npx tsx src/scripts/deleteUnitProverbs.ts <unitId> --apply
 */
import "dotenv/config";
import { Client } from "pg";

const APPLY = process.argv.includes("--apply");
const UNIT = process.argv.find((a) => !a.startsWith("--") && /^[a-f\d]{24}$/i.test(a));

if (!UNIT) {
  console.error("usage: npx tsx src/scripts/deleteUnitProverbs.ts <unitId> [--apply]");
  process.exit(1);
}

let client: Client | null = null;

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  client = c;
  await c.connect();
  console.log(APPLY ? "=== APPLYING (irreversible) ===\n" : "=== DRY RUN (pass --apply to write) ===\n");

  const unit = (await c.query(`SELECT title FROM units WHERE id = $1`, [UNIT])).rows[0] as any;
  if (!unit) throw new Error(`no unit ${UNIT}`);
  console.log(`unit: "${unit.title}"\n`);

  const proverbs = (await c.query(
    `SELECT DISTINCT p.id, p.text FROM proverbs p
     JOIN lesson_blocks lb ON lb.ref_id = p.id
     JOIN lesson_stages st ON st.id = lb.stage_id
     JOIN lessons l ON l.id = st.lesson_id AND l.unit_id = $1
     WHERE p.is_deleted = false
     ORDER BY p.text`, [UNIT])).rows as any[];

  console.log(`proverbs referenced by this unit: ${proverbs.length}`);
  if (!proverbs.length) { await c.end(); return; }

  const ids = proverbs.map((p) => p.id);

  // Anything outside this unit means the proverb is not ours to remove.
  const shared: string[] = [];
  for (const p of proverbs) {
    const elsewhere = (await c.query(
      `SELECT count(*)::int AS n FROM lesson_blocks lb
       JOIN lesson_stages st ON st.id = lb.stage_id
       JOIN lessons l ON l.id = st.lesson_id
       WHERE lb.ref_id = $1 AND l.unit_id <> $2`, [p.id, UNIT])).rows[0].n;
    const slots = (await c.query(
      `SELECT (SELECT count(*) FROM lesson_content_items WHERE content_id = $1)
            + (SELECT count(*) FROM unit_content_items WHERE content_id = $1)
            + (SELECT count(*) FROM exercise_questions WHERE source_id = $1 AND is_deleted = false)
            + (SELECT count(*) FROM learner_content_performance WHERE content_id = $1) AS n`,
      [p.id])).rows[0].n;
    if (elsewhere || Number(slots)) {
      shared.push(`   "${p.text}" -- blocks elsewhere: ${elsewhere}, other references: ${slots}`);
    }
  }
  if (shared.length) {
    console.error("\nREFUSING: these are used outside this unit.\n");
    shared.forEach((s) => console.error(s));
    process.exit(1);
  }
  console.log("checked: nothing outside this unit references them\n");

  proverbs.forEach((p) => console.log(`   "${p.text}"`));

  const blocks = (await c.query(
    `SELECT count(*)::int AS n FROM lesson_blocks WHERE ref_id = ANY($1::text[])`, [ids])).rows[0].n;
  console.log(`\nblocks showing them: ${blocks}`);

  if (!APPLY) { console.log("\n(nothing written -- pass --apply)"); await c.end(); return; }

  await c.query("BEGIN");
  const removedBlocks = await c.query(
    `DELETE FROM lesson_blocks WHERE ref_id = ANY($1::text[])`, [ids]);
  const removedProverbs = await c.query(
    `DELETE FROM proverbs WHERE id = ANY($1::text[])`, [ids]);

  const left = (await c.query(
    `SELECT count(*)::int AS n FROM lesson_blocks WHERE ref_id = ANY($1::text[])`, [ids])).rows[0].n;
  if (left) { await c.query("ROLLBACK"); throw new Error(`${left} blocks still reference them; rolled back`); }

  await c.query("COMMIT");
  console.log(`\ndeleted ${removedProverbs.rowCount} proverbs and ${removedBlocks.rowCount} blocks`);
  await c.end();
}

main().catch(async (error) => {
  console.error(error?.message ?? error);
  if (APPLY) await client?.query("ROLLBACK").catch(() => {});
  process.exit(1);
});
