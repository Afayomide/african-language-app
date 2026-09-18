/**
 * Fill the empty `explanation` and `pronunciation` on expression rows.
 *
 * Every expression in the database has both fields empty, in both languages. It is not a
 * failure -- nothing writes them and then loses them. Expressions reach the corpus through
 * `ensureExpression` / SentenceDraftPersistenceService, which build them out of SENTENCE
 * COMPONENTS, and the component schema the sentence model answers with is
 * `{type, text, translations, fixed, role}`. There is no explanation field, so the model is
 * never asked for one and the persistence hardcodes "". The two paths that do carry an
 * explanation -- AiExpressionOrchestrator and LessonRefactorService -- are not on the unit
 * generation route.
 *
 * The learner still sees something, which is why this went unnoticed: with no explanation the
 * player substitutes a canned per-language line (StaticStudyBlocks.tsx buildContextSubtitle),
 * and the Yoruba one asserts "Used in daily greetings after sunrise and in relaxed first
 * encounters" on every expression -- including `Bàbá àgbà` (grandfather) and `ń lọ` (is going).
 *
 * This calls `enhanceExpression`, the same prompt the generator post-pass uses, so a
 * backfilled row and a freshly generated one are written by one prompt rather than two that
 * drift. It cannot change meaning: the prompt is told not to alter the phrase text or its
 * translations, and only `explanation` and `pronunciation` are written back. `difficulty`,
 * `examples`, `translations` and `text` are never touched.
 *
 * TARGET-LANGUAGE SAFETY. The model writes English prose ABOUT an expression; it never
 * rewrites the expression. No diacritic can move. But "when to use this" is still a claim
 * about the language, so the dry run writes every proposal to a file for review before any of
 * it reaches the corpus -- read the Yoruba ones before applying them.
 *
 *   dry run  : node --import tsx src/scripts/backfillExpressionExplanations.ts --language=igbo
 *   review   : proposals land in scratch/expression-explanations.<language>.json
 *   apply    : ... --language=igbo --apply --from=scratch/expression-explanations.igbo.json
 *
 * Apply with --from so what lands in the corpus is exactly what was reviewed. Without it the
 * apply run calls the model again and writes different prose than the dry run showed, which
 * makes reviewing the Yoruba proposals pointless.
 *
 * `pronunciation` is opt-in via --with-pronunciation and off by default. Each row is its own
 * call, so the same word comes back spelled three ways across three expressions -- `ọma` as
 * "aw-mah", "AW-ma" and "oh-mah" -- while the word row already carries one respelling. Until
 * pronunciation is generated per word and reused, writing it here only adds contradictions.
 *
 * WORDS TOO. `--type=word` does the same for words, which are empty for the same reason:
 * `upsertWordFromSentenceComponent` mints a word from a sentence component, and a component
 * carries no explanation field. A word that was a PLANNED TARGET went through the word prompt
 * and already has one -- which is why `kedu` is empty while the five words before it are not,
 * and why all 25 empty Yoruba words are `part_of_speech = 'unknown'`.
 *
 * Flags: --type=<expression|word>  --language=<igbo|yoruba|hausa|pidgin>  --limit=<n>
 *        --apply  --from=<file>  --with-pronunciation
 */
import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Client } from "pg";
import { getLlmClient } from "../services/llm/index.js";
import type { Language, Level } from "../domain/entities/Lesson.js";

const APPLY = process.argv.includes("--apply");
const WITH_PRONUNCIATION = process.argv.includes("--with-pronunciation");
const FROM = (process.argv.find((arg) => arg.startsWith("--from=")) || "").split("=")[1] || "";
const LANGUAGE = (process.argv.find((arg) => arg.startsWith("--language=")) || "").split("=")[1] || "";
const LIMIT = Number((process.argv.find((arg) => arg.startsWith("--limit=")) || "").split("=")[1] || 0);
const TYPE = ((process.argv.find((arg) => arg.startsWith("--type=")) || "").split("=")[1] || "expression").trim();

if (TYPE !== "expression" && TYPE !== "word") {
  throw new Error(`--type must be "expression" or "word", got ${JSON.stringify(TYPE)}`);
}

/** words carry no `difficulty`-free level either, so both tables read the same way. */
const TABLE = TYPE === "word" ? "words" : "expressions";

type Proposal = {
  id: string;
  language: string;
  text: string;
  translations: string[];
  explanation: string;
  pronunciation: string;
  skipped?: string;
};

type Row = {
  id: string;
  text: string;
  translations: string[];
  language: string;
  difficulty: number;
  explanation: string;
  pronunciation: string;
};

/**
 * Expressions carry `difficulty`, not `level`, and the prompt wants a level for its pedagogy
 * rules. The introducing lesson would be the truer source, but an expression can be
 * introduced by several lessons or none, so the row's own difficulty is the one answer that
 * always exists.
 */
function levelFromDifficulty(difficulty: number): Level {
  if (difficulty <= 1) return "beginner";
  if (difficulty === 2) return "intermediate";
  return "advanced";
}

/** Reject an "explanation" that is just the translation echoed back, or too thin to teach. */
function isUsableExplanation(value: string, row: Row): boolean {
  const trimmed = String(value || "").trim();
  if (trimmed.length < 12) return false;
  const normalized = trimmed.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  if (normalized === row.text.toLowerCase()) return false;
  return !row.translations.some((item) => String(item || "").trim().toLowerCase() === trimmed.toLowerCase());
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const { rows } = await client.query<Row>(
      `select id, text, translations, language::text as language, difficulty, explanation, pronunciation
       from ${TABLE}
       where is_deleted = false
         and (explanation = '' or pronunciation = '')
         and ($1 = '' or language::text = $1)
       order by language, created_at
       ${LIMIT > 0 ? `limit ${LIMIT}` : ""}`,
      [LANGUAGE]
    );

    if (rows.length === 0) {
      console.log("nothing to backfill.");
      return;
    }

    console.log(`${rows.length} ${TYPE}(s) with an empty explanation or pronunciation\n`);

    // --from replays proposals that were already reviewed. No model is called, so what lands
    // in the corpus is exactly the text that was read and approved.
    if (FROM) {
      const reviewed = JSON.parse(readFileSync(FROM, "utf8")) as Proposal[];
      const pending = new Set(rows.map((row) => row.id));
      const replayable = reviewed.filter((item) => !item.skipped && pending.has(item.id));
      console.log(`replaying ${replayable.length} reviewed proposal(s) from ${FROM}`);
      for (const item of replayable) {
        console.log(`  ${item.language}  ${item.text}`);
        console.log(`    explanation: ${item.explanation}`);
      }
      if (!APPLY) {
        console.log("dry run -- nothing written.");
        return;
      }
      await write(client, replayable);
      return;
    }

    const llm = getLlmClient();
    // enhancePhrase and enhanceExpression share buildEnhancePrompt, so both follow the same
    // LLM_EXPLANATION_PROVIDER routing and a word is never explained by a different model
    // than an expression.
    const enhance = TYPE === "word" ? llm.enhancePhrase.bind(llm) : llm.enhanceExpression.bind(llm);

    const proposals: Proposal[] = [];

    for (const row of rows) {
      let result: Awaited<ReturnType<typeof enhance>>;
      try {
        result = await enhance({
          text: row.text,
          translations: row.translations,
          language: row.language as Language,
          level: levelFromDifficulty(Number(row.difficulty || 1))
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.log(`  SKIP  ${row.text} -- ${reason}`);
        proposals.push({ ...row, explanation: "", pronunciation: "", skipped: reason });
        continue;
      }

      const explanation = String(result?.explanation || "").trim();
      const pronunciation = String(result?.pronunciation || "").trim();

      if (row.explanation === "" && !isUsableExplanation(explanation, row)) {
        console.log(`  SKIP  ${row.text} -- unusable explanation: ${JSON.stringify(explanation)}`);
        proposals.push({ ...row, explanation, pronunciation, skipped: "unusable explanation" });
        continue;
      }

      proposals.push({
        id: row.id,
        language: row.language,
        text: row.text,
        translations: row.translations,
        explanation,
        pronunciation
      });

      console.log(`  ${row.language}  ${row.text}  (${row.translations[0] || ""})`);
      console.log(`    explanation  : ${explanation}`);
      console.log(`    pronunciation: ${pronunciation || "(none returned)"}\n`);
    }

    // The model is part of the filename so two runs can be compared side by side instead of
    // one overwriting the other. It reads the model that actually answered -- which is
    // explanationModelName when LLM_EXPLANATION_PROVIDER routed this call away from the bulk
    // model -- not the env var, so the name on the file is the name that wrote the prose.
    const model = (llm.explanationModelName || llm.modelName || "unknown").replace(/[^a-z0-9._-]+/gi, "-");
    const outPath = `scratch/${TYPE}-explanations.${LANGUAGE || "all"}.${model}.json`;
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(proposals, null, 2), "utf8");
    console.log(`proposals written to ${outPath}`);

    const writable = proposals.filter((item) => !item.skipped);

    if (!APPLY) {
      console.log(`\ndry run -- nothing written. ${writable.length} row(s) would be updated.`);
      console.log("Read the file above, then re-run with --apply.");
      return;
    }

    let written = 0;
    for (const item of writable) {
      // coalesce, not overwrite: a row that already has one of the two fields keeps it.
      const { rowCount } = await client.query(
        `update expressions
         set explanation = case when explanation = '' then $1 else explanation end,
             pronunciation = case when pronunciation = '' then $2 else pronunciation end,
             updated_at = now()
         where id = $3`,
        [item.explanation, item.pronunciation, item.id]
      );
      written += rowCount || 0;
    }

  } finally {
    await client.end();
  }
}

/**
 * Writes explanation, and pronunciation only under --with-pronunciation. Coalescing rather
 * than overwriting means a row that already carries one of the two keeps what it has.
 */
async function write(client: Client, items: Proposal[]) {
  let written = 0;
  for (const item of items) {
    const { rowCount } = await client.query(
      `update ${TABLE}
       set explanation = case when explanation = '' then $1 else explanation end,
           pronunciation = case when $2 <> '' and pronunciation = '' then $2 else pronunciation end,
           updated_at = now()
       where id = $3`,
      [item.explanation, WITH_PRONUNCIATION ? item.pronunciation : "", item.id]
    );
    written += rowCount || 0;
  }
  console.log(`wrote ${written} ${TYPE}(s)${WITH_PRONUNCIATION ? " with pronunciation" : " (explanation only)"}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
