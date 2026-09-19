/**
 * Give the words inside `ni` expressions (`Níbo ni`, `Kí ni`, `Bẹ́ẹ̀ ni`, `Ẹ fún mi ni`, ...)
 * real meanings, via Gemini, for human review before anything is written.
 *
 * Expression components had no gloss column, so a learner opening `Níbo ni` saw its words'
 * dictionary defaults -- `ni` as "am", the first of its 56 translations. Two levels fix that:
 *
 *   expression -> expression_components.gloss: what each word means inside the expression
 *                 itself, for the expression's own card ("Níbo ni" = where + is)
 *   sentence   -> sentence_components.part_glosses: what each word means in ONE sentence,
 *                 because `ni` is "is" in `Níbo ni omi?` but "are" in `Níbo ni o wà?`
 *
 *   npx tsx src/scripts/reviewExpressionNiGlosses.ts             # propose -> scratch/expression-ni-review.json
 *   npx tsx src/scripts/reviewExpressionNiGlosses.ts --limit 5   # the first 5 expressions/sentences only
 *   npx tsx src/scripts/reviewExpressionNiGlosses.ts --apply scratch/expression-ni-review.json
 *
 * Propose mode only reads the database. In the JSON, edit `final_gloss` to correct an entry
 * or set `skip` to true to leave it alone. Apply writes every other entry, but only where the
 * stored value still equals the file's `current_gloss`; anything changed since the export is
 * reported, not overwritten. Previous values are saved to scratch/ first.
 *
 * Needs migration 0002 (expression_components.gloss, sentence_components.part_glosses) for
 * --apply. Propose works without it.
 *
 * The model is asked only for English; a reply that retypes any Yoruba word is discarded.
 */
import "dotenv/config";
import { Client } from "pg";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { generateRawText } from "../services/llm/geminiClient.js";
import { parseGlossResponse, validateGlosses, type GlossRequest } from "../services/llm/componentGloss.js";

const SCRATCH = path.resolve("scratch");
const OUT_FILE = path.join(SCRATCH, "expression-ni-review.json");
// Model answers per prompt, saved as they arrive, so a rerun only asks what is missing.
const CACHE_FILE = path.join(SCRATCH, "expression-ni-cache.json");
// Vertex returns 429 above ~2 concurrent requests on this project's quota.
const CONCURRENCY = 2;

const APPLY_AT = process.argv.indexOf("--apply");
const APPLY_FILE = APPLY_AT < 0 ? "" : String(process.argv[APPLY_AT + 1] || "").trim();
const LIMIT = (() => {
  const at = process.argv.indexOf("--limit");
  if (at < 0) return Infinity;
  const value = Number.parseInt(process.argv[at + 1] || "", 10);
  return Number.isFinite(value) && value > 0 ? value : Infinity;
})();
const argValue = (flag: string) => {
  const at = process.argv.indexOf(flag);
  return at < 0 ? "" : String(process.argv[at + 1] || "").trim();
};
/**
 * Re-ask one expression (its own entry, not its sentences) and print Gemini's raw reply.
 * The answer replaces that expression's cached one; the review file is not rewritten, so
 * rerun without --only to rebuild it.
 *
 *   npx tsx src/scripts/reviewExpressionNiGlosses.ts --only "Níbo ni" --english "where is"
 *
 * --english overrides the stored first translation, for an expression whose list leads with
 * the wrong meaning.
 */
const ONLY = argValue("--only");
const ENGLISH = argValue("--english");

type Level = "expression" | "sentence";

// Reader-facing fields first; the ids apply needs come last.
type Entry = {
  level: Level;
  expression: string;
  /** The expression's own text (level expression) or the sentence using it (level sentence). */
  yoruba: string;
  english: string;
  word: string;
  /** What the learner sees today: the word row's first translation. */
  shown_now: string;
  current_gloss: string;
  gemini_gloss: string;
  reason: string;
  final_gloss: string;
  skip: boolean;
  /** expression_components.id (level expression) or sentence_components.id (level sentence). */
  component_id: string;
  /** Position of the word inside the expression, in component order. */
  part_index: number;
};

type Cached = { glosses: Array<{ index: number; gloss: string; reason: string }> };

const NI_RULES = [
  'How to label "ni":',
  '- "ni" carries the linking verb. Label it with the "am", "is" or "are" the English uses here,',
  "  agreeing with the English subject.",
  '- After a question word (níbo, kí, ta, èló, báwo) "ni" takes the "is"/"are" label even when',
  '  "wà" is also in the sentence: "wà" means "exist / is present".',
  '- If the English has no am/is/are for "ni" to carry ("Kí ni o fẹ́?" = "What do you want?"),',
  '  label it "(focus marker)".',
  '- After "fún" ("fún mi ni omi" = "give me water"), label it "(object marker)".'
];

function buildPrompt(input: GlossRequest, level: Level, expression: string): string {
  return [
    "You are glossing Yoruba for a language-learning app. A learner opens the expression",
    `"${expression}" and sees each of its words with a short English label.`,
    "",
    level === "expression"
      ? `The expression on its own: ${input.sentence}`
      : `It appears in this sentence: ${input.sentence}`,
    `English meaning: ${input.translation}`,
    "",
    "Words, in order:",
    ...input.components.map((c) => `  [${c.index}] ${c.text}`),
    "",
    `Label ONLY the words at: ${input.targets.join(", ")} (the words of "${expression}")`,
    "",
    "Give the meaning each word carries HERE, literally, not the meaning of the whole expression.",
    'A question word gets its own meaning ("níbo" = "where", "kí" = "what", "ta" = "who",',
    '"èló" = "how much", "báwo" = "how").',
    "",
    ...NI_RULES,
    "",
    "- Keep each label short. Never restate the sentence.",
    "- Do NOT change, correct or retype the Yoruba. Copy each word exactly as given.",
    "",
    "Respond with JSON only, no prose, no code fences:",
    '{"glosses":[{"index":0,"word":"<the word copied exactly>","gloss":"<label>","reason":"<under 12 words>"}]}'
  ].join("\n");
}

async function connect(): Promise<Client> {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  c.on("error", (err) => console.error(`database connection error: ${err.message}`));
  await c.connect();
  return c;
}

async function hasColumn(c: Client, table: string, column: string): Promise<boolean> {
  const res = await c.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
    [table, column]
  );
  return (res.rowCount ?? 0) > 0;
}

type Job = {
  key: string;
  level: Level;
  expression: string;
  request: GlossRequest;
  /** Maps each target index in the request to its expression part. */
  parts: Array<{ target: number; partIndex: number; word: string; shownNow: string; current: string; componentId: string }>;
};

async function propose() {
  // Read everything up front and disconnect: model calls take minutes under rate limiting,
  // and the Neon pooler drops a connection left idle that long.
  const c = await connect();
  const jobs: Job[] = [];
  try {
    const hasExprGloss = await hasColumn(c, "expression_components", "gloss");
    const hasPartGlosses = await hasColumn(c, "sentence_components", "part_glosses");

    const ni = await c.query(
      `SELECT id FROM words WHERE language = 'yoruba' AND text_normalized = 'ni' AND is_deleted = false`
    );
    if (ni.rowCount !== 1) throw new Error(`expected one active Yoruba "ni" word row, found ${ni.rowCount}`);
    const niId = ni.rows[0].id;

    const expressions = (await c.query(
      `SELECT e.id, e.text, e.translations FROM expressions e
       WHERE e.language = 'yoruba' AND e.is_deleted = false AND EXISTS (
         SELECT 1 FROM expression_components ec WHERE ec.expression_id = e.id AND ec.type = 'word' AND ec.ref_id = $1)
       ORDER BY e.text`,
      [niId]
    )).rows;
    const parts = (await c.query(
      `SELECT ec.id, ec.expression_id, ec.order_index, ec.text_snapshot, ${hasExprGloss ? "ec.gloss" : "NULL AS gloss"},
              w.translations
       FROM expression_components ec LEFT JOIN words w ON ec.type = 'word' AND w.id = ec.ref_id
       WHERE ec.expression_id = ANY($1) ORDER BY ec.expression_id, ec.order_index`,
      [expressions.map((e) => e.id)]
    )).rows;
    const partsOf = (expressionId: string) => parts.filter((p) => p.expression_id === expressionId);

    // Level 1: each expression on its own.
    for (const e of expressions) {
      const list = partsOf(e.id);
      jobs.push({
        key: `expression:${e.id}`,
        level: "expression",
        expression: e.text,
        request: {
          sentence: e.text,
          translation: String(e.translations?.[0] || ""),
          components: list.map((p, index) => ({ index, text: p.text_snapshot })),
          targets: list.map((_, index) => index)
        },
        parts: list.map((p, index) => ({
          target: index,
          partIndex: index,
          word: p.text_snapshot,
          shownNow: String(p.translations?.[0] || ""),
          current: p.gloss ?? "",
          componentId: p.id
        }))
      });
    }

    // Level 2: each sentence that uses one of those expressions. The sentence's words are
    // listed with the expression expanded into its own words, which are the targets.
    const uses = (await c.query(
      `SELECT sc.id, sc.sentence_id, sc.ref_id AS expression_id, ${hasPartGlosses ? "sc.part_glosses" : "NULL AS part_glosses"},
              s.text, s.translations
       FROM sentence_components sc JOIN sentences s ON s.id = sc.sentence_id AND s.is_deleted = false
       WHERE sc.type = 'expression' AND sc.ref_id = ANY($1)
       ORDER BY s.text`,
      [expressions.map((e) => e.id)]
    )).rows;
    const sentenceComps = (await c.query(
      `SELECT id, sentence_id, type, ref_id, order_index, text_snapshot FROM sentence_components
       WHERE sentence_id = ANY($1) ORDER BY sentence_id, order_index`,
      [[...new Set(uses.map((u) => u.sentence_id))]]
    )).rows;

    for (const u of uses) {
      const expression = expressions.find((e) => e.id === u.expression_id)!;
      const exprParts = partsOf(u.expression_id);
      const words: Array<{ index: number; text: string }> = [];
      const jobParts: Job["parts"] = [];
      for (const comp of sentenceComps.filter((sc) => sc.sentence_id === u.sentence_id)) {
        if (comp.id === u.id) {
          exprParts.forEach((p, partIndex) => {
            jobParts.push({
              target: words.length,
              partIndex,
              word: p.text_snapshot,
              shownNow: String(p.translations?.[0] || ""),
              current: String(u.part_glosses?.[partIndex] ?? ""),
              componentId: u.id
            });
            words.push({ index: words.length, text: p.text_snapshot });
          });
        } else {
          words.push({ index: words.length, text: comp.text_snapshot });
        }
      }
      jobs.push({
        key: `sentence:${u.id}`,
        level: "sentence",
        expression: expression.text,
        request: {
          sentence: u.text,
          translation: String(u.translations?.[0] || ""),
          components: words,
          targets: jobParts.map((p) => p.target)
        },
        parts: jobParts
      });
    }
  } finally {
    await c.end();
  }

  mkdirSync(SCRATCH, { recursive: true });
  const cache: Record<string, Cached> = existsSync(CACHE_FILE) ? JSON.parse(readFileSync(CACHE_FILE, "utf8")) : {};

  if (ONLY) {
    const job = jobs.find((j) => j.level === "expression" && j.expression === ONLY);
    if (!job) throw new Error(`no expression "${ONLY}" among the ni expressions`);
    if (ENGLISH) job.request.translation = ENGLISH;
    console.log(`${job.expression}  (English given to Gemini: "${job.request.translation}")\n`);
    const raw = await generateRawText(buildPrompt(job.request, job.level, job.expression), "reviewExpressionNiGlosses");
    console.log(`Gemini's raw reply:\n${raw}\n`);
    const parsed = parseGlossResponse(raw) as Array<{ index: number; word: string; gloss: string; reason?: string }>;
    const accepted = validateGlosses(job.request, parsed, { allowWholeTranslation: true });
    const reasons = new Map(parsed.map((g) => [Number(g.index), String(g.reason || "").trim()]));
    cache[job.key] = { glosses: accepted.map((g) => ({ index: g.index, gloss: g.gloss, reason: reasons.get(g.index) || "" })) };
    writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
    console.log("Accepted:", accepted.map((g) => `${job.request.components[g.index].text} = ${g.gloss}`).join(", "));
    return;
  }

  const selected = jobs.slice(0, LIMIT);

  const entries: Entry[] = [];
  let failed = 0;
  let next = 0;

  async function work() {
    while (next < selected.length) {
      const job = selected[next++];
      let proposals = new Map<number, { gloss: string; reason: string }>();
      let error = "";
      const cached = cache[job.key];
      if (cached) {
        proposals = new Map(cached.glosses.map((g) => [g.index, { gloss: g.gloss, reason: g.reason }]));
      } else {
        try {
          const raw = await generateRawText(buildPrompt(job.request, job.level, job.expression), "reviewExpressionNiGlosses");
          const parsed = parseGlossResponse(raw) as Array<{ index: number; word: string; gloss: string; reason?: string }>;
          const accepted = validateGlosses(job.request, parsed, { allowWholeTranslation: job.level === "expression" });
          const reasons = new Map(parsed.map((g) => [Number(g.index), String(g.reason || "").trim()]));
          const glosses = accepted.map((g) => ({ index: g.index, gloss: g.gloss, reason: reasons.get(g.index) || "" }));
          proposals = new Map(glosses.map((g) => [g.index, { gloss: g.gloss, reason: g.reason }]));
          cache[job.key] = { glosses };
          writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
        } catch (err) {
          error = err instanceof Error ? err.message : String(err);
          failed++;
        }
      }

      for (const part of job.parts) {
        const proposal = proposals.get(part.target);
        entries.push({
          level: job.level,
          expression: job.expression,
          yoruba: job.request.sentence,
          english: job.request.translation,
          word: part.word,
          shown_now: part.shownNow,
          current_gloss: part.current,
          gemini_gloss: proposal?.gloss ?? "",
          reason: proposal ? proposal.reason : `NO PROPOSAL: ${error || "model skipped this word"}`,
          final_gloss: proposal?.gloss ?? part.current,
          skip: false,
          component_id: part.componentId,
          part_index: part.partIndex
        });
      }
      process.stdout.write(`\r${next}/${selected.length} asked, ${failed} failed`);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, work));
  process.stdout.write("\n");

  // Expression-level entries first, then sentences grouped by expression.
  entries.sort(
    (a, b) =>
      (a.level === b.level ? 0 : a.level === "expression" ? -1 : 1) ||
      a.expression.localeCompare(b.expression) ||
      a.yoruba.localeCompare(b.yoruba) ||
      a.part_index - b.part_index
  );
  writeFileSync(OUT_FILE, JSON.stringify(entries, null, 2) + "\n");

  const niEntries = entries.filter((e) => e.word.toLowerCase() === "ni");
  const tally = new Map<string, number>();
  for (const e of niEntries) tally.set(e.gemini_gloss || "(no proposal)", (tally.get(e.gemini_gloss || "(no proposal)") ?? 0) + 1);
  console.log(`\n${entries.length} word labels (${selected.length} prompts) -> ${OUT_FILE}`);
  if (failed) console.log(`${failed} prompts got no proposal -- rerun to retry just those`);
  console.log(`labels for "ni":`);
  for (const [gloss, n] of [...tally].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${gloss}`);
}

async function apply(file: string) {
  const entries = JSON.parse(readFileSync(file, "utf8")) as Entry[];
  if (!Array.isArray(entries)) throw new Error(`${file} is not a JSON array of review entries`);
  const live = entries.filter((e) => e.skip !== true && String(e.final_gloss ?? "").trim());

  const c = await connect();
  try {
    if (!(await hasColumn(c, "expression_components", "gloss")) || !(await hasColumn(c, "sentence_components", "part_glosses"))) {
      throw new Error("migration 0002 has not been applied: expression_components.gloss / sentence_components.part_glosses missing");
    }

    const exprEdits = live.filter((e) => e.level === "expression" && e.final_gloss.trim() !== e.current_gloss);
    const bySentenceComp = new Map<string, Entry[]>();
    for (const e of live.filter((x) => x.level === "sentence")) {
      const list = bySentenceComp.get(e.component_id) ?? [];
      list.push(e);
      bySentenceComp.set(e.component_id, list);
    }

    const before = {
      expression_components: (await c.query(`SELECT id, gloss FROM expression_components WHERE id = ANY($1)`, [exprEdits.map((e) => e.component_id)])).rows,
      sentence_components: (await c.query(`SELECT id, part_glosses FROM sentence_components WHERE id = ANY($1)`, [[...bySentenceComp.keys()]])).rows
    };
    mkdirSync(SCRATCH, { recursive: true });
    const backup = path.join(SCRATCH, `expression-ni-backup-${Date.now()}.json`);
    writeFileSync(backup, JSON.stringify(before, null, 2));

    let written = 0;
    const stale: string[] = [];
    await c.query("BEGIN");
    try {
      for (const e of exprEdits) {
        const res = await c.query(
          `UPDATE expression_components SET gloss = $1 WHERE id = $2 AND COALESCE(gloss, '') = $3`,
          [e.final_gloss.trim(), e.component_id, e.current_gloss]
        );
        if (res.rowCount === 1) written++;
        else stale.push(`${e.expression}: ${e.word}`);
      }

      for (const [componentId, list] of bySentenceComp) {
        const row = before.sentence_components.find((r) => r.id === componentId);
        const stored: string[] = Array.isArray(row?.part_glosses) ? row.part_glosses : [];
        if (list.some((e) => String(stored[e.part_index] ?? "") !== e.current_gloss)) {
          stale.push(`${list[0].yoruba}: ${list[0].expression}`);
          continue;
        }
        const size = Math.max(stored.length, ...list.map((e) => e.part_index + 1));
        const next = Array.from({ length: size }, (_, i) => String(stored[i] ?? ""));
        for (const e of list) next[e.part_index] = e.final_gloss.trim();
        if (next.every((v, i) => v === String(stored[i] ?? ""))) continue;
        await c.query(`UPDATE sentence_components SET part_glosses = $1 WHERE id = $2`, [next, componentId]);
        written += list.length;
      }
      await c.query("COMMIT");
    } catch (err) {
      await c.query("ROLLBACK");
      throw err;
    }

    console.log(`${written} word labels written; previous values saved to ${backup}`);
    if (stale.length) {
      console.log(`${stale.length} skipped because the stored value changed since the export:`);
      for (const s of stale) console.log(`  ${s}`);
    }
  } finally {
    await c.end();
  }
}

async function main() {
  if (APPLY_AT < 0) return propose();
  if (!APPLY_FILE) throw new Error("--apply needs the reviewed JSON path");
  await apply(APPLY_FILE);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
