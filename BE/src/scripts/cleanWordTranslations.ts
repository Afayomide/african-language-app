/**
 * Remove contaminated translations from word rows.
 *
 * `upsertWordFromSentenceComponent` unions translations on every reuse and never removes
 * any, so words accumulate whatever each run guessed -- `àbúrò` ("younger sibling") ended
 * up carrying "price", "water" and "kiosk".
 *
 * The list below is EXPLICIT on purpose. An earlier attempt inferred contamination from
 * corpus evidence (see auditWordTranslations.ts) and misfired in both directions: it
 * proposed deleting "he"/"she" from `Wọ́n`, which genuinely carries them, while leaving
 * `àbúrò` = "kiosk" untouched. Absence of evidence is not evidence of error, so the
 * decision stays with a human and lives here where it can be reviewed and edited.
 *
 * Only cross-domain leaks are listed: glosses that belong to an unrelated word. Synonyms
 * and inflections ("small" for kékeré, "to purchase" for rà, "walking" for lọ) are left
 * alone -- they are unused, not wrong.
 *
 * Run with --apply to write; defaults to a dry run.
 */
import "dotenv/config";
import { Client } from "pg";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APPLY = process.argv.includes("--apply");
const RESTORE = process.argv.includes("--restore");
const BACKUP_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "wordTranslations.backup.json"
);

/** word text -> translations to drop. Matching is case-insensitive and trims whitespace. */
const REMOVALS: Record<string, string[]> = {
  "àbúrò": ["price", "water", "kiosk"],
  "abúrò": ["price", "water", "kiosk"],
  "ọkùnrin": ["news", "kiosk", "One"],
  "owó": ["thing", "object", "wallet", "price"],
  "mi": ["how many", "please", "mì", "you"],
  "ni": ["no", "this much"],
  "Ó": ["who", "that"],
  "fẹ́": ["to do", "to make"],
  "Ẹ": ["Hey", "Hi", "Hello", "I", "Please", "He/She"],
  "ń": ["to go", "going", "and", "the", "this", "not", "does not", "is not", "move"],
  "wà": ["yes"],
  "sí": ["yes"],
  "nìyẹn": ["there is"],
  "jẹ": ["eating"],
  "kò": ["do not"],
  "a": ["a", "an"]
};

const norm = (value: string) => String(value || "").trim().toLowerCase();

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const now = new Date();

  if (RESTORE) {
    const saved = JSON.parse(await fs.readFile(BACKUP_PATH, "utf8")) as Array<{ id: string; text: string; translations: string[] }>;
    await c.query("BEGIN");
    for (const row of saved) {
      await c.query(`UPDATE words SET translations = $2, updated_at = $3 WHERE id = $1`, [row.id, row.translations, now]);
    }
    await c.query("COMMIT");
    console.log(`restored ${saved.length} word rows from ${BACKUP_PATH}`);
    await c.end();
    return;
  }

  console.log(APPLY ? "=== APPLYING ===\n" : "=== DRY RUN (pass --apply to write) ===\n");

  const plan: Array<{ id: string; text: string; before: string[]; after: string[]; dropped: string[] }> = [];

  for (const [text, drops] of Object.entries(REMOVALS)) {
    const rows = (await c.query(
      `SELECT id, text, translations FROM words WHERE text = $1 AND is_deleted = false`, [text]
    )).rows as any[];
    if (!rows.length) { console.log(`  (no live word row for "${text}")`); continue; }

    for (const w of rows) {
      const dropSet = new Set(drops.map(norm));
      const before: string[] = w.translations || [];
      const after = before.filter((t) => !dropSet.has(norm(t)));
      const dropped = before.filter((t) => dropSet.has(norm(t)));
      if (!dropped.length) continue;
      if (!after.length) {
        console.log(`  !! SKIPPED "${w.text}" -- removal would empty its translations`);
        continue;
      }
      plan.push({ id: w.id, text: w.text, before, after, dropped });
    }
  }

  for (const p of plan) {
    console.log(`${p.text}   ${p.before.length} -> ${p.after.length} translations`);
    console.log(`   drop : ${JSON.stringify(p.dropped)}`);
    console.log(`   keep : ${JSON.stringify(p.after)}\n`);
  }

  const total = plan.reduce((n, p) => n + p.dropped.length, 0);
  console.log(`${"=".repeat(60)}`);
  console.log(`words affected        : ${plan.length}`);
  console.log(`translations removed  : ${total}`);

  if (!APPLY) { console.log("\n(nothing written)"); await c.end(); return; }

  // Snapshot before touching anything. These are judgement calls about Yoruba, so a plain
  // one-command revert has to exist: `tsx src/scripts/cleanWordTranslations.ts --restore`.
  await fs.writeFile(
    BACKUP_PATH,
    JSON.stringify(plan.map((p) => ({ id: p.id, text: p.text, translations: p.before })), null, 2),
    "utf8"
  );
  console.log(`\nbackup written: ${BACKUP_PATH}`);

  try {
    await c.query("BEGIN");
    for (const p of plan) {
      await c.query(`UPDATE words SET translations = $2, updated_at = $3 WHERE id = $1`, [p.id, p.after, now]);
    }
    await c.query("COMMIT");
    console.log("committed");
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  }
  await c.end();
}

main().catch((error) => { console.error(error); process.exit(1); });
