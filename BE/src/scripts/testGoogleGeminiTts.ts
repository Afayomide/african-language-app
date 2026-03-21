import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";

type SupportedLanguage = "yoruba" | "igbo" | "hausa" | "pidgin" | "english";

type CliOptions = {
  text?: string;
  textFile?: string;
  language: SupportedLanguage;
  voice: string;
  model: string;
  out: string;
  style?: string;
  sampleRate: number;
};

const DEFAULT_MODEL = process.env.GOOGLE_TTS_MODEL || "gemini-2.5-flash-preview-tts";
const DEFAULT_VOICE = process.env.GOOGLE_TTS_VOICE || "Kore";
const DEFAULT_SAMPLE_RATE = Number(process.env.GOOGLE_TTS_SAMPLE_RATE || 24000);

const SAMPLE_TEXT_BY_LANGUAGE: Record<SupportedLanguage, string> = {
  yoruba: "E kaaro. Bawo ni? Inu mi dun lati pade yin.",
  igbo: "Ụtụtụ ọma. Kedu ka ị mere? Obi dị m ụtọ izute gị.",
  hausa: "Ina kwana. Yaya kake? Na ji daɗin haɗuwa da kai.",
  pidgin: "How far? I dey happy to meet you today.",
  english: "Good morning. How are you? It is nice to meet you."
};

function printUsage() {
  console.log(
    [
      "Usage:",
      "  pnpm --dir BE exec tsx src/scripts/testGoogleGeminiTts.ts [options]",
      "",
      "Options:",
      "  --text \"...\"            Text to synthesize",
      "  --text-file path        Read text from file",
      "  --language yoruba      yoruba | igbo | hausa | pidgin | english",
      "  --voice Kore           Gemini prebuilt voice name",
      "  --model MODEL_ID       Default: gemini-2.5-flash-preview-tts",
      "  --style \"...\"          Optional style instruction",
      "  --out path.wav         Output wav path",
      "  --sample-rate 24000    PCM sample rate for wav header",
      "",
      "Env:",
      "  GEMINI_API_KEY         Required",
      "  GOOGLE_TTS_MODEL       Optional default model",
      "  GOOGLE_TTS_VOICE       Optional default voice"
    ].join("\n")
  );
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    language: "yoruba",
    voice: DEFAULT_VOICE,
    model: DEFAULT_MODEL,
    out: path.resolve(process.cwd(), "tmp/google-gemini-tts-test.wav"),
    sampleRate: Number.isFinite(DEFAULT_SAMPLE_RATE) && DEFAULT_SAMPLE_RATE > 0 ? DEFAULT_SAMPLE_RATE : 24000
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--") {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }

    if (arg === "--text" && next) {
      options.text = next;
      index += 1;
      continue;
    }

    if (arg === "--text-file" && next) {
      options.textFile = next;
      index += 1;
      continue;
    }

    if (arg === "--language" && next) {
      if (next === "yoruba" || next === "igbo" || next === "hausa" || next === "pidgin" || next === "english") {
        options.language = next;
      } else {
        throw new Error(`Unsupported language: ${next}`);
      }
      index += 1;
      continue;
    }

    if (arg === "--voice" && next) {
      options.voice = next;
      index += 1;
      continue;
    }

    if (arg === "--model" && next) {
      options.model = next;
      index += 1;
      continue;
    }

    if (arg === "--style" && next) {
      options.style = next;
      index += 1;
      continue;
    }

    if (arg === "--out" && next) {
      options.out = path.resolve(process.cwd(), next);
      index += 1;
      continue;
    }

    if (arg === "--sample-rate" && next) {
      const parsed = Number(next);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`Invalid sample rate: ${next}`);
      }
      options.sampleRate = parsed;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

async function resolveText(options: CliOptions) {
  if (options.text && options.text.trim()) return options.text.trim();
  if (options.textFile) {
    const fromFile = await fs.readFile(path.resolve(process.cwd(), options.textFile), "utf8");
    if (fromFile.trim()) return fromFile.trim();
  }
  return SAMPLE_TEXT_BY_LANGUAGE[options.language];
}

function buildPrompt(input: { language: SupportedLanguage; text: string; style?: string }) {
  const style = input.style?.trim();
  return [
    `Read the following ${input.language} text exactly as written.`,
    style ? `Style instruction: ${style}` : "",
    "Do not translate it. Do not explain it.",
    "",
    "Text:",
    input.text
  ]
    .filter(Boolean)
    .join("\n");
}

function writeWavHeader(input: { pcmSize: number; sampleRate: number; channels?: number; bitsPerSample?: number }) {
  const channels = input.channels ?? 1;
  const bitsPerSample = input.bitsPerSample ?? 16;
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = input.sampleRate * blockAlign;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + input.pcmSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(input.sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(input.pcmSize, 40);

  return header;
}

function analyzePcm16Mono(buffer: Buffer) {
  const sampleCount = Math.floor(buffer.length / 2);
  let peak = 0;
  let sumSquares = 0;

  for (let offset = 0; offset + 1 < buffer.length; offset += 2) {
    const sample = buffer.readInt16LE(offset);
    const abs = Math.abs(sample);
    if (abs > peak) peak = abs;
    sumSquares += sample * sample;
  }

  return {
    sampleCount,
    peak,
    rms: sampleCount > 0 ? Math.sqrt(sumSquares / sampleCount) : 0
  };
}

function parseSampleRate(mimeType?: string, fallback = 24000) {
  const match = typeof mimeType === "string" ? mimeType.match(/rate=(\d+)/i) : null;
  if (!match) return fallback;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const apiKey = process.env.GEMINI_API_KEY || "";

  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  const text = await resolveText(options);
  const prompt = buildPrompt({
    language: options.language,
    text,
    style: options.style
  });

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(options.model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: options.model,
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: options.voice
              }
            }
          }
        }
      })
    }
  );

  const body = (await response.json().catch(() => null)) as
    | {
        candidates?: Array<{
          content?: {
            parts?: Array<{
              inlineData?: {
                mimeType?: string;
                data?: string;
              };
            }>;
          };
        }>;
        error?: { message?: string };
      }
    | null;

  if (!response.ok) {
    throw new Error(`Google Gemini TTS failed (${response.status}): ${body?.error?.message || JSON.stringify(body)}`);
  }

  const inlineData = body?.candidates?.[0]?.content?.parts?.find((part) => part.inlineData)?.inlineData;
  const base64Audio = inlineData?.data;
  if (!base64Audio) {
    throw new Error(`No audio returned by Google Gemini TTS: ${JSON.stringify(body, null, 2)}`);
  }

  const pcmBuffer = Buffer.from(base64Audio, "base64");
  const sampleRate = parseSampleRate(inlineData?.mimeType, options.sampleRate);
  const analysis = analyzePcm16Mono(pcmBuffer);
  const wavHeader = writeWavHeader({ pcmSize: pcmBuffer.length, sampleRate });
  const wavBuffer = Buffer.concat([wavHeader, pcmBuffer]);

  const outPath = options.out.endsWith(".wav") ? options.out : `${options.out}.wav`;
  const pcmPath = outPath.replace(/\.wav$/i, ".pcm");
  const metaPath = outPath.replace(/\.wav$/i, ".json");

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, wavBuffer);
  await fs.writeFile(pcmPath, pcmBuffer);
  await fs.writeFile(
    metaPath,
    JSON.stringify(
      {
        model: options.model,
        voice: options.voice,
        language: options.language,
        sampleRate,
        mimeType: inlineData?.mimeType || "",
        analysis,
        text,
        prompt
      },
      null,
      2
    )
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        out: outPath,
        pcm: pcmPath,
        meta: metaPath,
        model: options.model,
        voice: options.voice,
        language: options.language,
        sampleRate,
        bytes: pcmBuffer.length,
        mimeType: inlineData?.mimeType || "",
        analysis
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
