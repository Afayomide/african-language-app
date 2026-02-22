'use client'

import { useEffect, useState, Suspense, use } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { aiService, phraseService, lessonService } from "@/services";
import { Phrase, Lesson, Language } from "@/types";
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
import { Plus, Edit, Trash, ArrowLeft, Volume2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const LANGUAGE_LABELS: Record<Language, string> = {
  yoruba: "Yoruba",
  igbo: "Igbo",
  hausa: "Hausa"
};

function isLanguage(value: string): value is Language {
  return value === "yoruba" || value === "igbo" || value === "hausa";
}

function PhrasesByLanguageContent({ params }: { params: Promise<{ language: string }> }) {
  const { language: languageParam } = use(params);
  const searchParams = useSearchParams();
  const router = useRouter();
  const lessonIdParam = searchParams.get("lessonId");

  const isValidLanguageParam = isLanguage(languageParam);
  const language: Language = isValidLanguageParam ? (languageParam as Language) : "yoruba";
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [selectedLessonId, setSelectedLessonId] = useState<string>(lessonIdParam || "all");
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [seedWords, setSeedWords] = useState("");

  useEffect(() => {
    if (!isValidLanguageParam) return;
    fetchLessons();
  }, [isValidLanguageParam]);

  useEffect(() => {
    if (!isValidLanguageParam) return;
    fetchPhrases();
  }, [selectedLessonId, isValidLanguageParam]);

  async function fetchLessons() {
    try {
      const data = await lessonService.listLessons();
      setLessons(data.sort((a, b) => a.orderIndex - b.orderIndex));
    } catch {
      toast.error("Failed to fetch lessons");
    }
  }

  async function fetchPhrases() {
    setIsLoading(true);
    try {
      const data = await phraseService.listPhrases(selectedLessonId === "all" ? undefined : selectedLessonId);
      setPhrases(data);
    } catch {
      toast.error("Failed to fetch phrases");
    } finally {
      setIsLoading(false);
    }
  }

  if (!isValidLanguageParam) {
    return <div>Invalid language</div>;
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this phrase?")) return;
    try {
      await phraseService.deletePhrase(id);
      toast.success("Phrase deleted");
      fetchPhrases();
    } catch {
      toast.error("Failed to delete phrase");
    }
  }

  async function handleGeneratePhraseAudio(id: string) {
    try {
      await phraseService.generatePhraseAudio(id);
      toast.success("Phrase audio generated");
      fetchPhrases();
    } catch {
      toast.error("Failed to generate phrase audio");
    }
  }

  async function handleGenerateLessonAudio() {
    if (selectedLessonId === "all") {
      toast.error("Select a lesson first");
      return;
    }

    try {
      const result = await phraseService.generateLessonPhraseAudio(selectedLessonId);
      toast.success(`Audio generated for ${result.updatedCount} phrases`);
      fetchPhrases();
    } catch {
      toast.error("Failed to generate lesson audio");
    }
  }

  async function handleGenerateAI(seedWordsList?: string[]) {
    if (selectedLessonId === "all") {
      toast.error("Please select a lesson first");
      return;
    }

    setIsGenerating(true);
    try {
      await aiService.generatePhrases(selectedLessonId, seedWordsList);
      toast.success("AI phrases generated successfully");
      fetchPhrases();
      setIsDialogOpen(false);
      setSeedWords("");
    } catch {
      toast.error("AI generation failed");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/phrases")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-3xl font-bold">{LANGUAGE_LABELS[language]} Phrases</h1>
        </div>
        <div className="flex gap-2">
          {selectedLessonId !== "all" && (
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
                    Enter keywords/topics (comma separated), or leave blank for general phrases.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="seedWords">Seed Words / Topics</Label>
                    <Input
                      id="seedWords"
                      placeholder="e.g. food, market, greetings"
                      value={seedWords}
                      onChange={(e) => setSeedWords(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() =>
                      handleGenerateAI(
                        seedWords
                          ? seedWords
                              .split(",")
                              .map((item) => item.trim())
                              .filter(Boolean)
                          : undefined
                      )
                    }
                    disabled={isGenerating}
                  >
                    {isGenerating ? "Generating..." : "Generate"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          {selectedLessonId !== "all" && (
            <Button variant="outline" onClick={handleGenerateLessonAudio}>
              <Volume2 className="mr-2 h-4 w-4" />
              Generate Lesson Audio
            </Button>
          )}
          <Button asChild>
            <Link
              href={`/phrases/new?language=${language}${
                selectedLessonId !== "all" ? `&lessonId=${selectedLessonId}` : ""
              }`}
            >
              <Plus className="mr-2 h-4 w-4" />
              New Phrase
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4 rounded-md border bg-white p-4 dark:bg-zinc-950">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Filter by Lesson:</span>
          <Select value={selectedLessonId} onValueChange={setSelectedLessonId}>
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="All Lessons" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Lessons</SelectItem>
              {lessons.map((lesson) => (
                <SelectItem key={lesson._id} value={lesson._id}>
                  {lesson.orderIndex + 1}. {lesson.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-md border bg-white dark:bg-zinc-950">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Text</TableHead>
              <TableHead>Translation</TableHead>
              <TableHead>Difficulty</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created At</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  Loading...
                </TableCell>
              </TableRow>
            ) : phrases.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  No phrases found.
                </TableCell>
              </TableRow>
            ) : (
              phrases.map((phrase) => (
                <TableRow key={phrase._id}>
                  <TableCell className="font-medium">{phrase.text}</TableCell>
                  <TableCell>{phrase.translation}</TableCell>
                  <TableCell>{phrase.difficulty}/5</TableCell>
                  <TableCell>
                    <Badge variant={phrase.status === "published" ? "default" : "secondary"}>
                      {phrase.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(phrase.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleGeneratePhraseAudio(phrase._id)}
                        title="Generate audio"
                      >
                        <Volume2 className="h-4 w-4 text-blue-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.push(`/phrases/${phrase._id}`)}
                        title="Edit"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(phrase._id)}
                        title="Delete"
                      >
                        <Trash className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default function PhrasesByLanguagePage({ params }: { params: Promise<{ language: string }> }) {
  return (
    <Suspense fallback={<div>Loading phrases...</div>}>
      <PhrasesByLanguageContent params={params} />
    </Suspense>
  );
}
