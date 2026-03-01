'use client'

import { useCallback, useEffect, useMemo, useRef, useState, use } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { phraseService } from "@/services";
import { Language, Phrase } from "@/types";
import { Button } from "@/components/ui/button";
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

const LANGUAGE_LABELS: Record<Language, string> = {
  yoruba: "Yoruba",
  igbo: "Igbo",
  hausa: "Hausa"
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

type QueueItem = {
  phrase: Phrase;
  latestSubmission: null | {
    id: string;
    status: "pending" | "accepted" | "rejected";
    rejectionReason: string;
    createdAt: string;
  };
};

type SubmissionItem = {
  id: string;
  status: "pending" | "accepted" | "rejected";
  rejectionReason: string;
  createdAt: string;
  phrase: Phrase | null;
  audio: {
    url: string;
    format: string;
  };
};

export default function VoicePhrasesPage({ params }: { params: Promise<{ language: string }> }) {
  const { language: languageParam } = use(params);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [uploadingPhraseId, setUploadingPhraseId] = useState<string | null>(null);
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
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [recordingPhrase, setRecordingPhrase] = useState<Phrase | null>(null);
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
        phraseService.getQueuePage({
          q: queueSearch || undefined,
          page: queuePage,
          limit: queueLimit
        }),
        phraseService.listMySubmissionsPage({
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
    } catch {
      toast.error("Failed to load phrases/audio submissions");
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
  }, [queueSearch, language]);

  useEffect(() => {
    setSubmissionPage(1);
  }, [submissionSearch, language]);

  useEffect(() => {
    const qq = searchParams.get("qq") || "";
    const qp = Number(searchParams.get("qp") || "1");
    const ql = Number(searchParams.get("ql") || "20");
    const sq = searchParams.get("sq") || "";
    const sp = Number(searchParams.get("sp") || "1");
    const sl = Number(searchParams.get("sl") || "20");
    setQueueSearch(qq);
    setQueuePage(Number.isInteger(qp) && qp > 0 ? qp : 1);
    setQueueLimit([10, 20, 50].includes(ql) ? ql : 20);
    setSubmissionSearch(sq);
    setSubmissionPage(Number.isInteger(sp) && sp > 0 ? sp : 1);
    setSubmissionLimit([10, 20, 50].includes(sl) ? sl : 20);
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
    pathname,
    router,
    searchParams
  ]);

  const scopedQueue = useMemo(
    () => queue.filter((item) => item.phrase.language === language),
    [queue, language]
  );

  const scopedSubmissions = useMemo(
    () => submissions.filter((item) => item.phrase?.language === language),
    [submissions, language]
  );

  async function handleUpload(phraseId: string, file: File) {
    try {
      setUploadingPhraseId(phraseId);
      const base64 = await fileToBase64(file);
      await phraseService.createSubmission(phraseId, {
        base64,
        mimeType: file.type || "audio/mpeg"
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
      setUploadingPhraseId(null);
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

  async function openRecorder(phrase: Phrase) {
    resetRecordedAudio();
    cleanupRecorderResources();
    setRecordingPhrase(phrase);
    setRecorderOpen(true);
  }

  async function startRecording() {
    if (!recordingPhrase) return;
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
    if (!recordingPhrase || !recordedBlob) return;
    try {
      setUploadingPhraseId(recordingPhrase._id);
      const base64 = await blobToBase64(recordedBlob);
      await phraseService.createSubmission(recordingPhrase._id, {
        base64,
        mimeType: recordedBlob.type || "audio/webm"
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
      setUploadingPhraseId(null);
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
            Record and submit phrase audio. Admin will accept or reject with feedback.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border-2 border-primary/10 bg-card shadow-xl">
        <div className="px-6 py-4 border-b font-bold">Phrases Without Audio</div>
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
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Phrase</TableHead>
              <TableHead>Translation</TableHead>
              <TableHead>Last Submission</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">Loading...</TableCell>
              </TableRow>
            ) : scopedQueue.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                  No pending phrases in your language.
                </TableCell>
              </TableRow>
            ) : (
              scopedQueue.map((item) => (
                <TableRow key={item.phrase._id}>
                  <TableCell className="font-semibold">{item.phrase.text}</TableCell>
                  <TableCell>{item.phrase.translation}</TableCell>
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
                        disabled={uploadingPhraseId === item.phrase._id}
                        onClick={() => openRecorder(item.phrase)}
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
                              handleUpload(item.phrase._id, file);
                            }
                            event.target.value = "";
                          }}
                          disabled={uploadingPhraseId === item.phrase._id}
                        />
                        <Button type="button" variant="outline" disabled={uploadingPhraseId === item.phrase._id}>
                          {uploadingPhraseId === item.phrase._id ? (
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
              <TableHead>Phrase</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Audio</TableHead>
              <TableHead>Rejection Reason</TableHead>
              <TableHead>Submitted</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">Loading...</TableCell>
              </TableRow>
            ) : scopedSubmissions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  No submissions yet.
                </TableCell>
              </TableRow>
            ) : (
              scopedSubmissions.map((submission) => (
                <TableRow key={submission.id}>
                  <TableCell className="font-semibold">{submission.phrase?.text || "-"}</TableCell>
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
                      className="h-8 w-8 text-primary"
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
          }
          setRecorderOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Phrase Audio</DialogTitle>
            <DialogDescription>
              {recordingPhrase ? `${recordingPhrase.text} — ${recordingPhrase.translation}` : "Record and submit audio."}
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
              disabled={!recordedBlob || isRecording || !recordingPhrase || uploadingPhraseId === recordingPhrase._id}
            >
              {recordingPhrase && uploadingPhraseId === recordingPhrase._id ? (
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
