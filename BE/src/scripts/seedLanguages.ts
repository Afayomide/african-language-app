import "dotenv/config";
import mongoose from "mongoose";
import LanguageModel from "../models/Language.js";

const DEFAULT_LANGUAGES = [
  {
    code: "yoruba",
    name: "Yoruba",
    nativeName: "Yoruba",
    status: "active",
    orderIndex: 1,
    locale: "yo-NG",
    region: "Nigeria",
    branding: {
      heroGreeting: "Ẹ káàárọ̀",
      heroSubtitle: "Build confidence in everyday Yoruba.",
      proverbLabel: "Proverb",
      primaryColor: "#a94600",
      secondaryColor: "#865d00",
      accentColor: "#416f39",
      iconName: "auto_stories"
    },
    speechConfig: {
      ttsLocale: "yo-NG",
      sttLocale: "yo-NG",
      ttsVoiceId: ""
    },
    learningConfig: {
      scriptDirection: "ltr",
      usesToneMarks: true,
      usesDiacritics: true
    }
  },
  {
    code: "igbo",
    name: "Igbo",
    nativeName: "Igbo",
    status: "active",
    orderIndex: 2,
    locale: "ig-NG",
    region: "Nigeria",
    branding: {
      heroGreeting: "Ndewo",
      heroSubtitle: "Practice clear, natural Igbo step by step.",
      proverbLabel: "Proverb",
      primaryColor: "#8f3b00",
      secondaryColor: "#6e4b00",
      accentColor: "#3f6c3d",
      iconName: "auto_stories"
    },
    speechConfig: {
      ttsLocale: "ig-NG",
      sttLocale: "ig-NG",
      ttsVoiceId: ""
    },
    learningConfig: {
      scriptDirection: "ltr",
      usesToneMarks: false,
      usesDiacritics: true
    }
  },
  {
    code: "hausa",
    name: "Hausa",
    nativeName: "Hausa",
    status: "active",
    orderIndex: 3,
    locale: "ha-NG",
    region: "Nigeria",
    branding: {
      heroGreeting: "Sannu",
      heroSubtitle: "Learn practical Hausa through short guided lessons.",
      proverbLabel: "Proverb",
      primaryColor: "#9a4a00",
      secondaryColor: "#7b5c00",
      accentColor: "#3a6a44",
      iconName: "auto_stories"
    },
    speechConfig: {
      ttsLocale: "ha-NG",
      sttLocale: "ha-NG",
      ttsVoiceId: ""
    },
    learningConfig: {
      scriptDirection: "ltr",
      usesToneMarks: false,
      usesDiacritics: false
    }
  }
] as const;

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is required");
  }

  await mongoose.connect(uri);

  for (const language of DEFAULT_LANGUAGES) {
    await LanguageModel.findOneAndUpdate(
      { code: language.code },
      { $set: language },
      { upsert: true, new: true }
    );
  }

  const languages = await LanguageModel.find({}).sort({ orderIndex: 1, createdAt: 1 }).lean();
  console.log(
    "[SEED_LANGUAGES] complete",
    languages.map((item) => ({
      id: String(item._id),
      code: item.code,
      status: item.status
    }))
  );

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error("[SEED_LANGUAGES] failed", error);
  process.exit(1);
});
