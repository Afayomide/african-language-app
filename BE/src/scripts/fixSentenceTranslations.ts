/**
 * Repoint two sentences at a natural-English primary translation.
 *
 * `translations[0]` is what the learner is shown, and both of these led with a phrasing that
 * no English speaker would produce -- "A younger brother it is." -- or with an "It is" that
 * hid the gender the lesson exists to teach ("Obìnrin ni." in a gender unit).
 *
 * Reordering the array is NOT enough, and is in fact the trap: questions store
 * `translation_index` (0 for all of these) AND a baked copy of the English -- as multiple-choice
 * options, as word-order tiles, and inside `review_data`. Move the array without moving the
 * copies and the word-order tiles stop spelling their own answer. So each string is rewritten
 * in place and every copy of it is rewritten in the same transaction.
 *
 *   npx tsx src/scripts/fixSentenceTranslations.ts           # dry run
 *   npx tsx src/scripts/fixSentenceTranslations.ts --apply
 */
import "dotenv/config";
import { Client } from "pg";

const APPLY = process.argv.includes("--apply");

type Fix = {
  sentence: string;
  translations: string[];   // replaces the whole array; [0] is what the learner sees
  why: string;
};

const FIXES: Fix[] = [
  {
    sentence: "Àbúrò ọkùnrin ni.",
    // "A younger brother it is." dropped rather than demoted: it is not an alternative
    // phrasing, it is broken English, and anything left in the array can surface to a learner.
    translations: ["He is a younger brother.", "It is a younger brother."],
    why: "unnatural word order in the primary translation"
  },
  {
    sentence: "Obìnrin ni.",
    // Both are fine English; the gendered one leads because the unit teaches gender marking.
    // Its fg-word-order meaningSegments already read "She is" + "a woman".
    translations: ["She is a woman.", "It is a woman."],
    why: "primary translation hid the gender the lesson teaches"
  }
];

/** Split English into word-order tiles the way the exercises already do: trailing punctuation
 *  stays glued to its word, which is why the old tiles ended in "is." rather than "is" + ".". */
const tiles = (text: string) => text.split(/\s+/).filter(Boolean);

function replaceIn(value: unknown, from: string, to: string): unknown {
  if (typeof value === "string") return value === from ? to : value;
  if (Array.isArray(value)) return value.map((v) => replaceIn(v, from, to));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, replaceIn(v, from, to)])
    );
  }
  return value;
}

let client: Client | null = null;

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  client = c;
  await c.connect();
  console.log(APPLY ? "=== APPLYING ===\n" : "=== DRY RUN (pass --apply to write) ===\n");

  if (APPLY) await c.query("BEGIN");

  for (const fix of FIXES) {
    const found = (await c.query(
      `SELECT id, translations FROM sentences WHERE text = $1 AND is_deleted = false`,
      [fix.sentence]
    )).rows as any[];
    if (found.length !== 1) {
      throw new Error(`expected exactly 1 "${fix.sentence}", found ${found.length}`);
    }
    const { id, translations: before } = found[0];
    const oldPrimary = before[0];
    const newPrimary = fix.translations[0];

    console.log(`"${fix.sentence}"   -- ${fix.why}`);
    console.log(`   ${JSON.stringify(before)}`);
    console.log(`-> ${JSON.stringify(fix.translations)}\n`);

    if (APPLY) {
      await c.query(`UPDATE sentences SET translations = $1, updated_at = now() WHERE id = $2`,
        [fix.translations, id]);
    }

    const questions = (await c.query(
      `SELECT id, type, subtype, translation_index, options, correct_index, review_data
       FROM exercise_questions WHERE source_id = $1 AND is_deleted = false`,
      [id]
    )).rows as any[];

    for (const q of questions) {
      // Every one of these stores translation_index 0. If that ever stops being true the baked
      // copy belongs to a different translation and blind substitution would corrupt it.
      if (q.translation_index !== 0) {
        console.log(`   SKIP ${q.type}/${q.subtype}: translation_index=${q.translation_index}, not 0`);
        continue;
      }

      let options = replaceIn(q.options, oldPrimary, newPrimary) as string[];
      let review = replaceIn(q.review_data, oldPrimary, newPrimary) as any;

      // An English word-order exercise spells out the translation as tiles, so the tiles have
      // to be rebuilt from the new wording rather than string-replaced.
      const isEnglishWordOrder =
        q.subtype === "fg-word-order" && review?.meaning && review?.words?.join(" ") === oldPrimary;
      if (isEnglishWordOrder) {
        const rebuilt = tiles(newPrimary);
        options = rebuilt;
        review = { ...review, words: rebuilt, correctOrder: rebuilt.map((_, i) => i) };
      }

      const optionsChanged = JSON.stringify(options) !== JSON.stringify(q.options);
      const reviewChanged = JSON.stringify(review) !== JSON.stringify(q.review_data);
      if (!optionsChanged && !reviewChanged) {
        console.log(`   ok   ${q.type}/${q.subtype}: no copy of the old string`);
        continue;
      }

      console.log(`   fix  ${q.type}/${q.subtype}`);
      if (optionsChanged) console.log(`        options ${JSON.stringify(q.options)} -> ${JSON.stringify(options)}`);
      if (reviewChanged) {
        if (review.meaning !== q.review_data.meaning)
          console.log(`        meaning "${q.review_data.meaning}" -> "${review.meaning}"`);
        if (JSON.stringify(review.words) !== JSON.stringify(q.review_data.words))
          console.log(`        words   ${JSON.stringify(q.review_data.words)} -> ${JSON.stringify(review.words)}`);
      }
      // correct_index still addresses the same slot: options were substituted in place, and a
      // rebuilt tile list is answered in order, which is the 0 it already held.
      if (q.correct_index !== null && q.correct_index >= options.length && options.length) {
        throw new Error(`${q.subtype}: correct_index ${q.correct_index} outside ${options.length} options`);
      }

      if (APPLY) {
        await c.query(
          `UPDATE exercise_questions SET options = $1, review_data = $2, updated_at = now() WHERE id = $3`,
          // `options` is text[], `review_data` is jsonb -- the driver maps a JS array onto the
          // former directly, and only the latter wants a JSON string.
          [options, JSON.stringify(review), q.id]);
      }
    }
    console.log();
  }

  if (APPLY) await c.query("COMMIT");
  else console.log("(nothing written)");
  await c.end();
}

main().catch(async (error) => {
  console.error(error);
  // A sentence and its questions have to move together, so a half-applied fix is worse than
  // none: the word-order tiles would no longer spell the meaning stored beside them.
  if (APPLY && client) await client.query("ROLLBACK").catch(() => {});
  process.exit(1);
});
