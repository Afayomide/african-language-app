import type { LessonEntity } from "../../domain/entities/Lesson.js";
import type { ExpressionEntity } from "../../domain/entities/Expression.js";
import type { SentenceEntity } from "../../domain/entities/Sentence.js";
import type { WordEntity } from "../../domain/entities/Word.js";
import type { ExpressionRepository } from "../../domain/repositories/ExpressionRepository.js";
import type { SentenceRepository } from "../../domain/repositories/SentenceRepository.js";
import type { WordRepository } from "../../domain/repositories/WordRepository.js";
import type {
  GenerateSentencesInput,
  LlmClient,
  LlmGeneratedSentence
} from "../../services/llm/types.js";
import {
  buildRetryInstruction,
  logAiDuplicateReuse,
  logAiRetry,
  logAiValidation
} from "../../services/llm/aiGenerationLogger.js";
import { validateGeneratedSentences } from "../../services/llm/outputQuality.js";
import {
  describeToneIssue,
  describeTranslationIssue,
  indexToneVerdicts
} from "../../services/llm/linguisticReview.js";

function normalizeText(text: string) {
  return text.trim().toLowerCase();
}

function splitWords(value: string) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function inferComponentType(text: string): "word" | "expression" {
  return splitWords(text).length <= 1 ? "word" : "expression";
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((item) => String(item || "").trim()).filter(Boolean)));
}

function isInvalidLlmJsonError(error: unknown) {
  return error instanceof Error && error.message === "invalid_llm_json";
}

function collectExistingSentenceDuplicates(
  generated: LlmGeneratedSentence[],
  validation: ReturnType<typeof validateGeneratedSentences>,
  existingSentences: string[]
) {
  const existingTextSet = new Set(existingSentences.map(normalizeText).filter(Boolean));
  if (existingTextSet.size === 0) return [];

  const acceptedTexts = new Set(validation.accepted.map((item) => normalizeText(String(item.text || ""))));
  const rejectedReasonsByText = new Map(
    validation.rejected.map((item) => [normalizeText(String(item.item.text || "")), item.reasons] as const)
  );
  const seen = new Set<string>();
  const duplicates: Array<{ text: string; outcome: "accepted_for_reuse" | "rejected"; reasons?: string[] }> = [];

  for (const sentence of generated) {
    const text = String(sentence.text || "").trim();
    const key = normalizeText(text);
    if (!key || seen.has(key) || !existingTextSet.has(key)) continue;
    seen.add(key);
    const acceptedForReuse = acceptedTexts.has(key);
    duplicates.push({
      text,
      outcome: acceptedForReuse ? "accepted_for_reuse" : "rejected",
      reasons: acceptedForReuse ? undefined : rejectedReasonsByText.get(key) || []
    });
  }

  return duplicates;
}

export function sanitizeGeneratedSentence(sentence: LlmGeneratedSentence): LlmGeneratedSentence | null {
  const text = String(sentence.text || "").trim();
  const translations = uniqueStrings(
    Array.isArray(sentence.translations) ? sentence.translations : []
  );
  const components = Array.isArray(sentence.components)
    ? sentence.components
        .map((component) => ({
          text: String(component?.text || "").trim(),
          type: inferComponentType(String(component?.text || "").trim()),
          translations: uniqueStrings(Array.isArray(component?.translations) ? component.translations : []),
          fixed: splitWords(String(component?.text || "").trim()).length > 1 ? component?.fixed === true : false,
          role: (component?.role === "support" ? "support" : "core") as "core" | "support"
        }))
        .filter((component) => component.text && component.translations.length > 0)
    : [];
  const meaningSegments = Array.isArray(sentence.meaningSegments)
    ? sentence.meaningSegments
        .map((segment) => ({
          text: String(segment?.text || "").trim(),
          componentIndexes: Array.isArray(segment?.componentIndexes)
            ? Array.from(
                new Set(
                  segment.componentIndexes
                    .map((value) => Number(value))
                    .filter((value) => Number.isInteger(value) && value >= 0)
                )
              )
            : []
        }))
        .filter((segment) => segment.text && segment.componentIndexes.length > 0)
    : [];

  if (!text || translations.length === 0 || components.length === 0) return null;

  return {
    text,
    translations,
    literalTranslation: String(sentence.literalTranslation || "").trim(),
    usageNotes: String(sentence.usageNotes || "").trim(),
    explanation: String(sentence.explanation || "").trim(),
    components,
    meaningSegments
  };
}

export class AiSentenceOrchestrator {
  constructor(
    private readonly sentences: SentenceRepository,
    private readonly words: WordRepository,
    private readonly expressions: ExpressionRepository,
    private readonly llm: LlmClient
  ) {}

  /**
   * Tone rejections consumed in the current generation. The tone pass also mislabels correct
   * sentences (measured 4/10 on N-ATLaS), so it may force at most one regeneration; beyond
   * that a lesson would be drained on false positives.
   */
  private toneRetriesUsed = 0;

  async generateForLesson(input: {
    lesson: LessonEntity;
    expressions: ExpressionEntity[];
    words?: WordEntity[];
    maxSentences?: number;
    extraInstructions?: string;
    existingLessonSentences?: SentenceEntity[];
  }) {
    if (typeof input.maxSentences === "number" && input.maxSentences <= 0) {
      return [];
    }

    const existingLessonSentences = input.existingLessonSentences || [];
    const existingLanguageSentences = await this.sentences.list({
      language: input.lesson.language,
      languageId: input.lesson.languageId || null
    });
    const expressionMap = new Map(
      input.expressions.map((expression) => [normalizeText(expression.text), expression] as const)
    );
    const wordMap = new Map(
      (input.words || []).map((word) => [normalizeText(word.text), word] as const)
    );

    const validated = await this.generateValidatedSentences({
      lessonId: input.lesson.id,
      language: input.lesson.language,
      level: input.lesson.level,
      lessonTitle: input.lesson.title,
      lessonDescription: input.lesson.description,
      allowedExpressions: input.expressions.map((expression) => ({
        text: expression.text,
        translations: expression.translations
      })),
      allowedWords: (input.words || []).map((word) => ({
        text: word.text,
        translations: word.translations
      })),
      maxSentences: input.maxSentences,
      extraInstructions: input.extraInstructions,
      existingSentences: existingLanguageSentences.map((sentence) => sentence.text)
    });

    const batchKeys = new Set<string>();
    const sanitized = validated.accepted
      .map(sanitizeGeneratedSentence)
      .filter((item): item is LlmGeneratedSentence => Boolean(item))
      .filter((item) => {
        const key = normalizeText(item.text);
        if (batchKeys.has(key)) return false;
        batchKeys.add(key);
        return true;
      });

    const capped = typeof input.maxSentences === "number"
      ? sanitized.slice(0, Math.max(0, input.maxSentences))
      : sanitized;

    const byText = new Map(
      existingLanguageSentences.map((sentence) => [normalizeText(sentence.text), sentence] as const)
    );
    const createdOrReused: SentenceEntity[] = [];

    for (const sentence of capped) {
      const componentRefs = sentence.components
        .map((component, index) => {
          const normalized = normalizeText(component.text);
          if (component.type === "word") {
            const word = wordMap.get(normalized);
            if (!word) return null;
            return {
              type: "word" as const,
              refId: word.id,
              orderIndex: index,
              textSnapshot: word.text
            };
          }
          const expression = expressionMap.get(normalized);
          if (!expression) return null;
          return {
            type: "expression" as const,
            refId: expression.id,
            orderIndex: index,
            textSnapshot: expression.text
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item));

      if (componentRefs.length !== sentence.components.length) continue;

      const existing = byText.get(normalizeText(sentence.text));
      if (existing) {
        const mergedTranslations = uniqueStrings([
          ...existing.translations,
          ...sentence.translations
        ]);
        const updated = await this.sentences.updateById(existing.id, {
          translations: mergedTranslations,
          literalTranslation: existing.literalTranslation || sentence.literalTranslation || "",
          usageNotes: existing.usageNotes || sentence.usageNotes || "",
          explanation: existing.explanation || sentence.explanation || "",
          components: existing.components.length > 0 ? existing.components : componentRefs
        });
        createdOrReused.push(updated || existing);
        continue;
      }

      const created = await this.sentences.create({
        language: input.lesson.language,
        text: sentence.text,
        textNormalized: normalizeText(sentence.text),
        translations: sentence.translations,
        pronunciation: "",
        explanation: sentence.explanation || "",
        examples: [],
        difficulty: Math.max(1, Math.min(5, input.lesson.level === "beginner" ? 1 : input.lesson.level === "intermediate" ? 2 : 3)),
        aiMeta: {
          generatedByAI: true,
          model: this.llm.modelName,
          reviewedByAdmin: false
        },
        audio: {
          provider: "",
          model: "",
          voice: "",
          locale: "",
          format: "",
          url: "",
          s3Key: ""
        },
        literalTranslation: sentence.literalTranslation || "",
        usageNotes: sentence.usageNotes || "",
        components: componentRefs,
        status: "draft"
      });
      createdOrReused.push(created);
      byText.set(normalizeText(created.text), created);
    }

    return createdOrReused;
  }

  async draftForLessonPlan(input: {
    lesson: LessonEntity;
    maxSentences?: number;
    conversationGoal?: string;
    situations?: string[];
    sentenceGoals?: string[];
    anchorSentences?: Array<{ text: string; translations: string[] }>;
    allowedExpressions?: Array<{ text: string; translations: string[] }>;
    allowedWords?: Array<{ text: string; translations: string[] }>;
    allowDerivedComponents?: boolean;
    extraInstructions?: string;
    existingLessonSentences?: SentenceEntity[];
  }) {
    if (typeof input.maxSentences === "number" && input.maxSentences <= 0) {
      return [];
    }

    const existingLessonSentences = input.existingLessonSentences || [];
    const existingLanguageSentences = await this.sentences.list({
      language: input.lesson.language,
      languageId: input.lesson.languageId || null
    });
    const validated = await this.generateValidatedSentences({
      lessonId: input.lesson.id,
      language: input.lesson.language,
      level: input.lesson.level,
      lessonTitle: input.lesson.title,
      lessonDescription: input.lesson.description,
      conversationGoal: input.conversationGoal,
      situations: input.situations,
      sentenceGoals: input.sentenceGoals,
      anchorSentences: input.anchorSentences,
      allowedExpressions: input.allowedExpressions,
      allowedWords: input.allowedWords,
      maxSentences: input.maxSentences,
      allowDerivedComponents: input.allowDerivedComponents ?? true,
      extraInstructions: input.extraInstructions,
      existingSentences: [...existingLessonSentences, ...existingLanguageSentences].map((sentence) => sentence.text)
    });

    const batchKeys = new Set<string>();
    const sanitized = validated.accepted
      .map(sanitizeGeneratedSentence)
      .filter((item): item is LlmGeneratedSentence => Boolean(item))
      .filter((item) => {
        const key = normalizeText(item.text);
        if (batchKeys.has(key)) return false;
        batchKeys.add(key);
        return true;
      });

    return typeof input.maxSentences === "number"
      ? sanitized.slice(0, Math.max(0, input.maxSentences))
      : sanitized;
  }

  /**
   * Weak models write a correct sentence and then leave one of its own words out of
   * `components` -- "Mo fẹ́ rà omi ni." with components [mo, fẹ́, rà, omi]. Validation rejects
   * that as "components do not cover full sentence", and it was the single largest cause of
   * sentence loss. The omitted tokens are ordinary function words, so re-insert them in
   * position using translations we already hold. A token we cannot translate is left alone
   * and the sentence still fails validation, so this never invents vocabulary.
   */
  /**
   * Mark a multi-word component `fixed` when it is already a known unit.
   *
   * Validation rejects any multi-word component without `fixed=true`, on the assumption that
   * an unmarked chunk should have been split into its words. But models routinely emit known
   * expressions ("ń lọ", "ibi iṣẹ́") with the flag off, and the whole sentence dies before
   * persistence -- which is where the "reuse an existing expression" logic lives, so it never
   * gets a chance to run.
   *
   * A chunk qualifies only if it already exists as an expression for this language, or the
   * lesson plan named it as a target. A genuinely novel multi-word chunk is left unmarked and
   * still gets rejected, which is the behaviour the rule is there for.
   */
  private async markKnownMultiWordComponents(
    sentences: LlmGeneratedSentence[],
    input: GenerateSentencesInput
  ): Promise<LlmGeneratedSentence[]> {
    const multiWord = new Set<string>();
    for (const sentence of sentences) {
      for (const component of sentence.components || []) {
        const text = String(component?.text || "").trim();
        if (component?.fixed !== true && splitWords(text).length > 1) multiWord.add(text);
      }
    }
    if (multiWord.size === 0) return sentences;

    const planned = new Set(
      [...(input.allowedExpressions || []), ...(input.allowedWords || [])]
        .map((item) => normalizeText(item.text))
        .filter(Boolean)
    );

    const known = new Set<string>();
    for (const text of multiWord) {
      const key = normalizeText(text);
      if (planned.has(key)) {
        known.add(key);
        continue;
      }
      const existing = await this.expressions
        .findByText(input.language, text, null)
        .catch(() => null);
      if (existing) known.add(key);
    }
    if (known.size === 0) return sentences;

    return sentences.map((sentence) => {
      let changed = false;
      const components = (sentence.components || []).map((component) => {
        const text = String(component?.text || "").trim();
        if (component?.fixed === true || splitWords(text).length <= 1) return component;
        if (!known.has(normalizeText(text))) return component;
        changed = true;
        return { ...component, fixed: true };
      });
      return changed ? { ...sentence, components } : sentence;
    });
  }

  private async repairComponentCoverage(
    sentences: LlmGeneratedSentence[],
    input: GenerateSentencesInput
  ): Promise<LlmGeneratedSentence[]> {
    const knownTranslations = new Map<string, string[]>();
    for (const item of [...(input.allowedWords || []), ...(input.allowedExpressions || [])]) {
      const key = normalizeText(item.text);
      if (key && item.translations?.length) knownTranslations.set(key, item.translations);
    }

    const resolve = async (token: string): Promise<string[] | null> => {
      const key = normalizeText(token);
      if (!key) return null;
      if (knownTranslations.has(key)) return knownTranslations.get(key) as string[];
      const word = await this.words.findByText(input.language, token, null);
      const translations = word?.translations?.filter(Boolean) || [];
      knownTranslations.set(key, translations);
      return translations.length > 0 ? translations : null;
    };

    const stripEdges = (value: string) => value.replace(/^[.,!?;:"'()\[\]{}]+|[.,!?;:"'()\[\]{}]+$/g, "");

    const repaired: LlmGeneratedSentence[] = [];
    for (const sentence of sentences) {
      const tokens = splitWords(String(sentence.text || "")).map(stripEdges).filter(Boolean);
      const components = Array.isArray(sentence.components) ? sentence.components : [];
      if (tokens.length === 0 || components.length === 0) {
        repaired.push(sentence);
        continue;
      }

      // Walk the sentence token stream, consuming each component where it appears in order.
      // Anything the components skip over is a hole that needs its own word component.
      const rebuilt: LlmGeneratedSentence["components"] = [];
      let cursor = 0;
      let componentIndex = 0;
      let failed = false;

      while (cursor < tokens.length && componentIndex < components.length) {
        const component = components[componentIndex];
        const componentTokens = splitWords(String(component?.text || "")).map(stripEdges).filter(Boolean);
        const matchesHere =
          componentTokens.length > 0 &&
          componentTokens.every(
            (token, offset) => normalizeText(tokens[cursor + offset] || "") === normalizeText(token)
          );

        if (matchesHere) {
          rebuilt.push(component);
          cursor += componentTokens.length;
          componentIndex += 1;
          continue;
        }

        const translations = await resolve(tokens[cursor]);
        if (!translations) {
          failed = true;
          break;
        }
        rebuilt.push({
          type: "word",
          text: tokens[cursor],
          translations,
          role: "support",
          fixed: false
        });
        cursor += 1;
      }

      // Trailing tokens after the last component (the "Mo fẹ́ rà omi | ni." case).
      while (!failed && cursor < tokens.length) {
        const translations = await resolve(tokens[cursor]);
        if (!translations) {
          failed = true;
          break;
        }
        rebuilt.push({ type: "word", text: tokens[cursor], translations, role: "support", fixed: false });
        cursor += 1;
      }

      const unconsumedComponents = componentIndex < components.length;
      if (failed || unconsumedComponents || rebuilt.length === components.length) {
        repaired.push(sentence);
        continue;
      }
      repaired.push({ ...sentence, components: rebuilt });
    }

    return repaired;
  }

  /**
   * Diacritics-only review of structurally-valid sentences. Returns the approved subset plus
   * a retry instruction describing what the reviewer objected to. The reviewer never edits
   * content: a rejected sentence goes back to the GENERATING model to be rewritten.
   *
   * Fails OPEN. No reviewer configured, a failed call, or no usable verdicts means every
   * sentence is approved -- a broken reviewer must not empty a lesson.
   */
  private async reviewAcceptedSentences(
    accepted: LlmGeneratedSentence[],
    input: GenerateSentencesInput,
    attempt: number
  ): Promise<{ approved: LlmGeneratedSentence[]; rejected: LlmGeneratedSentence[]; retryInstruction: string }> {
    const allApproved = { approved: accepted, rejected: [], retryInstruction: "" };
    if (typeof this.llm.reviewTonation !== "function") return allApproved;
    // The reviewer has no canonical lexicon, so it also flags valid spellings ("Eló" was
    // called missing-marks when it is correct). Cap how many regenerations it may force.
    if (this.toneRetriesUsed >= 1) return allApproved;

    let toneByIndex: Map<number, { tone?: string; translation?: string }>;
    try {
      const verdicts = await this.llm.reviewTonation({
        language: input.language,
        sentences: accepted.map((item) => ({ text: item.text, translations: item.translations || [] }))
      });
      toneByIndex = indexToneVerdicts(verdicts, accepted.length);
    } catch (error) {
      console.warn("[SENTENCE_REVIEW] reviewer call failed, accepting unreviewed", {
        lessonId: input.lessonId,
        reason: error instanceof Error ? error.message : String(error)
      });
      return allApproved;
    }

    if (toneByIndex.size === 0) return allApproved;

    const approved: LlmGeneratedSentence[] = [];
    const rejected: LlmGeneratedSentence[] = [];
    const issues = new Set<string>();
    const rejectedDetails: Array<{ text: string; issue: string; translations: string[] }> = [];

    accepted.forEach((sentence, index) => {
      const verdict = toneByIndex.get(index);
      const tone = verdict?.tone;
      const toneBad = tone === "missing" || tone === "wrong";
      const translationBad = verdict?.translation === "mismatch";
      // No verdict means the reviewer skipped this sentence; do not punish it.
      if (!toneBad && !translationBad) {
        approved.push(sentence);
        return;
      }
      rejected.push(sentence);
      if (toneBad) issues.add(describeToneIssue(tone as "missing" | "wrong", input.language));
      if (translationBad) issues.add(describeTranslationIssue(input.language));
      rejectedDetails.push({
        text: sentence.text,
        issue: [toneBad ? `tone_${tone}` : "", translationBad ? "translation_mismatch" : ""].filter(Boolean).join("+"),
        translations: sentence.translations || []
      });
    });

    if (rejected.length > 0) {
      this.toneRetriesUsed += 1;
      logAiValidation("sentence-review", {
        context: input.lessonId ? "lesson" : "language",
        attempt,
        acceptedCount: approved.length,
        rejectedCount: rejected.length,
        sampleRejected: rejectedDetails.slice(0, 3).map((item) => ({
          text: item.text,
          translations: item.translations,
          reasons: [item.issue]
        }))
      });
    }

    const retryInstruction = rejected.length
      ? [
          `A ${input.language} orthography reviewer rejected the previous sentences because ${Array.from(issues).join("; ")}.`,
          `Rejected: ${rejectedDetails.slice(0, 5).map((item) => `"${item.text}"`).join(", ")}.`,
          `Rewrite them with the tone marks and underdots exactly as standard written ${input.language} requires, and make sure each sentence really means its English translation.`
        ].join(" ")
      : "";

    return { approved, rejected, retryInstruction };
  }

  private async generateValidatedSentences(input: GenerateSentencesInput) {
    let retryInstruction = "";
    this.toneRetriesUsed = 0;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      let generated: LlmGeneratedSentence[];
      try {
        generated = await this.llm.generateSentences({
          ...input,
          extraInstructions: [input.extraInstructions, retryInstruction].filter(Boolean).join(" ").trim() || undefined
        });
      } catch (error) {
        if (!isInvalidLlmJsonError(error)) throw error;

        logAiValidation("sentences", {
          context: input.lessonId ? "lesson" : "language",
          attempt,
          acceptedCount: 0,
          rejectedCount: 0,
          error: "invalid_llm_json"
        });

        if (attempt < 3) {
          retryInstruction = [
            "Previous attempt returned invalid JSON.",
            "Regenerate and return ONLY a valid JSON object with a top-level sentences array.",
            "Do not include markdown fences, comments, prose, trailing commas, or unescaped quotes."
          ].join(" ");
          logAiRetry("sentences", {
            attempt,
            lessonId: input.lessonId,
            retryInstruction
          });
          continue;
        }

        return { accepted: [], rejected: [] };
      }

      generated = await this.markKnownMultiWordComponents(generated, input);
      generated = await this.repairComponentCoverage(generated, input);
      const validation = validateGeneratedSentences(generated, input);
      const duplicateExistingSentences = collectExistingSentenceDuplicates(
        generated,
        validation,
        input.existingSentences || []
      );
      if (duplicateExistingSentences.length > 0) {
        logAiDuplicateReuse("sentences", {
          context: input.lessonId ? "lesson" : "language",
          lessonId: input.lessonId,
          attempt,
          duplicateCount: duplicateExistingSentences.length,
          duplicates: duplicateExistingSentences.slice(0, 8)
        });
      }
      if (validation.accepted.length > 0) {
        // Structural validation passed. Now ask a second model whether the language is
        // actually right -- wrong tone marks, a translation that does not match the text,
        // English words -- none of which the structural checks can see.
        const review = await this.reviewAcceptedSentences(validation.accepted, input, attempt);
        if (review.approved.length > 0) {
          return { accepted: review.approved, rejected: validation.rejected };
        }
        if (review.rejected.length > 0 && attempt < 3) {
          // Nothing survived review: hand the reviewer's reasons back to the generating
          // model so it rewrites, rather than shipping content a second model called wrong.
          retryInstruction = review.retryInstruction;
          logAiRetry("sentences", { attempt, lessonId: input.lessonId, retryInstruction });
          continue;
        }
        return { accepted: review.approved, rejected: validation.rejected };
      }

      logAiValidation("sentences", {
        context: input.lessonId ? "lesson" : "language",
        attempt,
        acceptedCount: validation.accepted.length,
        rejectedCount: validation.rejected.length,
        sampleRejected: validation.rejected.slice(0, 3).map((item) => ({
          text: item.item.text,
          translations: item.item.translations,
          reasons: item.reasons
        }))
      });

      if (attempt < 3) {
        retryInstruction = buildRetryInstruction(validation.rejected.flatMap((item) => item.reasons));
        logAiRetry("sentences", {
          attempt,
          lessonId: input.lessonId,
          retryInstruction
        });
      }
    }

    return { accepted: [], rejected: [] };
  }
}
