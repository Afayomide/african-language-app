import type { AudioAnalysis, AudioPitchPoint } from "../../domain/entities/Content.js";

export type PronunciationComparisonError = "reference_pitch_missing" | "student_pitch_missing";

export type PronunciationFeedbackLevel = "excellent" | "good" | "fair" | "poor";

export type PronunciationContourSummary = {
  durationMs: number;
  sampleCount: number;
  voicedSampleCount: number;
  pitchRangeSemitones: number;
  averageConfidence: number;
};

export type PronunciationComparisonResult = {
  score: number;
  level: PronunciationFeedbackLevel;
  dtwDistance: number;
  normalizedDistance: number;
  pathLength: number;
  durationRatio: number;
  pitchRangeRatio: number;
  reference: PronunciationContourSummary;
  student: PronunciationContourSummary;
  feedback: string[];
};

type ContourPreparation = PronunciationContourSummary & {
  normalized: number[];
};

const MIN_VOICED_POINTS = 6;
const MAX_SEQUENCE_POINTS = 160;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function safeNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function hzToMidi(hz: number) {
  return 69 + 12 * Math.log2(hz / 440);
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]) {
  if (!values.length) return 0;
  const mean = average(values);
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[midpoint - 1] + sorted[midpoint]) / 2;
  }
  return sorted[midpoint];
}

function estimateDurationMs(analysis: AudioAnalysis, contour: AudioPitchPoint[]) {
  const explicitDuration = safeNumber(analysis.durationMs);
  if (explicitDuration > 0) return explicitDuration;
  if (contour.length <= 1) return 0;
  const start = safeNumber(contour[0]?.timeMs);
  const end = safeNumber(contour[contour.length - 1]?.timeMs);
  return Math.max(0, end - start);
}

function resampleSequence(values: number[], targetLength: number) {
  if (!values.length || targetLength <= 0) return [];
  if (values.length === 1 || targetLength === 1) return [values[0] ?? 0];

  const result: number[] = [];
  const maxIndex = values.length - 1;

  for (let index = 0; index < targetLength; index += 1) {
    const position = (index * maxIndex) / (targetLength - 1);
    const left = Math.floor(position);
    const right = Math.min(maxIndex, Math.ceil(position));
    if (left === right) {
      result.push(values[left] ?? 0);
      continue;
    }

    const ratio = position - left;
    const leftValue = values[left] ?? 0;
    const rightValue = values[right] ?? leftValue;
    result.push(leftValue + (rightValue - leftValue) * ratio);
  }

  return result;
}

function smoothSequence(values: number[]) {
  if (values.length < 3) return [...values];
  return values.map((_, index) => {
    const start = Math.max(0, index - 1);
    const end = Math.min(values.length, index + 2);
    return average(values.slice(start, end));
  });
}

function prepareContour(analysis: AudioAnalysis | undefined): ContourPreparation | null {
  const contour = Array.isArray(analysis?.pitchContour) ? [...analysis.pitchContour] : [];
  if (!contour.length) return null;

  contour.sort((left, right) => safeNumber(left.timeMs) - safeNumber(right.timeMs));

  const voiced = contour.flatMap((point) => {
    const hz = safeNumber(point.hz);
    if (hz <= 45 || hz >= 1800) return [];
    const confidence = point.confidence === undefined ? 1 : clamp(safeNumber(point.confidence), 0, 1);
    if (confidence <= 0.05) return [];
    return [
      {
        midi: point.midi !== undefined && Number.isFinite(point.midi) ? safeNumber(point.midi) : hzToMidi(hz),
        confidence
      }
    ];
  });

  if (voiced.length < MIN_VOICED_POINTS) return null;

  const rawMidi = voiced.map((point) => point.midi);
  const smoothedMidi = smoothSequence(rawMidi);
  const medianMidi = median(smoothedMidi);
  const centeredMidi = smoothedMidi.map((value) => value - medianMidi);
  const scale = Math.max(0.5, standardDeviation(centeredMidi));
  const normalized = centeredMidi.map((value) => value / scale);
  const limited = normalized.length > MAX_SEQUENCE_POINTS ? resampleSequence(normalized, MAX_SEQUENCE_POINTS) : normalized;

  const durationMs = estimateDurationMs(analysis || {}, contour);
  const pitchRangeSemitones = smoothedMidi.length > 0 ? Math.max(...smoothedMidi) - Math.min(...smoothedMidi) : 0;

  return {
    normalized: limited,
    durationMs,
    sampleCount: Array.isArray(analysis?.pitchContour) ? analysis.pitchContour.length : 0,
    voicedSampleCount: voiced.length,
    pitchRangeSemitones: Number(pitchRangeSemitones.toFixed(2)),
    averageConfidence: Number(average(voiced.map((point) => point.confidence)).toFixed(3))
  };
}

function dtw(sequenceA: number[], sequenceB: number[]) {
  const rows = sequenceA.length;
  const cols = sequenceB.length;
  const band = Math.max(Math.abs(rows - cols) + 8, Math.ceil(Math.max(rows, cols) * 0.35));
  const cost = Array.from({ length: rows + 1 }, () => Array<number>(cols + 1).fill(Number.POSITIVE_INFINITY));
  const steps = Array.from({ length: rows + 1 }, () => Array<{ row: number; col: number } | null>(cols + 1).fill(null));

  cost[0][0] = 0;

  for (let row = 1; row <= rows; row += 1) {
    const colStart = Math.max(1, row - band);
    const colEnd = Math.min(cols, row + band);
    for (let col = colStart; col <= colEnd; col += 1) {
      const localDistance = Math.abs((sequenceA[row - 1] ?? 0) - (sequenceB[col - 1] ?? 0));
      const diagonal = cost[row - 1][col - 1];
      const up = cost[row - 1][col];
      const left = cost[row][col - 1];
      if (diagonal <= up && diagonal <= left) {
        cost[row][col] = localDistance + diagonal;
        steps[row][col] = { row: row - 1, col: col - 1 };
      } else if (up <= left) {
        cost[row][col] = localDistance + up;
        steps[row][col] = { row: row - 1, col };
      } else {
        cost[row][col] = localDistance + left;
        steps[row][col] = { row, col: col - 1 };
      }
    }
  }

  let pathLength = 0;
  let row = rows;
  let col = cols;
  while (row > 0 || col > 0) {
    pathLength += 1;
    const step = steps[row]?.[col] || null;
    if (!step) break;
    row = step.row;
    col = step.col;
  }

  return {
    distance: cost[rows][cols],
    pathLength: Math.max(pathLength, 1)
  };
}

function scoreFromDistance(normalizedDistance: number, durationRatio: number) {
  const baseScore = 100 / (1 + normalizedDistance);
  const durationPenalty = durationRatio > 0 ? clamp(Math.abs(1 - durationRatio) * 18, 0, 18) : 0;
  return Math.round(clamp(baseScore - durationPenalty, 0, 100));
}

function levelFromScore(score: number): PronunciationFeedbackLevel {
  if (score >= 82) return "excellent";
  if (score >= 64) return "good";
  if (score >= 42) return "fair";
  return "poor";
}

function buildFeedback(input: {
  score: number;
  durationRatio: number;
  pitchRangeRatio: number;
  normalizedDistance: number;
  student: PronunciationContourSummary;
}) {
  const feedback: string[] = [];

  if (input.student.voicedSampleCount < 10) {
    feedback.push("The recording produced very few voiced pitch samples. Retake it in a quieter room and speak more clearly.");
  }

  if (input.durationRatio > 1.45) {
    feedback.push("The learner recording is much longer than the tutor reference. Timing is likely affecting alignment.");
  } else if (input.durationRatio > 0 && input.durationRatio < 0.65) {
    feedback.push("The learner recording is much shorter than the tutor reference. Parts of the utterance may be missing.");
  }

  if (input.pitchRangeRatio > 0 && input.pitchRangeRatio < 0.55) {
    feedback.push("The learner contour is flatter than the tutor reference. The tonal movement may be under-pronounced.");
  } else if (input.pitchRangeRatio > 1.9) {
    feedback.push("The learner contour varies more sharply than the tutor reference. Some tones may be exaggerated.");
  }

  if (input.normalizedDistance <= 0.45) {
    feedback.push("The overall tone contour is close to the tutor reference.");
  } else if (input.normalizedDistance <= 0.95) {
    feedback.push("The contour is recognizable, but there are noticeable tonal differences.");
  } else {
    feedback.push("The contour differs substantially from the tutor reference. Re-listen and focus on pitch movement.");
  }

  if (input.score >= 82) {
    feedback.push("This attempt is close enough to use as positive speaking feedback.");
  }

  return feedback;
}

export class PronunciationComparisonService {
  compare(input: {
    reference: AudioAnalysis | undefined;
    student: AudioAnalysis | undefined;
  }): PronunciationComparisonResult | PronunciationComparisonError {
    const referenceContour = prepareContour(input.reference);
    if (!referenceContour) return "reference_pitch_missing";

    const studentContour = prepareContour(input.student);
    if (!studentContour) return "student_pitch_missing";

    const { distance, pathLength } = dtw(referenceContour.normalized, studentContour.normalized);
    const normalizedDistance = Number((distance / pathLength).toFixed(4));
    const durationRatio = referenceContour.durationMs > 0 ? Number((studentContour.durationMs / referenceContour.durationMs).toFixed(3)) : 0;
    const pitchRangeRatio = referenceContour.pitchRangeSemitones > 0
      ? Number((studentContour.pitchRangeSemitones / referenceContour.pitchRangeSemitones).toFixed(3))
      : 0;
    const score = scoreFromDistance(normalizedDistance, durationRatio);
    const level = levelFromScore(score);

    const referenceSummary: PronunciationContourSummary = {
      durationMs: Number(referenceContour.durationMs.toFixed(2)),
      sampleCount: referenceContour.sampleCount,
      voicedSampleCount: referenceContour.voicedSampleCount,
      pitchRangeSemitones: referenceContour.pitchRangeSemitones,
      averageConfidence: referenceContour.averageConfidence
    };
    const studentSummary: PronunciationContourSummary = {
      durationMs: Number(studentContour.durationMs.toFixed(2)),
      sampleCount: studentContour.sampleCount,
      voicedSampleCount: studentContour.voicedSampleCount,
      pitchRangeSemitones: studentContour.pitchRangeSemitones,
      averageConfidence: studentContour.averageConfidence
    };

    return {
      score,
      level,
      dtwDistance: Number(distance.toFixed(4)),
      normalizedDistance,
      pathLength,
      durationRatio,
      pitchRangeRatio,
      reference: referenceSummary,
      student: studentSummary,
      feedback: buildFeedback({
        score,
        durationRatio,
        pitchRangeRatio,
        normalizedDistance,
        student: studentSummary
      })
    };
  }
}
