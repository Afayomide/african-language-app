/**
 * Repair questions whose reviewData.meaningSegments dropped trailing segments.
 *
 * The word-order card renders the target meaning from the QUESTION's own
 * reviewData.meaningSegments, not from the source sentence. Some questions stored only the
 * first segment, so the learner is shown "Good morning," and asked to arrange tiles that
 * spell "Ẹ káàárọ̀, bàbá." -- the "father." half of the meaning is simply missing from the
 * prompt, making the exercise unsolvable as displayed.
 *
 * The source sentence holds the complete, correct segmentation, so it is copied over.
 * Only questions with FEWER segments than their sentence are touched; questions with no
 * segments at all are left alone -- those fall back to rendering the plain meaning string,
 * which is already complete.
 *
 * Run with --apply to write; defaults to a dry run.
 */
import "dotenv/config";
import { Client } from "pg";

const APPLY = process.argv.includes("--apply");

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const now = new Date();

  const rows = (await c.query(
    `SELECT q.id, q.subtype, q.review_data, s.text AS src, s.meaning_segments AS sentence_segments,
            l.title AS lesson, u.title AS unit
     FROM exercise_questions q
     JOIN lessons l ON l.id = q.lesson_id AND l.is_deleted = false
     JOIN units u ON u.id = l.unit_id
     JOIN sentences s ON s.id = q.source_id AND s.is_deleted = false
     WHERE q.is_deleted = false
       AND jsonb_array_length(COALESCE(s.meaning_segments, '[]'::jsonb)) > 0
       AND jsonb_array_length(COALESCE(q.review_data->'meaningSegments', '[]'::jsonb)) > 0
       AND jsonb_array_length(q.review_data->'meaningSegments')
           < jsonb_array_length(s.meaning_segments)`
  )).rows as any[];

  console.log(APPLY ? "=== APPLYING ===\n" : "=== DRY RUN (pass --apply to write) ===\n");
  for (const r of rows) {
    const shown = (r.review_data?.meaningSegments || []).map((x: any) => x.text).join(" ");
    const full = (r.sentence_segments || []).map((x: any) => x.text).join(" ");
    console.log(`${r.unit} / ${r.lesson}`);
    console.log(`   ${r.subtype}  "${r.src}"`);
    console.log(`   meaning shown to learner : "${shown}"`);
    console.log(`   should be                : "${full}"`);
    console.log(`   segments ${(r.review_data?.meaningSegments || []).length} -> ${(r.sentence_segments || []).length}\n`);
  }
  console.log(`${"=".repeat(60)}\nquestions to repair: ${rows.length}`);

  if (!APPLY) { console.log("\n(nothing written)"); await c.end(); return; }

  try {
    await c.query("BEGIN");
    for (const r of rows) {
      const nextReviewData = { ...(r.review_data || {}), meaningSegments: r.sentence_segments };
      await c.query(
        `UPDATE exercise_questions SET review_data = $2, updated_at = $3 WHERE id = $1`,
        [r.id, JSON.stringify(nextReviewData), now]
      );
    }
    await c.query("COMMIT");
    console.log("\ncommitted");
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  }
  await c.end();
}

main().catch((error) => { console.error(error); process.exit(1); });
