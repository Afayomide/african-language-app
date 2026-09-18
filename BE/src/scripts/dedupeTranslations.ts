/**
 * Collapse meanings that are the same meaning written twice.
 *
 * `upsertWordFromSentenceComponent` unions every wording it has ever seen for a word into that
 * word's meaning list, so casing and articles pile up: `àbúrò` accumulated "younger sibling",
 * "Younger sibling", "The younger sibling" and "the younger sibling" as four separate entries.
 * The learner's panel lists them all, which reads as four meanings for one word.
 *
 * Two different rules, because the two tables mean different things:
 *
 *   words     -- case AND leading article are noise. A dictionary entry for a noun is the bare
 *                noun; "the younger sibling" is not a second sense of "younger sibling".
 *   sentences -- case only. "A friend ate food." and "The friend ate food." are BOTH honest
 *                translations of `Ọ̀rẹ́ jẹ oúnjẹ.`, because Yoruba does not mark definiteness
 *                and English forces a choice. Collapsing those would delete a real alternative.
 *
 * Parenthetical tags are part of the meaning, never stripped: "you (respectful)" and "you" are
 * different entries and stay that way.
 *
 * The first spelling of each group survives, in its original position, so `translations[0]` --
 * what the learner is shown and what every question is pinned to -- can never move.
 *
 *   npx tsx src/scripts/dedupeTranslations.ts           # dry run
 *   npx tsx src/scripts/dedupeTranslations.ts --apply
 */
import "dotenv/config";
import { Client } from "pg";

const APPLY = process.argv.includes("--apply");

const norm = (s: string) => s.normalize("NFC").trim().replace(/\s+/g, " ");

/** Word meanings: case and a leading article are noise. */
const wordKey = (s: string) =>
  norm(s).toLowerCase().replace(/^(?:the|a|an)\s+/, "").replace(/[.]+$/, "");

/** Sentence translations: case only -- an article carries meaning English cannot drop. */
const sentenceKey = (s: string) => norm(s).toLowerCase();

function dedupe(list: string[], key: (s: string) => string) {
  const seen = new Map<string, string>();
  for (const item of list) {
    const k = key(item);
    if (!seen.has(k)) seen.set(k, norm(item));
  }
  return [...seen.values()];
}

async function pass(
  c: Client,
  table: "words" | "sentences",
  key: (s: string) => string
) {
  const rows = (await c.query(
    `SELECT id, text, translations FROM ${table} WHERE is_deleted = false`)).rows as any[];

  let touched = 0;
  let collapsed = 0;
  const samples: string[] = [];

  for (const row of rows) {
    const before: string[] = row.translations ?? [];
    if (before.length < 2) continue;
    const after = dedupe(before, key);
    if (after.length === before.length && after.every((v, i) => v === before[i])) continue;

    // translations[0] is the shown meaning and every question pins to index 0.
    if (after[0] !== norm(before[0])) {
      throw new Error(`${table} ${row.id} "${row.text}": primary meaning would move`);
    }
    if (!after.length) throw new Error(`${table} ${row.id} "${row.text}": would empty the list`);

    touched++;
    collapsed += before.length - after.length;
    if (samples.length < 10) {
      samples.push(`  ${row.text}\n     ${JSON.stringify(before)}\n  -> ${JSON.stringify(after)}`);
    }
    if (APPLY) {
      await c.query(`UPDATE ${table} SET translations = $1, updated_at = now() WHERE id = $2`,
        [after, row.id]);
    }
  }

  console.log(`--- ${table} ---`);
  console.log(`   rows scanned          : ${rows.length}`);
  console.log(`   rows with duplicates  : ${touched}`);
  console.log(`   entries collapsed     : ${collapsed}`);
  if (samples.length) console.log(samples.join("\n"));
  console.log();
}

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  console.log(APPLY ? "=== APPLYING ===\n" : "=== DRY RUN (pass --apply to write) ===\n");
  if (APPLY) await c.query("BEGIN");
  await pass(c, "words", wordKey);
  await pass(c, "sentences", sentenceKey);
  if (APPLY) { await c.query("COMMIT"); console.log("committed"); }
  else console.log("(nothing written)");
  await c.end();
}

main().catch((error) => { console.error(error?.message ?? error); process.exit(1); });
