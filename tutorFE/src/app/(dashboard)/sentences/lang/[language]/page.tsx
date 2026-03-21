
'use client'

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { aiService, lessonService, sentenceService } from "@/services";
import type { Sentence, Lesson, Language, Level, Status } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Volume2, CheckCircle, ScrollText, Sparkles } from "lucide-react";
import { workflowStatusBadgeClass } from "@/lib/status-badge";

function isLanguage(value: string): value is Language {
  return value === "yoruba" || value === "igbo" || value === "hausa";
}

export default function SentencesByLanguagePage({ params }: { params: Promise<{ language: string }> }) {
  const { language: rawLanguage } = use(params);
  const language: Language = isLanguage(rawLanguage) ? rawLanguage : "yoruba";
  const router = useRouter();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<Sentence[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [selectedLessonId, setSelectedLessonId] = useState(searchParams.get("lessonId") || "all");
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [seedWords, setSeedWords] = useState("");
  const [extraInstructions, setExtraInstructions] = useState("");
  const [generationLevel, setGenerationLevel] = useState<Level>("beginner");

  useEffect(() => {
    void loadLessons();
  }, [language]);

  useEffect(() => {
    void loadItems();
  }, [language, selectedLessonId, statusFilter, search]);

  useEffect(() => {
    const lesson = lessons.find((item) => item._id === selectedLessonId);
    if (lesson) {
      setGenerationLevel(lesson.level);
    }
  }, [lessons, selectedLessonId]);

  async function loadLessons() {
    try {
      const data = await lessonService.listLessons();
      setLessons(data.filter((lesson) => lesson.language === language).sort((a, b) => a.orderIndex - b.orderIndex));
    } catch {
      toast.error("Failed to load lessons");
    }
  }

  async function loadItems() {
    setIsLoading(true);
    try {
      const result = await sentenceService.listSentencesPage({ lessonId: selectedLessonId === "all" ? undefined : selectedLessonId, status: statusFilter === "all" ? undefined : statusFilter, q: search || undefined });
      setItems(result.items);
      setSelectedIds([]);
    } catch {
      toast.error("Failed to load sentences");
    } finally {
      setIsLoading(false);
    }
  }

  const allSelected = useMemo(() => items.length > 0 && selectedIds.length === items.length, [items.length, selectedIds.length]);

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this item?")) return;
    try {
      await sentenceService.deleteSentence(id);
      toast.success("Sentence deleted");
      await loadItems();
    } catch {
      toast.error("Failed to delete sentence");
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.length === 0) {
      toast.error("Select at least one sentence");
      return;
    }
    try {
      const result = await sentenceService.bulkDeleteSentences(selectedIds);
      toast.success(`${result.deletedCount} sentences deleted`);
      await loadItems();
    } catch {
      toast.error("Failed to delete selected sentences");
    }
  }

  async function handleStatusAction(id: string) {
    try {
      await sentenceService.finishSentence(id);
      toast.success("Sentence finished");
      await loadItems();
    } catch {
      toast.error("Failed to finish sentence");
    }
  }

  async function handleGenerateAudio(id: string) {
    try {
      await sentenceService.generateSentenceAudio(id);
      toast.success("Audio generated");
      await loadItems();
    } catch {
      toast.error("Failed to generate audio");
    }
  }

  async function handleGenerateLessonAudio() {
    if (selectedLessonId === "all") {
      toast.error("Select a lesson first");
      return;
    }
    try {
      const result = await sentenceService.generateLessonSentenceAudio(selectedLessonId);
      toast.success(`Audio generated for ${result.updatedCount} sentences`);
      await loadItems();
    } catch {
      toast.error("Failed to generate lesson audio");
    }
  }

  async function handleGenerateAI() {
    setIsGenerating(true);
    try {
      await aiService.generateSentences(
        selectedLessonId === "all" ? undefined : selectedLessonId,
        selectedLessonId === "all" ? generationLevel : lessons.find((item) => item._id === selectedLessonId)?.level || generationLevel,
        seedWords
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        extraInstructions.trim() || undefined
      );
      toast.success("AI sentences generated successfully");
      setIsDialogOpen(false);
      setSeedWords("");
      setExtraInstructions("");
      await loadItems();
    } catch {
      toast.error("AI generation failed");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/sentences')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Sentences - {language.charAt(0).toUpperCase() + language.slice(1)}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Manage sentences and their lesson assignments.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleGenerateLessonAudio}>
            <Volume2 className="mr-2 h-4 w-4" />
            Lesson Audio
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Sparkles className="mr-2 h-4 w-4" />
                Generate with AI
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Generate Sentences with AI</DialogTitle>
                <DialogDescription>
                  Generate into the global sentence library, or keep the current lesson filter to anchor the output.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="sentenceGenerationLevel">Level</Label>
                  <Select
                    value={generationLevel}
                    onValueChange={(value) => setGenerationLevel(value as Level)}
                    disabled={selectedLessonId !== "all"}
                  >
                    <SelectTrigger id="sentenceGenerationLevel">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="beginner">Beginner</SelectItem>
                      <SelectItem value="intermediate">Intermediate</SelectItem>
                      <SelectItem value="advanced">Advanced</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sentenceSeedWords">Seed Words / Topics</Label>
                  <Input
                    id="sentenceSeedWords"
                    placeholder="e.g. greetings, family, classroom"
                    value={seedWords}
                    onChange={(event) => setSeedWords(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sentenceExtraInstructions">Extra Description (Optional)</Label>
                  <Input
                    id="sentenceExtraInstructions"
                    placeholder='e.g. "Keep them short and conversational"'
                    value={extraInstructions}
                    onChange={(event) => setExtraInstructions(event.target.value)}
                  />
                </div>
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
          <Button asChild>
            <Link href={`/sentences/new?language=${language}${selectedLessonId !== 'all' ? `&lessonId=${selectedLessonId}` : ''}`}>
              <Plus className="mr-2 h-4 w-4" />
              New Sentence
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search text, translation, notes" />
        <Select value={selectedLessonId} onValueChange={setSelectedLessonId}>
          <SelectTrigger><SelectValue placeholder="All lessons" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All lessons</SelectItem>
            {lessons.map((lesson) => (
              <SelectItem key={lesson._id} value={lesson._id}>{lesson.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | Status)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="finished">Finished</SelectItem>
            <SelectItem value="published">Published</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={handleBulkDelete} disabled={selectedIds.length === 0}>
          <Trash2 className="mr-2 h-4 w-4" />
          Delete Selected
        </Button>
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(event) => setSelectedIds(event.target.checked ? items.map((item) => item._id) : [])}
                />
              </TableHead>
              <TableHead>Sentence</TableHead>
              <TableHead>Translations</TableHead>
              <TableHead>Lessons</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6}>Loading...</TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={6}>No sentences found.</TableCell></TableRow>
            ) : items.map((item) => (
              <TableRow key={item._id}>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(item._id)}
                    onChange={(event) => setSelectedIds((current) => event.target.checked ? Array.from(new Set([...current, item._id])) : current.filter((entry) => entry !== item._id))}
                  />
                </TableCell>
                <TableCell>
                  <div className="font-medium">{item.text}</div>
                  {item.components?.length ? <div className="text-xs text-muted-foreground">{item.components.length} components</div> : null}
                </TableCell>
                <TableCell className="max-w-xs whitespace-normal text-sm text-muted-foreground">{item.translations.join(", ")}</TableCell>
                <TableCell>{item.lessonIds.length}</TableCell>
                <TableCell><Badge className={workflowStatusBadgeClass(item.status)}>{item.status}</Badge></TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="icon" asChild>
                      <Link href={`/sentences/${item._id}`}><ScrollText className="h-4 w-4" /></Link>
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => handleGenerateAudio(item._id)}>
                      <Volume2 className="h-4 w-4" />
                    </Button>
                    {item.status === "finished" ? <Button variant="outline" size="icon" onClick={() => handleStatusAction(item._id)}><CheckCircle className="h-4 w-4" /></Button> : null}
                    <Button variant="outline" size="icon" onClick={() => handleDelete(item._id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
