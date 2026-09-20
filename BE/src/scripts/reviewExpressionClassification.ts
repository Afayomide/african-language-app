/**
 * Classify every taught multi-word expression: a real set phrase, a pattern, or a sentence.
 *
 * An expression costs a teaching slot -- its own card in stage 1 and 4-5 exercises -- so a
 * phrase that is merely its parts joined (`Nne m` = "mother" + "my", `Mo fẹ́` = "I" + "want")
 * spends a lesson on something the learner already has the pieces for, and then never recurs
 * as a unit: `mu omi` is inside 30 sentences and linked to none of them.
 *
 *   npx tsx src/scripts/reviewExpressionClassification.ts              # both languages
 *   npx tsx src/scripts/reviewExpressionClassification.ts --language igbo
 *
 * Read-only: it writes scratch/expression-classification.json for review and changes nothing.
 * Each entry carries Gemini's verdict and reason plus the numbers the decision rests on, so a
 * wrong call is easy to spot and correct by editing `final` in the file.
 */
import "dotenv/config";
import { Client } from "pg";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { generateRawText } from "../services/llm/geminiClient.js";

const SCRATCH = path.resolve("scratch");
const OUT_FILE = path.join(SCRATCH, "expression-classification.json");
const CACHE_FILE = path.join(SCRATCH, "expression-classification-cache.json");
const CONCURRENCY = 2;

const LANGUAGES = (() => {
  const at = process.argv.indexOf("--language");
  return at < 0 ? ["yoruba", "igbo"] : [String(process.argv[at + 1] || "yoruba")];
})();

type Verdict = "expression" | "pattern" | "sentence" | "";
type Final = Verdict | "remove";

type Row = {
  language: string;
  text: string;
  english: string;
  parts: string;
  taught_in: string;
  linked_sentences: number;
  sentences_containing_it: number;
  verdict: Verdict;
  reason: string;
  final: Final;
  overridden?: string;
  id: string;
};

/**
 * Where the human reviewer overruled Gemini, and why. Gemini judges compositionality well but
 * does not know which compositional phrases a speaker has stopped hearing as composed: `Bàbá
 * àgbà` is "elder father" by its parts and "grandfather" to anyone who speaks Yoruba. Keyed by
 * `language|text` because case distinguishes real rows (`Èló ni?` and `èló ni` are both taught).
 */
const OVERRIDES: Record<string, { final: Final; why: string }> = {
  // Yoruba, reviewed. Igbo has not been reviewed yet, so its rows still carry Gemini's verdict
  // -- `dị mma`, `dị njọ` and `Daalụ maka` are the ones to look at first when it is.
  "yoruba|Bàbá àgbà": { final: "expression", why: "the word for grandfather, not a description" },
  "yoruba|ibi iṣẹ́": { final: "expression", why: "compound noun: workplace" },
  "yoruba|ò sí": { final: "expression", why: "fixed negative existential: is not there" },
  "yoruba|Rárá, mi ò": { final: "remove", why: "not a unit of the language at all: two utterances joined by a comma" }
};

function buildPrompt(input: { language: string; text: string; english: string; parts: string }) {
  return [
    `You are auditing a ${input.language} language course. Each multi-word item below is currently`,
    "TAUGHT as a vocabulary item: it gets its own card and its own exercises, using a slot that",
    "could teach a new word. Decide whether it deserves that.",
    "",
    `Item: ${input.text}`,
    `Taught as meaning: ${input.english}`,
    `Its parts: ${input.parts}`,
    "",
    "Answer with exactly one of:",
    '- "expression": a fixed set phrase whose meaning is NOT simply its parts joined, or a',
    "  greeting or formula a learner must memorise as one unit.",
    '- "pattern": its meaning IS its parts joined. The learner should be taught the parts and',
    "  meet this combination in sentences. Possessives (mother + my), verb + object",
    "  (drink + water) and aspect + verb (is + going) are patterns.",
    '- "sentence": a complete utterance. Anything of the shape "X ni" in Yoruba is a sentence',
    '  ("Èló ni?" = "How much is it?", "Bàbá ni" = "It is Dad"), with ONE exception:',
    '  "Bẹ́ẹ̀ ni" is the fixed word for "yes" and is an expression.',
    "",
    "Judge the language, not the English. Do not change or comment on the spelling.",
    "",
    "Respond with JSON only, no prose, no code fences:",
    '{"verdict":"expression|pattern|sentence","reason":"<under 15 words>"}'
  ].join("\n");
}

function parseVerdict(raw: string) {
  const cleaned = raw.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error(`no JSON in response: ${raw.slice(0, 120)}`);
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  const verdict = String(parsed.verdict || "").toLowerCase();
  if (!["expression", "pattern", "sentence"].includes(verdict)) throw new Error(`bad verdict: ${parsed.verdict}`);
  return { verdict: verdict as Row["verdict"], reason: String(parsed.reason || "").trim() };
}

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  c.on("error", (err) => console.error(`database connection error: ${err.message}`));
  await c.connect();
  let items: any[] = [];
  try {
    items = (await c.query(
      `SELECT e.id, e.language, e.text, e.translations[1] AS english,
              (SELECT string_agg(ec.text_snapshot || '=' ||
                     COALESCE((SELECT w.translations[1] FROM words w WHERE w.id = ec.ref_id), '?'), ' + '
                     ORDER BY ec.order_index)
                 FROM expression_components ec WHERE ec.expression_id = e.id) AS parts,
              (SELECT string_agg(DISTINCT u.title || ' / ' || l.title, '; ')
                 FROM lesson_content_items lci
                 JOIN lessons l ON l.id = lci.lesson_id AND l.is_deleted = false
                 JOIN units u ON u.id = l.unit_id
                WHERE lci.content_id = e.id AND lci.role = 'introduce') AS taught_in,
              (SELECT count(DISTINCT sc.sentence_id)::int FROM sentence_components sc WHERE sc.ref_id = e.id) AS linked,
              (SELECT count(*)::int FROM sentences s WHERE s.language = e.language AND s.is_deleted = false
                 AND lower(s.text) LIKE '%' || lower(e.text) || '%') AS in_text
       FROM expressions e
       WHERE e.language = ANY($1) AND e.is_deleted = false AND position(' ' IN btrim(e.text)) > 0
         AND EXISTS (SELECT 1 FROM lesson_content_items lci JOIN lessons l ON l.id = lci.lesson_id AND l.is_deleted = false
                      WHERE lci.content_id = e.id AND lci.role = 'introduce')
       ORDER BY e.language, e.text`,
      [LANGUAGES]
    )).rows;
  } finally {
    await c.end();
  }

  mkdirSync(SCRATCH, { recursive: true });
  const cache: Record<string, { verdict: Row["verdict"]; reason: string }> = existsSync(CACHE_FILE)
    ? JSON.parse(readFileSync(CACHE_FILE, "utf8"))
    : {};

  const rows: Row[] = [];
  let failed = 0;
  let next = 0;
  async function work() {
    while (next < items.length) {
      const item = items[next++];
      let verdict: Row["verdict"] = "";
      let reason = "";
      const cached = cache[item.id];
      if (cached) {
        verdict = cached.verdict;
        reason = cached.reason;
      } else {
        try {
          const answer = parseVerdict(
            await generateRawText(
              buildPrompt({ language: item.language, text: item.text, english: item.english, parts: item.parts || "unknown" }),
              "classifyExpression"
            )
          );
          verdict = answer.verdict;
          reason = answer.reason;
          cache[item.id] = answer;
          writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
        } catch (err) {
          reason = `NO VERDICT: ${err instanceof Error ? err.message : String(err)}`;
          failed++;
        }
      }
      const override = OVERRIDES[`${item.language}|${item.text}`];
      rows.push({
        language: item.language,
        text: item.text,
        english: String(item.english || ""),
        parts: item.parts || "",
        taught_in: item.taught_in || "",
        linked_sentences: item.linked,
        sentences_containing_it: item.in_text,
        verdict,
        reason,
        final: override ? override.final : verdict,
        ...(override ? { overridden: override.why } : {}),
        id: item.id
      });
      process.stdout.write(`\r${rows.length}/${items.length} classified, ${failed} failed`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, work));
  process.stdout.write("\n");

  const order = { expression: 0, pattern: 1, sentence: 2, remove: 3, "": 4 } as const;
  rows.sort((a, b) => a.language.localeCompare(b.language) || order[a.final] - order[b.final] || a.text.localeCompare(b.text));
  writeFileSync(OUT_FILE, JSON.stringify(rows, null, 2) + "\n");

  for (const language of LANGUAGES) {
    const set = rows.filter((row) => row.language === language);
    const count = (final: Final) => set.filter((row) => row.final === final).length;
    console.log(`\n${language}: ${set.length} taught multi-word items`);
    console.log(`   keep as expression: ${count("expression")}`);
    console.log(`   demote to pattern:  ${count("pattern")}`);
    console.log(`   is a sentence:      ${count("sentence")}`);
    console.log(`   not a unit at all:  ${count("remove")}`);
    const overruled = set.filter((row) => row.overridden);
    if (overruled.length) console.log(`   (${overruled.length} overruled by review: ${overruled.map((row) => row.text).join(", ")})`);
  }
  console.log(`\nreview file: ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
