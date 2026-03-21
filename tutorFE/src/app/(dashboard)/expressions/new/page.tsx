'use client'

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { aiService, expressionService, lessonService } from "@/services";
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

function NewExpressionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lessonIdParam = searchParams.get("lessonId");
  const languageParam = searchParams.get("language");
  const initialLanguage: Language | undefined =
    languageParam === "yoruba" || languageParam === "igbo" || languageParam === "hausa"
      ? languageParam
      : undefined;

  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [language, setLanguage] = useState<Language | "">(initialLanguage || "");
  const [formData, setFormData] = useState({
    text: "",
    translationsText: "",
    pronunciation: "",
    explanation: "",
    difficulty: 1
  });
  const [selectedLessonId, setSelectedLessonId] = useState(lessonIdParam || "");
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [seedWords, setSeedWords] = useState("");
  const [extraInstructions, setExtraInstructions] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);

  useEffect(() => {
    fetchLessons();
  }, [language]);

  async function fetchLessons() {
    try {
      const data = await lessonService.listLessons();
      const filtered = language ? data.filter((lesson) => lesson.language === language) : data;
      setLessons(filtered);
      if (!language && filtered[0]) setLanguage(filtered[0].language);
    } catch (error) {
      toast.error("Failed to fetch lessons")
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
    if (!language || !formData.text.trim() || !formData.translationsText.trim()) {
      toast.error("Language, text, and translations are required");
      return;
    }

    setIsLoading(true);
    try {
      const audioUpload = audioFile
        ? {
            base64: await fileToBase64(audioFile),
            mimeType: audioFile.type || undefined,
            fileName: audioFile.name
          }
        : undefined;
      const created = await expressionService.createExpression({
        text: formData.text,
        translations: formData.translationsText
          .split(/\n|,/)
          .map((item) => item.trim())
          .filter(Boolean),
        pronunciation: formData.pronunciation,
        explanation: formData.explanation,
        difficulty: formData.difficulty,
        language,
        audioUpload
      });
      toast.success("Expression created");
      router.push(`/expressions/${created._id}`);
    } catch (error: any) {
      toast.error(error.response?.data?.error || "Failed to create expression");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateAI = async () => {
    if (!selectedLessonId) {
      toast.error("Select a lesson for AI generation");
      return;
    }
    setIsGenerating(true);
    try {
      await aiService.generateExpressions(
        selectedLessonId,
        lessons.find((item) => item._id === selectedLessonId)?.level || "beginner",
        seedWords ? seedWords.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        extraInstructions.trim() || undefined
      );
      toast.success("AI expressions generated");
      setIsDialogOpen(false);
      setSeedWords("");
      setExtraInstructions("");
      const lesson = lessons.find((item) => item._id === selectedLessonId);
      if (lesson) {
        router.push(`/expressions/lang/${lesson.language}?lessonId=${lesson._id}`);
      }
    } catch (error) {
      toast.error("AI generation failed")
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
        <h1 className="text-3xl font-bold">New Expression</h1>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <Sparkles className="mr-2 h-4 w-4 text-purple-600" />
              Generate with AI
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Generate Expressions with AI</DialogTitle>
              <DialogDescription>
                Provide seed words to guide generation, or leave blank for general expressions.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-4">
              <Label htmlFor="aiLesson">Lesson</Label>
              <Select value={selectedLessonId} onValueChange={setSelectedLessonId}>
                <SelectTrigger id="aiLesson">
                  <SelectValue placeholder="Select lesson" />
                </SelectTrigger>
                <SelectContent>
                  {lessons.map((lesson) => (
                    <SelectItem key={lesson._id} value={lesson._id}>
                      {lesson.orderIndex + 1}. {lesson.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Label htmlFor="seedWords">Seed Words / Topics</Label>
              <Input
                id="seedWords"
                placeholder="e.g. greetings, market, family"
                value={seedWords}
                onChange={(e) => setSeedWords(e.target.value)}
              />
              <Label htmlFor="extraInstructions">Extra Description (Optional)</Label>
              <Textarea
                id="extraInstructions"
                placeholder='e.g. "Only single words for this lesson"'
                value={extraInstructions}
                onChange={(e) => setExtraInstructions(e.target.value)}
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
          <CardTitle>Expression Details</CardTitle>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="language">Language</Label>
              <Select value={language} onValueChange={(value) => { setLanguage(value as Language); setSelectedLessonId(""); }}>
                <SelectTrigger id="language">
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yoruba">Yoruba</SelectItem>
                  <SelectItem value="igbo">Igbo</SelectItem>
                  <SelectItem value="hausa">Hausa</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              This expression will be created without lesson assignment. Attach it from the edit page when you are ready.
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
              <Label htmlFor="translationsText">Translations</Label>
              <Textarea
                id="translationsText"
                value={formData.translationsText}
                onChange={(e) => setFormData({ ...formData, translationsText: e.target.value })}
                placeholder="Enter one translation per line"
                required
                rows={4}
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
              {isLoading ? "Creating..." : "Create Expression"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

export default function NewExpressionPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <NewExpressionContent />
    </Suspense>
  );
}
