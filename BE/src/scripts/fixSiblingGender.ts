/**
 * Two related content fixes.
 *
 * 1. `àbúrò` / `ẹ̀gbọ́n` are gender-neutral -- younger sibling / older sibling. Yoruba marks
 *    gender with a separate word (`ọkùnrin` male, `obìnrin` female), so "younger brother" is
 *    only ever a translation of `àbúrò ọkùnrin`, never of `àbúrò` alone. The word rows and a
 *    handful of sentences carried gendered wordings as alternates anyway, which surface to the
 *    learner in the meanings panel and teach the wrong thing about how the language works.
 *    `translations[0]` was already correct everywhere; only the tail is trimmed.
 *
 * 2. Some multiple-choice distractors are defensible translations of their own sentence, so a
 *    learner who understood it perfectly can still be marked wrong. `Àbúrò ọkùnrin ni.` has no
 *    subject word -- it is "younger-sibling male it-is" -- so "He is...", "This is...", and
 *    "It is..." are all fair English, and picking between them tests nothing. Those are
 *    replaced with options ruled out by the Yoruba vocabulary itself (`àbúrò` is not `ẹ̀gbọ́n`,
 *    `obìnrin` is not `ọ̀rẹ́`), so the question tests the word being taught.
 *
 * Trimming translations is safe because every question in the database stores
 * `translation_index = 0` -- verified, 1709/1709 -- so nothing addresses the entries removed.
 * The script re-checks that invariant and refuses to run if it ever stops holding.
 *
 *   npx tsx src/scripts/fixSiblingGender.ts           # dry run
 *   npx tsx src/scripts/fixSiblingGender.ts --apply
 */
import "dotenv/config";
import { Client } from "pg";

const APPLY = process.argv.includes("--apply");

/** Gendered wordings to drop from a gender-neutral word's meaning list. */
const WORD_TRIMS: { word: string; drop: string[] }[] = [
  { word: "àbúrò", drop: ["younger brother", "younger sister", "Younger brother", "Younger sister"] },
  // A second row for the same word under a different spelling -- `abúrò` without the grave on
  // the first vowel -- backing 13 sentences. Which spelling is correct is a tone-mark question
  // and is deliberately left alone here; both rows just need the same meanings.
  { word: "abúrò", drop: ["younger brother", "younger sister", "Younger brother", "Younger sister"] },
  { word: "ẹ̀gbọ́n", drop: ["older brother", "older sister"] }
];

/** Sentences with no gender word that nonetheless offered a gendered reading. */
const SENTENCE_TRIMS: { sentence: string; drop: string[]; why: string }[] = [
  { sentence: "Àbúrò jẹ oúnjẹ.", why: "no gender word",
    drop: ["The younger brother ate food.", "The younger sister ate food."] },
  { sentence: "Àbúrò ń jẹ oúnjẹ.", why: "no gender word",
    drop: ["The younger brother is eating food."] },
  { sentence: "Ẹ̀gbọ́n mu omi.", why: "no gender word",
    drop: ["The older brother drank water.", "The older sister drank water."] },
  { sentence: "Èmi ni ẹ̀gbọ́n rẹ.", why: "no gender word",
    drop: ["I am your older brother.", "I am your older sister."] },
  { sentence: "Àbúrò mi ni.", why: "no gender word; also carries an unrelated sentence's translation",
    drop: ["He is my younger brother.", "She is my younger sister.", "Give me one water."] },
  // Same word, spelled without the grave, so a search on `àbúrò` alone does not reach these.
  { sentence: "Abúrò mi nìyẹn.", why: "no gender word",
    drop: ["That is my younger brother.", "That is my younger sister."] },
  { sentence: "Abúrò mi wà dáadáa.", why: "no gender word",
    drop: ["My younger brother is well.", "My younger sister is well."] }
];

/** Option substitutions, keyed by the sentence the question hangs off. */
const OPTION_SWAPS: { sentence: string; from: string; to: string; why: string }[] = [
  { sentence: "Àbúrò ọkùnrin ni.", from: "This is a younger brother.", to: "He is an older brother.",
    why: "the sentence states no subject, so 'This is' is as defensible as 'He is'; 'older' is ruled out by àbúrò" },
  { sentence: "Obìnrin ni.", from: "That is a woman.", to: "She is a friend.",
    why: "same -- 'That is' is defensible; 'friend' is ruled out by obìnrin (that would be ọ̀rẹ́)" },
  // Left over from an earlier fix: this was one sentence's primary translation, was replaced
  // there for being broken English, but survived in the shared distractor pool.
  { sentence: "Àbúrò obìnrin ni?", from: "A younger brother it is.", to: "He is an older brother.",
    why: "broken English shown as an option" },
  { sentence: "Àbúrò obìnrin nìyẹn.", from: "A younger brother it is.", to: "He is an older brother.",
    why: "broken English shown as an option" }
];

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  console.log(APPLY ? "=== APPLYING ===\n" : "=== DRY RUN (pass --apply to write) ===\n");

  const nonZero = (await c.query(
    `SELECT count(*)::int AS n FROM exercise_questions
     WHERE is_deleted = false AND translation_index <> 0`)).rows[0].n;
  if (nonZero > 0) {
    throw new Error(
      `${nonZero} questions use translation_index <> 0. Trimming a translations array would ` +
      `repoint them at a different sentence. Resolve those before running this.`);
  }
  console.log("checked: every live question uses translation_index = 0\n");

  if (APPLY) await c.query("BEGIN");

  console.log("--- word meaning lists ---");
  for (const { word, drop } of WORD_TRIMS) {
    const rows = (await c.query(
      `SELECT id, text, translations FROM words WHERE text = $1 AND is_deleted = false`,
      [word])).rows as any[];
    if (rows.length !== 1) throw new Error(`expected 1 word row for "${word}", found ${rows.length}`);
    const { id, translations } = rows[0];
    const kept = translations.filter((t: string) => !drop.includes(t));
    const removed = translations.filter((t: string) => drop.includes(t));
    if (!kept.length) throw new Error(`"${word}": trim would empty the meaning list`);
    console.log(`${word}: removed ${JSON.stringify(removed)}`);
    console.log(`   remaining ${JSON.stringify(kept)}\n`);
    if (APPLY && removed.length) {
      await c.query(`UPDATE words SET translations = $1, updated_at = now() WHERE id = $2`, [kept, id]);
    }
  }

  console.log("--- sentence translations ---");
  for (const { sentence, drop, why } of SENTENCE_TRIMS) {
    const rows = (await c.query(
      `SELECT id, translations FROM sentences WHERE text = $1 AND is_deleted = false`,
      [sentence])).rows as any[];
    if (rows.length !== 1) throw new Error(`expected 1 sentence "${sentence}", found ${rows.length}`);
    const { id, translations } = rows[0];
    const kept = translations.filter((t: string) => !drop.includes(t));
    // translations[0] is what the learner is shown and what every question is pinned to.
    if (!kept.length || kept[0] !== translations[0]) {
      throw new Error(`"${sentence}": trim would move or remove the primary translation`);
    }
    console.log(`"${sentence}"  -- ${why}`);
    console.log(`   ${JSON.stringify(translations)}`);
    console.log(`-> ${JSON.stringify(kept)}\n`);
    if (APPLY && kept.length !== translations.length) {
      await c.query(`UPDATE sentences SET translations = $1, updated_at = now() WHERE id = $2`, [kept, id]);
    }
  }

  console.log("--- multiple-choice options ---");
  for (const { sentence, from, to, why } of OPTION_SWAPS) {
    const s = (await c.query(
      `SELECT id FROM sentences WHERE text = $1 AND is_deleted = false`, [sentence])).rows as any[];
    if (s.length !== 1) throw new Error(`expected 1 sentence "${sentence}", found ${s.length}`);
    const questions = (await c.query(
      `SELECT id, subtype, options, correct_index FROM exercise_questions
       WHERE source_id = $1 AND is_deleted = false AND $2 = ANY(options)`, [s[0].id, from])).rows as any[];
    if (!questions.length) { console.log(`"${sentence}": no option "${from}" -- already done?\n`); continue; }

    console.log(`"${sentence}"  -- ${why}`);
    for (const q of questions) {
      const options = q.options.map((o: string) => (o === from ? to : o));
      // A duplicated option makes two answers identical, one of which is marked wrong.
      if (new Set(options).size !== options.length) {
        throw new Error(`${q.subtype}: "${to}" already present, would duplicate`);
      }
      // The replaced option must never be the answer.
      if (q.options[q.correct_index] === from) {
        throw new Error(`${q.subtype}: "${from}" is the correct answer, not a distractor`);
      }
      console.log(`   ${q.subtype}`);
      console.log(`      "${from}" -> "${to}"   (answer stays "${options[q.correct_index]}")`);
      if (APPLY) {
        await c.query(`UPDATE exercise_questions SET options = $1, updated_at = now() WHERE id = $2`,
          [options, q.id]);
      }
    }
    console.log();
  }

  if (APPLY) { await c.query("COMMIT"); console.log("committed"); }
  else console.log("(nothing written)");
  await c.end();
}

main().catch((error) => { console.error(error?.message ?? error); process.exit(1); });
