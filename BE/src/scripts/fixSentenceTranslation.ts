/**
 * Correct the English of named sentences, leaving the target language untouched.
 *
 * A vehicle does not go "to work" in English; it goes to the workplace. The Yoruba is right
 * and is not edited -- only the English a learner is shown and marked against.
 *
 *   npx tsx src/scripts/fixSentenceTranslation.ts           # dry run
 *   npx tsx src/scripts/fixSentenceTranslation.ts --apply
 */
import "dotenv/config";
import { Client } from "pg";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

const APPLY = process.argv.includes("--apply");

/** Yoruba text -> the English it should carry. Only the first translation is replaced. */
const FIXES: Array<{ text: string; english: string }> = [
  { text: "Ọkọ̀ méjì ń lọ sí ibi iṣẹ́.", english: "Two vehicles are going to the workplace." }
];

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  c.on("error", (err) => console.error(`database connection error: ${err.message}`));
  await c.connect();
  try {
    const before: unknown[] = [];
    const pending: Array<{ id: string; text: string; from: string; to: string; translations: string[] }> = [];

    for (const fix of FIXES) {
      const rows = (
        await c.query(
          `SELECT id, text, translations FROM sentences
            WHERE language = 'yoruba' AND text = $1 AND is_deleted = false`,
          [fix.text]
        )
      ).rows;
      if (!rows.length) {
        console.log(`NOT FOUND: ${fix.text}`);
        continue;
      }
      for (const row of rows) {
        before.push(row);
        const current = String(row.translations?.[0] ?? "");
        if (current === fix.english) {
          console.log(`already correct: ${row.text}`);
          continue;
        }
        // Replace the leading translation, keep any alternates behind it.
        const next = [fix.english, ...(row.translations || []).slice(1).filter((item: string) => item !== fix.english)];
        pending.push({ id: row.id, text: row.text, from: current, to: fix.english, translations: next });
      }
    }

    for (const row of pending) {
      console.log(`${row.text}`);
      console.log(`   "${row.from}"`);
      console.log(`-> "${row.to}"`);
    }
    if (!pending.length) return console.log("nothing to change");
    if (!APPLY) return console.log("\ndry run -- pass --apply to write");

    mkdirSync("scratch", { recursive: true });
    const backup = path.resolve("scratch", `sentence-translation-backup-${Date.now()}.json`);
    writeFileSync(backup, JSON.stringify(before, null, 2));

    await c.query("BEGIN");
    try {
      for (const row of pending) {
        await c.query(`UPDATE sentences SET translations = $1, updated_at = now() WHERE id = $2`, [row.translations, row.id]);
      }
      await c.query("COMMIT");
    } catch (err) {
      await c.query("ROLLBACK");
      throw err;
    }
    console.log(`\napplied ${pending.length} change(s). previous values saved to ${backup}`);
  } finally {
    await c.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
