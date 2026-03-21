'use client'

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { aiService, chapterService, unitService } from "@/services";
import { Chapter, Language, Level, Unit } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export default function NewUnitPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialLanguage = searchParams.get("language");
  const initialChapterId = searchParams.get("chapterId") || "";

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [language, setLanguage] = useState<Language>(
    initialLanguage === "igbo" || initialLanguage === "hausa" || initialLanguage === "yoruba"
      ? initialLanguage
      : "yoruba"
  );
  const [level, setLevel] = useState<Level>("beginner");
  const [chapterId, setChapterId] = useState(initialChapterId);
  const [kind, setKind] = useState<Unit["kind"]>("core");
  const [reviewStyle, setReviewStyle] = useState<Unit["reviewStyle"]>("star");
  const [reviewSourceUnitIds, setReviewSourceUnitIds] = useState<string[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [reviewCandidates, setReviewCandidates] = useState<Unit[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);

  useEffect(() => {
    async function loadChapters() {
      try {
        const data = await chapterService.listChapters(undefined, language);
        setChapters(data);
        if (!chapterId && data.length > 0) {
          setChapterId(data[0]._id);
        }
      } catch {
        toast.error("Failed to fetch chapters.");
      }
    }

    void loadChapters();
  }, [language, chapterId]);

  useEffect(() => {
    async function loadUnits() {
      if (!chapterId) {
        setReviewCandidates([]);
        return;
      }

      try {
        const data = await unitService.listUnits({ language, chapterId });
        setReviewCandidates(data);
      } catch {
        toast.error("Failed to load units for review selection.");
      }
    }

    void loadUnits();
  }, [chapterId, language]);

  useEffect(() => {
    setReviewSourceUnitIds((current) => current.filter((id) => reviewCandidates.some((unit) => unit._id === id)));
  }, [reviewCandidates]);

  const selectedChapter = useMemo(
    () => chapters.find((chapter) => chapter._id === chapterId) || null,
    [chapterId, chapters]
  );

  function toggleReviewSourceUnit(unitId: string) {
    setReviewSourceUnitIds((current) =>
      current.includes(unitId) ? current.filter((id) => id !== unitId) : [...current, unitId]
    );
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!title.trim()) {
      toast.error("Title is required.");
      return;
    }
    if (!chapterId) {
      toast.error("Select a chapter first.");
      return;
    }
    if (kind === "review" && reviewSourceUnitIds.length === 0) {
      toast.error("Select at least one source unit for a review unit.");
      return;
    }

    try {
      setIsSaving(true);
      const created = await unitService.createUnit({
        title: title.trim(),
        description: description.trim(),
        language,
        level,
        chapterId,
        kind,
        reviewStyle: kind === "review" ? reviewStyle : "none",
        reviewSourceUnitIds: kind === "review" ? reviewSourceUnitIds : []
      });
      toast.success("Unit created.");
      router.push(`/units/${created._id}`);
    } catch {
      toast.error("Failed to create unit.");
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
      const suggestion = await aiService.suggestLesson(title.trim(), language, level);
      if (suggestion.title && suggestion.title.trim()) {
        setTitle(suggestion.title.trim());
      }
      if (suggestion.description && suggestion.description.trim()) {
        setDescription(suggestion.description.trim());
      }
      toast.success("AI suggestion applied.");
    } catch {
      toast.error("Failed to generate AI suggestion.");
    } finally {
      setIsSuggesting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Create New Unit</h1>
          <p className="text-sm text-muted-foreground">Units now belong to a chapter and can be marked as core or review.</p>
        </div>
      </div>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Unit Details</CardTitle>
        </CardHeader>

        <form onSubmit={handleCreate}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="title">Title</Label>
                <Button type="button" variant="outline" size="sm" onClick={handleAiSuggest} disabled={isSuggesting}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  AI Suggest
                </Button>
              </div>
              <Input id="title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Morning greetings" required />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Language</Label>
                <Select value={language} onValueChange={(value) => setLanguage(value as Language)}>
                  <SelectTrigger>
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
                <Label>Kind</Label>
                <Select value={kind} onValueChange={(value) => setKind(value as Unit["kind"])}>
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
              <Label>Chapter</Label>
              <Select value={chapterId} onValueChange={setChapterId}>
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
                <p className="text-xs text-muted-foreground">{selectedChapter.description || "This chapter has no description yet."}</p>
              ) : (
                <p className="text-xs text-destructive">Create a chapter first before creating units.</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" value={description} onChange={(event) => setDescription(event.target.value)} rows={5} placeholder="Describe what this unit should teach." />
            </div>

            {kind === "review" ? (
              <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                <div className="space-y-2">
                  <Label>Review Style</Label>
                  <Select value={reviewStyle} onValueChange={(value) => setReviewStyle(value as Unit["reviewStyle"])}>
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
                    {reviewCandidates.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No other units available in this chapter yet.</p>
                    ) : (
                      reviewCandidates.map((unit) => (
                        <label key={unit._id} className="flex items-start gap-3 text-sm">
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={reviewSourceUnitIds.includes(unit._id)}
                            onChange={() => toggleReviewSourceUnit(unit._id)}
                          />
                          <span>
                            <span className="font-medium">{unit.orderIndex + 1}. {unit.title}</span>
                            <span className="ml-2 inline-flex gap-2">
                              <Badge variant="outline">{unit.kind}</Badge>
                              <Badge variant="outline">{unit.level}</Badge>
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
            <Button type="submit" disabled={isSaving || !chapterId}>
              {isSaving ? "Creating..." : "Create Unit"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
