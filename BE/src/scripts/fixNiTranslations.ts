/**
 * Put `ní`'s primary meaning first, and say what its two jobs are.
 *
 * The word row led with "have" while every one of its 46 sentences uses the locative sense --
 * glossed "at" 43 times, "in" once. A learner tapping `ní` in "Bàbá wà ní ilé" was shown a
 * dictionary entry headed by a meaning the course never demonstrates. Same defect as `ń`
 * leading with "are".
 *
 * "have" is NOT removed: `ní` really is the possessive verb ("Mo ní owó" -- I have money;
 * "Baba ní ilé ńlá" -- father has a big house). It is demoted, because the course has not
 * taught that use yet. When a possession unit is built, the gloss for those occurrences should
 * say "has/have" while the locative ones keep "at" -- the same way `ni` carries three separate
 * glosses for its copula, focus and object-marker jobs rather than one blended entry.
 *
 * Two entries are dropped outright: "particle" names a part of speech rather than a meaning,
 * and "for/at" is two meanings jammed into one string.
 *
 *   npx tsx src/scripts/fixNiTranslations.ts           # dry run
 *   npx tsx src/scripts/fixNiTranslations.ts --apply
 */
import "dotenv/config";
import { Client } from "pg";

const APPLY = process.argv.includes("--apply");

const WORD = "ní";

/** Ordered: the locative sense the course actually teaches leads. */
const TRANSLATIONS = ["at", "in", "on", "have", "with", "of", "for"];

const EXPLANATION =
  "Does two different jobs. Most often it marks a place -- 'Bàbá wà ní ilé' (Dad is at home) " +
  "-- and that is the use taught so far. It is also the verb for having: 'Mo ní owó' means " +
  "'I have money'. Same word, and only the sentence around it tells you which job it is doing.";

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  console.log(APPLY ? "=== APPLYING ===\n" : "=== DRY RUN (pass --apply to write) ===\n");

  const rows = (await c.query(
    `SELECT id, text, translations, explanation FROM words
     WHERE text = $1 AND is_deleted = false`, [WORD])).rows as any[];
  if (rows.length !== 1) throw new Error(`expected 1 live row for "${WORD}", found ${rows.length}`);
  const row = rows[0];

  // Nothing kept may be invented: every entry must already be on the row.
  const existing = new Set((row.translations as string[]).map((t) => t.trim().toLowerCase()));
  const added = TRANSLATIONS.filter((t) => !existing.has(t.toLowerCase()));
  if (added.length) throw new Error(`would introduce new meanings not on the row: ${added.join(", ")}`);
  const dropped = (row.translations as string[]).filter(
    (t) => !TRANSLATIONS.some((k) => k.toLowerCase() === t.trim().toLowerCase()));

  console.log(`"${row.text}"`);
  console.log(`   translations were: ${JSON.stringify(row.translations)}`);
  console.log(`   translations now : ${JSON.stringify(TRANSLATIONS)}`);
  console.log(`   dropped          : ${JSON.stringify(dropped)}`);
  console.log(`   explanation was  : ${JSON.stringify(row.explanation || "")}`);
  console.log(`   explanation now  : ${JSON.stringify(EXPLANATION)}`);

  // How the corpus actually uses it, so the reorder can be checked against reality.
  const glosses = (await c.query(
    `SELECT sc.gloss, count(*)::int AS n FROM sentence_components sc
     JOIN sentences s ON s.id = sc.sentence_id AND s.is_deleted = false
     WHERE sc.ref_id = $1 GROUP BY sc.gloss ORDER BY n DESC`, [row.id])).rows as any[];
  console.log(`\n   how it is glossed in the corpus:`);
  glosses.forEach((g) => console.log(`      ${String(g.n).padStart(3)}  ${g.gloss === null ? "(none)" : `"${g.gloss}"`}`));

  if (!APPLY) { console.log("\n(nothing written)"); await c.end(); return; }

  await c.query(
    `UPDATE words SET translations = $1, explanation = $2, updated_at = now() WHERE id = $3`,
    [TRANSLATIONS, EXPLANATION, row.id]);
  console.log("\ncommitted");
  await c.end();
}

main().catch((error) => { console.error(error?.message ?? error); process.exit(1); });
