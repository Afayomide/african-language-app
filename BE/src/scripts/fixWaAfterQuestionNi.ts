/**
 * In `Níbo ni omi wà?` ("Where is the water?") the learner saw "is" twice: on `ni` and on
 * `wà`. The course labels `ni` after a question word as the "is"/"are" (reviewNiGlosses.ts,
 * reviewExpressionNiGlosses.ts). `wà` there is not a second "is" -- it means "exist / be
 * present" -- so it gets that label instead.
 *
 * Only `wà` in a question clause opened by `Níbo ni` or `Ta ni` is touched, and only when it
 * currently repeats the copula (is / are / am / be). `wà` elsewhere keeps its label: in
 * `Ọkọ̀ yẹn wà níbẹ̀` ("That vehicle is there") it IS the only "is", and in `Mo wà dáadáa`
 * ("I am well") it is the "am".
 *
 *   npx tsx src/scripts/fixWaAfterQuestionNi.ts           # dry run
 *   npx tsx src/scripts/fixWaAfterQuestionNi.ts --apply
 *
 * Previous values are saved to scratch/ before anything is written.
 */
import "dotenv/config";
import { Client } from "pg";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

const APPLY = process.argv.includes("--apply");
const LABEL = "(exists / is present)";
const COPULA = new Set(["is", "are", "am", "be", "is/are"]);
// `wà` later in the same clause as a question word followed by `ni`. Letter boundaries are
// spelled out with \p{L}: `\b` is ASCII-only and treats `à` as a non-letter.
const QUESTION_CLAUSE = /(^|[,.?!]\s*)(níbo|ta) ni(?!\p{L})[^,.?!]*(?<!\p{L})wà(?!\p{L})/iu;

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  c.on("error", (err) => console.error(`database connection error: ${err.message}`));
  await c.connect();
  try {
    const rows = (await c.query(
      `SELECT sc.id, sc.gloss, s.text, s.translations[1] AS english
       FROM sentence_components sc JOIN sentences s ON s.id = sc.sentence_id AND s.is_deleted = false
       WHERE s.language = 'yoruba' AND sc.type = 'word' AND sc.text_snapshot = 'wà'
       ORDER BY s.text`
    )).rows;
    const targets = rows.filter(
      (r) => QUESTION_CLAUSE.test(r.text.normalize("NFC")) && COPULA.has(String(r.gloss ?? "").toLowerCase())
    );

    for (const t of targets) console.log(`${t.text}  (${t.english})  wà: "${t.gloss}" -> "${LABEL}"`);
    console.log(`\n${targets.length} to update`);
    if (!APPLY) { console.log("dry run -- pass --apply to write"); return; }

    mkdirSync("scratch", { recursive: true });
    const backup = path.resolve("scratch", `wa-after-ni-backup-${Date.now()}.json`);
    writeFileSync(backup, JSON.stringify(targets, null, 2));
    const res = await c.query(`UPDATE sentence_components SET gloss = $1 WHERE id = ANY($2)`, [LABEL, targets.map((t) => t.id)]);
    console.log(`${res.rowCount} written; previous values saved to ${backup}`);
  } finally {
    await c.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
