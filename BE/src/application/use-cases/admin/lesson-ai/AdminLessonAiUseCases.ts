import type { Language, Level, LessonEntity, LessonStage } from "../../../../domain/entities/Lesson.js";
import type { LessonRepository } from "../../../../domain/repositories/LessonRepository.js";
import type { PhraseRepository } from "../../../../domain/repositories/PhraseRepository.js";
import type { ProverbRepository } from "../../../../domain/repositories/ProverbRepository.js";
import type { UnitRepository } from "../../../../domain/repositories/UnitRepository.js";
import type { LlmClient } from "../../../../services/llm/types.js";
import { buildRetryInstruction, logAiRetry, logAiValidation } from "../../../../services/llm/aiGenerationLogger.js";
import { extractThemeAnchors } from "../../../../services/llm/unitTheme.js";
import {
  validateGeneratedProverbs,
  validateLessonSuggestion
} from "../../../../services/llm/outputQuality.js";

function normalizeTitle(value: string) {
  return value.trim().toLowerCase();
}

function isEnglishLikeTitle(value: string) {
  const title = String(value || "").trim();
  if (!title) return false;
  // Guardrail: keep lesson titles in English-like latin script to avoid target-language titles.
  const latinPattern = /^[A-Za-z0-9\s.,:;'"()!?&/-]+$/;
  return latinPattern.test(title);
}

function normalizeSuggestedProverb(item: unknown) {
  if (typeof item === "string") {
    const text = item.trim();
    if (!text) return null;
    return { text, translation: "", contextNote: "" };
  }
  if (!item || typeof item !== "object") return null;
  const payload = item as { text?: unknown; translation?: unknown; contextNote?: unknown };
  const text = String(payload.text || "").trim();
  if (!text) return null;
  return {
    text,
    translation: String(payload.translation || "").trim(),
    contextNote: String(payload.contextNote || "").trim()
  };
}

export function buildInitialStages(objectives: string[]): LessonStage[] {
  const clean = objectives.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 4);
  if (clean.length === 0) {
    return [
      {
        id: "stage-1",
        title: "Stage 1: Core Vocabulary",
        description: "Start with the foundational words and phrases.",
        orderIndex: 0,
        blocks: []
      },
      {
        id: "stage-2",
        title: "Stage 2: Practice",
        description: "Practice with guided exercises.",
        orderIndex: 1,
        blocks: []
      },
      {
        id: "stage-3",
        title: "Stage 3: Listening and Review",
        description: "Consolidate with listening and review.",
        orderIndex: 2,
        blocks: []
      }
    ];
  }

  return clean.map((objective, index) => ({
    id: `stage-${index + 1}`,
    title: `Stage ${index + 1}`,
    description: objective,
    orderIndex: index,
    blocks: []
  }));
}

export class AdminLessonAiUseCases {
  constructor(
    private readonly lessons: LessonRepository,
    private readonly phrases: PhraseRepository,
    private readonly proverbs: ProverbRepository,
    private readonly units: UnitRepository,
    private readonly llm: LlmClient
  ) {}

  async generateLessonsBulk(input: {
    unitId: string;
    language: Language;
    level: Level;
    title?: string;
    topics?: string[];
    count: number;
    createdBy: string;
    curriculumInstruction?: string;
  }) {
    const unit = await this.units.findById(input.unitId);
    if (!unit) {
      throw new Error("Unit not found.");
    }

    const existingLessons = await this.lessons.list({ unitId: input.unitId });
    const existingTitleSet = new Set(
      existingLessons
        .filter((item) => item.level === input.level)
        .map((item) => normalizeTitle(String(item.title || "")))
    );

    const providedTopics = Array.isArray(input.topics)
      ? input.topics.map((t) => String(t || "").trim()).filter(Boolean).slice(0, 20)
      : [];

    const fallbackTitle = input.title ? String(input.title).trim() : "";
    const targetTopics =
      providedTopics.length > 0
        ? providedTopics.slice(0, input.count)
        : Array.from({ length: input.count }).map((_, idx) =>
            fallbackTitle ? `${fallbackTitle} #${idx + 1}` : undefined
          );
    
    

    const created: LessonEntity[] = [];
    const skipped: { reason: string; topic?: string; title?: string }[] = [];
    const errors: { topic?: string; error: string }[] = [];

    const lastOrder = await this.lessons.findLastOrderIndex(input.unitId);
    let nextOrderIndex = (lastOrder ?? -1) + 1;
    const existingUnitsInLanguage = await this.units.listByLanguage(input.language);
    const lessonIdsInUnit = existingLessons.map((item) => item.id);
    const existingPhrasesInUnit = lessonIdsInUnit.length
      ? await this.phrases.list({ lessonIds: lessonIdsInUnit })
      : [];
    const existingPhraseTexts = existingPhrasesInUnit.map((item) => item.text).filter(Boolean);
    const existingProverbTexts = (
      await Promise.all(lessonIdsInUnit.map((lessonId) => this.proverbs.findByLessonId(lessonId)))
    )
      .flat()
      .map((item) => item.text)
      .filter(Boolean);

    const curriculumInstruction =
      input.curriculumInstruction?.trim() ||
      "Continue the same unit curriculum progressively. Prioritize high-frequency conversational vocabulary, controlled repetition, and steady difficulty growth. Avoid repeating existing lessons with renamed titles.";

    for (let idx = 0; idx < input.count; idx += 1) {
      const lessonTopic = targetTopics[idx];
      try {
        const suggestion = await this.getValidatedLessonSuggestion({
          language: input.language,
          level: input.level,
          topic: lessonTopic,
          unitTitle: unit.title,
          unitDescription: unit.description,
          curriculumInstruction,
          themeAnchors: extractThemeAnchors({
            unitTitle: unit.title,
            unitDescription: unit.description,
            topic: lessonTopic,
            curriculumInstruction
          }),
          existingUnitTitles: existingUnitsInLanguage.map((item) => item.title).filter(Boolean),
          existingLessonTitles: existingLessons.map((item) => item.title).filter(Boolean),
          existingPhraseTexts,
          existingProverbTexts
        });
        if (!suggestion) {
          skipped.push({ reason: "invalid_suggestion", topic: lessonTopic });
          continue;
        }

        const title = String(suggestion.title || "").trim();
        if (!title) {
          skipped.push({ reason: "empty_title", topic: lessonTopic });
          continue;
        }
        if (!isEnglishLikeTitle(title)) {
          skipped.push({ reason: "non_english_title", topic: lessonTopic, title });
          continue;
        }

        const titleKey = normalizeTitle(title);
        if (existingTitleSet.has(titleKey)) {
          skipped.push({ reason: "duplicate_title", topic: lessonTopic, title });
          continue;
        }

        const lesson = await this.lessons.create({
          title,
          unitId: input.unitId,
          language: input.language,
          level: input.level,
          description: suggestion.description ? String(suggestion.description).trim() : "",
          topics: lessonTopic ? [lessonTopic] : [],
          proverbs: [],
          stages: buildInitialStages(Array.isArray(suggestion.objectives) ? suggestion.objectives : []),
          status: "draft",
          createdBy: input.createdBy,
          orderIndex: nextOrderIndex
        });

        const suggestedProverbs = Array.isArray(suggestion.proverbs)
          ? suggestion.proverbs.map(normalizeSuggestedProverb).filter((item): item is { text: string; translation: string; contextNote: string } => Boolean(item))
          : [];
        const validSuggestedProverbs = await this.getValidatedGeneratedProverbs(
          suggestedProverbs.map((item) => ({
            text: item.text,
            translation: item.translation,
            contextNote: item.contextNote
          })),
          {
            existingProverbs: existingProverbTexts,
            level: input.level,
            language: input.language
          },
          "suggested-lesson-proverbs"
        );
        for (const proverbItem of validSuggestedProverbs) {
          const reusable = await this.proverbs.findReusable(input.language, proverbItem.text);
          if (reusable) {
            const mergedLessonIds = Array.from(new Set([...reusable.lessonIds, lesson.id]));
            await this.proverbs.updateById(reusable.id, {
              lessonIds: mergedLessonIds,
              translation: proverbItem.translation || reusable.translation,
              contextNote: proverbItem.contextNote || reusable.contextNote,
              aiMeta: { generatedByAI: true, model: "", reviewedByAdmin: false }
            });
            continue;
          }

          await this.proverbs.create({
            lessonIds: [lesson.id],
            language: input.language,
            text: proverbItem.text,
            translation: proverbItem.translation,
            contextNote: proverbItem.contextNote,
            aiMeta: { generatedByAI: true, model: "", reviewedByAdmin: false },
            status: "draft"
          });
        }

        nextOrderIndex += 1;
        existingTitleSet.add(titleKey);
        created.push(lesson);
      } catch (error) {
        console.error("Admin AI bulk lesson generation item failed", {
          language: input.language,
          level: input.level,
          topic: lessonTopic,
          error
        });

        errors.push({
          topic: lessonTopic,
          error: error instanceof Error ? error.message : "unknown_error"
        });
      }
    }

    return {
      totalRequested: input.count,
      createdCount: created.length,
      skippedCount: skipped.length,
      errorCount: errors.length,
      lessons: created,
      skipped,
      errors
    };
  }

  async generateLessonProverbs(input: {
    lesson: LessonEntity;
    count: number;
    extraInstructions?: string;
  }) {
    const existing = await this.proverbs.findByLessonId(input.lesson.id);
    const proverbValidationInput = {
      existingProverbs: existing.map((item) => item.text),
      level: input.lesson.level,
      language: input.lesson.language
    };
    let validSuggested: Array<{ text: string; translation: string; contextNote?: string }> = [];
    let retryInstruction = "";
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const suggested = await this.llm.generateProverbs({
        language: input.lesson.language,
        level: input.lesson.level,
        lessonTitle: input.lesson.title,
        lessonDescription: input.lesson.description,
        count: input.count,
        extraInstructions: [input.extraInstructions?.trim() || "", retryInstruction].filter(Boolean).join(" ").trim() || undefined,
        existingProverbs: proverbValidationInput.existingProverbs
      });
      validSuggested = await this.getValidatedGeneratedProverbs(
        suggested,
        proverbValidationInput,
        "lesson-proverbs"
      );
      if (validSuggested.length > 0) break;
      if (attempt < 2) {
        retryInstruction = buildRetryInstruction(["generate culturally authentic proverbs with English translations and context notes"]);
        logAiRetry("lesson-proverbs", { attempt, retryInstruction });
      }
    }

    const created = [];
    const seen = new Set<string>();
    for (const item of validSuggested) {
      const text = String(item.text || "").trim();
      if (!text) continue;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      const reusable = await this.proverbs.findReusable(input.lesson.language, text);
      if (reusable) {
        const mergedLessonIds = Array.from(new Set([...reusable.lessonIds, input.lesson.id]));
        const updated = await this.proverbs.updateById(reusable.id, {
          lessonIds: mergedLessonIds,
          translation: String(item.translation || reusable.translation || "").trim(),
          contextNote: String(item.contextNote || reusable.contextNote || "").trim(),
          aiMeta: { generatedByAI: true, model: this.llm.modelName, reviewedByAdmin: false }
        });
        if (updated) created.push(updated);
        continue;
      }

      const proverb = await this.proverbs.create({
        lessonIds: [input.lesson.id],
        language: input.lesson.language,
        text,
        translation: String(item.translation || "").trim(),
        contextNote: String(item.contextNote || "").trim(),
        aiMeta: { generatedByAI: true, model: this.llm.modelName, reviewedByAdmin: false },
        status: "draft"
      });
      created.push(proverb);
    }

    return created;
  }

  private async getValidatedLessonSuggestion(input: {
    language: Language;
    level: Level;
    topic?: string;
    unitTitle?: string;
    unitDescription?: string;
    curriculumInstruction?: string;
    themeAnchors?: string[];
    existingUnitTitles?: string[];
    existingLessonTitles?: string[];
    existingPhraseTexts?: string[];
    existingProverbTexts?: string[];
  }) {
    let retryInstruction = "";

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const suggestion = await this.llm.suggestLesson({
        ...input,
        curriculumInstruction: [input.curriculumInstruction || "", retryInstruction].filter(Boolean).join(" ").trim() || undefined
      });
      const validation = validateLessonSuggestion(suggestion, input);
      if (validation.ok) {
        return suggestion;
      }

      logAiValidation("lesson-suggestion", {
        attempt,
        topic: input.topic,
        title: suggestion.title,
        reasons: validation.reasons,
        details: validation.details
      });

      if (attempt < 3) {
        retryInstruction = buildRetryInstruction(validation.reasons);
        logAiRetry("lesson-suggestion", { attempt, topic: input.topic, retryInstruction });
      }
    }

    return null;
  }

  private async getValidatedGeneratedProverbs(
    proverbs: Array<{ text: string; translation: string; contextNote?: string }>,
    input: { existingProverbs?: string[]; level: Level; language: Language },
    context: string
  ) {
    const validated = validateGeneratedProverbs(proverbs, input);
    if (validated.rejected.length > 0) {
      logAiValidation("proverbs", {
        context,
        acceptedCount: validated.accepted.length,
        rejectedCount: validated.rejected.length,
        sampleRejected: validated.rejected.slice(0, 5).map((item) => ({
          text: item.item.text,
          translation: item.item.translation,
          contextNote: item.item.contextNote,
          reasons: item.reasons
        }))
      });
    }
    return validated.accepted;
  }
}
