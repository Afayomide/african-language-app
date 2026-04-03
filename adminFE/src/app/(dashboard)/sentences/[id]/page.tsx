'use client'

import { Suspense, use, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { expressionService, lessonService, sentenceService, wordService } from "@/services";
import type { Expression, Language, Lesson, Sentence, SentenceComponentRef, Word } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle, Flag, Mic, Plus, Save, Sparkles, Square, Trash2, Volume2 } from "lucide-react";
import { workflowStatusBadgeClass } from "@/lib/status-badge";

function isLanguage(value: string | null): value is Language {
  return value === "yoruba" || value === "igbo" || value === "hausa";
}

type ComponentOption = { id: string; text: string; type: "word" | "expression" };

function SentenceFormContent({ mode, id }: { mode: "new" | "edit"; id?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const languageParam = searchParams.get("language");
  const lessonIdParam = searchParams.get("lessonId");

  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [words, setWords] = useState<Word[]>([]);
  const [expressions, setExpressions] = useState<Expression[]>([]);
  const [sentence, setSentence] = useState<Partial<Sentence>>({
    text: "",
    translations: [],
    pronunciation: "",
    explanation: "",
    difficulty: 1,
    literalTranslation: "",
    usageNotes: "",
    lessonIds: lessonIdParam ? [lessonIdParam] : [],
    language: isLanguage(languageParam) ? languageParam : undefined,
    status: "draft",
    components: []
  });
  const [translationsText, setTranslationsText] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(mode === "edit");
  const [isSaving, setIsSaving] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    void loadDependencies();
  }, [sentence.language, languageParam]);

  useEffect(() => {
    if (mode === "edit" && id) void loadSentence(id);
  }, [mode, id]);

  useEffect(() => {
    return () => {
      if (recordedAudioUrl) URL.revokeObjectURL(recordedAudioUrl);
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach((track) => track.stop());
    };
  }, [recordedAudioUrl]);

  async function loadDependencies() {
    try {
      const activeLanguage = sentence.language || (isLanguage(languageParam) ? languageParam : undefined);
      const [lessonData, wordData, expressionData] = await Promise.all([
        lessonService.listLessons(undefined, activeLanguage),
        wordService.listWords(undefined, undefined, activeLanguage),
        expressionService.listExpressions(undefined, undefined, activeLanguage)
      ]);
      setLessons(lessonData);
      setWords(wordData.filter((item) => !activeLanguage || item.language === activeLanguage));
      setExpressions(expressionData.filter((item) => !activeLanguage || item.language === activeLanguage));
    } catch {
      toast.error("Failed to load dependencies");
    }
  }

  async function loadSentence(sentenceId: string) {
    try {
      const data = await sentenceService.getSentence(sentenceId);
      setSentence(data);
      setTranslationsText(Array.isArray(data.translations) ? data.translations.join("\n") : "");
    } catch {
      toast.error("Failed to load sentence");
      router.push("/sentences");
    } finally {
      setIsLoading(false);
    }
  }

  async function fileToBase64(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== "string") {
          reject(new Error("invalid_file_data"));
          return;
        }
        const [, base64] = result.split(",");
        resolve(base64 || result);
      };
      reader.onerror = () => reject(new Error("file_read_failed"));
      reader.readAsDataURL(file);
    });
  }

  function cleanupRecorderResources() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
  }

  function resetRecordedAudio() {
    if (recordedAudioUrl) URL.revokeObjectURL(recordedAudioUrl);
    setRecordedAudioUrl(null);
    setRecordingSeconds(0);
  }

  async function startRecording() {
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

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const ext = blob.type.includes("ogg") ? "ogg" : "webm";
        const file = new File([blob], `recording-${Date.now()}.${ext}`, { type: blob.type });
        setAudioFile(file);
        setRecordedAudioUrl(URL.createObjectURL(blob));
        setIsRecording(false);
        cleanupRecorderResources();
      };

      recorder.start(1000);
      timerRef.current = setInterval(() => setRecordingSeconds((prev) => prev + 1), 1000);
      setIsRecording(true);
    } catch {
      cleanupRecorderResources();
      setIsRecording(false);
      toast.error("Could not access microphone.");
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  }

  const componentOptions = useMemo<ComponentOption[]>(() => ([
    ...words.map((item) => ({ id: item._id, text: item.text, type: "word" as const })),
    ...expressions.map((item) => ({ id: item._id, text: item.text, type: "expression" as const }))
  ]), [words, expressions]);

  const filteredLessons = useMemo(
    () => lessons.filter((lesson) => !sentence.language || lesson.language === sentence.language).sort((a, b) => a.orderIndex - b.orderIndex),
    [lessons, sentence.language]
  );

  function toggleLesson(lessonId: string, checked: boolean) {
    setSentence((current) => {
      const lessonIds = Array.isArray(current.lessonIds) ? current.lessonIds : [];
      return {
        ...current,
        lessonIds: checked ? Array.from(new Set([...lessonIds, lessonId])) : lessonIds.filter((item) => item !== lessonId)
      };
    });
  }

  function setComponentRow(index: number, update: Partial<SentenceComponentRef>) {
    setSentence((current) => {
      const rows = Array.isArray(current.components) ? [...current.components] : [];
      rows[index] = { ...rows[index], ...update, orderIndex: index } as SentenceComponentRef;
      return { ...current, components: rows };
    });
  }

  function addComponentRow() {
    setSentence((current) => {
      const rows = Array.isArray(current.components) ? [...current.components] : [];
      rows.push({ type: "word", refId: "", orderIndex: rows.length });
      return { ...current, components: rows };
    });
  }

  function removeComponentRow(index: number) {
    setSentence((current) => {
      const rows = (Array.isArray(current.components) ? current.components : [])
        .filter((_, currentIndex) => currentIndex !== index)
        .map((row, rowIndex) => ({ ...row, orderIndex: rowIndex }));
      return { ...current, components: rows };
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const components = (sentence.components || []).filter((component) => component.refId);
    if (!sentence.language || !sentence.text || !translationsText.trim() || components.length === 0) {
      toast.error("Language, text, translations, and components are required");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        language: sentence.language,
        lessonIds: mode === "edit" ? sentence.lessonIds : undefined,
        text: sentence.text,
        translations: translationsText.split(/\n|,/).map((item) => item.trim()).filter(Boolean),
        pronunciation: sentence.pronunciation || "",
        explanation: sentence.explanation || "",
        difficulty: Number(sentence.difficulty || 1),
        literalTranslation: sentence.literalTranslation || "",
        usageNotes: sentence.usageNotes || "",
        components: components.map((component, index) => ({ type: component.type, refId: component.refId, orderIndex: index })),
        audioUpload: audioFile
          ? {
              base64: await fileToBase64(audioFile),
              mimeType: audioFile.type || undefined,
              fileName: audioFile.name
            }
          : undefined
      };
      const saved = mode === "edit" && id ? await sentenceService.updateSentence(id, payload) : await sentenceService.createSentence(payload);
      setSentence(saved);
      setTranslationsText(saved.translations.join("\n"));
      toast.success(`Sentence ${mode === "edit" ? "updated" : "created"}`);
      if (mode === "new") router.push(`/sentences/${saved._id}`);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Failed to save sentence");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleFinish() {
    if (!id) return;
    try {
      const updated = await sentenceService.finishSentence(id);
      setSentence(updated);
      toast.success("Sentence finished");
    } catch {
      toast.error("Failed to finish sentence");
    }
  }

  async function handlePublish() {
    if (!id) return;
    try {
      const updated = await sentenceService.publishSentence(id);
      setSentence(updated);
      toast.success("Sentence published");
    } catch {
      toast.error("Failed to publish sentence");
    }
  }

  async function handleGenerateAudio() {
    if (!id) return;
    try {
      const updated = await sentenceService.generateSentenceAudio(id);
      setSentence(updated);
      toast.success("Sentence audio generated");
    } catch {
      toast.error("Failed to generate audio");
    }
  }

  if (isLoading) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-3xl font-bold">{mode === "edit" ? "Edit Sentence" : "New Sentence"}</h1>
        </div>
        <div className="flex gap-2">
          {mode === "edit" && id ? (
            <>
              <Button variant="outline" onClick={handleGenerateAudio}>
                <Volume2 className="mr-2 h-4 w-4" />
                Generate Audio
              </Button>
              {sentence.status === "draft" ? (
                <Button variant="outline" onClick={handleFinish}>
                  <Flag className="mr-2 h-4 w-4 text-amber-600" />
                  Finish
                </Button>
              ) : null}
              {sentence.status === "finished" ? (
                <Button variant="outline" onClick={handlePublish}>
                  <CheckCircle className="mr-2 h-4 w-4 text-green-600" />
                  Publish
                </Button>
              ) : null}
            </>
          ) : null}
          <Button onClick={handleSubmit} disabled={isSaving}>
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? "Saving..." : mode === "edit" ? "Save Changes" : "Create Sentence"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Sentence Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Language</Label>
                  <Select value={sentence.language} onValueChange={(value) => setSentence((current) => ({ ...current, language: value as Language, lessonIds: [], components: [] }))} disabled={mode === "edit"}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select language" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yoruba">Yoruba</SelectItem>
                      <SelectItem value="igbo">Igbo</SelectItem>
                      <SelectItem value="hausa">Hausa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Difficulty (1-5)</Label>
                  <Select value={String(sentence.difficulty || 1)} onValueChange={(value) => setSentence((current) => ({ ...current, difficulty: Number(value) }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 - Very Easy</SelectItem>
                      <SelectItem value="2">2 - Easy</SelectItem>
                      <SelectItem value="3">3 - Medium</SelectItem>
                      <SelectItem value="4">4 - Hard</SelectItem>
                      <SelectItem value="5">5 - Very Hard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Sentence Text</Label>
                <Input value={sentence.text || ""} onChange={(event) => setSentence((current) => ({ ...current, text: event.target.value }))} required />
              </div>

              <div className="space-y-2">
                <Label>Translations</Label>
                <Textarea value={translationsText} onChange={(event) => setTranslationsText(event.target.value)} rows={4} required />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Literal Translation</Label>
                  <Input value={sentence.literalTranslation || ""} onChange={(event) => setSentence((current) => ({ ...current, literalTranslation: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Pronunciation</Label>
                  <Input value={sentence.pronunciation || ""} onChange={(event) => setSentence((current) => ({ ...current, pronunciation: event.target.value }))} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Explanation</Label>
                <Textarea value={sentence.explanation || ""} onChange={(event) => setSentence((current) => ({ ...current, explanation: event.target.value }))} rows={3} />
              </div>

              <div className="space-y-2">
                <Label>Usage Notes</Label>
                <Textarea value={sentence.usageNotes || ""} onChange={(event) => setSentence((current) => ({ ...current, usageNotes: event.target.value }))} rows={3} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="audioUpload">Upload Audio Recording</Label>
                <Input
                  id="audioUpload"
                  type="file"
                  accept="audio/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    setAudioFile(file);
                    if (file) resetRecordedAudio();
                  }}
                />
                <div className="flex flex-wrap gap-2">
                  {!isRecording ? (
                    <Button type="button" variant="outline" onClick={startRecording}>
                      <Mic className="mr-2 h-4 w-4" />
                      Record Audio
                    </Button>
                  ) : (
                    <Button type="button" variant="outline" onClick={stopRecording}>
                      <Square className="mr-2 h-4 w-4" />
                      Stop Recording ({Math.floor(recordingSeconds / 60).toString().padStart(2, "0")}:{(recordingSeconds % 60).toString().padStart(2, "0")})
                    </Button>
                  )}
                </div>
                {recordedAudioUrl ? <audio controls src={recordedAudioUrl} className="w-full" /> : null}
                {audioFile ? <p className="text-xs text-muted-foreground">Selected file: {audioFile.name}</p> : null}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Sentence Components</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Components</Label>
                <Button type="button" variant="outline" onClick={addComponentRow}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Component
                </Button>
              </div>
              {(sentence.components || []).length === 0 ? (
                <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  Add at least one word or expression.
                </div>
              ) : (
                <div className="space-y-3">
                  {(sentence.components || []).map((component, index) => (
                    <div key={`${component.type}-${component.refId}-${index}`} className="grid gap-3 rounded-xl border bg-background p-3">
                      <Select value={component.type} onValueChange={(value) => setComponentRow(index, { type: value as "word" | "expression", refId: "" })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="word">Word</SelectItem>
                          <SelectItem value="expression">Expression</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={component.refId} onValueChange={(value) => setComponentRow(index, { refId: value })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select content" />
                        </SelectTrigger>
                        <SelectContent>
                          {componentOptions.filter((option) => option.type === component.type).map((option) => (
                            <SelectItem key={option.id} value={option.id}>{option.text}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex justify-end">
                        <Button type="button" variant="outline" size="sm" onClick={() => removeComponentRow(index)}>
                          <Trash2 className="mr-2 h-4 w-4" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {mode === "edit" ? (
                <div className="space-y-2">
                  <Label>Lesson</Label>
                  <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3">
                    {filteredLessons.map((lesson) => (
                      <label key={lesson._id} className="flex cursor-pointer items-center gap-2 text-sm">
                        <input type="checkbox" checked={sentence.lessonIds?.includes(lesson._id) || false} onChange={(event) => toggleLesson(lesson._id, event.target.checked)} />
                        <span>{lesson.title}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                  This sentence will be created without lesson assignment. Attach it from the edit page when you are ready.
                </div>
              )}

              <div className="pt-2">
                <Label>Status</Label>
                <div className="mt-1">
                  <Badge className={workflowStatusBadgeClass(sentence.status || "draft")}>{sentence.status || "draft"}</Badge>
                </div>
              </div>

              {sentence.audio?.url ? (
                <div className="pt-2">
                  <Label>Audio</Label>
                  <div className="mt-2">
                    <audio controls src={sentence.audio.url} className="w-full" />
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {sentence.aiMeta?.generatedByAI ? (
            <Card className="border-purple-200 bg-purple-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-purple-800">
                  <Sparkles className="h-4 w-4" />
                  AI Metadata
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-purple-700">
                <p><strong>Model:</strong> {sentence.aiMeta.model}</p>
                <p><strong>Status:</strong> {sentence.aiMeta.reviewedByAdmin ? "Reviewed" : "Pending Review"}</p>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function EditSentencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SentenceFormContent mode="edit" id={id} />
    </Suspense>
  );
}
