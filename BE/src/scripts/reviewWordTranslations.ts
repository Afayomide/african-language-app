/**
 * Ask Gemini what a word actually means, and show it against what the course stores.
 *
 * Translation lists in this course grow by accretion -- `wà` carries nineteen entries, `àwọn`
 * eighteen -- because every generation appends whatever it produced. The first entry is what
 * the learner sees on the card, so a list that begins with the wrong sense teaches the wrong
 * sense. This proposes a short ordered list; it writes nothing.
 *
 *   npx tsx src/scripts/reviewWordTranslations.ts Màmá
 *   npx tsx src/scripts/reviewWordTranslations.ts Màmá Ìyá wà àwọn
 */
import "dotenv/config";
import { Client } from "pg";
import { generateRawText } from "../services/llm/geminiClient.js";

const WORDS = process.argv.slice(2).filter((a) => !a.startsWith("--"));

function buildPrompt(input: { text: string; current: string[]; examples: Array<{ text: string; english: string }> }) {
  return [
    `You are auditing the Yoruba word "${input.text}" in a beginner language course.`,
    "",
    `The course currently stores these English translations, in this order: ${JSON.stringify(input.current)}`,
    "The FIRST one is what the learner sees on the vocabulary card.",
    "",
    input.examples.length ? "Sentences in the course that use it:" : "It appears in no sentences.",
    ...input.examples.map((e) => `  ${e.text}  =  ${e.english}`),
    "",
    "Give the correct English translations, best first, as a short ordered list. Rules:",
    "- The first entry must be the single meaning a beginner should learn.",
    "- Include a different sense only if the word genuinely has one, and say what it is.",
    "- Do not list inflected variants of the same meaning as separate entries.",
    "- Do not comment on the Yoruba spelling or its tone marks.",
    "- Say plainly if the word is a familiar/informal form of another word.",
    "",
    "Respond with JSON only, no prose, no code fences:",
    '{"translations":["..."],"note":"<one sentence on register or a second sense, or empty>"}'
  ].join("\n");
}

async function main() {
  if (!WORDS.length) throw new Error("pass one or more words, e.g. Màmá");
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  c.on("error", (err) => console.error(`database connection error: ${err.message}`));
  await c.connect();
  let items: any[] = [];
  try {
    for (const text of WORDS) {
      const row = (
        await c.query(
          `SELECT id, text, translations FROM words WHERE language='yoruba' AND text=$1 LIMIT 1`,
          [text]
        )
      ).rows[0];
      if (!row) {
        console.log(`no word row for ${text}`);
        continue;
      }
      const examples = (
        await c.query(
          `SELECT s.text, s.translations[1] AS english
             FROM sentence_components sc JOIN sentences s ON s.id = sc.sentence_id AND s.is_deleted=false
            WHERE sc.ref_id = $1 ORDER BY s.text LIMIT 10`,
          [row.id]
        )
      ).rows;
      items.push({ ...row, examples });
    }
  } finally {
    await c.end();
  }

  for (const item of items) {
    const raw = await generateRawText(
      buildPrompt({ text: item.text, current: item.translations || [], examples: item.examples }),
      "reviewWordTranslations"
    );
    const cleaned = raw.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    let parsed: any = {};
    try {
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      console.log(`\n${item.text}: could not parse the response:\n${raw.slice(0, 300)}`);
      continue;
    }
    console.log(`\n=== ${item.text} ===`);
    console.log(`stored  (${(item.translations || []).length}): ${JSON.stringify(item.translations)}`);
    console.log(`gemini  (${(parsed.translations || []).length}): ${JSON.stringify(parsed.translations)}`);
    if (parsed.note) console.log(`note: ${parsed.note}`);
    if (item.examples.length) {
      console.log("used in:");
      item.examples.slice(0, 5).forEach((e: any) => console.log(`   ${e.text}  =  ${e.english}`));
    }
  }
  console.log("\nnothing was written -- this is a proposal for review.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
