'use client'

import { useCallback, useEffect, useMemo, useRef, useState, use } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { expressionService } from "@/services";
import type { Audio } from "@/types";
import { ContentType, Language, VoiceContent, VoiceQueueItem, VoiceSubmissionItem } from "@/types";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { ArrowLeft, Upload, Loader2, Mic, Square, Send, RotateCcw, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { DataTableControls } from "@/components/common/data-table-controls";
import { TABLE_ACTION_ICON_CLASS } from "@/lib/tableActionStyles";

const LANGUAGE_LABELS: Record<Language, string> = {
  yoruba: "Yoruba",
  igbo: "Igbo",
  hausa: "Hausa"
};

const CONTENT_LABELS: Record<ContentType, string> = {
  word: "Word",
  expression: "Expression",
  sentence: "Sentence"
};

function isLanguage(value: string): value is Language {
  return value === "yoruba" || value === "igbo" || value === "hausa";
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("file_read_failed"));
    reader.readAsDataURL(file);
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("audio_read_failed"));
    reader.readAsDataURL(blob);
  });
}

function pickPrimaryTranslation(content: VoiceContent | null | undefined) {
  if (!content || !Array.isArray(content.translations) || content.translations.length === 0) return "";
  return content.translations[0] || "";
}

function computeWaveformPeaks(samples: Float32Array, bucketCount = 128) {
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

function estimatePitch(frame: Float32Array, sampleRate: number) {
  let bestOffset = -1;
  let bestCorrelation = 0;
  const minHz = 70;
  const maxHz = 500;
  const minOffset = Math.max(1, Math.floor(sampleRate / maxHz));
  const maxOffset = Math.min(frame.length - 1, Math.floor(sampleRate / minHz));
  for (let offset = minOffset; offset <= maxOffset; offset += 1) {
    let correlation = 0;
    let energy = 0;
    for (let index = 0; index + offset < frame.length; index += 1) {
      const current = frame[index];
      const shifted = frame[index + offset];
      correlation += current * shifted;
      energy += current * current + shifted * shifted;
    }
    if (!energy) continue;
    const normalized = (2 * correlation) / energy;
    if (normalized > bestCorrelation) {
      bestCorrelation = normalized;
      bestOffset = offset;
    }
  }
  if (bestOffset <= 0 || bestCorrelation < 0.35) return null;
  const hz = sampleRate / bestOffset;
  return { hz, confidence: Number(bestCorrelation.toFixed(4)) };
}

function computeSpectrogram(samples: Float32Array, sampleRate: number) {
  const frameSize = 1024;
  const hopSize = 512;
  const targetHz = [100, 150, 200, 300, 400, 500, 650, 800, 1000, 1200, 1500, 1800, 2200, 2600, 3200, 4000];
  const frames: NonNullable<Audio["analysis"]>["spectrogram"] = [];
  for (let start = 0; start + frameSize <= samples.length && frames.length < 64; start += hopSize * 4) {
    const frame = samples.slice(start, start + frameSize);
    const bins = targetHz.map((hz) => {
      let real = 0;
      let imag = 0;
      for (let index = 0; index < frame.length; index += 1) {
        const angle = (2 * Math.PI * hz * index) / sampleRate;
        real += frame[index] * Math.cos(angle);
        imag -= frame[index] * Math.sin(angle);
      }
      const amplitude = Math.sqrt(real * real + imag * imag) / frame.length;
      return { hz, amplitude: Number(amplitude.toFixed(6)) };
    });
    frames.push({
      timeMs: Number(((start / sampleRate) * 1000).toFixed(2)),
      bins
    });
  }
  return frames;
}

async function analyzeAudioBlob(blob: Blob): Promise<Audio["analysis"] | undefined> {
  try {
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return undefined;

    const arrayBuffer = await blob.arrayBuffer();
    const audioContext = new AudioContextCtor();
    try {
      const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));
      const channelCount = decoded.numberOfChannels;
      const sampleRate = decoded.sampleRate;
      const frameLength = decoded.length;
      const samples = new Float32Array(frameLength);

      for (let channel = 0; channel < channelCount; channel += 1) {
        const source = decoded.getChannelData(channel);
        for (let index = 0; index < frameLength; index += 1) {
          samples[index] += (source[index] || 0) / channelCount;
        }
      }

      let peak = 0;
      let rmsAccumulator = 0;
      for (let index = 0; index < samples.length; index += 1) {
        const value = samples[index] || 0;
        peak = Math.max(peak, Math.abs(value));
        rmsAccumulator += value * value;
      }
      const rms = samples.length ? Math.sqrt(rmsAccumulator / samples.length) : 0;

      const pitchContour: NonNullable<Audio["analysis"]>["pitchContour"] = [];
      const pitchFrameSize = 2048;
      const pitchHop = 1024;
      for (let start = 0; start + pitchFrameSize <= samples.length && pitchContour.length < 128; start += pitchHop * 2) {
        const frame = samples.slice(start, start + pitchFrameSize);
        const estimate = estimatePitch(frame, sampleRate);
        if (!estimate) continue;
        pitchContour.push({
          timeMs: Number(((start / sampleRate) * 1000).toFixed(2)),
          hz: Number(estimate.hz.toFixed(2)),
          confidence: estimate.confidence
        });
      }

      return {
        durationMs: Number(((decoded.duration || 0) * 1000).toFixed(2)),
        sampleRate,
        channelCount,
        peak: Number(peak.toFixed(6)),
        rms: Number(rms.toFixed(6)),
        waveformPeaks: computeWaveformPeaks(samples),
        pitchContour,
        spectrogram: computeSpectrogram(samples, sampleRate)
      };
    } finally {
      audioContext.close().catch(() => undefined);
    }
  } catch {
    return undefined;
  }
}

export default function VoiceExpressionsPage({ params }: { params: Promise<{ language: string }> }) {
  const { language: languageParam } = use(params);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [queue, setQueue] = useState<VoiceQueueItem[]>([]);
  const [submissions, setSubmissions] = useState<VoiceSubmissionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [uploadingExpressionId, setUploadingExpressionId] = useState<string | null>(null);
  const [queueSearch, setQueueSearch] = useState("");
  const [queuePage, setQueuePage] = useState(1);
  const [queueLimit, setQueueLimit] = useState(20);
  const [queueTotal, setQueueTotal] = useState(0);
  const [queueTotalPages, setQueueTotalPages] = useState(1);
  const [submissionSearch, setSubmissionSearch] = useState("");
  const [submissionPage, setSubmissionPage] = useState(1);
  const [submissionLimit, setSubmissionLimit] = useState(20);
  const [submissionTotal, setSubmissionTotal] = useState(0);
  const [submissionTotalPages, setSubmissionTotalPages] = useState(1);
  const [chapterFilter, setChapterFilter] = useState<"all" | string>("all");
  const [unitFilter, setUnitFilter] = useState<"all" | string>("all");
  const [lessonFilter, setLessonFilter] = useState<"all" | string>("all");
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [recordingItem, setRecordingItem] = useState<{ contentType: ContentType; content: VoiceContent } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [inputLevel, setInputLevel] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const levelRafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isValidLanguageParam = isLanguage(languageParam);
  const language: Language = isValidLanguageParam ? languageParam : "yoruba";

  const playAudio = useCallback((url?: string) => {
    if (!url) return;
    const audio = new Audio(url);
    audio.play().catch((e) => {
      console.error("Audio playback failed", e);
      toast.error("Failed to play audio");
    });
  }, []);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [queueData, submissionData] = await Promise.all([
        expressionService.getQueuePage({
          q: queueSearch || undefined,
          page: queuePage,
          limit: queueLimit
        }),
        expressionService.listMySubmissionsPage({
          q: submissionSearch || undefined,
          page: submissionPage,
          limit: submissionLimit
        })
      ]);
      setQueue(queueData.items);
      setSubmissions(submissionData.items);
      setQueueTotal(queueData.total);
      setQueueTotalPages(queueData.pagination.totalPages);
      setSubmissionTotal(submissionData.total);
      setSubmissionTotalPages(submissionData.pagination.totalPages);
    } catch (error) {
      toast.error("Failed to load expressions/audio submissions")
    } finally {
      setIsLoading(false);
    }
  }, [queuePage, queueSearch, queueLimit, submissionPage, submissionSearch, submissionLimit]);

  useEffect(() => {
    if (!isValidLanguageParam) return;
    fetchData();
  }, [fetchData, isValidLanguageParam]);

  useEffect(() => {
    setQueuePage(1);
  }, [queueSearch, language, chapterFilter, unitFilter, lessonFilter]);

  useEffect(() => {
    setSubmissionPage(1);
  }, [submissionSearch, language, chapterFilter, unitFilter, lessonFilter]);

  useEffect(() => {
    const qq = searchParams.get("qq") || "";
    const qp = Number(searchParams.get("qp") || "1");
    const ql = Number(searchParams.get("ql") || "20");
    const sq = searchParams.get("sq") || "";
    const sp = Number(searchParams.get("sp") || "1");
    const sl = Number(searchParams.get("sl") || "20");
    const chapter = searchParams.get("chapterId") || "all";
    const unit = searchParams.get("unitId") || "all";
    const lesson = searchParams.get("lessonId") || "all";
    setQueueSearch(qq);
    setQueuePage(Number.isInteger(qp) && qp > 0 ? qp : 1);
    setQueueLimit([10, 20, 50].includes(ql) ? ql : 20);
    setSubmissionSearch(sq);
    setSubmissionPage(Number.isInteger(sp) && sp > 0 ? sp : 1);
    setSubmissionLimit([10, 20, 50].includes(sl) ? sl : 20);
    setChapterFilter(chapter);
    setUnitFilter(unit);
    setLessonFilter(lesson);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (queueSearch) params.set("qq", queueSearch);
    else params.delete("qq");
    params.set("qp", String(queuePage));
    params.set("ql", String(queueLimit));
    if (submissionSearch) params.set("sq", submissionSearch);
    else params.delete("sq");
    params.set("sp", String(submissionPage));
    params.set("sl", String(submissionLimit));
    if (chapterFilter !== "all") params.set("chapterId", chapterFilter);
    else params.delete("chapterId");
    if (unitFilter !== "all") params.set("unitId", unitFilter);
    else params.delete("unitId");
    if (lessonFilter !== "all") params.set("lessonId", lessonFilter);
    else params.delete("lessonId");
    const nextQuery = params.toString();
    if (nextQuery === searchParams.toString()) return;
    router.replace(`${pathname}?${nextQuery}`);
  }, [
    queueSearch,
    queuePage,
    queueLimit,
    submissionSearch,
    submissionPage,
    submissionLimit,
    chapterFilter,
    unitFilter,
    lessonFilter,
    pathname,
    router,
    searchParams
  ]);

  const curriculumOptions = useMemo(() => {
    const chapterMap = new Map<string, { id: string; label: string }>();
    const unitMap = new Map<string, { id: string; label: string }>();
    const lessonMap = new Map<string, { id: string; label: string }>();

    for (const item of queue) {
      for (const chapter of item.chapters) {
        chapterMap.set(chapter._id, { id: chapter._id, label: `${chapter.orderIndex + 1}. ${chapter.title}` });
      }
      for (const unit of item.units) {
        unitMap.set(unit._id, { id: unit._id, label: `${unit.orderIndex + 1}. ${unit.title}` });
      }
      for (const lesson of item.lessons) {
        lessonMap.set(lesson._id, { id: lesson._id, label: `${lesson.orderIndex + 1}. ${lesson.title}` });
      }
    }

    return {
      chapters: Array.from(chapterMap.values()),
      units: Array.from(unitMap.values()),
      lessons: Array.from(lessonMap.values())
    };
  }, [queue]);

  const scopedQueue = useMemo(() => {
    return queue.filter((item) => {
      if (item.content.language !== language) return false;
      if (chapterFilter !== "all" && !item.chapters.some((chapter) => chapter._id === chapterFilter)) return false;
      if (unitFilter !== "all" && !item.units.some((unit) => unit._id === unitFilter)) return false;
      if (lessonFilter !== "all" && !item.lessons.some((lesson) => lesson._id === lessonFilter)) return false;
      return true;
    });
  }, [chapterFilter, language, lessonFilter, queue, unitFilter]);

  const scopedSubmissions = useMemo(() => {
    return submissions.filter((item) => {
      if (item.content?.language !== language) return false;
      if (chapterFilter !== "all" && !item.chapters.some((chapter) => chapter._id === chapterFilter)) return false;
      if (unitFilter !== "all" && !item.units.some((unit) => unit._id === unitFilter)) return false;
      if (lessonFilter !== "all" && !item.lessons.some((lesson) => lesson._id === lessonFilter)) return false;
      return true;
    });
  }, [chapterFilter, language, lessonFilter, submissions, unitFilter]);

  async function handleUpload(contentType: ContentType, contentId: string, file: File) {
    try {
      setUploadingExpressionId(contentId);
      const base64 = await fileToBase64(file);
      const analysis = await analyzeAudioBlob(file);
      await expressionService.createSubmission(contentType, contentId, {
        base64,
        mimeType: file.type || "audio/mpeg",
        analysis
      });
      toast.success("Audio submitted for review");
      await fetchData();
    } catch (error: unknown) {
      const message =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof (error as { response?: { data?: { error?: string } } }).response?.data?.error === "string"
          ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
          : "Upload failed";
      toast.error(message);
    } finally {
      setUploadingExpressionId(null);
    }
  }

  function cleanupRecorderResources() {
    if (levelRafRef.current) {
      cancelAnimationFrame(levelRafRef.current);
      levelRafRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
  }

  function resetRecordedAudio() {
    if (recordedAudioUrl) {
      URL.revokeObjectURL(recordedAudioUrl);
    }
    setRecordedBlob(null);
    setRecordedAudioUrl(null);
  }

  async function openRecorder(contentType: ContentType, content: VoiceContent) {
    resetRecordedAudio();
    cleanupRecorderResources();
    setRecordingItem({ contentType, content });
    setRecorderOpen(true);
  }

  async function startRecording() {
    if (!recordingItem) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("Audio recording is not supported in this browser.");
      return;
    }

    try {
      resetRecordedAudio();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      setRecordingSeconds(0);
      setInputLevel(0);

      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      const levelData = new Uint8Array(analyser.frequencyBinCount);
      const tickLevel = () => {
        const node = analyserRef.current;
        if (!node) return;
        node.getByteTimeDomainData(levelData);
        let sum = 0;
        for (let i = 0; i < levelData.length; i += 1) {
          const normalized = (levelData[i] - 128) / 128;
          sum += normalized * normalized;
        }
        const rms = Math.sqrt(sum / levelData.length);
        const scaled = Math.min(100, Math.max(0, Math.round(rms * 260)));
        setInputLevel(scaled);
        levelRafRef.current = requestAnimationFrame(tickLevel);
      };
      levelRafRef.current = requestAnimationFrame(tickLevel);
      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm"
        });
        chunksRef.current = [];
        setRecordedBlob(blob);
        setRecordedAudioUrl(URL.createObjectURL(blob));
        setIsRecording(false);
        setInputLevel(0);
        cleanupRecorderResources();
      };

      recorder.start(1000);
      setIsRecording(true);
    } catch {
      cleanupRecorderResources();
      setIsRecording(false);
      setInputLevel(0);
      toast.error("Could not access microphone.");
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  }

  async function submitRecording() {
    if (!recordingItem || !recordedBlob) return;
    try {
      setUploadingExpressionId(recordingItem.content._id);
      const base64 = await blobToBase64(recordedBlob);
      const analysis = await analyzeAudioBlob(recordedBlob);
      await expressionService.createSubmission(recordingItem.contentType, recordingItem.content._id, {
        base64,
        mimeType: recordedBlob.type || "audio/webm",
        analysis
      });
      toast.success("Recorded audio submitted for review");
      setRecorderOpen(false);
      resetRecordedAudio();
      await fetchData();
    } catch (error: unknown) {
      const message =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof (error as { response?: { data?: { error?: string } } }).response?.data?.error === "string"
          ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
          : "Upload failed";
      toast.error(message);
    } finally {
      setUploadingExpressionId(null);
    }
  }

  useEffect(() => {
    return () => {
      cleanupRecorderResources();
      if (recordedAudioUrl) URL.revokeObjectURL(recordedAudioUrl);
    };
  }, [recordedAudioUrl]);

  if (!isValidLanguageParam) return <div>Invalid language</div>;

  const minutes = Math.floor(recordingSeconds / 60);
  const seconds = recordingSeconds % 60;
  const timerLabel = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground">
            {LANGUAGE_LABELS[language]} Audio Queue
          </h1>
          <p className="text-muted-foreground font-medium">
            Record and submit word, expression, and sentence audio with chapter, unit, and lesson context visible while you work.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border-2 border-primary/10 bg-card shadow-xl">
        <div className="px-6 py-4 border-b font-bold">Requested Content Audio</div>
        <div className="px-6 pt-4">
          <DataTableControls
            search={queueSearch}
            onSearchChange={setQueueSearch}
            page={queuePage}
            limit={queueLimit}
            onLimitChange={(value) => {
              setQueueLimit(value);
              setQueuePage(1);
            }}
            totalPages={queueTotalPages}
            total={queueTotal}
            label="Search queue"
            onPrev={() => setQueuePage((prev) => Math.max(1, prev - 1))}
            onNext={() => setQueuePage((prev) => Math.min(queueTotalPages, prev + 1))}
          />
          <div className="pb-4 flex flex-wrap gap-3">
            <Select value={chapterFilter} onValueChange={setChapterFilter}>
              <SelectTrigger className="h-10 w-[260px]">
                <SelectValue placeholder="Filter by chapter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All chapters</SelectItem>
                {curriculumOptions.chapters.map((chapter) => (
                  <SelectItem key={chapter.id} value={chapter.id}>{chapter.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={unitFilter} onValueChange={setUnitFilter}>
              <SelectTrigger className="h-10 w-[260px]">
                <SelectValue placeholder="Filter by unit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All units</SelectItem>
                {curriculumOptions.units.map((unit) => (
                  <SelectItem key={unit.id} value={unit.id}>{unit.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={lessonFilter} onValueChange={setLessonFilter}>
              <SelectTrigger className="h-10 w-[260px]">
                <SelectValue placeholder="Filter by lesson" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All lessons</SelectItem>
                {curriculumOptions.lessons.map((lesson) => (
                  <SelectItem key={lesson.id} value={lesson.id}>{lesson.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Content</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Translation</TableHead>
              <TableHead>Context</TableHead>
              <TableHead>Last Submission</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">Loading...</TableCell>
              </TableRow>
            ) : scopedQueue.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  No requested content items in your language.
                </TableCell>
              </TableRow>
            ) : (
              scopedQueue.map((item) => (
                <TableRow key={`${item.contentType}:${item.content._id}`}>
                  <TableCell className="font-semibold">{item.content.text}</TableCell>
                  <TableCell>{CONTENT_LABELS[item.contentType]}</TableCell>
                  <TableCell>{pickPrimaryTranslation(item.content) || "-"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {item.chapters.map((chapter) => (
                        <Badge key={chapter._id} variant="outline">{chapter.title}</Badge>
                      ))}
                      {item.units.map((unit) => (
                        <Badge key={unit._id} variant="outline" className="border-primary/20 text-primary bg-primary/5">{unit.title}</Badge>
                      ))}
                      {item.lessons.map((lesson) => (
                        <Badge key={lesson._id} variant="outline" className="border-muted-foreground/30 text-muted-foreground">{lesson.title}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {item.latestSubmission ? (
                      <Badge
                        className={
                          item.latestSubmission.status === "accepted"
                            ? "bg-green-500"
                            : item.latestSubmission.status === "rejected"
                              ? "bg-red-500"
                              : "bg-amber-500"
                        }
                      >
                        {item.latestSubmission.status}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">none</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={uploadingExpressionId === item.content._id}
                        onClick={() => openRecorder(item.contentType, item.content)}
                      >
                        <Mic className="h-4 w-4" />
                        Record
                      </Button>
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="file"
                          accept="audio/*"
                          className="hidden"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) {
                              handleUpload(item.contentType, item.content._id, file);
                            }
                            event.target.value = "";
                          }}
                          disabled={uploadingExpressionId === item.content._id}
                        />
                        <Button type="button" variant="outline" disabled={uploadingExpressionId === item.content._id}>
                          {uploadingExpressionId === item.content._id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Upload className="h-4 w-4" />
                          )}
                          Upload
                        </Button>
                      </label>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="overflow-hidden rounded-3xl border-2 border-primary/10 bg-card shadow-xl">
        <div className="px-6 py-4 border-b font-bold">My Submissions</div>
        <div className="px-6 pt-4">
          <DataTableControls
            search={submissionSearch}
            onSearchChange={setSubmissionSearch}
            page={submissionPage}
            limit={submissionLimit}
            onLimitChange={(value) => {
              setSubmissionLimit(value);
              setSubmissionPage(1);
            }}
            totalPages={submissionTotalPages}
            total={submissionTotal}
            label="Search submissions"
            onPrev={() => setSubmissionPage((prev) => Math.max(1, prev - 1))}
            onNext={() => setSubmissionPage((prev) => Math.min(submissionTotalPages, prev + 1))}
          />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Content</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Context</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Audio</TableHead>
              <TableHead>Rejection Reason</TableHead>
              <TableHead>Submitted</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">Loading...</TableCell>
              </TableRow>
            ) : scopedSubmissions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  No submissions yet.
                </TableCell>
              </TableRow>
            ) : (
              scopedSubmissions.map((submission) => (
                <TableRow key={submission.id}>
                  <TableCell className="font-semibold">{submission.content?.text || "-"}</TableCell>
                  <TableCell>{CONTENT_LABELS[submission.contentType]}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {submission.chapters.map((chapter) => (
                        <Badge key={chapter._id} variant="outline">{chapter.title}</Badge>
                      ))}
                      {submission.units.map((unit) => (
                        <Badge key={unit._id} variant="outline" className="border-primary/20 text-primary bg-primary/5">{unit.title}</Badge>
                      ))}
                      {submission.lessons.map((lesson) => (
                        <Badge key={lesson._id} variant="outline" className="border-muted-foreground/30 text-muted-foreground">{lesson.title}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={
                        submission.status === "accepted"
                          ? "bg-green-500"
                          : submission.status === "rejected"
                            ? "bg-red-500"
                            : "bg-amber-500"
                      }
                    >
                      {submission.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-8 w-8 ${TABLE_ACTION_ICON_CLASS.play}`}
                      onClick={() => playAudio(submission.audio?.url)}
                    >
                      <Volume2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                  <TableCell>{submission.rejectionReason || "-"}</TableCell>
                  <TableCell>{new Date(submission.createdAt).toLocaleString()}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={recorderOpen}
        onOpenChange={(open) => {
          if (!open) {
            if (isRecording) stopRecording();
            cleanupRecorderResources();
            resetRecordedAudio();
            setRecordingItem(null);
          }
          setRecorderOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Content Audio</DialogTitle>
            <DialogDescription>
              {recordingItem
                ? `${CONTENT_LABELS[recordingItem.contentType]}: ${recordingItem.content.text} — ${pickPrimaryTranslation(recordingItem.content)}`
                : "Record and submit audio."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Status: {isRecording ? "Recording..." : recordedBlob ? "Recorded" : "Ready"}
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Timer: {timerLabel}</div>
              <div className="h-2 w-full rounded bg-secondary">
                <div
                  className="h-2 rounded bg-primary transition-all"
                  style={{ width: `${inputLevel}%` }}
                />
              </div>
            </div>

            {recordedAudioUrl && (
              <audio controls className="w-full" src={recordedAudioUrl}>
                Your browser does not support audio playback.
              </audio>
            )}
          </div>

          <DialogFooter>
            {!isRecording ? (
              <Button type="button" variant="outline" onClick={startRecording}>
                <Mic className="h-4 w-4" />
                Start
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={stopRecording}>
                <Square className="h-4 w-4" />
                Stop
              </Button>
            )}

            <Button
              type="button"
              variant="outline"
              onClick={resetRecordedAudio}
              disabled={!recordedBlob || isRecording}
            >
              <RotateCcw className="h-4 w-4" />
              Retake
            </Button>

            <Button
              type="button"
              onClick={submitRecording}
              disabled={!recordedBlob || isRecording || !recordingItem || uploadingExpressionId === recordingItem.content._id}
            >
              {recordingItem && uploadingExpressionId === recordingItem.content._id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
