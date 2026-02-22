import OpenAI from "openai";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
const OPENAI_TTS_VOICE = process.env.OPENAI_TTS_VOICE || "alloy";
type TtsFormat = "mp3" | "wav" | "opus" | "aac" | "flac" | "pcm";
const OPENAI_TTS_FORMAT = process.env.OPENAI_TTS_FORMAT || "mp3";

function normalizeFormat(format?: string): TtsFormat {
  const value = format || OPENAI_TTS_FORMAT;
  if (value === "mp3" || value === "wav" || value === "opus" || value === "aac" || value === "flac" || value === "pcm") {
    return value;
  }
  return "mp3";
}

let client: OpenAI | null = null;

function getClient() {
  if (!client) {
    if (!OPENAI_API_KEY) {
      console.error("Missing OPENAI_API_KEY");
      throw new Error("Missing OPENAI_API_KEY");
    }
    client = new OpenAI({ apiKey: OPENAI_API_KEY });
  }
  return client;
}

export async function synthesizeSpeech(input: {
  text: string;
  voice?: string;
  model?: string;
  format?: TtsFormat;
}) {
  const openai = getClient();
  const responseFormat = normalizeFormat(input.format);
  const response = await openai.audio.speech.create({
    model: input.model ?? OPENAI_TTS_MODEL,
    voice: input.voice ?? OPENAI_TTS_VOICE,
    input: input.text,
    response_format: responseFormat
  });

  const arrayBuffer = await response.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    model: input.model ?? OPENAI_TTS_MODEL,
    voice: input.voice ?? OPENAI_TTS_VOICE,
    format: responseFormat
  };
}
