'use client'

import { useState } from "react";
import { useRouter } from "next/navigation";
import { aiService, authService, unitService } from "@/services";
import { Level } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export default function NewUnitPage() {
  const router = useRouter();
  const tutor = authService.getTutorProfile();
  const tutorLanguage = tutor?.language || "yoruba";

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [level, setLevel] = useState<Level>("beginner");
  const [isSaving, setIsSaving] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!title.trim()) {
      toast.error("Title is required.");
      return;
    }

    try {
      setIsSaving(true);
      await unitService.createUnit({
        title: title.trim(),
        description: description.trim(),
        level
      });
      toast.success("Unit created.");
      router.push("/units");
    } catch (error) {
      toast.error("Failed to create unit.")
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
      if (suggestion.title && suggestion.title.trim()) {
        setTitle(suggestion.title.trim());
      }
      if (suggestion.description && suggestion.description.trim()) {
        setDescription(suggestion.description.trim());
      }
      toast.success("AI suggestion applied.");
    } catch (error) {
      toast.error("Failed to generate AI suggestion.")
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
        <h1 className="text-3xl font-bold">Create New Unit</h1>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Unit Details</CardTitle>
        </CardHeader>

        <form onSubmit={handleCreate}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="title">Title</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAiSuggest}
                  disabled={isSuggesting}
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  AI Suggest
                </Button>
              </div>
              <Input
                id="title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. Everyday Introductions"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Language</Label>
                <Input value={String(tutorLanguage).toUpperCase()} disabled />
              </div>

              <div className="space-y-2">
                <Label htmlFor="level">Level</Label>
                <Select value={level} onValueChange={(value) => setLevel(value as Level)}>
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
              <Textarea
                id="description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={5}
                placeholder="Describe what this unit should teach."
              />
            </div>
          </CardContent>

          <CardFooter className="justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Creating..." : "Create Unit"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
