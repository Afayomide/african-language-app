/**
 * Replace invented proverbs with real ones.
 *
 * A model asked for a proverb about a lesson's vocabulary produces something in proverb shape
 * rather than admit it has none. The tell is that the target word is always in it: every
 * proverb generated for "The Quantities (One)" contains `kan` (one), every one for
 * "come, go and size" contains `lọ` or `bọ̀`, and "Ìta kò ní ìtìjú" (the outside has no shame)
 * is simply `ìta` dressed as wisdom. Capping the count at one per lesson stopped the padding
 * but not the inventing.
 *
 * Replacements come from lessons holding two, and ONLY from proverbs that predate these runs.
 * That filter matters: an earlier pass moved "Ẹni tó bá lọ, ó máa bọ̀." as a donor without it
 * and simply swapped one invention for another.
 *
 * Matching prefers shared vocabulary so the closing line uses words the learner just met, but
 * authenticity outranks fit -- a real proverb sharing one word beats a fabricated one sharing
 * five. Near-identical variants are also spread out: three "if we do not know where we are
 * going" rows would otherwise land in the same unit.
 *
 * Hard delete, not soft: a retired row can be picked up by the next generation's
 * "what already exists" check, reintroducing exactly what was removed.
 *
 *   npx tsx src/scripts/replaceGeneratedProverbs.ts           # dry run
 *   npx tsx src/scripts/replaceGeneratedProverbs.ts --apply
 */
import "dotenv/config";
import { Client } from "pg";

const APPLY = process.argv.includes("--apply");

/** Invented proverbs to remove entirely, with every block that shows them. */
const REMOVE: string[] = [
  // "Hailing the Ride" -- every one contains Ọkọ̀, the unit's target word, and three are
  // variations of a single invented line. Two of those three contradict each other: one says
  // a fast vehicle arrives early, another says it arrives late.
  "Ọkọ̀ ẹni kì í lọ sí ibi tí kò sí olùtọ́jú.",
  "Ọkọ̀ kan ń lọ, ọkọ̀ kejì ń bọ̀.",
  "Ọkọ̀ tó bá yára, á dé ìbẹ̀rẹ̀.",
  "Ọkọ̀ tó bá yára, á dé ibi tí ó ń lọ.",
  "Ọkọ̀ tó bá yára, á dé lẹ́yìn."
];

/** One real proverb per lesson left without one, and the lesson that gives it up. */
const ADD: { lesson: string; proverb: string; donor: string }[] = [
  // Hand-picked rather than taken from the matcher, which piled four near-identical
  // "if we do not know where we are going" variants into this one unit.
  { lesson: "The Vehicle Route",
    proverb: "Ọ̀nà tí a gbà lọ, ni a ń gbà bọ̀.",
    donor: "Coming and Returning" },
  { lesson: "Locating the Ride",
    proverb: "Àlejò kì í wá kí onílé má mọ̀.",
    donor: "Basic Direction" },
  { lesson: "Review: The Vehicle Route + Locating the Ride",
    proverb: "Bí o ò bá mọ ibi tí o ń lọ, rántí ibi tí o ti ń bọ̀.",
    donor: "The Pronoun vs. Negative Contrast" },
  // One hand versus more: the counting idea, and the authentic wording of the garbled
  // "Ọwọ́ kan kò lè gbé ẹrù dídùn" that was deleted from "The Quantities (One)".
  { lesson: "Counting the Fleet",
    proverb: "Ọwọ́ kan ò gbé ẹrù dórí.",
    donor: "The General Shield" },
  { lesson: "The Commute Check",
    proverb: "Àjò kì í dùn kí á má padà wá sí ilé.",
    donor: "Full Request and Report" },
  { lesson: "Review: Counting the Fleet + The Commute Check",
    proverb: "Bí ojú kò bá ti ẹni tí ó ń lọ, kò ní ti ẹni tí ó ń bọ̀.",
    donor: "Review: Coming and Returning + Full Request and Report" }
];

let client: Client | null = null;

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  client = c;
  await c.connect();
  console.log(APPLY ? "=== APPLYING (irreversible) ===\n" : "=== DRY RUN (pass --apply to write) ===\n");
  if (APPLY) await c.query("BEGIN");

  // Resolve everything before writing, so a bad name fails the run rather than half of it.
  const doomed: { id: string; text: string; blocks: number }[] = [];
  for (const text of REMOVE) {
    const rows = (await c.query(
      `SELECT id, text FROM proverbs WHERE text = $1 AND is_deleted = false`, [text])).rows as any[];
    if (rows.length !== 1) throw new Error(`"${text}": found ${rows.length} proverbs, expected 1`);
    const blocks = (await c.query(
      `SELECT count(*)::int AS n FROM lesson_blocks WHERE ref_id = $1`, [rows[0].id])).rows[0].n;
    doomed.push({ id: rows[0].id, text: rows[0].text, blocks });
  }
  console.log(`--- to delete (${doomed.length}) ---`);
  doomed.forEach((d) => console.log(`   ${d.blocks} block(s)  "${d.text}"`));

  const moves: any[] = [];
  for (const a of ADD) {
    const lesson = (await c.query(
      `SELECT id, title FROM lessons WHERE title = $1 AND is_deleted = false`, [a.lesson])).rows as any[];
    if (lesson.length !== 1) throw new Error(`lesson "${a.lesson}": found ${lesson.length}`);
    const proverb = (await c.query(
      `SELECT id, text, translation FROM proverbs WHERE text = $1 AND is_deleted = false
       ORDER BY created_at LIMIT 1`, [a.proverb])).rows[0] as any;
    if (!proverb) throw new Error(`replacement "${a.proverb}" not found`);
    const block = (await c.query(
      `SELECT lb.id, st.lesson_id FROM lesson_blocks lb
       JOIN lesson_stages st ON st.id = lb.stage_id
       JOIN lessons l ON l.id = st.lesson_id AND l.is_deleted = false
       WHERE lb.ref_id = $1 AND lb.type = 'proverb' AND l.title = $2 LIMIT 1`,
      [proverb.id, a.donor])).rows[0] as any;
    if (!block) throw new Error(`no donor block for "${a.proverb}" in "${a.donor}"`);

    // The donor keeps at least one after giving this up. Blocks about to be deleted do not
    // count towards that, or a donor could be left holding only an invented proverb.
    const remaining = (await c.query(
      `SELECT count(*)::int AS n FROM lesson_blocks lb JOIN lesson_stages st ON st.id = lb.stage_id
       WHERE st.lesson_id = $1 AND lb.type = 'proverb' AND lb.id <> $2
         AND lb.ref_id <> ALL($3::text[])`,
      [block.lesson_id, block.id, doomed.map((d) => d.id)])).rows[0].n;
    if (remaining < 1) throw new Error(`"${a.donor}" would be left with no real proverb`);

    moves.push({ ...a, lesson: lesson[0], proverb, block, remaining });
  }

  console.log(`\n--- to add (${moves.length}) ---`);
  moves.forEach((m) => {
    console.log(`   "${m.lesson.title}"`);
    console.log(`      "${m.proverb.text}"  = ${m.proverb.translation}`);
    console.log(`      from "${m.donor}" (keeps ${m.remaining})`);
  });

  if (!APPLY) { console.log("\n(nothing written)"); await c.end(); return; }

  const ids = doomed.map((d) => d.id);
  const delBlocks = await c.query(`DELETE FROM lesson_blocks WHERE ref_id = ANY($1::text[])`, [ids]);
  const delProverbs = await c.query(`DELETE FROM proverbs WHERE id = ANY($1::text[])`, [ids]);
  console.log(`\ndeleted ${delProverbs.rowCount} proverbs and ${delBlocks.rowCount} blocks`);

  for (const m of moves) {
    const stage = (await c.query(
      `SELECT id FROM lesson_stages WHERE lesson_id = $1 ORDER BY order_index DESC LIMIT 1`,
      [m.lesson.id])).rows[0] as any;
    const nextOrder = (await c.query(
      `SELECT coalesce(max(order_index), -1) + 1 AS n FROM lesson_blocks WHERE stage_id = $1`,
      [stage.id])).rows[0].n;
    await c.query(`UPDATE lesson_blocks SET stage_id = $1, order_index = $2 WHERE id = $3`,
      [stage.id, nextOrder, m.block.id]);
    const claimed = (await c.query(
      `SELECT lesson_ids FROM proverbs WHERE id = $1`, [m.proverb.id])).rows[0].lesson_ids || [];
    const next = [...claimed.filter((id: string) => id !== m.block.lesson_id), m.lesson.id];
    await c.query(`UPDATE proverbs SET lesson_ids = $1, updated_at = now() WHERE id = $2`,
      [Array.from(new Set(next)), m.proverb.id]);
  }

  // Scoped to the lessons this run touched -- recipients and donors. A corpus-wide check
  // rolls back a correct change because some unrelated lesson elsewhere is already short,
  // which is exactly what happened: a unit generated separately had five lessons with no
  // proverb before this script ever ran. Name them rather than counting, so a failure says
  // which lesson broke instead of only how many.
  const touched = [...new Set(moves.flatMap((m) => [m.lesson.id, m.block.lesson_id]))];
  const withoutRows = (await c.query(
    `SELECT l.title, u.title AS unit FROM lessons l JOIN units u ON u.id = l.unit_id
     WHERE l.id = ANY($1::text[]) AND NOT EXISTS (
       SELECT 1 FROM lesson_stages st JOIN lesson_blocks lb ON lb.stage_id = st.id
       WHERE st.lesson_id = l.id AND lb.type = 'proverb')`, [touched])).rows as any[];
  withoutRows.forEach((r) => console.log(`   left with no proverb: "${r.title}" [${r.unit}]`));
  const without = withoutRows.length;
  const dangling = (await c.query(
    `SELECT count(*)::int AS n FROM lesson_blocks lb WHERE lb.type = 'proverb'
       AND NOT EXISTS (SELECT 1 FROM proverbs p WHERE p.id = lb.ref_id)`)).rows[0].n;
  if (without || dangling) {
    await c.query("ROLLBACK");
    throw new Error(`lessons without a proverb: ${without}, dangling blocks: ${dangling}; rolled back`);
  }

  await c.query("COMMIT");
  console.log(`moved ${moves.length} real proverbs into place`);
  await c.end();
}

main().catch(async (error) => {
  console.error(error?.message ?? error);
  if (APPLY) await client?.query("ROLLBACK").catch(() => {});
  process.exit(1);
});
