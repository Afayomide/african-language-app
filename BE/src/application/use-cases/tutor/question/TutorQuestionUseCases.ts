import type { Language } from "../../../../domain/entities/Lesson.js";
import type { LessonRepository } from "../../../../domain/repositories/LessonRepository.js";
import type { PhraseRepository } from "../../../../domain/repositories/PhraseRepository.js";
import type { QuestionRepository, QuestionUpdateInput } from "../../../../domain/repositories/QuestionRepository.js";
import type { QuestionEntity } from "../../../../domain/entities/Question.js";

export class TutorQuestionUseCases {
  constructor(
    private readonly questions: QuestionRepository,
    private readonly lessons: LessonRepository,
    private readonly phrases: PhraseRepository
  ) {}

  async create(
    input: {
      lessonId: string;
      phraseId: string;
      type: QuestionEntity["type"];
      subtype: QuestionEntity["subtype"];
      promptTemplate: string;
      options: string[];
      correctIndex: number;
      reviewData?: QuestionEntity["reviewData"];
      explanation?: string;
    },
    tutorLanguage: Language
  ) {
    const lesson = await this.lessons.findById(input.lessonId);
    if (!lesson || lesson.language !== tutorLanguage) return "lesson_not_found" as const;

    const phrase = await this.phrases.findById(input.phraseId);
    if (!phrase || !phrase.lessonIds.includes(lesson.id)) return "phrase_not_found" as const;

    return this.questions.create({ ...input, status: "draft" });
  }

  async list(
    filter: { lessonId?: string; type?: QuestionEntity["type"]; status?: "draft" | "finished" | "published" },
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

    if (update.phraseId) {
      const phrase = await this.phrases.findById(update.phraseId);
      if (!phrase || !phrase.lessonIds.includes(question.lessonId)) return "phrase_not_found" as const;
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
