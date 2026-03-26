import 'dotenv/config';
import mongoose from 'mongoose';
import LessonModel from '../models/Lesson.js';

const unitId = process.argv[2];
await mongoose.connect(process.env.MONGODB_URI || '');
const lessons = await LessonModel.find({ unitId }).sort({ orderIndex: 1, createdAt: 1 }).lean();
for (const lesson of lessons as any[]) {
  console.log(JSON.stringify({
    id: String(lesson._id),
    orderIndex: lesson.orderIndex,
    title: lesson.title,
    kind: lesson.kind,
    status: lesson.status,
    createdAt: lesson.createdAt,
    deletedAt: lesson.deletedAt || null
  }));
}
await mongoose.disconnect();
