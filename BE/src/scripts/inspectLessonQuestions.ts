import "dotenv/config";
import mongoose from "mongoose";
import LessonModel from "../models/Lesson.js";
import ExerciseQuestionModel from "../models/ExerciseQuestion.js";
import PhraseModel from "../models/Phrase.js";

function resolveTranslation(translations: unknown, index?: number) {
  const values = Array.isArray(translations)
    ? translations.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

  if (values.length === 0) {
    return { translations: values, selectedTranslation: "" };
  }

  const selectedIndex = typeof index === "number" && index >= 0 && index < values.length ? index : 0;
  return {
    translations: values,
    selectedTranslation: values[selectedIndex] || values[0] || ""
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

    console.dir(
      {
        lesson: {
          id: String(lesson._id),
          title: lesson.title,
          language: lesson.language,
          status: lesson.status,
          unitId: lesson.unitId,
          orderIndex: lesson.orderIndex,
          stageCount: stages.length
        }
      },
      { depth: null, colors: true }
    );

    for (const stage of stages) {
      console.log(`\n=== ${stage.title || "Untitled Stage"} (order: ${stage.orderIndex ?? 0}) ===`);

      const blocks = Array.isArray(stage.blocks) ? stage.blocks : [];
      for (const block of blocks) {
        if (block.type !== "question" || !block.refId) {
          continue;
        }

        const question = await ExerciseQuestionModel.findById(block.refId).lean();
        if (!question) {
          console.dir({ missingQuestionId: String(block.refId) }, { depth: null, colors: true });
          continue;
        }

        const phrase = question.phraseId ? await PhraseModel.findById(question.phraseId).lean() : null;
        const { translations, selectedTranslation } = resolveTranslation(
          phrase?.translations,
          typeof question.translationIndex === "number" ? question.translationIndex : block.translationIndex
        );

        const audio = phrase
          ? {
              audioUrl: phrase.audio?.url || "",
              audioProvider: phrase.audio?.provider || "",
              voice: phrase.audio?.voice || "",
              locale: phrase.audio?.locale || ""
            }
          : null;

        const options = Array.isArray(question.options)
          ? question.options.map((item) => String(item || ""))
          : [];
        const correctIndex = typeof question.correctIndex === "number" ? question.correctIndex : -1;
        const correctOption = correctIndex >= 0 && correctIndex < options.length ? options[correctIndex] : null;

        console.dir(
          {
            stageTitle: stage.title || "",
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
              status: question.status
            },
            phrase: phrase
              ? {
                  id: String(phrase._id),
                  text: phrase.text,
                  translations,
                  selectedTranslation,
                  audio
                }
              : null,
            isListening: question.type === "listening"
          },
          { depth: null, colors: true }
        );
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
