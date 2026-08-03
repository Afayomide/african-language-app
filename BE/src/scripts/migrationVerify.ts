import "dotenv/config";
import mongoose from "mongoose";
import { sql } from "drizzle-orm";

import { db, pool } from "../infrastructure/db/drizzle/client.js";

import { MongooseLessonRepository } from "../infrastructure/db/mongoose/repositories/MongooseLessonRepository.js";
import { DrizzleLessonRepository } from "../infrastructure/db/drizzle/repositories/DrizzleLessonRepository.js";
import { MongooseSentenceRepository } from "../infrastructure/db/mongoose/repositories/MongooseSentenceRepository.js";
import { DrizzleSentenceRepository } from "../infrastructure/db/drizzle/repositories/DrizzleSentenceRepository.js";
import { MongooseQuestionRepository } from "../infrastructure/db/mongoose/repositories/MongooseQuestionRepository.js";
import { DrizzleQuestionRepository } from "../infrastructure/db/drizzle/repositories/DrizzleQuestionRepository.js";

import LessonModel from "../models/Lesson.js";
import SentenceModel from "../models/Sentence.js";
import ExpressionModel from "../models/Expression.js";
import ExerciseQuestionModel from "../models/ExerciseQuestion.js";
import WordModel from "../models/Word.js";
import UnitModel from "../models/Unit.js";
import ChapterModel from "../models/Chapter.js";
import ProverbModel from "../models/Proverb.js";
import UserModel from "../models/User.js";

/** Post-migration verification. Read-only against both databases. */

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail === undefined ? "" : ` -> ${JSON.stringify(detail)}`}`);
  if (!ok) failures += 1;
}

async function pgCount(table: string): Promise<number> {
  const res: any = await db.execute(sql`select count(*)::int as n from ${sql.identifier(table)}`);
  const rows = res.rows ?? res;
  return Number(rows[0]?.n ?? 0);
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  console.log("connected\n=== row count parity ===");

  const pairs: Array<[string, mongoose.Model<any>]> = [
    ["lessons", LessonModel], ["sentences", SentenceModel], ["expressions", ExpressionModel],
    ["words", WordModel], ["units", UnitModel], ["chapters", ChapterModel],
    ["proverbs", ProverbModel], ["exercise_questions", ExerciseQuestionModel], ["users", UserModel]
  ];
  for (const [table, model] of pairs) {
    const [mongoN, pgN] = await Promise.all([model.countDocuments({}), pgCount(table)]);
    check(`${table}: mongo ${mongoN} == postgres ${pgN}`, mongoN === pgN);
  }

  console.log("\n=== embedded array -> child table parity ===");
  const lessons = await LessonModel.find({}).select("stages").lean();
  const stageTotal = (lessons as any[]).reduce((s, l) => s + (l.stages?.length ?? 0), 0);
  const blockTotal = (lessons as any[]).reduce(
    (s, l) => s + (l.stages ?? []).reduce((b: number, st: any) => b + (st.blocks?.length ?? 0), 0), 0);
  check(`lesson stages: mongo ${stageTotal} == pg ${await pgCount("lesson_stages")}`, stageTotal === await pgCount("lesson_stages"));
  check(`lesson blocks: mongo ${blockTotal} == pg ${await pgCount("lesson_blocks")}`, blockTotal === await pgCount("lesson_blocks"));

  const sents = await SentenceModel.find({}).select("components").lean();
  const sentComp = (sents as any[]).reduce((s, d) => s + (d.components?.length ?? 0), 0);
  check(`sentence components: mongo ${sentComp} == pg ${await pgCount("sentence_components")}`,
    sentComp === await pgCount("sentence_components"));

  const exprs = await ExpressionModel.find({}).select("components").lean();
  const exprComp = (exprs as any[]).reduce((s, d) => s + (d.components?.length ?? 0), 0);
  check(`expression components: mongo ${exprComp} == pg ${await pgCount("expression_components")}`,
    exprComp === await pgCount("expression_components"));

  console.log("\n=== referential integrity (orphan refs in Postgres) ===");
  const orphanChecks: Array<[string, any]> = [
    ["lesson_stages -> lessons", sql`select count(*)::int as n from lesson_stages s left join lessons l on l.id = s.lesson_id where l.id is null`],
    ["lesson_blocks -> lesson_stages", sql`select count(*)::int as n from lesson_blocks b left join lesson_stages s on s.id = b.stage_id where s.id is null`],
    ["sentence_components -> sentences", sql`select count(*)::int as n from sentence_components c left join sentences s on s.id = c.sentence_id where s.id is null`],
    ["expression_components -> expressions", sql`select count(*)::int as n from expression_components c left join expressions e on e.id = c.expression_id where e.id is null`],
    ["lessons -> units", sql`select count(*)::int as n from lessons l left join units u on u.id = l.unit_id where u.id is null`],
    ["exercise_questions -> lessons", sql`select count(*)::int as n from exercise_questions q left join lessons l on l.id = q.lesson_id where l.id is null`],
    ["lesson_content_items -> lessons", sql`select count(*)::int as n from lesson_content_items i left join lessons l on l.id = i.lesson_id where l.id is null`]
  ];
  for (const [label, q] of orphanChecks) {
    const res: any = await db.execute(q);
    const n = Number((res.rows ?? res)[0]?.n ?? 0);
    check(`${label}: ${n} orphans`, n === 0, n);
  }

  console.log("\n=== content-block refs resolve to real content ===");
  const refRes: any = await db.execute(sql`
    select count(*)::int as n from lesson_blocks b
    where b.type = 'content' and b.ref_id is not null
      and not exists (select 1 from words w where w.id = b.ref_id)
      and not exists (select 1 from expressions e where e.id = b.ref_id)
      and not exists (select 1 from sentences s where s.id = b.ref_id)`);
  const danglingRefs = Number((refRes.rows ?? refRes)[0]?.n ?? 0);
  check(`content blocks with unresolvable refId: ${danglingRefs}`, danglingRefs === 0, danglingRefs);

  console.log("\n=== deep entity parity (Mongo repo vs Drizzle repo) ===");
  const mLesson = new MongooseLessonRepository();
  const dLesson = new DrizzleLessonRepository();
  const sampleLessons = await LessonModel.find({ isDeleted: { $ne: true } }).select("_id").limit(25).lean();

  let lessonMismatch = 0;
  for (const row of sampleLessons as any[]) {
    const lid = String(row._id);
    const [a, b] = await Promise.all([mLesson.findById(lid), dLesson.findById(lid)]);
    if (!a || !b) { lessonMismatch += 1; continue; }
    const norm = (l: any) => JSON.stringify({
      title: l.title, unitId: l.unitId, language: l.language, level: l.level, kind: l.kind,
      orderIndex: l.orderIndex, status: l.status, topics: l.topics, proverbs: l.proverbs,
      stages: l.stages.map((s: any) => ({
        id: s.id, title: s.title, description: s.description, orderIndex: s.orderIndex, blocks: s.blocks
      }))
    });
    if (norm(a) !== norm(b)) {
      lessonMismatch += 1;
      if (lessonMismatch === 1) console.log("   first mismatch lesson id:", lid);
    }
  }
  check(`${sampleLessons.length} ACTIVE lessons byte-identical across drivers (incl. stages+blocks): ${sampleLessons.length - lessonMismatch}/${sampleLessons.length}`, lessonMismatch === 0);

  const mSent = new MongooseSentenceRepository();
  const dSent = new DrizzleSentenceRepository();
  const sampleSents = await SentenceModel.find({ isDeleted: { $ne: true } }).select("_id").limit(25).lean();
  let sentMismatch = 0;
  for (const row of sampleSents as any[]) {
    const sid = String(row._id);
    const [a, b] = await Promise.all([mSent.findById(sid), dSent.findById(sid)]);
    if (!a || !b) { sentMismatch += 1; continue; }
    const norm = (s: any) => JSON.stringify({
      text: s.text, textNormalized: s.textNormalized, translations: s.translations,
      literalTranslation: s.literalTranslation, usageNotes: s.usageNotes,
      components: s.components, meaningSegments: s.meaningSegments, status: s.status
    });
    if (norm(a) !== norm(b)) { sentMismatch += 1; if (sentMismatch === 1) console.log("   first mismatch sentence id:", sid); }
  }
  check(`${sampleSents.length} ACTIVE sentences byte-identical across drivers (incl. components): ${sampleSents.length - sentMismatch}/${sampleSents.length}`, sentMismatch === 0);

  const mQ = new MongooseQuestionRepository();
  const dQ = new DrizzleQuestionRepository();
  const sampleQs = await ExerciseQuestionModel.find({ isDeleted: { $ne: true } }).select("_id").limit(25).lean();
  let qMismatch = 0;
  for (const row of sampleQs as any[]) {
    const qid = String(row._id);
    const [a, b] = await Promise.all([mQ.findById(qid), dQ.findById(qid)]);
    if (!a || !b) { qMismatch += 1; continue; }
    const norm = (q: any) => JSON.stringify({
      lessonId: q.lessonId, type: q.type, subtype: q.subtype, promptTemplate: q.promptTemplate,
      options: q.options, correctIndex: q.correctIndex, sourceType: q.sourceType, sourceId: q.sourceId,
      relatedSourceRefs: q.relatedSourceRefs, status: q.status
    });
    if (norm(a) !== norm(b)) { qMismatch += 1; if (qMismatch === 1) console.log("   first mismatch question id:", qid); }
  }
  check(`${sampleQs.length} ACTIVE questions byte-identical across drivers: ${sampleQs.length - qMismatch}/${sampleQs.length}`, qMismatch === 0);

  console.log("\n============================================");
  console.log(failures === 0 ? "VERIFICATION PASSED" : `VERIFICATION FAILED (${failures} check(s))`);
  console.log("============================================");
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((e) => { console.error("VERIFY ERROR", e); process.exitCode = 1; })
  .finally(async () => { await mongoose.disconnect(); await pool.end(); });
