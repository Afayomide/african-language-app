/**
 * Rewrite chapter 8's units to the revised blueprint.
 *
 * The chapter was built around possession -- "To Have" and "Not Having", both resting on `ní`.
 * That is dropped. Two things made it a bad bet: the corpus contains no possession sentence at
 * all to anchor it, and the negative form collides with the future negative (`kò ní` before a
 * verb is "will not"), which a beginner unit would have walked straight into.
 *
 * The replacement introduces Ọmọ (child) instead -- the one word in the blueprint that is
 * genuinely new. Ọmọ used to exist as a card with four drills and no sentence behind it; that
 * was removed wholesale, so the word row and its introduce claim are both gone and this unit
 * can teach it from scratch.
 *
 * Layout is the house pattern: four core units with a review after every two.
 *
 * WHAT WILL AND WILL NOT INTRODUCE. Stage-1 introductions skip any word already carrying an
 * `introduce` row elsewhere, so of the four cores only "The Dependent" will produce one:
 *
 *   Ṣé            introduced unit 34 "The Panic Search", 27 sentences  -> review
 *   jẹ / jẹun     introduced unit 1 "The Essentials", 7 / 14 sentences -> review
 *   mu            introduced unit 1, 7 sentences                       -> review
 *   Ọmọ           absent from the corpus                               -> INTRODUCE
 *
 * That is correct for units whose job is to drill a pattern over known words, and the
 * descriptions say so rather than promising an introduction the generator cannot make.
 *
 * `mu` is spelled without tone marks throughout, matching the corpus and confirmed correct.
 *
 * Units are replaced rather than edited because none of them has generated lessons yet; the
 * script refuses to run if that stops being true.
 *
 *   npx tsx src/scripts/rebuildBinaryChapter.ts           # dry run
 *   npx tsx src/scripts/rebuildBinaryChapter.ts --apply
 */
import "dotenv/config";
import { Client } from "pg";
import { genObjectId } from "../utils/ids.js";

const APPLY = process.argv.includes("--apply");

const CHAPTER_TITLE = "The Binary World & Survival Actions";
const CHAPTER_DESCRIPTION =
  "Turn statements into questions, and put a dependent at the centre of them. The learner " +
  "learns to flip any sentence they own into a yes or no question with Ṣé, meets Ọmọ (child) " +
  "as someone to locate, count and ask about, and pairs the survival verbs jẹ and mu with " +
  "oúnjẹ and omi to state immediate needs. Every sentence stays at eight words or fewer.";

type UnitSpec = { title: string; kind: "core" | "review"; description: string; reviews?: string[] };

const UNITS: UnitSpec[] = [
  {
    title: "The Binary Switch (Ṣé)",
    kind: "core",
    description:
      "Drill Ṣé, the yes or no question marker, as a pattern rather than a new word. Putting Ṣé " +
      "at the front of a sentence the learner already owns turns it into a question: " +
      "Ṣé ọkọ̀ ń bọ̀? (Is a vehicle coming?) from Ọkọ̀ ń bọ̀. Every lesson takes a known " +
      "statement, flips it, and answers with Bẹ́ẹ̀ ni or Rárá. No new vocabulary."
  },
  {
    title: "The Dependent (Ọmọ)",
    kind: "core",
    description:
      "Introduce Ọmọ (child). The learner tracks where the child is, counts them, and asks yes " +
      "or no questions about their needs: Ṣé ọmọ mi wà níbẹ̀? (Is my child there?). Built " +
      "entirely on words already known -- wà, níbí, níbẹ̀, mi, kan, méjì -- so the child is the " +
      "only new thing in the unit."
  },
  {
    title: "Review: The Binary Switch + The Dependent",
    kind: "review",
    description:
      "Consolidate the question pattern against the new noun. The learner asks and answers yes " +
      "or no questions about where the child is and how many there are, with no new vocabulary.",
    reviews: ["The Binary Switch (Ṣé)", "The Dependent (Ọmọ)"]
  },
  {
    title: "Consumption (Jẹ & mu)",
    kind: "core",
    description:
      "Pair the survival verbs with the things they act on: jẹ and jẹun for eating, mu for " +
      "drinking, over oúnjẹ and omi. Every lesson states an immediate need and answers it, for " +
      "the learner and for the child: Ṣé ọmọ mi fẹ́ jẹun? No new vocabulary."
  },
  {
    title: "The Chapter 8 Boss Level",
    kind: "core",
    description:
      "High-speed integration, eight words maximum and no sentence longer. The learner asks yes " +
      "or no questions about what the child is eating, who is drinking water, and where people " +
      "are, using Ṣé over jẹ, jẹun, mu and wà. No new vocabulary."
  },
  {
    title: "Review: Consumption + The Boss Level",
    kind: "review",
    description:
      "Close the chapter. Eating, drinking, location and the child in one exchange, all under " +
      "the Ṣé question pattern. No new vocabulary.",
    reviews: ["Consumption (Jẹ & mu)", "The Chapter 8 Boss Level"]
  }
];

let client: Client | null = null;

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  client = c;
  await c.connect();
  console.log(APPLY ? "=== APPLYING ===\n" : "=== DRY RUN (pass --apply to write) ===\n");

  const chapter = (await c.query(
    `SELECT id, title FROM chapters WHERE title = $1 AND is_deleted = false`, [CHAPTER_TITLE])).rows[0] as any;
  if (!chapter) throw new Error(`chapter "${CHAPTER_TITLE}" not found`);

  const old = (await c.query(
    `SELECT id, title, kind, order_index, language, language_id, level, created_by
     FROM units WHERE chapter_id = $1 AND is_deleted = false ORDER BY order_index`, [chapter.id])).rows as any[];
  if (!old.length) throw new Error("chapter has no units to replace");

  // Never reorganise built content. Anything generated has to be dealt with deliberately.
  const built = (await c.query(
    `SELECT u.title, count(l.id)::int AS n FROM units u
     JOIN lessons l ON l.unit_id = u.id AND l.is_deleted = false
     WHERE u.id = ANY($1::text[]) GROUP BY u.title`, [old.map((u) => u.id)])).rows as any[];
  if (built.length) throw new Error(
    `these units have generated lessons; refusing to replace: ${built.map((b) => `"${b.title}"=${b.n}`).join(", ")}`);

  const model = old[0];
  const base = Number(old[0].order_index);

  console.log(`chapter: "${chapter.title}"\n`);
  console.log(`REMOVING ${old.length} unit(s):`);
  for (const u of old) console.log(`   ${u.order_index} [${u.kind}] "${u.title}"`);
  console.log(`\nCREATING ${UNITS.length} unit(s):`);
  UNITS.forEach((u, i) => {
    console.log(`   ${base + i} [${u.kind.padEnd(6)}] "${u.title}"`);
    if (u.reviews) console.log(`        reviews: ${u.reviews.join(" + ")}`);
  });
  const cores = UNITS.filter((u) => u.kind === "core").length;
  console.log(`\n   -> ${cores} core, ${UNITS.length - cores} review`);
  if (cores !== 4 || UNITS.length - cores !== 2)
    throw new Error(`expected 4 core / 2 review, got ${cores}/${UNITS.length - cores}`);

  // Say up front which targets can actually be introduced, so an empty column is not a surprise.
  console.log(`\nintroduction eligibility of the targets:`);
  for (const t of ["Ṣé", "jẹ", "jẹun", "mu", "Ọmọ"]) {
    const row = (await c.query(
      `SELECT w.id FROM words w WHERE lower(w.text) = lower($1) AND w.is_deleted = false`, [t])).rows[0] as any;
    if (!row) { console.log(`   ${t.padEnd(6)} absent from the corpus             -> INTRODUCE`); continue; }
    const claim = (await c.query(
      `SELECT u.order_index AS ui, u.title FROM lesson_content_items lci
       JOIN lessons l ON l.id = lci.lesson_id AND l.is_deleted = false
       JOIN units u ON u.id = l.unit_id AND u.is_deleted = false
       WHERE lci.content_id = $1 AND lci.role = 'introduce' LIMIT 1`, [row.id])).rows[0] as any;
    console.log(claim
      ? `   ${t.padEnd(6)} introduced unit ${String(claim.ui).padEnd(3)} "${claim.title}"  -> review`
      : `   ${t.padEnd(6)} no introduce claim                 -> INTRODUCE`);
  }

  if (!APPLY) { console.log("\n(nothing written)"); await c.end(); return; }

  await c.query("BEGIN");
  await c.query(`UPDATE chapters SET description = $1, updated_at = now() WHERE id = $2`,
    [CHAPTER_DESCRIPTION, chapter.id]);
  await c.query(`DELETE FROM unit_content_items WHERE unit_id = ANY($1::text[])`, [old.map((u) => u.id)]);
  await c.query(`DELETE FROM units WHERE id = ANY($1::text[])`, [old.map((u) => u.id)]);

  const idByTitle = new Map<string, string>();
  for (const [i, u] of UNITS.entries()) {
    const id = genObjectId();
    idByTitle.set(u.title, id);
    await c.query(
      `INSERT INTO units
         (id, chapter_id, language_id, language, title, description, level, kind, order_index,
          status, review_style, review_source_unit_ids, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft',$10,$11,$12)`,
      [id, chapter.id, model.language_id, model.language, u.title, u.description, model.level,
       u.kind, base + i, u.kind === "review" ? "star" : "none", [], model.created_by]);
  }
  for (const u of UNITS) {
    if (!u.reviews?.length) continue;
    await c.query(`UPDATE units SET review_source_unit_ids = $1 WHERE id = $2`,
      [u.reviews.map((t) => {
        const id = idByTitle.get(t);
        if (!id) throw new Error(`"${u.title}" reviews unknown unit "${t}"`);
        return id;
      }), idByTitle.get(u.title)]);
  }

  const made = (await c.query(
    `SELECT count(*)::int AS n FROM units WHERE chapter_id = $1 AND is_deleted = false`, [chapter.id])).rows[0].n;
  const dupes = (await c.query(
    `SELECT order_index FROM units WHERE chapter_id = $1 AND is_deleted = false
     GROUP BY order_index HAVING count(*) > 1`, [chapter.id])).rows as any[];
  if (made !== UNITS.length || dupes.length) {
    await c.query("ROLLBACK");
    throw new Error(`post-check failed (units ${made}, duplicate indexes ${dupes.length}); rolled back`);
  }

  await c.query("COMMIT");
  console.log(`\nchapter rebuilt: ${UNITS.length} units, ${cores} core / ${UNITS.length - cores} review`);
  await c.end();
}

main().catch(async (error) => {
  console.error(error?.message ?? error);
  if (APPLY) await client?.query("ROLLBACK").catch(() => {});
  process.exit(1);
});
