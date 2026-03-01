'use client'

import { useEffect, useState, Suspense, use } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { phraseService, lessonService, aiService } from "@/services";
import { Phrase, Lesson, Language, Status } from "@/types";
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
import { Plus, Edit, Trash, Sparkles, CheckCircle, ArrowLeft, Volume2, BookOpen } from "lucide-react";
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

const LANGUAGE_LABELS: Record<Language, string> = {
  yoruba: "Yoruba",
  igbo: "Igbo",
  hausa: "Hausa"
};

function isLanguage(value: string): value is Language {
  return value === "yoruba" || value === "igbo" || value === "hausa";
}

function PhrasesByLanguageContent({
  params
}: {
  params: Promise<{ language: string }>;
}) {
  const { language: languageParam } = use(params);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
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
  const [extraInstructions, setExtraInstructions] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [selectedPhraseIds, setSelectedPhraseIds] = useState<string[]>([]);

  useEffect(() => {
    fetchLessons();
  }, [language]);

  useEffect(() => {
    fetchPhrases();
  }, [selectedLessonId, language, page, search, limit, statusFilter]);

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
      if (lessonIdParam && !data.some((lesson) => lesson._id === lessonIdParam)) {
        setSelectedLessonId("all");
      }
    } catch {
      toast.error("Failed to fetch lessons");
    }
  }

  async function fetchPhrases() {
    setIsLoading(true);
    try {
      const data = await phraseService.listPhrasesPage({
        lessonId: selectedLessonId === "all" ? undefined : selectedLessonId,
        status: statusFilter === "all" ? undefined : statusFilter,
        language,
        q: search || undefined,
        page,
        limit
      });
      setPhrases(data.items);
      setSelectedPhraseIds([]);
      setTotal(data.total);
      setTotalPages(data.pagination.totalPages);
    } catch {
      toast.error("Failed to fetch phrases");
    } finally {
      setIsLoading(false);
    }
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

  async function handleBulkDeletePhrases() {
    if (selectedPhraseIds.length === 0) {
      toast.error("Select at least one phrase");
      return;
    }
    try {
      const result = await phraseService.bulkDeletePhrases(selectedPhraseIds);
      toast.success(`${result.deletedCount} phrase(s) deleted`);
      setSelectedPhraseIds([]);
      fetchPhrases();
    } catch {
      toast.error("Failed to bulk delete phrases");
    }
  }

  async function handlePublish(id: string) {
    try {
      await phraseService.publishPhrase(id);
      toast.success("Phrase published");
      fetchPhrases();
    } catch {
      toast.error("Failed to publish phrase");
    }
  }

  function handlePlayAudio(url: string) {
    const audio = new Audio(url);
    void audio.play().catch(() => {
      toast.error("Unable to play audio");
    });
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

  async function handleGenerateAI(seedWordsList?: string[], extraText?: string) {
    if (selectedLessonId === "all") {
      toast.error("Select a lesson first");
      return;
    }

    setIsGenerating(true);
    try {
      const lesson = lessons.find((item) => item._id === selectedLessonId);
      if (!lesson) {
        toast.error("Lesson not found");
        setIsGenerating(false);
        return;
      }
      await aiService.generatePhrases(
        selectedLessonId,
        lesson.language,
        lesson.level,
        seedWordsList,
        extraText?.trim() || undefined
      );
      toast.success("AI phrases generated successfully");
      fetchPhrases();
      setIsDialogOpen(false);
      setSeedWords("");
      setExtraInstructions("");
    } catch {
      toast.error("AI generation failed");
    } finally {
      setIsGenerating(false);
    }
  }

  if (!isValidLanguageParam) {
    return <div>Invalid language</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => router.push("/phrases")}
            className="rounded-full hover:bg-secondary"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-foreground">{LANGUAGE_LABELS[language]} Phrases</h1>
            <p className="text-muted-foreground font-medium">Manage vocabulary and phrases for {LANGUAGE_LABELS[language]}.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="destructive"
            onClick={handleBulkDeletePhrases}
            disabled={selectedPhraseIds.length === 0}
            className="h-11 rounded-xl font-bold"
          >
            Delete Selected ({selectedPhraseIds.length})
          </Button>
          {selectedLessonId !== "all" && (
            <Button 
              variant="outline" 
              onClick={handleGenerateLessonAudio}
              className="h-11 rounded-xl border-2 font-bold hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all"
            >
              <Volume2 className="mr-2 h-5 w-5" />
              Generate Audio
            </Button>
          )}
          {selectedLessonId !== "all" && (
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="h-11 rounded-xl border-2 font-bold hover:bg-purple-50 hover:text-purple-600 hover:border-purple-200 transition-all"
                >
                  <Sparkles className="mr-2 h-5 w-5 text-purple-600" />
                  AI Generate
                </Button>
              </DialogTrigger>
            <DialogContent className="rounded-3xl border-2">
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold">Generate Phrases with AI</DialogTitle>
                <DialogDescription className="font-medium">
                  Enter keywords/topics to guide generation, or leave blank for general phrases.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="seedWords" className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Seed Words / Topics</Label>
                  <Input
                    id="seedWords"
                    placeholder="e.g. food, market, greetings"
                    value={seedWords}
                    onChange={(e) => setSeedWords(e.target.value)}
                    className="h-12 border-2 rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="extraInstructions" className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Extra Description (Optional)</Label>
                  <Input
                    id="extraInstructions"
                    placeholder='e.g. "Generate only short single words"'
                    value={extraInstructions}
                    onChange={(e) => setExtraInstructions(e.target.value)}
                    className="h-12 border-2 rounded-xl"
                  />
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="ghost" onClick={() => setIsDialogOpen(false)} className="rounded-xl font-bold">
                  Cancel
                </Button>
                <Button
                  className="rounded-xl font-bold px-8 shadow-lg shadow-primary/20"
                  onClick={() =>
                    handleGenerateAI(
                      seedWords
                        ? seedWords
                            .split(",")
                            .map((item) => item.trim())
                            .filter(Boolean)
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
          )}
          <Button
            className="h-11 rounded-xl font-bold shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] px-6"
            onClick={() =>
              router.push(
                `/phrases/new?language=${language}${
                  selectedLessonId !== "all" ? `&lessonId=${selectedLessonId}` : ""
                }`
              )
            }
          >
            <Plus className="mr-2 h-5 w-5" />
            New Phrase
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
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | Status)}>
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
            label="Search phrases"
            onPrev={() => setPage((prev) => Math.max(1, prev - 1))}
            onNext={() => setPage((prev) => Math.min(totalPages, prev + 1))}
          />
        </div>
        <Table>
          <TableHeader className="bg-primary/5">
            <TableRow>
              <TableHead className="w-12" />
              <TableHead className="font-bold text-primary pl-8">Text</TableHead>
              <TableHead className="font-bold text-primary">Translation</TableHead>
              <TableHead className="font-bold text-primary">Difficulty</TableHead>
              <TableHead className="font-bold text-primary">Status</TableHead>
              <TableHead className="font-bold text-primary">AI</TableHead>
              <TableHead className="font-bold text-primary">Created At</TableHead>
              <TableHead className="text-right font-bold text-primary pr-8">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-48 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2 font-medium">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                    Loading phrases...
                  </div>
                </TableCell>
              </TableRow>
            ) : phrases.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-48 text-center text-muted-foreground font-medium">
                  No phrases found.
                </TableCell>
              </TableRow>
            ) : (
              phrases.map((phrase) => (
                <TableRow key={phrase._id} className="group transition-colors hover:bg-secondary/30">
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selectedPhraseIds.includes(phrase._id)}
                      onChange={(event) =>
                        setSelectedPhraseIds((prev) =>
                          event.target.checked
                            ? Array.from(new Set([...prev, phrase._id]))
                            : prev.filter((id) => id !== phrase._id)
                        )
                      }
                    />
                  </TableCell>
                  <TableCell className="pl-8 font-bold text-foreground text-lg">{phrase.text}</TableCell>
                  <TableCell className="font-medium text-muted-foreground italic">{phrase.translation}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <span className="font-black text-primary">{phrase.difficulty}</span>
                      <span className="text-xs font-bold text-muted-foreground uppercase">/ 5</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={workflowStatusBadgeClass(phrase.status)}>
                      {phrase.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {phrase.aiMeta?.generatedByAI ? (
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100 text-purple-600 shadow-sm" title="AI Generated">
                        <Sparkles className="h-4 w-4" />
                      </div>
                    ) : (
                      <span className="text-zinc-300">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground font-medium">
                    {new Date(phrase.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right pr-8">
                    <div className="flex justify-end gap-1">
                      {phrase.audio?.url && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handlePlayAudio(phrase.audio.url)}
                          title="Play audio"
                          className="rounded-full hover:bg-blue-100 hover:text-blue-600 transition-colors"
                        >
                          <Volume2 className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.push(`/phrases/${phrase._id}`)}
                        title="Edit"
                        className="rounded-full hover:bg-primary/10 hover:text-primary transition-colors"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      {phrase.status === "finished" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handlePublish(phrase._id)}
                          title="Publish"
                          className="rounded-full hover:bg-green-100 hover:text-green-600 transition-colors"
                        >
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(phrase._id)}
                        title="Delete"
                        className="rounded-full hover:bg-red-100 hover:text-red-600 transition-colors"
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

export default function PhrasesByLanguagePage({
  params
}: {
  params: Promise<{ language: string }>;
}) {
  return (
    <Suspense fallback={<div>Loading phrases...</div>}>
      <PhrasesByLanguageContent params={params} />
    </Suspense>
  );
}
