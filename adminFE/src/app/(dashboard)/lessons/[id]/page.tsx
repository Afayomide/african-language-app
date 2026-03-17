'use client'

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import { lessonService, aiService, phraseService, proverbService, questionService } from "@/services"
import { Lesson, Language, Level, Phrase, LessonBlock, Proverb, ExerciseQuestion, LessonAuditResult } from "@/types"
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
import { ArrowLeft, Save, CheckCircle, Sparkles, Edit, Trash, Volume2, Plus, ArrowUp, ArrowDown, LayoutList } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table"
import { DataTableControls } from "@/components/common/data-table-controls"
import { workflowStatusBadgeClass } from "@/lib/status-badge"
import { TABLE_ACTION_ICON_CLASS, TABLE_BULK_BUTTON_CLASS } from "@/lib/tableActionStyles"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog"

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
  const [isRefactorDialogOpen, setIsRefactorDialogOpen] = useState(false)
  const [isRefactoring, setIsRefactoring] = useState(false)
  const [lessonRefactorTopic, setLessonRefactorTopic] = useState("")
  const [lessonRefactorInstructions, setLessonRefactorInstructions] = useState("")
  const [topicsInput, setTopicsInput] = useState("")
  const [proverbs, setProverbs] = useState<Array<{ text: string; translation: string; contextNote: string }>>([])
  const [blocks, setBlocks] = useState<LessonBlock[]>([])
  const [phrases, setPhrases] = useState<Phrase[]>([])
  
  const [allPhrases, setAllPhrases] = useState<Phrase[]>([])
  const [allProverbs, setAllProverbs] = useState<Proverb[]>([])
  const [allQuestions, setAllQuestions] = useState<ExerciseQuestion[]>([])
  const [isLoadingPhrases, setIsLoadingPhrases] = useState(false)
  const [phraseSearch, setPhraseSearch] = useState("")
  const [phrasePage, setPhrasePage] = useState(1)
  const [phraseLimit, setPhraseLimit] = useState(20)
  const [phraseTotal, setPhraseTotal] = useState(0)
  const [phraseTotalPages, setPhraseTotalPages] = useState(1)
  const [selectedPhraseIds, setSelectedPhraseIds] = useState<string[]>([])
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([])
  const [audit, setAudit] = useState<LessonAuditResult | null>(null)
  const [isAuditing, setIsAuditing] = useState(false)

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

  useEffect(() => {
    setSelectedPhraseIds((prev) => prev.filter((id) => phrases.some((phrase) => phrase._id === id)))
  }, [phrases])

  useEffect(() => {
    setSelectedQuestionIds((prev) => prev.filter((id) => allQuestions.some((question) => question._id === id)))
  }, [allQuestions])

  useEffect(() => {
    if (!lesson?.language) return
    const loadAllData = async () => {
      try {
        const [p, prv, q] = await Promise.all([
          phraseService.listPhrases(undefined, undefined, lesson.language),
          proverbService.listProverbs(undefined, undefined, lesson.language),
          questionService.listQuestions({ lessonId: lesson._id })
        ])
        setAllPhrases(p)
        setAllProverbs(prv)
        setAllQuestions(q)
      } catch (err) {
        console.error("Failed to load selector data", err)
      }
    }
    void loadAllData()
  }, [lesson?.language, lesson?._id])

  async function fetchLesson() {
    try {
      const data = await lessonService.getLesson(id)
      setLesson({ ...data, topics: Array.isArray(data.topics) ? data.topics : [] })
      setTopicsInput(Array.isArray(data.topics) ? data.topics.join(", ") : "")
      setProverbs(Array.isArray(data.proverbs) ? data.proverbs : [])
      const firstStageBlocks = Array.isArray(data.stages) && data.stages.length > 0
        ? (Array.isArray(data.stages[0].blocks) ? data.stages[0].blocks : [])
        : []
      setBlocks(firstStageBlocks)
    } catch (error) {
      toast.error("Failed to fetch lesson")
      router.push("/lessons")
    } finally {
      setIsLoading(false)
    }
  }

  async function fetchLessonAudit() {
    setIsAuditing(true)
    try {
      const data = await lessonService.auditLesson(id)
      setAudit(data)
      toast.success(data.ok ? "Lesson audit passed" : "Lesson audit found issues")
      return data
    } catch (error) {
      toast.error("Failed to audit lesson")
      return null
    } finally {
      setIsAuditing(false)
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
    } catch (error) {
      toast.error("Failed to fetch lesson phrases")
    } finally {
      setIsLoadingPhrases(false)
    }
  }

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

  const handleAddBlock = (type: LessonBlock["type"]) => {
    if (type === "text") {
      setBlocks([...blocks, { type: "text", content: "" }])
    } else {
      setBlocks([...blocks, { type, refId: "" }])
    }
  }

  const handleBlockChange = (index: number, value: string) => {
    const updated = [...blocks]
    const block = updated[index]
    if (block.type === "text") {
      updated[index] = { ...block, content: value }
    } else {
      updated[index] = { ...block, refId: value }
    }
    setBlocks(updated)
  }

  const handleRemoveBlock = (index: number) => {
    setBlocks(blocks.filter((_, i) => i !== index))
  }

  const handleMoveBlock = (index: number, direction: "up" | "down") => {
    const updated = [...blocks]
    const newIndex = direction === "up" ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= blocks.length) return
    const [moved] = updated.splice(index, 1)
    updated.splice(newIndex, 0, moved)
    setBlocks(updated)
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
        stages: [
          {
            id: lesson.stages?.[0]?.id || "stage-1",
            title: lesson.stages?.[0]?.title || "Stage 1",
            description: lesson.stages?.[0]?.description || "",
            orderIndex: 0,
            blocks,
          },
          ...(Array.isArray(lesson.stages) ? lesson.stages.slice(1) : []),
        ],
      })
      toast.success("Lesson updated")
    } catch (error: any) {
      toast.error(error.response?.data?.error || "Failed to update lesson")
    } finally {
      setIsSaving(false)
    }
  }

  const handlePublish = async () => {
    try {
      const auditResult = await fetchLessonAudit()
      if (!auditResult?.ok) {
        toast.error("Fix the lesson audit errors before publishing")
        return
      }
      await lessonService.publishLesson(id)
      toast.success("Lesson published")
      fetchLesson()
    } catch (error: unknown) {
      const message =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof (error as { response?: { data?: { error?: string; audit?: LessonAuditResult } } }).response?.data?.error === "string"
          ? (error as { response?: { data?: { error?: string; audit?: LessonAuditResult } } }).response?.data?.error || "Failed to publish lesson"
          : "Failed to publish lesson"
      const responseAudit =
        typeof error === "object" &&
        error !== null &&
        "response" in error
          ? (error as { response?: { data?: { audit?: LessonAuditResult } } }).response?.data?.audit || null
          : null
      if (responseAudit) setAudit(responseAudit)
      toast.error(message)
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
      console.log(suggestion)
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
    } catch (error) {
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
        lesson.language,
        lesson.level,
        undefined,
        extraInstructions.trim() || undefined
      )
      toast.success("AI phrases generated")
      setIsGenerateDialogOpen(false)
      fetchLessonPhrases(lesson._id)
    } catch (error) {
      toast.error("AI phrase generation failed")
    } finally {
      setIsGenerating(false)
    }
  }

  const handleRefactorLesson = async () => {
    setIsRefactoring(true)
    try {
      const result = await aiService.refactorLessonContent(id, {
        topic: lessonRefactorTopic.trim() || undefined,
        extraInstructions: lessonRefactorInstructions.trim() || undefined
      })
      await fetchLesson()
      if (lesson?._id) {
        await Promise.all([
          fetchLessonPhrases(lesson._id),
          questionService.listQuestions({ lessonId: lesson._id }).then(setAllQuestions)
        ])
      }
      setIsRefactorDialogOpen(false)
      toast.success(
        result.updatedLesson
          ? `Lesson refactored with ${result.patch?.operations?.length || 0} targeted changes`
          : "AI found no targeted lesson changes to apply"
      )
    } catch (error: any) {
      toast.error(error.response?.data?.error || "Failed to refactor lesson")
    } finally {
      setIsRefactoring(false)
    }
  }

  const handleDeletePhrase = async (phraseId: string) => {
    if (!confirm("Delete this phrase?")) return
    try {
      await phraseService.deletePhrase(phraseId)
      toast.success("Phrase deleted")
      if (lesson) fetchLessonPhrases(lesson._id)
    } catch (error) {
      toast.error("Failed to delete phrase")
    }
  }

  const togglePhraseSelection = (phraseId: string) => {
    setSelectedPhraseIds((prev) =>
      prev.includes(phraseId) ? prev.filter((id) => id !== phraseId) : [...prev, phraseId]
    )
  }

  const toggleSelectAllPhrases = () => {
    if (selectedPhraseIds.length === phrases.length) {
      setSelectedPhraseIds([])
      return
    }
    setSelectedPhraseIds(phrases.map((phrase) => phrase._id))
  }

  const toggleQuestionSelection = (questionId: string) => {
    setSelectedQuestionIds((prev) =>
      prev.includes(questionId) ? prev.filter((id) => id !== questionId) : [...prev, questionId]
    )
  }

  const toggleSelectAllQuestions = () => {
    if (selectedQuestionIds.length === allQuestions.length) {
      setSelectedQuestionIds([])
      return
    }
    setSelectedQuestionIds(allQuestions.map((question) => question._id))
  }

  const handleBulkDeletePhrases = async () => {
    if (selectedPhraseIds.length === 0) return
    if (!confirm(`Delete ${selectedPhraseIds.length} selected phrase(s)?`)) return
    try {
      await Promise.all(selectedPhraseIds.map((id) => phraseService.deletePhrase(id)))
      toast.success("Selected phrases deleted")
      setSelectedPhraseIds([])
      if (lesson) fetchLessonPhrases(lesson._id)
    } catch (error) {
      toast.error("Failed to delete selected phrases")
    }
  }

  const handleBulkPublishPhrases = async () => {
    const publishable = phrases
      .filter((phrase) => selectedPhraseIds.includes(phrase._id) && phrase.status === "finished")
      .map((phrase) => phrase._id)
    if (publishable.length === 0) {
      toast.error("No selected finished phrases to publish")
      return
    }
    try {
      await Promise.all(publishable.map((id) => phraseService.publishPhrase(id)))
      toast.success(`Published ${publishable.length} phrase(s)`)
      setSelectedPhraseIds([])
      if (lesson) fetchLessonPhrases(lesson._id)
    } catch (error) {
      toast.error("Failed to publish selected phrases")
    }
  }

  const handleBulkDeleteQuestions = async () => {
    if (selectedQuestionIds.length === 0) return
    if (!confirm(`Delete ${selectedQuestionIds.length} selected question(s)?`)) return
    try {
      await Promise.all(selectedQuestionIds.map((id) => questionService.deleteQuestion(id)))
      toast.success("Selected questions deleted")
      setSelectedQuestionIds([])
      if (lesson?._id) {
        const refreshed = await questionService.listQuestions({ lessonId: lesson._id })
        setAllQuestions(refreshed)
      }
    } catch (error) {
      toast.error("Failed to delete selected questions")
    }
  }

  const handleBulkPublishQuestions = async () => {
    const publishable = allQuestions
      .filter((question) => selectedQuestionIds.includes(question._id) && question.status === "finished")
      .map((question) => question._id)
    if (publishable.length === 0) {
      toast.error("No selected finished questions to publish")
      return
    }
    try {
      await Promise.all(publishable.map((id) => questionService.publishQuestion(id)))
      toast.success(`Published ${publishable.length} question(s)`)
      setSelectedQuestionIds([])
      if (lesson?._id) {
        const refreshed = await questionService.listQuestions({ lessonId: lesson._id })
        setAllQuestions(refreshed)
      }
    } catch (error) {
      toast.error("Failed to publish selected questions")
    }
  }

  const handlePublishPhrase = async (phraseId: string) => {
    try {
      await phraseService.publishPhrase(phraseId)
      toast.success("Phrase published")
      if (lesson) fetchLessonPhrases(lesson._id)
    } catch (error) {
      toast.error("Failed to publish phrase")
    }
  }

  const handlePlayAudio = (url: string) => {
    const audio = new Audio(url)
    void audio.play().catch(() => toast.error("Unable to play audio"))
  }

  const handlePublishQuestion = async (questionId: string) => {
    try {
      await questionService.publishQuestion(questionId)
      toast.success("Question published")
      if (lesson?._id) {
        const refreshed = await questionService.listQuestions({ lessonId: lesson._id })
        setAllQuestions(refreshed)
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || "Failed to publish question")
    }
  }

  const handleSendBackQuestion = async (questionId: string) => {
    try {
      await questionService.sendBackToTutorQuestion(questionId)
      toast.success("Question sent back to draft")
      if (lesson?._id) {
        const refreshed = await questionService.listQuestions({ lessonId: lesson._id })
        setAllQuestions(refreshed)
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || "Failed to send question back")
    }
  }

  const handleDeleteQuestion = async (questionId: string) => {
    if (!confirm("Delete this question?")) return
    try {
      await questionService.deleteQuestion(questionId)
      toast.success("Question deleted")
      if (lesson?._id) {
        const refreshed = await questionService.listQuestions({ lessonId: lesson._id })
        setAllQuestions(refreshed)
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || "Failed to delete question")
    }
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
          <Button
            variant="outline"
            onClick={() => void fetchLessonAudit()}
            disabled={isAuditing}
            className="h-11 rounded-xl border-2 font-bold"
          >
            {isAuditing ? "Auditing..." : "Audit Lesson"}
          </Button>
          <Dialog open={isRefactorDialogOpen} onOpenChange={setIsRefactorDialogOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                className="h-11 rounded-xl border-2 font-bold hover:bg-emerald-50 hover:text-emerald-700 transition-all"
              >
                <Sparkles className="mr-2 h-5 w-5 text-emerald-600" />
                Refactor Lesson
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Targeted Lesson Refactor</DialogTitle>
                <DialogDescription>
                  Ask AI for precise lesson fixes like replacing a phrase, moving a block, or adding helper text.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="lesson-refactor-topic">Topic focus (optional)</Label>
                  <Input
                    id="lesson-refactor-topic"
                    value={lessonRefactorTopic}
                    onChange={(event) => setLessonRefactorTopic(event.target.value)}
                    placeholder="Optional focus for this refactor"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lesson-refactor-instructions">Extra instructions</Label>
                  <Textarea
                    id="lesson-refactor-instructions"
                    value={lessonRefactorInstructions}
                    onChange={(event) => setLessonRefactorInstructions(event.target.value)}
                    rows={5}
                    placeholder="Examples: replace Ku osan with E kaasan, remove the old phrase bundle, add a short helper text after Stage 1."
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsRefactorDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleRefactorLesson} disabled={isRefactoring}>
                  {isRefactoring ? "Refactoring..." : "Run Refactor"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
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
          <Button
            variant="outline"
            onClick={() => router.push(`/lessons/${id}/flow`)}
            className="h-11 rounded-xl border-2 font-bold hover:bg-blue-50 hover:text-blue-600 transition-all border-blue-200 text-blue-600"
          >
            <LayoutList className="mr-2 h-5 w-5" />
            Build Lesson Flow
          </Button>
          {lesson.status === "finished" && (
            <Button 
              variant="outline" 
              onClick={handlePublish}
              className="h-11 rounded-xl border-2 font-bold hover:bg-green-50 hover:text-green-600 transition-all"
            >
              <CheckCircle className="mr-2 h-5 w-5 text-green-600" />
              Publish
            </Button>
          )}
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

          <Card className="border-2 border-purple-200 bg-purple-50/50 shadow-lg rounded-3xl overflow-hidden">
            <CardHeader>
              <CardTitle className="text-xl font-bold text-purple-700 flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                AI Assistant
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-purple-900 font-medium mb-4">
                Let AI help you build this lesson faster. Generate phrases automatically based on the lesson level and title.
              </p>
              <Button 
                onClick={handleGeneratePhrases} 
                disabled={isGenerating}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl"
              >
                {isGenerating ? "Processing..." : "Generate AI Content"}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-2 border-orange-200 shadow-lg rounded-3xl overflow-hidden">
            <CardHeader className="bg-orange-50">
              <CardTitle className="text-xl font-bold text-orange-700">Lesson Audit</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              {!audit ? (
                <p className="text-sm text-muted-foreground">Run a lesson audit to check stage balance, listening coverage, and question quality.</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Badge className={audit.ok ? "bg-green-500" : "bg-red-500"}>
                      {audit.ok ? "Ready to Publish" : "Needs Fixes"}
                    </Badge>
                    <Badge variant="secondary">Errors: {audit.errors}</Badge>
                    <Badge variant="secondary">Warnings: {audit.warnings}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>Stages: <span className="font-bold">{audit.metrics.stageCount}</span></div>
                    <div>Blocks: <span className="font-bold">{audit.metrics.blockCount}</span></div>
                    <div>Phrases: <span className="font-bold">{audit.metrics.uniquePhraseCount}</span></div>
                    <div>Questions: <span className="font-bold">{audit.metrics.questionCount}</span></div>
                    <div className="col-span-2">Listening: <span className="font-bold">{audit.metrics.listeningQuestionCount}</span></div>
                  </div>
                  <div className="max-h-64 space-y-2 overflow-y-auto">
                    {audit.findings.length === 0 ? (
                      <p className="text-sm text-green-700">No issues found.</p>
                    ) : (
                      audit.findings.map((finding, index) => (
                        <div
                          key={`${finding.code}-${index}`}
                          className={finding.severity === "error" ? "rounded-xl border border-red-200 bg-red-50 p-3" : "rounded-xl border border-amber-200 bg-amber-50 p-3"}
                        >
                          <div className="mb-1 flex items-center gap-2">
                            <Badge className={finding.severity === "error" ? "bg-red-500" : "bg-amber-500"}>
                              {finding.severity}
                            </Badge>
                            <span className="text-xs font-bold uppercase text-muted-foreground">{finding.code.replaceAll("_", " ")}</span>
                          </div>
                          <p className="text-sm">{finding.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
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
            <div className="flex gap-2">
              <Button variant="outline" className={TABLE_BULK_BUTTON_CLASS.delete} onClick={handleBulkDeletePhrases} disabled={selectedPhraseIds.length === 0}>
                Bulk Delete ({selectedPhraseIds.length})
              </Button>
              <Button variant="outline" className={TABLE_BULK_BUTTON_CLASS.publish} onClick={handleBulkPublishPhrases} disabled={selectedPhraseIds.length === 0}>
                Bulk Publish
              </Button>
              <Button onClick={() => router.push(`/phrases/new?language=${lesson.language}&lessonId=${lesson._id}`)}>
                Add Phrase
              </Button>
            </div>
          </div>
          <Table>
            <TableHeader className="bg-primary/5">
              <TableRow>
                <TableHead className="w-12 pl-8">
                  <input
                    type="checkbox"
                    checked={phrases.length > 0 && selectedPhraseIds.length === phrases.length}
                    onChange={toggleSelectAllPhrases}
                  />
                </TableHead>
                <TableHead className="font-bold text-primary pl-8">Text</TableHead>
                <TableHead className="font-bold text-primary">Translation</TableHead>
                <TableHead className="font-bold text-primary">Status</TableHead>
                <TableHead className="font-bold text-primary">Created At</TableHead>
                <TableHead className="font-bold text-primary">Updated At</TableHead>
                <TableHead className="text-right font-bold text-primary pr-8">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingPhrases ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">Loading phrases...</TableCell>
                </TableRow>
              ) : phrases.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">No phrases for this lesson yet.</TableCell>
                </TableRow>
              ) : (
                phrases.map((phrase) => (
                  <TableRow key={phrase._id} className="group transition-colors hover:bg-secondary/30">
                    <TableCell className="pl-8">
                      <input
                        type="checkbox"
                        checked={selectedPhraseIds.includes(phrase._id)}
                        onChange={() => togglePhraseSelection(phrase._id)}
                      />
                    </TableCell>
                    <TableCell className="pl-8 font-bold text-foreground">{phrase.text}</TableCell>
                    <TableCell>{phrase.translations.join(" | ")}</TableCell>
                    <TableCell>
                      <Badge className={workflowStatusBadgeClass(phrase.status)}>
                        {phrase.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(phrase.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {new Date(phrase.updatedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="pr-8 text-right">
                      <div className="flex justify-end gap-1">
                      {phrase.audio?.url ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handlePlayAudio(phrase.audio.url)}
                          title="Play audio"
                          className={TABLE_ACTION_ICON_CLASS.play}
                        >
                          <Volume2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => router.push(`/phrases/${phrase._id}`)}
                          title="Edit"
                          className={TABLE_ACTION_ICON_CLASS.edit}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        {phrase.status === "finished" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handlePublishPhrase(phrase._id)}
                            title="Publish"
                            className={TABLE_ACTION_ICON_CLASS.publish}
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeletePhrase(phrase._id)}
                          title="Delete"
                          className={TABLE_ACTION_ICON_CLASS.delete}
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

      <Card className="border-2 border-primary/10 shadow-xl rounded-3xl overflow-hidden">
        <CardHeader className="bg-primary/5">
          <CardTitle className="text-xl font-bold text-primary">Lesson Questions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 mt-4 flex justify-end">
            <div className="flex gap-2">
              <Button variant="outline" className={TABLE_BULK_BUTTON_CLASS.delete} onClick={handleBulkDeleteQuestions} disabled={selectedQuestionIds.length === 0}>
                Bulk Delete ({selectedQuestionIds.length})
              </Button>
              <Button variant="outline" className={TABLE_BULK_BUTTON_CLASS.publish} onClick={handleBulkPublishQuestions} disabled={selectedQuestionIds.length === 0}>
                Bulk Publish
              </Button>
              <Button onClick={() => router.push("/questions")}>
                Add Question
              </Button>
            </div>
          </div>
          <Table>
            <TableHeader className="bg-primary/5">
              <TableRow>
                <TableHead className="w-12 pl-8">
                  <input
                    type="checkbox"
                    checked={allQuestions.length > 0 && selectedQuestionIds.length === allQuestions.length}
                    onChange={toggleSelectAllQuestions}
                  />
                </TableHead>
                <TableHead className="font-bold text-primary pl-8">Type</TableHead>
                <TableHead className="font-bold text-primary">Prompt</TableHead>
                <TableHead className="font-bold text-primary">Phrase</TableHead>
                <TableHead className="font-bold text-primary">Status</TableHead>
                <TableHead className="font-bold text-primary">Created At</TableHead>
                <TableHead className="font-bold text-primary">Updated At</TableHead>
                <TableHead className="text-right font-bold text-primary pr-8">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allQuestions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center">No questions for this lesson yet.</TableCell>
                </TableRow>
              ) : (
                allQuestions.map((question) => (
                  <TableRow key={question._id} className="group transition-colors hover:bg-secondary/30">
                    <TableCell className="pl-8">
                      <input
                        type="checkbox"
                        checked={selectedQuestionIds.includes(question._id)}
                        onChange={() => toggleQuestionSelection(question._id)}
                      />
                    </TableCell>
                    <TableCell className="pl-8 font-bold text-foreground capitalize">
                      {question.type.replaceAll("-", " ")}
                    </TableCell>
                    <TableCell>{question.promptTemplate}</TableCell>
                    <TableCell>{typeof question.phraseId === "string" ? question.phraseId : question.phraseId.text}</TableCell>
                    <TableCell>
                      <Badge className={workflowStatusBadgeClass(question.status)}>
                        {question.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(question.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>{new Date(question.updatedAt).toLocaleDateString()}</TableCell>
                    <TableCell className="pr-8 text-right">
                      <div className="flex justify-end gap-1">
                        {question.status === "finished" && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleSendBackQuestion(question._id)}
                              title="Send back"
                              className={TABLE_ACTION_ICON_CLASS.sendBack}
                            >
                              <ArrowDown className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handlePublishQuestion(question._id)}
                              title="Publish"
                              className={TABLE_ACTION_ICON_CLASS.publish}
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => router.push(`/questions/${question._id}`)}
                          title="Edit"
                          className={TABLE_ACTION_ICON_CLASS.edit}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteQuestion(question._id)}
                          title="Delete"
                          className={TABLE_ACTION_ICON_CLASS.delete}
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
