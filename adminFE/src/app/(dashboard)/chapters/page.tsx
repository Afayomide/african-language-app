'use client'

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { chapterService } from "@/services";
import { Chapter, Language, Level, Status } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { workflowStatusBadgeClass } from "@/lib/status-badge";
import { TABLE_ACTION_ICON_CLASS } from "@/lib/tableActionStyles";
import { CheckCircle, Edit, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

const LANGUAGE_LABELS: Record<Language, string> = {
  yoruba: "Yoruba",
  igbo: "Igbo",
  hausa: "Hausa"
};

const LEVEL_LABELS: Record<Level, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced"
};

export default function ChaptersPage() {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [language, setLanguage] = useState<Language>("yoruba");
  const [status, setStatus] = useState<"all" | Status>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isAiDialogOpen, setIsAiDialogOpen] = useState(false);
  const [editingChapter, setEditingChapter] = useState<Chapter | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [level, setLevel] = useState<Level>("beginner");
  const [isSaving, setIsSaving] = useState(false);
  const [generationLevel, setGenerationLevel] = useState<Level>("beginner");
  const [generationCount, setGenerationCount] = useState("5");
  const [generationTopic, setGenerationTopic] = useState("");
  const [generationInstructions, setGenerationInstructions] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const loadChapters = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await chapterService.listChapters(status === "all" ? undefined : status, language);
      setChapters(data.sort((a, b) => a.orderIndex - b.orderIndex));
    } catch {
      toast.error("Failed to fetch chapters.");
    } finally {
      setIsLoading(false);
    }
  }, [language, status]);

  useEffect(() => {
    void loadChapters();
  }, [loadChapters]);

  function openCreateDialog() {
    setEditingChapter(null);
    setTitle("");
    setDescription("");
    setLevel("beginner");
    setIsDialogOpen(true);
  }

  function openAiDialog() {
    setGenerationLevel("beginner");
    setGenerationCount("5");
    setGenerationTopic("");
    setGenerationInstructions("");
    setIsAiDialogOpen(true);
  }

  function openEditDialog(chapter: Chapter) {
    setEditingChapter(chapter);
    setTitle(chapter.title);
    setDescription(chapter.description || "");
    setLevel(chapter.level);
    setIsDialogOpen(true);
  }

  async function handleSave() {
    if (!title.trim()) {
      toast.error("Chapter title is required.");
      return;
    }

    try {
      setIsSaving(true);
      if (editingChapter) {
        await chapterService.updateChapter(editingChapter._id, {
          title: title.trim(),
          description: description.trim(),
          level
        });
        toast.success("Chapter updated.");
      } else {
        await chapterService.createChapter({
          title: title.trim(),
          description: description.trim(),
          language,
          level
        });
        toast.success("Chapter created.");
      }
      setIsDialogOpen(false);
      await loadChapters();
    } catch {
      toast.error("Failed to save chapter.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(chapterId: string) {
    if (!confirm("Delete this chapter?")) return;
    try {
      await chapterService.deleteChapter(chapterId);
      toast.success("Chapter deleted.");
      await loadChapters();
    } catch {
      toast.error("Failed to delete chapter.");
    }
  }

  async function handleFinish(chapterId: string) {
    try {
      await chapterService.finishChapter(chapterId);
      toast.success("Chapter marked as finished.");
      await loadChapters();
    } catch {
      toast.error("Failed to update chapter status.");
    }
  }

  async function handlePublish(chapterId: string) {
    try {
      await chapterService.publishChapter(chapterId);
      toast.success("Chapter published.");
      await loadChapters();
    } catch {
      toast.error("Failed to publish chapter.");
    }
  }

  async function handleGenerateAi() {
    const count = Number(generationCount);
    if (Number.isNaN(count) || count < 1 || count > 20) {
      toast.error("Count must be between 1 and 20.");
      return;
    }

    try {
      setIsGenerating(true);
      const result = await chapterService.generateBulkChapters({
        language,
        level: generationLevel,
        count,
        topic: generationTopic.trim() || undefined,
        extraInstructions: generationInstructions.trim() || undefined
      });
      toast.success(`Created ${result.createdCount} chapters`);
      setIsAiDialogOpen(false);
      await loadChapters();
    } catch {
      toast.error("Failed to generate chapters.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground">Chapters</h1>
          <p className="text-muted-foreground font-medium">Organize units under chapter-level curriculum sections first.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openAiDialog} className="h-11 rounded-xl px-5 font-semibold">
            <Sparkles className="mr-2 h-4 w-4" />
            Generate with AI
          </Button>
          <Button onClick={openCreateDialog} className="h-11 rounded-xl px-5 font-semibold">
            <Plus className="mr-2 h-4 w-4" />
            Create Chapter
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle>Curriculum Chapters</CardTitle>
            <CardDescription>Use chapters as the parent container for units and lessons.</CardDescription>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Language</Label>
              <Select value={language} onValueChange={(value) => setLanguage(value as Language)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yoruba">Yoruba</SelectItem>
                  <SelectItem value="igbo">Igbo</SelectItem>
                  <SelectItem value="hausa">Hausa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as "all" | Status)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
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
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Level</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-28 text-center text-muted-foreground">Loading chapters...</TableCell>
                </TableRow>
              ) : chapters.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-28 text-center text-muted-foreground">No chapters created yet.</TableCell>
                </TableRow>
              ) : (
                chapters.map((chapter) => (
                  <TableRow key={chapter._id}>
                    <TableCell>{chapter.orderIndex + 1}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-semibold">{chapter.title}</div>
                        <div className="text-xs text-muted-foreground">{chapter.description || "No description"}</div>
                      </div>
                    </TableCell>
                    <TableCell>{LEVEL_LABELS[chapter.level]}</TableCell>
                    <TableCell>
                      <Badge className={workflowStatusBadgeClass(chapter.status)}>{chapter.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-2">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/units?language=${chapter.language}&chapterId=${chapter._id}`}>Open Units</Link>
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(chapter)} className={TABLE_ACTION_ICON_CLASS.edit} title="Edit">
                          <Edit className="h-4 w-4" />
                        </Button>
                        {chapter.status === "draft" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => void handleFinish(chapter._id)}
                            className={TABLE_ACTION_ICON_CLASS.finish}
                            title="Finish"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                        )}
                        {chapter.status === "finished" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => void handlePublish(chapter._id)}
                            className={TABLE_ACTION_ICON_CLASS.publish}
                            title="Publish"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => void handleDelete(chapter._id)} className={TABLE_ACTION_ICON_CLASS.delete} title="Delete">
                          <Trash2 className="h-4 w-4" />
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

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingChapter ? "Edit Chapter" : "Create Chapter"}</DialogTitle>
            <DialogDescription>
              Chapters are the top curriculum layer. Units and lessons should live under them.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="chapter-title">Title</Label>
              <Input id="chapter-title" value={title} onChange={(event) => setTitle(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Language</Label>
              <Input value={LANGUAGE_LABELS[language]} disabled />
            </div>
            <div className="space-y-2">
              <Label>Level</Label>
              <Select value={level} onValueChange={(value) => setLevel(value as Level)}>
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
              <Label htmlFor="chapter-description">Description</Label>
              <Textarea id="chapter-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={4} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleSave()} disabled={isSaving}>{isSaving ? "Saving..." : "Save Chapter"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isAiDialogOpen} onOpenChange={setIsAiDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Chapters with AI</DialogTitle>
            <DialogDescription>
              Generate draft chapters for the current language. Use the theme field to steer the chapter set.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Language</Label>
              <Input value={LANGUAGE_LABELS[language]} disabled />
            </div>
            <div className="space-y-2">
              <Label>Level</Label>
              <Select value={generationLevel} onValueChange={(value) => setGenerationLevel(value as Level)}>
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
              <Label htmlFor="chapter-generate-count">Count</Label>
              <Input
                id="chapter-generate-count"
                type="number"
                min={1}
                max={20}
                value={generationCount}
                onChange={(event) => setGenerationCount(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="chapter-generate-topic">Theme (Optional)</Label>
              <Input
                id="chapter-generate-topic"
                value={generationTopic}
                onChange={(event) => setGenerationTopic(event.target.value)}
                placeholder="e.g. starting a conversation, everyday routines"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="chapter-generate-instructions">Extra Instructions (Optional)</Label>
              <Textarea
                id="chapter-generate-instructions"
                rows={4}
                value={generationInstructions}
                onChange={(event) => setGenerationInstructions(event.target.value)}
                placeholder="e.g. Keep the progression practical and communicative."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAiDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleGenerateAi()} disabled={isGenerating}>
              {isGenerating ? "Generating..." : "Generate Chapters"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
