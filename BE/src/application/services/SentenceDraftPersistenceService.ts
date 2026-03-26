import type { LessonEntity } from "../../domain/entities/Lesson.js";
import type { ExpressionEntity } from "../../domain/entities/Expression.js";
import type { SentenceEntity } from "../../domain/entities/Sentence.js";
import type { WordEntity } from "../../domain/entities/Word.js";
import type { LessonContentItemRepository } from "../../domain/repositories/LessonContentItemRepository.js";
import type { ExpressionRepository } from "../../domain/repositories/ExpressionRepository.js";
import type { SentenceRepository } from "../../domain/repositories/SentenceRepository.js";
import type { WordRepository } from "../../domain/repositories/WordRepository.js";
import type { LlmGeneratedSentence } from "../../services/llm/types.js";

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
  }) {
    const coreWords = new Map<string, WordEntity>();
    const coreExpressions = new Map<string, ExpressionEntity>();
    const supportWords = new Map<string, WordEntity>();
    const supportExpressions = new Map<string, ExpressionEntity>();

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

        const expression = await this.upsertExpressionFromSentenceComponent({
          lesson: input.lesson,
          modelName: input.modelName,
          text: component.text,
          translations: component.translations
        });
        (component.role === "support" ? supportExpressions : coreExpressions).set(normalizedText, expression);
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
      [...existingLanguageSentences, ...(input.currentLessonSentences || [])].map((sentence) => [normalize(sentence.text), sentence] as const)
    );
    const createdOrReused: SentenceEntity[] = [];

    for (const draft of input.sentenceDrafts) {
      const componentRefs = draft.components
        .map((component, index) => {
          const key = normalize(component.text);
          const content =
            component.type === "word"
              ? input.componentIndex.words.get(key)
              : input.componentIndex.expressions.get(key);
          if (!content) return null;
          return {
            type: component.type,
            refId: content.id,
            orderIndex: index,
            textSnapshot: content.text
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item));

      if (componentRefs.length !== draft.components.length) continue;

      const existing = byText.get(normalize(draft.text));
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
        textNormalized: normalize(draft.text),
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
      byText.set(normalize(created.text), created);
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

  async persist(input: {
    lesson: LessonEntity;
    sentenceDrafts: LlmGeneratedSentence[];
    modelName: string;
    currentLessonSentences?: SentenceEntity[];
    attachToLesson?: boolean;
    createdBy?: string;
  }): Promise<PersistedSentenceDraftBundle> {
    const derivedContent = await this.deriveContentFromSentenceDrafts({
      lesson: input.lesson,
      sentenceDrafts: input.sentenceDrafts,
      modelName: input.modelName
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
