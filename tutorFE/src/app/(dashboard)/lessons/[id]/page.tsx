'use client'

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { aiService, lessonService, phraseService } from "@/services";
import { Lesson, Level, Phrase } from "@/types";
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
import { toast } from "sonner";
import { ArrowLeft, Save, Sparkles, Edit, Trash, Volume2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { DataTableControls } from "@/components/common/data-table-controls";

export default function EditLessonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isGeneratingPhrases, setIsGeneratingPhrases] = useState(false);
  const [topicsInput, setTopicsInput] = useState("");
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [isLoadingPhrases, setIsLoadingPhrases] = useState(false);
  const [phraseSearch, setPhraseSearch] = useState("");
  const [phrasePage, setPhrasePage] = useState(1);
  const [phraseLimit, setPhraseLimit] = useState(20);
  const [phraseTotal, setPhraseTotal] = useState(0);
  const [phraseTotalPages, setPhraseTotalPages] = useState(1);

  useEffect(() => {
    fetchLesson();
  }, [id]);

  useEffect(() => {
    if (!lesson?._id) return;
    fetchLessonPhrases(lesson._id);
  }, [lesson?._id, phraseSearch, phrasePage, phraseLimit]);

  useEffect(() => {
    setPhrasePage(1);
  }, [phraseSearch, lesson?._id]);

  async function fetchLesson() {
    try {
      const data = await lessonService.getLesson(id);
      setLesson({ ...data, topics: Array.isArray(data.topics) ? data.topics : [] });
      setTopicsInput(Array.isArray(data.topics) ? data.topics.join(", ") : "");
    } catch {
      toast.error("Failed to fetch lesson");
      router.push("/lessons");
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchLessonPhrases(lessonId: string) {
    setIsLoadingPhrases(true);
    try {
      const data = await phraseService.listPhrasesPage({
        lessonId,
        q: phraseSearch || undefined,
        page: phrasePage,
        limit: phraseLimit
      });
      setPhrases(
        [...data.items].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
      );
      setPhraseTotal(data.total);
      setPhraseTotalPages(data.pagination.totalPages);
    } catch {
      toast.error("Failed to load lesson phrases");
    } finally {
      setIsLoadingPhrases(false);
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
        level: lesson.level,
        description: lesson.description,
        topics
      });
      toast.success("Lesson updated");
    } catch {
      toast.error("Failed to update lesson");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAISuggest = async () => {
    if (!lesson) return;
    if (!lesson.title.trim()) {
      toast.error("Please enter a title first");
      return;
    }

    setIsSuggesting(true);
    try {
      const suggestion = await aiService.suggestLesson(lesson.title, lesson.level);
      setLesson({
        ...lesson,
        title: suggestion.title || lesson.title,
        description: suggestion.description || lesson.description
      });
      toast.success("AI suggestion applied");
    } catch {
      toast.error("AI suggestion failed");
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleGeneratePhrases = async () => {
    if (!lesson) return;
    setIsGeneratingPhrases(true);
    try {
      await aiService.generatePhrases(lesson._id);
      toast.success("AI phrases generated");
      fetchLessonPhrases(lesson._id);
    } catch {
      toast.error("Failed to generate AI phrases");
    } finally {
      setIsGeneratingPhrases(false);
    }
  };

  const handleDeletePhrase = async (phraseId: string) => {
    if (!confirm("Delete this phrase?")) return;
    try {
      await phraseService.deletePhrase(phraseId);
      toast.success("Phrase deleted");
      if (lesson) fetchLessonPhrases(lesson._id);
    } catch {
      toast.error("Failed to delete phrase");
    }
  };

  const handlePlayAudio = (url: string) => {
    const audio = new Audio(url);
    void audio.play().catch(() => toast.error("Unable to play audio"));
  };

  if (isLoading) return <div>Loading...</div>;
  if (!lesson) return <div>Lesson not found</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push(`/lessons/lang/${lesson.language}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-3xl font-bold">Edit Lesson</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleGeneratePhrases} disabled={isGeneratingPhrases}>
            <Sparkles className="mr-2 h-4 w-4 text-purple-600" />
            {isGeneratingPhrases ? "Generating..." : "Generate Phrases"}
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving}>
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Lesson Details</CardTitle>
        </CardHeader>
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
              value={lesson.title}
              onChange={(e) => setLesson({ ...lesson, title: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="level">Level</Label>
            <Select
              value={lesson.level}
              onValueChange={(v) => setLesson({ ...lesson, level: v as Level })}
            >
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
            <Label htmlFor="topics">Topics</Label>
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
              value={lesson.description}
              onChange={(e) => setLesson({ ...lesson, description: e.target.value })}
              rows={4}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lesson Phrases</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTableControls
            search={phraseSearch}
            onSearchChange={setPhraseSearch}
            page={phrasePage}
            limit={phraseLimit}
            onLimitChange={(value) => {
              setPhraseLimit(value);
              setPhrasePage(1);
            }}
            totalPages={phraseTotalPages}
            total={phraseTotal}
            label="Search phrases"
            onPrev={() => setPhrasePage((prev) => Math.max(1, prev - 1))}
            onNext={() => setPhrasePage((prev) => Math.min(phraseTotalPages, prev + 1))}
          />

          <div className="mb-4 flex justify-end">
            <Button onClick={() => router.push(`/phrases/new?language=${lesson.language}&lessonId=${lesson._id}`)}>
              Add Phrase
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Text</TableHead>
                <TableHead>Translation</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingPhrases ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">Loading phrases...</TableCell>
                </TableRow>
              ) : phrases.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">No phrases for this lesson yet.</TableCell>
                </TableRow>
              ) : (
                phrases.map((phrase) => (
                  <TableRow key={phrase._id}>
                    <TableCell className="font-medium">{phrase.text}</TableCell>
                    <TableCell>{phrase.translation}</TableCell>
                    <TableCell>
                      <Badge variant={phrase.status === "published" ? "default" : "secondary"}>
                        {phrase.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(phrase.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {phrase.audio?.url && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handlePlayAudio(phrase.audio.url)}
                            title="Play audio"
                          >
                            <Volume2 className="h-4 w-4 text-blue-600" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => router.push(`/phrases/${phrase._id}`)}
                          title="Edit"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeletePhrase(phrase._id)}
                          title="Delete"
                        >
                          <Trash className="h-4 w-4 text-red-600" />
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
