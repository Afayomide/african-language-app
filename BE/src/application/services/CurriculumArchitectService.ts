import type { CurriculumBuildJobChapterPlan } from "../../domain/entities/CurriculumBuildJob.js";
import type { LanguageEntity } from "../../domain/entities/Language.js";
import type { Language, Level } from "../../domain/entities/Lesson.js";
import type { ChapterRepository } from "../../domain/repositories/ChapterRepository.js";
import type { LanguageRepository } from "../../domain/repositories/LanguageRepository.js";
import type { LlmClient } from "../../services/llm/types.js";
import { buildRetryInstruction, logAiRetry, logAiValidation } from "../../services/llm/aiGenerationLogger.js";
import { validateGeneratedChapters } from "../../services/llm/outputQuality.js";
import { getCefrBandForLevel } from "./cefrMapping.js";
import type { CurriculumChapterMemoryResult } from "./CurriculumMemoryService.js";
import { CurriculumMemoryService } from "./CurriculumMemoryService.js";

export type CurriculumArchitectPlanInput = {
  language: Language;
  languageId?: string | null;
  level: Level;
  requestedChapterCount: number;
  topic?: string;
  extraInstructions?: string;
  cefrTarget?: string;
};

export type CurriculumArchitectPlanResult = {
  language: Language;
  languageId?: string | null;
  level: Level;
  requestedChapterCount: number;
  memory: CurriculumChapterMemoryResult;
  chapters: CurriculumBuildJobChapterPlan[];
  notes: string[];
};

export type CurriculumArchitectReplanInput = Omit<CurriculumArchitectPlanInput, "requestedChapterCount"> & {
  excludedChapterTitles?: string[];
  orderIndex: number;
};

function buildArchitectNotes(input: {
  languageRecord: LanguageEntity | null;
  memory: CurriculumChapterMemoryResult;
  cefrTarget?: string;
}) {
  const notes: string[] = [];
  if (input.languageRecord?.branding.heroGreeting) {
    notes.push(`Language greeting anchor: ${input.languageRecord.branding.heroGreeting}`);
  }
  if (input.languageRecord?.branding.heroSubtitle) {
    notes.push(`Language subtitle anchor: ${input.languageRecord.branding.heroSubtitle}`);
  }
  if (input.cefrTarget) {
    notes.push(`Target CEFR band: ${input.cefrTarget}`);
  }
  if (input.memory.chapterTitles.length > 0) {
    notes.push(`Prior approved chapters considered: ${input.memory.chapterTitles.join(" | ")}`);
  }
  return notes;
}

function buildArchitectInstructions(input: {
  languageRecord: LanguageEntity | null;
  memory: CurriculumChapterMemoryResult;
  cefrTarget?: string;
  topic?: string;
  extraInstructions?: string;
  retryInstruction?: string;
}) {
  return [
    input.cefrTarget
      ? `Design these chapters so their scope and progression fit the CEFR band ${input.cefrTarget}.`
      : "",
    input.languageRecord?.branding.heroSubtitle
      ? `Language positioning: ${input.languageRecord.branding.heroSubtitle}`
      : "",
    input.memory.summary
      ? [
          "Treat the following as approved prior curriculum memory.",
          "Continue from it. Reuse earlier material deliberately for reinforcement, but avoid shallow duplication of chapter intent.",
          input.memory.summary
        ].join("\n")
      : "",
    input.topic ? `Requested topic focus: ${input.topic}` : "",
    input.extraInstructions || "",
    input.retryInstruction || ""
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

export class CurriculumArchitectService {
  constructor(
    private readonly chapters: ChapterRepository,
    private readonly languages: LanguageRepository,
    private readonly curriculumMemory: CurriculumMemoryService,
    private readonly llm: LlmClient
  ) {}

  async planNextChapters(input: CurriculumArchitectPlanInput): Promise<CurriculumArchitectPlanResult> {
    const requestedChapterCount = Math.max(1, Math.min(30, Number(input.requestedChapterCount || 1)));
    const cefrTarget = input.cefrTarget || getCefrBandForLevel(input.level);
    const context = await this.buildPlanningContext(input);
    const accepted = await this.generateAcceptedChapters({
      language: input.language,
      level: input.level,
      requestedChapterCount,
      topic: input.topic,
      extraInstructions: input.extraInstructions,
      cefrTarget,
      languageRecord: context.languageRecord,
      memory: context.memory,
      existingTitles: context.existingTitles,
      logContext: "chapter_plan"
    });

    const baseOrderIndex = (context.lastOrderIndex ?? -1) + 1;
    const chapters = accepted.map((chapter, index) => ({
      title: chapter.title.trim(),
      description: chapter.description.trim(),
      orderIndex: baseOrderIndex + index,
      status: "planned" as const,
      chapterId: null
    }));

    return {
      language: input.language,
      languageId: context.resolvedLanguageId,
      level: input.level,
      requestedChapterCount,
      memory: context.memory,
      chapters,
      notes: buildArchitectNotes({ languageRecord: context.languageRecord, memory: context.memory, cefrTarget })
    };
  }

  async replanChapterCandidate(input: CurriculumArchitectReplanInput): Promise<CurriculumBuildJobChapterPlan> {
    const cefrTarget = input.cefrTarget || getCefrBandForLevel(input.level);
    const context = await this.buildPlanningContext({
      ...input,
      requestedChapterCount: 1
    });
    const existingTitles = Array.from(new Set([...context.existingTitles, ...(input.excludedChapterTitles || [])]));
    const accepted = await this.generateAcceptedChapters({
      language: input.language,
      level: input.level,
      requestedChapterCount: 1,
      topic: input.topic,
      extraInstructions: input.extraInstructions,
      cefrTarget,
      languageRecord: context.languageRecord,
      memory: context.memory,
      existingTitles,
      logContext: "chapter_replan"
    });

    const chapter = accepted[0];
    if (!chapter) {
      throw new Error("Curriculum architect could not produce a replacement chapter.");
    }

    return {
      title: chapter.title.trim(),
      description: chapter.description.trim(),
      orderIndex: input.orderIndex,
      status: "planned",
      chapterId: null
    };
  }

  private async buildPlanningContext(input: CurriculumArchitectPlanInput) {
    const languageRecord =
      (input.languageId ? await this.languages.findById(input.languageId) : null) ||
      (await this.languages.findByCode(input.language));
    const resolvedLanguageId = languageRecord?.id || input.languageId || null;

    const existingChapters = await this.chapters.listByLanguage(input.language, resolvedLanguageId || undefined);
    const existingTitles = existingChapters
      .filter((chapter) => chapter.level === input.level)
      .map((chapter) => chapter.title)
      .filter(Boolean);
    const memory = await this.curriculumMemory.buildChapterPlanningMemory({
      language: input.language,
      languageId: resolvedLanguageId,
      level: input.level
    });
    const lastOrderIndex = await this.chapters.findLastOrderIndex(input.language, resolvedLanguageId);

    return {
      languageRecord,
      resolvedLanguageId,
      existingTitles,
      memory,
      lastOrderIndex
    };
  }

  private async generateAcceptedChapters(input: {
    language: Language;
    level: Level;
    requestedChapterCount: number;
    topic?: string;
    extraInstructions?: string;
    cefrTarget?: string;
    languageRecord: LanguageEntity | null;
    memory: CurriculumChapterMemoryResult;
    existingTitles: string[];
    logContext: string;
  }) {
    let retryInstruction = "";
    let accepted: Array<{ title: string; description: string }> = [];

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const generated = await this.llm.generateChapters({
        language: input.language,
        level: input.level,
        count: input.requestedChapterCount,
        topic: input.topic,
        extraInstructions:
          buildArchitectInstructions({
            languageRecord: input.languageRecord,
            memory: input.memory,
            cefrTarget: input.cefrTarget,
            topic: input.topic,
            extraInstructions: input.extraInstructions,
            retryInstruction
          }) || undefined,
        existingChapterTitles: input.existingTitles
      });

      const validation = validateGeneratedChapters(generated, {
        language: input.language,
        level: input.level,
        count: input.requestedChapterCount,
        topic: input.topic,
        extraInstructions: input.extraInstructions,
        existingChapterTitles: input.existingTitles
      });

      if (validation.accepted.length === input.requestedChapterCount) {
        accepted = validation.accepted.slice(0, input.requestedChapterCount);
        break;
      }

      const countMismatchReasons =
        validation.accepted.length > 0 && validation.accepted.length < input.requestedChapterCount
          ? [`expected ${input.requestedChapterCount} valid chapters but only ${validation.accepted.length} were accepted`]
          : [];

      logAiValidation("curriculum_architect", {
        context: input.logContext,
        attempt,
        acceptedCount: validation.accepted.length,
        rejectedCount: validation.rejected.length,
        sampleRejected: validation.rejected.slice(0, 3).map((item) => ({
          title: item.item.title,
          reasons: item.reasons
        }))
      });

      if (attempt < 3) {
        retryInstruction = buildRetryInstruction([
          ...validation.rejected.flatMap((item) => item.reasons),
          ...countMismatchReasons
        ]);
        logAiRetry("curriculum_architect", {
          attempt,
          language: input.language,
          level: input.level,
          retryInstruction
        });
      }
    }

    if (accepted.length === 0) {
      throw new Error("Curriculum architect could not produce a valid chapter plan after 3 attempts.");
    }

    return accepted;
  }
}
