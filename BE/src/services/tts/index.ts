import crypto from "crypto";
import { synthesizeSpeech } from "./elevenLabsTts.js";
import { uploadAudio } from "../storage/s3.js";

const LANGUAGE_LOCALES: Record<string, string> = {
  yoruba: "yo-NG",
  igbo: "ig-NG",
  hausa: "ha-NG"
};

const LANGUAGE_VOICES: Record<string, string> = {
  yoruba: process.env.ELEVENLABS_VOICE_ID_YORUBA || "",
  igbo: process.env.ELEVENLABS_VOICE_ID_IGBO || "",
  hausa: process.env.ELEVENLABS_VOICE_ID_HAUSA || ""
};

const DEFAULT_VOICE = process.env.ELEVENLABS_VOICE_ID_DEFAULT || "";

function resolveVoiceId(language: string) {
  return LANGUAGE_VOICES[language] || DEFAULT_VOICE;
}

export type PhraseAudioMeta = {
  provider: "elevenlabs";
  model: string;
  voice: string;
  locale: string;
  format: string;
  url: string;
  s3Key: string;
};

export async function generatePhraseAudio(input: {
  text: string;
  language: "yoruba" | "igbo" | "hausa";
  lessonId: string;
}) {
  const locale = LANGUAGE_LOCALES[input.language] || "";
  const voiceId = resolveVoiceId(input.language);

  if (!voiceId) {
    throw new Error(`Missing ElevenLabs voice id for language: ${input.language}`);
  }

  const { buffer, model, voice, format } = await synthesizeSpeech({
    text: input.text,
    voiceId
  });

  const key = `phrases/${input.lessonId}/${crypto.randomUUID()}.${format}`;
  const contentType = format === "mp3" ? "audio/mpeg" : `audio/${format}`;

  const url = await uploadAudio(buffer, key, contentType);

  const audio: PhraseAudioMeta = {
    provider: "elevenlabs",
    model,
    voice,
    locale,
    format,
    url,
    s3Key: key
  };

  return audio;
}
