"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import {
  lessonService,
  aiService,
  expressionService,
  questionService,
} from "@/services";
import { Lesson, Language, Level, Expression, ExerciseQuestion, LessonAuditResult } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ArrowLeft,
  Save,
  CheckCircle,
  Sparkles,
  Edit,
  Trash,
  Volume2,
  Plus,
  Mic,
  LayoutList,
  BookOpen,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DataTableControls } from "@/components/common/data-table-controls";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { workflowStatusBadgeClass } from "@/lib/status-badge";
import { TABLE_ACTION_ICON_CLASS, TABLE_BULK_BUTTON_CLASS } from "@/lib/tableActionStyles";

export default function EditLessonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGenerateDialogOpen, setIsGenerateDialogOpen] = useState(false);
  const [extraInstructions, setExtraInstructions] = useState("");
  const [isRefactorDialogOpen, setIsRefactorDialogOpen] = useState(false);
  const [isRefactoring, setIsRefactoring] = useState(false);
  const [lessonRefactorTopic, setLessonRefactorTopic] = useState("");
  const [lessonRefactorInstructions, setLessonRefactorInstructions] = useState("");
  const [topicsInput, setTopicsInput] = useState("");
  const [proverbs, setProverbs] = useState<
    Array<{ text: string; translation: string; contextNote: string }>
  >([]);
  const [phrases, setExpressions] = useState<Expression[]>([]);
  const [isLoadingExpressions, setIsLoadingExpressions] = useState(false);
  const [phraseSearch, setExpressionSearch] = useState("");
  const [phrasePage, setExpressionPage] = useState(1);
  const [phraseLimit, setExpressionLimit] = useState(20);
  const [phraseTotal, setExpressionTotal] = useState(0);
  const [phraseTotalPages, setExpressionTotalPages] = useState(1);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
  const [questions, setQuestions] = useState<ExerciseQuestion[]>([]);
  const [selectedExpressionIds, setSelectedExpressionIds] = useState<string[]>([]);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [audit, setAudit] = useState<LessonAuditResult | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);

  const handleAddProverb = () => {
    setProverbs([...proverbs, { text: "", translation: "", contextNote: "" }]);
  };

  const handleProverbChange = (
    index: number,
    field: keyof (typeof proverbs)[0],
    value: string,
  ) => {
    const updated = [...proverbs];
    updated[index] = { ...updated[index], [field]: value };
    setProverbs(updated);
  };

  const handleRemoveProverb = (index: number) => {
    setProverbs(proverbs.filter((_, i) => i !== index));
  };

  useEffect(() => {
    fetchLesson();
  }, [id]);

  useEffect(() => {
    if (!lesson?._id) return;
    fetchLessonExpressions(lesson._id);
  }, [lesson?._id, phraseSearch, phrasePage, phraseLimit]);

  useEffect(() => {
    if (!lesson?._id) return;
    fetchLessonQuestions(lesson._id);
  }, [lesson?._id]);

  useEffect(() => {
    setExpressionPage(1);
  }, [phraseSearch, lesson?._id]);

  useEffect(() => {
    setSelectedExpressionIds((prev) =>
      prev.filter((item) => phrases.some((phrase) => phrase._id === item)),
    );
  }, [phrases]);

  useEffect(() => {
    setSelectedQuestionIds((prev) =>
      prev.filter((item) => questions.some((question) => question._id === item)),
    );
  }, [questions]);

  async function fetchLesson() {
    try {
      const data = await lessonService.getLesson(id);
      setLesson({
        ...data,
        topics: Array.isArray(data.topics) ? data.topics : [],
      });
      setTopicsInput(Array.isArray(data.topics) ? data.topics.join(", ") : "");
      setProverbs(Array.isArray(data.proverbs) ? data.proverbs : []);
    } catch (error) {
      toast.error("Failed to fetch lesson");
      router.push("/lessons");
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchLessonExpressions(lessonId: string) {
    setIsLoadingExpressions(true);
    try {
      const data = await expressionService.listExpressionsPage({
        lessonId,
        q: phraseSearch || undefined,
        page: phrasePage,
        limit: phraseLimit,
      });
      setExpressions(
        [...data.items].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
      );
      setExpressionTotal(data.total);
      setExpressionTotalPages(data.pagination.totalPages);
    } catch (error) {
      toast.error("Failed to fetch lesson expressions");
    } finally {
      setIsLoadingExpressions(false);
    }
  }

  async function fetchLessonQuestions(lessonId: string) {
    setIsLoadingQuestions(true);
    try {
      const data = await questionService.listQuestions({ lessonId });
      setQuestions(
        [...data].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
      );
    } catch (error) {
      toast.error("Failed to fetch lesson questions");
    } finally {
      setIsLoadingQuestions(false);
    }
  }

  async function fetchLessonAudit() {
    setIsAuditing(true);
    try {
      const data = await lessonService.auditLesson(id);
      setAudit(data);
      toast.success(data.ok ? "Lesson audit passed" : "Lesson audit found issues");
      return data;
    } catch (error) {
      toast.error("Failed to audit lesson");
      return null;
    } finally {
      setIsAuditing(false);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lesson) return;
    setIsSaving(true);
    try {
      const topics = topicsInput
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      await lessonService.updateLesson(id, {
        title: lesson.title,
        language: lesson.language,
        level: lesson.level,
        description: lesson.description,
        topics,
        proverbs,
      });
      toast.success("Lesson updated");
    } catch (error) {
      toast.error("Failed to update lesson");
    } finally {
      setIsSaving(false);
    }
  };

  const handleFinishLesson = async () => {
    try {
      const auditResult = await fetchLessonAudit();
      if (!auditResult?.ok) {
        toast.error("Fix the lesson audit errors before sending it to admin");
        return;
      }
      await lessonService.finishLesson(id);
      toast.success("Lesson sent to admin for publish");
      fetchLesson();
    } catch (error) {
      toast.error("Failed to mark lesson as finished");
    }
  };

  const handleRequestAudio = async () => {
    try {
      await lessonService.requestLessonAudio(id);
      toast.success("Audio requested for this lesson");
    } catch {
      toast.error("Failed to request audio");
    }
  };

  const handleFinishQuestion = async (questionId: string) => {
    try {
      await questionService.finishQuestion(questionId);
      toast.success("Question published");
      if (lesson?._id) {
        const refreshed = await questionService.listQuestions({
          lessonId: lesson._id,
        });
        setQuestions(refreshed);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || "Failed to publish question");
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    if (!confirm("Delete this question?")) return;
    try {
      await questionService.deleteQuestion(questionId);
      toast.success("Question deleted");
      if (lesson?._id) {
        const refreshed = await questionService.listQuestions({
          lessonId: lesson._id,
        });
        setQuestions(refreshed);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || "Failed to delete question");
    }
  };

  const handleAISuggest = async () => {
    if (!lesson) return;
    if (!lesson.title) {
      toast.error("Add a title first");
      return;
    }
    setIsSuggesting(true);
    try {
      const suggestion = await aiService.suggestLesson(
        lesson.title,
        lesson.language,
        lesson.level,
      );
      setLesson({
        ...lesson,
        title: suggestion.title || lesson.title,
        description: suggestion.description || lesson.description,
      });
      if (Array.isArray(suggestion.proverbs)) {
        const newProverbs = suggestion.proverbs.map((p: any) => {
          if (typeof p === "string")
            return { text: p, translation: "", contextNote: "" };
          return {
            text: p.text || "",
            translation: p.translation || "",
            contextNote: p.contextNote || "",
          };
        });
        setProverbs(newProverbs);
      }
      toast.success("AI suggestion applied");
    } catch (error) {
      toast.error("AI suggestion failed");
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleGenerateExpressions = async () => {
    if (!lesson) return;
    setIsGenerating(true);
    try {
      await aiService.generateExpressions(
        lesson._id,
        lesson.level,
        undefined,
        extraInstructions.trim() || undefined,
      );
      toast.success("AI expressions generated");
      setIsGenerateDialogOpen(false);
      fetchLessonExpressions(lesson._id);
    } catch (error) {
      toast.error("AI phrase generation failed");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRefactorLesson = async () => {
    setIsRefactoring(true);
    try {
      const result = await aiService.refactorLessonContent(id, {
        topic: lessonRefactorTopic.trim() || undefined,
        extraInstructions: lessonRefactorInstructions.trim() || undefined,
      });
      await fetchLesson();
      if (lesson?._id) {
        await Promise.all([
          fetchLessonExpressions(lesson._id),
          fetchLessonQuestions(lesson._id),
        ]);
      }
      setIsRefactorDialogOpen(false);
      toast.success(
        result.updatedLesson
          ? `Lesson refactored with ${result.patch?.operations?.length || 0} targeted changes`
          : "AI found no targeted lesson changes to apply",
      );
    } catch (error: any) {
      toast.error(error.response?.data?.error || "Failed to refactor lesson");
    } finally {
      setIsRefactoring(false);
    }
  };

  const handleDeleteExpression = async (expressionId: string) => {
    if (!confirm("Delete this expression?")) return;
    try {
      await expressionService.deleteExpression(expressionId);
      toast.success("Expression deleted");
      if (lesson) fetchLessonExpressions(lesson._id);
    } catch (error) {
      toast.error("Failed to delete phrase");
    }
  };

  const toggleExpressionSelection = (expressionId: string) => {
    setSelectedExpressionIds((prev) =>
      prev.includes(expressionId)
        ? prev.filter((id) => id !== expressionId)
        : [...prev, expressionId],
    );
  };

  const toggleSelectAllExpressions = () => {
    if (selectedExpressionIds.length === phrases.length) {
      setSelectedExpressionIds([]);
      return;
    }
    setSelectedExpressionIds(phrases.map((phrase) => phrase._id));
  };

  const toggleQuestionSelection = (questionId: string) => {
    setSelectedQuestionIds((prev) =>
      prev.includes(questionId)
        ? prev.filter((id) => id !== questionId)
        : [...prev, questionId],
    );
  };

  const toggleSelectAllQuestions = () => {
    if (selectedQuestionIds.length === questions.length) {
      setSelectedQuestionIds([]);
      return;
    }
    setSelectedQuestionIds(questions.map((question) => question._id));
  };

  const handleBulkDeleteExpressions = async () => {
    if (selectedExpressionIds.length === 0) return;
    if (!confirm(`Delete ${selectedExpressionIds.length} selected phrase(s)?`)) return;
    try {
      await Promise.all(selectedExpressionIds.map((expressionId) => expressionService.deleteExpression(expressionId)));
      toast.success("Selected expressions deleted");
      setSelectedExpressionIds([]);
      if (lesson?._id) await fetchLessonExpressions(lesson._id);
    } catch (error) {
      toast.error("Failed to delete selected expressions");
    }
  };

  const handleBulkFinishExpressions = async () => {
    const finishable = phrases
      .filter((phrase) => selectedExpressionIds.includes(phrase._id) && phrase.status === "draft")
      .map((phrase) => phrase._id);
    if (finishable.length === 0) {
      toast.error("No selected draft expressions to finish");
      return;
    }
    try {
      await Promise.all(finishable.map((expressionId) => expressionService.finishExpression(expressionId)));
      toast.success(`Marked ${finishable.length} phrase(s) as finished`);
      setSelectedExpressionIds([]);
      if (lesson?._id) await fetchLessonExpressions(lesson._id);
    } catch (error) {
      toast.error("Failed to mark selected phrases as finished");
    }
  };

  const handleBulkDeleteQuestions = async () => {
    if (selectedQuestionIds.length === 0) return;
    if (!confirm(`Delete ${selectedQuestionIds.length} selected question(s)?`)) return;
    try {
      await Promise.all(selectedQuestionIds.map((questionId) => questionService.deleteQuestion(questionId)));
      toast.success("Selected questions deleted");
      setSelectedQuestionIds([]);
      if (lesson?._id) await fetchLessonQuestions(lesson._id);
    } catch (error) {
      toast.error("Failed to delete selected questions");
    }
  };

  const handleBulkFinishQuestions = async () => {
    const finishable = questions
      .filter((question) => selectedQuestionIds.includes(question._id) && question.status === "draft")
      .map((question) => question._id);
    if (finishable.length === 0) {
      toast.error("No selected draft questions to finish");
      return;
    }
    try {
      await Promise.all(finishable.map((questionId) => questionService.finishQuestion(questionId)));
      toast.success(`Marked ${finishable.length} question(s) as finished`);
      setSelectedQuestionIds([]);
      if (lesson?._id) await fetchLessonQuestions(lesson._id);
    } catch (error) {
      toast.error("Failed to mark selected questions as finished");
    }
  };

  const handleFinishExpression = async (expressionId: string) => {
    try {
      await expressionService.finishExpression(expressionId);
      toast.success("Expression sent to admin for publish");
      if (lesson) fetchLessonExpressions(lesson._id);
    } catch (error) {
      toast.error("Failed to mark phrase as finished");
    }
  };

  const handlePlayAudio = (url: string) => {
    const audio = new Audio(url);
    void audio.play().catch(() => toast.error("Unable to play audio"));
  };

  if (isLoading) return <div>Loading...</div>;
  if (!lesson) return <div>Lesson not found</div>;

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push(`/lessons/lang/${lesson.language}`)}
            className="rounded-full hover:bg-secondary"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-foreground">
              Edit Lesson
            </h1>
            <p className="text-muted-foreground font-medium">
              Refine your lesson content and AI settings.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => void fetchLessonAudit()}
            disabled={isAuditing}
            className="h-11 rounded-xl border-2 font-bold"
          >
            {isAuditing ? "Auditing..." : "Audit Lesson"}
          </Button>
          <Dialog
            open={isRefactorDialogOpen}
            onOpenChange={setIsRefactorDialogOpen}
          >
            <DialogTrigger asChild>
              <Button
                variant="outline"
                className="h-11 rounded-xl border-2 font-bold hover:bg-emerald-50 hover:text-emerald-700 transition-all"
              >
                <Sparkles className="mr-2 h-5 w-5 text-emerald-600" />
                Refactor Lesson
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Targeted Lesson Refactor</DialogTitle>
                <DialogDescription>
                  Ask AI for precise lesson fixes like replacing a phrase, moving a block, or adding helper text.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="lesson-refactor-topic">
                    Topic focus (optional)
                  </Label>
                  <Input
                    id="lesson-refactor-topic"
                    value={lessonRefactorTopic}
                    onChange={(event) =>
                      setLessonRefactorTopic(event.target.value)
                    }
                    placeholder="Optional focus for this refactor"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lesson-refactor-instructions">
                    Extra instructions
                  </Label>
                  <Textarea
                    id="lesson-refactor-instructions"
                    value={lessonRefactorInstructions}
                    onChange={(event) =>
                      setLessonRefactorInstructions(event.target.value)
                    }
                    rows={5}
                    placeholder="Examples: replace Ku osan with E kaasan, remove the old phrase bundle, add a short helper text after Stage 1."
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsRefactorDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleRefactorLesson}
                  disabled={isRefactoring}
                >
                  {isRefactoring ? "Refactoring..." : "Run Refactor"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog
            open={isGenerateDialogOpen}
            onOpenChange={setIsGenerateDialogOpen}
          >
            <DialogTrigger asChild>
              <Button
                variant="outline"
                className="h-11 rounded-xl border-2 font-bold hover:bg-purple-50 hover:text-purple-600 transition-all"
              >
                <Sparkles className="mr-2 h-5 w-5 text-purple-600" />
                Generate Expressions
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Generate Expressions With AI</DialogTitle>
                <DialogDescription>
                  Add optional generation guidance before creating expressions.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="extraInstructions">
                  Extra AI Description (Optional)
                </Label>
                <Textarea
                  id="extraInstructions"
                  value={extraInstructions}
                  onChange={(event) => setExtraInstructions(event.target.value)}
                  placeholder='e.g. "Only single words for this lesson"'
                  rows={4}
                />
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsGenerateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button onClick={handleGenerateExpressions} disabled={isGenerating}>
                  {isGenerating ? "Generating..." : "Generate"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          {lesson.status === "draft" && (
            <Button
              variant="outline"
              onClick={handleFinishLesson}
              className="h-11 rounded-xl border-2 font-bold hover:bg-amber-50 hover:text-amber-600 transition-all"
            >
              <CheckCircle className="mr-2 h-5 w-5 text-amber-600" />
              Mark as Finished
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => router.push(`/lessons/${id}/flow`)}
            className="h-11 rounded-xl border-2 font-bold hover:bg-blue-50 hover:text-blue-600 transition-all border-blue-200 text-blue-600"
          >
            <LayoutList className="mr-2 h-5 w-5" />
            Build Lesson Flow
          </Button>
          <Button
            variant="outline"
            onClick={() => router.push(`/lessons/${id}/review`)}
            className="h-11 rounded-xl border-2 font-bold hover:bg-violet-50 hover:text-violet-700 transition-all border-violet-200 text-violet-700"
          >
            <BookOpen className="mr-2 h-5 w-5" />
            Review Lesson Flow
          </Button>
          <Button
            variant="outline"
            onClick={handleRequestAudio}
            className="h-11 rounded-xl border-2 font-bold hover:bg-violet-50 hover:text-violet-700 transition-all border-violet-200 text-violet-700"
          >
            <Mic className="mr-2 h-5 w-5" />
            Request Audio
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSaving}
            className="h-11 rounded-xl px-6 font-bold shadow-lg shadow-primary/20 transition-all hover:scale-[1.02]"
          >
            <Save className="mr-2 h-5 w-5" />
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card className="border-2 border-primary/10 shadow-xl rounded-3xl overflow-hidden">
            <CardHeader className="bg-primary/5 pb-8 pt-8">
              <CardTitle className="text-2xl font-bold text-primary">
                Lesson Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 pt-8 px-8">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="title"
                    className="font-bold text-xs uppercase tracking-wider text-muted-foreground ml-1"
                  >
                    Title
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleAISuggest}
                    disabled={isSuggesting}
                    className="text-purple-600 hover:text-purple-700 hover:bg-purple-50 font-bold"
                  >
                    <Sparkles className="mr-2 h-4 w-4" />
                    {isSuggesting ? "Suggesting..." : "AI Suggest Improvements"}
                  </Button>
                </div>
                <Input
                  id="title"
                  value={lesson.title}
                  onChange={(e) =>
                    setLesson({ ...lesson, title: e.target.value })
                  }
                  required
                  className="h-12 border-2 rounded-xl focus-visible:ring-primary text-lg font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label
                    htmlFor="language"
                    className="font-bold text-xs uppercase tracking-wider text-muted-foreground ml-1"
                  >
                    Language
                  </Label>
                  <Select
                    value={lesson.language}
                    onValueChange={(v) =>
                      setLesson({ ...lesson, language: v as Language })
                    }
                    disabled
                  >
                    <SelectTrigger className="h-12 border-2 rounded-xl font-bold">
                      <SelectValue placeholder="Select language" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="yoruba" className="font-medium">
                        Yoruba
                      </SelectItem>
                      <SelectItem value="igbo" className="font-medium">
                        Igbo
                      </SelectItem>
                      <SelectItem value="hausa" className="font-medium">
                        Hausa
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  <Label
                    htmlFor="level"
                    className="font-bold text-xs uppercase tracking-wider text-muted-foreground ml-1"
                  >
                    Level
                  </Label>
                  <Select
                    value={lesson.level}
                    onValueChange={(v) =>
                      setLesson({ ...lesson, level: v as Level })
                    }
                  >
                    <SelectTrigger className="h-12 border-2 rounded-xl font-bold">
                      <SelectValue placeholder="Select level" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="beginner" className="font-medium">
                        Beginner
                      </SelectItem>
                      <SelectItem value="intermediate" className="font-medium">
                        Intermediate
                      </SelectItem>
                      <SelectItem value="advanced" className="font-medium">
                        Advanced
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-3">
                <Label
                  htmlFor="topics"
                  className="font-bold text-xs uppercase tracking-wider text-muted-foreground ml-1"
                >
                  Topics
                </Label>
                <Input
                  id="topics"
                  value={topicsInput}
                  onChange={(e) => setTopicsInput(e.target.value)}
                  className="h-12 border-2 rounded-xl focus-visible:ring-primary font-medium"
                  placeholder="greetings, introductions"
                />
              </div>

              <div className="space-y-3">
                <Label
                  htmlFor="description"
                  className="font-bold text-xs uppercase tracking-wider text-muted-foreground ml-1"
                >
                  Description
                </Label>
                <Textarea
                  id="description"
                  value={lesson.description}
                  onChange={(e) =>
                    setLesson({ ...lesson, description: e.target.value })
                  }
                  rows={6}
                  className="border-2 rounded-xl focus-visible:ring-primary font-medium"
                />
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="font-bold text-xs uppercase tracking-wider text-muted-foreground ml-1">
                    Proverbs
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddProverb}
                    className="h-8 border-2 font-bold hover:bg-primary/5 text-primary"
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Add Proverb
                  </Button>
                </div>

                {proverbs.map((proverb, index) => (
                  <div
                    key={index}
                    className="p-4 border-2 rounded-xl space-y-3 relative group bg-muted/5"
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveProverb(index)}
                      className="absolute top-2 right-2 h-8 w-8 text-muted-foreground hover:text-red-600 hover:bg-red-50"
                    >
                      <Trash className="h-4 w-4" />
                    </Button>

                    <div className="space-y-2">
                      <Label
                        htmlFor={`proverb-text-${index}`}
                        className="text-xs font-bold"
                      >
                        Proverb Text
                      </Label>
                      <Input
                        id={`proverb-text-${index}`}
                        value={proverb.text}
                        onChange={(e) =>
                          handleProverbChange(index, "text", e.target.value)
                        }
                        placeholder="Original text..."
                        className="h-10 border-2 rounded-lg"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label
                          htmlFor={`proverb-trans-${index}`}
                          className="text-xs font-bold"
                        >
                          Translation
                        </Label>
                        <Input
                          id={`proverb-trans-${index}`}
                          value={proverb.translation}
                          onChange={(e) =>
                            handleProverbChange(
                              index,
                              "translation",
                              e.target.value,
                            )
                          }
                          placeholder="English translation..."
                          className="h-10 border-2 rounded-lg"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label
                          htmlFor={`proverb-note-${index}`}
                          className="text-xs font-bold"
                        >
                          Context/Note
                        </Label>
                        <Input
                          id={`proverb-note-${index}`}
                          value={proverb.contextNote}
                          onChange={(e) =>
                            handleProverbChange(
                              index,
                              "contextNote",
                              e.target.value,
                            )
                          }
                          placeholder="Optional context..."
                          className="h-10 border-2 rounded-lg"
                        />
                      </div>
                    </div>
                  </div>
                ))}

                {proverbs.length === 0 && (
                  <div className="text-center py-6 border-2 border-dashed rounded-xl text-muted-foreground">
                    No proverbs added to this lesson yet.
                  </div>
                )}
              </div>
            </CardContent>
            <CardFooter className="bg-muted/20 p-8">
              <p className="text-sm text-muted-foreground font-medium italic">
                Tip: Use the AI Suggest button to automatically generate a
                professional title and description based on your title.
              </p>
            </CardFooter>
          </Card>
        </div>

        <div className="lg:col-span-1 space-y-6">
          <Card className="border-2 border-accent/20 shadow-lg rounded-3xl overflow-hidden">
            <CardHeader className="bg-accent/5">
              <CardTitle className="text-xl font-bold text-accent">
                Status & Info
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-muted-foreground font-bold text-sm uppercase">
                  Current Status
                </span>
                <Badge className={workflowStatusBadgeClass(lesson.status)}>
                  {lesson.status}
                </Badge>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-muted-foreground font-bold text-sm uppercase">
                  Created
                </span>
                <span className="font-medium">
                  {new Date(lesson.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-muted-foreground font-bold text-sm uppercase">
                  Order Index
                </span>
                <span className="font-black text-xl text-primary">
                  {lesson.orderIndex + 1}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2 border-orange-200 shadow-lg rounded-3xl overflow-hidden">
            <CardHeader className="bg-orange-50">
              <CardTitle className="text-xl font-bold text-orange-700">Lesson Audit</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              {!audit ? (
                <p className="text-sm text-muted-foreground">
                  Run a lesson audit to check stage balance, listening coverage, and question quality.
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Badge className={audit.ok ? "bg-green-500" : "bg-red-500"}>
                      {audit.ok ? "Ready to Finish" : "Needs Fixes"}
                    </Badge>
                    <Badge variant="secondary">Errors: {audit.errors}</Badge>
                    <Badge variant="secondary">Warnings: {audit.warnings}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>Stages: <span className="font-bold">{audit.metrics.stageCount}</span></div>
                    <div>Blocks: <span className="font-bold">{audit.metrics.blockCount}</span></div>
                    <div>Content Items: <span className="font-bold">{audit.metrics.uniqueContentCount}</span></div>
                    <div>Questions: <span className="font-bold">{audit.metrics.questionCount}</span></div>
                    <div>Listening: <span className="font-bold">{audit.metrics.listeningQuestionCount}</span></div>
                    <div>Scenario: <span className="font-bold">{audit.metrics.scenarioQuestionCount}</span></div>
                  </div>
                  <div className="max-h-64 space-y-2 overflow-y-auto">
                    {audit.findings.length === 0 ? (
                      <p className="text-sm text-green-700">No issues found.</p>
                    ) : (
                      audit.findings.map((finding, index) => (
                        <div
                          key={`${finding.code}-${index}`}
                          className={finding.severity === "error" ? "rounded-xl border border-red-200 bg-red-50 p-3" : "rounded-xl border border-amber-200 bg-amber-50 p-3"}
                        >
                          <div className="mb-1 flex items-center gap-2">
                            <Badge className={finding.severity === "error" ? "bg-red-500" : "bg-amber-500"}>
                              {finding.severity}
                            </Badge>
                            <span className="text-xs font-bold uppercase text-muted-foreground">
                              {finding.code.replaceAll("_", " ")}
                            </span>
                          </div>
                          <p className="text-sm">{finding.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="border-2 border-primary/10 shadow-xl rounded-3xl overflow-hidden">
        <CardHeader className="bg-primary/5">
          <CardTitle className="text-xl font-bold text-primary">
            Lesson Expressions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTableControls
            search={phraseSearch}
            onSearchChange={setExpressionSearch}
            page={phrasePage}
            limit={phraseLimit}
            onLimitChange={(value) => {
              setExpressionLimit(value);
              setExpressionPage(1);
            }}
            totalPages={phraseTotalPages}
            total={phraseTotal}
            label="Search expressions"
            onPrev={() => setExpressionPage((prev) => Math.max(1, prev - 1))}
            onNext={() =>
              setExpressionPage((prev) => Math.min(phraseTotalPages, prev + 1))
            }
          />
          <div className="mb-4 mt-4 flex justify-end">
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleBulkDeleteExpressions}
                disabled={selectedExpressionIds.length === 0}
                className={TABLE_BULK_BUTTON_CLASS.delete}
              >
                Bulk Delete ({selectedExpressionIds.length})
              </Button>
              <Button
                variant="outline"
                onClick={handleBulkFinishExpressions}
                disabled={selectedExpressionIds.length === 0}
                className={TABLE_BULK_BUTTON_CLASS.finish}
              >
                Bulk Finish
              </Button>
              <Button
                onClick={() =>
                  router.push(
                    `/expressions/new?language=${lesson.language}&lessonId=${lesson._id}`,
                  )
                }
              >
                Add Expression
              </Button>
            </div>
          </div>
          <Table>
            <TableHeader className="bg-primary/5">
              <TableRow>
                <TableHead className="w-12 pl-8">
                  <input
                    type="checkbox"
                    checked={
                      phrases.length > 0 &&
                      selectedExpressionIds.length === phrases.length
                    }
                    onChange={toggleSelectAllExpressions}
                  />
                </TableHead>
                <TableHead className="font-bold text-primary pl-8">
                  Text
                </TableHead>
                <TableHead className="font-bold text-primary">
                  Translation
                </TableHead>
                <TableHead className="font-bold text-primary">Status</TableHead>
                <TableHead className="font-bold text-primary">
                  Created At
                </TableHead>
                <TableHead className="font-bold text-primary">
                  Updated At
                </TableHead>
                <TableHead className="text-right font-bold text-primary pr-8">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingExpressions ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    Loading expressions...
                  </TableCell>
                </TableRow>
              ) : phrases.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    No expressions for this lesson yet.
                  </TableCell>
                </TableRow>
              ) : (
                phrases.map((phrase) => (
                  <TableRow
                    key={phrase._id}
                    className="group transition-colors hover:bg-secondary/30"
                  >
                    <TableCell className="pl-8">
                      <input
                        type="checkbox"
                        checked={selectedExpressionIds.includes(phrase._id)}
                        onChange={() => toggleExpressionSelection(phrase._id)}
                      />
                    </TableCell>
                    <TableCell className="pl-8 font-bold text-foreground">
                      {phrase.text}
                    </TableCell>
                    <TableCell>{phrase.translations.join(" | ")}</TableCell>
                    <TableCell>
                      <Badge
                        className={workflowStatusBadgeClass(phrase.status)}
                      >
                        {phrase.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(phrase.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {new Date(phrase.updatedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="pr-8 text-right">
                      <div className="flex justify-end gap-1">
                        {phrase.audio?.url ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handlePlayAudio(phrase.audio.url)}
                            title="Play audio"
                            className={TABLE_ACTION_ICON_CLASS.play}
                          >
                            <Volume2 className="h-4 w-4" />
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => router.push(`/expressions/${phrase._id}`)}
                          title="Edit"
                          className={TABLE_ACTION_ICON_CLASS.edit}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        {phrase.status === "draft" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleFinishExpression(phrase._id)}
                            title="Mark as finished"
                            className={TABLE_ACTION_ICON_CLASS.finish}
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteExpression(phrase._id)}
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
        </CardContent>
      </Card>

      <Card className="border-2 border-primary/10 shadow-xl rounded-3xl overflow-hidden">
        <CardHeader className="bg-primary/5">
          <CardTitle className="text-xl font-bold text-primary">
            Lesson Questions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 mt-4 flex justify-end">
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleBulkDeleteQuestions}
                disabled={selectedQuestionIds.length === 0}
                className={TABLE_BULK_BUTTON_CLASS.delete}
              >
                Bulk Delete ({selectedQuestionIds.length})
              </Button>
              <Button
                variant="outline"
                onClick={handleBulkFinishQuestions}
                disabled={selectedQuestionIds.length === 0}
                className={TABLE_BULK_BUTTON_CLASS.finish}
              >
                Bulk Finish
              </Button>
              <Button onClick={() => router.push("/questions")}>
                Add Question
              </Button>
            </div>
          </div>
          <Table>
            <TableHeader className="bg-primary/5">
              <TableRow>
                <TableHead className="w-12 pl-8">
                  <input
                    type="checkbox"
                    checked={
                      questions.length > 0 &&
                      selectedQuestionIds.length === questions.length
                    }
                    onChange={toggleSelectAllQuestions}
                  />
                </TableHead>
                <TableHead className="font-bold text-primary pl-8">
                  Type
                </TableHead>
                <TableHead className="font-bold text-primary">Prompt</TableHead>
                <TableHead className="font-bold text-primary">Expression</TableHead>
                <TableHead className="font-bold text-primary">Status</TableHead>
                <TableHead className="font-bold text-primary">
                  Created At
                </TableHead>
                <TableHead className="font-bold text-primary">
                  Updated At
                </TableHead>
                <TableHead className="text-right font-bold text-primary pr-8">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {questions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center">
                    No questions for this lesson yet.
                  </TableCell>
                </TableRow>
              ) : (
                questions.map((question) => (
                  <TableRow
                    key={question._id}
                    className="group transition-colors hover:bg-secondary/30"
                  >
                    <TableCell className="pl-8">
                      <input
                        type="checkbox"
                        checked={selectedQuestionIds.includes(question._id)}
                        onChange={() => toggleQuestionSelection(question._id)}
                      />
                    </TableCell>
                    <TableCell className="pl-8 font-bold text-foreground capitalize">
                      {question.type.replaceAll("-", " ")}
                    </TableCell>
                    <TableCell>{question.promptTemplate}</TableCell>
                    <TableCell>
                      {(typeof question.source === "string" ? question.source : question.source?.text) || "-"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={workflowStatusBadgeClass(question.status)}
                      >
                        {question.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(question.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {new Date(question.updatedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="pr-8 text-right">
                      <div className="flex justify-end gap-1">
                        {question.status === "draft" && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleFinishQuestion(question._id)}
                              title="Publish"
                              className={TABLE_ACTION_ICON_CLASS.finish}
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            router.push(`/questions/${question._id}`)
                          }
                          title="Edit"
                          className={TABLE_ACTION_ICON_CLASS.edit}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteQuestion(question._id)}
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
        </CardContent>
      </Card>
    </div>
  );
}
