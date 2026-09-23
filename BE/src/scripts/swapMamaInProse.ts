/**
 * The last places Màmá survived: prose, not content.
 *
 * A word card renders its own explanation and examples, and a lesson can carry a proverb block.
 * None of those is a sentence row, a component or a question, so every search I ran for the
 * swap missed them, and the learner kept meeting a word the course no longer teaches:
 *
 *   words.explanation   bàbá  "...Like 'màmá', elders are referred to with 'wọ́n'."
 *   words.examples      mi    "Màmá mi nìyí." = "This is my mother."
 *   proverbs.text             "Ẹ káàárọ̀ Màmá, dáadáa ni."  (live in a lesson)
 *
 * The Màmá word row and the four sentences no lesson uses are deliberately left as they are --
 * they are what teaching Màmá later will be built from.
 *
 *   npx tsx src/scripts/swapMamaInProse.ts            # dry run
 *   npx tsx src/scripts/swapMamaInProse.ts --apply
 */
import "dotenv/config";
import { Client } from "pg";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { swapInText } from "../services/content/questionTextSwap.js";

const APPLY = process.argv.includes("--apply");
const SPEC = { from: "Màmá", to: "Ìyá" };

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  c.on("error", (err) => console.error(`database connection error: ${err.message}`));
  await c.connect();
  const q = async (sql: string, params?: unknown[]) => (await c.query(sql, params)).rows;

  try {
    const backup: Record<string, unknown> = {};
    const plan: string[] = [];

    // Word prose, skipping the Màmá row itself -- it keeps its own examples for later.
    const words = await q(
      `SELECT id, text, explanation, examples FROM words
        WHERE language='yoruba' AND is_deleted=false AND text <> $1
          AND (explanation ~* 'm[àáa]m[àáa]' OR examples::text ~* 'm[àáa]m[àáa]')`,
      [SPEC.from]
    );
    backup.words = words;
    for (const w of words) {
      plan.push(`word "${w.text}"`);
      if (w.explanation && /m[àáa]m[àáa]/i.test(w.explanation))
        plan.push(`   explanation: ${w.explanation}\n            -> ${swapInText(w.explanation, SPEC)}`);
      if (w.examples) {
        const next = JSON.parse(swapInText(JSON.stringify(w.examples), SPEC));
        for (const [i, ex] of (w.examples as any[]).entries())
          if (/m[àáa]m[àáa]/i.test(JSON.stringify(ex)))
            plan.push(`   example: "${ex.original}"  ->  "${next[i].original}"`);
      }
    }

    // A proverb attached to a live lesson. One that no lesson uses is left alone.
    const proverbs = await q(
      `SELECT DISTINCT p.id, p.text, p.normalized_text, p.translation, p.context_note
         FROM proverbs p
         JOIN lesson_blocks lb ON lb.ref_id = p.id
         JOIN lesson_stages st ON st.id = lb.stage_id
         JOIN lessons l ON l.id = st.lesson_id AND l.is_deleted = false
        WHERE p.is_deleted = false AND p.text ~* 'm[àáa]m[àáa]'`
    );
    backup.proverbs = proverbs;
    for (const p of proverbs) plan.push(`proverb: "${p.text}"  ->  "${swapInText(p.text, SPEC)}"`);

    console.log(plan.join("\n"));
    console.log(`\n${words.length} word row(s), ${proverbs.length} proverb(s)`);
    if (!words.length && !proverbs.length) return console.log("nothing to change");
    if (!APPLY) return console.log("\ndry run -- pass --apply to write");

    mkdirSync("scratch", { recursive: true });
    const backupPath = path.resolve("scratch", `mama-prose-backup-${Date.now()}.json`);
    writeFileSync(backupPath, JSON.stringify(backup, null, 2));

    await c.query("BEGIN");
    try {
      for (const w of words) {
        await c.query(
          `UPDATE words SET explanation = $1, examples = $2::jsonb, updated_at = now() WHERE id = $3`,
          [
            w.explanation ? swapInText(w.explanation, SPEC) : w.explanation,
            w.examples ? swapInText(JSON.stringify(w.examples), SPEC) : JSON.stringify(w.examples),
            w.id
          ]
        );
      }
      for (const p of proverbs) {
        const text = swapInText(p.text, SPEC);
        await c.query(
          `UPDATE proverbs SET text = $1, normalized_text = $2, context_note = $3, updated_at = now() WHERE id = $4`,
          [text, text.normalize("NFC").toLowerCase(), p.context_note ? swapInText(p.context_note, SPEC) : p.context_note, p.id]
        );
      }
      await c.query("COMMIT");
    } catch (err) {
      await c.query("ROLLBACK");
      throw err;
    }
    console.log(`\napplied. previous state saved to ${backupPath}`);
  } finally {
    await c.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
