import { LESSON_GENERATION_LIMITS } from "../../config/lessonGeneration.js";
import type { Language, LessonEntity, LessonStage } from "../../domain/entities/Lesson.js";
import type { PhraseEntity } from "../../domain/entities/Phrase.js";
import type { QuestionEntity } from "../../domain/entities/Question.js";
import type { LessonRepository } from "../../domain/repositories/LessonRepository.js";
import type { PhraseRepository } from "../../domain/repositories/PhraseRepository.js";
import type { ProverbRepository } from "../../domain/repositories/ProverbRepository.js";
import type { QuestionRepository } from "../../domain/repositories/QuestionRepository.js";
import { wasPhraseIntroducedBeforeLesson } from "./PhraseIntroductionService.js";
import {
  subtypeRequiresReviewData,
  subtypeUsesMatching,
  subtypeUsesChoiceOptions,
  subtypeUsesWordOrder
} from "../../interfaces/http/validators/question.validators.js";

type AuditSeverity = "error" | "warning";

type AuditFinding = {
  severity: AuditSeverity;
  code: string;
  message: string;
};

export type LessonAuditResult = {
  ok: boolean;
  errors: number;
  warnings: number;
  metrics: {
    stageCount: number;
    blockCount: number;
    uniquePhraseCount: number;
    questionCount: number;
    listeningQuestionCount: number;
  };
  findings: AuditFinding[];
};

function splitWords(value: string) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeSpace(value: string) {
  return splitWords(value).join(" ");
}

function addFinding(findings: AuditFinding[], severity: AuditSeverity, code: string, message: string) {
  findings.push({ severity, code, message });
}

function validateReviewData(question: QuestionEntity) {
  const reviewData = question.reviewData;
  if (!reviewData) return false;
  const words = Array.isArray(reviewData.words) ? reviewData.words.filter(Boolean) : [];
  const correctOrder = Array.isArray(reviewData.correctOrder) ? reviewData.correctOrder : [];
  return (
    String(reviewData.sentence || "").trim().length > 0 &&
    words.length >= 2 &&
    correctOrder.length === words.length &&
    correctOrder.every((index) => Number.isInteger(index) && index >= 0 && index < words.length) &&
    new Set(correctOrder).size === correctOrder.length
  );
}

function getSortedStages(lesson: LessonEntity) {
  return [...(lesson.stages || [])].sort((a, b) => a.orderIndex - b.orderIndex);
}

export class LessonAuditService {
  constructor(
    private readonly lessons: LessonRepository,
    private readonly phrases: PhraseRepository,
    private readonly proverbs: ProverbRepository,
    private readonly questions: QuestionRepository
  ) {}

  async auditLesson(id: string, language?: Language): Promise<LessonAuditResult | null> {
    const lesson = language
      ? await this.lessons.findByIdAndLanguage(id, language)
      : await this.lessons.findById(id);
    if (!lesson) return null;

    const findings: AuditFinding[] = [];
    const stages = getSortedStages(lesson);
    const phraseRefIds = new Set<string>();
    const questionRefIds = new Set<string>();
    const proverbRefIds = new Set<string>();
    let blockCount = 0;

    if (stages.length === 0) {
      addFinding(findings, "error", "missing_stages", "Lesson has no stages.");
    }

    stages.forEach((stage, index) => {
      const blocks = Array.isArray(stage.blocks) ? stage.blocks : [];
      blockCount += blocks.length;
      if (!String(stage.title || "").trim()) {
        addFinding(findings, "warning", "empty_stage_title", `Stage ${index + 1} has no title.`);
      }
      if (blocks.length === 0) {
        addFinding(findings, "error", "empty_stage", `Stage ${index + 1} has no blocks.`);
      }

      const stagePhraseRefs = blocks.filter((block) => block.type === "phrase").map((block) => block.refId);
      if (stagePhraseRefs.length > LESSON_GENERATION_LIMITS.MAX_PHRASES_PER_STAGE) {
        addFinding(
          findings,
          "error",
          "too_many_stage_phrases",
          `Stage ${index + 1} has more than ${LESSON_GENERATION_LIMITS.MAX_PHRASES_PER_STAGE} phrase blocks.`
        );
      }

      for (const block of blocks) {
        if (block.type === "text" && !String(block.content || "").trim()) {
          addFinding(findings, "warning", "empty_text_block", `Stage ${index + 1} contains an empty text block.`);
        }
        if (block.type === "phrase") phraseRefIds.add(block.refId);
        if (block.type === "question") questionRefIds.add(block.refId);
        if (block.type === "proverb") proverbRefIds.add(block.refId);
      }
    });

    const [phrases, questions] = await Promise.all([
      phraseRefIds.size > 0 ? this.phrases.findByIds([...phraseRefIds]) : Promise.resolve([]),
      questionRefIds.size > 0 ? Promise.all([...questionRefIds].map((questionId) => this.questions.findById(questionId))) : Promise.resolve([])
    ]);
    const phraseMap = new Map(phrases.map((phrase) => [phrase.id, phrase]));
    const questionMap = new Map(questions.filter(Boolean).map((question) => [question!.id, question!]));
    const proverbMap = new Map(
      (await Promise.all([...proverbRefIds].map((proverbId) => this.proverbs.findById(proverbId))))
        .filter(Boolean)
        .map((proverb) => [proverb!.id, proverb!])
    );

    if (phraseMap.size > LESSON_GENERATION_LIMITS.MAX_NEW_PHRASES_PER_LESSON) {
      addFinding(
        findings,
        "warning",
        "too_many_unique_phrases",
        `Lesson uses ${phraseMap.size} unique phrases, above the target maximum of ${LESSON_GENERATION_LIMITS.MAX_NEW_PHRASES_PER_LESSON}.`
      );
    }

    const repeatedPhraseIds = new Set<string>();
    const priorStagePhraseIds = new Set<string>();
    let listeningQuestionCount = 0;

    for (const [stageIndex, stage] of stages.entries()) {
      const stagePhraseIds = new Set<string>();
      const stageQuestions = stage.blocks.filter((block) => block.type === "question").map((block) => questionMap.get(block.refId)).filter(Boolean);
      if (stageIndex > 0) {
        for (const block of stage.blocks) {
          if (block.type === "phrase" && priorStagePhraseIds.has(block.refId)) {
            repeatedPhraseIds.add(block.refId);
          }
        }
      }

      for (const block of stage.blocks) {
        if (block.type === "phrase") {
          stagePhraseIds.add(block.refId);
          priorStagePhraseIds.add(block.refId);
          const phrase = phraseMap.get(block.refId);
          if (!phrase) {
            addFinding(findings, "error", "missing_phrase_ref", `Stage ${stageIndex + 1} references a missing phrase.`);
            continue;
          }
          const translationIndex = block.translationIndex ?? 0;
          if (translationIndex < 0 || translationIndex >= phrase.translations.length) {
            addFinding(
              findings,
              "error",
              "invalid_phrase_translation_index",
              `Phrase "${phrase.text}" has an invalid translation index in stage ${stageIndex + 1}.`
            );
          }
          if (stageIndex === 0 && wasPhraseIntroducedBeforeLesson(phrase, lesson.id)) {
            addFinding(
              findings,
              "warning",
              "reintroduced_phrase_in_stage_one",
              `Phrase "${phrase.text}" was already introduced in another lesson but appears again as a Stage 1 introduction here.`
            );
          }
        }

        if (block.type === "proverb" && !proverbMap.has(block.refId)) {
          addFinding(findings, "error", "missing_proverb_ref", `Stage ${stageIndex + 1} references a missing proverb.`);
        }

        if (block.type === "question") {
          const question = questionMap.get(block.refId);
          if (!question) {
            addFinding(findings, "error", "missing_question_ref", `Stage ${stageIndex + 1} references a missing question.`);
            continue;
          }

          if (question.type === "listening") {
            listeningQuestionCount += 1;
          }

          const phrase = phraseMap.get(question.phraseId) || (await this.phrases.findById(question.phraseId));
          if (!phrase) {
            addFinding(findings, "error", "missing_question_phrase", `Question ${question.id} references a missing phrase.`);
            continue;
          }

          if (question.translationIndex < 0 || question.translationIndex >= phrase.translations.length) {
            addFinding(
              findings,
              "error",
              "invalid_question_translation_index",
              `Question ${question.id} uses an invalid translation index for phrase "${phrase.text}".`
            );
          }

          if (subtypeUsesMatching(question.subtype)) {
            if (stageIndex === 0) {
              addFinding(
                findings,
                "error",
                "matching_in_stage_one",
                `Matching question ${question.id} must appear after Stage 1.`
              );
            }
            const matchingPairs = Array.isArray(question.interactionData?.matchingPairs)
              ? question.interactionData.matchingPairs
              : [];
            if (matchingPairs.length < 2) {
              addFinding(findings, "error", "invalid_matching_pairs", `Question ${question.id} requires at least two matching pairs.`);
            }
            if (question.subtype === "mt-match-image" && matchingPairs.some((pair) => !String(pair.image?.url || "").trim())) {
              addFinding(findings, "error", "missing_matching_images", `Image matching question ${question.id} is missing one or more linked images.`);
            }
          }

          if (subtypeUsesChoiceOptions(question.subtype)) {
            if (question.options.length < 2) {
              addFinding(findings, "error", "invalid_question_options", `Question ${question.id} does not have enough options.`);
            }
            if (question.correctIndex < 0 || question.correctIndex >= question.options.length) {
              addFinding(findings, "error", "invalid_correct_index", `Question ${question.id} has an invalid correct option index.`);
            }
          }

          if (
            question.subtype === "mc-select-missing-word" ||
            question.subtype === "ls-mc-select-missing-word" ||
            question.subtype === "ls-fg-gap-fill"
          ) {
            const phraseWordCount = splitWords(phrase.text).length;
            const reviewSentence = String(question.reviewData?.sentence || "");
            const reviewWords = Array.isArray(question.reviewData?.words)
              ? question.reviewData?.words.map((item) => String(item || "").trim()).filter(Boolean)
              : [];
            const normalizedReviewPhrase = reviewWords.length > 0
              ? normalizeSpace(reviewWords.join(" "))
              : normalizeSpace(reviewSentence.replace(/____/g, String(question.options[question.correctIndex] || "").trim()));
            if (phraseWordCount < 2) {
              addFinding(
                findings,
                "error",
                "single_word_phrase_uses_missing_word",
                `Question ${question.id} uses a missing-word exercise for single-word phrase "${phrase.text}".`
              );
            } else if (normalizedReviewPhrase !== normalizeSpace(phrase.text)) {
              addFinding(
                findings,
                "error",
                "missing_word_phrase_mismatch",
                `Question ${question.id} uses missing-word content that does not match the phrase text "${phrase.text}" exactly.`
              );
            }
          }

          if (subtypeRequiresReviewData(question.subtype) && !validateReviewData(question)) {
            addFinding(findings, "error", "invalid_review_data", `Question ${question.id} requires valid review data.`);
          }

          if (subtypeUsesWordOrder(question.subtype) && splitWords(String(question.reviewData?.sentence || "")).length < 2) {
            addFinding(findings, "error", "weak_word_order_data", `Question ${question.id} is a word-order exercise without a real multi-word sentence.`);
          }

          if (question.subtype === "fg-word-order" || question.subtype === "ls-fg-word-order") {
            const phraseWordCount = splitWords(phrase.text).length;
            if (phraseWordCount < 2) {
              addFinding(
                findings,
                "error",
                "single_word_phrase_uses_word_order",
                `Question ${question.id} uses word-order for single-word phrase "${phrase.text}". Use spelling order instead.`
              );
            } else if (normalizeSpace(String(question.reviewData?.sentence || "")) !== normalizeSpace(phrase.text)) {
              addFinding(
                findings,
                "error",
                "word_order_phrase_mismatch",
                `Question ${question.id} uses word-order content that does not match the phrase text "${phrase.text}" exactly.`
              );
            }
          }

          if (question.type === "listening" && !String(phrase.audio?.url || "").trim()) {
            addFinding(findings, "error", "missing_listening_audio", `Listening question ${question.id} uses phrase "${phrase.text}" without audio.`);
          }

          const allowedPlaceholders = ["{phrase}", "{meaning}", "{sentence}"];
          const promptPlaceholders = String(question.promptTemplate || "").match(/\{[^}]+\}/g) || [];
          const invalidPlaceholders = promptPlaceholders.filter((placeholder) => !allowedPlaceholders.includes(placeholder));
          if (invalidPlaceholders.length > 0) {
            addFinding(findings, "warning", "invalid_prompt_placeholder", `Question ${question.id} uses unsupported placeholders: ${invalidPlaceholders.join(", ")}.`);
          }
        }
      }

      if (stageQuestions.length === 0) {
        addFinding(findings, "warning", "stage_without_questions", `Stage ${stageIndex + 1} has no questions.`);
      }
    }

    if (stages.length > 1 && repeatedPhraseIds.size === 0) {
      addFinding(findings, "warning", "no_phrase_repetition", "No phrase repetition was detected across stages.");
    }

    if (listeningQuestionCount === 0) {
      addFinding(findings, "warning", "missing_listening_questions", "Lesson has no listening questions.");
    }

    const errors = findings.filter((item) => item.severity === "error").length;
    const warnings = findings.filter((item) => item.severity === "warning").length;

    return {
      ok: errors === 0,
      errors,
      warnings,
      metrics: {
        stageCount: stages.length,
        blockCount,
        uniquePhraseCount: phraseMap.size,
        questionCount: questionMap.size,
        listeningQuestionCount
      },
      findings
    };
  }
}
