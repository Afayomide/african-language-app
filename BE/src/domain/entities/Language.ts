import type { Language as LanguageCode } from "./Lesson.js";

export const LANGUAGE_STATUS_VALUES = ["active", "hidden", "archived"] as const;
export const SCRIPT_DIRECTION_VALUES = ["ltr", "rtl"] as const;

export type LanguageStatus = (typeof LANGUAGE_STATUS_VALUES)[number];
export type ScriptDirection = (typeof SCRIPT_DIRECTION_VALUES)[number];

export type LanguageEntity = {
  id: string;
  _id?: string;
  code: LanguageCode;
  name: string;
  nativeName: string;
  status: LanguageStatus;
  orderIndex: number;
  locale: string;
  region: string;
  branding: {
    heroGreeting: string;
    heroSubtitle: string;
    proverbLabel: string;
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    iconName: string;
  };
  speechConfig: {
    ttsLocale: string;
    sttLocale: string;
    ttsVoiceId: string;
  };
  learningConfig: {
    scriptDirection: ScriptDirection;
    usesToneMarks: boolean;
    usesDiacritics: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
};
