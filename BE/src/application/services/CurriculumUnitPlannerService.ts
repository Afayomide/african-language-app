import type { ChapterEntity } from "../../domain/entities/Chapter.js";
import type { CurriculumBuildJobUnitPlan } from "../../domain/entities/CurriculumBuildJob.js";
import type { LessonRepository } from "../../domain/repositories/LessonRepository.js";
import type { UnitRepository } from "../../domain/repositories/UnitRepository.js";
import { buildRetryInstruction, logAiRetry, logAiValidation } from "../../services/llm/aiGenerationLogger.js";
import { validateLessonSuggestion } from "../../services/llm/outputQuality.js";
import type { LlmClient } from "../../services/llm/types.js";
import { getCefrBandForLevel } from "./cefrMapping.js";

export type CurriculumUnitPlannerInput = {
  chapter: ChapterEntity;
  languageId?: string | null;
  requestedUnitCount: number;
  topic?: string;
  extraInstructions?: string;
  cefrTarget?: string;
  priorUnitTitles?: string[];
  memorySummary?: string;
};

export type CurriculumUnitReplanInput = Omit<CurriculumUnitPlannerInput, "requestedUnitCount"> & {
  excludedUnitTitles?: string[];
  orderIndex: number;
};

export class CurriculumUnitPlannerService {
  constructor(
    private readonly units: UnitRepository,
    private readonly lessons: LessonRepository,
    private readonly llm: LlmClient
  ) {}

  async planUnitsForChapter(input: CurriculumUnitPlannerInput): Promise<CurriculumBuildJobUnitPlan[]> {
    const requestedUnitCount = Math.max(1, Math.min(10, Number(input.requestedUnitCount || 1)));
    const cefrTarget = input.cefrTarget || getCefrBandForLevel(input.chapter.level);
    const existingUnitsInChapter = await this.units.listByChapterId(input.chapter.id);
    const existingUnitsInLanguage = await this.units.listByLanguage(input.chapter.language, input.languageId || undefined);
    const existingLessons = await this.lessons.list({
      language: input.chapter.language,
      languageId: input.languageId || undefined
    });

    const existingUnitTitles = Array.from(
      new Set(
        [
          ...existingUnitsInLanguage.map((item) => item.title),
          ...(input.priorUnitTitles || [])
        ]
          .map((item) => String(item || "").trim())
          .filter(Boolean)
      )
    );
    const existingLessonTitles = existingLessons.map((item) => item.title).filter(Boolean);
    const seenTitles = new Set(existingUnitTitles.map((item) => item.trim().toLowerCase()));
    const nextOrderBase = existingUnitsInChapter.reduce((max, item) => Math.max(max, item.orderIndex), -1) + 1;

    const planned: CurriculumBuildJobUnitPlan[] = [];
    for (let index = 0; index < requestedUnitCount; index += 1) {
      const accepted = await this.suggestUnitCandidate({
        chapter: input.chapter,
        languageId: input.languageId,
        topic: typeof input.topic === "string" && input.topic.trim() ? `${input.topic.trim()} variation ${index + 1}` : undefined,
        extraInstructions: input.extraInstructions,
        cefrTarget,
        memorySummary: input.memorySummary,
        existingUnitTitles,
        existingLessonTitles
      });

      const normalizedTitle = accepted.title.trim().toLowerCase();
      if (seenTitles.has(normalizedTitle)) {
        throw new Error(`Unit planner produced a duplicate unit title: ${accepted.title}`);
      }
      seenTitles.add(normalizedTitle);
      existingUnitTitles.push(accepted.title);

      planned.push({
        chapterId: input.chapter.id,
        chapterTitle: input.chapter.title,
        title: accepted.title,
        description: accepted.description || "",
        orderIndex: nextOrderBase + index,
        status: "planned",
        unitId: null
      });
    }

    return planned;
  }

  async replanUnitForChapter(input: CurriculumUnitReplanInput): Promise<CurriculumBuildJobUnitPlan> {
    const cefrTarget = input.cefrTarget || getCefrBandForLevel(input.chapter.level);
    const existingUnitsInLanguage = await this.units.listByLanguage(input.chapter.language, input.languageId || undefined);
    const existingLessons = await this.lessons.list({
      language: input.chapter.language,
      languageId: input.languageId || undefined
    });

    const existingUnitTitles = Array.from(
      new Set(
        [
          ...existingUnitsInLanguage.map((item) => item.title),
          ...(input.priorUnitTitles || []),
          ...(input.excludedUnitTitles || [])
        ]
          .map((item) => String(item || "").trim())
          .filter(Boolean)
      )
    );
    const existingLessonTitles = existingLessons.map((item) => item.title).filter(Boolean);
    const accepted = await this.suggestUnitCandidate({
      chapter: input.chapter,
      languageId: input.languageId,
      topic: input.topic,
      extraInstructions: input.extraInstructions,
      cefrTarget,
      memorySummary: input.memorySummary,
      existingUnitTitles,
      existingLessonTitles
    });

    return {
      chapterId: input.chapter.id,
      chapterTitle: input.chapter.title,
      title: accepted.title,
      description: accepted.description || "",
      orderIndex: input.orderIndex,
      status: "planned",
      unitId: null
    };
  }

  private async suggestUnitCandidate(input: {
    chapter: ChapterEntity;
    languageId?: string | null;
    topic?: string;
    extraInstructions?: string;
    cefrTarget?: string;
    memorySummary?: string;
    existingUnitTitles: string[];
    existingLessonTitles: string[];
  }) {
    const validationInput = {
      language: input.chapter.language,
      level: input.chapter.level,
      unitTitle: input.chapter.title,
      unitDescription: input.chapter.description,
      topic: input.topic,
      curriculumInstruction: [
        `Suggest the next coherent unit for the chapter "${input.chapter.title}".`,
        input.chapter.description ? `Chapter description: ${input.chapter.description}` : "",
        input.cefrTarget ? `The chapter target CEFR band is ${input.cefrTarget}.` : "",
        input.memorySummary || "",
        input.extraInstructions || "",
        "Reuse earlier content deliberately for reinforcement, but avoid shallow duplication of prior unit intent.",
        "Write titles, descriptions, and objectives entirely in English. Do not quote or embed target-language words in planning metadata."
      ]
        .filter(Boolean)
        .join(" "),
      existingUnitTitles: input.existingUnitTitles,
      existingLessonTitles: input.existingLessonTitles
    } as const;

    let retryInstruction = "";
    let accepted: { title: string; description?: string } | null = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const candidate = await this.llm.suggestLesson({
        language: input.chapter.language,
        level: input.chapter.level,
        unitTitle: input.chapter.title,
        unitDescription: input.chapter.description,
        topic: input.topic,
        curriculumInstruction: [validationInput.curriculumInstruction, retryInstruction].filter(Boolean).join(" ").trim(),
        existingUnitTitles: validationInput.existingUnitTitles,
        existingLessonTitles: validationInput.existingLessonTitles
      });
      const validation = validateLessonSuggestion(candidate, validationInput);
      if (validation.ok) {
        accepted = {
          title: String(candidate.title || "").trim(),
          description: String(candidate.description || "").trim()
        };
        break;
      }

      logAiValidation("curriculum_unit_planner", {
        chapterId: input.chapter.id,
        chapterTitle: input.chapter.title,
        attempt,
        title: candidate.title,
        reasons: validation.reasons,
        details: validation.details
      });
      if (attempt < 3) {
        retryInstruction = buildRetryInstruction(validation.reasons);
        logAiRetry("curriculum_unit_planner", {
          chapterId: input.chapter.id,
          attempt,
          retryInstruction
        });
      }
    }

    if (!accepted) {
      throw new Error(`Unit planner could not produce a valid unit suggestion for chapter "${input.chapter.title}".`);
    }

    return accepted;
  }
}
