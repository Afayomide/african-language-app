import dotenv from "dotenv";
import mongoose from "mongoose";
import ExerciseQuestionModel from "../models/ExerciseQuestion.js";
import SentenceModel from "../models/Sentence.js";

dotenv.config();

type Segment = {
  text: string;
  sourceWordIndexes: number[];
  sourceComponentIndexes: number[];
};

function normalizeIndexes(values: unknown) {
  return Array.isArray(values)
    ? Array.from(
        new Set(
          values
            .map(Number)
            .filter((value) => Number.isInteger(value) && value >= 0)
        )
      )
    : [];
}

function normalizeSegments(value: unknown): Segment[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((segment) => {
      const row = segment as {
        text?: unknown;
        sourceWordIndexes?: unknown;
        sourceComponentIndexes?: unknown;
      };
      return {
        text: String(row?.text || "").trim(),
        sourceWordIndexes: normalizeIndexes(row?.sourceWordIndexes),
        sourceComponentIndexes: normalizeIndexes(row?.sourceComponentIndexes)
      };
    })
    .filter((segment) => segment.text && segment.sourceWordIndexes.length > 0);
}

async function main() {
  const mongoUri = process.env.MONGODB_URI || "";
  if (!mongoUri) throw new Error("Missing MONGODB_URI");

  const dryRun = process.argv.includes("--dry-run");
  await mongoose.connect(mongoUri);

  const questions = await ExerciseQuestionModel.find({
    sourceType: "sentence",
    sourceId: { $ne: null },
    isDeleted: { $ne: true },
    "reviewData.meaningSegments.0": { $exists: true }
  })
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();

  const candidatesBySentenceId = new Map<string, Array<{ questionId: string; segments: Segment[] }>>();
  for (const question of questions) {
    const sentenceId = String(question.sourceId || "");
    if (!sentenceId) continue;
    const segments = normalizeSegments(question.reviewData?.meaningSegments);
    if (segments.length === 0) continue;
    const current = candidatesBySentenceId.get(sentenceId) || [];
    current.push({ questionId: String(question._id), segments });
    candidatesBySentenceId.set(sentenceId, current);
  }

  let updated = 0;
  let skippedAlreadyHadSegments = 0;
  let skippedMissingSentence = 0;
  let skippedNoValidSegments = 0;

  for (const [sentenceId, candidates] of candidatesBySentenceId.entries()) {
    const sentence = await SentenceModel.findOne({ _id: sentenceId, isDeleted: { $ne: true } }).lean();
    if (!sentence) {
      skippedMissingSentence += 1;
      continue;
    }

    if (Array.isArray(sentence.meaningSegments) && sentence.meaningSegments.length > 0) {
      skippedAlreadyHadSegments += 1;
      continue;
    }

    const selected = candidates
      .slice()
      .sort((left, right) => right.segments.length - left.segments.length)[0];
    if (!selected?.segments.length) {
      skippedNoValidSegments += 1;
      continue;
    }

    if (!dryRun) {
      const result = await SentenceModel.updateOne(
        {
          _id: sentenceId,
          isDeleted: { $ne: true },
          $or: [
            { meaningSegments: { $exists: false } },
            { meaningSegments: { $size: 0 } }
          ]
        },
        { $set: { meaningSegments: selected.segments } }
      );
      if (result.modifiedCount > 0) updated += 1;
    } else {
      updated += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        questionsScanned: questions.length,
        sentenceCandidates: candidatesBySentenceId.size,
        updated,
        skippedAlreadyHadSegments,
        skippedMissingSentence,
        skippedNoValidSegments
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
