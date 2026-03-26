import mongoose, { Schema, type InferSchemaType } from "mongoose";
import { LANGUAGE_VALUES } from "../domain/entities/Lesson.js";

const LanguageSchema = new Schema(
  {
    code: {
      type: String,
      enum: [...LANGUAGE_VALUES],
      required: true,
      unique: true,
      index: true,
      trim: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    nativeName: {
      type: String,
      required: true,
      trim: true
    },
    status: {
      type: String,
      enum: ["active", "hidden", "archived"],
      default: "active",
      index: true
    },
    orderIndex: {
      type: Number,
      default: 0,
      index: true
    },
    locale: {
      type: String,
      default: ""
    },
    region: {
      type: String,
      default: ""
    },
    branding: {
      type: {
        heroGreeting: { type: String, default: "" },
        heroSubtitle: { type: String, default: "" },
        proverbLabel: { type: String, default: "Proverb" },
        primaryColor: { type: String, default: "" },
        secondaryColor: { type: String, default: "" },
        accentColor: { type: String, default: "" },
        iconName: { type: String, default: "" }
      },
      default: {}
    },
    speechConfig: {
      type: {
        ttsLocale: { type: String, default: "" },
        sttLocale: { type: String, default: "" },
        ttsVoiceId: { type: String, default: "" }
      },
      default: {}
    },
    learningConfig: {
      type: {
        scriptDirection: { type: String, enum: ["ltr", "rtl"], default: "ltr" },
        usesToneMarks: { type: Boolean, default: false },
        usesDiacritics: { type: Boolean, default: false }
      },
      default: {}
    }
  },
  { timestamps: true }
);

LanguageSchema.index({ status: 1, orderIndex: 1 });

export type LanguageDocument = InferSchemaType<typeof LanguageSchema> & {
  _id: mongoose.Types.ObjectId;
};

const LanguageModel = mongoose.model("Language", LanguageSchema);

export default LanguageModel;
