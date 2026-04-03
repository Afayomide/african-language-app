'use client'

import { Suspense, use, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { lessonService, wordService } from "@/services";
import type { Language, Lesson, Word } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { WordImageManager } from "@/components/words/word-image-manager";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle, Save, Volume2 } from "lucide-react";
import { workflowStatusBadgeClass } from "@/lib/status-badge";

function isLanguage(value: string | null): value is Language {
  return value === "yoruba" || value === "igbo" || value === "hausa";
}

function WordFormContent({ mode, id }: { mode: "new" | "edit"; id?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const languageParam = searchParams.get("language");
  const lessonIdParam = searchParams.get("lessonId");

  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [word, setWord] = useState<Partial<Word>>({
    text: "",
    translations: [],
    pronunciation: "",
    explanation: "",
    difficulty: 1,
    lemma: "",
    partOfSpeech: "",
    lessonIds: lessonIdParam ? [lessonIdParam] : [],
    language: isLanguage(languageParam) ? languageParam : undefined,
    status: "draft",
    image: null
  });
  const [translationsText, setTranslationsText] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(mode === "edit");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    void loadLessons();
    if (mode === "edit" && id) void loadWord(id);
  }, [mode, id]);

  async function loadLessons() {
    try {
      const data = await lessonService.listLessons();
      setLessons(data);
    } catch {
      toast.error("Failed to load lessons");
    }
  }

  async function loadWord(wordId: string) {
    try {
      const data = await wordService.getWord(wordId);
      setWord(data);
      setTranslationsText(Array.isArray(data.translations) ? data.translations.join("\n") : "");
    } catch {
      toast.error("Failed to load word");
      router.push("/words");
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

  function toggleLesson(lessonId: string, checked: boolean) {
    setWord((current) => {
      const lessonIds = Array.isArray(current.lessonIds) ? current.lessonIds : [];
      return {
        ...current,
        lessonIds: checked ? Array.from(new Set([...lessonIds, lessonId])) : lessonIds.filter((item) => item !== lessonId)
      };
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!word.language || !word.text || !translationsText.trim()) {
      toast.error("Language, text, and translations are required");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        language: word.language,
        lessonIds: mode === "edit" ? word.lessonIds : undefined,
        text: word.text,
        translations: translationsText.split(/\n|,/).map((item) => item.trim()).filter(Boolean),
        pronunciation: word.pronunciation || "",
        explanation: word.explanation || "",
        difficulty: Number(word.difficulty || 1),
        lemma: word.lemma || "",
        partOfSpeech: word.partOfSpeech || "",
        image: word.image && (word.image.url || word.image.thumbnailUrl || word.image.altText)
          ? {
              imageAssetId: word.image.imageAssetId,
              url: word.image.url || "",
              thumbnailUrl: word.image.thumbnailUrl || "",
              altText: word.image.altText || ""
            }
          : null,
        audioUpload: audioFile
          ? {
              base64: await fileToBase64(audioFile),
              mimeType: audioFile.type || undefined,
              fileName: audioFile.name
            }
          : undefined
      };
      const saved = mode === "edit" && id ? await wordService.updateWord(id, payload) : await wordService.createWord(payload);
      setWord(saved);
      setTranslationsText(saved.translations.join("\n"));
      toast.success(`Word ${mode === "edit" ? "updated" : "created"}`);
      if (mode === "new") router.push(`/words/${saved._id}`);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Failed to save word");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleFinish() {
    if (!id) return;
    try {
      const updated = await wordService.finishWord(id);
      setWord(updated);
      toast.success("Word finished");
    } catch {
      toast.error("Failed to finish word");
    }
  }

  async function handleGenerateAudio() {
    if (!id) return;
    try {
      const updated = await wordService.generateWordAudio(id);
      setWord(updated);
      toast.success("Word audio generated");
    } catch {
      toast.error("Failed to generate audio");
    }
  }

  const filteredLessons = useMemo(
    () => lessons.filter((lesson) => !word.language || lesson.language === word.language).sort((a, b) => a.orderIndex - b.orderIndex),
    [lessons, word.language]
  );

  if (isLoading) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-3xl font-bold">{mode === "edit" ? "Edit Word" : "New Word"}</h1>
        </div>
        <div className="flex gap-2">
          {mode === "edit" && id ? (
            <>
              <Button variant="outline" onClick={handleGenerateAudio}>
                <Volume2 className="mr-2 h-4 w-4" />
                Generate Audio
              </Button>
              {word.status === "draft" ? (
                <Button variant="outline" onClick={handleFinish}>
                  <CheckCircle className="mr-2 h-4 w-4 text-green-600" />
                  Finish
                </Button>
              ) : null}
            </>
          ) : null}
          <Button onClick={handleSubmit} disabled={isSaving}>
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? "Saving..." : mode === "edit" ? "Save Changes" : "Create Word"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Word Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Language</Label>
                  <Select value={word.language} onValueChange={(value) => setWord((current) => ({ ...current, language: value as Language, lessonIds: [] }))} disabled={mode === "edit"}>
                    <SelectTrigger><SelectValue placeholder="Select language" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yoruba">Yoruba</SelectItem>
                      <SelectItem value="igbo">Igbo</SelectItem>
                      <SelectItem value="hausa">Hausa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Difficulty (1-5)</Label>
                  <Select value={String(word.difficulty || 1)} onValueChange={(value) => setWord((current) => ({ ...current, difficulty: Number(value) }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
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
                <Label htmlFor="text">Text (Original)</Label>
                <Input id="text" value={word.text || ""} onChange={(event) => setWord((current) => ({ ...current, text: event.target.value }))} required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="translations">Translations</Label>
                <Textarea id="translations" value={translationsText} onChange={(event) => setTranslationsText(event.target.value)} rows={4} required />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Lemma</Label>
                  <Input value={word.lemma || ""} onChange={(event) => setWord((current) => ({ ...current, lemma: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Part of Speech</Label>
                  <Input value={word.partOfSpeech || ""} onChange={(event) => setWord((current) => ({ ...current, partOfSpeech: event.target.value }))} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Pronunciation</Label>
                <Input value={word.pronunciation || ""} onChange={(event) => setWord((current) => ({ ...current, pronunciation: event.target.value }))} />
              </div>

              <div className="space-y-2">
                <Label>Explanation</Label>
                <Textarea value={word.explanation || ""} onChange={(event) => setWord((current) => ({ ...current, explanation: event.target.value }))} rows={4} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="audioUpload">Upload Audio Recording</Label>
                <Input id="audioUpload" type="file" accept="audio/*" onChange={(event) => setAudioFile(event.target.files?.[0] || null)} />
                {audioFile ? <p className="text-xs text-muted-foreground">Selected file: {audioFile.name}</p> : null}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <WordImageManager word={word} onImageChanged={(image) => setWord((current) => ({ ...current, image }))} />
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
                        <input type="checkbox" checked={word.lessonIds?.includes(lesson._id) || false} onChange={(event) => toggleLesson(lesson._id, event.target.checked)} />
                        <span>{lesson.title}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                  This word will be created without lesson assignment. Attach it from the edit page when you are ready.
                </div>
              )}

              <div className="pt-2">
                <Label>Status</Label>
                <div className="mt-1">
                  <Badge className={workflowStatusBadgeClass(word.status || "draft")}>{word.status || "draft"}</Badge>
                </div>
              </div>

              {word.audio?.url ? (
                <div className="pt-2">
                  <Label>Audio</Label>
                  <div className="mt-2">
                    <audio controls src={word.audio.url} className="w-full" />
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function EditWordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <WordFormContent mode="edit" id={id} />
    </Suspense>
  );
}
