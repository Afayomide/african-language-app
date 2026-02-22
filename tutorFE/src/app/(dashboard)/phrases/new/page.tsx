'use client'

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { aiService, phraseService, lessonService } from "@/services";
import { Lesson, Language } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowLeft, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";

function NewPhraseContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lessonIdParam = searchParams.get("lessonId");
  const languageParam = searchParams.get("language");
  const selectedLanguage: Language | undefined =
    languageParam === "yoruba" || languageParam === "igbo" || languageParam === "hausa"
      ? languageParam
      : undefined;

  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [formData, setFormData] = useState({
    text: "",
    translation: "",
    pronunciation: "",
    explanation: "",
    difficulty: 1
  });
  const [selectedLessonIds, setSelectedLessonIds] = useState<string[]>(
    lessonIdParam ? [lessonIdParam] : []
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [seedWords, setSeedWords] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);

  useEffect(() => {
    fetchLessons();
  }, []);

  async function fetchLessons() {
    try {
      const data = await lessonService.listLessons();
      const filtered = selectedLanguage ? data.filter((lesson) => lesson.language === selectedLanguage) : data;
      setLessons(filtered);
    } catch {
      toast.error("Failed to fetch lessons");
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedLessonIds.length === 0) {
      toast.error("Please select at least one lesson");
      return;
    }

    setIsLoading(true);
    try {
      const languageForPhrase =
        selectedLanguage ||
        lessons.find((item) => item._id === selectedLessonIds[0])?.language;
      if (!languageForPhrase) {
        toast.error("Select a lesson or open this page from a language context");
        setIsLoading(false);
        return;
      }
      const audioUpload = audioFile
        ? {
            base64: await fileToBase64(audioFile),
            mimeType: audioFile.type || undefined,
            fileName: audioFile.name
          }
        : undefined;
      await phraseService.createPhrase({
        ...formData,
        lessonIds: selectedLessonIds,
        language: languageForPhrase,
        audioUpload
      });
      toast.success("Phrase created");
      const lesson = lessons.find((item) => item._id === selectedLessonIds[0]);
      if (lesson) {
        router.push(`/phrases/lang/${lesson.language}?lessonId=${selectedLessonIds[0]}`);
      } else {
        router.push("/phrases");
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || "Failed to create phrase");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateAI = async () => {
    if (selectedLessonIds.length === 0) {
      toast.error("Please select a lesson first");
      return;
    }
    setIsGenerating(true);
    try {
      await aiService.generatePhrases(
        selectedLessonIds[0],
        seedWords ? seedWords.split(",").map((s) => s.trim()).filter(Boolean) : undefined
      );
      toast.success("AI phrases generated");
      setIsDialogOpen(false);
      setSeedWords("");
      const lesson = lessons.find((item) => item._id === selectedLessonIds[0]);
      if (lesson) {
        router.push(`/phrases/lang/${lesson.language}?lessonId=${lesson._id}`);
      }
    } catch {
      toast.error("AI generation failed");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-3xl font-bold">New Phrase</h1>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <Sparkles className="mr-2 h-4 w-4 text-purple-600" />
              Generate with AI
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Generate Phrases with AI</DialogTitle>
              <DialogDescription>
                Provide seed words to guide generation, or leave blank for general phrases.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-4">
              <Label htmlFor="seedWords">Seed Words / Topics</Label>
              <Input
                id="seedWords"
                placeholder="e.g. greetings, market, family"
                value={seedWords}
                onChange={(e) => setSeedWords(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleGenerateAI} disabled={isGenerating}>
                {isGenerating ? "Generating..." : "Generate"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Phrase Details</CardTitle>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="lesson">Lesson</Label>
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3">
                {lessons.map((lesson) => (
                  <label key={lesson._id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedLessonIds.includes(lesson._id)}
                      onChange={(e) =>
                        setSelectedLessonIds((prev) =>
                          e.target.checked
                            ? Array.from(new Set([...prev, lesson._id]))
                            : prev.filter((id) => id !== lesson._id)
                        )
                      }
                    />
                    <span>
                      {lesson.orderIndex + 1}. {lesson.title} ({lesson.language})
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="text">Text (Original)</Label>
              <Input
                id="text"
                value={formData.text}
                onChange={(e) => setFormData({ ...formData, text: e.target.value })}
                placeholder="Enter the phrase in the target language"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="translation">Translation</Label>
              <Input
                id="translation"
                value={formData.translation}
                onChange={(e) => setFormData({ ...formData, translation: e.target.value })}
                placeholder="Enter the English translation"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pronunciation">Pronunciation (Optional)</Label>
                <Input
                  id="pronunciation"
                  value={formData.pronunciation}
                  onChange={(e) => setFormData({ ...formData, pronunciation: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="difficulty">Difficulty (1-5)</Label>
                <Select value={String(formData.difficulty)} onValueChange={(v) => setFormData({ ...formData, difficulty: Number(v) })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select difficulty" />
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
              <Label htmlFor="explanation">Explanation (Optional)</Label>
              <Textarea
                id="explanation"
                value={formData.explanation}
                onChange={(e) => setFormData({ ...formData, explanation: e.target.value })}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="audioUpload">Upload Audio Recording (Optional)</Label>
              <Input
                id="audioUpload"
                type="file"
                accept="audio/*"
                onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
              />
            </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Creating..." : "Create Phrase"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

export default function NewPhrasePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <NewPhraseContent />
    </Suspense>
  );
}
