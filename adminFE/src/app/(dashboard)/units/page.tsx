'use client'

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { chapterService, unitService } from "@/services";
import { Chapter, Language, Level, Status, Unit } from "@/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash, CheckCircle, GripVertical, Edit } from "lucide-react";
import { toast } from "sonner";
import { DataTableControls } from "@/components/common/data-table-controls";
import { workflowStatusBadgeClass } from "@/lib/status-badge";
import { TABLE_ACTION_ICON_CLASS } from "@/lib/tableActionStyles";

const LANGUAGE_LABELS: Record<Language, string> = {
  yoruba: "Yoruba",
  igbo: "Igbo",
  hausa: "Hausa"
};

const PAGE_OPTIONS = [10, 20, 50];

export default function UnitsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [units, setUnits] = useState<Unit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [languageFilter, setLanguageFilter] = useState<Language>("yoruba");
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chapterFilter, setChapterFilter] = useState<"all" | string>("all");

  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
  const [isGeneratingBulk, setIsGeneratingBulk] = useState(false);
  const [bulkTopic, setBulkTopic] = useState("");
  const [bulkLevel, setBulkLevel] = useState<Level>("beginner");
  const [bulkCount, setBulkCount] = useState(5);

  const [draggingUnitId, setDraggingUnitId] = useState<string | null>(null);

  const fetchUnits = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await unitService.listUnits({
        status: statusFilter === "all" ? undefined : statusFilter,
        language: languageFilter,
        chapterId: chapterFilter === "all" ? undefined : chapterFilter
      });
      setUnits(data.sort((a, b) => a.orderIndex - b.orderIndex));
    } catch (error) {
      toast.error("Failed to fetch units.")
    } finally {
      setIsLoading(false);
    }
  }, [chapterFilter, languageFilter, statusFilter]);

  const fetchChapters = useCallback(async () => {
    try {
      const data = await chapterService.listChapters(undefined, languageFilter);
      setChapters(data.sort((a, b) => a.orderIndex - b.orderIndex));
    } catch (error) {
      toast.error("Failed to fetch chapters.");
    }
  }, [languageFilter]);

  useEffect(() => {
    void fetchUnits();
  }, [fetchUnits]);

  useEffect(() => {
    void fetchChapters();
  }, [fetchChapters]);

  useEffect(() => {
    const q = searchParams.get("q") || "";
    const qPage = Number(searchParams.get("page") || "1");
    const qLimit = Number(searchParams.get("limit") || "20");
    const qStatus = searchParams.get("status");
    const qLanguage = searchParams.get("language");
    const qChapterId = searchParams.get("chapterId");

    setSearch(q);
    setPage(Number.isInteger(qPage) && qPage > 0 ? qPage : 1);
    setLimit(PAGE_OPTIONS.includes(qLimit) ? qLimit : 20);

    if (qStatus === "draft" || qStatus === "finished" || qStatus === "published" || qStatus === "all") {
      setStatusFilter(qStatus);
    }
    if (qLanguage === "yoruba" || qLanguage === "igbo" || qLanguage === "hausa") {
      setLanguageFilter(qLanguage);
    }
    if (qChapterId) {
      setChapterFilter(qChapterId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (search) params.set("q", search);
    else params.delete("q");

    if (statusFilter !== "all") params.set("status", statusFilter);
    else params.delete("status");

    params.set("language", languageFilter);
    if (chapterFilter !== "all") params.set("chapterId", chapterFilter);
    else params.delete("chapterId");
    params.set("page", String(page));
    params.set("limit", String(limit));

    const nextQuery = params.toString();
    if (nextQuery === searchParams.toString()) return;
    router.replace(`${pathname}?${nextQuery}`);
  }, [search, statusFilter, languageFilter, page, limit, pathname, router, searchParams]);

  useEffect(() => {
    setPage(1);
  }, [search, languageFilter, statusFilter, chapterFilter]);

  useEffect(() => {
    if (chapterFilter !== "all" && chapters.length > 0 && !chapters.some((chapter) => chapter._id === chapterFilter)) {
      setChapterFilter("all");
    }
  }, [chapterFilter, chapters]);

  const filteredUnits = useMemo(() => {
    if (!search.trim()) return units;
    const q = search.trim().toLowerCase();
    return units.filter((unit) =>
      [unit.title, unit.description, unit.level, unit.status].some((value) => value.toLowerCase().includes(q))
    );
  }, [units, search]);

  const total = filteredUnits.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(page, totalPages);
  const paginatedUnits = filteredUnits.slice((currentPage - 1) * limit, currentPage * limit);

  async function handleDelete(id: string) {
    if (!confirm("Delete this unit?")) return;
    try {
      await unitService.deleteUnit(id);
      toast.success("Unit deleted.");
      void fetchUnits();
    } catch (error) {
      toast.error("Failed to delete unit.")
    }
  }

  async function handleFinish(id: string) {
    try {
      await unitService.finishUnit(id);
      toast.success("Unit marked as finished.");
      void fetchUnits();
    } catch (error) {
      toast.error("Failed to update unit status.")
    }
  }

  async function handlePublish(id: string) {
    try {
      await unitService.publishUnit(id);
      toast.success("Unit published.");
      void fetchUnits();
    } catch (error) {
      toast.error("Failed to publish unit.")
    }
  }

  async function handleBulkGenerateUnits() {
    if (Number.isNaN(bulkCount) || bulkCount < 1 || bulkCount > 20) {
      toast.error("Count must be between 1 and 20.");
      return;
    }

    try {
      setIsGeneratingBulk(true);
      const result = await unitService.generateBulkUnits({
        language: languageFilter,
        level: bulkLevel,
        chapterId: chapterFilter === "all" ? undefined : chapterFilter,
        count: bulkCount,
        topic: bulkTopic.trim() || undefined
      });

      const coreCreatedCount = result.coreCreatedCount ?? result.createdCount;
      const reviewCreatedCount = result.reviewCreatedCount ?? 0;
      toast.success(
        `AI created ${coreCreatedCount} core units and ${reviewCreatedCount} review units (${result.skippedCount} skipped, ${result.errorCount} errors).`
      );
      setIsBulkDialogOpen(false);
      setBulkTopic("");
      setBulkCount(5);
      void fetchUnits();
    } catch (error) {
      toast.error("Failed to bulk generate units.")
    } finally {
      setIsGeneratingBulk(false);
    }
  }

  async function reorderUnitsByIds(orderedIds: string[]) {
    try {
      const updated = await unitService.reorderUnits(languageFilter, orderedIds);
      setUnits([...updated].sort((a, b) => a.orderIndex - b.orderIndex));
      toast.success("Unit order updated.");
    } catch (error) {
      toast.error("Failed to reorder units.")
    }
  }

  function onDragStart(unitId: string) {
    setDraggingUnitId(unitId);
  }

  function onDragEnd() {
    setDraggingUnitId(null);
  }

  async function onDrop(targetUnitId: string) {
    if (search || totalPages > 1) {
      toast.error("Disable search and go to a single page before reordering.");
      setDraggingUnitId(null);
      return;
    }
    if (!draggingUnitId || draggingUnitId === targetUnitId) {
      setDraggingUnitId(null);
      return;
    }

    const reordered = [...paginatedUnits];
    const fromIndex = reordered.findIndex((item) => item._id === draggingUnitId);
    const toIndex = reordered.findIndex((item) => item._id === targetUnitId);

    if (fromIndex < 0 || toIndex < 0) {
      setDraggingUnitId(null);
      return;
    }

    const moved = reordered[fromIndex];
    reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    setDraggingUnitId(null);

    await reorderUnitsByIds(reordered.map((item) => item._id));
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground">Units</h1>
          <p className="text-muted-foreground font-medium">Manage units inside chapter context, then build lessons under each unit.</p>
        </div>

        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" onClick={() => setIsBulkDialogOpen(true)} className="h-12 rounded-xl px-6 font-semibold">
            AI Bulk Units
          </Button>
          <Button asChild className="h-12 rounded-xl px-6 font-bold shadow-lg shadow-primary/20 transition-all hover:scale-[1.02]">
            <Link href={`/units/new?language=${languageFilter}${chapterFilter !== "all" ? `&chapterId=${chapterFilter}` : ""}`}>
              <Plus className="mr-2 h-5 w-5" />
              Create New Unit
            </Link>
          </Button>
        </div>
      </div>

      <Dialog open={isBulkDialogOpen} onOpenChange={setIsBulkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>AI Bulk Unit Generation</DialogTitle>
            <DialogDescription>
              Generate multiple draft core units for {LANGUAGE_LABELS[languageFilter]}. A sentence-focused review unit will be auto-inserted after every two core units.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
              <div className="space-y-2">
                <Label>Chapter</Label>
                <Input
                  value={
                    chapterFilter === "all"
                      ? "No chapter selected"
                      : chapters.find((chapter) => chapter._id === chapterFilter)?.title || "Selected chapter"
                  }
                  disabled
                />
              </div>
              <div className="space-y-2">
                <Label>Level</Label>
                <Select value={bulkLevel} onValueChange={(value) => setBulkLevel(value as Level)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="beginner">Beginner</SelectItem>
                  <SelectItem value="intermediate">Intermediate</SelectItem>
                  <SelectItem value="advanced">Advanced</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Count (1-20)</Label>
              <Input type="number" min={1} max={20} value={bulkCount} onChange={(event) => setBulkCount(Number(event.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>Theme (optional)</Label>
              <Input value={bulkTopic} onChange={(event) => setBulkTopic(event.target.value)} placeholder="Travel, market conversation, family, etc." />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsBulkDialogOpen(false)}>Cancel</Button>
            <Button type="button" onClick={handleBulkGenerateUnits} disabled={isGeneratingBulk}>
              {isGeneratingBulk ? "Generating..." : "Generate Units"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="overflow-hidden rounded-3xl border-2 border-primary/10 bg-card shadow-xl">
        <div className="px-6 pt-6">
          <DataTableControls
            search={search}
            onSearchChange={setSearch}
            page={currentPage}
            limit={limit}
            onLimitChange={(value) => {
              setLimit(value);
              setPage(1);
            }}
            totalPages={totalPages}
            total={total}
            label="Search units"
            onPrev={() => setPage((prev) => Math.max(1, prev - 1))}
            onNext={() => setPage((prev) => Math.min(totalPages, prev + 1))}
          />

          <div className="pb-4 flex flex-wrap gap-3">
            <Select value={languageFilter} onValueChange={(value) => setLanguageFilter(value as Language)}>
              <SelectTrigger className="h-10 w-[220px]"><SelectValue placeholder="Filter by language" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="yoruba">Yoruba</SelectItem>
                <SelectItem value="igbo">Igbo</SelectItem>
                <SelectItem value="hausa">Hausa</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | Status)}>
              <SelectTrigger className="h-10 w-[220px]"><SelectValue placeholder="Filter by status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="finished">Finished</SelectItem>
                <SelectItem value="published">Published</SelectItem>
              </SelectContent>
            </Select>

            <Select value={chapterFilter} onValueChange={setChapterFilter}>
              <SelectTrigger className="h-10 w-[260px]"><SelectValue placeholder="Filter by chapter" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All chapters</SelectItem>
                {chapters.map((chapter) => (
                  <SelectItem key={chapter._id} value={chapter._id}>
                    {chapter.orderIndex + 1}. {chapter.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Table>
          <TableHeader className="bg-primary/5">
            <TableRow>
              <TableHead className="w-24 font-bold text-primary pl-8">Order</TableHead>
              <TableHead className="font-bold text-primary">Title</TableHead>
              <TableHead className="font-bold text-primary">Chapter</TableHead>
              <TableHead className="font-bold text-primary">Type</TableHead>
              <TableHead className="font-bold text-primary">Level</TableHead>
              <TableHead className="font-bold text-primary">Status</TableHead>
              <TableHead className="font-bold text-primary">Created At</TableHead>
              <TableHead className="text-right font-bold text-primary pr-8">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-48 text-center text-muted-foreground font-medium">
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                    Loading units...
                  </div>
                </TableCell>
              </TableRow>
            ) : paginatedUnits.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-48 text-center text-muted-foreground font-medium">No units found.</TableCell>
              </TableRow>
            ) : (
              paginatedUnits.map((unit) => (
                <TableRow
                  key={unit._id}
                  draggable
                  onDragStart={() => onDragStart(unit._id)}
                  onDragEnd={onDragEnd}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => onDrop(unit._id)}
                  className={cn("group transition-colors hover:bg-secondary/30", draggingUnitId === unit._id ? "opacity-30 bg-primary/10" : "")}
                >
                  <TableCell className="pl-8">
                    <div className="flex items-center gap-3">
                      <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted font-bold text-muted-foreground">{unit.orderIndex + 1}</div>
                    </div>
                  </TableCell>
                  <TableCell className="font-bold text-foreground">{unit.title}</TableCell>
                  <TableCell>
                    {unit.chapterId ? (
                      <Badge variant="outline" className="font-semibold border-primary/20 text-primary bg-primary/5">
                        {chapters.find((chapter) => chapter._id === unit.chapterId)?.title || "Unknown chapter"}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">No chapter</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize font-semibold border-amber-300/40 text-amber-700 bg-amber-50">
                      {unit.kind === "review" ? `${unit.reviewStyle} review` : "core"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize font-semibold border-accent/30 text-accent bg-accent/5">{unit.level}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={workflowStatusBadgeClass(unit.status)}>{unit.status}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground font-medium">{new Date(unit.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right pr-8">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" asChild title="Edit" className={TABLE_ACTION_ICON_CLASS.edit}>
                        <Link href={`/units/${unit._id}`}>
                          <Edit className="h-4 w-4" />
                        </Link>
                      </Button>
                      {unit.status === "draft" && (
                        <Button variant="ghost" size="icon" onClick={() => handleFinish(unit._id)} title="Finish" className={TABLE_ACTION_ICON_CLASS.finish}>
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                      )}
                      {unit.status === "finished" && (
                        <Button variant="ghost" size="icon" onClick={() => handlePublish(unit._id)} title="Publish" className={TABLE_ACTION_ICON_CLASS.publish}>
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(unit._id)} title="Delete" className={TABLE_ACTION_ICON_CLASS.delete}>
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
