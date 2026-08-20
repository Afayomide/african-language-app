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
    word: "àbúrò",
    explanation:
      "Means 'younger sibling' and does not carry gender on its own. Yoruba adds gender with a " +
      "separate word placed after the noun: 'àbúrò ọkùnrin' is a younger brother, 'àbúrò " +
      "obìnrin' a younger sister. Its counterpart is 'ẹ̀gbọ́n', an older sibling.",
    examples: ["Àbúrò mi ń bọ̀.", "Àbúrò ọkùnrin ni."]
  },
  {
    word: "a",
    explanation:
      "First-person plural subject pronoun, 'we'. Like other Yoruba subject pronouns it sits " +
      "directly before the verb rather than after it.",
    examples: ["A ń lọ ilé.", "Níbo ni a ń lọ?"]
  },
  {
    word: "bọ̀",
    explanation:
      "A verb meaning to come, or to be on the way back. It usually follows the marker 'ń', " +
      "which is what makes it 'is coming' rather than a bare 'come'.",
    examples: ["Mo ń bọ̀.", "Ta ni ń bọ̀?"]
  },
  {
    word: "jẹ",
    explanation:
      "A verb meaning to eat. It takes the thing eaten as its object, and can also stand on " +
      "its own when what is being eaten is already understood.",
    examples: ["Bàbá jẹ oúnjẹ.", "Àbúrò ń jẹ."]
  },
  {
    word: "kan",
    explanation:
      "Means 'one'. It follows the noun it counts instead of coming before it, so 'omi kan' is " +
      "'one water'. It often does the work of English 'a' when singling out one item.",
    examples: ["Mo fẹ́ omi kan.", "Ọkùnrin kan ń bọ̀."]
  },
  {
    word: "níbí",
    explanation:
      "Means 'here', or 'at this place'. It marks where something is or where it happens.",
    examples: ["Obìnrin wà níbí."]
  },
  {
    word: "ọkùnrin",
    explanation:
      "Means 'man' or 'male'. Placed after another noun it marks that noun as male, so 'àbúrò " +
      "ọkùnrin' is a younger brother. Its counterpart is 'obìnrin' (female).",
    examples: ["Ọkùnrin fẹ́ owó.", "Àbúrò ọkùnrin ni."]
  },
  {
    word: "oúnjẹ",
    explanation:
      "The general word for food or a meal. It appears as the object of verbs such as 'jẹ' " +
      "(eat) and 'rà' (buy).",
    examples: ["Mo fẹ́ oúnjẹ.", "Bàbá jẹ oúnjẹ."]
  },
  {
    word: "rà",
    explanation:
      "A verb meaning to buy. Its low tone is the only thing separating it from 'ra' (to rub " +
      "or spread), so the mark is not optional here -- it is what picks out the word.",
    examples: ["O fẹ́ rà omi.", "Kí ni o ń rà?"]
  },
  {
    word: "wà",
    explanation:
      "A verb of being: it says that someone or something is present, is in a place, or is in " +
      "a given state. It covers both where a person is and how they are doing.",
    examples: ["Mo wà ní ilé.", "Ẹ wà dáadáa?"]
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
