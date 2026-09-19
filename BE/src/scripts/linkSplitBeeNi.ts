/**
 * Store `Bẹ́ẹ̀ ni` ("yes") as the one expression it is, in every sentence.
 *
 * `Bẹ́ẹ̀ ni` is marked keep_whole: learners see it as one unit meaning "yes", never split into
 * "so" + "is". But 12 older sentences stored it as two separate word components (`Bẹ́ẹ̀`,
 * `ni`), so the player still split it there. This replaces each such pair with a single
 * expression component pointing at the `Bẹ́ẹ̀ ni` expression.
 *
 * Merging two components into one shifts the index of every later component, so the meaning
 * map (sentences.meaning_segments, and the copy some exercise questions keep in
 * review_data.meaningSegments) is remapped: indexes 0 and 1 become 0, and i > 1 becomes i - 1.
 * sourceWordIndexes count tokens of the text, which does not change, so they are left alone,
 * as are the questions' word tiles and correct orders.
 *
 * Every `Bẹ́ẹ̀ ni` expression component in a sentence -- the 12 new ones and the existing ones
 * -- also gets gloss "yes", so the tap panel leads with the meaning instead of the raw
 * translation list ("Yes, yes, right?, is it so?, ...").
 *
 *   npx tsx src/scripts/linkSplitBeeNi.ts           # dry run
 *   npx tsx src/scripts/linkSplitBeeNi.ts --apply
 *
 * Previous values are saved to scratch/ before anything is written.
 */
import "dotenv/config";
import { Client } from "pg";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { genObjectId } from "../infrastructure/db/drizzle/ids.js";

const APPLY = process.argv.includes("--apply");
const GLOSS = "yes";

type Segment = { text: string; sourceComponentIndexes?: number[]; [key: string]: unknown };

/** Component index after merging components 0 and 1 of the pair starting at `at`. */
function remapIndex(index: number, at: number): number {
  return index <= at ? index : index - 1;
}

function remapSegments(segments: unknown, at: number): Segment[] | null {
  if (!Array.isArray(segments)) return null;
  return segments.map((s: Segment) => ({
    ...s,
    sourceComponentIndexes: Array.isArray(s.sourceComponentIndexes)
      ? [...new Set(s.sourceComponentIndexes.map((i) => remapIndex(i, at)))]
      : s.sourceComponentIndexes
  }));
}

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  c.on("error", (err) => console.error(`database connection error: ${err.message}`));
  await c.connect();
  try {
    const expr = await c.query(
      `SELECT id, text, keep_whole FROM expressions WHERE language = 'yoruba' AND is_deleted = false AND text = 'Bẹ́ẹ̀ ni'`
    );
    if (expr.rowCount !== 1) throw new Error(`expected one active "Bẹ́ẹ̀ ni" expression, found ${expr.rowCount}`);
    const exprId: string = expr.rows[0].id;
    if (!expr.rows[0].keep_whole) console.log("note: Bẹ́ẹ̀ ni is not marked keep_whole");

    // Adjacent word components Bẹ́ẹ̀ + ni.
    const pairs = (await c.query(
      `SELECT a.sentence_id, a.id AS bee_id, b.id AS ni_id, a.order_index AS at, s.text, s.meaning_segments
       FROM sentence_components a
       JOIN sentence_components b ON b.sentence_id = a.sentence_id AND b.order_index = a.order_index + 1
       JOIN sentences s ON s.id = a.sentence_id AND s.is_deleted = false
       WHERE a.type = 'word' AND lower(a.text_snapshot) = 'bẹ́ẹ̀' AND b.type = 'word' AND b.text_snapshot = 'ni'
       ORDER BY s.text`
    )).rows;
    const sentenceIds = pairs.map((p) => p.sentence_id);
    const questions = (await c.query(
      `SELECT id, source_id, review_data FROM exercise_questions
       WHERE is_deleted = false AND source_id = ANY($1) AND jsonb_array_length(COALESCE(review_data->'meaningSegments', '[]'::jsonb)) > 0`,
      [sentenceIds]
    )).rows;
    const components = (await c.query(
      `SELECT * FROM sentence_components WHERE sentence_id = ANY($1) ORDER BY sentence_id, order_index`,
      [sentenceIds]
    )).rows;
    const existingExprUses = (await c.query(
      `SELECT sc.id, sc.gloss, s.text FROM sentence_components sc JOIN sentences s ON s.id = sc.sentence_id AND s.is_deleted = false
       WHERE sc.type = 'expression' AND sc.ref_id = $1`,
      [exprId]
    )).rows;

    for (const p of pairs) {
      const before = (p.meaning_segments || []).map((s: Segment) => `${s.text}[${s.sourceComponentIndexes}]`).join(" ");
      const after = (remapSegments(p.meaning_segments, p.at) || []).map((s) => `${s.text}[${s.sourceComponentIndexes}]`).join(" ");
      console.log(`MERGE    ${p.text}\n         English line: ${before}\n                    -> ${after}`);
    }
    for (const q of questions) console.log(`QUESTION ${q.id}: remap copied meaning segments`);
    const toGloss = existingExprUses.filter((u) => u.gloss !== GLOSS);
    console.log(`\n${pairs.length} sentences to merge, ${questions.length} questions to remap, ` +
      `${toGloss.length + pairs.length} Bẹ́ẹ̀ ni components to gloss "${GLOSS}"`);
    if (!APPLY) { console.log("dry run -- pass --apply to write"); return; }

    mkdirSync("scratch", { recursive: true });
    const backup = path.resolve("scratch", `link-bee-ni-backup-${Date.now()}.json`);
    writeFileSync(backup, JSON.stringify({ pairs, components, questions, existingExprUses }, null, 2));

    await c.query("BEGIN");
    try {
      for (const p of pairs) {
        await c.query(`DELETE FROM sentence_components WHERE id = ANY($1)`, [[p.bee_id, p.ni_id]]);
        // Close the gap left by the removed pair's second row before inserting at `at`.
        await c.query(
          `UPDATE sentence_components SET order_index = order_index - 1 WHERE sentence_id = $1 AND order_index > $2`,
          [p.sentence_id, p.at + 1]
        );
        await c.query(
          `INSERT INTO sentence_components (id, sentence_id, type, ref_id, order_index, text_snapshot, gloss)
           VALUES ($1, $2, 'expression', $3, $4, 'Bẹ́ẹ̀ ni', $5)`,
          [genObjectId(), p.sentence_id, exprId, p.at, GLOSS]
        );
        await c.query(`UPDATE sentences SET meaning_segments = $1::jsonb, updated_at = now() WHERE id = $2`, [
          JSON.stringify(remapSegments(p.meaning_segments, p.at) ?? p.meaning_segments),
          p.sentence_id
        ]);
      }
      for (const q of questions) {
        const at = pairs.find((p) => p.sentence_id === q.source_id)!.at;
        const review = { ...q.review_data, meaningSegments: remapSegments(q.review_data.meaningSegments, at) };
        await c.query(`UPDATE exercise_questions SET review_data = $1::jsonb, updated_at = now() WHERE id = $2`, [
          JSON.stringify(review),
          q.id
        ]);
      }
      await c.query(`UPDATE sentence_components SET gloss = $1 WHERE type = 'expression' AND ref_id = $2`, [GLOSS, exprId]);
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
