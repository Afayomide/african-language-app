'use client'

import { useEffect, useState, Suspense, use } from "react";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { aiService, phraseService, lessonService } from "@/services";
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
import { Plus, Edit, Trash, ArrowLeft, Volume2, Sparkles, CheckCircle } from "lucide-react";
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

function PhrasesByLanguageContent({ params }: { params: Promise<{ language: string }> }) {
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
    if (!isValidLanguageParam) return;
    fetchLessons();
  }, [isValidLanguageParam]);

  useEffect(() => {
    if (!isValidLanguageParam) return;
    fetchPhrases();
  }, [selectedLessonId, isValidLanguageParam, page, search, limit, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [selectedLessonId, search, statusFilter]);

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
      const data = await lessonService.listLessons();
      setLessons(data.sort((a, b) => a.orderIndex - b.orderIndex));
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

  async function handleFinish(id: string) {
    try {
      await phraseService.finishPhrase(id);
      toast.success("Phrase sent to admin for publish");
      fetchPhrases();
    } catch {
      toast.error("Failed to mark phrase as finished");
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
      toast.error("Please select a lesson first");
      return;
    }

    setIsGenerating(true);
    try {
      await aiService.generatePhrases(
        selectedLessonId,
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
          <Button
            variant="destructive"
            onClick={handleBulkDeletePhrases}
            disabled={selectedPhraseIds.length === 0}
          >
            Delete Selected ({selectedPhraseIds.length})
          </Button>
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
                  <div className="space-y-2">
                    <Label htmlFor="extraInstructions">Extra Description (Optional)</Label>
                    <Input
                      id="extraInstructions"
                      placeholder='e.g. "Generate only single words"'
                      value={extraInstructions}
                      onChange={(e) => setExtraInstructions(e.target.value)}
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
                          : undefined,
                        extraInstructions
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

      <div className="flex items-center gap-4 rounded-md border bg-white p-4">
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
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Status:</span>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | Status)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="finished">Finished</SelectItem>
              <SelectItem value="published">Published</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border-2 border-primary/10 bg-card shadow-xl">
        <div className="px-6 pt-4">
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
              <TableHead className="pl-8 font-bold text-primary">Text</TableHead>
              <TableHead className="font-bold text-primary">Translation</TableHead>
              <TableHead className="font-bold text-primary">Difficulty</TableHead>
              <TableHead className="font-bold text-primary">Status</TableHead>
              <TableHead className="font-bold text-primary">Created At</TableHead>
              <TableHead className="pr-8 text-right font-bold text-primary">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  Loading...
                </TableCell>
              </TableRow>
            ) : phrases.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
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
                  <TableCell className="pl-8 font-bold text-foreground">{phrase.text}</TableCell>
                  <TableCell className="font-medium text-muted-foreground italic">{phrase.translation}</TableCell>
                  <TableCell>{phrase.difficulty}/5</TableCell>
                  <TableCell>
                    <Badge className={workflowStatusBadgeClass(phrase.status)}>
                      {phrase.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium text-muted-foreground">
                    {new Date(phrase.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="pr-8 text-right">
                    <div className="flex justify-end gap-2">
                      {phrase.audio?.url && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handlePlayAudio(phrase.audio.url)}
                          title="Play audio"
                        >
                          <Volume2 className="h-4 w-4 text-blue-600" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.push(`/phrases/${phrase._id}`)}
                        title="Edit"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      {phrase.status === "draft" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleFinish(phrase._id)}
                          title="Mark as finished"
                        >
                          <CheckCircle className="h-4 w-4 text-amber-600" />
                        </Button>
                      )}
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
