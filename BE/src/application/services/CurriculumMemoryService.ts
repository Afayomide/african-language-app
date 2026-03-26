import type { ChapterEntity } from "../../domain/entities/Chapter.js";
import type { LessonEntity, Status } from "../../domain/entities/Lesson.js";
import type { UnitEntity } from "../../domain/entities/Unit.js";
import type { ChapterRepository } from "../../domain/repositories/ChapterRepository.js";
import type { ExpressionRepository } from "../../domain/repositories/ExpressionRepository.js";
import type { LessonContentItemRepository } from "../../domain/repositories/LessonContentItemRepository.js";
import type { LessonRepository } from "../../domain/repositories/LessonRepository.js";
import type { ProverbRepository } from "../../domain/repositories/ProverbRepository.js";
import type { SentenceRepository } from "../../domain/repositories/SentenceRepository.js";
import type { UnitRepository } from "../../domain/repositories/UnitRepository.js";
import type { WordRepository } from "../../domain/repositories/WordRepository.js";

type CurriculumMemoryUnitRecord = {
  chapterTitle: string | null;
  unitTitle: string;
  unitDescription: string;
  lessonTitles: string[];
  introducedWords: string[];
  introducedExpressions: string[];
  sentencePatterns: string[];
  proverbs: string[];
};

export type CurriculumMemoryResult = {
  unitTitles: string[];
  lessonTitles: string[];
  phraseTexts: string[];
  proverbTexts: string[];
  summary: string;
};

export type CurriculumChapterMemoryResult = {
  chapterTitles: string[];
  unitTitles: string[];
  summary: string;
};

const APPROVED_STATUSES = new Set<Status>(["finished", "published"]);

function isApprovedStatus(status: Status) {
  return APPROVED_STATUSES.has(status);
}

function uniqueTexts(values: Array<string | undefined | null>, limit: number) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = String(value || "").trim();
    if (!trimmed) continue;
    const key = trimmed.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
    if (result.length >= limit) break;
  }
  return result;
}

function shorten(text: string, maxLength: number) {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function sortByOrder<T extends { orderIndex: number; createdAt: Date }>(items: T[]) {
  return items
    .slice()
    .sort((left, right) => left.orderIndex - right.orderIndex || left.createdAt.getTime() - right.createdAt.getTime());
}

export class CurriculumMemoryService {
  constructor(
    private readonly chapters: ChapterRepository,
    private readonly units: UnitRepository,
    private readonly lessons: LessonRepository,
    private readonly lessonContentItems: LessonContentItemRepository,
    private readonly words: WordRepository,
    private readonly expressions: ExpressionRepository,
    private readonly sentences: SentenceRepository,
    private readonly proverbs: ProverbRepository
  ) {}

  private async selectRelevantPriorUnits(input: { unit: UnitEntity; maxUnits: number }) {
    const languageChapters = sortByOrder(
      (await this.chapters.listByLanguage(input.unit.language, input.unit.languageId || undefined)).filter((chapter) =>
        isApprovedStatus(chapter.status)
      )
    );
    const chapterOrderMap = new Map(languageChapters.map((chapter, index) => [chapter.id, index]));
    const currentChapterOrder =
      input.unit.chapterId && chapterOrderMap.has(input.unit.chapterId)
        ? (chapterOrderMap.get(input.unit.chapterId) as number)
        : Number.MAX_SAFE_INTEGER;

    const approvedUnits = sortByOrder(
      (await this.units.listByLanguage(input.unit.language, input.unit.languageId || undefined)).filter(
        (candidate) => candidate.id !== input.unit.id && isApprovedStatus(candidate.status)
      )
    );

    const scoredUnits = approvedUnits
      .map((candidate) => {
        const chapterOrder =
          candidate.chapterId && chapterOrderMap.has(candidate.chapterId)
            ? (chapterOrderMap.get(candidate.chapterId) as number)
            : Number.MAX_SAFE_INTEGER;
        const isSameChapter = Boolean(input.unit.chapterId && candidate.chapterId === input.unit.chapterId);
        const isPriorInSameChapter = isSameChapter && candidate.orderIndex < input.unit.orderIndex;
        const isPriorChapter = chapterOrder < currentChapterOrder;
        const isFallbackPrior = !input.unit.chapterId && candidate.orderIndex < input.unit.orderIndex;
        const isRelevant = isPriorInSameChapter || isPriorChapter || isFallbackPrior;
        const priority = isPriorInSameChapter ? 0 : isPriorChapter ? 1 : 2;
        return {
          candidate,
          isRelevant,
          priority,
          chapterOrder
        };
      })
      .filter((item) => item.isRelevant)
      .sort((left, right) => {
        if (left.priority !== right.priority) return left.priority - right.priority;
        if (left.chapterOrder !== right.chapterOrder) return right.chapterOrder - left.chapterOrder;
        if (left.candidate.orderIndex !== right.candidate.orderIndex) return right.candidate.orderIndex - left.candidate.orderIndex;
        return right.candidate.createdAt.getTime() - left.candidate.createdAt.getTime();
      })
      .slice(0, input.maxUnits)
      .map((item) => item.candidate)
      .reverse();

    return scoredUnits;
  }

  async buildUnitPlanningMemory(input: {
    unit: UnitEntity;
    chapter?: ChapterEntity | null;
    maxUnits?: number;
  }): Promise<CurriculumMemoryResult> {
    const selectedUnits = await this.selectRelevantPriorUnits({
      unit: input.unit,
      maxUnits: input.maxUnits ?? 6
    });
    if (selectedUnits.length === 0) {
      return {
        unitTitles: [],
        lessonTitles: [],
        phraseTexts: [],
        proverbTexts: [],
        summary: ""
      };
    }

    const unitLessonMap = new Map<string, LessonEntity[]>();
    const unitContentItemMap = new Map<string, Awaited<ReturnType<LessonContentItemRepository["list"]>>>();
    const allLessons: LessonEntity[] = [];
    for (const unit of selectedUnits) {
      const lessons = sortByOrder((await this.lessons.listByUnitId(unit.id)).filter((lesson) => isApprovedStatus(lesson.status)));
      unitLessonMap.set(unit.id, lessons);
      unitContentItemMap.set(unit.id, await this.lessonContentItems.list({ unitId: unit.id }));
      allLessons.push(...lessons);
    }

    const allLessonIds = new Set(allLessons.map((lesson) => lesson.id));
    const scopedContentItems = selectedUnits.flatMap((unit) => unitContentItemMap.get(unit.id) || []).filter((item) =>
      allLessonIds.has(item.lessonId)
    );

    const chapterMap = new Map<string, string>();
    const knownChapters = input.chapter ? [input.chapter] : [];
    for (const chapter of knownChapters) {
      if (chapter) chapterMap.set(chapter.id, chapter.title);
    }
    for (const chapter of await this.chapters.listByLanguage(input.unit.language, input.unit.languageId || undefined)) {
      chapterMap.set(chapter.id, chapter.title);
    }

    const introducedWordIds = uniqueTexts(
      scopedContentItems.filter((item) => item.role === "introduce" && item.contentType === "word").map((item) => item.contentId),
      200
    );
    const introducedExpressionIds = uniqueTexts(
      scopedContentItems.filter((item) => item.role === "introduce" && item.contentType === "expression").map((item) => item.contentId),
      200
    );
    const sentencePatternIds = uniqueTexts(
      scopedContentItems.filter((item) => item.contentType === "sentence").map((item) => item.contentId),
      200
    );

    const [wordDocs, expressionDocs, sentenceDocs, proverbDocs] = await Promise.all([
      introducedWordIds.length > 0 ? this.words.findByIds(introducedWordIds) : Promise.resolve([]),
      introducedExpressionIds.length > 0 ? this.expressions.findByIds(introducedExpressionIds) : Promise.resolve([]),
      sentencePatternIds.length > 0 ? this.sentences.findByIds(sentencePatternIds) : Promise.resolve([]),
      allLessonIds.size > 0 ? this.proverbs.list({ lessonIds: Array.from(allLessonIds) }) : Promise.resolve([])
    ]);

    const wordMap = new Map(wordDocs.map((item) => [item.id, item.text]));
    const expressionMap = new Map(expressionDocs.map((item) => [item.id, item.text]));
    const sentenceMap = new Map(sentenceDocs.map((item) => [item.id, item.text]));
    const proverbByLessonId = new Map<string, string[]>();
    for (const proverb of proverbDocs.filter((item) => isApprovedStatus(item.status))) {
      for (const lessonId of proverb.lessonIds || []) {
        const current = proverbByLessonId.get(lessonId) || [];
        current.push(proverb.text);
        proverbByLessonId.set(lessonId, current);
      }
    }

    const unitRecords: CurriculumMemoryUnitRecord[] = selectedUnits.map((unit) => {
      const lessons = unitLessonMap.get(unit.id) || [];
      const lessonIds = new Set(lessons.map((lesson) => lesson.id));
      const itemsForUnit = (unitContentItemMap.get(unit.id) || []).filter((item) => lessonIds.has(item.lessonId));
      const chapterTitle = unit.chapterId ? chapterMap.get(unit.chapterId) || null : null;
      const introducedWords = uniqueTexts(
        itemsForUnit
          .filter((item) => item.role === "introduce" && item.contentType === "word")
          .map((item) => wordMap.get(item.contentId)),
        8
      );
      const introducedExpressions = uniqueTexts(
        itemsForUnit
          .filter((item) => item.role === "introduce" && item.contentType === "expression")
          .map((item) => expressionMap.get(item.contentId)),
        8
      );
      const sentencePatterns = uniqueTexts(
        itemsForUnit.filter((item) => item.contentType === "sentence").map((item) => sentenceMap.get(item.contentId)),
        6
      );
      const proverbs = uniqueTexts(
        lessons.flatMap((lesson) => proverbByLessonId.get(lesson.id) || []),
        4
      );

      return {
        chapterTitle,
        unitTitle: unit.title,
        unitDescription: unit.description,
        lessonTitles: uniqueTexts(lessons.map((lesson) => lesson.title), 8),
        introducedWords,
        introducedExpressions,
        sentencePatterns,
        proverbs
      };
    });

    const lessonTitles = uniqueTexts(unitRecords.flatMap((record) => record.lessonTitles), 120);
    const phraseTexts = uniqueTexts(unitRecords.flatMap((record) => record.introducedExpressions), 150);
    const proverbTexts = uniqueTexts(unitRecords.flatMap((record) => record.proverbs), 100);
    const unitTitles = uniqueTexts(unitRecords.map((record) => record.unitTitle), 80);

    const summary = [
      `Approved curriculum memory for ${input.unit.language} ${input.unit.level} before this unit:`,
      ...unitRecords.map((record) =>
        [
          `${record.chapterTitle ? `Chapter: ${record.chapterTitle} | ` : ""}Unit: ${record.unitTitle}`,
          record.unitDescription ? `Purpose: ${shorten(record.unitDescription, 180)}` : "",
          record.lessonTitles.length > 0 ? `Lessons: ${record.lessonTitles.join(" | ")}` : "",
          record.introducedWords.length > 0 ? `Introduced words: ${record.introducedWords.join(" | ")}` : "",
          record.introducedExpressions.length > 0
            ? `Introduced expressions: ${record.introducedExpressions.join(" | ")}`
            : "",
          record.sentencePatterns.length > 0 ? `Sentence patterns: ${record.sentencePatterns.join(" | ")}` : "",
          record.proverbs.length > 0 ? `Proverbs: ${record.proverbs.join(" | ")}` : ""
        ]
          .filter(Boolean)
          .join("\n")
      )
    ]
      .filter(Boolean)
      .join("\n\n");

    return {
      unitTitles,
      lessonTitles,
      phraseTexts,
      proverbTexts,
      summary
    };
  }

  async buildChapterPlanningMemory(input: {
    language: UnitEntity["language"];
    languageId?: string | null;
    level: UnitEntity["level"];
    maxChapters?: number;
    maxUnitsPerChapter?: number;
  }): Promise<CurriculumChapterMemoryResult> {
    const approvedChapters = sortByOrder(
      (await this.chapters.listByLanguage(input.language, input.languageId || undefined)).filter(
        (chapter) => chapter.level === input.level && isApprovedStatus(chapter.status)
      )
    );

    const selectedChapters = approvedChapters.slice(-Math.max(1, input.maxChapters ?? 5));
    if (selectedChapters.length === 0) {
      return {
        chapterTitles: [],
        unitTitles: [],
        summary: ""
      };
    }

    const selectedChapterIds = new Set(selectedChapters.map((chapter) => chapter.id));
    const unitsByChapterId = new Map<string, UnitEntity[]>();
    const approvedUnits = sortByOrder(
      (await this.units.listByLanguage(input.language, input.languageId || undefined)).filter(
        (unit) => Boolean(unit.chapterId && selectedChapterIds.has(unit.chapterId)) && isApprovedStatus(unit.status)
      )
    );

    for (const unit of approvedUnits) {
      if (!unit.chapterId) continue;
      const current = unitsByChapterId.get(unit.chapterId) || [];
      current.push(unit);
      unitsByChapterId.set(unit.chapterId, current);
    }

    const maxUnitsPerChapter = Math.max(1, input.maxUnitsPerChapter ?? 6);
    const chapterTitles = uniqueTexts(selectedChapters.map((chapter) => chapter.title), 80);
    const unitTitles = uniqueTexts(
      selectedChapters.flatMap((chapter) =>
        (unitsByChapterId.get(chapter.id) || []).slice(0, maxUnitsPerChapter).map((unit) => unit.title)
      ),
      160
    );

    const summary = [
      `Approved curriculum memory for ${input.language} ${input.level} before these new chapters:`,
      ...selectedChapters.map((chapter) => {
        const chapterUnits = (unitsByChapterId.get(chapter.id) || []).slice(0, maxUnitsPerChapter);
        return [
          `Chapter: ${chapter.title}`,
          chapter.description ? `Purpose: ${shorten(chapter.description, 180)}` : "",
          chapterUnits.length > 0 ? `Units: ${chapterUnits.map((unit) => unit.title).join(" | ")}` : ""
        ]
          .filter(Boolean)
          .join("\n");
      })
    ]
      .filter(Boolean)
      .join("\n\n");

    return {
      chapterTitles,
      unitTitles,
      summary
    };
  }
}
