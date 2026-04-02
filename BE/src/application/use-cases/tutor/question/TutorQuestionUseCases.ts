import type { Language } from "../../../../domain/entities/Lesson.js";
import type { ExpressionRepository } from "../../../../domain/repositories/ExpressionRepository.js";
import type { LessonRepository } from "../../../../domain/repositories/LessonRepository.js";
import type { QuestionRepository, QuestionUpdateInput } from "../../../../domain/repositories/QuestionRepository.js";
import type { QuestionEntity } from "../../../../domain/entities/Question.js";
import type { WordRepository } from "../../../../domain/repositories/WordRepository.js";

function lessonHasExpression(lesson: Awaited<ReturnType<LessonRepository["findById"]>>, expressionId: string) {
  if (!lesson) return false;
  return lesson.stages.some((stage) =>
    stage.blocks.some((block) => block.type === "content" && block.contentType === "expression" && block.refId === expressionId)
  );
}

export class TutorQuestionUseCases {
  constructor(
    private readonly questions: QuestionRepository,
    private readonly lessons: LessonRepository,
    private readonly expressions: ExpressionRepository,
    private readonly words: WordRepository
  ) {}

  async create(
    input: {
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
    },
    tutorLanguage: Language
  ) {
    const lesson = await this.lessons.findById(input.lessonId);
    if (!lesson || lesson.language !== tutorLanguage) return "lesson_not_found" as const;

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

    return this.questions.create({
      ...input,
      translationIndex,
      status: "draft"
    });
  }

  async list(
    filter: {
      lessonId?: string;
      type?: QuestionEntity["type"];
      subtype?: QuestionEntity["subtype"];
      status?: "draft" | "finished" | "published";
    },
    tutorLanguage: Language
  ) {
    if (filter.lessonId) {
      const lesson = await this.lessons.findById(filter.lessonId);
      if (!lesson || lesson.language !== tutorLanguage) return "lesson_not_found" as const;
      return this.questions.list({ ...filter, lessonId: lesson.id });
    }

    const lessons = await this.lessons.listByLanguage(tutorLanguage);
    return this.questions.list({ ...filter, lessonIds: lessons.map((item) => item.id) });
  }

  async getByIdInScope(id: string, tutorLanguage: Language) {
    const question = await this.questions.findById(id);
    if (!question) return null;
    const lesson = await this.lessons.findById(question.lessonId);
    if (!lesson || lesson.language !== tutorLanguage) return null;
    return question;
  }

  async updateInScope(id: string, tutorLanguage: Language, update: QuestionUpdateInput) {
    const question = await this.getByIdInScope(id, tutorLanguage);
    if (!question) return "question_not_found" as const;

    if ((update.sourceType === "expression" || update.sourceType === "word") && update.sourceId) {
      const lesson = await this.lessons.findById(question.lessonId);
      if (!lesson) return "question_not_found" as const;
      const source =
        update.sourceType === "word"
          ? await this.words.findById(update.sourceId)
          : await this.expressions.findById(update.sourceId);
      if (!source) return "source_not_found" as const;
      if (update.sourceType === "expression" && !lessonHasExpression(lesson, source.id)) {
        return "source_not_in_lesson" as const;
      }
    }

    return this.questions.updateById(id, update);
  }

  async deleteInScope(id: string, tutorLanguage: Language) {
    const question = await this.getByIdInScope(id, tutorLanguage);
    if (!question) return null;
    return this.questions.softDeleteById(id, new Date());
  }

  async finishInScope(id: string, tutorLanguage: Language) {
    const question = await this.getByIdInScope(id, tutorLanguage);
    if (!question) return "question_not_found" as const;
    return this.questions.finishById(id);
  }
}
