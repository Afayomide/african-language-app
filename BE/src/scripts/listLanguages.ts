import "dotenv/config";
import mongoose from "mongoose";
import LanguageModel from "../models/Language.js";

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is required");
  }

  await mongoose.connect(uri);

  const languages = await LanguageModel.find({})
    .sort({ orderIndex: 1, createdAt: 1 })
    .lean();

  console.log(
    "[LIST_LANGUAGES] complete",
    languages.map((item) => ({
      id: String(item._id),
      code: item.code,
      name: item.name,
      nativeName: item.nativeName,
      status: item.status,
      orderIndex: item.orderIndex,
      locale: item.locale || "",
      region: item.region || "",
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }))
  );

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error("[LIST_LANGUAGES] failed", error);
  process.exit(1);
});
