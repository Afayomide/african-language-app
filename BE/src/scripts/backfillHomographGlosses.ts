/**
 * Set per-occurrence glosses for the confirmed Yoruba homographs.
 *
 * A homograph is two unrelated words sharing a spelling. The words table allows one active
 * row per spelling (words_lang_textnorm_active_uq), and the learner payload shows
 * translations[0], so the minority sense can never surface. `sentence_components.gloss`
 * carries it per occurrence instead.
 *
 * Only occurrences matching a structural trigger are touched -- never a plain text match,
 * because `ò` is also the final letter of `àbúrò` and `sí` appears in many correct
 * directional sentences. Everything else keeps gloss = NULL and behaves as before.
 *
 * Run with --apply to write; defaults to a dry run.
 */
import "dotenv/config";
import { Client } from "pg";

const APPLY = process.argv.includes("--apply");

const NEGATOR_ID = "6a084325f1677b66f32abfba"; // ò

type Rule = {
  word: string;
  gloss: string;
  why: string;
  /** SQL returning sentence_components.id rows to update. $1 = the word row's id. */
  sql: string;
};

const RULES: Rule[] = [
  {
    word: "sí",
    gloss: "present",
    why: "negative existential: the suppletive partner of `wà`, only valid after a negator",
    // Only where the component directly follows the negator `ò`.
    sql: `SELECT b.id, s.text
          FROM sentence_components b
          JOIN sentences s ON s.id = b.sentence_id AND s.is_deleted = false
          JOIN sentence_components a ON a.sentence_id = b.sentence_id
                                    AND a.ref_id = '${NEGATOR_ID}'
                                    AND a.order_index = b.order_index - 1
          WHERE b.ref_id = $1`
  },
  {
    word: "wọ́n",
    gloss: "is expensive",
    why: "verb sense; the row's translations lead with the pronoun 'they'",
    // Only where the sentence's English says so -- `wọ́n` is far more often the pronoun.
    sql: `SELECT b.id, s.text
          FROM sentence_components b
          JOIN sentences s ON s.id = b.sentence_id AND s.is_deleted = false
          WHERE b.ref_id = $1
            AND EXISTS (
              SELECT 1 FROM unnest(s.translations) t
              WHERE t ILIKE '%expensive%' OR t ILIKE '%costly%'
            )`
  }
];

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  console.log(APPLY ? "=== APPLYING ===\n" : "=== DRY RUN (pass --apply to write) ===\n");
  const plan: Array<{ ids: string[]; gloss: string; word: string }> = [];

  for (const rule of RULES) {
    // Case-insensitive: rows are stored as generated, so `Wọ́n` and `wọ́n` both occur.
    const w = (await c.query(
      `SELECT id, text, translations FROM words
       WHERE text_normalized = lower($1) AND is_deleted = false`, [rule.word]
    )).rows[0] as any;
    if (!w) { console.log(`(no live word row for "${rule.word}")\n`); continue; }

    const hits = (await c.query(rule.sql, [w.id])).rows as any[];
    console.log(`${rule.word}  ->  gloss "${rule.gloss}"`);
    console.log(`   sense  : ${rule.why}`);
    console.log(`   row    : translations[0] = "${w.translations?.[0]}" (what the learner sees today)`);
    console.log(`   matches: ${hits.length}`);
    hits.forEach((h: any) => console.log(`      ${h.text}`));
    console.log();
    if (hits.length) plan.push({ ids: hits.map((h: any) => h.id), gloss: rule.gloss, word: rule.word });
  }

  const total = plan.reduce((n, p) => n + p.ids.length, 0);
  console.log(`${"=".repeat(60)}`);
  console.log(`component occurrences to gloss: ${total}`);

  if (!APPLY) { console.log("\n(nothing written)"); await c.end(); return; }

  try {
    await c.query("BEGIN");
    for (const p of plan) {
      await c.query(`UPDATE sentence_components SET gloss = $2 WHERE id = ANY($1)`, [p.ids, p.gloss]);
    }
    await c.query("COMMIT");
    console.log("committed");
  } catch (error) {
    await c.query("ROLLBACK");
    throw error;
  }
  await c.end();
}

main().catch((error) => { console.error(error); process.exit(1); });
