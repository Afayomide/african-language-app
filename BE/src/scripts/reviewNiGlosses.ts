/**
 * Label every occurrence of Yoruba `ni` with what it does in THAT sentence, via Gemini, for
 * human review before anything is written.
 *
 * `ni` does several jobs -- the linking "is/are" in `Èló ni omi?`, the "it is" in `Omi ni.`,
 * the object marker after `fún`, part of `Bẹ́ẹ̀ ni` ("yes") -- and normalizeInvariantGlosses.ts
 * had flattened most of them to one label, "is/are". The per-occurrence gloss lives in
 * sentence_components.gloss; this script proposes a value for each one.
 *
 * Two steps, so no model output reaches a learner unreviewed:
 *
 *   npx tsx src/scripts/reviewNiGlosses.ts                  # propose -> scratch/ni-gloss-review.json
 *   npx tsx src/scripts/reviewNiGlosses.ts --limit 5        # propose for the first 5 sentences
 *   npx tsx src/scripts/reviewNiGlosses.ts --apply scratch/ni-gloss-review.json
 *
 * Propose mode only reads the database. In the JSON, edit `final_gloss` to correct a label, or
 * set `skip` to true to leave that entry alone. Apply writes `final_gloss` for every other
 * entry whose value differs from the stored one, and only if the stored gloss still equals the
 * file's `current_gloss` -- an entry edited since the export is reported, not overwritten. The
 * previous values are saved to scratch/ first so the run can be reversed.
 *
 * The model is asked only for English. Any reply that retypes the Yoruba word is discarded
 * (validateGlosses), because Yoruba has no canonical lexicon to arbitrate tone marks against.
 */
import "dotenv/config";
import { Client } from "pg";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { generateRawText } from "../services/llm/geminiClient.js";
import { parseGlossResponse, validateGlosses, type GlossRequest } from "../services/llm/componentGloss.js";

const SCRATCH = path.resolve("scratch");
const OUT_FILE = path.join(SCRATCH, "ni-gloss-review.json");
// Model answers per sentence, saved as they arrive: a rerun after a rate limit or a crash only
// asks about the sentences still missing. Delete the file to ask about every sentence again.
const CACHE_FILE = path.join(SCRATCH, "ni-gloss-cache.json");
// Vertex returns 429 above ~2 concurrent requests on this project's quota.
const CONCURRENCY = 2;

type CachedAnswer = { glosses: Array<{ index: number; gloss: string; reason: string }> };

const APPLY_AT = process.argv.indexOf("--apply");
const APPLY_FILE = APPLY_AT < 0 ? "" : String(process.argv[APPLY_AT + 1] || "").trim();
const LIMIT = (() => {
  const at = process.argv.indexOf("--limit");
  if (at < 0) return Infinity;
  const value = Number.parseInt(process.argv[at + 1] || "", 10);
  return Number.isFinite(value) && value > 0 ? value : Infinity;
})();

// Reader-facing fields first; the ids apply needs come last.
type Row = {
  yoruba: string;
  english: string;
  current_gloss: string;
  gemini_gloss: string;
  reason: string;
  final_gloss: string;
  skip: boolean;
  sentence_id: string;
  component_id: string;
};

function buildNiPrompt(input: GlossRequest): string {
  return [
    'You are labelling the Yoruba word "ni" for a language-learning app. A learner taps "ni"',
    "in this sentence and sees a short English label for the job it does HERE.",
    "",
    `Yoruba sentence: ${input.sentence}`,
    `English meaning: ${input.translation}`,
    "",
    "Its words, in order:",
    ...input.components.map((c) => `  [${c.index}] ${c.text}`),
    "",
    `Label ONLY the word(s) at: ${input.targets.join(", ")}`,
    "",
    'How to label "ni":',
    '- "ni" carries the linking verb. Label it with the "am", "is" or "are" that THIS sentence\'s',
    "  English uses, agreeing with the English subject.",
    "- When the English adds a pronoun that Yoruba leaves out, include it:",
    '  "Omi ni." = "It is water." -> "it is"; "Ọ̀rẹ́ mi ni." = "He is my friend." -> "he is".',
    '- In questions with níbo, kí, ta, èló or báwo, "ni" takes the "is"/"are" label even when',
    '  "wà" is also in the sentence. "wà" means "exist / is present", so in',
    '  "Níbo ni omi wà?" = "Where is the water?" the label for "ni" is "is".',
    '- If the English has no am/is/are for "ni" to carry ("Kí ni o fẹ́?" = "What do you want?"),',
    '  label it "(focus marker)".',
    '- After "fún" ("Fún mi ni omi." = "Give me water."), label it "(object marker)".',
    '- As part of "Bẹ́ẹ̀ ni" meaning "yes", label it "(part of Bẹ́ẹ̀ ni: yes)".',
    "- Keep each label short. Never restate the sentence.",
    "- Do NOT change, correct or retype the Yoruba. Copy each word exactly as given.",
    "",
    "Respond with JSON only, no prose, no code fences:",
    '{"glosses":[{"index":0,"word":"<the word copied exactly>","gloss":"<label>","reason":"<under 12 words>"}]}'
  ].join("\n");
}

async function loadNiWordId(c: Client): Promise<string> {
  const res = await c.query(
    `SELECT id FROM words WHERE language = 'yoruba' AND text_normalized = 'ni' AND is_deleted = false`
  );
  if (res.rowCount !== 1) throw new Error(`expected one active Yoruba "ni" word row, found ${res.rowCount}`);
  return res.rows[0].id;
}

async function propose() {
  // Read everything up front and disconnect: the model calls take minutes under rate limiting,
  // and the Neon pooler drops a connection left idle that long.
  const c = await connect();
  let niId: string;
  let sentences: any[];
  let comps: any[];
  try {
    niId = await loadNiWordId(c);
    sentences = (await c.query(
      `SELECT DISTINCT s.id, s.text, s.translations
       FROM sentences s JOIN sentence_components sc ON sc.sentence_id = s.id
       WHERE s.is_deleted = false AND sc.type = 'word' AND sc.ref_id = $1
       ORDER BY s.text`,
      [niId]
    )).rows.slice(0, LIMIT);
    comps = (await c.query(
      `SELECT id, sentence_id, type, ref_id, order_index, text_snapshot, gloss
       FROM sentence_components WHERE sentence_id = ANY($1) ORDER BY sentence_id, order_index`,
      [sentences.map((s) => s.id)]
    )).rows;
  } finally {
    await c.end();
  }

  mkdirSync(SCRATCH, { recursive: true });
  const cache: Record<string, CachedAnswer> = existsSync(CACHE_FILE)
    ? JSON.parse(readFileSync(CACHE_FILE, "utf8"))
    : {};
  const bySentence = new Map<string, typeof comps>();
  for (const comp of comps) {
    const list = bySentence.get(comp.sentence_id) ?? [];
    list.push(comp);
    bySentence.set(comp.sentence_id, list);
  }

  const rows: Row[] = [];
  let failed = 0;
  let next = 0;

  async function work() {
    while (next < sentences.length) {
      const s = sentences[next++];
      const list = bySentence.get(s.id) ?? [];
      const translation = String(s.translations?.[0] || "");
      const request: GlossRequest = {
        sentence: s.text,
        translation,
        components: list.map((comp, index) => ({ index, text: comp.text_snapshot })),
        targets: list.flatMap((comp, index) => (comp.type === "word" && comp.ref_id === niId ? [index] : []))
      };

      let proposals = new Map<number, { gloss: string; reason: string }>();
      let error = "";
      const cached = cache[s.id];
      if (cached) {
        proposals = new Map(cached.glosses.map((g) => [g.index, { gloss: g.gloss, reason: g.reason }]));
      } else {
        try {
          const raw = await generateRawText(buildNiPrompt(request), "reviewNiGlosses");
          const parsed = parseGlossResponse(raw) as Array<{ index: number; word: string; gloss: string; reason?: string }>;
          const accepted = validateGlosses(request, parsed);
          const reasons = new Map(parsed.map((g) => [Number(g.index), String(g.reason || "").trim()]));
          const glosses = accepted.map((g) => ({ index: g.index, gloss: g.gloss, reason: reasons.get(g.index) || "" }));
          proposals = new Map(glosses.map((g) => [g.index, { gloss: g.gloss, reason: g.reason }]));
          cache[s.id] = { glosses };
          writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
        } catch (err) {
          error = err instanceof Error ? err.message : String(err);
          failed++;
        }
      }

      for (const index of request.targets) {
        const comp = list[index];
        const proposal = proposals.get(index);
        const current = comp.gloss ?? "";
        rows.push({
          yoruba: s.text,
          english: translation,
          current_gloss: current,
          gemini_gloss: proposal?.gloss ?? "",
          reason: proposal ? proposal.reason : `NO PROPOSAL: ${error || "model skipped this word"}`,
          final_gloss: proposal?.gloss ?? current,
          skip: false,
          sentence_id: s.id,
          component_id: comp.id
        });
      }
      process.stdout.write(`\r${rows.length} labelled, ${failed} failed`);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, work));
  process.stdout.write("\n");

  rows.sort((a, b) => a.gemini_gloss.localeCompare(b.gemini_gloss) || a.yoruba.localeCompare(b.yoruba));
  writeFileSync(OUT_FILE, JSON.stringify(rows, null, 2) + "\n");

  const tally = new Map<string, number>();
  for (const r of rows) tally.set(r.gemini_gloss || "(no proposal)", (tally.get(r.gemini_gloss || "(no proposal)") ?? 0) + 1);
  console.log(`\n${rows.length} occurrences in ${sentences.length} sentences -> ${OUT_FILE}`);
  if (failed) console.log(`${failed} sentences got no proposal -- rerun to retry just those`);
  console.log(`would change: ${rows.filter((r) => r.final_gloss !== r.current_gloss).length}`);
  for (const [gloss, n] of [...tally].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${gloss}`);
}

async function apply(c: Client, file: string) {
  const entries = JSON.parse(readFileSync(file, "utf8")) as Row[];
  if (!Array.isArray(entries)) throw new Error(`${file} is not a JSON array of review entries`);
  for (const [i, e] of entries.entries()) {
    if (!e.component_id) throw new Error(`entry ${i} (${e.yoruba ?? "?"}) has no component_id`);
  }

  const edits = entries
    .filter((e) => e.skip !== true)
    .map((e) => ({
      id: e.component_id,
      current: e.current_gloss ?? "",
      final: String(e.final_gloss ?? "").trim(),
      yoruba: e.yoruba
    }))
    .filter((e) => e.final && e.final !== e.current);

  const before = (await c.query(`SELECT id, gloss FROM sentence_components WHERE id = ANY($1)`, [edits.map((e) => e.id)])).rows;
  mkdirSync(SCRATCH, { recursive: true });
  const backup = path.join(SCRATCH, `ni-gloss-backup-${Date.now()}.json`);
  writeFileSync(backup, JSON.stringify(before, null, 2));

  let written = 0;
  const stale: string[] = [];
  await c.query("BEGIN");
  try {
    for (const e of edits) {
      const res = await c.query(
        `UPDATE sentence_components SET gloss = $1
         WHERE id = $2 AND COALESCE(gloss, '') = $3`,
        [e.final, e.id, e.current]
      );
      if (res.rowCount === 1) written++;
      else stale.push(`${e.yoruba}  (${e.id})`);
    }
    await c.query("COMMIT");
  } catch (err) {
    await c.query("ROLLBACK");
    throw err;
  }

  console.log(`${written} glosses written; previous values saved to ${backup}`);
  if (stale.length) {
    console.log(`${stale.length} skipped because the stored gloss changed since the export:`);
    for (const s of stale) console.log(`  ${s}`);
  }
}

async function connect(): Promise<Client> {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  // Without a listener a server-side disconnect is an unhandled 'error' event that kills the
  // process; with one, the pending query rejects and the caller's error handling runs.
  c.on("error", (err) => console.error(`database connection error: ${err.message}`));
  await c.connect();
  return c;
}

async function main() {
  if (APPLY_AT < 0) return propose();
  if (!APPLY_FILE) throw new Error("--apply needs the reviewed CSV path");
  const c = await connect();
  try {
    await apply(c, APPLY_FILE);
  } finally {
    await c.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
