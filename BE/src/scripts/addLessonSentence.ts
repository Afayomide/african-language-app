/**
 * Add one hand-written sentence to one lesson, through the same persistence generation uses.
 *
 * A generated lesson can be short a sentence its plan asked for -- `Ẹ káàárọ̀, èló ni oúnjẹ
 * yìí?` was dropped because a phrase row matched it -- and regenerating the lesson to add one
 * line throws away the rest. This takes the sentence as a JSON draft (text, translation,
 * components with their glosses, and a per-word meaning map), creates the row with its
 * components, links it to the lesson as practice, and stops there. Every component is
 * persisted as `support`, so the lesson introduces nothing new; a word that does not exist
 * yet is refused rather than created. Run the append script afterwards for its exercises.
 *
 *   npx tsx src/scripts/addLessonSentence.ts --lesson <id> --draft scratch/draft.json [--apply]
 *
 * draft.json: { "text", "translations": [..], "components": [{ "type", "text", "translations" }],
 *              "meaningSegments": [{ "text", "componentIndexes": [..] }] }
 */
import "dotenv/config";
import { readFileSync } from "fs";
import { pool } from "../infrastructure/db/drizzle/client.js";
import { SentenceDraftPersistenceService } from "../application/services/SentenceDraftPersistenceService.js";
import type { LlmGeneratedSentence } from "../services/llm/types.js";
import { DrizzleLessonRepository } from "../infrastructure/db/drizzle/repositories/DrizzleLessonRepository.js";
import { DrizzleWordRepository } from "../infrastructure/db/drizzle/repositories/DrizzleWordRepository.js";
import { DrizzleExpressionRepository } from "../infrastructure/db/drizzle/repositories/DrizzleExpressionRepository.js";
import { DrizzleSentenceRepository } from "../infrastructure/db/drizzle/repositories/DrizzleSentenceRepository.js";
import { DrizzleLessonContentItemRepository } from "../infrastructure/db/drizzle/repositories/DrizzleLessonContentItemRepository.js";

const APPLY = process.argv.includes("--apply");
const arg = (name: string) => {
  const at = process.argv.indexOf(`--${name}`);
  return at < 0 ? "" : String(process.argv[at + 1] || "").trim();
};

async function main() {
  const lessonId = arg("lesson");
  const draftPath = arg("draft");
  if (!lessonId || !draftPath) throw new Error("--lesson <id> --draft <file.json> are required");
  const raw = JSON.parse(readFileSync(draftPath, "utf8")) as LlmGeneratedSentence;
  const draft: LlmGeneratedSentence = {
    ...raw,
    components: raw.components.map((c) => ({ ...c, role: "support", fixed: c.type === "expression" ? true : c.fixed }))
  };

  const lessons = new DrizzleLessonRepository();
  const words = new DrizzleWordRepository();
  const expressions = new DrizzleExpressionRepository();
  const sentences = new DrizzleSentenceRepository();
  const lesson = await lessons.findById(lessonId);
  if (!lesson) throw new Error("lesson not found");

  // Every component must already exist: this adds a sentence, never vocabulary.
  for (const c of draft.components) {
    const found =
      c.type === "word"
        ? await words.findByText(lesson.language, c.text, lesson.languageId || null)
        : await expressions.findByText(lesson.language, c.text, lesson.languageId || null);
    if (!found) throw new Error(`${c.type} "${c.text}" does not exist in the course; refusing to create it`);
    console.log(`   ${c.type.padEnd(10)} "${c.text}" -> ${found.text} (${found.id})`);
  }
  const existing = await sentences.list({ language: lesson.language, languageId: lesson.languageId || null });
  const clash = existing.find((s) => s.text.normalize("NFC").toLowerCase() === draft.text.normalize("NFC").toLowerCase());
  if (clash) throw new Error(`a sentence already reads "${clash.text}" (${clash.id}); link it instead`);
  const segmentCover = (draft.meaningSegments || []).flatMap((s) => s.componentIndexes).sort();
  if (segmentCover.join(",") !== draft.components.map((_, i) => i).join(","))
    throw new Error("meaningSegments must cover each component exactly once");
  console.log(`lesson "${lesson.title}": add "${draft.text}" (${draft.translations.join(" / ")})`);
  if (!APPLY) return console.log("\ndry run -- pass --apply to write");

  const service = new SentenceDraftPersistenceService(words, expressions, sentences, new DrizzleLessonContentItemRepository());
  const result = await service.persist({
    lesson,
    sentenceDrafts: [draft],
    modelName: "hand-written",
    currentLessonSentences: [],
    attachToLesson: true,
    createdBy: lesson.createdBy
  });
  const created = result.sentences[0];
  console.log(`\napplied: sentence ${created?.id} with ${created?.components?.length ?? 0} components, linked to the lesson as practice`);
  if (result.coreWords.length || result.coreExpressions.length)
    console.log(`   !! introduced: ${[...result.coreWords, ...result.coreExpressions].map((i) => i.text).join(", ")}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
