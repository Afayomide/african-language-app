import type {
  CurriculumBuildJobChapterPlan,
  CurriculumBuildJobEntity,
  CurriculumBuildJobLessonPlan,
  CurriculumBuildJobUnitPlan
} from "../../domain/entities/CurriculumBuildJob.js";

export type CurriculumCriticIssueCode =
  | "chapter_plan_count_mismatch"
  | "chapter_plan_empty"
  | "chapter_shell_missing"
  | "duplicate_chapter_title"
  | "shallow_duplicate_chapter_intent"
  | "blank_chapter_description"
  | "chapter_order_gap"
  | "unit_plan_count_mismatch"
  | "unit_plan_empty"
  | "unit_shell_missing"
  | "duplicate_unit_title"
  | "shallow_duplicate_unit_intent"
  | "blank_unit_description"
  | "chapter_without_units"
  | "unit_order_gap"
  | "lesson_plan_count_mismatch"
  | "lesson_plan_empty"
  | "lesson_shell_missing"
  | "duplicate_lesson_title"
  | "shallow_duplicate_lesson_intent"
  | "blank_lesson_description"
  | "unit_without_lessons"
  | "lesson_order_gap";

export type CurriculumCriticIssue = {
  code: CurriculumCriticIssueCode;
  message: string;
  chapterId?: string;
  chapterTitle?: string;
  unitId?: string;
  unitTitle?: string;
  lessonId?: string;
  lessonTitle?: string;
};

export type CurriculumCriticResult = {
  ok: boolean;
  issues: string[];
  issueDetails: CurriculumCriticIssue[];
  summary: string;
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

function pushIssue(target: CurriculumCriticIssue[], issue: CurriculumCriticIssue) {
  target.push(issue);
}

function findDuplicateGroups<T>(items: T[], getKey: (item: T) => string) {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const key = normalize(getKey(item));
    if (!key) continue;
    buckets.set(key, [...(buckets.get(key) || []), item]);
  }
  return Array.from(buckets.entries())
    .filter(([, grouped]) => grouped.length > 1)
    .map(([key, grouped]) => ({ key, grouped }));
}

function hasSequentialOrder(values: number[]) {
  if (values.length <= 1) return true;
  const sorted = [...values].sort((a, b) => a - b);
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index] !== sorted[index - 1] + 1) {
      return false;
    }
  }
  return true;
}

function finalize(issueDetails: CurriculumCriticIssue[], okSummary: string, failPrefix: string): CurriculumCriticResult {
  return {
    ok: issueDetails.length === 0,
    issues: issueDetails.map((issue) => issue.message),
    issueDetails,
    summary: issueDetails.length === 0 ? okSummary : `${failPrefix}: ${issueDetails.length} issue(s) found.`
  };
}

export class CurriculumCriticService {
  reviewChapterPlan(input: {
    requestedChapterCount: number;
    chapterPlan: CurriculumBuildJobChapterPlan[];
  }): CurriculumCriticResult {
    const issueDetails: CurriculumCriticIssue[] = [];
    if (input.chapterPlan.length === 0) {
      pushIssue(issueDetails, {
        code: "chapter_plan_empty",
        message: "No chapters were planned."
      });
    }
    if (input.chapterPlan.length !== input.requestedChapterCount) {
      pushIssue(issueDetails, {
        code: "chapter_plan_count_mismatch",
        message: `Expected ${input.requestedChapterCount} chapters but found ${input.chapterPlan.length} in chapterPlan.`
      });
    }
    for (const item of input.chapterPlan) {
      if (!item.description.trim()) {
        pushIssue(issueDetails, {
          code: "blank_chapter_description",
          message: `Chapter "${item.title}" is missing a description.`,
          chapterId: item.chapterId || undefined,
          chapterTitle: item.title
        });
      }
    }
    for (const duplicate of findDuplicateGroups(input.chapterPlan, (item) => item.title)) {
      for (const item of duplicate.grouped) {
        pushIssue(issueDetails, {
          code: "duplicate_chapter_title",
          message: `Duplicate chapter title detected: "${item.title}".`,
          chapterId: item.chapterId || undefined,
          chapterTitle: item.title
        });
      }
    }
    for (let index = 0; index < input.chapterPlan.length; index += 1) {
      for (let other = index + 1; other < input.chapterPlan.length; other += 1) {
        const left = input.chapterPlan[index];
        const right = input.chapterPlan[other];
        if (!isShallowDuplicate(left.title, left.description, right.title, right.description)) continue;
        pushIssue(issueDetails, {
          code: "shallow_duplicate_chapter_intent",
          message: `Chapter intent is too similar between "${left.title}" and "${right.title}".`,
          chapterId: right.chapterId || undefined,
          chapterTitle: right.title
        });
      }
    }
    if (!hasSequentialOrder(input.chapterPlan.map((item) => item.orderIndex))) {
      pushIssue(issueDetails, {
        code: "chapter_order_gap",
        message: "Chapter order indexes are not sequential."
      });
    }
    return finalize(issueDetails, "Architect chapter plan passed local review.", "Architect chapter plan failed local review");
  }

  reviewUnitPlan(input: {
    chapterId: string;
    chapterTitle: string;
    unitPlan: CurriculumBuildJobUnitPlan[];
    requestedUnitCount?: number;
  }): CurriculumCriticResult {
    const issueDetails: CurriculumCriticIssue[] = [];
    if (input.unitPlan.length === 0) {
      pushIssue(issueDetails, {
        code: "unit_plan_empty",
        message: `Chapter "${input.chapterTitle}" has no planned units.`,
        chapterId: input.chapterId,
        chapterTitle: input.chapterTitle
      });
    }
    if (input.requestedUnitCount && input.unitPlan.length !== input.requestedUnitCount) {
      pushIssue(issueDetails, {
        code: "unit_plan_count_mismatch",
        message: `Expected ${input.requestedUnitCount} units for chapter "${input.chapterTitle}" but found ${input.unitPlan.length}.`,
        chapterId: input.chapterId,
        chapterTitle: input.chapterTitle
      });
    }
    for (const item of input.unitPlan) {
      if (!item.description.trim()) {
        pushIssue(issueDetails, {
          code: "blank_unit_description",
          message: `Unit "${item.title}" is missing a description.`,
          chapterId: item.chapterId,
          chapterTitle: item.chapterTitle,
          unitId: item.unitId || undefined,
          unitTitle: item.title
        });
      }
    }
    for (const duplicate of findDuplicateGroups(input.unitPlan, (item) => item.title)) {
      for (const item of duplicate.grouped) {
        pushIssue(issueDetails, {
          code: "duplicate_unit_title",
          message: `Duplicate unit title detected within chapter "${input.chapterTitle}": "${item.title}".`,
          chapterId: item.chapterId,
          chapterTitle: item.chapterTitle,
          unitId: item.unitId || undefined,
          unitTitle: item.title
        });
      }
    }
    for (let index = 0; index < input.unitPlan.length; index += 1) {
      for (let other = index + 1; other < input.unitPlan.length; other += 1) {
        const left = input.unitPlan[index];
        const right = input.unitPlan[other];
        if (!isShallowDuplicate(left.title, left.description, right.title, right.description)) continue;
        pushIssue(issueDetails, {
          code: "shallow_duplicate_unit_intent",
          message: `Unit intent is too similar between "${left.title}" and "${right.title}" in chapter "${input.chapterTitle}".`,
          chapterId: right.chapterId,
          chapterTitle: right.chapterTitle,
          unitId: right.unitId || undefined,
          unitTitle: right.title
        });
      }
    }
    if (!hasSequentialOrder(input.unitPlan.map((item) => item.orderIndex))) {
      pushIssue(issueDetails, {
        code: "unit_order_gap",
        message: `Units under chapter "${input.chapterTitle}" do not have sequential order indexes.`,
        chapterId: input.chapterId,
        chapterTitle: input.chapterTitle
      });
    }
    return finalize(issueDetails, `Unit plan passed local review for chapter "${input.chapterTitle}".`, `Unit plan failed local review for chapter "${input.chapterTitle}"`);
  }

  reviewLessonPlan(input: {
    chapterId: string;
    chapterTitle: string;
    unitId: string;
    unitTitle: string;
    lessonPlan: CurriculumBuildJobLessonPlan[];
    requestedLessonCount?: number;
  }): CurriculumCriticResult {
    const issueDetails: CurriculumCriticIssue[] = [];
    if (input.lessonPlan.length === 0) {
      pushIssue(issueDetails, {
        code: "lesson_plan_empty",
        message: `Unit "${input.unitTitle}" has no planned lessons.`,
        chapterId: input.chapterId,
        chapterTitle: input.chapterTitle,
        unitId: input.unitId,
        unitTitle: input.unitTitle
      });
    }
    if (input.requestedLessonCount && input.lessonPlan.length !== input.requestedLessonCount) {
      pushIssue(issueDetails, {
        code: "lesson_plan_count_mismatch",
        message: `Expected ${input.requestedLessonCount} lessons for unit "${input.unitTitle}" but found ${input.lessonPlan.length}.`,
        chapterId: input.chapterId,
        chapterTitle: input.chapterTitle,
        unitId: input.unitId,
        unitTitle: input.unitTitle
      });
    }
    for (const item of input.lessonPlan) {
      if (!item.description.trim()) {
        pushIssue(issueDetails, {
          code: "blank_lesson_description",
          message: `Lesson "${item.title}" is missing a description.`,
          chapterId: item.chapterId,
          chapterTitle: item.chapterTitle,
          unitId: item.unitId,
          unitTitle: item.unitTitle,
          lessonId: item.lessonId || undefined,
          lessonTitle: item.title
        });
      }
    }
    for (const duplicate of findDuplicateGroups(input.lessonPlan, (item) => item.title)) {
      for (const item of duplicate.grouped) {
        pushIssue(issueDetails, {
          code: "duplicate_lesson_title",
          message: `Duplicate lesson title detected within unit "${input.unitTitle}": "${item.title}".`,
          chapterId: item.chapterId,
          chapterTitle: item.chapterTitle,
          unitId: item.unitId,
          unitTitle: item.unitTitle,
          lessonId: item.lessonId || undefined,
          lessonTitle: item.title
        });
      }
    }
    for (let index = 0; index < input.lessonPlan.length; index += 1) {
      for (let other = index + 1; other < input.lessonPlan.length; other += 1) {
        const left = input.lessonPlan[index];
        const right = input.lessonPlan[other];
        if (!isShallowDuplicate(left.title, left.description, right.title, right.description)) continue;
        pushIssue(issueDetails, {
          code: "shallow_duplicate_lesson_intent",
          message: `Lesson intent is too similar between "${left.title}" and "${right.title}" in unit "${input.unitTitle}".`,
          chapterId: right.chapterId,
          chapterTitle: right.chapterTitle,
          unitId: right.unitId,
          unitTitle: right.unitTitle,
          lessonId: right.lessonId || undefined,
          lessonTitle: right.title
        });
      }
    }
    if (!hasSequentialOrder(input.lessonPlan.map((item) => item.orderIndex))) {
      pushIssue(issueDetails, {
        code: "lesson_order_gap",
        message: `Lessons under unit "${input.unitTitle}" do not have sequential order indexes.`,
        chapterId: input.chapterId,
        chapterTitle: input.chapterTitle,
        unitId: input.unitId,
        unitTitle: input.unitTitle
      });
    }
    return finalize(issueDetails, `Lesson plan passed local review for unit "${input.unitTitle}".`, `Lesson plan failed local review for unit "${input.unitTitle}"`);
  }

  review(job: CurriculumBuildJobEntity): CurriculumCriticResult {
    const issueDetails: CurriculumCriticIssue[] = [];
    issueDetails.push(...this.reviewChapterPlan({ requestedChapterCount: job.requestedChapterCount, chapterPlan: job.artifacts.chapterPlan }).issueDetails);

    for (const item of job.artifacts.chapterPlan) {
      if (item.status !== "created" || !item.chapterId) {
        pushIssue(issueDetails, {
          code: "chapter_shell_missing",
          message: `Chapter shell for "${item.title}" was not created successfully.`,
          chapterId: item.chapterId || undefined,
          chapterTitle: item.title
        });
      }
    }

    const unitsByChapter = new Map<string, CurriculumBuildJobUnitPlan[]>();
    for (const unit of job.artifacts.unitPlan) {
      unitsByChapter.set(unit.chapterId, [...(unitsByChapter.get(unit.chapterId) || []), unit]);
      if (unit.status !== "created" || !unit.unitId) {
        pushIssue(issueDetails, {
          code: "unit_shell_missing",
          message: `Unit shell for "${unit.title}" was not created successfully.`,
          chapterId: unit.chapterId,
          chapterTitle: unit.chapterTitle,
          unitId: unit.unitId || undefined,
          unitTitle: unit.title
        });
      }
    }

    for (const chapter of job.artifacts.chapterPlan) {
      if (!chapter.chapterId) continue;
      const chapterUnits = unitsByChapter.get(chapter.chapterId) || [];
      if (chapterUnits.length === 0) {
        pushIssue(issueDetails, {
          code: "chapter_without_units",
          message: `Chapter "${chapter.title}" has no units.`,
          chapterId: chapter.chapterId,
          chapterTitle: chapter.title
        });
        continue;
      }
      issueDetails.push(...this.reviewUnitPlan({ chapterId: chapter.chapterId, chapterTitle: chapter.title, unitPlan: chapterUnits }).issueDetails);
    }

    const lessonsByUnit = new Map<string, CurriculumBuildJobLessonPlan[]>();
    for (const lesson of job.artifacts.lessonPlan) {
      lessonsByUnit.set(lesson.unitId, [...(lessonsByUnit.get(lesson.unitId) || []), lesson]);
      if (lesson.status !== "created" || !lesson.lessonId) {
        pushIssue(issueDetails, {
          code: "lesson_shell_missing",
          message: `Lesson shell for "${lesson.title}" was not created successfully.`,
          chapterId: lesson.chapterId,
          chapterTitle: lesson.chapterTitle,
          unitId: lesson.unitId,
          unitTitle: lesson.unitTitle,
          lessonId: lesson.lessonId || undefined,
          lessonTitle: lesson.title
        });
      }
    }

    for (const unit of job.artifacts.unitPlan) {
      if (!unit.unitId) continue;
      const unitLessons = lessonsByUnit.get(unit.unitId) || [];
      if (unitLessons.length === 0) {
        pushIssue(issueDetails, {
          code: "unit_without_lessons",
          message: `Unit "${unit.title}" has no lessons.`,
          chapterId: unit.chapterId,
          chapterTitle: unit.chapterTitle,
          unitId: unit.unitId,
          unitTitle: unit.title
        });
        continue;
      }
      issueDetails.push(
        ...this.reviewLessonPlan({
          chapterId: unit.chapterId,
          chapterTitle: unit.chapterTitle,
          unitId: unit.unitId,
          unitTitle: unit.title,
          lessonPlan: unitLessons
        }).issueDetails
      );
    }

    return finalize(issueDetails, "Curriculum build job passed final review.", "Curriculum build job failed final review");
  }
}
