/**
 * The word row for Yoruba `ni` taught it as "am".
 *
 * Its translation list had grown to 56 entries -- every per-sentence gloss a generator ever
 * produced was merged into it -- and led with "am". Translation index 0 is what the word card
 * shows when `ni` is introduced and what every word exercise uses, so learners were taught
 * ni = "am" in the lesson that introduces it, in 7 "choose the translation" questions, and in
 * 32 matching-exercise pairs. The list also carried unrelated junk ("the", "one", "when", "ní").
 *
 * The list becomes a short one that leads with "is", with an explanation of its jobs.
 * Exercises that stored the old first meaning as text are rewritten to "is":
 *   - the correct option of translation questions, plus their "The correct meaning is am."
 *   - every matching pair for `ni`, in any matching exercise
 * A distractor of "that is" is replaced, because it would sit too close to the right answer.
 *
 *   npx tsx src/scripts/fixNiWordEntry.ts           # dry run
 *   npx tsx src/scripts/fixNiWordEntry.ts --apply
 *
 * Previous values are saved to scratch/ before anything is written.
 */
import "dotenv/config";
import { Client } from "pg";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

const APPLY = process.argv.includes("--apply");

const OLD = "am";
const NEW = "is";
const NEW_TRANSLATIONS = ["is", "it is", "are", "am", "(focus marker)", "(object marker)"];
const NEW_EXPLANATION =
  "Links words, like 'is': Omi ni = It is water. After a question word it marks the question: " +
  "Níbo ni…? = Where is…? After fún it marks what is given: Fún mi ni omi = Give me water.";
// Distractors too close to "is", replaced per question with a word from the same lesson topic.
const DISTRACTOR_REPLACEMENTS: Record<string, { from: string; to: string }> = {
  "6a037430b78f8088643ce735": { from: "that is", to: "small" }, // Possession & Quality
  "6a08a80475996236c5fd5cad": { from: "that is", to: "market" } // The Conversational Affirmative
};

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  c.on("error", (err) => console.error(`database connection error: ${err.message}`));
  await c.connect();
  try {
    const words = (await c.query(
      `SELECT id, translations, explanation FROM words WHERE language = 'yoruba' AND text_normalized = 'ni' AND is_deleted = false`
    )).rows;
    if (words.length !== 1) throw new Error(`expected one active "ni" word, found ${words.length}`);
    const word = words[0];
    if (word.translations[0] !== OLD) throw new Error(`first translation is "${word.translations[0]}", not "${OLD}" -- already fixed?`);

    const questions = (await c.query(
      `SELECT id, subtype, source_type, source_id, options, correct_index, interaction_data, explanation
       FROM exercise_questions
       WHERE is_deleted = false AND (
         (source_type = 'word' AND source_id = $1)
         OR interaction_data->'matchingPairs' @> $2::jsonb
       )`,
      [word.id, JSON.stringify([{ contentId: word.id }])]
    )).rows;

    const updates: Array<{ id: string; options: string[]; interaction_data: any; explanation: string }> = [];
    for (const q of questions) {
      const notes: string[] = [];
      let options: string[] = [...q.options];
      let explanation: string = q.explanation;
      let interaction = q.interaction_data;

      const isOwnTranslationQuestion = q.source_id === word.id && /select-translation/.test(q.subtype);
      if (isOwnTranslationQuestion && options[q.correct_index] === OLD) {
        options[q.correct_index] = NEW;
        notes.push(`answer "${OLD}" -> "${NEW}"`);
        const swap = DISTRACTOR_REPLACEMENTS[q.id];
        if (swap && options.includes(swap.from)) {
          options = options.map((o) => (o === swap.from ? swap.to : o));
          notes.push(`distractor "${swap.from}" -> "${swap.to}"`);
        }
        const close = options.filter((o, i) => i !== q.correct_index && /\b(is|are|am)\b/i.test(o) && o.split(" ").length <= 2);
        if (close.length) notes.push(`WARNING close distractor left: ${close.join(", ")}`);
        if (explanation === `The correct meaning is ${OLD}.`) {
          explanation = `The correct meaning is ${NEW}.`;
          notes.push("explanation");
        }
      }

      const pairs = interaction?.matchingPairs;
      if (Array.isArray(pairs) && pairs.some((p: any) => p?.contentId === word.id && p?.translation === OLD)) {
        const clash = pairs.find((p: any) => p?.contentId !== word.id && String(p?.translation || "").toLowerCase() === NEW);
        if (clash) {
          notes.push(`SKIP pairs: "${clash.contentText}" already means "${NEW}" here`);
        } else {
          interaction = {
            ...interaction,
            matchingPairs: pairs.map((p: any) => (p?.contentId === word.id && p?.translation === OLD ? { ...p, translation: NEW } : p))
          };
          notes.push(`pair ni = "${OLD}" -> "${NEW}"`);
        }
      }

      if (!notes.some((n) => !n.startsWith("SKIP") && !n.startsWith("WARNING"))) {
        if (notes.length) console.log(`QUESTION ${q.id} ${q.subtype}: ${notes.join("; ")}`);
        continue;
      }
      updates.push({ id: q.id, options, interaction_data: interaction, explanation });
      console.log(`QUESTION ${q.id} ${q.subtype}: ${notes.join("; ")}`);
    }

    console.log(`\nword ni: ${word.translations.length} translations starting ${JSON.stringify(word.translations.slice(0, 4))}`);
    console.log(`      -> ${JSON.stringify(NEW_TRANSLATIONS)}`);
    console.log(`explanation -> ${NEW_EXPLANATION}`);
    console.log(`${updates.length} of ${questions.length} questions to update`);
    if (!APPLY) { console.log("dry run -- pass --apply to write"); return; }

    mkdirSync("scratch", { recursive: true });
    const backup = path.resolve("scratch", `ni-word-backup-${Date.now()}.json`);
    writeFileSync(backup, JSON.stringify({ word, questions }, null, 2));

    await c.query("BEGIN");
    try {
      await c.query(`UPDATE words SET translations = $1, explanation = $2, updated_at = now() WHERE id = $3`, [
        NEW_TRANSLATIONS,
        NEW_EXPLANATION,
        word.id
      ]);
      for (const u of updates) {
        await c.query(
          `UPDATE exercise_questions SET options = $1, interaction_data = $2::jsonb, explanation = $3, updated_at = now() WHERE id = $4`,
          [u.options, JSON.stringify(u.interaction_data), u.explanation, u.id]
        );
      }
      await c.query("COMMIT");
    } catch (err) {
      await c.query("ROLLBACK");
      throw err;
    }
    console.log(`written; previous values saved to ${backup}`);
  } finally {
    await c.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
