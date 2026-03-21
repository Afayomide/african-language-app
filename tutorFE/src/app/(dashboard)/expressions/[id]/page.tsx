'use client'

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { aiService, expressionService, lessonService } from "@/services";
import { Expression, Lesson } from "@/types";
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
import { workflowStatusBadgeClass } from "@/lib/status-badge";
import { ExpressionImageManager } from "@/components/expressions/expression-image-manager";

export default function EditExpressionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [phrase, setExpression] = useState<Expression | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [translationsText, setTranslationsText] = useState("");

  useEffect(() => {
    Promise.all([fetchExpression(), fetchLessons()]).finally(() => setIsLoading(false));
  }, [id]);

  async function fetchExpression() {
    try {
      const data = await expressionService.getExpression(id);
      setExpression({ ...data, lessonIds: Array.isArray(data.lessonIds) ? data.lessonIds : [] });
      setTranslationsText(Array.isArray(data.translations) ? data.translations.join("\n") : "");
    } catch (error) {
      toast.error("Failed to fetch expression")
      router.push("/expressions");
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

  async function fileToBase64(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== "string") {
          reject(new Error("invalid_file_data"));
          return;
        }
        const [, base64] = result.split(",");
        resolve(base64 || result);
      };
      reader.onerror = () => reject(new Error("file_read_failed"));
      reader.readAsDataURL(file);
    });
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phrase) return;

    setIsSaving(true);
    try {
      const audioUpload = audioFile
        ? {
            base64: await fileToBase64(audioFile),
            mimeType: audioFile.type || undefined,
            fileName: audioFile.name
          }
        : undefined;
      await expressionService.updateExpression(id, {
        text: phrase.text,
        translations: translationsText
          .split(/\n|,/)
          .map((item) => item.trim())
          .filter(Boolean),
        pronunciation: phrase.pronunciation,
        explanation: phrase.explanation,
        difficulty: phrase.difficulty,
        lessonIds: phrase.lessonIds,
        audioUpload
      });
      toast.success("Expression updated");
    } catch (error) {
      toast.error("Failed to update expression")
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateAudio = async () => {
    try {
      const updated = await expressionService.generateExpressionAudio(id);
      setExpression(updated);
      toast.success("Expression audio generated");
    } catch (error) {
      toast.error("Failed to generate audio")
    }
  };

  const handleEnhance = async () => {
    setIsEnhancing(true);
    try {
      const updated = await aiService.enhanceExpression(id);
      setExpression(updated);
      setTranslationsText(Array.isArray(updated.translations) ? updated.translations.join("\n") : "");
      toast.success("Expression enhanced with AI");
    } catch (error) {
      toast.error("AI enhancement failed")
    } finally {
      setIsEnhancing(false);
    }
  };

  if (isLoading) return <div>Loading...</div>;
  if (!phrase) return <div>Expression not found</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-3xl font-bold">Edit Expression</h1>
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
              <CardTitle>Expression Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="text">Text (Original)</Label>
                <Input id="text" value={phrase.text} onChange={(e) => setExpression({ ...phrase, text: e.target.value })} required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="translationsText">Translations</Label>
                <Textarea
                  id="translationsText"
                  value={translationsText}
                  onChange={(e) => setTranslationsText(e.target.value)}
                  rows={4}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="pronunciation">Pronunciation</Label>
                  <Input id="pronunciation" value={phrase.pronunciation} onChange={(e) => setExpression({ ...phrase, pronunciation: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="difficulty">Difficulty (1-5)</Label>
                  <Select value={String(phrase.difficulty)} onValueChange={(v) => setExpression({ ...phrase, difficulty: Number(v) })}>
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
                <Textarea id="explanation" value={phrase.explanation} onChange={(e) => setExpression({ ...phrase, explanation: e.target.value })} rows={4} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="audioUpload">Upload Audio Recording</Label>
                <Input
                  id="audioUpload"
                  type="file"
                  accept="audio/*"
                  onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <ExpressionImageManager
            expression={phrase}
            onImagesChanged={(images) => setExpression((prev) => (prev ? { ...prev, images } : prev))}
          />
          <Card>
            <CardHeader>
              <CardTitle>Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="lesson">Lesson</Label>
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3">
                  {lessons.map((lesson) => (
                    <label key={lesson._id} className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={phrase.lessonIds.includes(lesson._id)}
                        onChange={(e) =>
                          setExpression((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  lessonIds: e.target.checked
                                    ? Array.from(new Set([...prev.lessonIds, lesson._id]))
                                    : prev.lessonIds.filter((id) => id !== lesson._id)
                                }
                              : prev
                          )
                        }
                      />
                      <span>{lesson.title}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <Label>Status</Label>
                <div className="mt-1">
                  <Badge className={workflowStatusBadgeClass(phrase.status)}>{phrase.status}</Badge>
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
