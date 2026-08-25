/**
 * Retheme the placeholder chapter and give it a unit plan.
 *
 * "Chapter 7" held one empty unit, "Stepping Inside (Inú)", carrying the theme that was just
 * deleted -- generating into it would rebuild exactly what was removed.
 *
 * The replacement is transport, because it is the one chapter from the original 2026-04-28 plan
 * that the built curriculum never covered, and because it forces numbers into a real context.
 * `kan` (one) is currently the ONLY number in the corpus: a learner can ask "Èló ni?" and cannot
 * understand the answer, nor buy two of anything. A fare makes counting unavoidable, which a
 * counting drill does not.
 *
 * Everything else the chapter needs is already taught: ń lọ, sí, ilé, ọjà, ibi iṣẹ́, owó,
 * Èló ni, Bẹ́ẹ̀ ni, Rárá, níbí, níbẹ̀.
 *
 * Order index continues the global sequence -- chapter 5 ended at 35, so this runs 36 to 41 --
 * and follows the house pattern of core, core, review, core, core, review.
 *
 *   npx tsx src/scripts/createCommuteChapter.ts           # dry run
 *   npx tsx src/scripts/createCommuteChapter.ts --apply
 */
import "dotenv/config";
import { Client } from "pg";
import { genObjectId } from "../utils/ids.js";

const APPLY = process.argv.includes("--apply");

const CHAPTER_ID = "6a8a0462c04c838f6452da38"; // currently titled "Chapter 7"
const DROP_UNIT = "Stepping Inside (Inú)";

const CHAPTER_TITLE = "The Commute (Transport, Fares & Directions)";
const CHAPTER_DESCRIPTION =
  "You can already say where you are going. Now you will get there. This chapter puts the " +
  "learner in a vehicle: stopping one, saying the destination, hearing a fare and paying it, " +
  "and telling the driver where to stop. It also breaks past kan (one) into real counting, " +
  "because a fare cannot be understood or argued with using a single number.";

type UnitSpec = {
  title: string;
  kind: "core" | "review";
  description: string;
  /** Titles of the units this one reviews. Resolved to ids after the core units exist. */
  reviews?: string[];
};

const UNITS: UnitSpec[] = [
  {
    title: "The Count (Two and Three)",
    kind: "core",
    description:
      "Break past one. Introduce Méjì (two) and Mẹ́ta (three) so the learner can state and " +
      "understand a quantity. Every sentence counts a noun already known: omi, oúnjẹ, fóònù, owó."
  },
  {
    title: "Hailing the Ride",
    kind: "core",
    description:
      "Introduce Ọkọ̀ (vehicle) and join it to the destination pattern the learner already has " +
      "with ń lọ and sí, so they can stop a vehicle and say where they are going: sí ilé, " +
      "sí ọjà, sí ibi iṣẹ́."
  },
  {
    title: "Review: The Count + Hailing the Ride",
    kind: "review",
    description:
      "Review counting and stating a destination together. The learner names a quantity and a " +
      "place in the same exchange, with no new vocabulary.",
    reviews: ["The Count (Two and Three)", "Hailing the Ride"]
  },
  {
    title: "The Fare",
    kind: "core",
    description:
      "Put numbers and money together. The learner asks Èló ni for a fare, understands an answer " +
      "counted in known numbers, and accepts or refuses it with Bẹ́ẹ̀ ni and Rárá."
  },
  {
    title: "Stop Here",
    kind: "core",
    description:
      "Introduce Dúró (stop) and pair it with níbí (here) and níbẹ̀ (there) so the learner can " +
      "tell a driver exactly where to stop."
  },
  {
    title: "Review: The Fare + Stop Here",
    kind: "review",
    description:
      "Review paying and directing in one exchange: agree a fare, then say where to stop. No new " +
      "vocabulary.",
    reviews: ["The Fare", "Stop Here"]
  }
];

let client: Client | null = null;

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  client = c;
  await c.connect();
  console.log(APPLY ? "=== APPLYING ===\n" : "=== DRY RUN (pass --apply to write) ===\n");

  const chapter = (await c.query(
    `SELECT id, title, order_index FROM chapters WHERE id = $1 AND is_deleted = false`,
    [CHAPTER_ID])).rows[0] as any;
  if (!chapter) throw new Error(`chapter ${CHAPTER_ID} not found`);

  // Copy language, level and owner from a built unit rather than hardcoding them.
  const model = (await c.query(
    `SELECT language, language_id, level, created_by FROM units
     WHERE is_deleted = false AND language_id IS NOT NULL
     ORDER BY order_index DESC LIMIT 1`)).rows[0] as any;
  if (!model) throw new Error("no existing unit to copy language/level/owner from");

  const nextIndex = Number((await c.query(
    `SELECT coalesce(max(order_index), -1) + 1 AS n FROM units
     WHERE is_deleted = false AND chapter_id <> $1`, [CHAPTER_ID])).rows[0].n);

  console.log(`chapter: "${chapter.title}"  ->  "${CHAPTER_TITLE}"`);
  console.log(`   ${CHAPTER_DESCRIPTION.slice(0, 110)}...\n`);

  const doomed = (await c.query(
    `SELECT id, title FROM units WHERE chapter_id = $1 AND title = $2`,
    [CHAPTER_ID, DROP_UNIT])).rows as any[];
  for (const d of doomed) {
    const lessons = (await c.query(
      `SELECT count(*)::int AS n FROM lessons WHERE unit_id = $1`, [d.id])).rows[0].n;
    if (lessons > 0) throw new Error(`"${d.title}" has ${lessons} lessons; refusing to delete`);
    console.log(`removing empty unit: "${d.title}"`);
  }

  console.log(`\nnew units (order ${nextIndex}-${nextIndex + UNITS.length - 1}):`);
  UNITS.forEach((u, i) => {
    console.log(`   ${nextIndex + i} [${u.kind}] "${u.title}"`);
    console.log(`        ${u.description.slice(0, 96)}...`);
    if (u.reviews) console.log(`        reviews: ${u.reviews.map((r) => `"${r}"`).join(", ")}`);
  });

  if (!APPLY) { console.log("\n(nothing written)"); await c.end(); return; }

  await c.query("BEGIN");

  await c.query(
    `UPDATE chapters SET title = $1, description = $2, updated_at = now() WHERE id = $3`,
    [CHAPTER_TITLE, CHAPTER_DESCRIPTION, CHAPTER_ID]);
  if (doomed.length) {
    await c.query(`DELETE FROM unit_content_items WHERE unit_id = ANY($1::text[])`,
      [doomed.map((d) => d.id)]);
    await c.query(`DELETE FROM units WHERE id = ANY($1::text[])`, [doomed.map((d) => d.id)]);
  }

  // Cores first, so the review units can point at real ids.
  const idByTitle = new Map<string, string>();
  for (const [i, u] of UNITS.entries()) {
    const id = genObjectId();
    idByTitle.set(u.title, id);
    await c.query(
      `INSERT INTO units
         (id, chapter_id, language_id, language, title, description, level, kind, order_index,
          status, review_style, review_source_unit_ids, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft',$10,$11,$12)`,
      [id, CHAPTER_ID, model.language_id, model.language, u.title, u.description, model.level,
       u.kind, nextIndex + i, u.kind === "review" ? "star" : "none", [], model.created_by]);
  }
  // Second pass: a review unit's sources are units created in the first pass.
  for (const u of UNITS) {
    if (!u.reviews?.length) continue;
    const sources = u.reviews.map((title) => {
      const id = idByTitle.get(title);
      if (!id) throw new Error(`"${u.title}" reviews unknown unit "${title}"`);
      return id;
    });
    await c.query(`UPDATE units SET review_source_unit_ids = $1 WHERE id = $2`,
      [sources, idByTitle.get(u.title)]);
  }

  const made = (await c.query(
    `SELECT count(*)::int AS n FROM units WHERE chapter_id = $1 AND is_deleted = false`,
    [CHAPTER_ID])).rows[0].n;
  if (made !== UNITS.length) {
    await c.query("ROLLBACK");
    throw new Error(`expected ${UNITS.length} units in the chapter, found ${made}; rolled back`);
  }

  await c.query("COMMIT");
  console.log(`\nchapter retitled, ${UNITS.length} units created`);
  await c.end();
}

main().catch(async (error) => {
  console.error(error?.message ?? error);
  if (APPLY) await client?.query("ROLLBACK").catch(() => {});
  process.exit(1);
});
