import "dotenv/config";
import mongoose from "mongoose";
import WordModel from "../models/Word.js";
import ExpressionModel from "../models/Expression.js";
import SentenceModel from "../models/Sentence.js";
import { AudioAnalysisService } from "../application/services/AudioAnalysisService.js";

const mongoUri = process.env.MONGODB_URI || "";
const analysisService = new AudioAnalysisService();

type ContentDoc = {
  _id: unknown;
  text?: string;
  audio?: {
    url?: string;
    referenceType?: string;
    reviewStatus?: string;
    analysis?: {
      pitchContour?: unknown[];
    };
  };
};

type AudioBackfillModel = {
  find: (filter: Record<string, unknown>, projection: Record<string, number>) => {
    lean: <T>() => Promise<T>;
  };
  updateOne: (filter: Record<string, unknown>, update: Record<string, unknown>) => Promise<unknown>;
};

function hasPitchAnalysis(doc: ContentDoc) {
  return Array.isArray(doc.audio?.analysis?.pitchContour) && doc.audio!.analysis!.pitchContour!.length > 0;
}

function isAcceptedHumanReference(doc: ContentDoc) {
  return doc.audio?.referenceType === "human_reference" && doc.audio?.reviewStatus === "accepted" && Boolean(doc.audio?.url);
}

async function fetchAudioBuffer(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`audio_download_failed:${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function backfillModel(
  label: "word" | "expression" | "sentence",
  model: AudioBackfillModel,
  apply: boolean
) {
  const docs = await model.find({}, { text: 1, audio: 1 }).lean<ContentDoc[]>();
  const targets = docs.filter((doc: ContentDoc) => isAcceptedHumanReference(doc) && !hasPitchAnalysis(doc));

  console.log(`${label}: found ${targets.length} accepted human-reference items missing analysis`);

  let updatedCount = 0;
  let failedCount = 0;

  for (const doc of targets) {
    const id = String(doc._id);
    const text = String(doc.text || "");
    const url = String(doc.audio?.url || "");

    try {
      const buffer = await fetchAudioBuffer(url);
      const analysis = await analysisService.analyzeBuffer(buffer);
      if (!analysis.pitchContour?.length) {
        throw new Error("pitch_analysis_empty");
      }

      if (apply) {
        await model.updateOne({ _id: doc._id }, { $set: { "audio.analysis": analysis } });
      }

      updatedCount += 1;
      console.log(`${apply ? "updated" : "would update"} ${label} ${id} :: ${text}`);
    } catch (error) {
      failedCount += 1;
      console.error(`failed ${label} ${id} :: ${text}`);
      console.error(error);
    }
  }

  return { updatedCount, failedCount, total: targets.length };
}

async function main() {
  if (!mongoUri) {
    console.error("Missing MONGODB_URI in environment variables");
    process.exit(1);
  }

  const apply = process.argv.includes("--apply");

  await mongoose.connect(mongoUri);

  try {
    const [words, expressions, sentences] = await Promise.all([
      backfillModel("word", WordModel as unknown as AudioBackfillModel, apply),
      backfillModel("expression", ExpressionModel as unknown as AudioBackfillModel, apply),
      backfillModel("sentence", SentenceModel as unknown as AudioBackfillModel, apply)
    ]);

    console.log("Summary");
    console.log({ words, expressions, sentences, mode: apply ? "apply" : "dry-run" });

    if (!apply) {
      console.log("Dry run only. Re-run with --apply to persist analysis.");
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error("Failed to backfill audio analysis:", error);
  process.exit(1);
});
