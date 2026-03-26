import 'dotenv/config';
import mongoose from 'mongoose';
import LessonModel from '../models/Lesson.js';
import ExerciseQuestionModel from '../models/ExerciseQuestion.js';
const unitId = process.argv[2];
await mongoose.connect(process.env.MONGODB_URI || '');
const lessons = await LessonModel.find({ unitId, deletedAt: null }).sort({ orderIndex: 1 }).lean();
const questionIds = Array.from(new Set(lessons.flatMap((lesson:any) => (lesson.stages || []).flatMap((stage:any) => (stage.blocks || []).filter((b:any) => b.type === 'question' && b.refId).map((b:any) => String(b.refId))))));
const questions = await ExerciseQuestionModel.find({ _id: { $in: questionIds } }).lean();
const qmap = new Map(questions.map((q:any) => [String(q._id), q] as const));
for (const lesson of lessons as any[]) {
  console.log(`LESSON ${lesson.orderIndex + 1}: ${lesson.title} (${lesson.kind})`);
  for (const stage of (lesson.stages || []).slice().sort((a:any,b:any)=>(a.orderIndex||0)-(b.orderIndex||0))) {
    const items = (stage.blocks || []).map((block:any) => {
      if (block.type !== 'question') return block.type;
      const q:any = qmap.get(String(block.refId));
      return `${q?.subtype || '?'}:${q?.sourceType || '?'}`;
    });
    console.log(`  Stage ${(stage.orderIndex||0)+1}: ${items.join(' | ')}`);
  }
  console.log('');
}
await mongoose.disconnect();
