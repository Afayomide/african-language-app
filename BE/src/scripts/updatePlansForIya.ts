/**
 * Take Màmá out of the saved unit plans, so regenerating cannot put it back.
 *
 * The word was retired from the course, but five units still carry it in their stored
 * extraInstructions -- and one of them, "The 24-Hour Respect Loop", names it as a target. Left
 * alone, re-running that plan would reintroduce Màmá in the first lesson of the course.
 *
 * Only the target-language word is swapped. The English is left as written, because Ìyá does
 * mean mom as well as mother; changing it would be an opinion, not a correction.
 *
 * One unit needs more than a swap: my own instructions for "Well-being & Checks" put
 * `Ẹ káàárọ̀ Màmá, dáadáa ni.` in lesson 1 and `Ẹ káàárọ̀ Ìyá, dáadáa ni.` in lesson 2, so a
 * plain swap makes the two lessons share a sentence. Lesson 2 moves to the afternoon instead.
 *
 *   npx tsx src/scripts/updatePlansForIya.ts            # dry run, shows every changed line
 *   npx tsx src/scripts/updatePlansForIya.ts --apply
 */
import "dotenv/config";
import { Client } from "pg";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

const APPLY = process.argv.includes("--apply");

/** Applied after the generic swap, keyed by "chapterOrder/unitOrder". */
const EXTRA: Record<string, Array<[string, string]>> = {
  "1/6": [
    ["Ẹ káàárọ̀ Ìyá, dáadáa ni. (Good morning Mother, it is fine.)", "Ẹ káàsán Ìyá, dáadáa ni. (Good afternoon Mother, it is fine.)"],
    ["Ẹ káàsán ọ̀rẹ́ mi, dáadáa ni. (Good afternoon my friend, it is fine.)", "Ẹ káàárọ̀ ọ̀rẹ́ mi, dáadáa ni. (Good morning my friend, it is fine.)"]
  ]
};

/**
 * Swap the word, then collapse the pair it creates: a vocabulary list naming both words
 * becomes "Ìyá, Ìyá" once they are the same word.
 */
const swapWord = (text: string) =>
  text
    .replace(/Màmá/g, "Ìyá")
    .replace(/màmá/g, "ìyá")
    .replace(/Ìyá,\s*Ìyá/g, "Ìyá")
    .replace(/ìyá,\s*ìyá/g, "ìyá");

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  c.on("error", (err) => console.error(`database connection error: ${err.message}`));
  await c.connect();
  const q = async (sql: string, params?: unknown[]) => (await c.query(sql, params)).rows;

  try {
    const units = await q(
      `SELECT u.id, u.title, u.order_index AS uo, ch.order_index AS co,
              u.last_ai_preview_plan->'settings'->>'extraInstructions' AS instructions
         FROM units u JOIN chapters ch ON ch.id = u.chapter_id
        WHERE u.language='yoruba' AND u.is_deleted=false
          AND u.last_ai_preview_plan->'settings'->>'extraInstructions' ILIKE '%màmá%'
        ORDER BY ch.order_index, u.order_index`
    );

    const changes: Array<{ id: string; label: string; next: string }> = [];
    for (const u of units) {
      const before: string = u.instructions;
      let after = swapWord(before);
      let extras = 0;
      for (const [from, to] of EXTRA[`${u.co}/${u.uo}`] || []) {
        if (after.includes(from)) {
          after = after.replace(from, to);
          extras += 1;
        }
      }
      const label = `ch${u.co}/u${u.uo} "${u.title}"`;
      console.log(`\n${label}`);
      const beforeLines = before.split(/\r?\n/);
      const afterLines = after.split(/\r?\n/);
      for (let i = 0; i < Math.max(beforeLines.length, afterLines.length); i += 1) {
        if (beforeLines[i] === afterLines[i]) continue;
        console.log(`   -  ${String(beforeLines[i] ?? "").trim()}`);
        console.log(`   +  ${String(afterLines[i] ?? "").trim()}`);
      }
      if (extras) console.log(`   (${extras} extra replacement(s) applied to keep two lessons distinct)`);

      // A swap can silently make two sentence lines identical. Report only the ones it caused:
      // several of these plans already repeat a line on purpose, and flagging those is noise.
      const duplicatesIn = (lines: string[]) => {
        const seen = new Set<string>();
        const dupes = new Set<string>();
        for (const raw of lines) {
          const line = raw.trim();
          if (!/^[^\s].*\(.*\)\s*$/.test(line) || !/[^\x00-\x7F]/.test(line)) continue;
          if (seen.has(line)) dupes.add(line);
          seen.add(line);
        }
        return dupes;
      };
      const wasDuplicate = duplicatesIn(beforeLines);
      for (const line of duplicatesIn(afterLines))
        if (!wasDuplicate.has(line) && !wasDuplicate.has(line.replace(/Ìyá/g, "Màmá")))
          console.log(`   !! the swap made two lines identical: ${line}`);
      changes.push({ id: u.id, label, next: after });
    }

    console.log(`\n${changes.length} plan(s) to update`);
    if (!APPLY) return console.log("dry run -- pass --apply to write");

    mkdirSync("scratch", { recursive: true });
    const backupPath = path.resolve("scratch", `plans-mama-backup-${Date.now()}.json`);
    writeFileSync(backupPath, JSON.stringify(units, null, 2));

    await c.query("BEGIN");
    try {
      for (const change of changes) {
        await c.query(
          `UPDATE units
              SET last_ai_preview_plan = jsonb_set(last_ai_preview_plan::jsonb,
                    '{settings,extraInstructions}', to_jsonb($1::text), true),
                  updated_at = now()
            WHERE id = $2`,
          [change.next, change.id]
        );
      }
      await c.query("COMMIT");
    } catch (err) {
      await c.query("ROLLBACK");
      throw err;
    }
    console.log(`\napplied. previous plans saved to ${backupPath}`);
  } finally {
    await c.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
