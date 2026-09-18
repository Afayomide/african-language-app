/**
 * Give an expression the component rows it should have had.
 *
 * An expression is a multi-word unit in its own table, broken into components -- one per word,
 * each pointing at the word row it came from. That breakdown is what lets a learner tap the
 * phrase and see what each part contributes. Some expressions were generated with none at all,
 * so they are opaque: `Èló ni?` sits in 5 lessons and 7 questions and breaks down into nothing.
 *
 * Components are derived from the expression's own text, never invented. The text is split on
 * whitespace, surrounding punctuation is peeled off, and each part must resolve to exactly one
 * live word row or the whole expression is skipped. Nothing here creates a word row and nothing
 * rewrites a spelling: letters and tone marks must match exactly, since those are what pick out
 * the word. Only first-letter case is allowed to differ, because an expression capitalises
 * whichever word opens it while the word row may be stored either way.
 *
 * (Not to be confused with backfillExpressionComponents.ts, which predates the Postgres
 * migration -- it talks to Mongo and writes an embedded array that no longer exists.)
 *
 *   npx tsx src/scripts/buildMissingExpressionComponents.ts           # dry run
 *   npx tsx src/scripts/buildMissingExpressionComponents.ts --apply
 */
import "dotenv/config";
import { Client } from "pg";
import { genObjectId } from "../utils/ids.js";

const APPLY = process.argv.includes("--apply");

const lower = (s: string) => s.toLocaleLowerCase("yo");

/** Each word as it appears in the phrase, with surrounding punctuation removed. */
const parts = (text: string) =>
  text
    .split(/\s+/)
    .map((token) => token.replace(/^[^\p{L}]+/u, "").replace(/[^\p{L}]+$/u, ""))
    .filter(Boolean);

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  console.log(APPLY ? "=== APPLYING ===\n" : "=== DRY RUN (pass --apply to write) ===\n");

  const words = (await c.query(
    `SELECT id, text FROM words WHERE is_deleted = false`)).rows as any[];
  const byStem = new Map<string, any[]>();
  for (const w of words) {
    const k = lower(w.text);
    byStem.set(k, [...(byStem.get(k) ?? []), w]);
  }

  const empty = (await c.query(
    `SELECT e.id, e.text FROM expressions e
     WHERE e.is_deleted = false
       AND NOT EXISTS (SELECT 1 FROM expression_components ec WHERE ec.expression_id = e.id)
     ORDER BY e.text`)).rows as any[];

  console.log(`expressions with no components: ${empty.length}\n`);
  if (APPLY) await c.query("BEGIN");

  let built = 0;
  for (const e of empty) {
    const resolved = parts(e.text).map((token) => ({ token, matches: byStem.get(lower(token)) ?? [] }));
    const unresolved = resolved.filter((r) => r.matches.length !== 1);

    if (!resolved.length || unresolved.length) {
      console.log(`SKIP  "${e.text}"`);
      unresolved.forEach((r) =>
        console.log(`         "${r.token}" resolves to ${r.matches.length} live word rows` +
          (r.matches.length > 1 ? `: ${JSON.stringify(r.matches.map((m: any) => m.text))}` : "")));
      console.log(`      A component has to point at exactly one word. Left alone.\n`);
      continue;
    }

    console.log(`BUILD "${e.text}"`);
    resolved.forEach((r, i) => console.log(`         [${i}] "${r.token}"  ->  word "${r.matches[0].text}"`));
    console.log();
    built++;

    if (APPLY) {
      for (const [i, r] of resolved.entries()) {
        await c.query(
          `INSERT INTO expression_components
             (id, expression_id, type, ref_id, order_index, text_snapshot)
           VALUES ($1, $2, 'word', $3, $4, $5)`,
          [genObjectId(), e.id, r.matches[0].id, i, r.token]);
      }
    }
  }

  console.log("=".repeat(60));
  console.log(`expressions ${APPLY ? "built" : "to build"}: ${built} of ${empty.length}`);
  if (APPLY) { await c.query("COMMIT"); console.log("committed"); }
  else console.log("(nothing written)");
  await c.end();
}

main().catch((error) => { console.error(error?.message ?? error); process.exit(1); });
