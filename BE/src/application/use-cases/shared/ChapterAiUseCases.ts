import type { Language, Level } from "../../../domain/entities/Lesson.js";
import type { ChapterEntity } from "../../../domain/entities/Chapter.js";
import type { ChapterRepository } from "../../../domain/repositories/ChapterRepository.js";
import type { LlmClient } from "../../../services/llm/types.js";
import { buildRetryInstruction, logAiRetry, logAiValidation } from "../../../services/llm/aiGenerationLogger.js";
import { validateGeneratedChapters } from "../../../services/llm/outputQuality.js";

type GenerateChaptersBulkInput = {
  language: Language;
  level: Level;
  count: number;
  topic?: string;
  extraInstructions?: string;
  createdBy: string;
};

export class ChapterAiUseCases {
  constructor(
    private readonly chapters: ChapterRepository,
    private readonly llm: LlmClient
  ) {}

  async generateBulk(input: GenerateChaptersBulkInput) {
    const requestedCount = Math.max(1, Math.min(20, Number(input.count || 1)));
    const existingChapters = await this.chapters.listByLanguage(input.language);
    const existingTitles = existingChapters
      .filter((chapter) => chapter.level === input.level)
      .map((chapter) => chapter.title)
      .filter(Boolean);
    const lastOrder = await this.chapters.findLastOrderIndex(input.language);
    let nextOrderIndex = (lastOrder ?? -1) + 1;

    let retryInstruction = "";
    let accepted: Array<{ title: string; description: string }> = [];

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const generated = await this.llm.generateChapters({
        language: input.language,
        level: input.level,
        count: requestedCount,
        topic: input.topic,
        extraInstructions: [input.extraInstructions, retryInstruction].filter(Boolean).join(" ").trim() || undefined,
        existingChapterTitles: existingTitles
      });

      const validation = validateGeneratedChapters(generated, {
        language: input.language,
        level: input.level,
        count: requestedCount,
        topic: input.topic,
        extraInstructions: input.extraInstructions,
        existingChapterTitles: existingTitles
      });

      if (validation.accepted.length > 0) {
        accepted = validation.accepted.slice(0, requestedCount);
        break;
      }

      logAiValidation("chapters", {
        context: "language",
        attempt,
        acceptedCount: validation.accepted.length,
        rejectedCount: validation.rejected.length,
        sampleRejected: validation.rejected.slice(0, 3).map((item) => ({
          title: item.item.title,
          reasons: item.reasons
        }))
      });

      if (attempt < 3) {
        retryInstruction = buildRetryInstruction(validation.rejected.flatMap((item) => item.reasons));
        logAiRetry("chapters", {
          attempt,
          language: input.language,
          retryInstruction
        });
      }
    }

    const created: ChapterEntity[] = [];
    const skipped: Array<{ reason: string; title?: string }> = [];

    const seen = new Set(existingTitles.map((item) => item.trim().toLowerCase()));
    for (const chapter of accepted) {
      const key = chapter.title.trim().toLowerCase();
      if (seen.has(key)) {
        skipped.push({ reason: "duplicate_title", title: chapter.title });
        continue;
      }
      seen.add(key);
      const createdChapter = await this.chapters.create({
        title: chapter.title.trim(),
        description: chapter.description.trim(),
        language: input.language,
        level: input.level,
        orderIndex: nextOrderIndex,
        status: "draft",
        createdBy: input.createdBy
      });
      created.push(createdChapter);
      nextOrderIndex += 1;
    }

    const missingCount = Math.max(0, requestedCount - created.length);
    if (missingCount > 0) {
      skipped.push({ reason: "insufficient_valid_results" });
    }

    return {
      totalRequested: requestedCount,
      createdCount: created.length,
      skippedCount: skipped.length,
      errorCount: 0,
      chapters: created,
      skipped,
      errors: [] as Array<{ index?: number; error: string }>
    };
  }
}
