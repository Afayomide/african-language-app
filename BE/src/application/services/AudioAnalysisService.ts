import { spawn } from "child_process";
import ffmpegStatic from "ffmpeg-static";
import { PitchDetector } from "pitchy";
import type { AudioAnalysis, AudioSpectrogramFrame } from "../../domain/entities/Content.js";

const TARGET_SAMPLE_RATE = 16000;
const TARGET_CHANNEL_COUNT = 1;
const PITCH_FRAME_SIZE = 2048;
const PITCH_HOP_SIZE = 320;
const MAX_PITCH_POINTS = 256;
const MAX_SPECTROGRAM_FRAMES = 48;
const MAX_WAVEFORM_BUCKETS = 128;
const MIN_CLARITY = 0.78;
const SPECTROGRAM_BINS = [100, 150, 200, 300, 400, 500, 650, 800, 1000, 1200, 1500, 1800, 2200, 2600, 3200, 4000];
const FFMPEG_BINARY_PATH = process.env.FFMPEG_PATH || ffmpegStatic || "ffmpeg";

function computeWaveformPeaks(samples: Float32Array, bucketCount = MAX_WAVEFORM_BUCKETS) {
  if (samples.length === 0) return [];
  const bucketSize = Math.max(1, Math.floor(samples.length / bucketCount));
  const peaks: number[] = [];

  for (let index = 0; index < bucketCount; index += 1) {
    const start = index * bucketSize;
    const end = Math.min(samples.length, start + bucketSize);
    let peak = 0;
    for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
      peak = Math.max(peak, Math.abs(samples[sampleIndex] || 0));
    }
    peaks.push(Number(peak.toFixed(4)));
  }

  return peaks;
}

function computeSpectrogram(samples: Float32Array, sampleRate: number): AudioSpectrogramFrame[] {
  const frameSize = 1024;
  const hopSize = 1024;
  const frames: AudioSpectrogramFrame[] = [];

  for (
    let start = 0;
    start + frameSize <= samples.length && frames.length < MAX_SPECTROGRAM_FRAMES;
    start += hopSize
  ) {
    const frame = samples.slice(start, start + frameSize);
    const bins = SPECTROGRAM_BINS.map((hz) => {
      let real = 0;
      let imaginary = 0;
      for (let index = 0; index < frame.length; index += 1) {
        const angle = (2 * Math.PI * hz * index) / sampleRate;
        real += frame[index] * Math.cos(angle);
        imaginary -= frame[index] * Math.sin(angle);
      }
      const amplitude = Math.sqrt(real * real + imaginary * imaginary) / frame.length;
      return { hz, amplitude: Number(amplitude.toFixed(6)) };
    });

    frames.push({
      timeMs: Number(((start / sampleRate) * 1000).toFixed(2)),
      bins
    });
  }

  return frames;
}

function analyzeSamples(samples: Float32Array, sampleRate: number): AudioAnalysis {
  const detector = PitchDetector.forFloat32Array(PITCH_FRAME_SIZE);
  const pitchContour: NonNullable<AudioAnalysis["pitchContour"]> = [];
  let peak = 0;
  let sumSquares = 0;

  for (let index = 0; index < samples.length; index += 1) {
    const value = samples[index] || 0;
    peak = Math.max(peak, Math.abs(value));
    sumSquares += value * value;
  }

  for (
    let start = 0;
    start + PITCH_FRAME_SIZE <= samples.length && pitchContour.length < MAX_PITCH_POINTS;
    start += PITCH_HOP_SIZE
  ) {
    const frame = samples.subarray(start, start + PITCH_FRAME_SIZE);
    const [hz, clarity] = detector.findPitch(frame, sampleRate);
    if (!Number.isFinite(hz) || !Number.isFinite(clarity) || hz <= 45 || hz >= 1800 || clarity < MIN_CLARITY) {
      continue;
    }

    pitchContour.push({
      timeMs: Number(((start / sampleRate) * 1000).toFixed(2)),
      hz: Number(hz.toFixed(2)),
      midi: Number((69 + 12 * Math.log2(hz / 440)).toFixed(3)),
      confidence: Number(clarity.toFixed(4))
    });
  }

  return {
    durationMs: Number(((samples.length / sampleRate) * 1000).toFixed(2)),
    sampleRate,
    channelCount: TARGET_CHANNEL_COUNT,
    peak: Number(peak.toFixed(6)),
    rms: Number((samples.length ? Math.sqrt(sumSquares / samples.length) : 0).toFixed(6)),
    waveformPeaks: computeWaveformPeaks(samples),
    pitchContour,
    spectrogram: computeSpectrogram(samples, sampleRate)
  };
}

function bufferToFloat32Array(buffer: Buffer) {
  const slice = buffer.subarray(0, buffer.byteLength - (buffer.byteLength % 4));
  const view = new DataView(slice.buffer, slice.byteOffset, slice.byteLength);
  const result = new Float32Array(slice.byteLength / 4);
  for (let index = 0; index < result.length; index += 1) {
    result[index] = view.getFloat32(index * 4, true);
  }
  return result;
}

async function decodeToMonoFloat32Pcm(buffer: Buffer) {
  return await new Promise<Float32Array>((resolve, reject) => {
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
        "f32le",
        "pipe:1"
      ],
      { stdio: ["pipe", "pipe", "pipe"] }
    );

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const timeout = setTimeout(() => {
      ffmpeg.kill("SIGKILL");
      reject(new Error("audio_decode_timeout"));
    }, 15000);

    ffmpeg.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    ffmpeg.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
    ffmpeg.on("error", (error) => {
      clearTimeout(timeout);
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
        reject(new Error(details || "audio_decode_failed"));
        return;
      }

      const pcm = Buffer.concat(stdoutChunks);
      if (!pcm.length) {
        reject(new Error("audio_decode_failed"));
        return;
      }

      const float32 = bufferToFloat32Array(pcm);
      if (!float32.length) {
        reject(new Error("audio_decode_failed"));
        return;
      }

      resolve(float32);
    });

    ffmpeg.stdin.on("error", () => undefined);
    ffmpeg.stdin.end(buffer);
  });
}

export class AudioAnalysisService {
  async analyzeBuffer(buffer: Buffer) {
    const samples = await decodeToMonoFloat32Pcm(buffer);
    return analyzeSamples(samples, TARGET_SAMPLE_RATE);
  }
}
