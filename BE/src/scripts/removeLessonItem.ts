/**
 * Take one vocabulary item out of one lesson: its introduce/review link, its stage-1 card,
 * and every exercise whose source it is. The item's row and its use elsewhere are untouched.
 *
 * For a lesson that introduced something its plan never named -- `Bẹ́ẹ̀` given a card because
 * a phrase target produced none and the slot was open -- this beats regenerating the lesson,
 * which would throw away the sentences and exercises that are right. Run the append script
 * afterwards to refill the exercises the lesson lost.
 *
 *   npx tsx src/scripts/removeLessonItem.ts --lesson <id> --word Bẹ́ẹ̀
 *   npx tsx src/scripts/removeLessonItem.ts --lesson <id> --expression "Fún mi" --apply
 */
import "dotenv/config";
import { Client } from "pg";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

const APPLY = process.argv.includes("--apply");
const arg = (name: string) => {
  const at = process.argv.indexOf(`--${name}`);
  return at < 0 ? "" : String(process.argv[at + 1] || "").trim();
};
const LESSON_ID = arg("lesson");
const WORD = arg("word");
const EXPRESSION = arg("expression");
const SENTENCE = arg("sentence");

async function main() {
  if (!LESSON_ID || (!WORD && !EXPRESSION && !SENTENCE))
    throw new Error("--lesson <id> and one of --word <text> / --expression <text> / --sentence <text> are required");
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  c.on("error", (err) => console.error(`database connection error: ${err.message}`));
  await c.connect();
  const q = async (sql: string, params?: unknown[]) => (await c.query(sql, params)).rows;

  try {
    const lesson = (await q(`SELECT id, title, language FROM lessons WHERE id = $1 AND is_deleted = false`, [LESSON_ID]))[0];
    if (!lesson) throw new Error("lesson not found");
    const kind = WORD ? "word" : EXPRESSION ? "expression" : "sentence";
    const table = `${kind}s`;
    const item = (await q(`SELECT id, text FROM ${table} WHERE language = $1 AND is_deleted = false AND lower(text) = lower($2) LIMIT 1`, [
      lesson.language,
      WORD || EXPRESSION || SENTENCE
    ]))[0];
    if (!item) throw new Error(`no live ${kind} row for "${WORD || EXPRESSION || SENTENCE}"`);
    console.log(`lesson "${lesson.title}", ${kind} "${item.text}" (${item.id})`);

    const links = await q(`SELECT id, role FROM lesson_content_items WHERE lesson_id = $1 AND content_id = $2`, [LESSON_ID, item.id]);
    const questions = await q(
      `SELECT id, subtype FROM exercise_questions WHERE lesson_id = $1 AND is_deleted = false AND (source_id = $2 OR interaction_data::text LIKE '%' || $2 || '%')`,
      [LESSON_ID, item.id]
    );
    const blocks = await q(
      `SELECT lb.id, lb.stage_id, lb.order_index, lb.type, st.order_index AS stage
         FROM lesson_blocks lb JOIN lesson_stages st ON st.id = lb.stage_id
        WHERE st.lesson_id = $1 AND (lb.ref_id = $2 OR lb.ref_id = ANY($3))`,
      [LESSON_ID, item.id, questions.map((x) => x.id)]
    );
    console.log(`   links: ${links.map((l) => l.role).join(", ") || "none"}`);
    console.log(`   exercises: ${questions.map((x) => x.subtype).join(", ") || "none"}`);
    console.log(`   blocks: ${blocks.map((b) => `stage ${b.stage + 1} #${b.order_index} ${b.type}`).join(", ") || "none"}`);
    const remaining = await q(
      `SELECT count(*)::int AS n FROM lesson_blocks lb JOIN lesson_stages st ON st.id = lb.stage_id WHERE st.lesson_id = $1 AND lb.type = 'question'`,
      [LESSON_ID]
    );
    console.log(`   exercises in the lesson after removal: ${remaining[0].n - blocks.filter((b) => b.type === "question").length}`);
    if (!APPLY) return console.log("\ndry run -- pass --apply to write");

    mkdirSync("scratch", { recursive: true });
    const backupPath = path.resolve("scratch", `remove-item-${LESSON_ID}-${Date.now()}.json`);
    writeFileSync(backupPath, JSON.stringify({ lesson, item, links, questions, blocks }, null, 2));
    await c.query("BEGIN");
    try {
      for (const b of blocks) await c.query(`DELETE FROM lesson_blocks WHERE id = $1`, [b.id]);
      for (const stageId of new Set(blocks.map((b) => b.stage_id as string)))
        await c.query(
          `UPDATE lesson_blocks lb SET order_index = r.rn - 1
             FROM (SELECT id, row_number() OVER (ORDER BY order_index, id) rn FROM lesson_blocks WHERE stage_id = $1) r
            WHERE lb.id = r.id AND lb.order_index <> r.rn - 1`,
          [stageId]
        );
      for (const x of questions)
        await c.query(`UPDATE exercise_questions SET is_deleted = true, deleted_at = now(), updated_at = now() WHERE id = $1`, [x.id]);
      for (const l of links) await c.query(`DELETE FROM lesson_content_items WHERE id = $1`, [l.id]);
      await c.query("COMMIT");
    } catch (err) {
      await c.query("ROLLBACK");
      throw err;
    }
    console.log(`\napplied: ${links.length} link(s), ${blocks.length} block(s), ${questions.length} exercise(s) removed; backup ${backupPath}`);
  } finally {
    await c.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
