import 'dotenv/config';
import mongoose from 'mongoose';
import UnitModel from '../models/Unit.js';
import LessonModel from '../models/Lesson.js';
import ExerciseQuestionModel from '../models/ExerciseQuestion.js';

const unitId = process.argv[2];
if (!unitId) throw new Error('unitId required');
await mongoose.connect(process.env.MONGODB_URI || '');
const unit = await UnitModel.findById(unitId).lean();
if (!unit) throw new Error('Unit not found');
const lessons = await LessonModel.find({ unitId }).sort({ orderIndex: 1 }).lean();
const questionIds = Array.from(new Set(lessons.flatMap((lesson:any) => (lesson.stages || []).flatMap((stage:any) => (stage.blocks || []).filter((b:any) => b.type === 'question' && b.refId).map((b:any) => String(b.refId))))));
const questions = await ExerciseQuestionModel.find({ _id: { $in: questionIds } }).lean();
const qmap = new Map(questions.map((q:any) => [String(q._id), q] as const));
for (const lesson of lessons as any[]) {
  console.log(`LESSON ${lesson.orderIndex + 1}: ${lesson.title} (${lesson.kind})`);
  const seen = new Map<string, string[]>();
  for (const stage of (lesson.stages || []).slice().sort((a:any, b:any) => (a.orderIndex || 0) - (b.orderIndex || 0))) {
    console.log(`  Stage ${(stage.orderIndex || 0) + 1}: ${stage.title}`);
    for (const [index, block] of (stage.blocks || []).entries()) {
      if (block.type !== 'question') {
        console.log(`    [${index}] ${block.type}${block.contentType ? `:${block.contentType}` : ''}`);
        continue;
      }
      const q:any = qmap.get(String(block.refId));
      console.log(`    [${index}] ${q?.type || '?'} / ${q?.subtype || '?'} / ${q?.sourceType || '?'} / ${q?.sourceId ? String(q.sourceId) : '?'}`);
      const key = q?.sourceId && q?.subtype ? `${String(q.sourceId)}::${q.subtype}` : '';
      if (key) {
        const arr = seen.get(key) || [];
        arr.push(`stage${(stage.orderIndex || 0) + 1}`);
        seen.set(key, arr);
      }
    }
  }
  const dups = Array.from(seen.entries()).filter(([, stages]) => stages.length > 1);
  console.log(`  duplicate source+subtype pairs: ${dups.length}`);
  if (dups.length > 0) {
    console.log(JSON.stringify(dups, null, 2));
  }
  console.log('');
}
await mongoose.disconnect();
