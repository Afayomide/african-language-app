/**
 * `Dáadáa ni` means "It is fine". Three sentences taught it as "I am fine" -- the reply a
 * learner gives to `Báwo ni?`, but "I am fine" is `Mo wà dáadáa`, which the course teaches
 * separately. The fourth said just "Fine,". The stored literal translations already read
 * "It is fine"; only the learner-facing English was wrong.
 *
 * The English was copied into every exercise built from these sentences -- answer options,
 * distractors in other sentences' questions, word tiles, review meanings, explanations -- so
 * all of those are rewritten too. Otherwise a question would still mark "I am fine" correct.
 *
 *   npx tsx src/scripts/fixDaadaaNiTranslations.ts           # dry run
 *   npx tsx src/scripts/fixDaadaaNiTranslations.ts --apply
 *
 * A sentence is only rewritten if its translations still hold the old English, so a hand edit
 * made since is left alone. Previous values are saved to scratch/ before anything is written.
 */
import "dotenv/config";
import { Client } from "pg";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

const APPLY = process.argv.includes("--apply");

type Fix = {
  sentenceId: string;
  text: string;
  oldTranslations: string[];
  english: string;
  /** Meaning-segment text for `Dáadáa ni`, old -> new. */
  chunk: [string, string];
};

const FIXES: Fix[] = [
  {
    sentenceId: "6a028dc0b8eddec374338e21",
    text: "Dáadáa ni, èmi ń jẹ oúnjẹ.",
    oldTranslations: ["I am fine, I am eating food."],
    english: "It is fine, I am eating food.",
    chunk: ["I am fine,", "It is fine,"]
  },
  {
    sentenceId: "6a0354d7b78f8088643ce31f",
    text: "Dáadáa ni. Mo ń bọ̀.",
    // "I am well. I am coming back." goes too: it is the same mistranslation.
    oldTranslations: ["I am fine. I am coming.", "I am well. I am coming back."],
    english: "It is fine. I am coming.",
    chunk: ["I am fine.", "It is fine."]
  },
  {
    sentenceId: "6a03545cb78f8088643ce28b",
    text: "Dáadáa ni. Mo ń lọ sí ilé.",
    oldTranslations: ["I am fine. I am going home."],
    english: "It is fine. I am going home.",
    chunk: ["I am fine.", "It is fine."]
  },
  {
    sentenceId: "6a08a89d75996236c5fd5d35",
    text: "Dáadáa ni, mo ń lọ sí ilé.",
    oldTranslations: ["Fine, I am going home."],
    english: "It is fine, I am going home.",
    chunk: ["Fine,", "It is fine,"]
  }
];

type Segment = { text: string; [key: string]: unknown };

function fixSegments(segments: unknown, chunk: [string, string]): Segment[] | null {
  if (!Array.isArray(segments)) return null;
  let changed = false;
  const next = segments.map((s: Segment) => {
    if (s?.text === chunk[0]) {
      changed = true;
      return { ...s, text: chunk[1] };
    }
    return s;
  });
  return changed ? next : null;
}

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  c.on("error", (err) => console.error(`database connection error: ${err.message}`));
  await c.connect();

  const oldToNew = new Map<string, string>();
  for (const f of FIXES) for (const t of f.oldTranslations) oldToNew.set(t, f.english);
  const bySentence = new Map(FIXES.map((f) => [f.sentenceId, f]));

  try {
    const sentences = (await c.query(
      `SELECT id, text, translations, meaning_segments FROM sentences WHERE id = ANY($1) AND is_deleted = false`,
      [FIXES.map((f) => f.sentenceId)]
    )).rows;
    const questions = (await c.query(
      `SELECT id, source_id, options, review_data, explanation FROM exercise_questions
       WHERE is_deleted = false AND (
         source_id = ANY($1) OR options && $2::text[] OR review_data->>'meaning' = ANY($2)
       )`,
      [FIXES.map((f) => f.sentenceId), [...oldToNew.keys()]]
    )).rows;

    const sentenceUpdates: Array<{ id: string; translations: string[]; segments: Segment[] }> = [];
    for (const f of FIXES) {
      const row = sentences.find((s) => s.id === f.sentenceId);
      if (!row) { console.log(`MISSING  ${f.text}`); continue; }
      if (JSON.stringify(row.translations) !== JSON.stringify(f.oldTranslations)) {
        console.log(`SKIP     ${f.text} -- translations changed since the audit: ${JSON.stringify(row.translations)}`);
        continue;
      }
      const segments: Segment[] = fixSegments(row.meaning_segments, f.chunk) ?? row.meaning_segments;
      sentenceUpdates.push({ id: f.sentenceId, translations: [f.english], segments });
      console.log(`SENTENCE ${f.text}\n         ${JSON.stringify(row.translations)} -> ["${f.english}"]`);
      console.log(`         English line: ${row.meaning_segments.map((s: Segment) => s.text).join(" | ")}  ->  ${segments.map((s) => s.text).join(" | ")}`);
    }

    const questionUpdates: Array<{ id: string; options: string[]; review_data: any; explanation: string }> = [];
    for (const q of questions) {
      const review = { ...(q.review_data || {}) };
      let options: string[] = [...q.options];
      let explanation: string = q.explanation;
      const notes: string[] = [];

      const oldMeaning = review.meaning as string | undefined;
      const newMeaning = oldMeaning ? oldToNew.get(oldMeaning) : undefined;

      // "Build the English meaning" tiles: the options ARE the old English, one word per tile.
      const tilesAreEnglish =
        newMeaning && Array.isArray(review.words) && review.words.join(" ") === oldMeaning;
      if (tilesAreEnglish) {
        const tiles = newMeaning.split(" ");
        options = tiles;
        review.words = tiles;
        review.correctOrder = tiles.map((_, i) => i);
        notes.push(`tiles -> ${tiles.join(" / ")}`);
      } else {
        const replaced = options.map((o) => oldToNew.get(o) ?? o);
        if (replaced.some((o, i) => o !== options[i])) notes.push("option text");
        options = replaced;
      }
      if (newMeaning) { review.meaning = newMeaning; notes.push("review meaning"); }

      const fix = q.source_id ? bySentence.get(q.source_id) : undefined;
      if (fix) {
        const segs = fixSegments(review.meaningSegments, fix.chunk);
        if (segs) { review.meaningSegments = segs; notes.push("review segments"); }
      }
      for (const [from, to] of oldToNew) {
        if (explanation.includes(from)) { explanation = explanation.split(from).join(to); notes.push("explanation"); }
      }

      if (!notes.length) continue;
      questionUpdates.push({ id: q.id, options, review_data: review, explanation });
      console.log(`QUESTION ${q.id}: ${[...new Set(notes)].join(", ")}`);
    }

    console.log(`\n${sentenceUpdates.length} sentences, ${questionUpdates.length} questions to update`);
    if (!APPLY) { console.log("dry run -- pass --apply to write"); return; }

    mkdirSync("scratch", { recursive: true });
    const backup = path.resolve("scratch", `daadaa-ni-backup-${Date.now()}.json`);
    writeFileSync(backup, JSON.stringify({ sentences, questions }, null, 2));

    await c.query("BEGIN");
    try {
      for (const u of sentenceUpdates) {
        await c.query(
          `UPDATE sentences SET translations = $1, meaning_segments = $2::jsonb, updated_at = now() WHERE id = $3`,
          [u.translations, JSON.stringify(u.segments), u.id]
        );
      }
      for (const u of questionUpdates) {
        await c.query(
          `UPDATE exercise_questions SET options = $1, review_data = $2::jsonb, explanation = $3, updated_at = now() WHERE id = $4`,
          [u.options, JSON.stringify(u.review_data), u.explanation, u.id]
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
