'use client'

import { useEffect, useMemo, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { aiService, authService, chapterService, lessonService, unitService } from "@/services";
import type { UnitContentPlanPreviewResult, UnitPlanLesson, UnitPlanSequenceLesson } from "@/services/ai.service";
import { Chapter, Lesson, Level, Unit } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DataTableControls } from "@/components/common/data-table-controls";
import { workflowStatusBadgeClass } from "@/lib/status-badge";
import { TABLE_ACTION_ICON_CLASS } from "@/lib/tableActionStyles";
import { Sparkles, ArrowLeft, Edit, ExternalLink, Plus, Send, RefreshCcw, Wand2 } from "lucide-react";
import { toast } from "sonner";

type PersistedAiRun = NonNullable<Unit["lastAiRun"]>;
type ApiError = { response?: { data?: { error?: string; message?: string } } };

function normalizePlanLines(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinPlanLines(values: string[]) {
  return values.join("\n");
}

function normalizeEditablePlanLesson(lesson: UnitPlanLesson): UnitPlanLesson {
  return {
    title: lesson.title.trim(),
    description: lesson.description?.trim() || undefined,
    objectives: lesson.objectives.map((item) => item.trim()).filter(Boolean),
    conversationGoal: lesson.conversationGoal.trim(),
    situations: lesson.situations.map((item) => item.trim()).filter(Boolean),
    sentenceGoals: lesson.sentenceGoals.map((item) => item.trim()).filter(Boolean),
    focusSummary: lesson.focusSummary?.trim() || undefined
  };
}

function buildAutoReviewPlanSequence(
  coreLessons: UnitPlanLesson[],
  options?: { autoInsertReviewLessons?: boolean }
): UnitPlanSequenceLesson[] {
  const autoInsertReviewLessons = options?.autoInsertReviewLessons !== false;
  const sequence: UnitPlanSequenceLesson[] = [];
  const recent: Array<{ index: number; lesson: UnitPlanLesson }> = [];

  for (const [index, rawLesson] of coreLessons.entries()) {
    const lesson = normalizeEditablePlanLesson(rawLesson);
    sequence.push({
      ...lesson,
      lessonMode: "core",
      sourceCoreLessonIndexes: [index]
    });
    if (!autoInsertReviewLessons) continue;
    recent.push({ index, lesson });

    if (recent.length === 2) {
      const [first, second] = recent;
      const titleA = first.lesson.title;
      const titleB = second.lesson.title;
      const focus = [first.lesson.focusSummary, second.lesson.focusSummary].filter(Boolean).join(" + ");
      sequence.push({
        title: `Review: ${titleA} + ${titleB}`,
        description: `Review and apply the key words, expressions, and sentence patterns from ${titleA} and ${titleB}.`,
        objectives: [
          `Review the main targets from ${titleA}.`,
          `Review the main targets from ${titleB}.`,
          "Use known content in fresh sentence exercises without introducing arbitrary new targets."
        ],
        conversationGoal: `Review and reuse the practical language from ${titleA} and ${titleB} in new situations.`,
        situations: [
          `A short review conversation that combines ${titleA} and ${titleB}.`,
          "Fresh practice using already seen language in slightly different real-life situations."
        ],
        sentenceGoals: [
          ...(first.lesson.sentenceGoals[0] ? [first.lesson.sentenceGoals[0]] : []),
          ...(second.lesson.sentenceGoals[0] ? [second.lesson.sentenceGoals[0]] : []),
          "Use familiar language in a new review sentence."
        ],
        focusSummary: focus || `Review of ${titleA} and ${titleB}`,
        lessonMode: "review",
        sourceCoreLessonIndexes: [first.index, second.index]
      });
      recent.length = 0;
    }
  }

  return sequence;
}

export default function EditUnitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const tutor = authService.getTutorProfile();
  const tutorLanguage = tutor?.language || "yoruba";

  const [unit, setUnit] = useState<Unit | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [level, setLevel] = useState<Level>("beginner");
  const [chapterId, setChapterId] = useState("");
  const [kind, setKind] = useState<Unit["kind"]>("core");
  const [reviewStyle, setReviewStyle] = useState<Unit["reviewStyle"]>("star");
  const [reviewSourceUnitIds, setReviewSourceUnitIds] = useState<string[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chapterUnits, setChapterUnits] = useState<Unit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);

  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [isLoadingLessons, setIsLoadingLessons] = useState(false);
  const [lessonSearch, setLessonSearch] = useState("");
  const [lessonPage, setLessonPage] = useState(1);
  const [lessonLimit, setLessonLimit] = useState(10);
  const [lessonTotal, setLessonTotal] = useState(0);
  const [lessonTotalPages, setLessonTotalPages] = useState(1);
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
  const [isGeneratingBulk, setIsGeneratingBulk] = useState(false);
  const [bulkTopic, setBulkTopic] = useState("");
  const [bulkCount, setBulkCount] = useState(5);
  const [isGenerateContentDialogOpen, setIsGenerateContentDialogOpen] = useState(false);
  const [isGeneratingContent, setIsGeneratingContent] = useState(false);
  const [contentLessonCount, setContentLessonCount] = useState(3);
  const [contentNewTargetsPerLesson, setContentNewTargetsPerLesson] = useState(2);
  const [contentReviewContentPerLesson, setContentReviewContentPerLesson] = useState(2);
  const [contentProverbsPerLesson, setContentProverbsPerLesson] = useState(2);
  const [contentTopic, setContentTopic] = useState("");
  const [contentExtraInstructions, setContentExtraInstructions] = useState("");
  const [isPreviewingContentPlan, setIsPreviewingContentPlan] = useState(false);
  const [contentPlanPreview, setContentPlanPreview] = useState<UnitContentPlanPreviewResult | null>(null);
  const [editablePlanLessons, setEditablePlanLessons] = useState<UnitPlanLesson[]>([]);
  const [isReviseDialogOpen, setIsReviseDialogOpen] = useState(false);
  const [isRevisingContent, setIsRevisingContent] = useState(false);
  const [revisionMode, setRevisionMode] = useState<"refactor" | "regenerate">("refactor");
  const [lastAiRun, setLastAiRun] = useState<PersistedAiRun | null>(null);

  const isPublished = useMemo(() => unit?.status === "published", [unit?.status]);

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        const data = await unitService.getUnit(id);
        setUnit(data);
        setTitle(data.title || "");
        setDescription(data.description || "");
        setLevel(data.level);
        setChapterId(data.chapterId || "");
        setKind(data.kind || "core");
        setReviewStyle(data.reviewStyle || "star");
        setReviewSourceUnitIds(data.reviewSourceUnitIds || []);
        setLastAiRun(data.lastAiRun || null);
      } catch (error) {
        toast.error("Failed to load unit.")
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [id]);

  useEffect(() => {
    const loadChapters = async () => {
      try {
        const data = await chapterService.listChapters();
        setChapters(data);
      } catch (error) {
        toast.error("Failed to fetch chapters.");
      }
    };

    void loadChapters();
  }, []);

  useEffect(() => {
    const loadChapterUnits = async () => {
      if (!chapterId) {
        setChapterUnits([]);
        return;
      }

      try {
        const data = await unitService.listUnits({ chapterId });
        setChapterUnits(data.filter((candidate) => candidate._id !== id));
      } catch (error) {
        toast.error("Failed to load chapter units.");
      }
    };

    void loadChapterUnits();
  }, [chapterId, id]);

  useEffect(() => {
    setReviewSourceUnitIds((current) => current.filter((unitId) => chapterUnits.some((unit) => unit._id === unitId)));
  }, [chapterUnits]);

  useEffect(() => {
    const loadLessons = async () => {
      setIsLoadingLessons(true);
      try {
        const data = await lessonService.listLessonsPage({
          unitId: id,
          q: lessonSearch || undefined,
          page: lessonPage,
          limit: lessonLimit
        });
        setLessons(data.items);
        setLessonTotal(data.total);
        setLessonTotalPages(data.pagination.totalPages);
      } catch (error) {
        toast.error("Failed to fetch unit lessons.")
      } finally {
        setIsLoadingLessons(false);
      }
    };

    void loadLessons();
  }, [id, lessonLimit, lessonPage, lessonSearch]);

  useEffect(() => {
    setLessonPage(1);
  }, [lessonSearch, lessonLimit]);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!title.trim()) {
      toast.error("Title is required.");
      return;
    }

    try {
      setIsSaving(true);
      await unitService.updateUnit(id, {
        title: title.trim(),
        description: description.trim(),
        level,
        chapterId: chapterId || null,
        kind,
        reviewStyle: kind === "review" ? reviewStyle : "none",
        reviewSourceUnitIds: kind === "review" ? reviewSourceUnitIds : []
      });
      toast.success("Unit updated.");
      router.push(`/units${chapterId ? `?chapterId=${chapterId}` : ""}`);
    } catch (error) {
      toast.error("Failed to update unit.")
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAiSuggest() {
    if (!title.trim()) {
      toast.error("Enter a topic in the title field first.");
      return;
    }

    try {
      setIsSuggesting(true);
      const suggestion = await aiService.suggestLesson(title.trim(), tutorLanguage, level);
      if (suggestion.title && suggestion.title.trim()) setTitle(suggestion.title.trim());
      if (suggestion.description && suggestion.description.trim()) setDescription(suggestion.description.trim());
      toast.success("AI suggestion applied.");
    } catch (error) {
      toast.error("Failed to generate AI suggestion.")
    } finally {
      setIsSuggesting(false);
    }
  }

  async function handleBulkGenerateLessons() {
    if (Number.isNaN(bulkCount) || bulkCount < 1 || bulkCount > 20) {
      toast.error("Count must be between 1 and 20.");
      return;
    }

    try {
      setIsGeneratingBulk(true);
      let createdCount = 0;
      for (let index = 0; index < bulkCount; index += 1) {
        const topic = bulkTopic.trim() ? `${bulkTopic.trim()} variation ${index + 1}` : `Unit lesson ${index + 1}`;
        const suggestion = await aiService.suggestLesson(topic, tutorLanguage, level);
        const lessonTitle = suggestion.title && suggestion.title.trim() ? suggestion.title.trim() : `Lesson ${index + 1}`;
        await lessonService.createLesson({
          title: lessonTitle,
          unitId: id,
          description: suggestion.description && suggestion.description.trim() ? suggestion.description.trim() : undefined
        });
        createdCount += 1;
      }

      toast.success(`AI created ${createdCount} lessons.`);
      setIsBulkDialogOpen(false);
      setBulkTopic("");
      setBulkCount(5);
      setLessonPage(1);
      const refreshed = await lessonService.listLessonsPage({
        unitId: id,
        page: 1,
        limit: lessonLimit
      });
      setLessons(refreshed.items);
      setLessonTotal(refreshed.total);
      setLessonTotalPages(refreshed.pagination.totalPages);
    } catch (error) {
      toast.error("Failed to bulk generate lessons.")
    } finally {
      setIsGeneratingBulk(false);
    }
  }

  function resetContentPlanEditor() {
    setContentPlanPreview(null);
    setEditablePlanLessons([]);
  }

  function handleGenerateContentDialogChange(open: boolean) {
    setIsGenerateContentDialogOpen(open);
    if (!open) {
      resetContentPlanEditor();
    }
  }

  function updateEditablePlanLesson(index: number, patch: Partial<UnitPlanLesson>) {
    setEditablePlanLessons((current) =>
      current.map((lesson, lessonIndex) =>
        lessonIndex === index ? normalizeEditablePlanLesson({ ...lesson, ...patch }) : lesson
      )
    );
  }

  function validateEditablePlanLessons() {
    if (editablePlanLessons.length !== contentLessonCount) {
      toast.error("The edited plan no longer matches the lesson count. Preview the AI plan again.");
      return false;
    }

    for (const [index, lesson] of editablePlanLessons.entries()) {
      if (!lesson.title.trim()) {
        toast.error(`Lesson ${index + 1} needs a title.`);
        return false;
      }
      if (lesson.objectives.length === 0) {
        toast.error(`Lesson ${index + 1} needs at least one objective.`);
        return false;
      }
      if (!lesson.conversationGoal.trim()) {
        toast.error(`Lesson ${index + 1} needs a conversation goal.`);
        return false;
      }
      if (lesson.situations.length < 2) {
        toast.error(`Lesson ${index + 1} needs at least two situations.`);
        return false;
      }
      if (lesson.sentenceGoals.length < 2) {
        toast.error(`Lesson ${index + 1} needs at least two sentence goals.`);
        return false;
      }
    }

    return true;
  }

  async function handlePreviewUnitContentPlan() {
    if (!validateUnitContentSettings()) {
      return;
    }

    try {
      setIsPreviewingContentPlan(true);
      const result = await aiService.previewUnitContentPlan(id, {
        lessonCount: contentLessonCount,
        newTargetsPerLesson: contentNewTargetsPerLesson,
        reviewContentPerLesson: contentReviewContentPerLesson,
        proverbsPerLesson: contentProverbsPerLesson,
        topics: contentTopic.trim() ? [contentTopic.trim()] : undefined,
        extraInstructions: contentExtraInstructions.trim() || undefined
      });
      const normalizedLessons = result.coreLessons.map((lesson) => normalizeEditablePlanLesson(lesson));
      const autoInsertReviewLessons = unit?.kind !== "review";
      setEditablePlanLessons(normalizedLessons);
      setContentPlanPreview({
        ...result,
        coreLessons: normalizedLessons,
        lessonSequence: buildAutoReviewPlanSequence(normalizedLessons, { autoInsertReviewLessons })
      });
      toast.success(`AI plan ready. Review ${normalizedLessons.length} core lessons before generating.`);
    } catch (error) {
      const message =
        (error as ApiError)?.response?.data?.error ||
        (error as ApiError)?.response?.data?.message ||
        "Failed to preview the AI lesson plan.";
      toast.error(message);
    } finally {
      setIsPreviewingContentPlan(false);
    }
  }

  async function handleGenerateUnitContent() {
    if (!validateUnitContentSettings()) {
      return;
    }
    if (!contentPlanPreview || editablePlanLessons.length === 0) {
      toast.error("Preview the AI lesson plan first.");
      return;
    }
    if (!validateEditablePlanLessons()) {
      return;
    }

    try {
      setIsGeneratingContent(true);
      const result = await aiService.applyUnitContentPlan(id, {
        lessonCount: contentLessonCount,
        newTargetsPerLesson: contentNewTargetsPerLesson,
        reviewContentPerLesson: contentReviewContentPerLesson,
        proverbsPerLesson: contentProverbsPerLesson,
        topics: contentTopic.trim() ? [contentTopic.trim()] : undefined,
        extraInstructions: contentExtraInstructions.trim() || undefined,
        planLessons: editablePlanLessons.map((lesson) => normalizeEditablePlanLesson(lesson))
      });
      toast.success(
        `Generated content for ${result.createdLessons} lessons (${result.contentErrors.length} content errors).`
      );
      setLastAiRun({
        mode: "generate",
        createdBy: tutor?.id || "",
        createdAt: new Date().toISOString(),
        requestedLessons: result.requestedLessons,
        createdLessons: result.createdLessons,
        skippedLessons: result.skippedLessons,
        lessonGenerationErrors: result.lessonGenerationErrors,
        contentErrors: result.contentErrors,
        lessons: result.lessons
      });
      handleGenerateContentDialogChange(false);
      const refreshed = await lessonService.listLessonsPage({
        unitId: id,
        page: 1,
        limit: lessonLimit
      });
      setLessonPage(1);
      setLessons(refreshed.items);
      setLessonTotal(refreshed.total);
      setLessonTotalPages(refreshed.pagination.totalPages);
    } catch (error) {
      const message =
        (error as ApiError)?.response?.data?.error ||
        (error as ApiError)?.response?.data?.message ||
        "Failed to generate full unit content.";
      toast.error(message);
    } finally {
      setIsGeneratingContent(false);
    }
  }

  async function handleReviseUnitContent() {
    if (!validateUnitContentSettings()) {
      return;
    }

    try {
      setIsRevisingContent(true);
      const result = await aiService.reviseUnitContent(id, {
        mode: revisionMode,
        lessonCount: contentLessonCount,
        newTargetsPerLesson: contentNewTargetsPerLesson,
        reviewContentPerLesson: contentReviewContentPerLesson,
        proverbsPerLesson: contentProverbsPerLesson,
        topics: contentTopic.trim() ? [contentTopic.trim()] : undefined,
        extraInstructions: contentExtraInstructions.trim() || undefined
      });
      toast.success(
        revisionMode === "refactor"
          ? `Refactored ${result.updatedLessons || 0} existing lessons and added ${result.createdLessons} new lessons.`
          : `Regenerated unit content for ${result.createdLessons} lessons after clearing ${result.clearedLessons} existing lessons.`
      );
      setLastAiRun({
        mode: revisionMode,
        createdBy: tutor?.id || "",
        createdAt: new Date().toISOString(),
        requestedLessons: result.requestedLessons,
        createdLessons: result.createdLessons,
        updatedLessons: result.updatedLessons,
        clearedLessons: result.clearedLessons,
        skippedLessons: result.skippedLessons,
        lessonGenerationErrors: result.lessonGenerationErrors,
        contentErrors: result.contentErrors,
        lessons: result.lessons
      });
      setIsReviseDialogOpen(false);
      const refreshed = await lessonService.listLessonsPage({
        unitId: id,
        page: 1,
        limit: lessonLimit
      });
      setLessonPage(1);
      setLessons(refreshed.items);
      setLessonTotal(refreshed.total);
      setLessonTotalPages(refreshed.pagination.totalPages);
    } catch (error) {
      const message =
        (error as ApiError)?.response?.data?.error ||
        (error as ApiError)?.response?.data?.message ||
        `Failed to ${revisionMode} unit content.`;
      toast.error(message);
    } finally {
      setIsRevisingContent(false);
    }
  }

  function validateUnitContentSettings() {
    if (!Number.isInteger(contentLessonCount) || contentLessonCount < 1 || contentLessonCount > 20) {
      toast.error("Lessons must be a whole number between 1 and 20.");
      return false;
    }
    if (!Number.isInteger(contentNewTargetsPerLesson) || contentNewTargetsPerLesson < 1 || contentNewTargetsPerLesson > 2) {
      toast.error("New Targets / Lesson must be a whole number between 1 and 2.");
      return false;
    }
    if (
      !Number.isInteger(contentReviewContentPerLesson) ||
      contentReviewContentPerLesson < 0 ||
      contentReviewContentPerLesson > 4
    ) {
      toast.error("Review Items / Lesson must be a whole number between 0 and 4.");
      return false;
    }
    if (!Number.isInteger(contentProverbsPerLesson) || contentProverbsPerLesson < 0 || contentProverbsPerLesson > 10) {
      toast.error("Proverbs / Lesson must be a whole number between 0 and 10.");
      return false;
    }
    return true;
  }

  async function handleFinishLesson(lessonId: string) {
    try {
      const updated = await lessonService.finishLesson(lessonId);
      setLessons((prev) => prev.map((lesson) => (lesson._id === lessonId ? updated : lesson)));
      toast.success("Lesson sent to admin for publish.");
    } catch (error) {
      toast.error("Failed to mark lesson as finished.");
    }
  }

  if (isLoading) return <div className="text-muted-foreground">Loading unit...</div>;
  if (!unit) return <div className="text-muted-foreground">Unit not found.</div>;

  const selectedChapter = chapters.find((chapter) => chapter._id === chapterId) || null;
  const autoInsertReviewLessons = unit?.kind !== "review";
  const displayedPlanSequence = editablePlanLessons.length > 0
    ? buildAutoReviewPlanSequence(editablePlanLessons, { autoInsertReviewLessons })
    : (contentPlanPreview?.lessonSequence || []);

  return (
    <div className="space-y-8 max-w-5xl">
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full hover:bg-secondary">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-foreground">Edit Unit</h1>
            <p className="text-muted-foreground font-medium">Refine unit details and generate lessons.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setIsBulkDialogOpen(true)} className="h-11 rounded-xl border-2 font-bold hover:bg-purple-50 hover:text-purple-600 transition-all">
            <Sparkles className="mr-2 h-5 w-5 text-purple-600" />
            Bulk Generate Lessons
          </Button>
          <Button type="button" variant="outline" onClick={() => setIsGenerateContentDialogOpen(true)} className="h-11 rounded-xl border-2 font-bold hover:bg-emerald-50 hover:text-emerald-600 transition-all">
            <Sparkles className="mr-2 h-5 w-5 text-emerald-600" />
            Generate Full Unit
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setRevisionMode("refactor");
              setIsReviseDialogOpen(true);
            }}
            className="h-11 rounded-xl border-2 font-bold hover:bg-sky-50 hover:text-sky-600 transition-all"
          >
            <Wand2 className="mr-2 h-5 w-5 text-sky-600" />
            Refactor Unit
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setRevisionMode("regenerate");
              setIsReviseDialogOpen(true);
            }}
            className="h-11 rounded-xl border-2 font-bold hover:bg-rose-50 hover:text-rose-600 transition-all"
          >
            <RefreshCcw className="mr-2 h-5 w-5 text-rose-600" />
            Regenerate Unit
          </Button>
          <Button asChild variant="outline" className="h-11 rounded-xl border-2 font-bold">
            <Link href={`/lessons/new?chapterId=${chapterId}&unitId=${id}`}>
              <Plus className="mr-2 h-4 w-4" />
              Add Lesson
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-11 rounded-xl border-2 font-bold">
            <Link href={`/units/${id}/deleted`}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Deleted Entries
            </Link>
          </Button>
          <Button type="submit" form="unit-edit-form" disabled={isSaving || isPublished} className="h-11 rounded-xl px-6 font-bold shadow-lg shadow-primary/20 transition-all hover:scale-[1.02]">
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Unit Details</CardTitle>
        </CardHeader>

        <form id="unit-edit-form" onSubmit={handleSave}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="title">Title</Label>
                <Button type="button" variant="outline" size="sm" onClick={handleAiSuggest} disabled={isSuggesting || isPublished}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  AI Suggest
                </Button>
              </div>
              <Input id="title" value={title} onChange={(event) => setTitle(event.target.value)} required disabled={isPublished} />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="level">Level</Label>
                <Select value={level} onValueChange={(value) => setLevel(value as Level)} disabled={isPublished}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">Beginner</SelectItem>
                    <SelectItem value="intermediate">Intermediate</SelectItem>
                    <SelectItem value="advanced">Advanced</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Chapter</Label>
                <Select value={chapterId} onValueChange={setChapterId} disabled={isPublished}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select chapter" />
                  </SelectTrigger>
                  <SelectContent>
                    {chapters.map((chapter) => (
                      <SelectItem key={chapter._id} value={chapter._id}>
                        {chapter.orderIndex + 1}. {chapter.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedChapter ? (
                  <p className="text-xs text-muted-foreground">{selectedChapter.description || "No chapter description."}</p>
                ) : null}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Language</Label>
                <Input value={String(tutorLanguage).toUpperCase()} disabled />
              </div>

              <div className="space-y-2">
                <Label>Unit Kind</Label>
                <Select value={kind} onValueChange={(value) => setKind(value as Unit["kind"])} disabled={isPublished}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="core">Core unit</SelectItem>
                    <SelectItem value="review">Review unit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" value={description} onChange={(event) => setDescription(event.target.value)} rows={5} disabled={isPublished} />
            </div>

            {kind === "review" ? (
              <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                <div className="space-y-2">
                  <Label>Review Style</Label>
                  <Select value={reviewStyle} onValueChange={(value) => setReviewStyle(value as Unit["reviewStyle"])} disabled={isPublished}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="star">Star review</SelectItem>
                      <SelectItem value="gym">Gym review</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Review Source Units</Label>
                  <div className="space-y-2 rounded-lg border bg-background p-3">
                    {chapterUnits.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No other units exist in this chapter yet.</p>
                    ) : (
                      chapterUnits.map((candidate) => (
                        <label key={candidate._id} className="flex items-start gap-3 text-sm">
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={reviewSourceUnitIds.includes(candidate._id)}
                            onChange={() =>
                              setReviewSourceUnitIds((current) =>
                                current.includes(candidate._id)
                                  ? current.filter((unitId) => unitId !== candidate._id)
                                  : [...current, candidate._id]
                              )
                            }
                            disabled={isPublished}
                          />
                          <span>
                            <span className="font-medium">{candidate.orderIndex + 1}. {candidate.title}</span>
                            <span className="ml-2 inline-flex gap-2 text-xs">
                              <Badge variant="outline">{candidate.kind}</Badge>
                              <Badge variant="outline">{candidate.level}</Badge>
                            </span>
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </CardContent>

          <CardFooter className="justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
          </CardFooter>
        </form>
      </Card>

      {lastAiRun ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-xl font-bold">
              {lastAiRun.mode === "generate"
                ? "Last Generation Result"
                : lastAiRun.mode === "refactor"
                  ? "Last Refactor Result"
                  : "Last Regeneration Result"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-xl border p-3">
                <div className="text-xs text-muted-foreground">Lessons Created</div>
                <div className="text-2xl font-bold">{lastAiRun.createdLessons}</div>
              </div>
              {lastAiRun.updatedLessons !== undefined ? (
                <div className="rounded-xl border p-3">
                  <div className="text-xs text-muted-foreground">Lessons Updated</div>
                  <div className="text-2xl font-bold">{lastAiRun.updatedLessons}</div>
                </div>
              ) : null}
              <div className="rounded-xl border p-3">
                <div className="text-xs text-muted-foreground">Content Errors</div>
                <div className="text-2xl font-bold">{lastAiRun.contentErrors.length}</div>
              </div>
              <div className="rounded-xl border p-3">
                <div className="text-xs text-muted-foreground">Skipped Lessons</div>
                <div className="text-2xl font-bold">{lastAiRun.skippedLessons.length}</div>
              </div>
            </div>

            <Table>
              <TableHeader className="bg-primary/5">
                <TableRow>
                  <TableHead>Lesson</TableHead>
                  <TableHead className="text-right">Sentences</TableHead>
                  <TableHead className="text-right">New Selected</TableHead>
                  <TableHead className="text-right">Review Selected</TableHead>
                  <TableHead className="text-right">Dropped</TableHead>
                  <TableHead className="text-right">Questions</TableHead>
                  <TableHead className="text-right">Blocks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lastAiRun.lessons.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-20 text-center text-muted-foreground">
                      No lesson details returned.
                    </TableCell>
                  </TableRow>
                ) : (
                  lastAiRun.lessons.map((lesson) => (
                    <TableRow key={lesson.lessonId}>
                      <TableCell className="font-medium">{lesson.title}</TableCell>
                      <TableCell className="text-right">{lesson.sentencesGenerated}</TableCell>
                      <TableCell className="text-right">{lesson.newContentSelected}</TableCell>
                      <TableCell className="text-right">{lesson.reviewContentSelected}</TableCell>
                      <TableCell className="text-right">{lesson.contentDroppedFromCandidates}</TableCell>
                      <TableCell className="text-right">{lesson.questionsGenerated}</TableCell>
                      <TableCell className="text-right">{lesson.blocksGenerated}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xl font-bold text-primary">Unit Lessons</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTableControls
            search={lessonSearch}
            onSearchChange={setLessonSearch}
            page={lessonPage}
            limit={lessonLimit}
            onLimitChange={(value) => {
              setLessonLimit(value);
              setLessonPage(1);
            }}
            totalPages={lessonTotalPages}
            total={lessonTotal}
            label="Search lessons"
            onPrev={() => setLessonPage((prev) => Math.max(1, prev - 1))}
            onNext={() => setLessonPage((prev) => Math.min(lessonTotalPages, prev + 1))}
          />

          <Table>
            <TableHeader className="bg-primary/5">
              <TableRow>
                <TableHead className="pl-8">Order</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Level</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead className="text-right pr-8">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingLessons ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">Loading lessons...</TableCell>
                </TableRow>
              ) : lessons.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">No lessons for this unit yet.</TableCell>
                </TableRow>
              ) : (
                lessons.map((lesson) => (
                  <TableRow key={lesson._id} className="group transition-colors hover:bg-secondary/30">
                    <TableCell className="pl-8">{lesson.orderIndex + 1}</TableCell>
                    <TableCell className="font-bold text-foreground">{lesson.title}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{lesson.level}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={workflowStatusBadgeClass(lesson.status)}>{lesson.status}</Badge>
                    </TableCell>
                    <TableCell>{new Date(lesson.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right pr-8">
                      <div className="flex justify-end gap-1">
                        {lesson.status === "draft" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Mark as finished"
                            className={TABLE_ACTION_ICON_CLASS.finish}
                            onClick={() => handleFinishLesson(lesson._id)}
                          >
                            <Send className="h-4 w-4 text-orange-600" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" asChild title="Edit lesson" className={TABLE_ACTION_ICON_CLASS.edit}>
                          <Link href={`/lessons/${lesson._id}`}>
                            <Edit className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button variant="ghost" size="icon" asChild title="View expressions" className={TABLE_ACTION_ICON_CLASS.view}>
                          <Link href={`/expressions/lang/${tutorLanguage}?lessonId=${lesson._id}`}>
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isBulkDialogOpen} onOpenChange={setIsBulkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>AI Bulk Lesson Generation</DialogTitle>
            <DialogDescription>
              Generate multiple draft lessons for this unit.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label>Count (1-20)</Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={bulkCount}
                onChange={(event) => setBulkCount(Number(event.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Theme (optional)</Label>
              <Input
                value={bulkTopic}
                onChange={(event) => setBulkTopic(event.target.value)}
                placeholder="Greetings, food, transport, etc."
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsBulkDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleBulkGenerateLessons} disabled={isGeneratingBulk}>
              {isGeneratingBulk ? "Generating..." : "Generate Lessons"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isGenerateContentDialogOpen} onOpenChange={handleGenerateContentDialogChange}>
        <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Generate Full Unit Content</DialogTitle>
            <DialogDescription>
              Preview the AI lesson plan first, edit it, then approve generation. Review lessons are inserted automatically after every two core lessons.
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto pr-2">
            <div className="grid grid-cols-4 gap-3">
              <div className="space-y-2">
                <Label>Lessons</Label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={contentLessonCount}
                  onChange={(event) => {
                    setContentLessonCount(Number(event.target.value));
                    resetContentPlanEditor();
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>New Targets / Lesson</Label>
                <Input
                  type="number"
                  min={1}
                  max={2}
                  value={contentNewTargetsPerLesson}
                  onChange={(event) => {
                    setContentNewTargetsPerLesson(Number(event.target.value));
                    resetContentPlanEditor();
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Review Items / Lesson</Label>
                <Input
                  type="number"
                  min={0}
                  max={4}
                  value={contentReviewContentPerLesson}
                  onChange={(event) => {
                    setContentReviewContentPerLesson(Number(event.target.value));
                    resetContentPlanEditor();
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Proverbs / Lesson</Label>
                <Input
                  type="number"
                  min={0}
                  max={10}
                  value={contentProverbsPerLesson}
                  onChange={(event) => {
                    setContentProverbsPerLesson(Number(event.target.value));
                    resetContentPlanEditor();
                  }}
                />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              New targets are the new words and expressions taught in Stage 1. Sentences are generated from those targets and used later in the lesson.
            </p>
            <div className="space-y-2">
              <Label>Theme (optional)</Label>
              <Input
                value={contentTopic}
                onChange={(event) => {
                  setContentTopic(event.target.value);
                  resetContentPlanEditor();
                }}
                placeholder="Greetings, family, market, travel..."
              />
            </div>
            <div className="space-y-2">
              <Label>Extra AI Description (optional)</Label>
              <Textarea
                value={contentExtraInstructions}
                onChange={(event) => {
                  setContentExtraInstructions(event.target.value);
                  resetContentPlanEditor();
                }}
                rows={3}
                placeholder="Only beginner words, avoid idioms, focus on everyday dialogue..."
              />
            </div>
            {contentPlanPreview ? (
              <div className="grid gap-4 border rounded-xl p-4 bg-muted/20">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Editable core lesson plan</p>
                    <p className="text-sm text-muted-foreground">
                      {autoInsertReviewLessons
                        ? `${contentPlanPreview.requestedLessons} core lessons planned, ${displayedPlanSequence.length} actual lessons after automatic review insertion.`
                        : `${contentPlanPreview.requestedLessons} review-unit lessons planned with no extra auto-inserted review lessons.`}
                    </p>
                  </div>
                  <Badge variant="outline">{displayedPlanSequence.length} lesson slots</Badge>
                </div>
                <div className="grid gap-3">
                  {editablePlanLessons.map((lesson, index) => (
                    <div key={`plan-lesson-${index}`} className="grid gap-3 rounded-lg border bg-background p-4">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="font-semibold text-foreground">Core Lesson {index + 1}</h3>
                        <Badge variant="outline">Editable</Badge>
                      </div>
                      <div className="space-y-2">
                        <Label>Title</Label>
                        <Input
                          value={lesson.title}
                          onChange={(event) => updateEditablePlanLesson(index, { title: event.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Description</Label>
                        <Textarea
                          rows={2}
                          value={lesson.description || ""}
                          onChange={(event) => updateEditablePlanLesson(index, { description: event.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Focus Summary</Label>
                        <Textarea
                          rows={2}
                          value={lesson.focusSummary || ""}
                          onChange={(event) => updateEditablePlanLesson(index, { focusSummary: event.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Objectives</Label>
                        <Textarea
                          rows={3}
                          value={joinPlanLines(lesson.objectives)}
                          onChange={(event) => updateEditablePlanLesson(index, { objectives: normalizePlanLines(event.target.value) })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Conversation Goal</Label>
                        <Textarea
                          rows={2}
                          value={lesson.conversationGoal}
                          onChange={(event) => updateEditablePlanLesson(index, { conversationGoal: event.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Situations</Label>
                        <Textarea
                          rows={3}
                          value={joinPlanLines(lesson.situations)}
                          onChange={(event) => updateEditablePlanLesson(index, { situations: normalizePlanLines(event.target.value) })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Sentence Goals</Label>
                        <Textarea
                          rows={3}
                          value={joinPlanLines(lesson.sentenceGoals)}
                          onChange={(event) => updateEditablePlanLesson(index, { sentenceGoals: normalizePlanLines(event.target.value) })}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Actual lesson sequence</p>
                    <p className="text-sm text-muted-foreground">
                      {autoInsertReviewLessons
                        ? "Review lessons are backend-generated and read-only here."
                        : "Review units do not auto-insert extra review lessons inside the unit."}
                    </p>
                  </div>
                  <div className="grid gap-2">
                    {displayedPlanSequence.map((lesson, index) => (
                      <div key={`lesson-sequence-${index}`} className="flex items-start justify-between gap-3 rounded-lg border bg-background px-3 py-2">
                        <div className="min-w-0">
                          <p className="font-medium text-foreground">
                            {index + 1}. {lesson.title}
                          </p>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {lesson.description || "No description"}
                          </p>
                        </div>
                        <Badge variant={lesson.lessonMode === "review" ? "secondary" : "outline"}>
                          {lesson.lessonMode}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                Preview the AI lesson plan first. Generation will only run after you approve the edited plan.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleGenerateContentDialogChange(false)}>
              Cancel
            </Button>
            <Button type="button" variant="outline" onClick={handlePreviewUnitContentPlan} disabled={isPreviewingContentPlan || isGeneratingContent}>
              {isPreviewingContentPlan ? "Previewing..." : contentPlanPreview ? "Regenerate AI Plan" : "Preview AI Plan"}
            </Button>
            <Button type="button" onClick={handleGenerateUnitContent} disabled={isGeneratingContent || isPreviewingContentPlan || !contentPlanPreview}>
              {isGeneratingContent ? "Generating..." : "Generate From Edited Plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isReviseDialogOpen} onOpenChange={setIsReviseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{revisionMode === "refactor" ? "Targeted Refactor with AI" : "Regenerate Unit with AI"}</DialogTitle>
            <DialogDescription>
              {revisionMode === "refactor"
                ? "AI will inspect the current lessons, propose targeted fixes, and apply precise block or content changes without clearing the unit."
                : "AI will clear the current unit lessons and generate a fresh version of this unit from scratch."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="revise-lesson-count">Lesson count</Label>
                <Input id="revise-lesson-count" type="number" min={1} max={20} value={contentLessonCount} onChange={(event) => setContentLessonCount(Number(event.target.value || 0))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="revise-target-content-per-lesson">New Targets / Lesson</Label>
                <Input id="revise-sentences-per-lesson" type="number" min={1} max={2} value={contentNewTargetsPerLesson} onChange={(event) => setContentNewTargetsPerLesson(Number(event.target.value || 0))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="revise-review-content-per-lesson">Review Items / Lesson</Label>
                <Input id="revise-review-content-per-lesson" type="number" min={0} max={4} value={contentReviewContentPerLesson} onChange={(event) => setContentReviewContentPerLesson(Number(event.target.value || 0))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="revise-proverbs-per-lesson">Proverbs / lesson</Label>
                <Input id="revise-proverbs-per-lesson" type="number" min={0} max={10} value={contentProverbsPerLesson} onChange={(event) => setContentProverbsPerLesson(Number(event.target.value || 0))} />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              New targets control how many new words and expressions each lesson teaches before shifting into sentence exercises and review.
            </p>
            <div className="space-y-2">
              <Label htmlFor="revise-topic">Topic focus</Label>
              <Input id="revise-topic" value={contentTopic} onChange={(event) => setContentTopic(event.target.value)} placeholder="Optional focus for this revision" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="revise-extra-instructions">Extra instructions</Label>
              <Textarea
                id="revise-extra-instructions"
                rows={5}
                value={contentExtraInstructions}
                onChange={(event) => setContentExtraInstructions(event.target.value)}
                placeholder={revisionMode === "refactor" ? "Examples: replace Ku osan with E kaasan, move the listening block to Stage 3, add a short helper text after Stage 1." : "Tell AI what to change in the regenerated unit."}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsReviseDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleReviseUnitContent} disabled={isRevisingContent}>
              {isRevisingContent ? "Running..." : revisionMode === "refactor" ? "Refactor Unit" : "Regenerate Unit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
