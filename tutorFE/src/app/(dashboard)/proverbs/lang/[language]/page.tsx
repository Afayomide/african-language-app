'use client'

import { use, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { proverbService, lessonService, aiService } from "@/services";
import { Proverb, Lesson, Language, Status } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { DataTableControls } from "@/components/common/data-table-controls";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { ArrowLeft, Edit, MessageSquareQuote, Send, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { workflowStatusBadgeClass } from "@/lib/status-badge";

const LANGUAGE_LABELS: Record<Language, string> = {
  yoruba: "Yoruba",
  igbo: "Igbo",
  hausa: "Hausa"
};

function isLanguage(value: string): value is Language {
  return value === "yoruba" || value === "igbo" || value === "hausa";
}

export default function TutorProverbsByLanguagePage({ params }: { params: Promise<{ language: string }> }) {
  const { language: languageParam } = use(params);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const language: Language = isLanguage(languageParam) ? languageParam : "yoruba";
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [proverbs, setProverbs] = useState<Proverb[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedLessonId, setSelectedLessonId] = useState(searchParams.get("lessonId") || "all");
  const [statusFilter, setStatusFilter] = useState<"all" | Status>((searchParams.get("status") as "all" | Status) || "all");
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [page, setPage] = useState(Number(searchParams.get("page") || "1"));
  const [limit, setLimit] = useState(Number(searchParams.get("limit") || "20"));
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Proverb | null>(null);
  const [formLessonId, setFormLessonId] = useState("all");
  const [formText, setFormText] = useState("");
  const [formTranslation, setFormTranslation] = useState("");
  const [formContextNote, setFormContextNote] = useState("");
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiCount, setAiCount] = useState(5);
  const [aiExtraInstructions, setAiExtraInstructions] = useState("");

  const lessonMap = useMemo(() => new Map(lessons.map((lesson) => [lesson._id, lesson.title])), [lessons]);

  useEffect(() => {
    void loadLessons();
  }, [language]);

  useEffect(() => {
    void loadProverbs();
  }, [language, selectedLessonId, statusFilter, page, limit]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (selectedLessonId !== "all") params.set("lessonId", selectedLessonId); else params.delete("lessonId");
    if (statusFilter !== "all") params.set("status", statusFilter); else params.delete("status");
    if (search) params.set("q", search); else params.delete("q");
    params.set("page", String(page));
    params.set("limit", String(limit));
    const next = params.toString();
    if (next !== searchParams.toString()) router.replace(`${pathname}?${next}`);
  }, [selectedLessonId, statusFilter, search, page, limit, pathname, router, searchParams]);

  const filteredProverbs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return proverbs;
    return proverbs.filter((item) =>
      [item.text, item.translation, item.contextNote, item.status]
        .map((value) => String(value || "").toLowerCase())
        .some((value) => value.includes(q))
    );
  }, [proverbs, search]);

  async function loadLessons() {
    try {
      const data = await lessonService.listLessons(undefined);
      setLessons(data);
      if (selectedLessonId !== "all" && !data.some((lesson) => lesson._id === selectedLessonId)) {
        setSelectedLessonId("all");
      }
    } catch {
      toast.error("Failed to load lessons");
    }
  }

  async function loadProverbs() {
    setIsLoading(true);
    try {
      const data = await proverbService.listProverbsPage({
        lessonId: selectedLessonId === "all" ? undefined : selectedLessonId,
        status: statusFilter === "all" ? undefined : statusFilter,
        page,
        limit
      });
      setProverbs(data.items);
      setTotal(data.total);
      setTotalPages(data.pagination.totalPages);
    } catch {
      toast.error("Failed to load proverbs");
    } finally {
      setIsLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setFormLessonId(selectedLessonId !== "all" ? selectedLessonId : "all");
    setFormText("");
    setFormTranslation("");
    setFormContextNote("");
    setDialogOpen(true);
  }

  function openEdit(item: Proverb) {
    setEditing(item);
    setFormLessonId(item.lessonIds[0] || "all");
    setFormText(item.text);
    setFormTranslation(item.translation || "");
    setFormContextNote(item.contextNote || "");
    setDialogOpen(true);
  }

  async function saveProverb() {
    if (!formText.trim()) {
      toast.error("Proverb text is required");
      return;
    }

    if (!editing && formLessonId === "all") {
      toast.error("Select a lesson");
      return;
    }

    try {
      if (editing) {
        await proverbService.updateProverb(editing._id, {
          text: formText.trim(),
          translation: formTranslation.trim(),
          contextNote: formContextNote.trim(),
          ...(formLessonId !== "all" ? { lessonIds: [formLessonId] } : {})
        });
        toast.success("Proverb updated");
      } else {
        await proverbService.createProverb({
          lessonIds: [formLessonId],
          text: formText.trim(),
          translation: formTranslation.trim(),
          contextNote: formContextNote.trim()
        });
        toast.success("Proverb created");
      }
      setDialogOpen(false);
      void loadProverbs();
    } catch {
      toast.error("Failed to save proverb");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this proverb?")) return;
    try {
      await proverbService.deleteProverb(id);
      toast.success("Proverb deleted");
      void loadProverbs();
    } catch {
      toast.error("Failed to delete proverb");
    }
  }

  async function handleFinish(id: string) {
    try {
      await proverbService.finishProverb(id);
      toast.success("Proverb sent to admin for publish");
      void loadProverbs();
    } catch {
      toast.error("Failed to mark as finished");
    }
  }

  async function handleGenerateAiProverbs() {
    if (selectedLessonId === "all") {
      toast.error("Select a lesson first");
      return;
    }
    try {
      await aiService.generateProverbs(selectedLessonId, aiCount, aiExtraInstructions.trim() || undefined);
      toast.success("AI proverbs generated");
      setAiDialogOpen(false);
      setAiExtraInstructions("");
      void loadProverbs();
    } catch {
      toast.error("Failed to generate AI proverbs");
    }
  }

  if (!isLanguage(languageParam)) return <div>Invalid language</div>;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/proverbs")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-3xl font-semibold">{LANGUAGE_LABELS[language]} Proverbs</h1>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={aiDialogOpen} onOpenChange={setAiDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" disabled={selectedLessonId === "all"}>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate with AI
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Generate Proverbs with AI</DialogTitle>
                <DialogDescription>
                  AI will generate proverbs for the selected lesson and map them automatically.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Count</Label>
                  <Input type="number" min={1} max={20} value={aiCount} onChange={(e) => setAiCount(Number(e.target.value) || 1)} />
                </div>
                <div className="space-y-2">
                  <Label>Extra instructions (optional)</Label>
                  <Input value={aiExtraInstructions} onChange={(e) => setAiExtraInstructions(e.target.value)} placeholder="e.g. beginner-friendly family proverbs" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAiDialogOpen(false)}>Cancel</Button>
                <Button onClick={() => void handleGenerateAiProverbs()}>Generate</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate}>
                <MessageSquareQuote className="mr-2 h-4 w-4" />
                New Proverb
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Proverb" : "Create Proverb"}</DialogTitle>
              <DialogDescription>Reusable proverbs mapped to lessons in your language.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Lesson</Label>
                <Select value={formLessonId} onValueChange={setFormLessonId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select lesson" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Select lesson</SelectItem>
                    {lessons.map((lesson) => (
                      <SelectItem key={lesson._id} value={lesson._id}>{lesson.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Text</Label>
                <Input value={formText} onChange={(e) => setFormText(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>Translation</Label>
                <Input value={formTranslation} onChange={(e) => setFormTranslation(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>Context Note</Label>
                <Input value={formContextNote} onChange={(e) => setFormContextNote(e.target.value)} />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={() => void saveProverb()}>Save</Button>
            </DialogFooter>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="w-full lg:max-w-xs">
          <Select value={selectedLessonId} onValueChange={(value) => {
            setSelectedLessonId(value);
            setPage(1);
          }}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by lesson" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All lessons</SelectItem>
              {lessons.map((lesson) => (
                <SelectItem key={lesson._id} value={lesson._id}>{lesson.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-full lg:max-w-xs">
          <Select value={statusFilter} onValueChange={(value) => {
            setStatusFilter(value as "all" | Status);
            setPage(1);
          }}>
            <SelectTrigger>
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
        label="Search proverbs"
        onPrev={() => setPage((prev) => Math.max(1, prev - 1))}
        onNext={() => setPage((prev) => Math.min(totalPages, prev + 1))}
      />

      <div className="overflow-hidden rounded-3xl border-2 border-primary/10 bg-card shadow-xl">
        <Table>
          <TableHeader className="bg-primary/5">
            <TableRow>
              <TableHead className="font-bold text-primary pl-8">Text</TableHead>
              <TableHead className="font-bold text-primary">Translation</TableHead>
              <TableHead className="font-bold text-primary">Lessons</TableHead>
              <TableHead className="font-bold text-primary">Status</TableHead>
              <TableHead className="text-right font-bold text-primary pr-8">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="h-24 text-center">Loading...</TableCell></TableRow>
            ) : filteredProverbs.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="h-24 text-center">No proverbs found.</TableCell></TableRow>
            ) : (
              filteredProverbs.map((item) => (
                <TableRow key={item._id} className="group transition-colors hover:bg-secondary/30">
                  <TableCell className="pl-8 font-bold text-foreground">{item.text}</TableCell>
                  <TableCell>{item.translation || "-"}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {item.lessonIds.map((id) => lessonMap.get(id) || id).join(", ")}
                  </TableCell>
                  <TableCell>
                    <Badge className={workflowStatusBadgeClass(item.status)}>{item.status}</Badge>
                  </TableCell>
                  <TableCell className="pr-8 text-right space-x-2">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(item)} title="Edit">
                      <Edit className="h-4 w-4" />
                    </Button>
                    {item.status === "draft" && (
                      <Button variant="ghost" size="icon" onClick={() => void handleFinish(item._id)} title="Mark finished">
                        <Send className="h-4 w-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => void handleDelete(item._id)} title="Delete">
                      <Trash2 className="h-4 w-4" />
                    </Button>
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
