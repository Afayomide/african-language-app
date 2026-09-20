/**
 * Relink sentences whose words spell an expression the course teaches.
 *
 * `Ẹ káàárọ̀, Màmá.` was stored as the words `Ẹ` + `káàárọ̀` + `Màmá`, so a learner tapping
 * `Káàárọ̀` inside the RESPECTFUL greeting was shown the casual word's entry, and the
 * expression the lesson had just introduced went unreinforced. Same for `Níbo ni`, `Ta ni`
 * and every other taught expression a sentence happened to spell out.
 *
 * The matching rules live in sentenceExpressionLinking.ts, with tests. This script applies
 * them to stored sentences: the words become the expression component, their own meanings are
 * kept as its part glosses, and every position that addresses components -- the sentence's
 * meaning map and the copy some exercise questions hold -- is remapped.
 *
 *   npx tsx src/scripts/relinkSentenceExpressions.ts                        # dry run, all
 *   npx tsx src/scripts/relinkSentenceExpressions.ts --expression "Ẹ káàárọ̀"
 *   npx tsx src/scripts/relinkSentenceExpressions.ts --apply
 *
 * Previous values are saved to scratch/ before anything is written.
 */
import "dotenv/config";
import { Client } from "pg";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { genObjectId } from "../infrastructure/db/drizzle/ids.js";
import {
  applyExpressionMerges,
  planExpressionMerges,
  remapIndex,
  type LinkableComponent
} from "../application/services/sentenceExpressionLinking.js";

const APPLY = process.argv.includes("--apply");
const LANGUAGE = (() => {
  const at = process.argv.indexOf("--language");
  return at < 0 ? "yoruba" : String(process.argv[at + 1] || "yoruba");
})();
const ONLY_EXPRESSION = (() => {
  const at = process.argv.indexOf("--expression");
  return at < 0 ? "" : String(process.argv[at + 1] || "").trim();
})();

/** Same normalisation the generation path uses to match content text: trim, lowercase, keep marks. */
const normalize = (value: string) => String(value || "").normalize("NFC").trim().toLocaleLowerCase("yo");

type Segment = { text: string; sourceComponentIndexes?: number[]; [key: string]: unknown };

function remapSegments(segments: unknown, plans: Parameters<typeof remapIndex>[1]): Segment[] | null {
  if (!Array.isArray(segments)) return null;
  return segments.map((segment: Segment) => ({
    ...segment,
    sourceComponentIndexes: Array.isArray(segment.sourceComponentIndexes)
      ? [...new Set(segment.sourceComponentIndexes.map((index) => remapIndex(index, plans)))]
      : segment.sourceComponentIndexes
  }));
}

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  c.on("error", (err) => console.error(`database connection error: ${err.message}`));
  await c.connect();
  try {
    // Only expressions the course TEACHES. The inventory also holds compositional chunks that
    // were stored as expressions but never taught as units -- `Mo fẹ́` ("I want"), `mu omi`
    // ("drink water"), `ń lọ sí`. Merging into those would hide the very words a learner needs
    // to see, so a run of words only becomes an expression when a lesson introduces it.
    const expressions = (await c.query(
      `SELECT e.id, e.text FROM expressions e
       WHERE e.language = $1 AND e.is_deleted = false AND EXISTS (
         SELECT 1 FROM lesson_content_items lci JOIN lessons l ON l.id = lci.lesson_id AND l.is_deleted = false
         WHERE lci.content_id = e.id AND lci.content_type = 'expression' AND lci.role = 'introduce')`,
      [LANGUAGE]
    )).rows.filter((row) => row.text.trim().split(/\s+/).length > 1 && (!ONLY_EXPRESSION || row.text === ONLY_EXPRESSION));
    if (ONLY_EXPRESSION && expressions.length === 0) throw new Error(`no active expression "${ONLY_EXPRESSION}"`);
    const byText = new Map(expressions.map((row) => [normalize(row.text), { id: row.id, text: row.text }]));
    const findExpression = (text: string) => byText.get(text);

    const sentences = (await c.query(
      `SELECT s.id, s.text, s.meaning_segments FROM sentences s WHERE s.language = $1 AND s.is_deleted = false ORDER BY s.text`,
      [LANGUAGE]
    )).rows;
    const componentRows = (await c.query(
      `SELECT sc.* FROM sentence_components sc JOIN sentences s ON s.id = sc.sentence_id
       WHERE s.language = $1 AND s.is_deleted = false ORDER BY sc.sentence_id, sc.order_index`,
      [LANGUAGE]
    )).rows;
    const componentsBySentence = new Map<string, any[]>();
    for (const row of componentRows) {
      const list = componentsBySentence.get(row.sentence_id) ?? [];
      list.push(row);
      componentsBySentence.set(row.sentence_id, list);
    }

    const changes: Array<{ sentence: any; rows: any[]; merged: any[]; plans: any[] }> = [];
    const tally = new Map<string, number>();
    for (const sentence of sentences) {
      const rows = componentsBySentence.get(sentence.id) ?? [];
      if (rows.length === 0) continue;
      const linkable: LinkableComponent[] = rows.map((row) => ({
        type: row.type === "expression" ? "expression" : "word",
        text: row.text_snapshot,
        gloss: row.gloss ?? undefined
      }));
      const plans = planExpressionMerges(linkable, findExpression, normalize);
      if (plans.length === 0) continue;
      const merged = applyExpressionMerges(
        rows.map((row, index) => ({ ...linkable[index], row })) as any[],
        plans
      );
      changes.push({ sentence, rows, merged, plans });
      for (const plan of plans) tally.set(plan.expression.text, (tally.get(plan.expression.text) ?? 0) + 1);
    }

    for (const change of changes.slice(0, 15)) {
      const before = change.rows.map((row) => row.text_snapshot).join(" | ");
      const after = change.merged.map((item: any) => `${item.text}${item.type === "expression" ? " [expr]" : ""}`).join(" | ");
      console.log(`${change.sentence.text}\n   ${before}\n-> ${after}`);
    }
    if (changes.length > 15) console.log(`... and ${changes.length - 15} more sentences`);
    console.log(`\n${changes.length} sentences to relink:`);
    for (const [text, count] of [...tally].sort((a, b) => b[1] - a[1])) console.log(`  ${String(count).padStart(4)}  ${text}`);
    if (!APPLY) {
      console.log("dry run -- pass --apply to write");
      return;
    }

    const sentenceIds = changes.map((change) => change.sentence.id);
    const questions = (await c.query(
      `SELECT id, source_id, review_data FROM exercise_questions
       WHERE is_deleted = false AND source_id = ANY($1)
         AND jsonb_array_length(COALESCE(review_data->'meaningSegments', '[]'::jsonb)) > 0`,
      [sentenceIds]
    )).rows;

    mkdirSync("scratch", { recursive: true });
    const backup = path.resolve("scratch", `relink-expressions-backup-${Date.now()}.json`);
    writeFileSync(
      backup,
      JSON.stringify({ sentences: changes.map((c2) => ({ id: c2.sentence.id, text: c2.sentence.text, meaning_segments: c2.sentence.meaning_segments, components: c2.rows })), questions }, null, 2)
    );

    let written = 0;
    await c.query("BEGIN");
    try {
      for (const change of changes) {
        await c.query(`DELETE FROM sentence_components WHERE sentence_id = $1`, [change.sentence.id]);
        let orderIndex = 0;
        for (const item of change.merged as any[]) {
          const isMerged = item.type === "expression" && item.refId;
          await c.query(
            `INSERT INTO sentence_components (id, sentence_id, type, ref_id, order_index, text_snapshot, gloss, part_glosses)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              genObjectId(),
              change.sentence.id,
              item.type,
              isMerged ? item.refId : item.row.ref_id,
              orderIndex,
              isMerged ? item.text : item.row.text_snapshot,
              isMerged ? null : item.row.gloss,
              isMerged ? (item.partGlosses.length ? item.partGlosses : null) : item.row.part_glosses
            ]
          );
          orderIndex += 1;
        }
        const segments = remapSegments(change.sentence.meaning_segments, change.plans);
        if (segments) {
          await c.query(`UPDATE sentences SET meaning_segments = $1::jsonb, updated_at = now() WHERE id = $2`, [
            JSON.stringify(segments),
            change.sentence.id
          ]);
        }
        written += 1;
      }
      for (const question of questions) {
        const change = changes.find((item) => item.sentence.id === question.source_id);
        if (!change) continue;
        const segments = remapSegments(question.review_data.meaningSegments, change.plans);
        if (!segments) continue;
        await c.query(`UPDATE exercise_questions SET review_data = $1::jsonb, updated_at = now() WHERE id = $2`, [
          JSON.stringify({ ...question.review_data, meaningSegments: segments }),
          question.id
        ]);
      }
      await c.query("COMMIT");
    } catch (err) {
      await c.query("ROLLBACK");
      throw err;
    }
    console.log(`${written} sentences relinked, ${questions.length} question copies remapped; previous values saved to ${backup}`);
  } finally {
    await c.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
