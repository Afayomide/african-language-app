import type { QuestionRepository, QuestionUpdateInput } from "../../../../domain/repositories/QuestionRepository.js";
import type { LessonRepository } from "../../../../domain/repositories/LessonRepository.js";
import type { PhraseRepository } from "../../../../domain/repositories/PhraseRepository.js";
import type { QuestionEntity } from "../../../../domain/entities/Question.js";

export class AdminQuestionUseCases {
  constructor(
    private readonly questions: QuestionRepository,
    private readonly lessons: LessonRepository,
    private readonly phrases: PhraseRepository
  ) {}

  async create(input: {
    lessonId: string;
    phraseId: string;
    relatedPhraseIds?: string[];
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

    const phrase = await this.phrases.findById(input.phraseId);
    if (!phrase) return "phrase_not_found" as const;
    if (!phrase.lessonIds.includes(lesson.id)) return "phrase_not_in_lesson" as const;
    const translationIndex = Number(input.translationIndex ?? 0);
    if (translationIndex < 0 || translationIndex >= phrase.translations.length) {
      return "invalid_translation_index" as const;
    }

    // Validation: Cannot add draft items to a published lesson
    if (lesson.status === "published") {
      return "cannot_add_draft_to_published_lesson" as const;
    }

    return this.questions.create({
      ...input,
      relatedPhraseIds: Array.isArray(input.relatedPhraseIds) ? input.relatedPhraseIds : [],
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
    const phraseIds = Array.from(
      new Set([question.phraseId, ...(Array.isArray(question.relatedPhraseIds) ? question.relatedPhraseIds : [])])
    );
    const phrases = await this.phrases.findByIds(phraseIds);
    if (phrases.length !== phraseIds.length || phrases.some((phrase) => phrase.status !== "published")) {
      return "linked_phrase_must_be_published" as const;
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
