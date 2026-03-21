'use client'

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { aiService, chapterService, lessonService, unitService } from "@/services";
import { Chapter, Language, Level, Unit } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Sparkles, ArrowLeft, Plus, Trash } from "lucide-react";

export default function NewLessonPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialLanguage = searchParams.get("language");
  const initialChapterId = searchParams.get("chapterId") || "";
  const initialUnitId = searchParams.get("unitId") || "";
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState<Language>(
    initialLanguage === "igbo" || initialLanguage === "hausa" || initialLanguage === "yoruba"
      ? initialLanguage
      : "yoruba"
  );
  const [chapterId, setChapterId] = useState(initialChapterId);
  const [unitId, setUnitId] = useState(initialUnitId);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [description, setDescription] = useState("");
  const [topicsInput, setTopicsInput] = useState("");
  const [proverbs, setProverbs] = useState<Array<{ text: string; translation: string; contextNote: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);

  useEffect(() => {
    const loadChapters = async () => {
      try {
        const data = await chapterService.listChapters(undefined, language);
        setChapters(data);
        if (!chapterId && data.length > 0) {
          setChapterId(data[0]._id);
        }
      } catch {
        toast.error("Failed to fetch chapters");
      }
    };
    void loadChapters();
  }, [chapterId, language]);

  useEffect(() => {
    const loadUnits = async () => {
      try {
        const data = await unitService.listUnits({ language, chapterId: chapterId || undefined });
        setUnits(data);
        if (initialUnitId) {
          setUnitId(initialUnitId);
        } else if (data.length > 0 && !data.some((unit) => unit._id === unitId)) {
          setUnitId(data[0]._id);
        }
      } catch {
        toast.error("Failed to fetch units");
      }
    };
    void loadUnits();
  }, [chapterId, initialUnitId, language, unitId]);

  const selectedUnit = useMemo(() => units.find((unit) => unit._id === unitId) || null, [unitId, units]);

  const handleAddProverb = () => {
    setProverbs([...proverbs, { text: "", translation: "", contextNote: "" }]);
  };

  const handleProverbChange = (index: number, field: keyof typeof proverbs[0], value: string) => {
    const updated = [...proverbs];
    updated[index] = { ...updated[index], [field]: value };
    setProverbs(updated);
  };

  const handleRemoveProverb = (index: number) => {
    setProverbs(proverbs.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const topics = topicsInput
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      if (!chapterId) {
        toast.error("Select a chapter");
        return;
      }
      if (!unitId) {
        toast.error("Select a unit");
        return;
      }
      const lesson = await lessonService.createLesson({ title, unitId, description, topics, proverbs });
      toast.success("Lesson created");
      router.push(`/lessons/${lesson._id}`);
    } catch (error: any) {
      toast.error(error.response?.data?.error || "Failed to create lesson");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAISuggest = async () => {
    if (!title) {
      toast.error("Please enter a title first");
      return;
    }
    setIsSuggesting(true);
    try {
      const level = (selectedUnit?.level || "beginner") as Level;
      const suggestion = await aiService.suggestLesson(title, language, level);
      if (suggestion.title) setTitle(suggestion.title);
      if (suggestion.description) setDescription(suggestion.description);
      if (Array.isArray(suggestion.proverbs)) {
        const newProverbs = suggestion.proverbs.map((p: any) => {
          if (typeof p === "string") return { text: p, translation: "", contextNote: "" };
          return {
            text: p.text || "",
            translation: p.translation || "",
            contextNote: p.contextNote || "",
          };
        });
        setProverbs(newProverbs);
      }
      toast.success("AI suggestion applied");
    } catch {
      toast.error("AI suggestion failed");
    } finally {
      setIsSuggesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">New Lesson</h1>
          <p className="text-sm text-muted-foreground">Choose the chapter first, then place the lesson inside the correct unit.</p>
        </div>
      </div>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Lesson Details</CardTitle>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="title">Title</Label>
                <Button type="button" variant="outline" size="sm" onClick={handleAISuggest} disabled={isSuggesting}>
                  <Sparkles className="mr-2 h-4 w-4 text-purple-600" />
                  {isSuggesting ? "Suggesting..." : "AI Suggest"}
                </Button>
              </div>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Greeting and Introductions" required />
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
              </div>

              <div className="space-y-2">
                <Label>Unit</Label>
                <Select value={unitId} onValueChange={setUnitId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {units.map((unit) => (
                      <SelectItem key={unit._id} value={unit._id}>
                        {unit.orderIndex + 1}. {unit.title} ({unit.kind})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="topics">Topics (comma-separated)</Label>
              <Input id="topics" value={topicsInput} onChange={(e) => setTopicsInput(e.target.value)} placeholder="greetings, introductions" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What will students learn in this lesson?" rows={4} />
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="font-bold text-sm">Proverbs</Label>
                <Button type="button" variant="outline" size="sm" onClick={handleAddProverb} className="h-8 border-2 font-bold hover:bg-primary/5 text-primary">
                  <Plus className="mr-1 h-4 w-4" />
                  Add Proverb
                </Button>
              </div>

              {proverbs.map((proverb, index) => (
                <div key={index} className="p-4 border-2 rounded-xl space-y-3 relative group bg-muted/5">
                  <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveProverb(index)} className="absolute top-2 right-2 h-8 w-8 text-muted-foreground hover:text-red-600 hover:bg-red-50">
                    <Trash className="h-4 w-4" />
                  </Button>

                  <div className="space-y-2">
                    <Label htmlFor={`proverb-text-${index}`} className="text-xs font-bold">Proverb Text</Label>
                    <Input id={`proverb-text-${index}`} value={proverb.text} onChange={(e) => handleProverbChange(index, "text", e.target.value)} placeholder="Original text..." className="h-10 border-2 rounded-lg" />
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor={`proverb-trans-${index}`} className="text-xs font-bold">Translation</Label>
                      <Input id={`proverb-trans-${index}`} value={proverb.translation} onChange={(e) => handleProverbChange(index, "translation", e.target.value)} placeholder="English translation..." className="h-10 border-2 rounded-lg" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`proverb-note-${index}`} className="text-xs font-bold">Context/Note</Label>
                      <Input id={`proverb-note-${index}`} value={proverb.contextNote} onChange={(e) => handleProverbChange(index, "contextNote", e.target.value)} placeholder="Optional context..." className="h-10 border-2 rounded-lg" />
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
          <CardFooter className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !chapterId || !unitId}>
              {isLoading ? "Creating..." : "Create Lesson"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
