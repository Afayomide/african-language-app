import type { ExpressionRepository } from "../../../../domain/repositories/ExpressionRepository.js";
import type { QuestionRepository, QuestionUpdateInput } from "../../../../domain/repositories/QuestionRepository.js";
import type { LessonRepository } from "../../../../domain/repositories/LessonRepository.js";
import type { QuestionEntity } from "../../../../domain/entities/Question.js";
import type { WordRepository } from "../../../../domain/repositories/WordRepository.js";

function lessonHasExpression(lesson: Awaited<ReturnType<LessonRepository["findById"]>>, expressionId: string) {
  if (!lesson) return false;
  return lesson.stages.some((stage) =>
    stage.blocks.some((block) => block.type === "content" && block.contentType === "expression" && block.refId === expressionId)
  );
}

export class AdminQuestionUseCases {
  constructor(
    private readonly questions: QuestionRepository,
    private readonly lessons: LessonRepository,
    private readonly expressions: ExpressionRepository,
    private readonly words: WordRepository
  ) {}

  async create(input: {
    lessonId: string;
    sourceType: "word" | "expression";
    sourceId: string;
    relatedSourceRefs?: QuestionEntity["relatedSourceRefs"];
    translationIndex?: number;
    type: QuestionEntity["type"];
    subtype: QuestionEntity["subtype"];
    promptTemplate: string;
    options: string[];
    correctIndex: number;
    reviewData?: QuestionEntity["reviewData"];
    interactionData?: QuestionEntity["interactionData"];
    explanation?: string;
  }) {
    const lesson = await this.lessons.findById(input.lessonId);
    if (!lesson) return "lesson_not_found" as const;

    const translationIndex = Number(input.translationIndex ?? 0);
    const source =
      input.sourceType === "word"
        ? await this.words.findById(input.sourceId)
        : await this.expressions.findById(input.sourceId);
    if (!source) return "source_not_found" as const;
    if (input.sourceType === "expression" && !lessonHasExpression(lesson, source.id)) {
      return "source_not_in_lesson" as const;
    }
    if (translationIndex < 0 || translationIndex >= source.translations.length) {
      return "invalid_translation_index" as const;
    }

    if (lesson.status === "published") {
      return "cannot_add_draft_to_published_lesson" as const;
    }

    return this.questions.create({
      ...input,
      translationIndex,
      status: "draft"
    });
  }

  async list(filter: {
    lessonId?: string;
    type?: QuestionEntity["type"];
    subtype?: QuestionEntity["subtype"];
    status?: "draft" | "finished" | "published";
  }) {
    return this.questions.list(filter);
  }

  async getById(id: string) {
    return this.questions.findById(id);
  }

  async update(id: string, update: QuestionUpdateInput) {
    return this.questions.updateById(id, update);
  }

  async delete(id: string) {
    return this.questions.softDeleteById(id, new Date());
  }

  async publish(id: string) {
    const question = await this.questions.findById(id);
    if (!question) return "question_not_found" as const;
    if (question.status !== "finished") return "question_not_finished" as const;

    if ((question.sourceType === "expression" || question.sourceType === "word") && question.sourceId) {
      const ids = Array.from(
        new Set([
          question.sourceId,
          ...(Array.isArray(question.relatedSourceRefs) ? question.relatedSourceRefs.map((item) => item.id) : [])
        ])
      );
      const expressionIds = Array.from(
        new Set(
          [question.sourceType === "expression" ? question.sourceId : "", ...(question.relatedSourceRefs || []).filter((item) => item.type === "expression").map((item) => item.id)]
            .filter(Boolean)
        )
      );
      const wordIds = Array.from(
        new Set(
          [question.sourceType === "word" ? question.sourceId : "", ...(question.relatedSourceRefs || []).filter((item) => item.type === "word").map((item) => item.id)]
            .filter(Boolean)
        )
      );
      const [expressions, words] = await Promise.all([
        expressionIds.length > 0 ? this.expressions.findByIds(expressionIds) : Promise.resolve([]),
        wordIds.length > 0 ? this.words.findByIds(wordIds) : Promise.resolve([])
      ]);
      if (
        expressions.length !== expressionIds.length ||
        words.length !== wordIds.length ||
        expressions.some((item) => item.status !== "published") ||
        words.some((item) => item.status !== "published")
      ) {
        return "linked_source_must_be_published" as const;
      }
    }

    return this.questions.publishById(id);
  }

  async finish(id: string) {
    const question = await this.questions.findById(id);
    if (!question) return "question_not_found" as const;
    return this.questions.finishById(id);
  }

  async sendBackToTutor(id: string) {
    const question = await this.questions.findById(id);
    if (!question) return "question_not_found" as const;
    if (question.status !== "finished") return "question_must_be_finished" as const;
    return this.questions.sendBackToTutorById(id);
  }
}
