'use client'

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { aiService, phraseService, lessonService } from "@/services";
import { Phrase, Lesson } from "@/types";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Save, Volume2, Sparkles } from "lucide-react";

export default function EditPhrasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [phrase, setPhrase] = useState<Phrase | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);

  useEffect(() => {
    Promise.all([fetchPhrase(), fetchLessons()]).finally(() => setIsLoading(false));
  }, [id]);

  async function fetchPhrase() {
    try {
      const data = await phraseService.getPhrase(id);
      setPhrase(data);
    } catch {
      toast.error("Failed to fetch phrase");
      router.push("/phrases");
    }
  }

  async function fetchLessons() {
    try {
      const data = await lessonService.listLessons();
      setLessons(data);
    } catch {
      console.error("Failed to fetch lessons");
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phrase) return;

    setIsSaving(true);
    try {
      await phraseService.updatePhrase(id, {
        text: phrase.text,
        translation: phrase.translation,
        pronunciation: phrase.pronunciation,
        explanation: phrase.explanation,
        difficulty: phrase.difficulty,
        lessonId: phrase.lessonId
      });
      toast.success("Phrase updated");
    } catch {
      toast.error("Failed to update phrase");
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateAudio = async () => {
    try {
      const updated = await phraseService.generatePhraseAudio(id);
      setPhrase(updated);
      toast.success("Phrase audio generated");
    } catch {
      toast.error("Failed to generate audio");
    }
  };

  const handleEnhance = async () => {
    setIsEnhancing(true);
    try {
      const updated = await aiService.enhancePhrase(id);
      setPhrase(updated);
      toast.success("Phrase enhanced with AI");
    } catch {
      toast.error("AI enhancement failed");
    } finally {
      setIsEnhancing(false);
    }
  };

  if (isLoading) return <div>Loading...</div>;
  if (!phrase) return <div>Phrase not found</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-3xl font-bold">Edit Phrase</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleEnhance} disabled={isEnhancing}>
            <Sparkles className="mr-2 h-4 w-4 text-purple-600" />
            {isEnhancing ? "Enhancing..." : "Enhance with AI"}
          </Button>
          <Button variant="outline" onClick={handleGenerateAudio}>
            <Volume2 className="mr-2 h-4 w-4" />
            Generate Audio
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving}>
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Phrase Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="text">Text (Original)</Label>
                <Input id="text" value={phrase.text} onChange={(e) => setPhrase({ ...phrase, text: e.target.value })} required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="translation">Translation</Label>
                <Input id="translation" value={phrase.translation} onChange={(e) => setPhrase({ ...phrase, translation: e.target.value })} required />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="pronunciation">Pronunciation</Label>
                  <Input id="pronunciation" value={phrase.pronunciation} onChange={(e) => setPhrase({ ...phrase, pronunciation: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="difficulty">Difficulty (1-5)</Label>
                  <Select value={String(phrase.difficulty)} onValueChange={(v) => setPhrase({ ...phrase, difficulty: Number(v) })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 - Very Easy</SelectItem>
                      <SelectItem value="2">2 - Easy</SelectItem>
                      <SelectItem value="3">3 - Medium</SelectItem>
                      <SelectItem value="4">4 - Hard</SelectItem>
                      <SelectItem value="5">5 - Very Hard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="explanation">Explanation</Label>
                <Textarea id="explanation" value={phrase.explanation} onChange={(e) => setPhrase({ ...phrase, explanation: e.target.value })} rows={4} />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="lesson">Lesson</Label>
                <Select value={phrase.lessonId} onValueChange={(v) => setPhrase({ ...phrase, lessonId: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {lessons.map((lesson) => (
                      <SelectItem key={lesson._id} value={lesson._id}>
                        {lesson.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="pt-2">
                <Label>Status</Label>
                <div className="mt-1">
                  <Badge variant={phrase.status === "published" ? "default" : "secondary"}>{phrase.status}</Badge>
                </div>
              </div>

              {phrase.audio?.url && (
                <div className="pt-2">
                  <Label>Audio</Label>
                  <div className="mt-2">
                    <audio controls src={phrase.audio.url} className="w-full" />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
