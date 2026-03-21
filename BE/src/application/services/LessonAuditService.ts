import { LESSON_GENERATION_LIMITS } from "../../config/lessonGeneration.js";
import type { ContentType } from "../../domain/entities/Content.js";
import type { Language, LessonEntity, LessonStage } from "../../domain/entities/Lesson.js";
import type { QuestionEntity } from "../../domain/entities/Question.js";
import type { ExpressionRepository } from "../../domain/repositories/ExpressionRepository.js";
import type { LessonRepository } from "../../domain/repositories/LessonRepository.js";
import type { ProverbRepository } from "../../domain/repositories/ProverbRepository.js";
import type { QuestionRepository } from "../../domain/repositories/QuestionRepository.js";
import type { SentenceRepository } from "../../domain/repositories/SentenceRepository.js";
import type { WordRepository } from "../../domain/repositories/WordRepository.js";
import { ContentLookupService } from "./ContentLookupService.js";
import type { ContentCurriculumService } from "./ContentCurriculumService.js";
import {
  findContextResponseTypoOnlyDistractors,
  subtypeRequiresReviewData,
  subtypeUsesMatching,
  subtypeUsesChoiceOptions,
  subtypeUsesWordOrder,
  validateContextResponseQuestion
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
    uniqueContentCount: number;
    questionCount: number;
    listeningQuestionCount: number;
    scenarioQuestionCount: number;
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

function getQuestionSourceRef(question: QuestionEntity): { type: ContentType; id: string } | null {
  if (question.sourceType && question.sourceId) {
    return { type: question.sourceType, id: question.sourceId };
  }
  return null;
}

export class LessonAuditService {
  private readonly contentLookup: ContentLookupService;

  constructor(
    private readonly lessons: LessonRepository,
    private readonly words: WordRepository,
    private readonly expressions: ExpressionRepository,
    private readonly sentences: SentenceRepository,
    private readonly proverbs: ProverbRepository,
    private readonly questions: QuestionRepository,
    private readonly contentCurriculum: ContentCurriculumService
  ) {
    this.contentLookup = new ContentLookupService(words, expressions, sentences);
  }

  async auditLesson(id: string, language?: Language): Promise<LessonAuditResult | null> {
    const lesson = language
      ? await this.lessons.findByIdAndLanguage(id, language)
      : await this.lessons.findById(id);
    if (!lesson) return null;

    const findings: AuditFinding[] = [];
    const stages = getSortedStages(lesson);
    const contentRefs = new Map<string, { type: ContentType; id: string }>();
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

      const stageContentRefs = blocks.filter((block) => block.type === "content").map((block) => block.refId);
      if (stageContentRefs.length > LESSON_GENERATION_LIMITS.MAX_CONTENT_PER_STAGE) {
        addFinding(
          findings,
          "error",
          "too_many_stage_content_items",
          `Stage ${index + 1} has more than ${LESSON_GENERATION_LIMITS.MAX_CONTENT_PER_STAGE} teaching content blocks.`
        );
      }

      for (const block of blocks) {
        if (block.type === "text" && !String(block.content || "").trim()) {
          addFinding(findings, "warning", "empty_text_block", `Stage ${index + 1} contains an empty text block.`);
        }
        if (block.type === "content") contentRefs.set(`${block.contentType}:${block.refId}`, { type: block.contentType, id: block.refId });
        if (block.type === "question") questionRefIds.add(block.refId);
        if (block.type === "proverb") proverbRefIds.add(block.refId);
      }
    });

    const questions = await (questionRefIds.size > 0
      ? Promise.all([...questionRefIds].map((questionId) => this.questions.findById(questionId)))
      : Promise.resolve([]));
    const questionMap = new Map(questions.filter(Boolean).map((question) => [question!.id, question!]));
    const proverbMap = new Map(
      (await Promise.all([...proverbRefIds].map((proverbId) => this.proverbs.findById(proverbId))))
        .filter(Boolean)
        .map((proverb) => [proverb!.id, proverb!])
    );
    for (const question of questions.filter(Boolean)) {
      const sourceRef = getQuestionSourceRef(question!);
      if (sourceRef) contentRefs.set(`${sourceRef.type}:${sourceRef.id}`, sourceRef);
      if (Array.isArray(question!.interactionData?.matchingPairs)) {
        for (const pair of question!.interactionData!.matchingPairs!) {
          if (pair.contentType && pair.contentId) {
            contentRefs.set(`${pair.contentType}:${pair.contentId}`, { type: pair.contentType, id: pair.contentId });
          }
        }
      }
    }
    const contentMap = await this.contentLookup.findMany(Array.from(contentRefs.values()));

    if (contentMap.size > LESSON_GENERATION_LIMITS.MAX_NEW_SENTENCES_PER_LESSON) {
      addFinding(
        findings,
        "warning",
        "too_many_unique_content_items",
        `Lesson uses ${contentMap.size} unique teaching items, above the target maximum of ${LESSON_GENERATION_LIMITS.MAX_NEW_SENTENCES_PER_LESSON}.`
      );
    }

    const repeatedContentKeys = new Set<string>();
    const priorStageContentKeys = new Set<string>();
    let listeningQuestionCount = 0;
    let scenarioQuestionCount = 0;

    for (const [stageIndex, stage] of stages.entries()) {
      const stageContentKeys = new Set<string>();
      const stageQuestions = stage.blocks.filter((block) => block.type === "question").map((block) => questionMap.get(block.refId)).filter(Boolean);
      if (stageIndex > 0) {
        for (const block of stage.blocks) {
          if (block.type === "content" && priorStageContentKeys.has(`${block.contentType}:${block.refId}`)) {
            repeatedContentKeys.add(`${block.contentType}:${block.refId}`);
          }
        }
      }

      for (const block of stage.blocks) {
        if (block.type === "content") {
          const key = `${block.contentType}:${block.refId}`;
          stageContentKeys.add(key);
          priorStageContentKeys.add(key);
          const content = contentMap.get(key);
          if (!content) {
            addFinding(findings, "error", "missing_content_ref", `Stage ${stageIndex + 1} references missing ${block.contentType} content.`);
            continue;
          }
          const translationIndex = block.translationIndex ?? 0;
          if (translationIndex < 0 || translationIndex >= content.translations.length) {
            addFinding(
              findings,
              "error",
              "invalid_content_translation_index",
              `${block.contentType} "${content.text}" has an invalid translation index in stage ${stageIndex + 1}.`
            );
          }
          if (stageIndex === 0 && (await this.contentCurriculum.wasContentIntroducedBeforeLesson({
            lesson,
            contentType: block.contentType,
            contentId: block.refId
          }))) {
            addFinding(
              findings,
              "warning",
              "reintroduced_content_in_stage_one",
              `${block.contentType} "${content.text}" was already introduced in an earlier lesson but appears again as a Stage 1 introduction here.`
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
          if (question.subtype === "mc-select-context-response") {
            scenarioQuestionCount += 1;
          }

          const sourceRef = getQuestionSourceRef(question);
          const displayEntity = sourceRef ? contentMap.get(`${sourceRef.type}:${sourceRef.id}`) : null;
          if (!displayEntity) {
            addFinding(findings, "error", "missing_question_source", `Question ${question.id} references missing source content.`);
            continue;
          }

          if (question.translationIndex < 0 || question.translationIndex >= displayEntity.translations.length) {
            addFinding(
              findings,
              "error",
              "invalid_question_translation_index",
              `Question ${question.id} uses an invalid translation index for "${displayEntity.text}".`
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

          if (question.subtype === "mc-select-context-response") {
            if (sourceRef?.type === "sentence") {
              addFinding(
                findings,
                "error",
                "invalid_context_response_source",
                `Context-response question ${question.id} cannot use a sentence as its primary source.`
              );
            }

            const validationError = validateContextResponseQuestion({
              sourceText: displayEntity.text,
              options: question.options,
              correctIndex: question.correctIndex
            });

            if (validationError === "invalid_option_count") {
              addFinding(
                findings,
                "error",
                "invalid_context_response_option_count",
                `Context-response question ${question.id} must have between 2 and 4 options.`
              );
            } else if (validationError === "correct_option_must_match_source") {
              addFinding(
                findings,
                "error",
                "context_response_correct_option_mismatch",
                `Context-response question ${question.id} does not use the source text "${displayEntity.text}" as the correct option.`
              );
            } else if (validationError === "typo_only_distractors_not_allowed") {
              addFinding(
                findings,
                "error",
                "context_response_typo_distractor",
                `Context-response question ${question.id} uses a distractor that is only a spelling or diacritic variant of "${displayEntity.text}".`
              );
            }

            const typoDistractors = findContextResponseTypoOnlyDistractors(displayEntity.text, question.options);
            if (typoDistractors.length > 0 && validationError !== "typo_only_distractors_not_allowed") {
              addFinding(
                findings,
                "warning",
                "context_response_weak_distractors",
                `Context-response question ${question.id} has weak distractors: ${typoDistractors.join(", ")}.`
              );
            }
          }

          if (
            question.subtype === "mc-select-missing-word" ||
            question.subtype === "ls-mc-select-missing-word" ||
            question.subtype === "ls-fg-gap-fill"
          ) {
            const contentWordCount = splitWords(displayEntity.text).length;
            const reviewSentence = String(question.reviewData?.sentence || "");
            const reviewWords = Array.isArray(question.reviewData?.words)
              ? question.reviewData?.words.map((item) => String(item || "").trim()).filter(Boolean)
              : [];
            const normalizedReviewPhrase = reviewWords.length > 0
              ? normalizeSpace(reviewWords.join(" "))
              : normalizeSpace(reviewSentence.replace(/____/g, String(question.options[question.correctIndex] || "").trim()));
            if (contentWordCount < 2) {
              addFinding(
                findings,
                "error",
                "single_token_content_uses_missing_word",
                `Question ${question.id} uses a missing-word exercise for single-word item "${displayEntity.text}".`
              );
            } else if (normalizedReviewPhrase !== normalizeSpace(displayEntity.text)) {
              addFinding(
                findings,
                "error",
                "missing_word_phrase_mismatch",
                `Question ${question.id} uses missing-word content that does not match the source text "${displayEntity.text}" exactly.`
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
            const contentWordCount = splitWords(displayEntity.text).length;
            if (contentWordCount < 2) {
              addFinding(
                findings,
                "error",
                "single_token_content_uses_word_order",
                `Question ${question.id} uses word-order for single-word item "${displayEntity.text}". Use spelling order instead.`
              );
            } else if (normalizeSpace(String(question.reviewData?.sentence || "")) !== normalizeSpace(displayEntity.text)) {
              addFinding(
                findings,
                "error",
                "word_order_phrase_mismatch",
                `Question ${question.id} uses word-order content that does not match the source text "${displayEntity.text}" exactly.`
              );
            }
          }

          if (question.type === "listening" && !String(displayEntity.audio?.url || "").trim()) {
            addFinding(findings, "error", "missing_listening_audio", `Listening question ${question.id} uses "${displayEntity.text}" without audio.`);
          }
          if (question.type === "speaking" && !String(displayEntity.audio?.url || "").trim()) {
            addFinding(findings, "error", "missing_speaking_audio", `Speaking question ${question.id} uses "${displayEntity.text}" without reference audio.`);
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

    if (stages.length > 1 && repeatedContentKeys.size === 0) {
      addFinding(findings, "warning", "no_content_repetition", "No teaching-item repetition was detected across stages.");
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
        uniqueContentCount: contentMap.size,
        questionCount: questionMap.size,
        listeningQuestionCount,
        scenarioQuestionCount
      },
      findings
    };
  }
}
