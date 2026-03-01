'use client'

import { useState } from "react";
import { useRouter } from "next/navigation";
import { lessonService, authService, aiService } from "@/services";
import { Level } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowLeft, Sparkles, Plus, Trash } from "lucide-react";

export default function NewLessonPage() {
  const [title, setTitle] = useState("");
  const [level, setLevel] = useState<Level>("beginner");
  const [description, setDescription] = useState("");
  const [topicsInput, setTopicsInput] = useState("");
  const [proverbs, setProverbs] = useState<Array<{ text: string; translation: string; contextNote: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);

  const router = useRouter();

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
      
      await lessonService.createLesson({ title, level, description, topics, proverbs });
      const tutor = authService.getTutorProfile();
      toast.success("Lesson created");
      router.push(`/lessons/lang/${tutor?.language || "yoruba"}`);
    } catch {
      toast.error("Failed to create lesson");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAISuggest = async () => {
    if (!title.trim()) {
      toast.error("Please enter a title first");
      return;
    }

    setIsSuggesting(true);
    try {
      const tutor = authService.getTutorProfile();
      const suggestion = await aiService.suggestLesson(title, tutor?.language || "yoruba", level);
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
        <h1 className="text-3xl font-bold">New Lesson</h1>
      </div>

      <Card className="max-w-2xl">
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
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Greeting and Introductions"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="level">Level</Label>
              <Select value={level} onValueChange={(v) => setLevel(v as Level)}>
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
              <Label htmlFor="topics">Topics (comma-separated)</Label>
              <Input
                id="topics"
                value={topicsInput}
                onChange={(e) => setTopicsInput(e.target.value)}
                placeholder="greetings, introductions"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What will students learn in this lesson?"
                rows={4}
              />
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="font-bold text-sm">Proverbs</Label>
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
                <div key={index} className="p-4 border-2 rounded-xl space-y-3 relative group bg-muted/5">
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
                    <Label htmlFor={`proverb-text-${index}`} className="text-xs font-bold">Proverb Text</Label>
                    <Input
                      id={`proverb-text-${index}`}
                      value={proverb.text}
                      onChange={(e) => handleProverbChange(index, "text", e.target.value)}
                      placeholder="Original text..."
                      className="h-10 border-2 rounded-lg"
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor={`proverb-trans-${index}`} className="text-xs font-bold">Translation</Label>
                      <Input
                        id={`proverb-trans-${index}`}
                        value={proverb.translation}
                        onChange={(e) => handleProverbChange(index, "translation", e.target.value)}
                        placeholder="English translation..."
                        className="h-10 border-2 rounded-lg"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`proverb-note-${index}`} className="text-xs font-bold">Context/Note</Label>
                      <Input
                        id={`proverb-note-${index}`}
                        value={proverb.contextNote}
                        onChange={(e) => handleProverbChange(index, "contextNote", e.target.value)}
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
          <CardFooter className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Creating..." : "Create Lesson"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
