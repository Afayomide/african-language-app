/**
 * `ibi iṣẹ́` is a workplace, and the course kept calling it work.
 *
 * Three places carry a meaning and they disagreed: the expression row led with "work", so the
 * card said work; the per-occurrence glosses said "workplace" nine times and "work" three
 * times, with one left empty; and the English sentence text says "at work" / "to work".
 *
 * The English sentences are fine and are left alone -- "going to work" is what an English
 * speaker says. What has to be right is the gloss the learner sees when they tap the phrase
 * itself, and that reads "workplace" everywhere after this.
 *
 * It is also kept whole. `ibi` + `iṣẹ́` is a correct breakdown ("place" + "work") but not a
 * useful one: the learner wants the thing the two words name together.
 *
 *   npx tsx src/scripts/fixIbiIseGloss.ts            # dry run, prints every change
 *   npx tsx src/scripts/fixIbiIseGloss.ts --apply    # writes, after saving a backup
 */
import "dotenv/config";
import { Client } from "pg";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

const APPLY = process.argv.includes("--apply");
const TEXT = "ibi iṣẹ́";
const GLOSS = "workplace";
/** "work" stays, because the phrase does mean that; it just must not lead. */
const TRANSLATIONS = ["workplace", "place of work", "work"];

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  c.on("error", (err) => console.error(`database connection error: ${err.message}`));
  await c.connect();
  try {
    const expression = (
      await c.query(
        `SELECT id, text, translations, keep_whole FROM expressions
          WHERE language = 'yoruba' AND text = $1 AND is_deleted = false`,
        [TEXT]
      )
    ).rows[0];
    if (!expression) throw new Error(`no expression row for ${TEXT}`);

    const occurrences = (
      await c.query(
        `SELECT sc.id, sc.gloss, s.text AS sentence, s.translations[1] AS english
           FROM sentence_components sc
           JOIN sentences s ON s.id = sc.sentence_id AND s.is_deleted = false
          WHERE sc.ref_id = $1
          ORDER BY s.text`,
        [expression.id]
      )
    ).rows;
    const wrong = occurrences.filter((row) => row.gloss !== GLOSS);

    console.log(`expression ${expression.text}`);
    console.log(`   translations: ${JSON.stringify(expression.translations)}  ->  ${JSON.stringify(TRANSLATIONS)}`);
    console.log(`   keep_whole:   ${expression.keep_whole}  ->  true`);
    console.log(`\n${occurrences.length} occurrences in sentences, ${wrong.length} to change:`);
    for (const row of wrong) {
      console.log(`   "${row.sentence}"`);
      console.log(`      ${row.gloss === null ? "(no gloss)" : `"${row.gloss}"`} -> "${GLOSS}"     English stays: ${row.english}`);
    }
    if (!wrong.length) console.log("   (none -- every occurrence already reads workplace)");

    if (!APPLY) return console.log("\ndry run -- pass --apply to write");

    mkdirSync("scratch", { recursive: true });
    const backup = path.resolve("scratch", `ibi-ise-backup-${Date.now()}.json`);
    writeFileSync(backup, JSON.stringify({ expression, occurrences }, null, 2));

    await c.query("BEGIN");
    try {
      await c.query(`UPDATE expressions SET translations = $1, keep_whole = true, updated_at = now() WHERE id = $2`, [
        TRANSLATIONS,
        expression.id
      ]);
      await c.query(`UPDATE sentence_components SET gloss = $1 WHERE ref_id = $2`, [GLOSS, expression.id]);
      await c.query("COMMIT");
    } catch (err) {
      await c.query("ROLLBACK");
      throw err;
    }
    console.log(`\napplied. previous values saved to ${backup}`);
  } finally {
    await c.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
