import type { LessonBlock, LessonEntity } from "../../../../domain/entities/Lesson.js";
import type { PhraseEntity } from "../../../../domain/entities/Phrase.js";
import type { QuestionEntity, QuestionSubtype, QuestionType } from "../../../../domain/entities/Question.js";
import type { LessonRepository } from "../../../../domain/repositories/LessonRepository.js";
import type { PhraseRepository } from "../../../../domain/repositories/PhraseRepository.js";
import type { ProverbRepository } from "../../../../domain/repositories/ProverbRepository.js";
import type { QuestionRepository } from "../../../../domain/repositories/QuestionRepository.js";
import type { LlmClient } from "../../../../services/llm/types.js";
import { AiPhraseOrchestrator } from "../../../services/AiPhraseOrchestrator.js";
import { AdminLessonAiUseCases } from "./AdminLessonAiUseCases.js";

type QuestionDraft = {
  type: QuestionType;
  subtype: QuestionSubtype;
  promptTemplate: string;
  options: string[];
  correctIndex: number;
  reviewData?: QuestionEntity["reviewData"];
  explanation: string;
};

export type GenerateUnitAiContentInput = {
  unitId: string;
  language: LessonEntity["language"];
  level: LessonEntity["level"];
  createdBy: string;
  lessonCount: number;
  phrasesPerLesson: number;
  proverbsPerLesson: number;
  topics?: string[];
  extraInstructions?: string;
};

type LessonGenerationSummary = {
  lessonId: string;
  title: string;
  phrasesGenerated: number;
  repeatedPhrasesLinked: number;
  proverbsGenerated: number;
  questionsGenerated: number;
  blocksGenerated: number;
};

function normalizeOption(value: string) {
  return value.trim();
}

function makeUniqueOptions(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const row of values) {
    const value = normalizeOption(row);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function pickTranslation(phrase: PhraseEntity, translationIndex = 0) {
  if (!Array.isArray(phrase.translations) || phrase.translations.length === 0) return "";
  if (
    Number.isInteger(translationIndex) &&
    translationIndex >= 0 &&
    translationIndex < phrase.translations.length
  ) {
    return String(phrase.translations[translationIndex] || "").trim();
  }
  return String(phrase.translations[0] || "").trim();
}

function buildReviewData(phrase: PhraseEntity): NonNullable<QuestionEntity["reviewData"]> {
  const translation = pickTranslation(phrase);
  const baseSentence = String(phrase.examples[0]?.original || phrase.text || "").trim();
  const fallbackSentence = baseSentence || phrase.text.trim();
  const rawWords = fallbackSentence.split(/\s+/).map((item) => item.trim()).filter(Boolean);
  const words = rawWords.length >= 2 ? rawWords : [phrase.text.trim(), translation].filter(Boolean);
  const safeWords = words.length >= 2 ? words : [phrase.text.trim(), phrase.text.trim()].filter(Boolean);
  return {
    sentence: fallbackSentence || phrase.text.trim(),
    words: safeWords,
    correctOrder: safeWords.map((_, index) => index),
    meaning: translation
  };
}

function shuffle(values: string[]) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = copy[index];
    copy[index] = copy[swapIndex];
    copy[swapIndex] = current;
  }
  return copy;
}

function buildMcOptions(
  phrase: PhraseEntity,
  lessonPhrases: PhraseEntity[],
  languagePool: PhraseEntity[]
) {
  const currentTranslation = pickTranslation(phrase);
  const distractorPool = lessonPhrases
    .filter((item) => item.id !== phrase.id)
    .map((item) => pickTranslation(item))
    .concat(languagePool.filter((item) => item.id !== phrase.id).map((item) => pickTranslation(item)));

  const uniqueDistractors = makeUniqueOptions(distractorPool).filter(
    (item) => item.toLowerCase() !== currentTranslation.toLowerCase()
  );
  const selectedDistractors = uniqueDistractors.slice(0, 3);
  const base = makeUniqueOptions([currentTranslation, ...selectedDistractors]);
  const padded = [...base];
  const fallbackOptions = ["I am not sure", "Maybe later", "Try again"];
  for (const fallback of fallbackOptions) {
    if (padded.length >= 4) break;
    if (!padded.some((item) => item.toLowerCase() === fallback.toLowerCase())) {
      padded.push(fallback);
    }
  }

  const shuffled = shuffle(padded);
  const correctIndex = shuffled.findIndex((item) => item.toLowerCase() === currentTranslation.toLowerCase());
  return {
    options: shuffled,
    correctIndex: correctIndex >= 0 ? correctIndex : 0
  };
}

function buildQuestionDrafts(
  phrase: PhraseEntity,
  lessonPhrases: PhraseEntity[],
  languagePool: PhraseEntity[]
): QuestionDraft[] {
  const mc = buildMcOptions(phrase, lessonPhrases, languagePool);
  const reviewData = buildReviewData(phrase);

  return [
    {
      type: "multiple-choice",
      subtype: "mc-select-translation",
      promptTemplate: "What is {phrase} in English?",
      options: mc.options,
      correctIndex: mc.correctIndex,
      explanation: phrase.explanation || `The correct meaning is ${pickTranslation(phrase)}.`
    },
    {
      type: "fill-in-the-gap",
      subtype: "fg-word-order",
      promptTemplate: "Arrange the words to mean: {meaning}",
      options: reviewData.words,
      correctIndex: 0,
      reviewData,
      explanation: `Correct order: ${reviewData.words.join(" ")}`
    },
    {
      type: "listening",
      subtype: "ls-mc-select-translation",
      promptTemplate: "Listen to {phrase} and choose the meaning.",
      options: mc.options,
      correctIndex: mc.correctIndex,
      explanation: phrase.explanation || `The correct meaning is ${pickTranslation(phrase)}.`
    }
  ];
}

function pickRepetitionTarget(phrasesPerLesson: number) {
  if (phrasesPerLesson <= 1) return 0;
  return Math.max(1, Math.floor(phrasesPerLesson * 0.35));
}

export class AdminUnitAiContentUseCases {
  private readonly phraseOrchestrator: AiPhraseOrchestrator;
  private readonly lessonAi: AdminLessonAiUseCases;

  constructor(
    private readonly lessons: LessonRepository,
    private readonly phrases: PhraseRepository,
    private readonly proverbs: ProverbRepository,
    private readonly questions: QuestionRepository,
    llm: LlmClient
  ) {
    this.phraseOrchestrator = new AiPhraseOrchestrator(this.lessons, this.phrases, llm);
    this.lessonAi = new AdminLessonAiUseCases(this.lessons, this.phrases, this.proverbs, llm);
  }

  async generate(input: GenerateUnitAiContentInput) {
    const existingLessonsInUnit = await this.lessons.list({ unitId: input.unitId });
    const existingLessonIdsInUnit = existingLessonsInUnit.map((lesson) => lesson.id);
    const existingUnitPhrases = existingLessonIdsInUnit.length
      ? await this.phrases.list({ lessonIds: existingLessonIdsInUnit })
      : [];

    const lessonResult = await this.lessonAi.generateLessonsBulk({
      unitId: input.unitId,
      language: input.language,
      level: input.level,
      title: undefined,
      topics: input.topics,
      count: input.lessonCount,
      createdBy: input.createdBy
    });

    const languagePool = await this.phrases.list({ language: input.language });
    const repetitionPool: PhraseEntity[] = [...existingUnitPhrases];
    const lessonSummaries: LessonGenerationSummary[] = [];
    const errors: Array<{ lessonId?: string; title?: string; error: string }> = [];

    for (const lesson of lessonResult.lessons) {
      try {
        const phraseSeedWords = lesson.topics.length ? lesson.topics : undefined;
        const phrases = await this.phraseOrchestrator.generateForLesson({
          lesson,
          seedWords: phraseSeedWords,
          extraInstructions: [
            input.extraInstructions ? input.extraInstructions.trim() : "",
            "Generate practical conversational phrases learners can use in real life.",
            "Prioritize greetings, introductions, simple questions, and short responses.",
            `Generate about ${input.phrasesPerLesson} phrases.`
          ]
            .filter(Boolean)
            .join(" ")
        });

        const lessonProverbs = await this.proverbs.findByLessonId(lesson.id);
        let ensuredProverbs = lessonProverbs;
        if (lessonProverbs.length < input.proverbsPerLesson) {
          const missing = input.proverbsPerLesson - lessonProverbs.length;
          const generated = await this.lessonAi.generateLessonProverbs({
            lesson,
            count: missing,
            extraInstructions: input.extraInstructions
          });
          ensuredProverbs = [...lessonProverbs, ...generated];
        }

        let repeatedPhrasesLinked = 0;
        const targetRepetition = pickRepetitionTarget(input.phrasesPerLesson);
        if (targetRepetition > 0 && repetitionPool.length > 0) {
          const currentLessonPhrases = await this.phrases.findByLessonId(lesson.id);
          const currentLessonPhraseIds = new Set(currentLessonPhrases.map((item) => item.id));

          const repetitionCandidates = repetitionPool
            .filter((item) => !currentLessonPhraseIds.has(item.id))
            .sort((a, b) => a.difficulty - b.difficulty)
            .slice(0, targetRepetition);

          for (const phrase of repetitionCandidates) {
            const nextLessonIds = Array.from(new Set([...phrase.lessonIds, lesson.id]));
            const updated = await this.phrases.updateById(phrase.id, { lessonIds: nextLessonIds });
            if (updated) {
              repeatedPhrasesLinked += 1;
              currentLessonPhraseIds.add(updated.id);
            }
          }
        }

        const lessonPhrases = await this.phrases.findByLessonId(lesson.id);
        for (const phrase of lessonPhrases) {
          if (!repetitionPool.some((item) => item.id === phrase.id)) {
            repetitionPool.push(phrase);
          }
        }

        const createdQuestions: QuestionEntity[] = [];
        for (const phrase of lessonPhrases) {
          const drafts = buildQuestionDrafts(phrase, lessonPhrases, languagePool);
          for (const draft of drafts) {
            const created = await this.questions.create({
              lessonId: lesson.id,
              phraseId: phrase.id,
              translationIndex: 0,
              type: draft.type,
              subtype: draft.subtype,
              promptTemplate: draft.promptTemplate,
              options: draft.options,
              correctIndex: draft.correctIndex,
              reviewData: draft.reviewData,
              explanation: draft.explanation,
              status: "draft"
            });
            createdQuestions.push(created);
          }
        }

        const blocks: LessonBlock[] = [];
        if (lesson.description.trim()) {
          blocks.push({ type: "text", content: lesson.description.trim() });
        }
        for (const phrase of lessonPhrases) {
          blocks.push({ type: "phrase", refId: phrase.id });
        }
        for (const proverb of ensuredProverbs) {
          blocks.push({ type: "proverb", refId: proverb.id });
        }
        for (const question of createdQuestions) {
          blocks.push({ type: "question", refId: question.id });
        }

        const updatedProverbs = ensuredProverbs.map((item) => ({
          text: item.text,
          translation: item.translation,
          contextNote: item.contextNote
        }));

        await this.lessons.updateById(lesson.id, {
          blocks,
          proverbs: updatedProverbs
        });

        lessonSummaries.push({
          lessonId: lesson.id,
          title: lesson.title,
          phrasesGenerated: phrases.length,
          repeatedPhrasesLinked,
          proverbsGenerated: ensuredProverbs.length,
          questionsGenerated: createdQuestions.length,
          blocksGenerated: blocks.length
        });
      } catch (error) {
        errors.push({
          lessonId: lesson.id,
          title: lesson.title,
          error: error instanceof Error ? error.message : "Failed to generate lesson content."
        });
      }
    }

    return {
      unitId: input.unitId,
      requestedLessons: input.lessonCount,
      createdLessons: lessonResult.lessons.length,
      skippedLessons: lessonResult.skipped,
      lessonGenerationErrors: lessonResult.errors,
      contentErrors: errors,
      lessons: lessonSummaries
    };
  }
}
