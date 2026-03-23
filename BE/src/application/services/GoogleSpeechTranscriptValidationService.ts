import { SpeechClient } from "@google-cloud/speech";
import ffmpegStatic from "ffmpeg-static";
import type { ContentType } from "../../domain/entities/Content.js";
import type { Language } from "../../domain/entities/Lesson.js";

const TARGET_SAMPLE_RATE = 16000;
const TARGET_CHANNEL_COUNT = 1;
const FFMPEG_BINARY_PATH = process.env.FFMPEG_PATH || ffmpegStatic || "ffmpeg";
const LOG_PREFIX = "[GOOGLE_STT_VALIDATE]";
const TRANSCRIPT_VALIDATION_LOGGING_ENABLED = process.env.DEBUG_TRANSCRIPT_VALIDATION !== "0";

type GoogleServiceAccountCredentials = {
  client_email?: string;
  private_key?: string;
  project_id?: string;
};

function debugLog(step: string, details?: unknown) {
  if (!TRANSCRIPT_VALIDATION_LOGGING_ENABLED) return;
  if (details === undefined) {
    console.log(LOG_PREFIX, step);
    return;
  }
  console.log(LOG_PREFIX, step, details);
}

export type TranscriptValidationMetrics = {
  transcript: string;
  alternatives: string[];
  similarity: number;
  tokenCoverage: number;
  confidence: number;
  locale: string;
};

export type TranscriptValidationResult =
  | ({ passed: true } & TranscriptValidationMetrics)
  | ({ passed: false; reason: "transcript_mismatch" } & TranscriptValidationMetrics)
  | {
      passed: false;
      reason: "transcript_service_unavailable";
      message: string;
      locale: string;
    };

function parseServiceAccountCredentials() {
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || process.env.GCP_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    debugLog("parse_credentials:no_env_json");
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as GoogleServiceAccountCredentials;
    if (parsed.private_key) {
      parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
    }
    debugLog("parse_credentials:success", {
      hasClientEmail: Boolean(parsed.client_email),
      hasPrivateKey: Boolean(parsed.private_key),
      hasProjectId: Boolean(parsed.project_id)
    });
    return parsed;
  } catch {
    debugLog("parse_credentials:invalid_json");
    return null;
  }
}

function createSpeechClient() {
  const credentials = parseServiceAccountCredentials();
  if (credentials?.client_email && credentials?.private_key) {
    debugLog("create_client:explicit_credentials", {
      projectId: process.env.GOOGLE_CLOUD_PROJECT || credentials.project_id || ""
    });
    return new SpeechClient({
      credentials: {
        client_email: credentials.client_email,
        private_key: credentials.private_key
      },
      projectId: process.env.GOOGLE_CLOUD_PROJECT || credentials.project_id
    });
  }

  debugLog("create_client:default_credentials", {
    hasProjectId: Boolean(process.env.GOOGLE_CLOUD_PROJECT)
  });
  return new SpeechClient(
    process.env.GOOGLE_CLOUD_PROJECT ? { projectId: process.env.GOOGLE_CLOUD_PROJECT } : undefined
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeText(input: string, stripDiacritics: boolean) {
  const normalized = String(input || "")
    .normalize("NFKD")
    .replace(/[’`]/g, "'")
    .replace(stripDiacritics ? /\p{M}+/gu : /$^/u, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'\s-]+/gu, " ")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized;
}

function normalizeLooseSpokenVariant(input: string) {
  return normalizeText(input, true).replace(/([aeiou])\1+/g, "$1");
}

function tokenize(input: string) {
  return normalizeText(input, true)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function levenshtein(left: string, right: string) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array<number>(right.length + 1).fill(0);

  for (let row = 1; row <= left.length; row += 1) {
    current[0] = row;
    for (let col = 1; col <= right.length; col += 1) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1;
      current[col] = Math.min(
        current[col - 1] + 1,
        previous[col] + 1,
        previous[col - 1] + cost
      );
    }

    for (let col = 0; col <= right.length; col += 1) {
      previous[col] = current[col];
    }
  }

  return previous[right.length] || 0;
}

function similarity(left: string, right: string) {
  const a = normalizeText(left, true);
  const b = normalizeText(right, true);
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const distance = levenshtein(a, b);
  return 1 - distance / Math.max(a.length, b.length, 1);
}

function looseSpokenSimilarity(left: string, right: string) {
  const a = normalizeLooseSpokenVariant(left);
  const b = normalizeLooseSpokenVariant(right);
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const distance = levenshtein(a, b);
  return 1 - distance / Math.max(a.length, b.length, 1);
}

function tokenCoverage(expected: string, transcript: string) {
  const expectedTokens = tokenize(expected);
  const transcriptTokens = tokenize(transcript);
  if (!expectedTokens.length) return 1;
  if (!transcriptTokens.length) return 0;

  const used = new Set<number>();
  let matches = 0;

  for (const token of expectedTokens) {
    let bestIndex = -1;
    let bestScore = 0;

    transcriptTokens.forEach((candidate, index) => {
      if (used.has(index)) return;
      const score = similarity(token, candidate);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });

    if (bestIndex >= 0 && bestScore >= 0.82) {
      used.add(bestIndex);
      matches += 1;
    }
  }

  return matches / expectedTokens.length;
}

function transcriptPassesValidation(input: {
  expectedText: string;
  transcript: string;
  contentType: ContentType;
}) {
  const strictExpected = normalizeText(input.expectedText, false);
  const strictTranscript = normalizeText(input.transcript, false);
  const looseExpected = normalizeText(input.expectedText, true);
  const looseTranscript = normalizeText(input.transcript, true);

  const exactLooseMatch = Boolean(looseExpected) && looseExpected === looseTranscript;
  const overallSimilarity = Math.max(
    similarity(input.expectedText, input.transcript),
    looseSpokenSimilarity(input.expectedText, input.transcript)
  );
  const coverage = tokenCoverage(input.expectedText, input.transcript);
  const transcriptTokenCount = tokenize(input.transcript).length;
  const expectedTokenCount = tokenize(input.expectedText).length;

  if (exactLooseMatch || (strictExpected && strictExpected === strictTranscript)) {
    return { passed: true, similarity: 1, tokenCoverage: 1 };
  }

  if (input.contentType === "word") {
    const passed =
      overallSimilarity >= 0.8 &&
      coverage >= 1 &&
      transcriptTokenCount <= Math.max(2, expectedTokenCount + 1);
    return { passed, similarity: overallSimilarity, tokenCoverage: coverage };
  }

  if (input.contentType === "expression") {
    const passed = overallSimilarity >= 0.84 && coverage >= 1;
    return { passed, similarity: overallSimilarity, tokenCoverage: coverage };
  }

  const passed = overallSimilarity >= 0.78 && coverage >= 0.8;
  return { passed, similarity: overallSimilarity, tokenCoverage: coverage };
}

function mapLanguageToLocale(language: Language) {
  switch (language) {
    case "yoruba":
      return "yo-NG";
    case "igbo":
      return "ig-NG";
    case "hausa":
      return "ha-NG";
    default:
      return "en-US";
  }
}

async function transcodeToLinear16(buffer: Buffer) {
  const { spawn } = await import("child_process");

  return await new Promise<Buffer>((resolve, reject) => {
    debugLog("transcode:start", {
      inputBytes: buffer.length,
      targetSampleRate: TARGET_SAMPLE_RATE,
      targetChannels: TARGET_CHANNEL_COUNT,
      ffmpegPath: FFMPEG_BINARY_PATH
    });

    const ffmpeg = spawn(
      FFMPEG_BINARY_PATH,
      [
        "-v",
        "error",
        "-i",
        "pipe:0",
        "-ac",
        String(TARGET_CHANNEL_COUNT),
        "-ar",
        String(TARGET_SAMPLE_RATE),
        "-f",
        "s16le",
        "pipe:1"
      ],
      { stdio: ["pipe", "pipe", "pipe"] }
    );

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const timeout = setTimeout(() => {
      debugLog("transcode:timeout");
      ffmpeg.kill("SIGKILL");
      reject(new Error("audio_transcode_timeout"));
    }, 15000);

    ffmpeg.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    ffmpeg.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
    ffmpeg.on("error", (error) => {
      clearTimeout(timeout);
      debugLog("transcode:spawn_error", {
        message: error instanceof Error ? error.message : String(error)
      });
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new Error(`ffmpeg_binary_not_found:${FFMPEG_BINARY_PATH}`));
        return;
      }
      reject(error);
    });
    ffmpeg.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        const details = Buffer.concat(stderrChunks).toString("utf8").trim();
        debugLog("transcode:ffmpeg_failed", { code, details });
        reject(new Error(details || "audio_transcode_failed"));
        return;
      }

      const pcm = Buffer.concat(stdoutChunks);
      if (!pcm.length) {
        debugLog("transcode:empty_output");
        reject(new Error("audio_transcode_failed"));
        return;
      }

      debugLog("transcode:success", {
        outputBytes: pcm.length
      });
      resolve(pcm);
    });

    ffmpeg.stdin.on("error", () => undefined);
    ffmpeg.stdin.end(buffer);
  });
}

export class GoogleSpeechTranscriptValidationService {
  private readonly client = createSpeechClient();

  async validate(input: {
    audioBuffer: Buffer;
    expectedText: string;
    language: Language;
    contentType: ContentType;
  }): Promise<TranscriptValidationResult> {
    const locale = mapLanguageToLocale(input.language);
    debugLog("validate:start", {
      language: input.language,
      locale,
      contentType: input.contentType,
      expectedText: input.expectedText,
      audioBytes: input.audioBuffer.length
    });

    try {
      const linear16 = await transcodeToLinear16(input.audioBuffer);
      debugLog("stt:recognize_request", {
        locale,
        expectedText: input.expectedText,
        maxAlternatives: 5,
        boost: 20,
        linear16Bytes: linear16.length
      });
      const [response] = await this.client.recognize({
        audio: {
          content: linear16.toString("base64")
        },
        config: {
          encoding: "LINEAR16",
          sampleRateHertz: TARGET_SAMPLE_RATE,
          languageCode: locale,
          maxAlternatives: 5,
          enableAutomaticPunctuation: false,
          speechContexts: [
            {
              phrases: [input.expectedText],
              boost: 20
            }
          ]
        }
      });

      const alternatives = (response.results || [])
        .flatMap((result) => result.alternatives || [])
        .map((alternative) => ({
          transcript: String(alternative.transcript || "").trim(),
          confidence: typeof alternative.confidence === "number" ? alternative.confidence : 0
        }))
        .filter((item) => item.transcript.length > 0);

      debugLog("stt:recognize_response", {
        resultCount: response.results?.length || 0,
        alternativeCount: alternatives.length,
        alternatives
      });

      if (!alternatives.length) {
        debugLog("validate:no_alternatives");
        return {
          passed: false,
          reason: "transcript_mismatch",
          transcript: "",
          alternatives: [],
          similarity: 0,
          tokenCoverage: 0,
          confidence: 0,
          locale
        };
      }

      const ranked = alternatives
        .map((candidate) => {
          const validation = transcriptPassesValidation({
            expectedText: input.expectedText,
            transcript: candidate.transcript,
            contentType: input.contentType
          });

          return {
            transcript: candidate.transcript,
            confidence: clamp(candidate.confidence || 0, 0, 1),
            ...validation
          };
        })
        .sort((left, right) => {
          const leftScore = left.similarity * 0.7 + left.tokenCoverage * 0.25 + left.confidence * 0.05;
          const rightScore = right.similarity * 0.7 + right.tokenCoverage * 0.25 + right.confidence * 0.05;
          return rightScore - leftScore;
        });

      debugLog("validate:ranked_alternatives", ranked);

      const best = ranked[0]!;
      debugLog("validate:best_alternative", best);

      if (!best.passed) {
        debugLog("validate:transcript_mismatch", {
          transcript: best.transcript,
          similarity: best.similarity,
          tokenCoverage: best.tokenCoverage,
          confidence: best.confidence
        });
        return {
          passed: false,
          reason: "transcript_mismatch",
          transcript: best.transcript,
          alternatives: alternatives.map((item) => item.transcript),
          similarity: Number(best.similarity.toFixed(3)),
          tokenCoverage: Number(best.tokenCoverage.toFixed(3)),
          confidence: Number(best.confidence.toFixed(3)),
          locale
        };
      }

      debugLog("validate:passed", {
        transcript: best.transcript,
        similarity: best.similarity,
        tokenCoverage: best.tokenCoverage,
        confidence: best.confidence
      });
      return {
        passed: true,
        transcript: best.transcript,
        alternatives: alternatives.map((item) => item.transcript),
        similarity: Number(best.similarity.toFixed(3)),
        tokenCoverage: Number(best.tokenCoverage.toFixed(3)),
        confidence: Number(best.confidence.toFixed(3)),
        locale
      };
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : "transcript_validation_failed";
      debugLog("validate:service_unavailable", {
        message,
        locale
      });
      return {
        passed: false,
        reason: "transcript_service_unavailable",
        message,
        locale
      };
    }
  }
}
