
'use client'

import { Suspense, use, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { sentenceService, lessonService, wordService, expressionService } from "@/services";
import type { Lesson, Language, Sentence, SentenceComponentRef, Word, Expression } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Save, Volume2, Plus, Trash2, CheckCircle } from "lucide-react";
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

  useEffect(() => {
    void loadDependencies();
    if (mode === "edit" && id) void loadSentence(id);
  }, [mode, id, sentence.language]);

  async function loadDependencies() {
    try {
      const activeLanguage = sentence.language || (isLanguage(languageParam) ? languageParam : undefined);
      const [lessonData, wordData, expressionData] = await Promise.all([
        mode === "edit" ? lessonService.listLessons() : Promise.resolve([]),
        wordService.listWords(),
        expressionService.listExpressions()
      ]);
      setLessons(lessonData.filter((lesson) => !activeLanguage || lesson.language === activeLanguage).sort((a, b) => a.orderIndex - b.orderIndex));
      setWords(wordData.filter((word) => !activeLanguage || word.language === activeLanguage));
      setExpressions(expressionData.filter((expression) => !activeLanguage || expression.language === activeLanguage));
    } catch {
      toast.error("Failed to load dependencies");
    }
  }

  async function loadSentence(sentenceId: string) {
    try {
      const data = await sentenceService.getSentence(sentenceId);
      setSentence(data);
      setTranslationsText(data.translations.join("\n"));
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
        if (typeof result !== "string") return reject(new Error("file_read_failed"));
        const [, base64] = result.split(",");
        resolve(base64 || result);
      };
      reader.onerror = () => reject(new Error("file_read_failed"));
      reader.readAsDataURL(file);
    });
  }

  const componentOptions = useMemo<ComponentOption[]>(() => ([
    ...words.map((word) => ({ id: word._id, text: word.text, type: "word" as const })),
    ...expressions.map((expression) => ({ id: expression._id, text: expression.text, type: "expression" as const }))
  ]), [words, expressions]);

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
        audioUpload: audioFile ? { base64: await fileToBase64(audioFile), mimeType: audioFile.type || undefined, fileName: audioFile.name } : undefined
      };
      const saved = mode === "edit" && id
        ? await sentenceService.updateSentence(id, payload)
        : await sentenceService.createSentence(payload);
      toast.success(`Sentence ${mode === "edit" ? "updated" : "created"}`);
      router.push(mode === "edit" ? `/sentences/lang/${saved.language}` : `/sentences/${saved._id}`);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Failed to save sentence");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleStatusAction() {
    if (!id) return;
    try {
      await sentenceService.finishSentence(id);
      toast.success("Sentence finished");
      await loadSentence(id);
    } catch {
      toast.error("Failed to finish sentence");
    }
  }

  async function handleGenerateAudio() {
    if (!id) return;
    try {
      await sentenceService.generateSentenceAudio(id);
      toast.success("Audio generated");
      await loadSentence(id);
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
            <h1 className="text-3xl font-semibold tracking-tight">{mode === "edit" ? "Edit Sentence" : "New Sentence"}</h1>
            {mode === "edit" && sentence.status ? <Badge className={workflowStatusBadgeClass(sentence.status)}>{sentence.status}</Badge> : null}
          </div>
        </div>
        {mode === "edit" && id ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleGenerateAudio}><Volume2 className="mr-2 h-4 w-4" />Generate Audio</Button>
            {sentence.status === "finished" ? <Button variant="outline" onClick={handleStatusAction}><CheckCircle className="mr-2 h-4 w-4" />Finish</Button> : null}
          </div>
        ) : null}
      </div>

      <Card className="max-w-4xl">
        <CardHeader>
          <CardTitle>Sentence Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Language</Label>
                <Select value={sentence.language} onValueChange={(value) => setSentence((current) => ({ ...current, language: value as Language, lessonIds: [], components: [] }))} disabled={mode === "edit"}>
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
                <Select value={String(sentence.difficulty || 1)} onValueChange={(value) => setSentence((current) => ({ ...current, difficulty: Number(value) }))}>
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
                  {lessons.filter((lesson) => !sentence.language || lesson.language === sentence.language).map((lesson) => (
                    <label key={lesson._id} className="flex items-center gap-2 text-sm">
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

            <div className="space-y-2">
              <Label>Sentence Text</Label>
              <Input value={sentence.text || ""} onChange={(event) => setSentence((current) => ({ ...current, text: event.target.value }))} required />
            </div>
            <div className="space-y-2">
              <Label>Translations</Label>
              <Textarea value={translationsText} onChange={(event) => setTranslationsText(event.target.value)} rows={4} required />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
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

            <div className="space-y-3 rounded-md border p-4">
              <div className="flex items-center justify-between">
                <Label>Sentence Components</Label>
                <Button type="button" variant="outline" onClick={addComponentRow}><Plus className="mr-2 h-4 w-4" />Add Component</Button>
              </div>
              {(sentence.components || []).length === 0 ? <p className="text-sm text-muted-foreground">Add at least one word or expression.</p> : null}
              {(sentence.components || []).map((component, index) => (
                <div key={`${component.type}-${component.refId}-${index}`} className="grid gap-3 rounded-md border p-3 md:grid-cols-[180px,1fr,auto]">
                  <Select value={component.type} onValueChange={(value) => setComponentRow(index, { type: value as "word" | "expression", refId: "" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="word">Word</SelectItem>
                      <SelectItem value="expression">Expression</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={component.refId} onValueChange={(value) => setComponentRow(index, { refId: value })}>
                    <SelectTrigger><SelectValue placeholder="Select content" /></SelectTrigger>
                    <SelectContent>
                      {componentOptions.filter((option) => option.type === component.type).map((option) => (
                        <SelectItem key={option.id} value={option.id}>{option.text}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" size="icon" onClick={() => removeComponentRow(index)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label>Audio Upload</Label>
              <Input type="file" accept="audio/*" onChange={(event) => setAudioFile(event.target.files?.[0] || null)} />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={isSaving}>
                <Save className="mr-2 h-4 w-4" />
                {isSaving ? "Saving..." : mode === "edit" ? "Save Changes" : "Create Sentence"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function NewSentencePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SentenceFormContent mode="new" />
    </Suspense>
  );
}
