import ExerciseQuestionModel from "../../../../models/ExerciseQuestion.js";
import type { QuestionEntity } from "../../../../domain/entities/Question.js";
import type {
  QuestionCreateInput,
  QuestionListFilter,
  QuestionRepository,
  QuestionUpdateInput
} from "../../../../domain/repositories/QuestionRepository.js";

function toEntity(doc: any): QuestionEntity {
  return {
    id: doc._id.toString(),
    _id: doc._id.toString(),
    lessonId: doc.lessonId.toString(),
    phraseId: doc.phraseId.toString(),
    type: doc.type,
    promptTemplate: doc.promptTemplate,
    options: doc.options || [],
    correctIndex: doc.correctIndex,
    reviewData: doc.reviewData,
    explanation: String(doc.explanation || ""),
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

export class MongooseQuestionRepository implements QuestionRepository {
  async create(input: QuestionCreateInput): Promise<QuestionEntity> {
    const created = await ExerciseQuestionModel.create(input);
    return toEntity(created);
  }

  async list(filter: QuestionListFilter): Promise<QuestionEntity[]> {
    const query: Record<string, unknown> = { isDeleted: { $ne: true } };
    if (filter.lessonId) query.lessonId = filter.lessonId;
    if (filter.lessonIds) query.lessonId = { $in: filter.lessonIds };
    if (filter.type) query.type = filter.type;
    if (filter.status) query.status = filter.status;

    const questions = await ExerciseQuestionModel.find(query).sort({ createdAt: -1 });
    return questions.map(toEntity);
  }

  async findById(id: string): Promise<QuestionEntity | null> {
    const question = await ExerciseQuestionModel.findOne({ _id: id, isDeleted: { $ne: true } });
    return question ? toEntity(question) : null;
  }

  async updateById(id: string, update: QuestionUpdateInput): Promise<QuestionEntity | null> {
    const question = await ExerciseQuestionModel.findOneAndUpdate(
      { _id: id, isDeleted: { $ne: true } },
      update,
      { new: true }
    );
    return question ? toEntity(question) : null;
  }

  async softDeleteById(id: string, now: Date): Promise<QuestionEntity | null> {
    const question = await ExerciseQuestionModel.findOneAndUpdate(
      { _id: id, isDeleted: { $ne: true } },
      { isDeleted: true, deletedAt: now },
      { new: true }
    );
    return question ? toEntity(question) : null;
  }

  async softDeleteByLessonId(lessonId: string, now: Date): Promise<void> {
    await ExerciseQuestionModel.updateMany(
      { lessonId, isDeleted: { $ne: true } },
      { isDeleted: true, deletedAt: now }
    );
  }

  async softDeleteByPhraseId(phraseId: string, now: Date): Promise<void> {
    await ExerciseQuestionModel.updateMany(
      { phraseId, isDeleted: { $ne: true } },
      { isDeleted: true, deletedAt: now }
    );
  }

  async publishById(id: string): Promise<QuestionEntity | null> {
    const question = await ExerciseQuestionModel.findOneAndUpdate(
      { _id: id, status: "finished", isDeleted: { $ne: true } },
      { status: "published" },
      { new: true }
    );
    return question ? toEntity(question) : null;
  }

  async finishById(id: string): Promise<QuestionEntity | null> {
    const question = await ExerciseQuestionModel.findOneAndUpdate(
      { _id: id, isDeleted: { $ne: true } },
      { status: "finished" },
      { new: true }
    );
    return question ? toEntity(question) : null;
  }
}
