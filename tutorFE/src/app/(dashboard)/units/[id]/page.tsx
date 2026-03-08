'use client'

import { useEffect, useMemo, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { aiService, authService, lessonService, unitService } from "@/services";
import { Lesson, Level, Unit } from "@/types";
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
import { Sparkles, ArrowLeft, Edit, ExternalLink, Plus, Send } from "lucide-react";
import { toast } from "sonner";

export default function EditUnitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const tutor = authService.getTutorProfile();
  const tutorLanguage = tutor?.language || "yoruba";

  const [unit, setUnit] = useState<Unit | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [level, setLevel] = useState<Level>("beginner");
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
  const [contentPhrasesPerLesson, setContentPhrasesPerLesson] = useState(8);
  const [contentProverbsPerLesson, setContentProverbsPerLesson] = useState(2);
  const [contentTopic, setContentTopic] = useState("");
  const [contentExtraInstructions, setContentExtraInstructions] = useState("");

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
      } catch (error) {
        toast.error("Failed to load unit.")
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [id]);

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
        level
      });
      toast.success("Unit updated.");
      router.push("/units");
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

  async function handleGenerateUnitContent() {
    try {
      setIsGeneratingContent(true);
      const result = await aiService.generateUnitContent(id, {
        lessonCount: contentLessonCount,
        phrasesPerLesson: contentPhrasesPerLesson,
        proverbsPerLesson: contentProverbsPerLesson,
        topics: contentTopic.trim() ? [contentTopic.trim()] : undefined,
        extraInstructions: contentExtraInstructions.trim() || undefined
      });
      toast.success(
        `Generated content for ${result.createdLessons} lessons (${result.contentErrors.length} content errors).`
      );
      setIsGenerateContentDialogOpen(false);
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
      toast.error("Failed to generate full unit content.");
    } finally {
      setIsGeneratingContent(false);
    }
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
          <Button asChild variant="outline" className="h-11 rounded-xl border-2 font-bold">
            <Link href={`/lessons/new?unitId=${id}`}>
              <Plus className="mr-2 h-4 w-4" />
              Add Lesson
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Language</Label>
                <Input value={String(tutorLanguage).toUpperCase()} disabled />
              </div>

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
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" value={description} onChange={(event) => setDescription(event.target.value)} rows={5} disabled={isPublished} />
            </div>
          </CardContent>

          <CardFooter className="justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
          </CardFooter>
        </form>
      </Card>

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
                        <Button variant="ghost" size="icon" asChild title="View phrases" className={TABLE_ACTION_ICON_CLASS.view}>
                          <Link href={`/phrases/lang/${tutorLanguage}?lessonId=${lesson._id}`}>
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

      <Dialog open={isGenerateContentDialogOpen} onOpenChange={setIsGenerateContentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Full Unit Content</DialogTitle>
            <DialogDescription>
              Creates lessons with phrases, proverbs, questions, and lesson flow blocks in draft state.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Lessons</Label>
                <Input type="number" min={1} max={20} value={contentLessonCount} onChange={(event) => setContentLessonCount(Number(event.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>Phrases / Lesson</Label>
                <Input type="number" min={2} max={30} value={contentPhrasesPerLesson} onChange={(event) => setContentPhrasesPerLesson(Number(event.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>Proverbs / Lesson</Label>
                <Input type="number" min={0} max={10} value={contentProverbsPerLesson} onChange={(event) => setContentProverbsPerLesson(Number(event.target.value))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Theme (optional)</Label>
              <Input value={contentTopic} onChange={(event) => setContentTopic(event.target.value)} placeholder="Greetings, family, market, travel..." />
            </div>
            <div className="space-y-2">
              <Label>Extra AI Description (optional)</Label>
              <Textarea value={contentExtraInstructions} onChange={(event) => setContentExtraInstructions(event.target.value)} rows={3} placeholder="Only beginner words, avoid idioms, focus on everyday dialogue..." />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsGenerateContentDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleGenerateUnitContent} disabled={isGeneratingContent}>
              {isGeneratingContent ? "Generating..." : "Generate Full Unit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
