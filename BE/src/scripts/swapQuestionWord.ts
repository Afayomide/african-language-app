/**
 * Rewrite a retired word inside the generated exercise questions.
 *
 * Questions copy their source text rather than referencing it, so swapping a word in the
 * sentences leaves the drills behind: after `Màmá` became `Ìyá`, 98 live exercises still asked
 * learners to spell and arrange `Màmá`, including the very first lesson of the course.
 *
 * The rewriting rules, and why a letter-order question cannot be string-substituted, live in
 * services/content/questionTextSwap.ts, which is unit tested. This script is the plumbing:
 * find, preview, back up, write.
 *
 *   npx tsx src/scripts/swapQuestionWord.ts --from Màmá --to Ìyá
 *   npx tsx src/scripts/swapQuestionWord.ts --from Màmá --to Ìyá --apply
 */
import "dotenv/config";
import { Client } from "pg";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { swapQuestionWord, type SwappableQuestion } from "../services/content/questionTextSwap.js";

const APPLY = process.argv.includes("--apply");
const arg = (name: string) => {
  const at = process.argv.indexOf(`--${name}`);
  return at < 0 ? "" : String(process.argv[at + 1] || "").trim();
};
const FROM = arg("from");
const TO = arg("to");
const LANGUAGE = arg("language") || "yoruba";

async function main() {
  if (!FROM || !TO) throw new Error("--from <word> --to <word> are required");
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  c.on("error", (err) => console.error(`database connection error: ${err.message}`));
  await c.connect();
  const q = async (sql: string, params?: unknown[]) => (await c.query(sql, params)).rows;

  try {
    // Word ids let a matching question point at the new row, not just show the new text.
    const idOf = async (text: string) =>
      (await q(`SELECT id FROM words WHERE language=$1 AND text=$2 ORDER BY is_deleted LIMIT 1`, [LANGUAGE, text]))[0]?.id as
        | string
        | undefined;
    const spec = { from: FROM, to: TO, fromId: await idOf(FROM), toId: await idOf(TO) };
    console.log(`swapping "${FROM}" -> "${TO}"  (ids ${spec.fromId || "?"} -> ${spec.toId || "?"})\n`);

    const rows = await q(
      `SELECT eq.id, eq.subtype, eq.prompt_template, eq.options, eq.correct_index, eq.review_data,
              eq.interaction_data, eq.explanation, l.title AS lesson, u.title AS unit, ch.order_index AS co
         FROM exercise_questions eq
         JOIN lessons l ON l.id = eq.lesson_id AND l.is_deleted = false
         JOIN units u ON u.id = l.unit_id
         JOIN chapters ch ON ch.id = u.chapter_id
        WHERE eq.is_deleted = false AND l.language = $1 AND to_jsonb(eq)::text ILIKE $2
        ORDER BY ch.order_index, u.order_index, l.order_index`,
      [LANGUAGE, `%${FROM}%`]
    );
    console.log(`${rows.length} live question(s) mention it\n`);

    const updates: Array<{ id: string; fields: Record<string, unknown>; where: string; subtype: string }> = [];
    const refused: Array<{ id: string; where: string; subtype: string; why: string }> = [];
    const untouched: string[] = [];
    const bySubtype = new Map<string, number>();

    for (const row of rows) {
      const where = `ch${row.co} ${row.unit} :: ${row.lesson}`;
      const result = swapQuestionWord(row as SwappableQuestion, spec);
      if (result.refused) {
        refused.push({ id: row.id, where, subtype: row.subtype, why: result.warnings.join("; ") });
        continue;
      }
      if (!result.changed) {
        untouched.push(`[${row.subtype}] ${where}`);
        continue;
      }
      updates.push({ id: row.id, fields: result.fields as Record<string, unknown>, where, subtype: row.subtype });
      bySubtype.set(row.subtype, (bySubtype.get(row.subtype) || 0) + 1);
    }

    console.log(`TO UPDATE (${updates.length}), by subtype:`);
    for (const [subtype, n] of [...bySubtype].sort((a, b) => b[1] - a[1])) console.log(`   ${subtype.padEnd(28)} ${n}`);
    console.log(`\nfirst few, in detail:`);
    for (const u of updates.slice(0, 4)) {
      console.log(`   [${u.subtype}] ${u.where}`);
      for (const [key, value] of Object.entries(u.fields)) console.log(`      ${key}: ${JSON.stringify(value).slice(0, 170)}`);
    }
    if (refused.length) {
      console.log(`\nREFUSED (${refused.length}) -- these need a human or a regeneration:`);
      refused.forEach((r) => console.log(`   [${r.subtype}] ${r.where}\n      ${r.why}`));
    }
    if (untouched.length) {
      console.log(`\nMATCHED THE SEARCH BUT HAD NOTHING TO CHANGE (${untouched.length}):`);
      untouched.slice(0, 8).forEach((u) => console.log(`   ${u}`));
      if (untouched.length > 8) console.log(`   ... and ${untouched.length - 8} more`);
    }

    if (!APPLY) return console.log("\ndry run -- pass --apply to write");

    mkdirSync("scratch", { recursive: true });
    const backupPath = path.resolve("scratch", `question-swap-backup-${Date.now()}.json`);
    writeFileSync(backupPath, JSON.stringify(rows, null, 2));

    await c.query("BEGIN");
    try {
      for (const update of updates) {
        const sets: string[] = [];
        const values: unknown[] = [];
        for (const [key, value] of Object.entries(update.fields)) {
          values.push(key === "options" ? value : key === "review_data" || key === "interaction_data" ? JSON.stringify(value) : value);
          sets.push(`${key} = $${values.length}${key === "review_data" || key === "interaction_data" ? "::jsonb" : ""}`);
        }
        values.push(update.id);
        await c.query(`UPDATE exercise_questions SET ${sets.join(", ")}, updated_at = now() WHERE id = $${values.length}`, values);
      }
      await c.query("COMMIT");
    } catch (err) {
      await c.query("ROLLBACK");
      throw err;
    }
    console.log(`\napplied ${updates.length} question(s). previous state saved to ${backupPath}`);
  } finally {
    await c.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
