import type {
  CurriculumBuildJobChapterPlan,
  CurriculumBuildJobEntity,
  CurriculumBuildJobLessonPlan,
  CurriculumBuildJobUnitPlan
} from "../../domain/entities/CurriculumBuildJob.js";
import type { ChapterEntity } from "../../domain/entities/Chapter.js";
import type { UnitEntity } from "../../domain/entities/Unit.js";
import type { ChapterRepository } from "../../domain/repositories/ChapterRepository.js";
import type { LessonRepository } from "../../domain/repositories/LessonRepository.js";
import type { UnitRepository } from "../../domain/repositories/UnitRepository.js";
import type { CurriculumCriticResult } from "./CurriculumCriticService.js";
import { CurriculumArchitectService } from "./CurriculumArchitectService.js";
import { CurriculumLessonPlannerService } from "./CurriculumLessonPlannerService.js";
import { CurriculumUnitPlannerService } from "./CurriculumUnitPlannerService.js";
import { buildPedagogicalStages } from "./defaultLessonStages.js";

export type CurriculumRefinerResult = {
  fixed: boolean;
  summary: string;
  fixesApplied: string[];
  unresolvedIssues: string[];
  artifacts?: CurriculumBuildJobEntity["artifacts"];
};

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function tokenize(value: string) {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .replace(/[^a-z0-9\s]+/g, " ")
        .split(/\s+/)
        .map((item) => item.trim())
        .filter((item) => item.length >= 3)
    )
  );
}

function overlapRatio(left: string[], right: string[]) {
  if (left.length === 0 || right.length === 0) return 0;
  const rightSet = new Set(right);
  const overlap = left.filter((item) => rightSet.has(item)).length;
  return overlap / Math.max(1, Math.min(left.length, right.length));
}

function isShallowDuplicate(leftTitle: string, leftDescription: string, rightTitle: string, rightDescription: string) {
  const titleScore = overlapRatio(tokenize(leftTitle), tokenize(rightTitle));
  const descriptionScore = overlapRatio(tokenize(leftDescription), tokenize(rightDescription));
  const normalizedLeftDescription = normalize(leftDescription);
  const normalizedRightDescription = normalize(rightDescription);
  return (
    titleScore >= 0.8 ||
    (titleScore >= 0.5 && descriptionScore >= 0.6) ||
    (normalizedLeftDescription.length > 0 && normalizedLeftDescription === normalizedRightDescription)
  );
}

function uniqueMessages(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function chapterDescriptionFallback(title: string) {
  return `Build practical confidence in ${title.toLowerCase()}.`;
}

function unitDescriptionFallback(title: string, chapterTitle: string) {
  return `Practice ${title.toLowerCase()} within ${chapterTitle.toLowerCase()}.`;
}

function lessonDescriptionFallback(title: string, unitTitle: string) {
  return `Use ${title.toLowerCase()} naturally inside ${unitTitle.toLowerCase()}.`;
}

export class CurriculumRefinerService {
  constructor(
    private readonly chapters: ChapterRepository,
    private readonly units: UnitRepository,
    private readonly lessons: LessonRepository,
    private readonly architect: CurriculumArchitectService,
    private readonly unitPlanner: CurriculumUnitPlannerService,
    private readonly lessonPlanner: CurriculumLessonPlannerService
  ) {}

  async refineChapterPlan(input: {
    job: CurriculumBuildJobEntity;
    chapterPlan: CurriculumBuildJobChapterPlan[];
    critic: CurriculumCriticResult;
  }): Promise<{
    chapterPlan: CurriculumBuildJobChapterPlan[];
    summary: string;
    fixesApplied: string[];
    unresolvedIssues: string[];
    fixed: boolean;
  }> {
    if (input.critic.ok) {
      return {
        chapterPlan: input.chapterPlan,
        summary: "No chapter-plan refinement needed after local review.",
        fixesApplied: [],
        unresolvedIssues: [],
        fixed: false
      };
    }

    const fixesApplied: string[] = [];
    let nextPlan = [...input.chapterPlan]
      .sort((left, right) => left.orderIndex - right.orderIndex)
      .map((item, index) => {
        const description = item.description.trim() || chapterDescriptionFallback(item.title);
        if (!item.description.trim()) {
          fixesApplied.push(`Filled chapter-plan description for "${item.title}".`);
        }
        if (item.orderIndex !== index) {
          fixesApplied.push(`Resequenced chapter-plan order for "${item.title}".`);
        }
        return {
          ...item,
          description,
          orderIndex: index
        };
      });

    const accepted: CurriculumBuildJobChapterPlan[] = [];
    for (const item of nextPlan) {
      const duplicate = accepted.find(
        (existing) =>
          normalize(existing.title) === normalize(item.title) ||
          isShallowDuplicate(existing.title, existing.description, item.title, item.description)
      );
      if (!duplicate) {
        accepted.push(item);
        continue;
      }

      const replacement = await this.architect.replanChapterCandidate({
        language: input.job.language,
        languageId: input.job.languageId,
        level: input.job.level,
        topic: input.job.topic || undefined,
        extraInstructions: input.job.extraInstructions || undefined,
        cefrTarget: input.job.cefrTarget || undefined,
        orderIndex: item.orderIndex,
        excludedChapterTitles: [
          ...input.job.artifacts.priorChapterTitles,
          ...accepted.map((entry) => entry.title)
        ]
      });
      accepted.push(replacement);
      fixesApplied.push(`Replanned duplicate/shallow-duplicate chapter "${item.title}" as "${replacement.title}".`);
    }

    const unresolvedIssues = uniqueMessages(
      input.critic.issues.filter((message) => !message.toLowerCase().includes("duplicate") && !message.toLowerCase().includes("similar"))
    );

    return {
      chapterPlan: accepted,
      summary:
        unresolvedIssues.length === 0
          ? fixesApplied.length > 0
            ? `Refiner applied ${fixesApplied.length} chapter-plan fix(es).`
            : "Refiner found no chapter-plan fix to apply."
          : `Refiner applied ${fixesApplied.length} chapter-plan fix(es) but ${unresolvedIssues.length} issue(s) remain.`,
      fixesApplied: uniqueMessages(fixesApplied),
      unresolvedIssues,
      fixed: fixesApplied.length > 0 && unresolvedIssues.length === 0
    };
  }

  async refineUnitPlan(input: {
    job: CurriculumBuildJobEntity;
    chapter: ChapterEntity;
    unitPlan: CurriculumBuildJobUnitPlan[];
    critic: CurriculumCriticResult;
  }): Promise<{
    unitPlan: CurriculumBuildJobUnitPlan[];
    summary: string;
    fixesApplied: string[];
    unresolvedIssues: string[];
    fixed: boolean;
  }> {
    if (input.critic.ok) {
      return {
        unitPlan: input.unitPlan,
        summary: "No unit-plan refinement needed after local review.",
        fixesApplied: [],
        unresolvedIssues: [],
        fixed: false
      };
    }

    const fixesApplied: string[] = [];
    let nextPlan = [...input.unitPlan]
      .sort((left, right) => left.orderIndex - right.orderIndex)
      .map((item, index) => {
        const description = item.description.trim() || unitDescriptionFallback(item.title, item.chapterTitle);
        if (!item.description.trim()) {
          fixesApplied.push(`Filled unit-plan description for "${item.title}".`);
        }
        if (item.orderIndex !== index) {
          fixesApplied.push(`Resequenced unit-plan order for "${item.title}".`);
        }
        return {
          ...item,
          description,
          orderIndex: index
        };
      });

    if (nextPlan.length === 0) {
      const fallback = await this.unitPlanner.replanUnitForChapter({
        chapter: input.chapter,
        languageId: input.job.languageId,
        topic: input.job.topic || undefined,
        extraInstructions: input.job.extraInstructions || undefined,
        cefrTarget: input.job.cefrTarget || undefined,
        priorUnitTitles: input.job.artifacts.priorUnitTitles,
        memorySummary: input.job.artifacts.memorySummary,
        excludedUnitTitles: input.job.artifacts.priorUnitTitles,
        orderIndex: 0
      });
      nextPlan = [fallback];
      fixesApplied.push(`Generated fallback unit plan "${fallback.title}" for chapter "${input.chapter.title}".`);
    }

    const accepted: CurriculumBuildJobUnitPlan[] = [];
    for (const item of nextPlan) {
      const duplicate = accepted.find(
        (existing) =>
          normalize(existing.title) === normalize(item.title) ||
          isShallowDuplicate(existing.title, existing.description, item.title, item.description)
      );
      if (!duplicate) {
        accepted.push(item);
        continue;
      }

      const replacement = await this.unitPlanner.replanUnitForChapter({
        chapter: input.chapter,
        languageId: input.job.languageId,
        topic: input.job.topic || undefined,
        extraInstructions: input.job.extraInstructions || undefined,
        cefrTarget: input.job.cefrTarget || undefined,
        priorUnitTitles: [...input.job.artifacts.priorUnitTitles, ...accepted.map((entry) => entry.title)],
        memorySummary: input.job.artifacts.memorySummary,
        excludedUnitTitles: [...accepted.map((entry) => entry.title)],
        orderIndex: item.orderIndex
      });
      accepted.push(replacement);
      fixesApplied.push(`Replanned duplicate/shallow-duplicate unit "${item.title}" as "${replacement.title}".`);
    }

    const unresolvedIssues = uniqueMessages(
      input.critic.issues.filter((message) => !message.toLowerCase().includes("duplicate") && !message.toLowerCase().includes("similar"))
    );

    return {
      unitPlan: accepted,
      summary:
        unresolvedIssues.length === 0
          ? fixesApplied.length > 0
            ? `Refiner applied ${fixesApplied.length} unit-plan fix(es).`
            : "Refiner found no unit-plan fix to apply."
          : `Refiner applied ${fixesApplied.length} unit-plan fix(es) but ${unresolvedIssues.length} issue(s) remain.`,
      fixesApplied: uniqueMessages(fixesApplied),
      unresolvedIssues,
      fixed: fixesApplied.length > 0 && unresolvedIssues.length === 0
    };
  }

  async refineLessonPlan(input: {
    job: CurriculumBuildJobEntity;
    chapter: ChapterEntity;
    unit: UnitEntity;
    lessonPlan: CurriculumBuildJobLessonPlan[];
    critic: CurriculumCriticResult;
  }): Promise<{
    lessonPlan: CurriculumBuildJobLessonPlan[];
    summary: string;
    fixesApplied: string[];
    unresolvedIssues: string[];
    fixed: boolean;
  }> {
    if (input.critic.ok) {
      return {
        lessonPlan: input.lessonPlan,
        summary: "No lesson-plan refinement needed after local review.",
        fixesApplied: [],
        unresolvedIssues: [],
        fixed: false
      };
    }

    const fixesApplied: string[] = [];
    let nextPlan = [...input.lessonPlan]
      .sort((left, right) => left.orderIndex - right.orderIndex)
      .map((item, index) => {
        const description = item.description.trim() || lessonDescriptionFallback(item.title, item.unitTitle);
        if (!item.description.trim()) {
          fixesApplied.push(`Filled lesson-plan description for "${item.title}".`);
        }
        if (item.orderIndex !== index) {
          fixesApplied.push(`Resequenced lesson-plan order for "${item.title}".`);
        }
        return {
          ...item,
          description,
          orderIndex: index
        };
      });

    if (nextPlan.length === 0) {
      const fallback = await this.lessonPlanner.replanLessonForUnit({
        chapter: input.chapter,
        unit: input.unit,
        languageId: input.job.languageId,
        topic: input.job.topic || undefined,
        extraInstructions: input.job.extraInstructions || undefined,
        cefrTarget: input.job.cefrTarget || undefined,
        priorUnitTitles: input.job.artifacts.priorUnitTitles,
        memorySummary: input.job.artifacts.memorySummary,
        excludedLessonTitles: [],
        orderIndex: 0
      });
      nextPlan = [fallback];
      fixesApplied.push(`Generated fallback lesson plan "${fallback.title}" for unit "${input.unit.title}".`);
    }

    const accepted: CurriculumBuildJobLessonPlan[] = [];
    for (const item of nextPlan) {
      const duplicate = accepted.find(
        (existing) =>
          normalize(existing.title) === normalize(item.title) ||
          isShallowDuplicate(existing.title, existing.description, item.title, item.description)
      );
      if (!duplicate) {
        accepted.push(item);
        continue;
      }

      const replacement = await this.lessonPlanner.replanLessonForUnit({
        chapter: input.chapter,
        unit: input.unit,
        languageId: input.job.languageId,
        topic: input.job.topic || undefined,
        extraInstructions: input.job.extraInstructions || undefined,
        cefrTarget: input.job.cefrTarget || undefined,
        priorUnitTitles: input.job.artifacts.priorUnitTitles,
        memorySummary: input.job.artifacts.memorySummary,
        excludedLessonTitles: [...accepted.map((entry) => entry.title)],
        orderIndex: item.orderIndex
      });
      accepted.push(replacement);
      fixesApplied.push(`Replanned duplicate/shallow-duplicate lesson "${item.title}" as "${replacement.title}".`);
    }

    const unresolvedIssues = uniqueMessages(
      input.critic.issues.filter((message) => !message.toLowerCase().includes("duplicate") && !message.toLowerCase().includes("similar"))
    );

    return {
      lessonPlan: accepted,
      summary:
        unresolvedIssues.length === 0
          ? fixesApplied.length > 0
            ? `Refiner applied ${fixesApplied.length} lesson-plan fix(es).`
            : "Refiner found no lesson-plan fix to apply."
          : `Refiner applied ${fixesApplied.length} lesson-plan fix(es) but ${unresolvedIssues.length} issue(s) remain.`,
      fixesApplied: uniqueMessages(fixesApplied),
      unresolvedIssues,
      fixed: fixesApplied.length > 0 && unresolvedIssues.length === 0
    };
  }

  async refine(input: { job: CurriculumBuildJobEntity; critic: CurriculumCriticResult }): Promise<CurriculumRefinerResult> {
    if (input.critic.ok) {
      return {
        fixed: false,
        summary: "No refinement needed after critic pass.",
        fixesApplied: [],
        unresolvedIssues: []
      };
    }

    const fixesApplied: string[] = [];
    const unresolvedIssues = [...input.critic.issues];

    let chapterPlan = input.job.artifacts.chapterPlan.map((item) => ({ ...item }));
    let unitPlan = input.job.artifacts.unitPlan.map((item) => ({ ...item }));
    let lessonPlan = input.job.artifacts.lessonPlan.map((item) => ({ ...item }));

    const chapterFix = await this.ensureChaptersCreated(input.job, chapterPlan);
    chapterPlan = chapterFix.chapterPlan;
    fixesApplied.push(...chapterFix.fixesApplied);

    const unitFix = await this.ensureUnitsCreated(input.job, chapterPlan, unitPlan);
    unitPlan = unitFix.unitPlan;
    fixesApplied.push(...unitFix.fixesApplied);

    const lessonFix = await this.ensureLessonsCreated(input.job, unitPlan, lessonPlan);
    lessonPlan = lessonFix.lessonPlan;
    fixesApplied.push(...lessonFix.fixesApplied);

    const descriptionFix = await this.fillBlankDescriptions(chapterPlan, unitPlan, lessonPlan);
    chapterPlan = descriptionFix.chapterPlan;
    unitPlan = descriptionFix.unitPlan;
    lessonPlan = descriptionFix.lessonPlan;
    fixesApplied.push(...descriptionFix.fixesApplied);

    const orderFix = await this.resequenceOrderIndexes(chapterPlan, unitPlan, lessonPlan);
    chapterPlan = orderFix.chapterPlan;
    unitPlan = orderFix.unitPlan;
    lessonPlan = orderFix.lessonPlan;
    fixesApplied.push(...orderFix.fixesApplied);

    const childFix = await this.ensureEachParentHasChildren(input.job, chapterPlan, unitPlan, lessonPlan);
    unitPlan = childFix.unitPlan;
    lessonPlan = childFix.lessonPlan;
    fixesApplied.push(...childFix.fixesApplied);

    const duplicateChapterTitles = this.findDuplicates(chapterPlan.map((item) => item.title));
    const duplicateUnitTitles = this.findDuplicates(unitPlan.map((item) => `${item.chapterId}:${item.title}`));
    const duplicateLessonTitles = this.findDuplicates(lessonPlan.map((item) => `${item.unitId}:${item.title}`));

    if (duplicateChapterTitles.length > 0) {
      unresolvedIssues.push(`Duplicate chapter titles still require manual review: ${duplicateChapterTitles.join(", ")}.`);
    }
    if (duplicateUnitTitles.length > 0) {
      unresolvedIssues.push(`Duplicate unit titles still require manual review: ${duplicateUnitTitles.join(", ")}.`);
    }
    if (duplicateLessonTitles.length > 0) {
      unresolvedIssues.push(`Duplicate lesson titles still require manual review: ${duplicateLessonTitles.join(", ")}.`);
    }

    const dedupedFixes = uniqueMessages(fixesApplied);
    const dedupedUnresolved = uniqueMessages(unresolvedIssues);

    return {
      fixed: dedupedUnresolved.length === 0 && dedupedFixes.length > 0,
      summary:
        dedupedUnresolved.length === 0
          ? dedupedFixes.length > 0
            ? `Refiner applied ${dedupedFixes.length} bounded fix(es).`
            : "Refiner found no bounded automatic fix to apply."
          : `Refiner applied ${dedupedFixes.length} bounded fix(es) but ${dedupedUnresolved.length} issue(s) still require manual review.`,
      fixesApplied: dedupedFixes,
      unresolvedIssues: dedupedUnresolved,
      artifacts: {
        ...input.job.artifacts,
        chapterPlan,
        unitPlan,
        lessonPlan
      }
    };
  }

  private findDuplicates(values: string[]) {
    const buckets = new Map<string, number>();
    for (const value of values) {
      const key = normalize(value);
      if (!key) continue;
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }
    return Array.from(buckets.entries())
      .filter(([, count]) => count > 1)
      .map(([value]) => value);
  }

  private async ensureChaptersCreated(
    job: CurriculumBuildJobEntity,
    chapterPlan: CurriculumBuildJobChapterPlan[]
  ) {
    const fixesApplied: string[] = [];
    const existingChapters = await this.chapters.listByLanguage(job.language, job.languageId || undefined);
    const scopedExisting = existingChapters.filter((chapter) => chapter.level === job.level);
    const byTitle = new Map(scopedExisting.map((chapter) => [normalize(chapter.title), chapter]));

    const nextPlan: CurriculumBuildJobChapterPlan[] = [];
    for (const item of chapterPlan) {
      if (item.status === "created" && item.chapterId) {
        nextPlan.push(item);
        continue;
      }

      const existing = byTitle.get(normalize(item.title));
      if (existing) {
        nextPlan.push({
          ...item,
          chapterId: existing.id,
          orderIndex: existing.orderIndex,
          status: "created"
        });
        fixesApplied.push(`Resolved missing chapter shell for "${item.title}".`);
        continue;
      }

      const created = await this.chapters.create({
        title: item.title,
        description: item.description || chapterDescriptionFallback(item.title),
        language: job.language,
        level: job.level,
        orderIndex: item.orderIndex,
        status: "draft",
        createdBy: job.createdBy
      });
      byTitle.set(normalize(item.title), created);
      nextPlan.push({
        ...item,
        chapterId: created.id,
        orderIndex: created.orderIndex,
        status: "created"
      });
      fixesApplied.push(`Created missing chapter shell for "${item.title}".`);
    }

    return { chapterPlan: nextPlan, fixesApplied };
  }

  private async ensureUnitsCreated(
    job: CurriculumBuildJobEntity,
    chapterPlan: CurriculumBuildJobChapterPlan[],
    unitPlan: CurriculumBuildJobUnitPlan[]
  ) {
    const fixesApplied: string[] = [];
    const nextPlan: CurriculumBuildJobUnitPlan[] = [];

    for (const chapter of chapterPlan) {
      if (!chapter.chapterId) continue;
      const existingUnits = await this.units.listByChapterId(chapter.chapterId);
      const byTitle = new Map(existingUnits.map((unit) => [normalize(unit.title), unit]));
      const items = unitPlan.filter((item) => item.chapterId === chapter.chapterId);
      for (const item of items) {
        if (item.status === "created" && item.unitId) {
          nextPlan.push(item);
          continue;
        }

        const existing = byTitle.get(normalize(item.title));
        if (existing) {
          nextPlan.push({
            ...item,
            unitId: existing.id,
            orderIndex: existing.orderIndex,
            status: "created"
          });
          fixesApplied.push(`Resolved missing unit shell for "${item.title}".`);
          continue;
        }

        const created = await this.units.create({
          chapterId: chapter.chapterId,
          title: item.title,
          description: item.description || unitDescriptionFallback(item.title, chapter.title),
          language: job.language,
          level: job.level,
          orderIndex: item.orderIndex,
          status: "draft",
          createdBy: job.createdBy
        });
        byTitle.set(normalize(item.title), created);
        nextPlan.push({
          ...item,
          unitId: created.id,
          orderIndex: created.orderIndex,
          status: "created"
        });
        fixesApplied.push(`Created missing unit shell for "${item.title}".`);
      }
    }

    return { unitPlan: nextPlan, fixesApplied };
  }

  private async ensureLessonsCreated(
    job: CurriculumBuildJobEntity,
    unitPlan: CurriculumBuildJobUnitPlan[],
    lessonPlan: CurriculumBuildJobLessonPlan[]
  ) {
    const fixesApplied: string[] = [];
    const nextPlan: CurriculumBuildJobLessonPlan[] = [];

    for (const unit of unitPlan) {
      if (!unit.unitId) continue;
      const existingLessons = await this.lessons.listByUnitId(unit.unitId);
      const byTitle = new Map(existingLessons.map((lesson) => [normalize(lesson.title), lesson]));
      const items = lessonPlan.filter((item) => item.unitId === unit.unitId);
      for (const item of items) {
        if (item.status === "created" && item.lessonId) {
          nextPlan.push(item);
          continue;
        }

        const existing = byTitle.get(normalize(item.title));
        if (existing) {
          nextPlan.push({
            ...item,
            lessonId: existing.id,
            orderIndex: existing.orderIndex,
            status: "created"
          });
          fixesApplied.push(`Resolved missing lesson shell for "${item.title}".`);
          continue;
        }

        const created = await this.lessons.create({
          title: item.title,
          unitId: unit.unitId,
          language: job.language,
          level: job.level,
          orderIndex: item.orderIndex,
          description: item.description || lessonDescriptionFallback(item.title, unit.title),
          topics: job.topic ? [job.topic] : [],
          proverbs: [],
          stages: buildPedagogicalStages((index) => `stage-${index + 1}`),
          status: "draft",
          createdBy: job.createdBy
        });
        byTitle.set(normalize(item.title), created);
        nextPlan.push({
          ...item,
          lessonId: created.id,
          orderIndex: created.orderIndex,
          status: "created"
        });
        fixesApplied.push(`Created missing lesson shell for "${item.title}".`);
      }
    }

    // Keep any lessons whose unit was not available above so we do not silently drop artifacts.
    for (const item of lessonPlan) {
      if (!nextPlan.some((planned) => planned.unitId === item.unitId && planned.title === item.title)) {
        nextPlan.push(item);
      }
    }

    return { lessonPlan: nextPlan, fixesApplied };
  }

  private async fillBlankDescriptions(
    chapterPlan: CurriculumBuildJobChapterPlan[],
    unitPlan: CurriculumBuildJobUnitPlan[],
    lessonPlan: CurriculumBuildJobLessonPlan[]
  ) {
    const fixesApplied: string[] = [];

    const nextChapterPlan = await Promise.all(
      chapterPlan.map(async (item) => {
        if (item.description.trim() || !item.chapterId) return item;
        const description = chapterDescriptionFallback(item.title);
        await this.chapters.updateById(item.chapterId, { description });
        fixesApplied.push(`Filled chapter description for "${item.title}".`);
        return { ...item, description };
      })
    );

    const nextUnitPlan = await Promise.all(
      unitPlan.map(async (item) => {
        if (item.description.trim() || !item.unitId) return item;
        const description = unitDescriptionFallback(item.title, item.chapterTitle);
        await this.units.updateById(item.unitId, { description });
        fixesApplied.push(`Filled unit description for "${item.title}".`);
        return { ...item, description };
      })
    );

    const nextLessonPlan = await Promise.all(
      lessonPlan.map(async (item) => {
        if (item.description.trim() || !item.lessonId) return item;
        const description = lessonDescriptionFallback(item.title, item.unitTitle);
        await this.lessons.updateById(item.lessonId, { description });
        fixesApplied.push(`Filled lesson description for "${item.title}".`);
        return { ...item, description };
      })
    );

    return {
      chapterPlan: nextChapterPlan,
      unitPlan: nextUnitPlan,
      lessonPlan: nextLessonPlan,
      fixesApplied
    };
  }

  private async resequenceOrderIndexes(
    chapterPlan: CurriculumBuildJobChapterPlan[],
    unitPlan: CurriculumBuildJobUnitPlan[],
    lessonPlan: CurriculumBuildJobLessonPlan[]
  ) {
    const fixesApplied: string[] = [];

    const nextChapterPlan = [...chapterPlan]
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((item, index) => ({ ...item, orderIndex: index }));
    await Promise.all(
      nextChapterPlan.map(async (item) => {
        if (!item.chapterId) return;
        await this.chapters.updateById(item.chapterId, { orderIndex: item.orderIndex });
      })
    );
    if (chapterPlan.some((item, index) => item.orderIndex !== nextChapterPlan[index]?.orderIndex)) {
      fixesApplied.push("Resequenced chapter order indexes.");
    }

    const nextUnitPlan: CurriculumBuildJobUnitPlan[] = [];
    const unitsByChapter = new Map<string, CurriculumBuildJobUnitPlan[]>();
    for (const unit of unitPlan) {
      unitsByChapter.set(unit.chapterId, [...(unitsByChapter.get(unit.chapterId) || []), unit]);
    }
    for (const [chapterId, items] of unitsByChapter.entries()) {
      const resequenced = [...items]
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((item, index) => ({ ...item, orderIndex: index }));
      nextUnitPlan.push(...resequenced);
      await Promise.all(
        resequenced.map(async (item) => {
          if (!item.unitId) return;
          await this.units.updateById(item.unitId, { orderIndex: item.orderIndex, chapterId });
        })
      );
      if (items.some((item, index) => item.orderIndex !== resequenced[index]?.orderIndex)) {
        fixesApplied.push(`Resequenced unit order indexes for chapter ${chapterId}.`);
      }
    }

    const nextLessonPlan: CurriculumBuildJobLessonPlan[] = [];
    const lessonsByUnit = new Map<string, CurriculumBuildJobLessonPlan[]>();
    for (const lesson of lessonPlan) {
      lessonsByUnit.set(lesson.unitId, [...(lessonsByUnit.get(lesson.unitId) || []), lesson]);
    }
    for (const [unitId, items] of lessonsByUnit.entries()) {
      const resequenced = [...items]
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((item, index) => ({ ...item, orderIndex: index }));
      nextLessonPlan.push(...resequenced);
      await Promise.all(
        resequenced.map(async (item) => {
          if (!item.lessonId) return;
          await this.lessons.updateById(item.lessonId, { orderIndex: item.orderIndex, unitId });
        })
      );
      if (items.some((item, index) => item.orderIndex !== resequenced[index]?.orderIndex)) {
        fixesApplied.push(`Resequenced lesson order indexes for unit ${unitId}.`);
      }
    }

    return {
      chapterPlan: nextChapterPlan,
      unitPlan: nextUnitPlan.sort((a, b) => a.chapterId.localeCompare(b.chapterId) || a.orderIndex - b.orderIndex),
      lessonPlan: nextLessonPlan.sort((a, b) => a.unitId.localeCompare(b.unitId) || a.orderIndex - b.orderIndex),
      fixesApplied
    };
  }

  private async ensureEachParentHasChildren(
    job: CurriculumBuildJobEntity,
    chapterPlan: CurriculumBuildJobChapterPlan[],
    unitPlan: CurriculumBuildJobUnitPlan[],
    lessonPlan: CurriculumBuildJobLessonPlan[]
  ) {
    const fixesApplied: string[] = [];
    const nextUnitPlan = [...unitPlan];
    const nextLessonPlan = [...lessonPlan];

    for (const chapter of chapterPlan) {
      if (!chapter.chapterId) continue;
      const chapterUnits = nextUnitPlan.filter((item) => item.chapterId === chapter.chapterId);
      if (chapterUnits.length > 0) continue;
      const chapterEntity = await this.chapters.findById(chapter.chapterId);
      if (!chapterEntity) continue;
      const plannedUnits = await this.unitPlanner.planUnitsForChapter({
        chapter: chapterEntity,
        languageId: job.languageId,
        requestedUnitCount: 1,
        topic: job.topic || undefined,
        extraInstructions: job.extraInstructions || undefined,
        cefrTarget: job.cefrTarget || undefined,
        priorUnitTitles: [...job.artifacts.priorUnitTitles, ...nextUnitPlan.map((item) => item.title)],
        memorySummary: job.artifacts.memorySummary
      });
      for (const item of plannedUnits) {
        const createdUnit = await this.units.create({
          chapterId: chapter.chapterId,
          title: item.title,
          description: item.description || unitDescriptionFallback(item.title, chapter.title),
          language: job.language,
          level: job.level,
          orderIndex: item.orderIndex,
          status: "draft",
          createdBy: job.createdBy
        });
        nextUnitPlan.push({ ...item, unitId: createdUnit.id, orderIndex: createdUnit.orderIndex, status: "created" });
        fixesApplied.push(`Added fallback unit "${item.title}" under chapter "${chapter.title}".`);
      }
    }

    for (const unit of nextUnitPlan) {
      if (!unit.unitId) continue;
      const unitLessons = nextLessonPlan.filter((item) => item.unitId === unit.unitId);
      if (unitLessons.length > 0) continue;
      const unitEntity = await this.units.findById(unit.unitId);
      if (!unitEntity || !unitEntity.chapterId) continue;
      const chapterEntity = await this.chapters.findById(unitEntity.chapterId);
      if (!chapterEntity) continue;
      const plannedLessons = await this.lessonPlanner.planLessonsForUnit({
        chapter: chapterEntity,
        unit: unitEntity,
        languageId: job.languageId,
        requestedLessonCount: 1,
        topic: job.topic || undefined,
        extraInstructions: job.extraInstructions || undefined,
        cefrTarget: job.cefrTarget || undefined,
        priorUnitTitles: [...job.artifacts.priorUnitTitles, ...nextUnitPlan.map((item) => item.title)],
        memorySummary: job.artifacts.memorySummary
      });
      for (const item of plannedLessons) {
        const createdLesson = await this.lessons.create({
          title: item.title,
          unitId: unit.unitId,
          language: job.language,
          level: job.level,
          orderIndex: item.orderIndex,
          description: item.description || lessonDescriptionFallback(item.title, unit.title),
          topics: job.topic ? [job.topic] : [],
          proverbs: [],
          stages: buildPedagogicalStages((index) => `stage-${index + 1}`),
          status: "draft",
          createdBy: job.createdBy
        });
        nextLessonPlan.push({ ...item, lessonId: createdLesson.id, orderIndex: createdLesson.orderIndex, status: "created" });
        fixesApplied.push(`Added fallback lesson "${item.title}" under unit "${unit.title}".`);
      }
    }

    return { unitPlan: nextUnitPlan, lessonPlan: nextLessonPlan, fixesApplied };
  }
}
