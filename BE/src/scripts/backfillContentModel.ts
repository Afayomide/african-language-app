/**
 * Correct `ai_meta.model` where it names the wrong model.
 *
 * Sentence generation can be routed to a different model than the bulk tasks
 * (OLLAMA_SENTENCES_MODEL). The composed client was built by spreading the base client, so it
 * kept the BASE model's `modelName`, and every sentence produced by the routed model was
 * stamped with the bulk model instead. Fixed at source; this repairs what was already written.
 *
 * Only what is actually knowable is touched. The routing landed in 60463ba on 2026-08-03:
 *
 *   before that commit  - no routing existed, so the recorded bulk model IS what generated
 *                         the content. Those rows are correct and are left alone.
 *   after that commit   - the recorded model is the bulk model, and the sentence model did
 *                         the work.
 *
 * The window is narrow on purpose. Anything outside a period where the sentence model is known
 * with certainty stays as it is: a wrong label is bad, but a confidently wrong label written by
 * a backfill is worse, because it looks like evidence.
 *
 *   npx tsx src/scripts/backfillContentModel.ts           # dry run
 *   npx tsx src/scripts/backfillContentModel.ts --apply
 */
import "dotenv/config";
import { Client } from "pg";

const APPLY = process.argv.includes("--apply");

/** The commit that introduced sentence routing. Before it, the recorded model is the truth. */
const ROUTING_LANDED = "2026-08-03";

/**
 * What the sentence model has been since routing landed. One entry, because there has been
 * exactly one generation run in that window and the server logged its routing at boot:
 *   [LLM] Routing generateSentences ... sentencesModel: 'gemma4:26b'
 * Add a row here only for a period where the model is actually known.
 */
const WINDOWS: { from: string; to: string; wrongly: string; actually: string }[] = [
  { from: ROUTING_LANDED, to: "2026-08-21", wrongly: "qwen2.5:14b", actually: "gemma4:26b" }
];

const TABLES = ["sentences", "words", "expressions", "proverbs"] as const;

let client: Client | null = null;

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  client = c;
  await c.connect();
  console.log(APPLY ? "=== APPLYING ===\n" : "=== DRY RUN (pass --apply to write) ===\n");

  // Anything recorded as a local model BEFORE routing existed is correct as-is; show it so the
  // decision to leave it alone is visible rather than silent.
  console.log(`--- left alone: recorded before ${ROUTING_LANDED}, when no routing existed ---`);
  for (const table of TABLES) {
    const r = (await c.query(
      `SELECT ai_meta->>'model' AS model, count(*)::int AS n FROM ${table}
       WHERE is_deleted = false AND ai_meta->>'model' NOT LIKE 'gemini%'
         AND created_at < $1::timestamptz
       GROUP BY 1 ORDER BY 2 DESC`, [ROUTING_LANDED])).rows as any[];
    r.forEach((x) => console.log(`   ${table.padEnd(12)} ${String(x.model).padEnd(16)} x${x.n}`));
  }

  console.log(`\n--- to correct ---`);
  if (APPLY) await c.query("BEGIN");
  let total = 0;

  for (const w of WINDOWS) {
    console.log(`\n${w.from} .. ${w.to}   "${w.wrongly}" -> "${w.actually}"`);
    for (const table of TABLES) {
      const rows = (await c.query(
        `SELECT id, text, created_at FROM ${table}
         WHERE is_deleted = false AND ai_meta->>'model' = $1
           AND created_at >= $2::timestamptz AND created_at < $3::timestamptz
         ORDER BY created_at`, [w.wrongly, w.from, w.to])).rows as any[];
      if (!rows.length) continue;
      console.log(`   ${table}: ${rows.length}`);
      rows.slice(0, 6).forEach((x) => console.log(`      "${String(x.text).slice(0, 52)}"`));
      if (rows.length > 6) console.log(`      ... and ${rows.length - 6} more`);
      total += rows.length;

      if (APPLY) {
        await c.query(
          `UPDATE ${table}
           SET ai_meta = jsonb_set(coalesce(ai_meta, '{}'::jsonb), '{model}', to_jsonb($1::text)),
               updated_at = now()
           WHERE id = ANY($2::text[])`, [w.actually, rows.map((x) => x.id)]);
      }
    }
  }

  console.log(`\n${"=".repeat(56)}`);
  console.log(`rows ${APPLY ? "corrected" : "to correct"}: ${total}`);

  if (!APPLY) { console.log("\n(nothing written)"); await c.end(); return; }

  // Nothing may still claim the bulk model inside a window where it did not generate.
  for (const w of WINDOWS) {
    for (const table of TABLES) {
      const left = (await c.query(
        `SELECT count(*)::int AS n FROM ${table}
         WHERE is_deleted = false AND ai_meta->>'model' = $1
           AND created_at >= $2::timestamptz AND created_at < $3::timestamptz`,
        [w.wrongly, w.from, w.to])).rows[0].n;
      if (left) { await c.query("ROLLBACK"); throw new Error(`${table}: ${left} rows left; rolled back`); }
    }
  }

  await c.query("COMMIT");
  console.log("committed");
  await c.end();
}

main().catch(async (error) => {
  console.error(error?.message ?? error);
  if (APPLY) await client?.query("ROLLBACK").catch(() => {});
  process.exit(1);
});
