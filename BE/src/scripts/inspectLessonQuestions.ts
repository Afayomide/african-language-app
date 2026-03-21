import "dotenv/config";
import mongoose from "mongoose";
import LessonModel from "../models/Lesson.js";
import ExerciseQuestionModel from "../models/ExerciseQuestion.js";
import ExpressionModel from "../models/Expression.js";
import SentenceModel from "../models/Sentence.js";
import WordModel from "../models/Word.js";
import ProverbModel from "../models/Proverb.js";
import LessonContentItemModel from "../models/LessonContentItem.js";

type ContentType = "word" | "expression" | "sentence";

function normalize(value: string) {
  return String(value || "").trim().toLowerCase();
}

function splitWords(value: string) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isIgnorableSentenceGap(value: string) {
  return String(value || "").replace(/[\s.,!?;:'"()\-–—]+/g, "").length === 0;
}

function componentsCoverText(
  text: string,
  components: Array<{ text: string }>
) {
  const source = String(text || "");
  const lowerSource = source.toLocaleLowerCase();
  let cursor = 0;

  for (const component of components) {
    const componentText = String(component.text || "").trim();
    if (!componentText) continue;
    const matchIndex = lowerSource.indexOf(componentText.toLocaleLowerCase(), cursor);
    if (matchIndex < 0) {
      return false;
    }
    const skipped = source.slice(cursor, matchIndex);
    if (!isIgnorableSentenceGap(skipped)) {
      return false;
    }
    cursor = matchIndex + componentText.length;
  }

  return isIgnorableSentenceGap(source.slice(cursor));
}

function resolveTranslation(translations: unknown, index?: number) {
  const values = Array.isArray(translations)
    ? translations.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

  if (values.length === 0) {
    return { translations: values, selectedTranslation: "", selectedTranslationIndex: 0 };
  }

  const selectedIndex =
    typeof index === "number" && index >= 0 && index < values.length ? index : 0;
  return {
    translations: values,
    selectedTranslation: values[selectedIndex] || values[0] || "",
    selectedTranslationIndex: selectedIndex,
  };
}

function audioSummary(audio: any) {
  if (!audio) return null;
  return {
    url: audio.url || "",
    provider: audio.provider || "",
    voice: audio.voice || "",
    locale: audio.locale || "",
    format: audio.format || "",
    s3Key: audio.s3Key || "",
  };
}

async function main() {
  const lessonId = process.argv[2];
  if (!lessonId) {
    throw new Error("Usage: node --import tsx src/scripts/inspectLessonQuestions.ts <lessonId>");
  }

  const mongoUri = process.env.MONGODB_URI || "";
  if (!mongoUri) {
    throw new Error("Missing MONGODB_URI");
  }

  await mongoose.connect(mongoUri);

  try {
    const lesson = await LessonModel.findById(lessonId).lean();
    if (!lesson) {
      throw new Error("Lesson not found");
    }

    const stages = Array.isArray(lesson.stages)
      ? [...lesson.stages].sort((left, right) => (left.orderIndex || 0) - (right.orderIndex || 0))
      : [];

    const lessonContentItems = await LessonContentItemModel.find({ lessonId: lesson._id })
      .sort({ stageIndex: 1, orderIndex: 1, createdAt: 1 })
      .lean();

    const questionIds = new Set<string>();
    const proverbIds = new Set<string>();
    const wordIds = new Set<string>();
    const expressionIds = new Set<string>();
    const sentenceIds = new Set<string>();

    function addContentId(type: ContentType | undefined | null, id: unknown) {
      const normalizedId = String(id || "").trim();
      if (!normalizedId) return;
      if (type === "word") wordIds.add(normalizedId);
      if (type === "expression") expressionIds.add(normalizedId);
      if (type === "sentence") sentenceIds.add(normalizedId);
    }

    for (const stage of stages) {
      for (const block of Array.isArray(stage.blocks) ? stage.blocks : []) {
        if (block.type === "question" && block.refId) {
          questionIds.add(String(block.refId));
        }
        if (block.type === "proverb" && block.refId) {
          proverbIds.add(String(block.refId));
        }
        if (block.type === "content" && block.refId) {
          addContentId(block.contentType as ContentType, block.refId);
        }
      }
    }

    for (const row of lessonContentItems) {
      addContentId(row.contentType as ContentType, row.contentId);
    }

    const questions = await ExerciseQuestionModel.find({
      _id: { $in: Array.from(questionIds) },
    }).lean();

    for (const question of questions) {
      addContentId(question.sourceType as ContentType, question.sourceId);
      for (const ref of Array.isArray(question.relatedSourceRefs) ? question.relatedSourceRefs : []) {
        addContentId(ref?.type as ContentType, ref?.id);
      }
      for (const pair of question.interactionData?.matchingPairs || []) {
        addContentId(pair?.contentType as ContentType, pair?.contentId);
      }
    }

    let words = await WordModel.find({ _id: { $in: Array.from(wordIds) } }).lean();
    let expressions = await ExpressionModel.find({ _id: { $in: Array.from(expressionIds) } }).lean();
    let sentences = await SentenceModel.find({ _id: { $in: Array.from(sentenceIds) } }).lean();

    for (const sentence of sentences) {
      for (const component of sentence.components || []) {
        addContentId(component?.type as ContentType, component?.refId);
      }
    }
    for (const expression of expressions) {
      for (const component of expression.components || []) {
        addContentId(component?.type as ContentType, component?.refId);
      }
    }

    words = await WordModel.find({ _id: { $in: Array.from(wordIds) } }).lean();
    expressions = await ExpressionModel.find({ _id: { $in: Array.from(expressionIds) } }).lean();
    sentences = await SentenceModel.find({ _id: { $in: Array.from(sentenceIds) } }).lean();

    const proverbs = await ProverbModel.find({
      _id: { $in: Array.from(proverbIds) },
    }).lean();

    const wordMap = new Map(words.map((item) => [String(item._id), item] as const));
    const expressionMap = new Map(expressions.map((item) => [String(item._id), item] as const));
    const sentenceMap = new Map(sentences.map((item) => [String(item._id), item] as const));
    const proverbMap = new Map(proverbs.map((item) => [String(item._id), item] as const));
    const questionMap = new Map(questions.map((item) => [String(item._id), item] as const));

    function getContent(type: ContentType | undefined | null, id: unknown) {
      const normalizedId = String(id || "").trim();
      if (!normalizedId || !type) return null;
      if (type === "word") return wordMap.get(normalizedId) || null;
      if (type === "expression") return expressionMap.get(normalizedId) || null;
      if (type === "sentence") return sentenceMap.get(normalizedId) || null;
      return null;
    }

    function summarizeContent(
      type: ContentType | undefined | null,
      id: unknown,
      translationIndex?: number
    ) {
      const entity = getContent(type, id);
      if (!entity) {
        return {
          type: type || null,
          id: String(id || ""),
          missing: true,
        };
      }

      const translation = resolveTranslation(entity.translations, translationIndex);
      const summary: Record<string, unknown> = {
        type,
        id: String(entity._id),
        text: entity.text,
        translations: translation.translations,
        selectedTranslation: translation.selectedTranslation,
        selectedTranslationIndex: translation.selectedTranslationIndex,
        status: entity.status,
        difficulty: entity.difficulty,
        explanation: entity.explanation || "",
        pronunciation: entity.pronunciation || "",
        audio: audioSummary(entity.audio),
      };

      if (type === "word") {
        summary.lemma = (entity as any).lemma || "";
        summary.partOfSpeech = (entity as any).partOfSpeech || "";
      }

      if (type === "expression" || type === "sentence") {
        const components = Array.isArray((entity as any).components) ? (entity as any).components : [];
        summary.componentCount = components.length;
        summary.componentsCoverText = componentsCoverText(
          entity.text,
          components.map((component: any) => ({
            text:
              String(getContent(component?.type as ContentType, component?.refId)?.text || component?.textSnapshot || "")
          }))
        );
        summary.components = components
          .slice()
          .sort((left: any, right: any) => (left.orderIndex || 0) - (right.orderIndex || 0))
          .map((component: any) => {
            const resolved = getContent(component?.type as ContentType, component?.refId);
            return {
              orderIndex: component?.orderIndex ?? 0,
              type: component?.type || null,
              refId: String(component?.refId || ""),
              textSnapshot: component?.textSnapshot || "",
              resolvedText: resolved?.text || "",
              resolvedTranslations: Array.isArray(resolved?.translations) ? resolved?.translations : [],
            };
          });
      }

      if (type === "sentence") {
        summary.literalTranslation = (entity as any).literalTranslation || "";
        summary.usageNotes = (entity as any).usageNotes || "";
      }

      if (type === "expression") {
        summary.register = (entity as any).register || "";
      }

      return summary;
    }

    console.dir(
      {
        lesson: {
          id: String(lesson._id),
          title: lesson.title,
          language: lesson.language,
          level: lesson.level,
          status: lesson.status,
          unitId: lesson.unitId,
          orderIndex: lesson.orderIndex,
          description: lesson.description,
          topics: Array.isArray(lesson.topics) ? lesson.topics : [],
          stageCount: stages.length,
          questionCount: questions.length,
          proverbCount: proverbs.length,
          lessonContentItemCount: lessonContentItems.length,
        },
      },
      { depth: null, colors: true }
    );

    console.log("\n=== Lesson Content Items ===");
    if (lessonContentItems.length === 0) {
      console.log("No lesson content items found.");
    } else {
      console.dir(
        lessonContentItems.map((item) => ({
          id: String(item._id),
          role: item.role,
          stageIndex: item.stageIndex,
          orderIndex: item.orderIndex,
          content: summarizeContent(item.contentType as ContentType, item.contentId),
          createdAt: item.createdAt,
        })),
        { depth: null, colors: true }
      );
    }

    console.log("\n=== Full Content Inventory ===");
    console.dir(
      {
        words: words.map((item) => summarizeContent("word", item._id)),
        expressions: expressions.map((item) => summarizeContent("expression", item._id)),
        sentences: sentences.map((item) => summarizeContent("sentence", item._id)),
      },
      { depth: null, colors: true }
    );

    for (const stage of stages) {
      console.log(`\n=== ${stage.title || "Untitled Stage"} (order: ${stage.orderIndex ?? 0}) ===`);
      console.log(`Description: ${stage.description || ""}`);

      const blocks = Array.isArray(stage.blocks) ? stage.blocks : [];
      if (blocks.length === 0) {
        console.log("No blocks.");
        continue;
      }

      for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
        const block = blocks[blockIndex];

        if (block.type === "text") {
          console.dir(
            {
              blockIndex,
              blockType: "text",
              content: block.content || "",
            },
            { depth: null, colors: true }
          );
          continue;
        }

        if (block.type === "content") {
          console.dir(
            {
              blockIndex,
              blockType: "content",
              contentType: block.contentType,
              refId: String(block.refId || ""),
              blockTranslationIndex:
                typeof block.translationIndex === "number" ? block.translationIndex : null,
              content: summarizeContent(
                block.contentType as ContentType,
                block.refId,
                typeof block.translationIndex === "number" ? block.translationIndex : 0
              ),
            },
            { depth: null, colors: true }
          );
          continue;
        }

        if (block.type === "proverb") {
          const proverb = proverbMap.get(String(block.refId || ""));
          console.dir(
            {
              blockIndex,
              blockType: "proverb",
              refId: String(block.refId || ""),
              proverb: proverb
                ? {
                    id: String(proverb._id),
                    text: proverb.text,
                    translation: proverb.translation,
                    contextNote: proverb.contextNote,
                    status: proverb.status,
                  }
                : { missing: true },
            },
            { depth: null, colors: true }
          );
          continue;
        }

        if (block.type === "question") {
          const question = questionMap.get(String(block.refId || ""));
          if (!question) {
            console.dir(
              {
                blockIndex,
                blockType: "question",
                refId: String(block.refId || ""),
                missing: true,
              },
              { depth: null, colors: true }
            );
            continue;
          }

          const options = Array.isArray(question.options)
            ? question.options.map((item) => String(item || ""))
            : [];
          const correctIndex =
            typeof question.correctIndex === "number" ? question.correctIndex : -1;
          const correctOption =
            correctIndex >= 0 && correctIndex < options.length ? options[correctIndex] : null;

          console.dir(
            {
              blockIndex,
              blockType: "question",
              blockTranslationIndex:
                typeof block.translationIndex === "number" ? block.translationIndex : null,
              question: {
                id: String(question._id),
                type: question.type,
                subtype: question.subtype,
                promptTemplate: question.promptTemplate,
                translationIndex:
                  typeof question.translationIndex === "number" ? question.translationIndex : null,
                options,
                correctIndex,
                correctOption,
                reviewData: question.reviewData || null,
                explanation: question.explanation || "",
                status: question.status,
                source: summarizeContent(
                  question.sourceType as ContentType,
                  question.sourceId,
                  typeof question.translationIndex === "number" ? question.translationIndex : 0
                ),
                relatedSources: (Array.isArray(question.relatedSourceRefs)
                  ? question.relatedSourceRefs
                  : []
                ).map((ref: any) => summarizeContent(ref?.type as ContentType, ref?.id)),
                matchingPairs: (question.interactionData?.matchingPairs || []).map((pair: any) => ({
                  pairId: pair?.pairId || "",
                  content: summarizeContent(
                    pair?.contentType as ContentType,
                    pair?.contentId,
                    typeof pair?.translationIndex === "number" ? pair.translationIndex : 0
                  ),
                  contentText: pair?.contentText || "",
                  translationIndex:
                    typeof pair?.translationIndex === "number" ? pair.translationIndex : null,
                  translation: pair?.translation || "",
                  image: pair?.image || null,
                })),
              },
              isListening: question.type === "listening",
            },
            { depth: null, colors: true }
          );
        }
      }
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
