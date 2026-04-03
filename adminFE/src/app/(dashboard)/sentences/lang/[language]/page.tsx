'use client'

import { Suspense, use, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { aiService, lessonService, sentenceService } from "@/services";
import { Language, Lesson, Level, Sentence, Status } from "@/types";
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
import { ArrowLeft, BookOpen, CheckCircle, Edit, Plus, Sparkles, Trash, Volume2 } from "lucide-react";
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
import { DataTableControls } from "@/components/common/data-table-controls";
import { workflowStatusBadgeClass } from "@/lib/status-badge";
import { TABLE_ACTION_ICON_CLASS, TABLE_BULK_BUTTON_CLASS } from "@/lib/tableActionStyles";

const LANGUAGE_LABELS: Record<Language, string> = {
  yoruba: "Yoruba",
  igbo: "Igbo",
  hausa: "Hausa"
};

function isLanguage(value: string): value is Language {
  return value === "yoruba" || value === "igbo" || value === "hausa";
}

function SentencesByLanguageContent({ params }: { params: Promise<{ language: string }> }) {
  const { language: languageParam } = use(params);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const lessonIdParam = searchParams.get("lessonId");
  const isValidLanguageParam = isLanguage(languageParam);
  const language: Language = isValidLanguageParam ? languageParam : "yoruba";

  const [items, setItems] = useState<Sentence[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [selectedLessonId, setSelectedLessonId] = useState<string>(lessonIdParam || "all");
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [seedWords, setSeedWords] = useState("");
  const [extraInstructions, setExtraInstructions] = useState("");
  const [generationLevel, setGenerationLevel] = useState<Level>("beginner");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    void fetchLessons();
  }, [language]);

  useEffect(() => {
    void fetchItems();
  }, [selectedLessonId, language, page, search, limit, statusFilter]);

  useEffect(() => {
    const lesson = lessons.find((item) => item._id === selectedLessonId);
    if (lesson) setGenerationLevel(lesson.level);
  }, [lessons, selectedLessonId]);

  useEffect(() => {
    setPage(1);
  }, [selectedLessonId, language, search, statusFilter]);

  useEffect(() => {
    const q = searchParams.get("q") || "";
    const qPage = Number(searchParams.get("page") || "1");
    const qLimit = Number(searchParams.get("limit") || "20");
    const qStatus = searchParams.get("status");
    const lessonId = searchParams.get("lessonId") || "all";
    setSearch(q);
    setPage(Number.isInteger(qPage) && qPage > 0 ? qPage : 1);
    setLimit([10, 20, 50].includes(qLimit) ? qLimit : 20);
    if (qStatus === "draft" || qStatus === "finished" || qStatus === "published" || qStatus === "all") {
      setStatusFilter(qStatus);
    }
    setSelectedLessonId(lessonId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (selectedLessonId && selectedLessonId !== "all") params.set("lessonId", selectedLessonId);
    else params.delete("lessonId");
    if (search) params.set("q", search);
    else params.delete("q");
    if (statusFilter !== "all") params.set("status", statusFilter);
    else params.delete("status");
    params.set("page", String(page));
    params.set("limit", String(limit));
    const nextQuery = params.toString();
    if (nextQuery === searchParams.toString()) return;
    router.replace(`${pathname}?${nextQuery}`);
  }, [selectedLessonId, search, statusFilter, page, limit, pathname, router, searchParams]);

  async function fetchLessons() {
    try {
      const data = await lessonService.listLessons(undefined, language);
      setLessons(data.sort((a, b) => a.orderIndex - b.orderIndex));
      if (lessonIdParam && !data.some((lesson) => lesson._id === lessonIdParam)) setSelectedLessonId("all");
    } catch {
      toast.error("Failed to fetch lessons");
    }
  }

  async function fetchItems() {
    setIsLoading(true);
    try {
      const data = await sentenceService.listSentencesPage({
        lessonId: selectedLessonId === "all" ? undefined : selectedLessonId,
        status: statusFilter === "all" ? undefined : statusFilter,
        language,
        q: search || undefined,
        page,
        limit
      });
      setItems(data.items);
      setSelectedIds([]);
      setTotal(data.total);
      setTotalPages(data.pagination.totalPages);
    } catch {
      toast.error("Failed to fetch sentences");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this sentence?")) return;
    try {
      await sentenceService.deleteSentence(id);
      toast.success("Sentence deleted");
      void fetchItems();
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
      toast.success(`${result.deletedCount} sentence(s) deleted`);
      setSelectedIds([]);
      void fetchItems();
    } catch {
      toast.error("Failed to bulk delete sentences");
    }
  }

  async function handleBulkFinish() {
    const finishable = items.filter((item) => selectedIds.includes(item._id) && item.status === "draft").map((item) => item._id);
    if (finishable.length === 0) {
      toast.error("No selected draft sentences to finish");
      return;
    }
    try {
      await Promise.all(finishable.map((id) => sentenceService.finishSentence(id)));
      toast.success(`Finished ${finishable.length} sentence(s)`);
      setSelectedIds([]);
      void fetchItems();
    } catch {
      toast.error("Failed to bulk finish sentences");
    }
  }

  async function handleBulkPublish() {
    const publishable = items.filter((item) => selectedIds.includes(item._id) && item.status === "finished").map((item) => item._id);
    if (publishable.length === 0) {
      toast.error("No selected finished sentences to publish");
      return;
    }
    try {
      await Promise.all(publishable.map((id) => sentenceService.publishSentence(id)));
      toast.success(`Published ${publishable.length} sentence(s)`);
      setSelectedIds([]);
      void fetchItems();
    } catch {
      toast.error("Failed to bulk publish sentences");
    }
  }

  async function handleFinish(id: string) {
    try {
      await sentenceService.finishSentence(id);
      toast.success("Sentence finished");
      void fetchItems();
    } catch {
      toast.error("Failed to finish sentence");
    }
  }

  async function handlePublish(id: string) {
    try {
      await sentenceService.publishSentence(id);
      toast.success("Sentence published");
      void fetchItems();
    } catch {
      toast.error("Failed to publish sentence");
    }
  }

  async function handleGenerateAudio(id: string) {
    try {
      await sentenceService.generateSentenceAudio(id);
      toast.success("Audio generated");
      void fetchItems();
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
      void fetchItems();
    } catch {
      toast.error("Failed to generate lesson audio");
    }
  }

  async function handleGenerateAI(seedWordList?: string[], extraText?: string) {
    const lesson = lessons.find((item) => item._id === selectedLessonId);
    if (selectedLessonId !== "all" && !lesson) {
      toast.error("Lesson not found");
      return;
    }

    setIsGenerating(true);
    try {
      await aiService.generateSentences(
        selectedLessonId === "all" ? undefined : selectedLessonId,
        language,
        selectedLessonId === "all" ? generationLevel : lesson!.level,
        seedWordList,
        extraText?.trim() || undefined
      );
      toast.success("AI sentences generated successfully");
      setIsDialogOpen(false);
      setSeedWords("");
      setExtraInstructions("");
      void fetchItems();
    } catch {
      toast.error("AI generation failed");
    } finally {
      setIsGenerating(false);
    }
  }

  function handlePlayAudio(url: string) {
    const audio = new Audio(url);
    void audio.play().catch(() => {
      toast.error("Unable to play audio");
    });
  }

  if (!isValidLanguageParam) return <div>Invalid language</div>;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/sentences")}
            className="rounded-full hover:bg-secondary"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-foreground">{LANGUAGE_LABELS[language]} Sentences</h1>
            <p className="font-medium text-muted-foreground">Manage sentences for {LANGUAGE_LABELS[language]}.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={handleBulkDelete}
            disabled={selectedIds.length === 0}
            className={`${TABLE_BULK_BUTTON_CLASS.delete} font-bold`}
          >
            Delete Selected ({selectedIds.length})
          </Button>
          <Button
            variant="outline"
            onClick={handleBulkFinish}
            disabled={selectedIds.length === 0}
            className={`${TABLE_BULK_BUTTON_CLASS.finish} font-bold`}
          >
            Bulk Finish
          </Button>
          <Button
            variant="outline"
            onClick={handleBulkPublish}
            disabled={selectedIds.length === 0}
            className={`${TABLE_BULK_BUTTON_CLASS.publish} font-bold`}
          >
            Bulk Publish
          </Button>
          {selectedLessonId !== "all" && (
            <Button
              variant="outline"
              onClick={handleGenerateLessonAudio}
              className="h-11 rounded-xl border-2 font-bold transition-all hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
            >
              <Volume2 className="mr-2 h-5 w-5" />
              Generate Audio
            </Button>
          )}
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                className="h-11 rounded-xl border-2 font-bold transition-all hover:border-purple-200 hover:bg-purple-50 hover:text-purple-600"
              >
                <Sparkles className="mr-2 h-5 w-5 text-purple-600" />
                AI Generate
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-3xl border-2">
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold">Generate Sentences with AI</DialogTitle>
                <DialogDescription className="font-medium">
                  Generate into the global sentence library, or keep the current lesson filter to anchor the output.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="sentenceGenerationLevel" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Level</Label>
                  <Select value={generationLevel} onValueChange={(value) => setGenerationLevel(value as Level)} disabled={selectedLessonId !== "all"}>
                    <SelectTrigger id="sentenceGenerationLevel" className="h-12 rounded-xl border-2">
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
                  <Label htmlFor="seedWords" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Seed Words / Topics</Label>
                  <Input
                    id="seedWords"
                    placeholder="e.g. greetings, family, classroom"
                    value={seedWords}
                    onChange={(event) => setSeedWords(event.target.value)}
                    className="h-12 rounded-xl border-2"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="extraInstructions" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Extra Description (Optional)</Label>
                  <Input
                    id="extraInstructions"
                    placeholder='e.g. "Keep them short and conversational"'
                    value={extraInstructions}
                    onChange={(event) => setExtraInstructions(event.target.value)}
                    className="h-12 rounded-xl border-2"
                  />
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="ghost" onClick={() => setIsDialogOpen(false)} className="rounded-xl font-bold">
                  Cancel
                </Button>
                <Button
                  className="rounded-xl px-8 font-bold shadow-lg shadow-primary/20"
                  onClick={() =>
                    handleGenerateAI(
                      seedWords
                        ? seedWords.split(",").map((item) => item.trim()).filter(Boolean)
                        : undefined,
                      extraInstructions
                    )
                  }
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Generating...
                    </div>
                  ) : "Generate Now"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button
            className="h-11 rounded-xl px-6 font-bold shadow-lg shadow-primary/20 transition-all hover:scale-[1.02]"
            onClick={() =>
              router.push(
                `/sentences/new?language=${language}${selectedLessonId !== "all" ? `&lessonId=${selectedLessonId}` : ""}`
              )
            }
          >
            <Plus className="mr-2 h-5 w-5" />
            New Sentence
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-3xl border-2 border-primary/10 bg-card p-6 shadow-sm md:flex-row md:items-center">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <BookOpen className="h-5 w-5" />
          </div>
          <span className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Filter by Lesson:</span>
        </div>
        <Select value={selectedLessonId} onValueChange={setSelectedLessonId}>
          <SelectTrigger className="h-12 w-full rounded-xl border-2 font-bold md:w-[320px]">
            <SelectValue placeholder="All Lessons" />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="all" className="font-medium">All Lessons</SelectItem>
            {lessons.map((lesson) => (
              <SelectItem key={lesson._id} value={lesson._id} className="font-medium">
                Lesson {lesson.orderIndex + 1}: {lesson.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Status:</span>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | Status)}>
            <SelectTrigger className="h-12 w-[220px] rounded-xl border-2 font-bold">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all" className="font-medium">All statuses</SelectItem>
              <SelectItem value="draft" className="font-medium">Draft</SelectItem>
              <SelectItem value="finished" className="font-medium">Finished</SelectItem>
              <SelectItem value="published" className="font-medium">Published</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border-2 border-primary/10 bg-card shadow-xl">
        <div className="px-6 pt-6">
          <DataTableControls
            search={search}
            onSearchChange={setSearch}
            page={page}
            limit={limit}
            onLimitChange={(value) => {
              setLimit(value);
              setPage(1);
            }}
            totalPages={totalPages}
            total={total}
            label="Search sentences"
            onPrev={() => setPage((prev) => Math.max(1, prev - 1))}
            onNext={() => setPage((prev) => Math.min(totalPages, prev + 1))}
          />
        </div>
        <Table>
          <TableHeader className="bg-primary/5">
            <TableRow>
              <TableHead className="w-12">
                <input
                  type="checkbox"
                  checked={items.length > 0 && selectedIds.length === items.length}
                  onChange={(event) => setSelectedIds(event.target.checked ? items.map((item) => item._id) : [])}
                />
              </TableHead>
              <TableHead className="pl-8 font-bold text-primary">Text</TableHead>
              <TableHead className="font-bold text-primary">Translation</TableHead>
              <TableHead className="font-bold text-primary">Difficulty</TableHead>
              <TableHead className="font-bold text-primary">Status</TableHead>
              <TableHead className="font-bold text-primary">AI</TableHead>
              <TableHead className="font-bold text-primary">Created At</TableHead>
              <TableHead className="font-bold text-primary">Updated At</TableHead>
              <TableHead className="pr-8 text-right font-bold text-primary">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="h-48 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2 font-medium">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                    Loading sentences...
                  </div>
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-48 text-center font-medium text-muted-foreground">
                  No sentences found.
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item._id} className="group transition-colors hover:bg-secondary/30">
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(item._id)}
                      onChange={(event) =>
                        setSelectedIds((prev) =>
                          event.target.checked ? Array.from(new Set([...prev, item._id])) : prev.filter((id) => id !== item._id)
                        )
                      }
                    />
                  </TableCell>
                  <TableCell className="pl-8 text-lg font-bold text-foreground">{item.text}</TableCell>
                  <TableCell className="font-medium italic text-muted-foreground">{item.translations.join(" | ")}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <span className="font-black text-primary">{item.difficulty}</span>
                      <span className="text-xs font-bold uppercase text-muted-foreground">/ 5</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={workflowStatusBadgeClass(item.status)}>{item.status}</Badge>
                  </TableCell>
                  <TableCell>
                    {item.aiMeta?.generatedByAI ? (
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100 text-purple-600 shadow-sm" title="AI Generated">
                        <Sparkles className="h-4 w-4" />
                      </div>
                    ) : (
                      <span className="text-zinc-300">-</span>
                    )}
                  </TableCell>
                  <TableCell className="font-medium text-muted-foreground">{new Date(item.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell className="font-medium text-muted-foreground">{new Date(item.updatedAt).toLocaleDateString()}</TableCell>
                  <TableCell className="pr-8 text-right">
                    <div className="flex justify-end gap-1">
                      {item.audio?.url && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handlePlayAudio(item.audio.url)}
                          title="Play audio"
                          className={TABLE_ACTION_ICON_CLASS.play}
                        >
                          <Volume2 className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.push(`/sentences/${item._id}`)}
                        title="Edit"
                        className={TABLE_ACTION_ICON_CLASS.edit}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      {item.status === "draft" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleFinish(item._id)}
                          title="Mark as finished"
                          className={TABLE_ACTION_ICON_CLASS.finish}
                        >
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                      )}
                      {item.status === "finished" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handlePublish(item._id)}
                          title="Publish"
                          className={TABLE_ACTION_ICON_CLASS.publish}
                        >
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(item._id)}
                        title="Delete"
                        className={TABLE_ACTION_ICON_CLASS.delete}
                      >
                        <Trash className="h-4 w-4" />
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

export default function SentencesByLanguagePage({ params }: { params: Promise<{ language: string }> }) {
  return (
    <Suspense fallback={<div>Loading sentences...</div>}>
      <SentencesByLanguageContent params={params} />
    </Suspense>
  );
}
