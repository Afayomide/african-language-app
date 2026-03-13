import dotenv from "dotenv";
import mongoose from "mongoose";
import PhraseModel from "../models/Phrase.js";
import ExerciseQuestionModel from "../models/ExerciseQuestion.js";
import LessonModel from "../models/Lesson.js";
import VoiceAudioSubmissionModel from "../models/voice/VoiceAudioSubmission.js";

dotenv.config();

type PhraseRow = {
  _id: mongoose.Types.ObjectId;
  language: "yoruba" | "igbo" | "hausa";
  text: string;
  textNormalized?: string;
  lessonIds?: Array<mongoose.Types.ObjectId>;
  translations?: string[];
  pronunciation?: string;
  explanation?: string;
  examples?: Array<{ original?: string; translation?: string }>;
  difficulty?: number;
  aiMeta?: { generatedByAI?: boolean; model?: string; reviewedByAdmin?: boolean };
  audio?: {
    provider?: string;
    model?: string;
    voice?: string;
    locale?: string;
    format?: string;
    url?: string;
    s3Key?: string;
  };
  status?: "draft" | "finished" | "published";
  isDeleted?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
};

type LessonRow = {
  _id: mongoose.Types.ObjectId;
  stages?: Array<{
    blocks?: Array<{
      type?: string;
      refId?: mongoose.Types.ObjectId;
      translationIndex?: number;
      [key: string]: unknown;
    }>;
  }>;
};

function normalizeText(value: string) {
  return String(value || "").trim().toLowerCase();
}

function normalizeLooseText(value: string) {
  return normalizeText(value)
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((item) => String(item || "").trim()).filter(Boolean)));
}

function hasAudio(audio: PhraseRow["audio"]) {
  return Boolean(audio?.url && String(audio.url).trim());
}

function statusRank(status: PhraseRow["status"]) {
  if (status === "published") return 3;
  if (status === "finished") return 2;
  return 1;
}

function chooseWinner(rows: PhraseRow[]) {
  const sorted = [...rows].sort((a, b) => {
    const statusDiff = statusRank(b.status) - statusRank(a.status);
    if (statusDiff !== 0) return statusDiff;

    const audioDiff = Number(hasAudio(b.audio)) - Number(hasAudio(a.audio));
    if (audioDiff !== 0) return audioDiff;

    const transDiff = (b.translations?.length || 0) - (a.translations?.length || 0);
    if (transDiff !== 0) return transDiff;

    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : Number.MAX_SAFE_INTEGER;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  });
  return sorted[0];
}

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is required");

  const isApply = process.argv.includes("--apply");
  const useLooseKey = process.argv.includes("--loose");

  await mongoose.connect(mongoUri);

  const phraseCollection = mongoose.connection.collection<PhraseRow>(PhraseModel.collection.collectionName);
  const questionCollection = mongoose.connection.collection(ExerciseQuestionModel.collection.collectionName);
  const lessonCollection = mongoose.connection.collection<LessonRow>(LessonModel.collection.collectionName);
  const submissionCollection = mongoose.connection.collection(VoiceAudioSubmissionModel.collection.collectionName);

  const active = await phraseCollection
    .find({ isDeleted: { $ne: true } })
    .project<PhraseRow>({
      _id: 1,
      language: 1,
      text: 1,
      textNormalized: 1,
      lessonIds: 1,
      translations: 1,
      pronunciation: 1,
      explanation: 1,
      examples: 1,
      difficulty: 1,
      aiMeta: 1,
      audio: 1,
      status: 1,
      isDeleted: 1,
      createdAt: 1,
      updatedAt: 1
    })
    .toArray();

  const groups = new Map<string, PhraseRow[]>();
  for (const phrase of active) {
    const baseText = useLooseKey
      ? normalizeLooseText(phrase.text)
      : normalizeText(phrase.textNormalized || phrase.text);
    const key = `${phrase.language}::${baseText}`;
    const bucket = groups.get(key) || [];
    bucket.push(phrase);
    groups.set(key, bucket);
  }

  const duplicateGroups = [...groups.values()].filter((items) => items.length > 1);

  let mergedGroups = 0;
  let deletedPhrases = 0;
  let updatedQuestions = 0;
  let updatedLessonBlocks = 0;
  let updatedSubmissions = 0;

  for (const group of duplicateGroups) {
    const winner = chooseWinner(group);
    const losers = group.filter((item) => item._id.toString() !== winner._id.toString());
    if (losers.length === 0) continue;

    const mergedLessonIds = Array.from(
      new Set(
        group
          .flatMap((item) => (Array.isArray(item.lessonIds) ? item.lessonIds : []))
          .map((id) => id.toString())
      )
    ).map((id) => new mongoose.Types.ObjectId(id));

    const mergedTranslations = uniqueStrings(
      group.flatMap((item) => (Array.isArray(item.translations) ? item.translations : []))
    );

    const mergedExamples = group
      .flatMap((item) => (Array.isArray(item.examples) ? item.examples : []))
      .map((example) => ({
        original: String(example.original || "").trim(),
        translation: String(example.translation || "").trim()
      }))
      .filter((example) => example.original || example.translation);

    const exampleKeys = new Set<string>();
    const uniqueExamples = mergedExamples.filter((item) => {
      const key = `${item.original.toLowerCase()}::${item.translation.toLowerCase()}`;
      if (exampleKeys.has(key)) return false;
      exampleKeys.add(key);
      return true;
    });

    const winnerPronunciation = String(winner.pronunciation || "").trim();
    const winnerExplanation = String(winner.explanation || "").trim();
    const winnerAudio = hasAudio(winner.audio) ? winner.audio : group.find((item) => hasAudio(item.audio))?.audio;

    const mergedStatus = group.reduce<PhraseRow["status"]>((acc, item) => {
      return statusRank(item.status) > statusRank(acc) ? item.status : acc;
    }, winner.status || "draft");

    const mergedDifficulty =
      group
        .map((item) => Number(item.difficulty || 1))
        .filter((value) => Number.isFinite(value))
        .sort((a, b) => b - a)[0] || 1;

    const loserIds = losers.map((item) => item._id);

    if (isApply) {
      await phraseCollection.updateOne(
        { _id: winner._id },
        {
          $set: {
            lessonIds: mergedLessonIds,
            translations: mergedTranslations,
            pronunciation: winnerPronunciation || "",
            explanation: winnerExplanation || "",
            examples: uniqueExamples,
            difficulty: Math.max(1, Math.min(5, mergedDifficulty)),
            status: mergedStatus || "draft",
            ...(winnerAudio ? { audio: winnerAudio } : {})
          }
        }
      );

      const qResult = await questionCollection.updateMany(
        { phraseId: { $in: loserIds } },
        { $set: { phraseId: winner._id } }
      );
      updatedQuestions += qResult.modifiedCount;

      const subResult = await submissionCollection.updateMany(
        { phraseId: { $in: loserIds } },
        { $set: { phraseId: winner._id } }
      );
      updatedSubmissions += subResult.modifiedCount;

      const lessons = await lessonCollection.find({
        "stages.blocks.type": "phrase",
        "stages.blocks.refId": { $in: loserIds }
      }).toArray();

      for (const lesson of lessons) {
        const stages = Array.isArray(lesson.stages) ? lesson.stages : [];
        let changed = false;
        const nextStages = stages.map((stage) => {
          const blocks = Array.isArray(stage.blocks) ? stage.blocks : [];
          const nextBlocks = blocks.map((block) => {
            if (block.type !== "phrase" || !block.refId) return block;
            if (!loserIds.some((id) => id.toString() === block.refId?.toString())) return block;
            changed = true;
            return { ...block, refId: winner._id };
          });
          return { ...stage, blocks: nextBlocks };
        });
        if (!changed) continue;
        await lessonCollection.updateOne({ _id: lesson._id }, { $set: { stages: nextStages } });
        updatedLessonBlocks += 1;
      }

      const now = new Date();
      const deleted = await phraseCollection.updateMany(
        { _id: { $in: loserIds }, isDeleted: { $ne: true } },
        { $set: { isDeleted: true, deletedAt: now } }
      );
      deletedPhrases += deleted.modifiedCount;
    }

    mergedGroups += 1;
  }

  console.log(
    `${isApply ? "Merge complete" : "Dry run complete"}: duplicateGroups=${duplicateGroups.length}, groupsProcessed=${mergedGroups}`
  );
  if (isApply) {
    console.log(
      `changes: softDeletedPhrases=${deletedPhrases}, updatedQuestions=${updatedQuestions}, updatedLessonDocs=${updatedLessonBlocks}, updatedVoiceSubmissions=${updatedSubmissions}`
    );
  } else {
    const sample = duplicateGroups.slice(0, 5).map((group) => ({
      language: group[0].language,
      text: group[0].text,
      count: group.length,
      ids: group.map((item) => item._id.toString())
    }));
    console.log("sample duplicate groups:", JSON.stringify(sample, null, 2));
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Failed to merge duplicate phrases", error);
  await mongoose.disconnect();
  process.exit(1);
});
