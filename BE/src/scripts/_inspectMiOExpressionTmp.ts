import 'dotenv/config';
import mongoose from 'mongoose';
import ExpressionModel from '../models/Expression.js';
import WordModel from '../models/Word.js';
import LessonModel from '../models/Lesson.js';
import LessonContentItemModel from '../models/LessonContentItem.js';
import ExerciseQuestionModel from '../models/ExerciseQuestion.js';

await mongoose.connect(process.env.MONGODB_URI || '');

const expressionCandidates = await ExpressionModel.find({
  $or: [
    { text: /mi\s*o/i },
    { text: /mi\s*ò/i },
    { textNormalized: /mi\s*o/i },
    { textNormalized: /mi\s*ò/i }
  ],
  deletedAt: null
}).lean();

const wordCandidates = await WordModel.find({
  $or: [
    { text: /^mi$/i },
    { text: /^o$/i },
    { text: /^ò$/i },
    { textNormalized: /^mi$/i },
    { textNormalized: /^o$/i },
    { textNormalized: /^ò$/i }
  ],
  deletedAt: null
}).lean();

const expressionIds = expressionCandidates.map((item: any) => item._id);
const lessonLinks = expressionIds.length
  ? await LessonContentItemModel.find({ contentType: 'expression', contentId: { $in: expressionIds }, deletedAt: null }).lean()
  : [];
const lessonIds = [...new Set(lessonLinks.map((item: any) => String(item.lessonId)))];
const lessons = lessonIds.length ? await LessonModel.find({ _id: { $in: lessonIds } }).lean() : [];
const questions = expressionIds.length
  ? await ExerciseQuestionModel.find({ sourceType: 'expression', sourceId: { $in: expressionIds }, deletedAt: null }).lean()
  : [];

const lessonMap = new Map(lessons.map((item: any) => [String(item._id), item]));

console.log(JSON.stringify({
  expressions: expressionCandidates.map((item: any) => ({
    id: String(item._id),
    text: item.text,
    textNormalized: item.textNormalized,
    translations: item.translations,
    components: (item.components || []).map((component: any) => ({
      type: component.type,
      refId: String(component.refId),
      orderIndex: component.orderIndex,
      textSnapshot: component.textSnapshot
    })),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  })),
  words: wordCandidates.map((item: any) => ({
    id: String(item._id),
    text: item.text,
    textNormalized: item.textNormalized,
    translations: item.translations,
    createdAt: item.createdAt
  })),
  lessonLinks: lessonLinks.map((item: any) => ({
    lessonId: String(item.lessonId),
    role: item.role,
    createdAt: item.createdAt,
    lessonTitle: lessonMap.get(String(item.lessonId))?.title || null
  })),
  questions: questions.map((item: any) => ({
    id: String(item._id),
    lessonId: String(item.lessonId),
    subtype: item.subtype,
    promptTemplate: item.promptTemplate,
    createdAt: item.createdAt
  }))
}, null, 2));

await mongoose.disconnect();
