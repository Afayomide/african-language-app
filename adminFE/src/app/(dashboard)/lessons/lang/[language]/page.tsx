'use client'

import { useCallback, useEffect, useState, use } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { lessonService } from "@/services";
import { Lesson, Language, Status } from "@/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash, ExternalLink, CheckCircle, GripVertical, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { DataTableControls } from "@/components/common/data-table-controls";

const LANGUAGE_LABELS: Record<Language, string> = {
  yoruba: "Yoruba",
  igbo: "Igbo",
  hausa: "Hausa"
};

function isLanguage(value: string): value is Language {
  return value === "yoruba" || value === "igbo" || value === "hausa";
}

export default function LessonsByLanguagePage({
  params
}: {
  params: Promise<{ language: string }>;
}) {
  const { language: languageParam } = use(params);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingBulk, setIsGeneratingBulk] = useState(false);
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
  const [bulkTopic, setBulkTopic] = useState("");
  const [bulkLevel, setBulkLevel] = useState<"beginner" | "intermediate" | "advanced">("beginner");
  const [bulkCount, setBulkCount] = useState(5);
  const [draggingLessonId, setDraggingLessonId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");

  const isValidLanguageParam = isLanguage(languageParam);
  const language: Language = isValidLanguageParam ? (languageParam as Language) : "yoruba";

  const fetchLessons = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await lessonService.listLessonsPage({
        language,
        status: statusFilter === "all" ? undefined : statusFilter,
        q: search || undefined,
        page,
        limit
      });
      setLessons([...data.items].sort((a, b) => a.orderIndex - b.orderIndex));
      setTotal(data.total);
      setTotalPages(data.pagination.totalPages);
    } catch {
      toast.error("Failed to fetch lessons");
    } finally {
      setIsLoading(false);
    }
  }, [language, page, search, limit, statusFilter]);

  useEffect(() => {
    if (!isValidLanguageParam) return;
    fetchLessons();
  }, [fetchLessons, isValidLanguageParam]);

  useEffect(() => {
    setPage(1);
  }, [search, language, statusFilter]);

  useEffect(() => {
    const q = searchParams.get("q") || "";
    const qPage = Number(searchParams.get("page") || "1");
    const qLimit = Number(searchParams.get("limit") || "20");
    const qStatus = searchParams.get("status");
    setSearch(q);
    setPage(Number.isInteger(qPage) && qPage > 0 ? qPage : 1);
    setLimit([10, 20, 50].includes(qLimit) ? qLimit : 20);
    if (qStatus === "draft" || qStatus === "finished" || qStatus === "published" || qStatus === "all") {
      setStatusFilter(qStatus);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (search) params.set("q", search);
    else params.delete("q");
    if (statusFilter !== "all") params.set("status", statusFilter);
    else params.delete("status");
    params.set("page", String(page));
    params.set("limit", String(limit));
    const nextQuery = params.toString();
    if (nextQuery === searchParams.toString()) return;
    router.replace(`${pathname}?${nextQuery}`);
  }, [search, statusFilter, page, limit, pathname, router, searchParams]);

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this lesson?")) return;
    try {
      await lessonService.deleteLesson(id);
      toast.success("Lesson deleted");
      fetchLessons();
    } catch {
      toast.error("Failed to delete lesson");
    }
  }

  async function handlePublish(id: string) {
    try {
      await lessonService.publishLesson(id);
      toast.success("Lesson published");
      fetchLessons();
    } catch {
      toast.error("Failed to publish lesson");
    }
  }

  async function reorderLessonsByIds(orderedIds: string[]) {
    if (orderedIds.length !== lessons.length) return;

    try {
      const updated = await lessonService.reorderLessons(
        language,
        orderedIds
      );
      setLessons([...updated].sort((a, b) => a.orderIndex - b.orderIndex));
      toast.success("Lesson order updated");
    } catch {
      toast.error("Failed to reorder lessons");
    }
  }

  async function handleBulkGenerateLessons() {
    if (Number.isNaN(bulkCount) || bulkCount < 1 || bulkCount > 20) {
      toast.error("Count must be between 1 and 20");
      return;
    }

    try {
      setIsGeneratingBulk(true);
      const result = await lessonService.generateBulkLessons({
        language,
        level: bulkLevel,
        count: bulkCount,
        topics: bulkTopic.trim() ? [bulkTopic.trim()] : undefined
      });
      toast.success(`AI created ${result.createdCount} lessons (${result.skippedCount} skipped, ${result.errorCount} errors)`);
      setIsBulkDialogOpen(false);
      setBulkTopic("");
      setBulkCount(5);
      fetchLessons();
    } catch (error: unknown) {
      const message =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof (error as { response?: { data?: { error?: string } } }).response?.data?.error === "string"
          ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
          : "Failed to bulk generate lessons";
      toast.error(message);
    } finally {
      setIsGeneratingBulk(false);
    }
  }

  function onDragStart(lessonId: string) {
    setDraggingLessonId(lessonId);
  }

  function onDragEnd() {
    setDraggingLessonId(null);
  }

  async function onDrop(targetLessonId: string) {
    if (search || totalPages > 1) {
      toast.error("Disable search and return to single page before reordering.");
      setDraggingLessonId(null);
      return;
    }
    if (!draggingLessonId || draggingLessonId === targetLessonId) {
      setDraggingLessonId(null);
      return;
    }

    const reordered = [...lessons];
    const fromIndex = reordered.findIndex((item) => item._id === draggingLessonId);
    const toIndex = reordered.findIndex((item) => item._id === targetLessonId);

    if (fromIndex < 0 || toIndex < 0) {
      setDraggingLessonId(null);
      return;
    }

    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    setDraggingLessonId(null);

    await reorderLessonsByIds(reordered.map((item) => item._id));
  }

  if (!isValidLanguageParam) {
    return <div>Invalid language</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => router.push("/lessons")}
            className="rounded-full hover:bg-secondary"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-foreground">{LANGUAGE_LABELS[language]} Lessons</h1>
            <p className="text-muted-foreground font-medium">Manage and organize lessons for {LANGUAGE_LABELS[language]}.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsBulkDialogOpen(true)}
            className="h-12 rounded-xl px-6 font-semibold"
          >
            AI Bulk Generate
          </Button>
          <Button asChild className="h-12 rounded-xl px-6 font-bold shadow-lg shadow-primary/20 transition-all hover:scale-[1.02]">
            <Link href={`/lessons/new?language=${language}`}>
              <Plus className="mr-2 h-5 w-5" />
              Create New Lesson
            </Link>
          </Button>
        </div>
      </div>

      <Dialog open={isBulkDialogOpen} onOpenChange={setIsBulkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>AI Bulk Lesson Generation</DialogTitle>
            <DialogDescription>
              Generate multiple draft lessons for {LANGUAGE_LABELS[language]}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label>Level</Label>
              <Select
                value={bulkLevel}
                onValueChange={(value) =>
                  setBulkLevel(value as "beginner" | "intermediate" | "advanced")
                }
              >
                <SelectTrigger>
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
              <Label>Count (1-20)</Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={bulkCount}
                onChange={(e) => setBulkCount(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Topics (optional)</Label>
              <Input
                value={bulkTopic}
                onChange={(e) => setBulkTopic(e.target.value)}
                placeholder="Daily greetings, market conversation, family, etc."
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsBulkDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleBulkGenerateLessons}
              disabled={isGeneratingBulk}
            >
              {isGeneratingBulk ? "Generating..." : "Generate Lessons"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            label="Search lessons"
            onPrev={() => setPage((prev) => Math.max(1, prev - 1))}
            onNext={() => setPage((prev) => Math.min(totalPages, prev + 1))}
          />
          <div className="pb-4">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | Status)}>
              <SelectTrigger className="h-10 w-[220px]">
                <SelectValue placeholder="Filter by status" />
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
        <Table>
          <TableHeader className="bg-primary/5">
            <TableRow>
              <TableHead className="w-24 font-bold text-primary pl-8">Order</TableHead>
              <TableHead className="font-bold text-primary">Title</TableHead>
              <TableHead className="font-bold text-primary">Level</TableHead>
              <TableHead className="font-bold text-primary">Status</TableHead>
              <TableHead className="font-bold text-primary">Created At</TableHead>
              <TableHead className="text-right font-bold text-primary pr-8">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-48 text-center text-muted-foreground font-medium">
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                    Loading lessons...
                  </div>
                </TableCell>
              </TableRow>
            ) : lessons.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-48 text-center text-muted-foreground font-medium">
                  No lessons found for this language.
                </TableCell>
              </TableRow>
            ) : (
              lessons.map((lesson) => (
                <TableRow
                  key={lesson._id}
                  draggable
                  onDragStart={() => onDragStart(lesson._id)}
                  onDragEnd={onDragEnd}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => onDrop(lesson._id)}
                  className={cn(
                    "group transition-colors hover:bg-secondary/30",
                    draggingLessonId === lesson._id ? "opacity-30 bg-primary/10" : ""
                  )}
                >
                  <TableCell className="pl-8">
                    <div className="flex items-center gap-3">
                      <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted font-bold text-muted-foreground">
                        {lesson.orderIndex + 1}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-bold text-foreground">{lesson.title}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize font-semibold border-accent/30 text-accent bg-accent/5">
                      {lesson.level}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={
                        lesson.status === "published"
                          ? "bg-green-500 hover:bg-green-600"
                          : lesson.status === "finished"
                            ? "bg-amber-500 hover:bg-amber-600"
                            : "bg-zinc-400"
                      }
                    >
                      {lesson.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground font-medium">{new Date(lesson.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right pr-8">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" asChild title="Edit" className="rounded-full hover:bg-primary/10 hover:text-primary transition-colors">
                        <Link href={`/lessons/${lesson._id}`}>
                          <Edit className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button variant="ghost" size="icon" asChild title="View Phrases" className="rounded-full hover:bg-accent/10 hover:text-accent transition-colors">
                        <Link href={`/phrases/lang/${language}?lessonId=${lesson._id}`}>
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </Button>
                      {lesson.status === "finished" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handlePublish(lesson._id)}
                          title="Publish"
                          className="rounded-full hover:bg-green-100 hover:text-green-600 transition-colors"
                        >
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(lesson._id)}
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
  )
}
