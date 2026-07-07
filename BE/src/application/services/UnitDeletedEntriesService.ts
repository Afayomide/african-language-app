import type { LessonEntity } from "../../domain/entities/Lesson.js";
import type { ExpressionEntity } from "../../domain/entities/Expression.js";
import type { ProverbEntity } from "../../domain/entities/Proverb.js";
import type { SentenceEntity } from "../../domain/entities/Sentence.js";
import type { WordEntity } from "../../domain/entities/Word.js";
import type { ExpressionRepository } from "../../domain/repositories/ExpressionRepository.js";
import type { LessonRepository } from "../../domain/repositories/LessonRepository.js";
import type { ProverbRepository } from "../../domain/repositories/ProverbRepository.js";
import type { QuestionRepository } from "../../domain/repositories/QuestionRepository.js";
import type { SentenceRepository } from "../../domain/repositories/SentenceRepository.js";
import type { WordRepository } from "../../domain/repositories/WordRepository.js";

type StageRefIds = {
  wordIds: string[];
  expressionIds: string[];
  sentenceIds: string[];
  proverbIds: string[];
  questionIds: string[];
};

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids.map(String).filter(Boolean)));
}

function collectStageRefIds(lesson: LessonEntity): StageRefIds {
  const wordIds: string[] = [];
  const expressionIds: string[] = [];
  const sentenceIds: string[] = [];
  const proverbIds: string[] = [];
  const questionIds: string[] = [];

  for (const stage of lesson.stages || []) {
    for (const block of stage.blocks || []) {
      if (!("refId" in block) || !block.refId) continue;
      if (block.type === "content" && block.contentType === "word") wordIds.push(block.refId);
      if (block.type === "content" && block.contentType === "expression") expressionIds.push(block.refId);
      if (block.type === "content" && block.contentType === "sentence") sentenceIds.push(block.refId);
      if (block.type === "proverb") proverbIds.push(block.refId);
      if (block.type === "question") questionIds.push(block.refId);
    }
  }

  return {
    wordIds: uniqueIds(wordIds),
    expressionIds: uniqueIds(expressionIds),
    sentenceIds: uniqueIds(sentenceIds),
    proverbIds: uniqueIds(proverbIds),
    questionIds: uniqueIds(questionIds)
  };
}

function collectLessonIdsForRef(lessons: LessonEntity[], refType: "word" | "expression" | "sentence" | "proverb", refId: string) {
  return lessons
    .filter((lesson) =>
      (lesson.stages || []).some((stage) =>
        (stage.blocks || []).some((block) => {
          if (!("refId" in block) || String(block.refId || "") !== refId) return false;
          if (refType === "proverb") return block.type === "proverb";
          return block.type === "content" && block.contentType === refType;
        })
      )
    )
    .map((lesson) => lesson.id);
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
    private readonly words: WordRepository,
    private readonly expressions: ExpressionRepository,
    private readonly sentences: SentenceRepository,
    private readonly proverbs: ProverbRepository,
    private readonly questions: QuestionRepository
  ) {}

  async list(unitId: string): Promise<{
    lessons: LessonEntity[];
    words: WordEntity[];
    expressions: ExpressionEntity[];
    sentences: SentenceEntity[];
    proverbs: ProverbEntity[];
  }> {
    const [activeLessons, deletedLessons] = await Promise.all([
      this.lessons.listByUnitId(unitId),
      this.lessons.listDeletedByUnitId(unitId)
    ]);
    const scopedLessons = [...activeLessons, ...deletedLessons];

    const wordIds = uniqueIds(
      scopedLessons.flatMap((lesson) => collectStageRefIds(lesson).wordIds)
    );
    const expressionIds = uniqueIds(
      scopedLessons.flatMap((lesson) => collectStageRefIds(lesson).expressionIds)
    );
    const sentenceIds = uniqueIds(
      scopedLessons.flatMap((lesson) => collectStageRefIds(lesson).sentenceIds)
    );
    const proverbIds = uniqueIds(
      scopedLessons.flatMap((lesson) => collectStageRefIds(lesson).proverbIds)
    );
    const questionIds = uniqueIds(
      scopedLessons.flatMap((lesson) => collectStageRefIds(lesson).questionIds)
    );
    const deletedQuestions = questionIds.length > 0
      ? await this.questions.listDeleted({ ids: questionIds })
      : [];

    for (const question of deletedQuestions) {
      if (question.sourceType === "word" && question.sourceId) wordIds.push(question.sourceId);
      if (question.sourceType === "expression" && question.sourceId) expressionIds.push(question.sourceId);
      if (question.sourceType === "sentence" && question.sourceId) sentenceIds.push(question.sourceId);
      for (const ref of question.relatedSourceRefs || []) {
        if (ref.type === "word") wordIds.push(ref.id);
        if (ref.type === "expression") expressionIds.push(ref.id);
        if (ref.type === "sentence") sentenceIds.push(ref.id);
      }
    }

    const [deletedWords, deletedExpressions, deletedSentences, deletedProverbs] = await Promise.all([
      wordIds.length > 0 ? this.words.listDeleted({ ids: uniqueIds(wordIds) }) : Promise.resolve([]),
      expressionIds.length > 0 ? this.expressions.listDeleted({ ids: uniqueIds(expressionIds) }) : Promise.resolve([]),
      sentenceIds.length > 0 ? this.sentences.listDeleted({ ids: uniqueIds(sentenceIds) }) : Promise.resolve([]),
      proverbIds.length > 0 ? this.proverbs.listDeleted({ ids: proverbIds }) : Promise.resolve([])
    ]);

    return {
      lessons: sortDeleted(deletedLessons),
      words: sortDeleted(deletedWords),
      expressions: sortDeleted(deletedExpressions),
      sentences: sortDeleted(deletedSentences),
      proverbs: sortDeleted(deletedProverbs)
    };
  }

  async restoreLesson(unitId: string, lessonId: string): Promise<LessonEntity | null> {
    const deletedLessons = await this.lessons.listDeletedByUnitId(unitId);
    const targetLesson = deletedLessons.find((lesson) => lesson.id === lessonId);
    if (!targetLesson) return null;

    const lastOrderIndex = await this.lessons.findLastOrderIndex(unitId);
    const restoredLesson = await this.lessons.restoreById(lessonId, (lastOrderIndex ?? -1) + 1);
    if (!restoredLesson) return null;

    const { expressionIds, proverbIds } = collectStageRefIds(targetLesson);

    await Promise.all([
      this.proverbs.restoreByLessonId(restoredLesson.id),
      this.questions.restoreByLessonId(restoredLesson.id)
    ]);

    for (const expressionId of expressionIds) {
      await this.expressions.restoreById(expressionId);
    }

    for (const proverbId of proverbIds) {
      await this.proverbs.restoreById(proverbId, [restoredLesson.id]);
    }

    return restoredLesson;
  }

  async restoreExpression(unitId: string, expressionId: string): Promise<ExpressionEntity | null> {
    const { expressions } = await this.list(unitId);
    const targetExpression = expressions.find((expression) => expression.id === expressionId);
    if (!targetExpression) return null;
    return this.expressions.restoreById(expressionId);
  }

  async restoreWord(unitId: string, wordId: string): Promise<WordEntity | null> {
    const { words } = await this.list(unitId);
    const targetWord = words.find((word) => word.id === wordId);
    if (!targetWord) return null;
    return this.words.restoreById(wordId);
  }

  async restoreSentence(unitId: string, sentenceId: string): Promise<SentenceEntity | null> {
    const { sentences } = await this.list(unitId);
    const targetSentence = sentences.find((sentence) => sentence.id === sentenceId);
    if (!targetSentence) return null;
    return this.sentences.restoreById(sentenceId);
  }

  async restoreProverb(unitId: string, proverbId: string): Promise<ProverbEntity | null> {
    const { proverbs } = await this.list(unitId);
    const targetProverb = proverbs.find((proverb) => proverb.id === proverbId);
    if (!targetProverb) return null;

    const scopedLessons = [
      ...(await this.lessons.listByUnitId(unitId)),
      ...(await this.lessons.listDeletedByUnitId(unitId))
    ];
    const lessonIdsToAdd = collectLessonIdsForRef(scopedLessons, "proverb", proverbId);
    return this.proverbs.restoreById(proverbId, lessonIdsToAdd);
  }
}
