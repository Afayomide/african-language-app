import type { LessonStage } from "../../domain/entities/Lesson.js";
import type { PhraseEntity } from "../../domain/entities/Phrase.js";
import type { PhraseRepository } from "../../domain/repositories/PhraseRepository.js";

function getSortedStages(stages: LessonStage[]) {
  return [...stages].sort((left, right) => left.orderIndex - right.orderIndex);
}

export function getStageOnePhraseIds(stages: LessonStage[]): string[] {
  const firstStage = getSortedStages(Array.isArray(stages) ? stages : [])[0];
  if (!firstStage) return [];

  return Array.from(
    new Set(
      (firstStage.blocks || [])
        .filter((block) => block.type === "phrase")
        .map((block) => String(block.refId || "").trim())
        .filter(Boolean)
    )
  );
}

export function wasPhraseIntroducedBeforeLesson(
  phrase: Pick<PhraseEntity, "introducedLessonIds">,
  lessonId: string,
  wasGeneratedInCurrentPass = false
) {
  const introducedLessonIds = Array.isArray(phrase.introducedLessonIds)
    ? phrase.introducedLessonIds.map(String).filter(Boolean)
    : [];

  if (introducedLessonIds.length > 0) {
    return introducedLessonIds.some((id) => id !== lessonId);
  }

  return !wasGeneratedInCurrentPass;
}

export class PhraseIntroductionService {
  constructor(private readonly phrases: PhraseRepository) {}

  async syncStageOneIntroductions(lessonId: string, stages: LessonStage[]) {
    const stageOnePhraseIds = getStageOnePhraseIds(stages);
    if (stageOnePhraseIds.length === 0) {
      return {
        scanned: 0,
        updated: 0,
        updatedPhraseIds: [] as string[]
      };
    }

    const phrases = await this.phrases.findByIds(stageOnePhraseIds);
    const updatedPhraseIds: string[] = [];

    for (const phrase of phrases) {
      const currentIntroducedLessonIds = Array.isArray(phrase.introducedLessonIds)
        ? phrase.introducedLessonIds.map(String).filter(Boolean)
        : [];
      if (currentIntroducedLessonIds.includes(lessonId)) continue;

      const nextIntroducedLessonIds = Array.from(new Set([...currentIntroducedLessonIds, lessonId]));
      const updated = await this.phrases.updateById(phrase.id, {
        introducedLessonIds: nextIntroducedLessonIds
      });
      if (updated) {
        updatedPhraseIds.push(updated.id);
      }
    }

    return {
      scanned: stageOnePhraseIds.length,
      updated: updatedPhraseIds.length,
      updatedPhraseIds
    };
  }
}
