'use client'

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import { lessonService, aiService, phraseService } from "@/services"
import { Lesson, Language, Level, Phrase } from "@/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { ArrowLeft, Save, CheckCircle, Sparkles, Edit, Trash, Volume2, Plus, LayoutList } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table"
import { DataTableControls } from "@/components/common/data-table-controls"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog"
import { workflowStatusBadgeClass } from "@/lib/status-badge"

export default function EditLessonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isSuggesting, setIsSuggesting] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isGenerateDialogOpen, setIsGenerateDialogOpen] = useState(false)
  const [extraInstructions, setExtraInstructions] = useState("")
  const [topicsInput, setTopicsInput] = useState("")
  const [proverbs, setProverbs] = useState<Array<{ text: string; translation: string; contextNote: string }>>([])
  const [phrases, setPhrases] = useState<Phrase[]>([])
  const [isLoadingPhrases, setIsLoadingPhrases] = useState(false)
  const [phraseSearch, setPhraseSearch] = useState("")
  const [phrasePage, setPhrasePage] = useState(1)
  const [phraseLimit, setPhraseLimit] = useState(20)
  const [phraseTotal, setPhraseTotal] = useState(0)
  const [phraseTotalPages, setPhraseTotalPages] = useState(1)

  const handleAddProverb = () => {
    setProverbs([...proverbs, { text: "", translation: "", contextNote: "" }])
  }

  const handleProverbChange = (index: number, field: keyof typeof proverbs[0], value: string) => {
    const updated = [...proverbs]
    updated[index] = { ...updated[index], [field]: value }
    setProverbs(updated)
  }

  const handleRemoveProverb = (index: number) => {
    setProverbs(proverbs.filter((_, i) => i !== index))
  }

  useEffect(() => {
    fetchLesson()
  }, [id])

  useEffect(() => {
    if (!lesson?._id) return
    fetchLessonPhrases(lesson._id)
  }, [lesson?._id, phraseSearch, phrasePage, phraseLimit])

  useEffect(() => {
    setPhrasePage(1)
  }, [phraseSearch, lesson?._id])

  async function fetchLesson() {
    try {
      const data = await lessonService.getLesson(id)
      setLesson({ ...data, topics: Array.isArray(data.topics) ? data.topics : [] })
      setTopicsInput(Array.isArray(data.topics) ? data.topics.join(", ") : "")
      setProverbs(Array.isArray(data.proverbs) ? data.proverbs : [])
    } catch {
      toast.error("Failed to fetch lesson")
      router.push("/lessons")
    } finally {
      setIsLoading(false)
    }
  }

  async function fetchLessonPhrases(lessonId: string) {
    setIsLoadingPhrases(true)
    try {
      const data = await phraseService.listPhrasesPage({
        lessonId,
        q: phraseSearch || undefined,
        page: phrasePage,
        limit: phraseLimit
      })
      setPhrases(
        [...data.items].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
      )
      setPhraseTotal(data.total)
      setPhraseTotalPages(data.pagination.totalPages)
    } catch {
      toast.error("Failed to fetch lesson phrases")
    } finally {
      setIsLoadingPhrases(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!lesson) return
    setIsSaving(true)
    try {
      const topics = topicsInput
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
      
      await lessonService.updateLesson(id, {
        title: lesson.title,
        language: lesson.language,
        level: lesson.level,
        description: lesson.description,
        topics,
        proverbs,
      })
      toast.success("Lesson updated")
    } catch {
      toast.error("Failed to update lesson")
    } finally {
      setIsSaving(false)
    }
  }

  const handleFinishLesson = async () => {
    try {
      await lessonService.finishLesson(id)
      toast.success("Lesson sent to admin for publish")
      fetchLesson()
    } catch {
      toast.error("Failed to mark lesson as finished")
    }
  }

  const handleAISuggest = async () => {
    if (!lesson) return
    if (!lesson.title) {
      toast.error("Add a title first")
      return
    }
    setIsSuggesting(true)
    try {
      const suggestion = await aiService.suggestLesson(lesson.title, lesson.language, lesson.level)
      setLesson({
        ...lesson,
        title: suggestion.title || lesson.title,
        description: suggestion.description || lesson.description,
      })
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
      toast.success("AI suggestion applied")
    } catch {
      toast.error("AI suggestion failed")
    } finally {
      setIsSuggesting(false)
    }
  }

  const handleGeneratePhrases = async () => {
    if (!lesson) return
    setIsGenerating(true)
    try {
      await aiService.generatePhrases(
        lesson._id,
        undefined,
        extraInstructions.trim() || undefined
      )
      toast.success("AI phrases generated")
      setIsGenerateDialogOpen(false)
      fetchLessonPhrases(lesson._id)
    } catch {
      toast.error("AI phrase generation failed")
    } finally {
      setIsGenerating(false)
    }
  }

  const handleDeletePhrase = async (phraseId: string) => {
    if (!confirm("Delete this phrase?")) return
    try {
      await phraseService.deletePhrase(phraseId)
      toast.success("Phrase deleted")
      if (lesson) fetchLessonPhrases(lesson._id)
    } catch {
      toast.error("Failed to delete phrase")
    }
  }

  const handleFinishPhrase = async (phraseId: string) => {
    try {
      await phraseService.finishPhrase(phraseId)
      toast.success("Phrase sent to admin for publish")
      if (lesson) fetchLessonPhrases(lesson._id)
    } catch {
      toast.error("Failed to mark phrase as finished")
    }
  }

  const handlePlayAudio = (url: string) => {
    const audio = new Audio(url)
    void audio.play().catch(() => toast.error("Unable to play audio"))
  }

  if (isLoading) return <div>Loading...</div>
  if (!lesson) return <div>Lesson not found</div>

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
            <h1 className="text-4xl font-extrabold tracking-tight text-foreground">Edit Lesson</h1>
            <p className="text-muted-foreground font-medium">Refine your lesson content and AI settings.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Dialog open={isGenerateDialogOpen} onOpenChange={setIsGenerateDialogOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                className="h-11 rounded-xl border-2 font-bold hover:bg-purple-50 hover:text-purple-600 transition-all"
              >
                <Sparkles className="mr-2 h-5 w-5 text-purple-600" />
                Generate Phrases
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Generate Phrases With AI</DialogTitle>
                <DialogDescription>
                  Add optional generation guidance before creating phrases.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="extraInstructions">Extra AI Description (Optional)</Label>
                <Textarea
                  id="extraInstructions"
                  value={extraInstructions}
                  onChange={(event) => setExtraInstructions(event.target.value)}
                  placeholder='e.g. "Only single words for this lesson"'
                  rows={4}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsGenerateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleGeneratePhrases} disabled={isGenerating}>
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
              <CardTitle className="text-2xl font-bold text-primary">Lesson Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 pt-8 px-8">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="title" className="font-bold text-xs uppercase tracking-wider text-muted-foreground ml-1">Title</Label>
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
                  onChange={(e) => setLesson({ ...lesson, title: e.target.value })}
                  required
                  className="h-12 border-2 rounded-xl focus-visible:ring-primary text-lg font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label htmlFor="language" className="font-bold text-xs uppercase tracking-wider text-muted-foreground ml-1">Language</Label>
                  <Select
                    value={lesson.language}
                    onValueChange={(v) => setLesson({ ...lesson, language: v as Language })}
                    disabled
                  >
                    <SelectTrigger className="h-12 border-2 rounded-xl font-bold">
                      <SelectValue placeholder="Select language" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="yoruba" className="font-medium">Yoruba</SelectItem>
                      <SelectItem value="igbo" className="font-medium">Igbo</SelectItem>
                      <SelectItem value="hausa" className="font-medium">Hausa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  <Label htmlFor="level" className="font-bold text-xs uppercase tracking-wider text-muted-foreground ml-1">Level</Label>
                  <Select
                    value={lesson.level}
                    onValueChange={(v) => setLesson({ ...lesson, level: v as Level })}
                  >
                    <SelectTrigger className="h-12 border-2 rounded-xl font-bold">
                      <SelectValue placeholder="Select level" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="beginner" className="font-medium">Beginner</SelectItem>
                      <SelectItem value="intermediate" className="font-medium">Intermediate</SelectItem>
                      <SelectItem value="advanced" className="font-medium">Advanced</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-3">
                <Label htmlFor="topics" className="font-bold text-xs uppercase tracking-wider text-muted-foreground ml-1">Topics</Label>
                <Input
                  id="topics"
                  value={topicsInput}
                  onChange={(e) => setTopicsInput(e.target.value)}
                  className="h-12 border-2 rounded-xl focus-visible:ring-primary font-medium"
                  placeholder="greetings, introductions"
                />
              </div>

              <div className="space-y-3">
                <Label htmlFor="description" className="font-bold text-xs uppercase tracking-wider text-muted-foreground ml-1">Description</Label>
                <Textarea
                  id="description"
                  value={lesson.description}
                  onChange={(e) => setLesson({ ...lesson, description: e.target.value })}
                  rows={6}
                  className="border-2 rounded-xl focus-visible:ring-primary font-medium"
                />
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="font-bold text-xs uppercase tracking-wider text-muted-foreground ml-1">Proverbs</Label>
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
            <CardFooter className="bg-muted/20 p-8">
              <p className="text-sm text-muted-foreground font-medium italic">
                Tip: Use the AI Suggest button to automatically generate a professional title and description based on your title.
              </p>
            </CardFooter>
          </Card>
        </div>

        <div className="lg:col-span-1 space-y-6">
          <Card className="border-2 border-accent/20 shadow-lg rounded-3xl overflow-hidden">
            <CardHeader className="bg-accent/5">
              <CardTitle className="text-xl font-bold text-accent">Status & Info</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-muted-foreground font-bold text-sm uppercase">Current Status</span>
                <Badge className={workflowStatusBadgeClass(lesson.status)}>
                  {lesson.status}
                </Badge>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-muted-foreground font-bold text-sm uppercase">Created</span>
                <span className="font-medium">{new Date(lesson.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-muted-foreground font-bold text-sm uppercase">Order Index</span>
                <span className="font-black text-xl text-primary">{lesson.orderIndex + 1}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="border-2 border-primary/10 shadow-xl rounded-3xl overflow-hidden">
        <CardHeader className="bg-primary/5">
          <CardTitle className="text-xl font-bold text-primary">Lesson Phrases</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTableControls
            search={phraseSearch}
            onSearchChange={setPhraseSearch}
            page={phrasePage}
            limit={phraseLimit}
            onLimitChange={(value) => {
              setPhraseLimit(value)
              setPhrasePage(1)
            }}
            totalPages={phraseTotalPages}
            total={phraseTotal}
            label="Search phrases"
            onPrev={() => setPhrasePage((prev) => Math.max(1, prev - 1))}
            onNext={() => setPhrasePage((prev) => Math.min(phraseTotalPages, prev + 1))}
          />
          <div className="mb-4 mt-4 flex justify-end">
            <Button onClick={() => router.push(`/phrases/new?language=${lesson.language}&lessonId=${lesson._id}`)}>
              Add Phrase
            </Button>
          </div>
          <Table>
            <TableHeader className="bg-primary/5">
              <TableRow>
                <TableHead className="font-bold text-primary pl-8">Text</TableHead>
                <TableHead className="font-bold text-primary">Translation</TableHead>
                <TableHead className="font-bold text-primary">Status</TableHead>
                <TableHead className="font-bold text-primary">Created At</TableHead>
                <TableHead className="text-right font-bold text-primary pr-8">Actions</TableHead>
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
                  <TableRow key={phrase._id} className="group transition-colors hover:bg-secondary/30">
                    <TableCell className="pl-8 font-bold text-foreground">{phrase.text}</TableCell>
                    <TableCell>{phrase.translation}</TableCell>
                    <TableCell>
                      <Badge className={workflowStatusBadgeClass(phrase.status)}>
                        {phrase.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(phrase.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="pr-8 text-right">
                      <div className="flex justify-end gap-1">
                        {phrase.audio?.url ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handlePlayAudio(phrase.audio.url)}
                            title="Play audio"
                            className="rounded-full hover:bg-blue-100 hover:text-blue-600 transition-colors"
                          >
                            <Volume2 className="h-4 w-4" />
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => router.push(`/phrases/${phrase._id}`)}
                          title="Edit"
                          className="rounded-full hover:bg-primary/10 hover:text-primary transition-colors"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        {phrase.status === "draft" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleFinishPhrase(phrase._id)}
                            title="Mark as finished"
                            className="rounded-full hover:bg-amber-100 hover:text-amber-600 transition-colors"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeletePhrase(phrase._id)}
                          title="Delete"
                          className="rounded-full hover:bg-red-100 hover:text-red-600 transition-colors"
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
  )
}
