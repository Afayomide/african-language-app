import type { LessonEntity } from "../../domain/entities/Lesson.js";
import type { PhraseEntity } from "../../domain/entities/Phrase.js";
import type { LessonRepository } from "../../domain/repositories/LessonRepository.js";
import type { PhraseRepository } from "../../domain/repositories/PhraseRepository.js";
import type { ProverbRepository } from "../../domain/repositories/ProverbRepository.js";
import type { QuestionRepository } from "../../domain/repositories/QuestionRepository.js";

type StageRefIds = {
  phraseIds: string[];
  proverbIds: string[];
};

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids.map(String).filter(Boolean)));
}

function collectStageRefIds(lesson: LessonEntity): StageRefIds {
  const phraseIds: string[] = [];
  const proverbIds: string[] = [];

  for (const stage of lesson.stages || []) {
    for (const block of stage.blocks || []) {
      if (!("refId" in block) || !block.refId) continue;
      if (block.type === "phrase") phraseIds.push(block.refId);
      if (block.type === "proverb") proverbIds.push(block.refId);
    }
  }

  return {
    phraseIds: uniqueIds(phraseIds),
    proverbIds: uniqueIds(proverbIds)
  };
}

function sortDeleted<T extends { deletedAt?: Date | null; updatedAt: Date }>(rows: T[]) {
  return [...rows].sort((left, right) => {
    const leftTime = left.deletedAt ? new Date(left.deletedAt).getTime() : new Date(left.updatedAt).getTime();
    const rightTime = right.deletedAt ? new Date(right.deletedAt).getTime() : new Date(right.updatedAt).getTime();
    return rightTime - leftTime;
  });
}

export class UnitDeletedEntriesService {
  constructor(
    private readonly lessons: LessonRepository,
    private readonly phrases: PhraseRepository,
    private readonly proverbs: ProverbRepository,
    private readonly questions: QuestionRepository
  ) {}

  async list(unitId: string): Promise<{ lessons: LessonEntity[]; phrases: PhraseEntity[] }> {
    const [activeLessons, deletedLessons] = await Promise.all([
      this.lessons.listByUnitId(unitId),
      this.lessons.listDeletedByUnitId(unitId)
    ]);

    const unitLessonIds = uniqueIds([...activeLessons, ...deletedLessons].map((lesson) => lesson.id));
    const deletedStagePhraseIds = uniqueIds(
      deletedLessons.flatMap((lesson) => collectStageRefIds(lesson).phraseIds)
    );

    const phraseBuckets = await Promise.all([
      unitLessonIds.length > 0 ? this.phrases.listDeleted({ lessonIds: unitLessonIds }) : Promise.resolve([]),
      deletedStagePhraseIds.length > 0 ? this.phrases.listDeleted({ ids: deletedStagePhraseIds }) : Promise.resolve([])
    ]);

    const deletedPhraseMap = new Map<string, PhraseEntity>();
    for (const bucket of phraseBuckets) {
      for (const phrase of bucket) {
        deletedPhraseMap.set(phrase.id, phrase);
      }
    }

    return {
      lessons: sortDeleted(deletedLessons),
      phrases: sortDeleted(Array.from(deletedPhraseMap.values()))
    };
  }

  async restoreLesson(unitId: string, lessonId: string): Promise<LessonEntity | null> {
    const deletedLessons = await this.lessons.listDeletedByUnitId(unitId);
    const targetLesson = deletedLessons.find((lesson) => lesson.id === lessonId);
    if (!targetLesson) return null;

    const lastOrderIndex = await this.lessons.findLastOrderIndex(unitId);
    const restoredLesson = await this.lessons.restoreById(lessonId, (lastOrderIndex ?? -1) + 1);
    if (!restoredLesson) return null;

    const { phraseIds, proverbIds } = collectStageRefIds(targetLesson);

    await Promise.all([
      this.phrases.restoreByLessonId(restoredLesson.id),
      this.proverbs.restoreByLessonId(restoredLesson.id),
      this.questions.restoreByLessonId(restoredLesson.id)
    ]);

    for (const phraseId of phraseIds) {
      await this.phrases.restoreById(phraseId, [restoredLesson.id]);
    }

    for (const proverbId of proverbIds) {
      await this.proverbs.restoreById(proverbId, [restoredLesson.id]);
    }

    return restoredLesson;
  }

  async restorePhrase(unitId: string, phraseId: string): Promise<PhraseEntity | null> {
    const { lessons: deletedLessons, phrases: deletedPhrases } = await this.list(unitId);
    const targetPhrase = deletedPhrases.find((phrase) => phrase.id === phraseId);
    if (!targetPhrase) return null;

    const activeLessons = await this.lessons.listByUnitId(unitId);
    const unitLessons = [...activeLessons, ...deletedLessons];
    const referencedLessonIds = uniqueIds(
      unitLessons
        .filter((lesson) =>
          lesson.stages.some((stage) =>
            stage.blocks.some((block) => block.type === "phrase" && block.refId === phraseId)
          )
        )
        .map((lesson) => lesson.id)
    );
    const fallbackLessonIds = uniqueIds(unitLessons.map((lesson) => lesson.id));
    return this.phrases.restoreById(
      phraseId,
      referencedLessonIds.length > 0 ? referencedLessonIds : fallbackLessonIds
    );
  }
}
