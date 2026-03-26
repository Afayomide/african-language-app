import type { ChapterEntity } from "../../domain/entities/Chapter.js";
import type { CurriculumBuildJobLessonPlan } from "../../domain/entities/CurriculumBuildJob.js";
import type { UnitEntity } from "../../domain/entities/Unit.js";
import type { LessonRepository } from "../../domain/repositories/LessonRepository.js";
import type { UnitRepository } from "../../domain/repositories/UnitRepository.js";
import { buildRetryInstruction, logAiRetry, logAiValidation } from "../../services/llm/aiGenerationLogger.js";
import { validateLessonSuggestion } from "../../services/llm/outputQuality.js";
import type { LlmClient } from "../../services/llm/types.js";
import { extractThemeAnchors } from "../../services/llm/unitTheme.js";
import { getCefrBandForLevel } from "./cefrMapping.js";

export type CurriculumLessonPlannerInput = {
  chapter: ChapterEntity;
  unit: UnitEntity;
  languageId?: string | null;
  requestedLessonCount: number;
  topic?: string;
  extraInstructions?: string;
  cefrTarget?: string;
  priorUnitTitles?: string[];
  memorySummary?: string;
};

export type CurriculumLessonReplanInput = Omit<CurriculumLessonPlannerInput, "requestedLessonCount"> & {
  excludedLessonTitles?: string[];
  orderIndex: number;
};

export class CurriculumLessonPlannerService {
  constructor(
    private readonly lessons: LessonRepository,
    private readonly units: UnitRepository,
    private readonly llm: LlmClient
  ) {}

  async planLessonsForUnit(input: CurriculumLessonPlannerInput): Promise<CurriculumBuildJobLessonPlan[]> {
    const requestedLessonCount = Math.max(1, Math.min(10, Number(input.requestedLessonCount || 1)));
    const cefrTarget = input.cefrTarget || getCefrBandForLevel(input.unit.level);
    const existingLessonsInUnit = await this.lessons.listByUnitId(input.unit.id);
    const existingLessonsInLanguage = await this.lessons.list({
      language: input.unit.language,
      languageId: input.languageId || undefined
    });
    const existingUnitsInLanguage = await this.units.listByLanguage(input.unit.language, input.languageId || undefined);

    const existingLessonTitles = Array.from(
      new Set(existingLessonsInLanguage.map((item) => String(item.title || "").trim()).filter(Boolean))
    );
    const existingUnitTitles = Array.from(
      new Set(
        [...existingUnitsInLanguage.map((item) => String(item.title || "").trim()), ...(input.priorUnitTitles || [])].filter(Boolean)
      )
    );
    const seenTitles = new Set(existingLessonTitles.map((item) => item.toLowerCase()));
    const nextOrderBase = existingLessonsInUnit.reduce((max, item) => Math.max(max, item.orderIndex), -1) + 1;

    const planned: CurriculumBuildJobLessonPlan[] = [];
    for (let index = 0; index < requestedLessonCount; index += 1) {
      const accepted = await this.suggestLessonCandidate({
        chapter: input.chapter,
        unit: input.unit,
        topic: typeof input.topic === "string" && input.topic.trim() ? `${input.topic.trim()} lesson ${index + 1}` : undefined,
        extraInstructions: input.extraInstructions,
        cefrTarget,
        memorySummary: input.memorySummary,
        existingUnitTitles,
        existingLessonTitles
      });

      const normalizedTitle = accepted.title.trim().toLowerCase();
      if (seenTitles.has(normalizedTitle)) {
        throw new Error(`Lesson planner produced a duplicate lesson title: ${accepted.title}`);
      }
      seenTitles.add(normalizedTitle);
      existingLessonTitles.push(accepted.title);

      planned.push({
        chapterId: input.chapter.id,
        chapterTitle: input.chapter.title,
        unitId: input.unit.id,
        unitTitle: input.unit.title,
        title: accepted.title,
        description: accepted.description || "",
        orderIndex: nextOrderBase + index,
        status: "planned",
        lessonId: null
      });
    }

    return planned;
  }

  async replanLessonForUnit(input: CurriculumLessonReplanInput): Promise<CurriculumBuildJobLessonPlan> {
    const cefrTarget = input.cefrTarget || getCefrBandForLevel(input.unit.level);
    const existingLessonsInLanguage = await this.lessons.list({
      language: input.unit.language,
      languageId: input.languageId || undefined
    });
    const existingUnitsInLanguage = await this.units.listByLanguage(input.unit.language, input.languageId || undefined);

    const existingLessonTitles = Array.from(
      new Set(
        [
          ...existingLessonsInLanguage.map((item) => String(item.title || "").trim()),
          ...(input.excludedLessonTitles || [])
        ].filter(Boolean)
      )
    );
    const existingUnitTitles = Array.from(
      new Set(
        [...existingUnitsInLanguage.map((item) => String(item.title || "").trim()), ...(input.priorUnitTitles || [])].filter(Boolean)
      )
    );
    const accepted = await this.suggestLessonCandidate({
      chapter: input.chapter,
      unit: input.unit,
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
      unitId: input.unit.id,
      unitTitle: input.unit.title,
      title: accepted.title,
      description: accepted.description || "",
      orderIndex: input.orderIndex,
      status: "planned",
      lessonId: null
    };
  }

  private async suggestLessonCandidate(input: {
    chapter: ChapterEntity;
    unit: UnitEntity;
    topic?: string;
    extraInstructions?: string;
    cefrTarget?: string;
    memorySummary?: string;
    existingUnitTitles: string[];
    existingLessonTitles: string[];
  }) {
    const validationInput = {
      language: input.unit.language,
      level: input.unit.level,
      topic: input.topic,
      unitTitle: input.unit.title,
      unitDescription: input.unit.description,
      curriculumInstruction: [
        `Suggest the next coherent lesson for the unit "${input.unit.title}" in chapter "${input.chapter.title}".`,
        input.cefrTarget ? `Target CEFR band: ${input.cefrTarget}.` : "",
        input.memorySummary || "",
        input.extraInstructions || "",
        "Reuse earlier content deliberately for reinforcement, but avoid shallow duplication of prior lesson intent.",
        "Write titles, descriptions, objectives, conversation goals, situations, sentence goals, and focus summaries entirely in English. Do not quote or embed target-language words in planning metadata."
      ]
        .filter(Boolean)
        .join(" "),
      themeAnchors: extractThemeAnchors({
        unitTitle: input.unit.title,
        unitDescription: input.unit.description,
        topic: input.topic,
        curriculumInstruction: input.extraInstructions
      }),
      existingUnitTitles: input.existingUnitTitles,
      existingLessonTitles: input.existingLessonTitles
    } as const;

    let retryInstruction = "";
    let accepted: { title: string; description?: string } | null = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const candidate = await this.llm.suggestLesson({
        language: input.unit.language,
        level: input.unit.level,
        topic: input.topic,
        unitTitle: input.unit.title,
        unitDescription: input.unit.description,
        curriculumInstruction: [validationInput.curriculumInstruction, retryInstruction].filter(Boolean).join(" ").trim(),
        themeAnchors: validationInput.themeAnchors,
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

      logAiValidation("curriculum_lesson_planner", {
        unitId: input.unit.id,
        unitTitle: input.unit.title,
        attempt,
        title: candidate.title,
        reasons: validation.reasons,
        details: validation.details
      });
      if (attempt < 3) {
        retryInstruction = buildRetryInstruction(validation.reasons);
        logAiRetry("curriculum_lesson_planner", {
          unitId: input.unit.id,
          attempt,
          retryInstruction
        });
      }
    }

    if (!accepted) {
      throw new Error(`Lesson planner could not produce a valid lesson suggestion for unit "${input.unit.title}".`);
    }

    return accepted;
  }
}
