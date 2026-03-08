import dotenv from "dotenv";
import mongoose from "mongoose";
import PhraseModel from "../models/Phrase.js";

dotenv.config();

type PhraseRow = {
  _id: mongoose.Types.ObjectId;
  translations?: string[];
};

function splitTranslationValue(value: string): string[] {
  return value
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function normalizeTranslations(translations: string[] | undefined): string[] {
  const source = Array.isArray(translations) ? translations : [];
  const flattened: string[] = [];

  for (const item of source) {
    const value = String(item || "").trim();
    if (!value) continue;
    const parts = splitTranslationValue(value);
    for (const part of parts) {
      if (!flattened.includes(part)) {
        flattened.push(part);
      }
    }
  }

  return flattened;
}

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is required");
  }

  const dryRun = process.argv.includes("--dry-run");

  await mongoose.connect(mongoUri);
  const collection = mongoose.connection.collection<PhraseRow>(PhraseModel.collection.collectionName);

  let scanned = 0;
  let updated = 0;
  let withSlash = 0;

  const cursor = collection.find({});
  for await (const phrase of cursor) {
    scanned += 1;
    const current = Array.isArray(phrase.translations) ? phrase.translations : [];
    const hasSlash = current.some((value) => String(value || "").includes("/"));
    if (!hasSlash) {
      continue;
    }

    withSlash += 1;
    const next = normalizeTranslations(current);
    const unchanged =
      next.length === current.length &&
      next.every((value, index) => value === current[index]);

    if (unchanged) {
      continue;
    }

    if (!dryRun) {
      await collection.updateOne(
        { _id: phrase._id },
        { $set: { translations: next } }
      );
    }
    updated += 1;
  }

  console.log(
    `${dryRun ? "Dry run complete" : "Migration complete"}: scanned=${scanned}, phrasesWithSlash=${withSlash}, updated=${updated}`
  );

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Failed to split slash translations", error);
  await mongoose.disconnect();
  process.exit(1);
});

