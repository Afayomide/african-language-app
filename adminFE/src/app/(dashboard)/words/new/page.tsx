
'use client'

import { Suspense, use, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { wordService, lessonService } from "@/services";
import type { Lesson, Language, Word } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Save, Volume2, CheckCircle } from "lucide-react";
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
    status: "draft"
  });
  const [translationsText, setTranslationsText] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(mode === "edit");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (mode === "edit") void loadLessons();
    if (mode === "edit" && id) void loadWord(id);
  }, [mode, id]);

  async function loadLessons() {
    try {
      const data = await lessonService.listLessons(undefined, isLanguage(languageParam) ? languageParam : undefined);
      setLessons(data.filter((lesson) => !word.language || lesson.language === word.language).sort((a, b) => a.orderIndex - b.orderIndex));
    } catch {
      toast.error("Failed to load lessons");
    }
  }

  async function loadWord(wordId: string) {
    try {
      const data = await wordService.getWord(wordId);
      setWord(data);
      setTranslationsText(data.translations.join("\n"));
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
        if (typeof result !== "string") return reject(new Error("file_read_failed"));
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
        audioUpload: audioFile ? { base64: await fileToBase64(audioFile), mimeType: audioFile.type || undefined, fileName: audioFile.name } : undefined
      };
      const saved = mode === "edit" && id
        ? await wordService.updateWord(id, payload)
        : await wordService.createWord(payload);
      toast.success(`Word ${mode === "edit" ? "updated" : "created"}`);
      router.push(mode === "edit" ? `/words/lang/${saved.language}` : `/words/${saved._id}`);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Failed to save word");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleStatusAction() {
    if (!id) return;
    try {
      await wordService.publishWord(id);
      toast.success("Word published");
      await loadWord(id);
    } catch {
      toast.error("Failed to publish word");
    }
  }

  async function handleGenerateAudio() {
    if (!id) return;
    try {
      await wordService.generateWordAudio(id);
      toast.success("Audio generated");
      await loadWord(id);
    } catch {
      toast.error("Failed to generate audio");
    }
  }

  if (isLoading) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{mode === "edit" ? "Edit Word" : "New Word"}</h1>
            {mode === "edit" && word.status ? <Badge className={workflowStatusBadgeClass(word.status)}>{word.status}</Badge> : null}
          </div>
        </div>
        {mode === "edit" && id ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleGenerateAudio}><Volume2 className="mr-2 h-4 w-4" />Generate Audio</Button>
            {word.status === "finished" ? <Button variant="outline" onClick={handleStatusAction}><CheckCircle className="mr-2 h-4 w-4" />Publish</Button> : null}
          </div>
        ) : null}
      </div>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Word Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
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
                <Label>Difficulty</Label>
                <Select value={String(word.difficulty || 1)} onValueChange={(value) => setWord((current) => ({ ...current, difficulty: Number(value) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1</SelectItem>
                    <SelectItem value="2">2</SelectItem>
                    <SelectItem value="3">3</SelectItem>
                    <SelectItem value="4">4</SelectItem>
                    <SelectItem value="5">5</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {mode === "edit" ? (
              <div className="space-y-2">
                <Label>Lessons</Label>
                <div className="max-h-52 space-y-2 overflow-y-auto rounded-md border p-3">
                  {lessons.filter((lesson) => !word.language || lesson.language === word.language).map((lesson) => (
                    <label key={lesson._id} className="flex items-center gap-2 text-sm">
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

            <div className="space-y-2">
              <Label>Text</Label>
              <Input value={word.text || ""} onChange={(event) => setWord((current) => ({ ...current, text: event.target.value }))} required />
            </div>
            <div className="space-y-2">
              <Label>Translations</Label>
              <Textarea value={translationsText} onChange={(event) => setTranslationsText(event.target.value)} rows={4} required />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
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
              <Label>Audio Upload</Label>
              <Input type="file" accept="audio/*" onChange={(event) => setAudioFile(event.target.files?.[0] || null)} />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={isSaving}>
                <Save className="mr-2 h-4 w-4" />
                {isSaving ? "Saving..." : mode === "edit" ? "Save Changes" : "Create Word"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function NewWordPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <WordFormContent mode="new" />
    </Suspense>
  );
}
