import { contentTextKey } from "../../services/content/contentTextKey.js";
import type { LessonEntity } from "../../domain/entities/Lesson.js";
import type { ContentComponentRef } from "../../domain/entities/Content.js";
import type { ExpressionEntity } from "../../domain/entities/Expression.js";
import type { SentenceEntity } from "../../domain/entities/Sentence.js";
import type { WordEntity } from "../../domain/entities/Word.js";
import type { LessonContentItemRepository } from "../../domain/repositories/LessonContentItemRepository.js";
import type { ExpressionRepository } from "../../domain/repositories/ExpressionRepository.js";
import type { SentenceRepository } from "../../domain/repositories/SentenceRepository.js";
import type { WordRepository } from "../../domain/repositories/WordRepository.js";
import type { LlmGeneratedSentence } from "../../services/llm/types.js";
import { getLlmClient } from "../../services/llm/index.js";
import {
  isSentenceLikeExpressionText,
  splitExpressionIntoWordTokens
} from "../../services/content/expressionShape.js";

function normalize(text: string) {
  return String(text || "").trim().toLowerCase();
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((item) => String(item || "").trim()).filter(Boolean)));
}

function resolveDifficulty(level: LessonEntity["level"]) {
  if (level === "intermediate") return 2;
  if (level === "advanced") return 3;
  return 1;
}

export type PersistedSentenceDraftBundle = {
  sentences: SentenceEntity[];
  coreWords: WordEntity[];
  coreExpressions: ExpressionEntity[];
  supportWords: WordEntity[];
  supportExpressions: ExpressionEntity[];
};

export class SentenceDraftPersistenceService {
  constructor(
    private readonly words: WordRepository,
    private readonly expressions: ExpressionRepository,
    private readonly sentences: SentenceRepository,
    private readonly lessonContentItems: LessonContentItemRepository
  ) {}

  private async upsertWordFromSentenceComponent(input: {
    lesson: LessonEntity;
    modelName: string;
    text: string;
    translations: string[];
  }) {
    const existing = await this.words.findByText(input.lesson.language, input.text, input.lesson.languageId || null);
    if (existing) {
      const mergedTranslations = uniqueStrings([...existing.translations, ...input.translations]);
      const updated = await this.words.updateById(existing.id, {
        translations: mergedTranslations
      });
      return updated || existing;
    }

    return this.words.create({
      language: input.lesson.language,
      text: input.text,
      textNormalized: normalize(input.text),
      translations: uniqueStrings(input.translations),
      pronunciation: "",
      explanation: "",
      examples: [],
      difficulty: resolveDifficulty(input.lesson.level),
      aiMeta: {
        generatedByAI: true,
        model: input.modelName,
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
      lemma: input.text,
      partOfSpeech: "unknown",
      status: "draft"
    });
  }

  private async upsertExpressionFromSentenceComponent(input: {
    lesson: LessonEntity;
    modelName: string;
    text: string;
    translations: string[];
  }) {
    const existing = await this.expressions.findByText(input.lesson.language, input.text, input.lesson.languageId || null);
    if (existing) {
      const mergedTranslations = uniqueStrings([...existing.translations, ...input.translations]);
      const updated = await this.expressions.updateById(existing.id, {
        translations: mergedTranslations
      });
      return updated || existing;
    }

    return this.expressions.create({
      language: input.lesson.language,
      text: input.text,
      textNormalized: normalize(input.text),
      translations: uniqueStrings(input.translations),
      pronunciation: "",
      explanation: "",
      examples: [],
      difficulty: resolveDifficulty(input.lesson.level),
      aiMeta: {
        generatedByAI: true,
        model: input.modelName,
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
      register: "neutral",
      components: [],
      status: "draft"
    });
  }

  private async deriveContentFromSentenceDrafts(input: {
    lesson: LessonEntity;
    sentenceDrafts: LlmGeneratedSentence[];
    modelName: string;
    targetExpressions?: Array<{ text: string; translations: string[] }>;
    targetWords?: Array<{ text: string; translations: string[] }>;
  }) {
    const coreWords = new Map<string, WordEntity>();
    const coreExpressions = new Map<string, ExpressionEntity>();
    const supportWords = new Map<string, WordEntity>();
    const supportExpressions = new Map<string, ExpressionEntity>();
    // Only planned targets become expressions. Callers with no plan (ad-hoc sentence
    // drafting) pass nothing, so every component splits into words and no expression rows
    // are invented. Mirrors AdminUnitAiContentUseCases.deriveContentFromSentenceDrafts.
    // Multi-word targets are often typed into Target Words rather than Target Expressions
    // ("Níbo ni"). Either list means the curriculum asked for it. Mirrors the use-case path.
    const targetExpressionKeys = new Set(
      [...(input.targetExpressions || []), ...(input.targetWords || [])]
        .map((item) => normalize(item.text))
        .filter(Boolean)
    );

    for (const draft of input.sentenceDrafts) {
      for (const component of draft.components) {
        const normalizedText = normalize(component.text);
        if (!normalizedText) continue;

        if (component.type === "word") {
          const word = await this.upsertWordFromSentenceComponent({
            lesson: input.lesson,
            modelName: input.modelName,
            text: component.text,
            translations: component.translations
          });
          (component.role === "support" ? supportWords : coreWords).set(normalizedText, word);
          continue;
        }

        // An expression is created only when it was a planned target; `fixed=true` alone is
        // not enough. See the matching comment in AdminUnitAiContentUseCases.
        // Reuse is always allowed; only CREATION is gated. Mirrors the use-case path.
        const existingExpression =
          component.fixed === true && !isSentenceLikeExpressionText(component.text)
            ? await this.expressions.findByText(
                input.lesson.language,
                component.text,
                input.lesson.languageId || null
              )
            : null;
        if (
          component.fixed === true &&
          (existingExpression || targetExpressionKeys.has(normalizedText)) &&
          !isSentenceLikeExpressionText(component.text)
        ) {
          const expression = await this.upsertExpressionFromSentenceComponent({
            lesson: input.lesson,
            modelName: input.modelName,
            text: component.text,
            translations: component.translations
          });
          (component.role === "support" ? supportExpressions : coreExpressions).set(normalizedText, expression);
          continue;
        }
        if (component.fixed === true) {
          console.warn("[EXPRESSION_SENTENCE_GUARD]", {
            lessonId: input.lesson.id,
            title: input.lesson.title,
            text: component.text,
            reason: targetExpressionKeys.has(normalizedText)
              ? "sentence_like"
              : "not_a_planned_target_and_does_not_exist",
            note: "Component marked fixed=true was not stored as an expression; split into words instead."
          });
        }

        for (const tokenText of splitExpressionIntoWordTokens(component.text)) {
          const word = await this.upsertWordFromSentenceComponent({
            lesson: input.lesson,
            modelName: input.modelName,
            text: tokenText,
            translations: component.translations
          });
          (component.role === "support" ? supportWords : coreWords).set(normalize(word.text), word);
        }
      }
    }

    return {
      coreWords: Array.from(coreWords.values()),
      coreExpressions: Array.from(coreExpressions.values()),
      supportWords: Array.from(supportWords.values()),
      supportExpressions: Array.from(supportExpressions.values())
    };
  }

  private async persistSentenceDrafts(input: {
    lesson: LessonEntity;
    sentenceDrafts: LlmGeneratedSentence[];
    currentLessonSentences?: SentenceEntity[];
    componentIndex: {
      words: Map<string, WordEntity>;
      expressions: Map<string, ExpressionEntity>;
    };
    modelName: string;
  }) {
    const existingLanguageSentences = await this.sentences.list({
      language: input.lesson.language,
      languageId: input.lesson.languageId || null
    });
    const byText = new Map(
      [...existingLanguageSentences, ...(input.currentLessonSentences || [])].map(
        (sentence) => [contentTextKey(sentence.text), sentence] as const
      )
    );
    const createdOrReused: SentenceEntity[] = [];

    for (const draft of input.sentenceDrafts) {
      const componentRefs: ContentComponentRef[] = [];
      /** Order indexes left without a meaning because their chunk covered several words. */
      const needsGloss: number[] = [];
      let orderIndex = 0;
      for (const component of draft.components) {
        const key = normalize(component.text);
        // The model returns each component's meaning IN THIS SENTENCE. That gloss used to
        // be unioned into the shared word row and the per-occurrence link thrown away --
        // which is both why `ni` accumulated 56 translations and why `sí` shows "to"
        // inside `Bàbá ò sí ní ilé`. Keep it on the component instead.
        const contextualGloss = String(component.translations?.[0] || "").trim() || undefined;
        if (component.type === "word") {
          const content = input.componentIndex.words.get(key);
          if (!content) {
            componentRefs.length = 0;
            break;
          }
          componentRefs.push({
            type: component.type,
            refId: content.id,
            orderIndex,
            textSnapshot: content.text,
            gloss: contextualGloss
          });
          orderIndex += 1;
          continue;
        }

        if (component.fixed === true) {
          const content = input.componentIndex.expressions.get(key);
          if (!content) {
            componentRefs.length = 0;
            break;
          }
          componentRefs.push({
            type: "expression" as const,
            refId: content.id,
            orderIndex,
            textSnapshot: content.text,
            gloss: contextualGloss
          });
          orderIndex += 1;
          continue;
        }

        // A multi-word chunk being split into words: the model's gloss describes the whole
        // chunk, not any single token, so it is not carried down to the pieces. That leaves
        // these components with no meaning of their own -- the one case the word panel
        // cannot answer from any stored source -- so they are collected and glossed below.
        for (const tokenText of splitExpressionIntoWordTokens(component.text)) {
          const content = input.componentIndex.words.get(normalize(tokenText));
          if (!content) {
            componentRefs.length = 0;
            break;
          }
          needsGloss.push(orderIndex);
          componentRefs.push({
            type: "word" as const,
            refId: content.id,
            orderIndex,
            textSnapshot: content.text
          });
          orderIndex += 1;
        }
        if (componentRefs.length === 0) break;
      }

      if (componentRefs.length === 0) continue;

      await this.fillChunkGlosses(draft, componentRefs, needsGloss);

      const existing = byText.get(contentTextKey(draft.text));
      if (existing) {
        const mergedTranslations = uniqueStrings([...existing.translations, ...draft.translations]);
        const updated = await this.sentences.updateById(existing.id, {
          translations: mergedTranslations,
          literalTranslation: existing.literalTranslation || draft.literalTranslation || "",
          usageNotes: existing.usageNotes || draft.usageNotes || "",
          explanation: existing.explanation || draft.explanation || "",
          components: existing.components.length > 0 ? existing.components : componentRefs
        });
        createdOrReused.push(updated || existing);
        continue;
      }

      const created = await this.sentences.create({
        language: input.lesson.language,
        text: draft.text,
        textNormalized: contentTextKey(draft.text),
        translations: uniqueStrings(draft.translations),
        pronunciation: "",
        explanation: draft.explanation || "",
        examples: [],
        difficulty: resolveDifficulty(input.lesson.level),
        aiMeta: {
          generatedByAI: true,
          model: input.modelName,
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
        literalTranslation: draft.literalTranslation || "",
        usageNotes: draft.usageNotes || "",
        components: componentRefs,
        status: "draft"
      });
      createdOrReused.push(created);
      byText.set(contentTextKey(created.text), created);
    }

    return createdOrReused;
  }

  private async attachContentToLesson(input: {
    lesson: LessonEntity;
    createdBy: string;
    coreWords: WordEntity[];
    coreExpressions: ExpressionEntity[];
    sentences: SentenceEntity[];
  }) {
    if (!input.lesson.unitId) return;

    const existingRows = await this.lessonContentItems.list({ lessonId: input.lesson.id });
    const existingKeys = new Set(existingRows.map((row) => `${row.contentType}:${row.contentId}`));
    let orderIndex = existingRows.reduce((max, row) => Math.max(max, row.orderIndex), -1) + 1;

    const createIfMissing = async (
      contentType: "word" | "expression" | "sentence",
      contentId: string,
      role: "introduce" | "practice",
      stageIndex: number
    ) => {
      const key = `${contentType}:${contentId}`;
      if (existingKeys.has(key)) return;
      await this.lessonContentItems.create({
        lessonId: input.lesson.id,
        unitId: input.lesson.unitId,
        contentType,
        contentId,
        role,
        stageIndex,
        orderIndex,
        createdBy: input.createdBy
      });
      existingKeys.add(key);
      orderIndex += 1;
    };

    for (const word of input.coreWords) {
      await createIfMissing("word", word.id, "introduce", 0);
    }
    for (const expression of input.coreExpressions) {
      await createIfMissing("expression", expression.id, "introduce", 0);
    }
    for (const sentence of input.sentences) {
      await createIfMissing("sentence", sentence.id, "practice", 2);
    }
  }


  /**
   * Give a meaning to the components a grouped chunk left blank.
   *
   * The model already told us what "wà ní ilé" means as a phrase; it did not say which part
   * of "is at home" belongs to `wà`. The word panel presents a per-word meaning as fact, so
   * without this those words fall back to their dictionary entry -- honest, but vague, and
   * previously the source of `ń` being presented as "are".
   *
   * Deliberately best-effort. A gloss is a presentation detail; a lesson is not worth losing
   * over one. Any failure -- provider without the capability, bad JSON, a model that retyped
   * the Yoruba -- leaves the glosses empty and generation continues.
   */
  private async fillChunkGlosses(
    draft: LlmGeneratedSentence,
    componentRefs: ContentComponentRef[],
    needsGloss: number[]
  ): Promise<void> {
    const translation = String(draft.translations?.[0] || "").trim();
    if (!translation) return; // nothing to gloss against

    // The main source of blanks is not a split component, it is the meaning map: the model
    // returns plain word components AND a separate segment list that groups them, so
    // "wà ní ilé" -> "is at home" arrives as three ordinary words with one shared meaning.
    // Those indexes address the DRAFT's component list, which only lines up with the refs
    // when nothing was split -- so the segments are trusted only in that case.
    const targets = new Set(needsGloss);
    const segments = draft.meaningSegments || [];
    if (segments.length && componentRefs.length === draft.components.length) {
      for (const segment of segments) {
        const indexes = segment?.componentIndexes || [];
        if (indexes.length < 2) continue; // a 1:1 segment IS that word's meaning
        for (const index of indexes) {
          const ref = componentRefs[index];
          if (ref && !ref.gloss) targets.add(ref.orderIndex);
        }
      }
    }
    if (!targets.size) return;

    const client = getLlmClient();
    if (typeof client.glossComponents !== "function") return;

    const byOrder = new Map(componentRefs.map((ref) => [ref.orderIndex, ref] as const));
    const results = await client.glossComponents({
      sentence: draft.text,
      translation,
      components: componentRefs.map((ref) => ({
        index: ref.orderIndex,
        text: String(ref.textSnapshot || "")
      })),
      targets: [...targets].sort((a, b) => a - b)
    });

    for (const result of results) {
      const ref = byOrder.get(result.index);
      // Never overwrite a meaning the model gave directly for a one-to-one chunk.
      if (ref && !ref.gloss) ref.gloss = result.gloss;
    }

    if (results.length) {
      console.info("[GLOSS_COMPONENTS] filled", {
        sentence: draft.text.slice(0, 40),
        filled: results.length,
        of: targets.size
      });
    }
  }

  async persist(input: {
    lesson: LessonEntity;
    sentenceDrafts: LlmGeneratedSentence[];
    modelName: string;
    currentLessonSentences?: SentenceEntity[];
    attachToLesson?: boolean;
    createdBy?: string;
    /** Planned expression targets. Omit for ad-hoc drafting: no expressions are created. */
    targetExpressions?: Array<{ text: string; translations: string[] }>;
    /** Planned word targets; a multi-word one may legitimately become an expression. */
    targetWords?: Array<{ text: string; translations: string[] }>;
  }): Promise<PersistedSentenceDraftBundle> {
    const derivedContent = await this.deriveContentFromSentenceDrafts({
      lesson: input.lesson,
      sentenceDrafts: input.sentenceDrafts,
      modelName: input.modelName,
      targetExpressions: input.targetExpressions,
      targetWords: input.targetWords
    });
    const componentIndex = {
      words: new Map(
        [...derivedContent.coreWords, ...derivedContent.supportWords].map((item) => [normalize(item.text), item] as const)
      ),
      expressions: new Map(
        [...derivedContent.coreExpressions, ...derivedContent.supportExpressions].map((item) => [normalize(item.text), item] as const)
      )
    };
    const persistedSentences = await this.persistSentenceDrafts({
      lesson: input.lesson,
      sentenceDrafts: input.sentenceDrafts,
      currentLessonSentences: input.currentLessonSentences,
      componentIndex,
      modelName: input.modelName
    });

    if (input.attachToLesson && input.createdBy) {
      await this.attachContentToLesson({
        lesson: input.lesson,
        createdBy: input.createdBy,
        coreWords: derivedContent.coreWords,
        coreExpressions: derivedContent.coreExpressions,
        sentences: persistedSentences
      });
    }

    return {
      sentences: persistedSentences,
      coreWords: derivedContent.coreWords,
      coreExpressions: derivedContent.coreExpressions,
      supportWords: derivedContent.supportWords,
      supportExpressions: derivedContent.supportExpressions
    };
  }
}
