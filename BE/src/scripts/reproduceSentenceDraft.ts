/**
 * Re-run the sentence drafting step for one generated lesson, exactly as generation did, and
 * print what came back and why sentences were rejected. Writes nothing.
 *
 *   npx tsx src/scripts/reproduceSentenceDraft.ts --lesson <id>
 */
import "dotenv/config";
import { pool } from "../infrastructure/db/drizzle/client.js";
import { getLlmClient } from "../services/llm/index.js";
import { AdminUnitAiContentUseCases } from "../application/use-cases/admin/lesson-ai/AdminUnitAiContentUseCases.js";
import { DrizzleLessonRepository } from "../infrastructure/db/drizzle/repositories/DrizzleLessonRepository.js";
import { DrizzleWordRepository } from "../infrastructure/db/drizzle/repositories/DrizzleWordRepository.js";
import { DrizzleExpressionRepository } from "../infrastructure/db/drizzle/repositories/DrizzleExpressionRepository.js";
import { DrizzleSentenceRepository } from "../infrastructure/db/drizzle/repositories/DrizzleSentenceRepository.js";
import { DrizzleChapterRepository } from "../infrastructure/db/drizzle/repositories/DrizzleChapterRepository.js";
import { DrizzleLessonContentItemRepository } from "../infrastructure/db/drizzle/repositories/DrizzleLessonContentItemRepository.js";
import { DrizzleUnitContentItemRepository } from "../infrastructure/db/drizzle/repositories/DrizzleUnitContentItemRepository.js";
import { DrizzleProverbRepository } from "../infrastructure/db/drizzle/repositories/DrizzleProverbRepository.js";
import { DrizzleQuestionRepository } from "../infrastructure/db/drizzle/repositories/DrizzleQuestionRepository.js";
import { DrizzleUnitRepository } from "../infrastructure/db/drizzle/repositories/DrizzleUnitRepository.js";

const arg = (name: string) => {
  const at = process.argv.indexOf(`--${name}`);
  return at < 0 ? "" : String(process.argv[at + 1] || "").trim();
};

async function main() {
  const lessonId = arg("lesson");
  if (!lessonId) throw new Error("pass --lesson <id>");
  const lessons = new DrizzleLessonRepository();
  const units = new DrizzleUnitRepository();
  const useCases = new AdminUnitAiContentUseCases(
    lessons,
    new DrizzleWordRepository(),
    new DrizzleExpressionRepository(),
    new DrizzleSentenceRepository(),
    new DrizzleChapterRepository(),
    new DrizzleLessonContentItemRepository(),
    new DrizzleUnitContentItemRepository(),
    new DrizzleProverbRepository(),
    new DrizzleQuestionRepository(),
    units,
    getLlmClient()
  );
  const lesson = await lessons.findById(lessonId);
  if (!lesson) throw new Error("lesson not found");
  const unit = await units.findById(lesson.unitId);
  const preview = (unit as any)?.lastAiPreviewPlan || (unit as any)?.last_ai_preview_plan;
  const plan = (preview?.lessonSequence || []).find((l: any) => l.title === lesson.title);
  if (!plan) throw new Error(`no plan entry titled "${lesson.title}" in the unit's last preview plan`);
  const settings = preview?.settings || {};

  // Private on the use case; TypeScript's `private` is compile-time only.
  const uc = useCases as any;
  const taughtBefore = await uc.listVocabularyTaughtBefore(lesson);
  const asAllowed = (items: Array<{ text: string; translations?: string[] }>) =>
    items.filter((i) => String(i.text || "").trim()).map((i) => ({ text: i.text, translations: i.translations || [] }));
  const allowedWords = asAllowed([...taughtBefore.words, ...(plan.targetWords || [])]);
  const allowedExpressions = asAllowed([...taughtBefore.expressions, ...(plan.targetExpressions || [])]);
  console.log(`lesson "${lesson.title}"; plan targets: ${JSON.stringify(plan.targetWords)} ${JSON.stringify(plan.targetExpressions)}`);
  console.log(`allowed words (${allowedWords.length}): ${allowedWords.map((w) => w.text).join(", ")}`);
  console.log(`allowed expressions (${allowedExpressions.length}): ${allowedExpressions.map((e) => e.text).join(", ")}`);
  const targetInAllowed = (plan.targetWords || []).every((t: any) => allowedWords.some((w) => w.text.toLowerCase() === String(t.text).toLowerCase()));
  console.log(`plan target words present in allowed list: ${targetInAllowed}`);

  const conversationGoal = String(plan.conversationGoal || "");
  const situations: string[] = plan.situations || [];
  const sentenceGoals: string[] = plan.sentenceGoals || [];
  const extra = [
    "Every sentence must use ONLY the allowed words and expressions listed above. They are what this learner has been taught; anything else is unknown to them.",
    String(settings.extraInstructions || "").trim(),
    "Generate practical conversational sentences learners can actually say in this chapter and lesson.",
    "Use the generated sentences to surface reusable words and expressions, but do not teach the whole sentence as the introductory content item.",
    "Stage 1 should introduce target words and expressions first, then later stages should apply them in sentence context.",
    plan.focusSummary ? `Lesson focus: ${plan.focusSummary}` : "",
    plan.objectives?.length ? `Lesson objectives: ${plan.objectives.join(" | ")}` : "",
    conversationGoal ? `Primary conversation goal: ${conversationGoal}` : "",
    situations.length ? `Situations: ${situations.join(" | ")}` : "",
    sentenceGoals.length ? `Sentence goals: ${sentenceGoals.join(" | ")}` : "",
    "Teach the standard form of the target language first."
  ]
    .filter(Boolean)
    .join(" ");

  console.log("\n=== discovery pass (same call generation makes first) ===");
  const drafts = await uc.sentenceOrchestrator.draftForLessonPlan({
    lesson,
    existingLessonSentences: [],
    maxSentences: 4,
    conversationGoal,
    situations,
    sentenceGoals,
    allowedWords,
    allowedExpressions,
    allowDerivedComponents: false,
    extraInstructions: extra
  });
  console.log(`\naccepted drafts: ${drafts.length}`);
  for (const d of drafts) {
    console.log(`  "${d.text}"  (${(d.translations || []).join(" / ")})`);
    console.log(`     components: ${(d.components || []).map((c: any) => `${c.text}${c.role === "core" ? "*" : ""}`).join(" | ")}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
