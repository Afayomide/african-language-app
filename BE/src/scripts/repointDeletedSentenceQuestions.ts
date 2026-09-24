/**
 * Point questions off sentence rows that no longer exist.
 *
 * The Màmá -> Ìyá swap gave each lesson a fresh Ìyá sentence and soft-deleted the Màmá one,
 * and rewrote the text the questions carry -- but a question's `source_id` still names the
 * deleted row, and `{phrase}` in a prompt is rendered from the source at display time. So the
 * learner reads "Ẹ káàárọ̀, Màmá." over an exercise whose tiles say ìyá, and a speaking
 * exercise plays a sentence the lesson does not contain.
 *
 * For every live question whose source sentence is soft-deleted, this finds the live sentence
 * linked to the same lesson whose text is the deleted one with Màmá replaced by Ìyá
 * (compared after Unicode normalisation, since the two rows were typed at different times),
 * and repoints `source_id` -- plus any `related_source_refs` naming the old row. A question
 * with no such sentence in its lesson is listed, not touched: those lessons need regenerating.
 *
 * If repointing would give a lesson two exercises of the same type on the same sentence, the
 * clash is listed and the question is still repointed: two on one sentence beats one on a
 * sentence that is gone, and the equalise script's listing will show it for cleanup.
 *
 *   npx tsx src/scripts/repointDeletedSentenceQuestions.ts            # dry run
 *   npx tsx src/scripts/repointDeletedSentenceQuestions.ts --apply
 */
import "dotenv/config";
import { Client } from "pg";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

const APPLY = process.argv.includes("--apply");

const fold = (s: string) => s.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
const swapped = (s: string) => fold(s).replace(/màmá/g, "ìyá");

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  c.on("error", (err) => console.error(`database connection error: ${err.message}`));
  await c.connect();
  const q = async (sql: string, params?: unknown[]) => (await c.query(sql, params)).rows;

  try {
    const stale = await q(
      `SELECT eq.id, eq.subtype, eq.source_id, eq.related_source_refs, eq.lesson_id,
              s.text AS old_text, l.title AS lesson, u.title AS unit, ch.order_index AS ch
         FROM exercise_questions eq
         JOIN sentences s ON s.id = eq.source_id AND eq.source_type = 'sentence'
         JOIN lessons l ON l.id = eq.lesson_id AND l.is_deleted = false
         JOIN units u ON u.id = l.unit_id
         JOIN chapters ch ON ch.id = u.chapter_id
        WHERE eq.is_deleted = false AND s.is_deleted = true AND l.language = 'yoruba'
        ORDER BY ch.order_index, u.order_index, l.order_index, eq.created_at`
    );
    if (!stale.length) return console.log("no live question points at a deleted sentence -- nothing to do");

    const repoint: Array<{ id: string; from: string; to: string; refs: unknown[] | null }> = [];
    const orphan: any[] = [];
    let currentLesson = "";
    for (const row of stale) {
      const heading = `ch${row.ch} ${row.unit} > ${row.lesson}`;
      if (heading !== currentLesson) {
        currentLesson = heading;
        console.log(`\n${heading}`);
      }
      const live = await q(
        `SELECT s.id, s.text FROM lesson_content_items lci
           JOIN sentences s ON s.id = lci.content_id AND s.is_deleted = false
          WHERE lci.lesson_id = $1`,
        [row.lesson_id]
      );
      const want = swapped(row.old_text);
      const match = live.find((s) => fold(s.text) === want);
      if (!match) {
        orphan.push(row);
        console.log(`   ?  ${row.subtype.padEnd(26)} "${row.old_text}"  -- no live sentence in this lesson reads "${want}"`);
        continue;
      }
      const clash = await q(
        `SELECT id FROM exercise_questions WHERE lesson_id = $1 AND source_id = $2 AND subtype = $3 AND is_deleted = false AND id <> $4`,
        [row.lesson_id, match.id, row.subtype, row.id]
      );
      const refs = Array.isArray(row.related_source_refs) ? row.related_source_refs : null;
      const touchesRefs = refs?.some((r: any) => r?.id === row.source_id || r?.sourceId === row.source_id);
      const nextRefs = touchesRefs
        ? refs!.map((r: any) => (r?.id === row.source_id ? { ...r, id: match.id } : r?.sourceId === row.source_id ? { ...r, sourceId: match.id } : r))
        : null;
      repoint.push({ id: row.id, from: row.source_id, to: match.id, refs: nextRefs });
      console.log(
        `   ->  ${row.subtype.padEnd(26)} "${row.old_text}"  ->  "${match.text}"${clash.length ? `   !! lesson already has a ${row.subtype} on that sentence` : ""}`
      );
    }
    console.log(`\n${repoint.length} to repoint, ${orphan.length} with no replacement in their lesson`);
    if (!APPLY) return console.log("\ndry run -- pass --apply to write");
    if (!repoint.length) return;

    mkdirSync("scratch", { recursive: true });
    const backupPath = path.resolve("scratch", `repoint-sentence-questions-backup-${Date.now()}.json`);
    writeFileSync(backupPath, JSON.stringify(stale, null, 2));
    await c.query("BEGIN");
    for (const r of repoint) {
      await c.query(
        `UPDATE exercise_questions SET source_id = $1, related_source_refs = COALESCE($2::jsonb, related_source_refs), updated_at = now() WHERE id = $3`,
        [r.to, r.refs ? JSON.stringify(r.refs) : null, r.id]
      );
    }
    await c.query("COMMIT");
    console.log(`\nrepointed ${repoint.length} questions; backup ${backupPath}`);
  } finally {
    await c.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
