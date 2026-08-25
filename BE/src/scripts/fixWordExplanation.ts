/**
 * Replace a word's explanation and examples where the stored ones belong to a different word.
 *
 * A batch of entries was seeded with market/pricing content regardless of the word it landed
 * on: `àbúrò` (younger sibling) carried "Refers to the cost or price of an item." with the
 * example `Ìràn àbúrò wá?` glossed "How much is this water?" -- three words none of which means
 * price, and a translation with no relation to the Yoruba. This is teaching copy shown to
 * learners, so a wrong one is worse than none.
 *
 * Examples are NOT written by hand. Each is named by its sentence text and pulled live from the
 * corpus with its own stored translation, so the example can only ever be a sentence the app
 * already teaches, and it cannot drift from that sentence's translation later.
 *
 *   npx tsx src/scripts/fixWordExplanation.ts           # dry run
 *   npx tsx src/scripts/fixWordExplanation.ts --apply
 */
import "dotenv/config";
import { Client } from "pg";

const APPLY = process.argv.includes("--apply");

type Fix = {
  word: string;
  explanation: string;
  /** Sentences to quote as examples, by exact text. Translations are read from the corpus. */
  examples: string[];
};

const FIXES: Fix[] = [
  {
    word: "Èmi",
    explanation:
      "Means 'I', but it is the emphatic form, not the everyday one. Yoruba has two sets of " +
      "subject pronouns: the plain 'Mo' simply says who is acting, while 'Èmi' puts the weight " +
      "on the person -- closer to 'I am the one who'. It is also the form that goes before 'ni' " +
      "when identifying yourself, where 'Mo' cannot be used.",
    examples: ["Èmi ni ẹ̀gbọ́n.", "Èmi ń lọ."]
  }
];

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  console.log(APPLY ? "=== APPLYING ===\n" : "=== DRY RUN (pass --apply to write) ===\n");
  if (APPLY) await c.query("BEGIN");

  for (const fix of FIXES) {
    const rows = (await c.query(
      `SELECT id, text, explanation, examples FROM words WHERE text = $1 AND is_deleted = false`,
      [fix.word])).rows as any[];
    if (rows.length !== 1) throw new Error(`expected 1 live row for "${fix.word}", found ${rows.length}`);
    const row = rows[0];

    const examples: { original: string; translation: string }[] = [];
    for (const text of fix.examples) {
      const s = (await c.query(
        `SELECT text, translations FROM sentences WHERE text = $1 AND is_deleted = false`,
        [text])).rows as any[];
      if (s.length !== 1) throw new Error(`example "${text}": found ${s.length} live sentences`);
      if (!s[0].translations?.length) throw new Error(`example "${text}": no translation stored`);
      // translations[0] is the wording the learner is taught for that sentence.
      examples.push({ original: s[0].text, translation: s[0].translations[0] });
    }

    console.log(`${row.text}`);
    console.log(`   explanation was: ${JSON.stringify(row.explanation)}`);
    console.log(`   explanation now: ${JSON.stringify(fix.explanation)}`);
    console.log(`   examples was   : ${JSON.stringify(row.examples)}`);
    console.log(`   examples now   : ${JSON.stringify(examples)}\n`);

    if (APPLY) {
      await c.query(
        `UPDATE words SET explanation = $1, examples = $2, updated_at = now() WHERE id = $3`,
        [fix.explanation, JSON.stringify(examples), row.id]);
    }
  }

  if (APPLY) { await c.query("COMMIT"); console.log("committed"); }
  else console.log("(nothing written)");
  await c.end();
}

main().catch((error) => { console.error(error?.message ?? error); process.exit(1); });
