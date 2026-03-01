'use client'

import { useEffect, useState } from "react"
import { questionService, lessonService, phraseService } from "@/services"
import { ExerciseQuestion, Lesson, QuestionType, QuestionSubtype, Status } from "@/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { BookOpen, MessageSquare, Trash2, CheckCircle, RotateCcw } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { workflowStatusBadgeClass } from "@/lib/status-badge"
import { DataTableControls } from "@/components/common/data-table-controls"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

export default function QuestionsPage() {
  const [questions, setQuestions] = useState<ExerciseQuestion[]>([])
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [phrases, setPhrases] = useState<{ _id: string; text: string; translation: string }[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [formData, setFormData] = useState({
    lessonId: "",
    phraseId: "",
    type: "multiple-choice" as QuestionType,
    subtype: "mc-select-translation" as QuestionSubtype,
    promptTemplate: "What is {phrase} in English?",
    optionsCsv: "",
    correctIndex: 0,
    explanation: "",
    reviewSentence: "",
    reviewWordsCsv: "",
    reviewCorrectOrderCsv: "",
    reviewMeaning: "",
  })

  const subtypeTemplates: Record<QuestionSubtype, string> = {
    "mc-select-translation": "What is {phrase} in English?",
    "mc-select-missing-word": "Select the missing word for {phrase}",
    "fg-word-order": "Arrange the words to mean: {meaning}",
    "fg-gap-fill": "Fill in the blank for {phrase}",
    "ls-mc-select-translation": "Listen and select the correct translation",
    "ls-mc-select-missing-word": "Listen and select the missing word",
    "ls-fg-word-order": "Listen and arrange the words",
    "ls-fg-gap-fill": "Listen and fill in the blank",
    "ls-dictation": "Listen and type what you hear",
    "tone-recognition": "Which syllable has the rising tone?"
  }

  const isFillInGapType = formData.type === "fill-in-the-gap"
  const isListeningType = formData.type === "listening"
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all")

  async function fetchLessons() {
    try {
      const data = await lessonService.listLessons()
      setLessons(data)
    } catch {
      toast.error("Failed to load lessons")
    }
  }

  async function fetchPhrases(lessonId: string) {
    try {
      const data = await phraseService.listPhrases(lessonId)
      setPhrases(data.map((p: any) => ({ _id: p._id, text: p.text, translation: p.translation })))
    } catch {
      toast.error("Failed to load phrases")
      setPhrases([])
    }
  }

  async function fetchQuestions(status?: Status) {
    try {
      const data = await questionService.listQuestionsPage({
        ...(status ? { status } : {}),
        q: search || undefined,
        page,
        limit
      })
      setQuestions(data.items)
      setTotal(data.total)
      setTotalPages(data.pagination.totalPages)
    } catch {
      toast.error("Failed to load questions")
    }
  }

  useEffect(() => {
    fetchLessons()
  }, [])

  useEffect(() => {
    fetchQuestions(statusFilter === "all" ? undefined : statusFilter).finally(() => setIsLoading(false))
  }, [page, search, limit, statusFilter])

  useEffect(() => {
    setPage(1)
  }, [search, statusFilter])

  useEffect(() => {
    const q = searchParams.get("q") || ""
    const qPage = Number(searchParams.get("page") || "1")
    const qLimit = Number(searchParams.get("limit") || "20")
    const qStatus = searchParams.get("status")
    setSearch(q)
    setPage(Number.isInteger(qPage) && qPage > 0 ? qPage : 1)
    setLimit([10, 20, 50].includes(qLimit) ? qLimit : 20)
    if (qStatus === "draft" || qStatus === "finished" || qStatus === "published" || qStatus === "all") {
      setStatusFilter(qStatus)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    if (search) params.set("q", search)
    else params.delete("q")
    if (statusFilter !== "all") params.set("status", statusFilter)
    else params.delete("status")
    params.set("page", String(page))
    params.set("limit", String(limit))
    const nextQuery = params.toString()
    if (nextQuery === searchParams.toString()) return
    router.replace(`${pathname}?${nextQuery}`)
  }, [search, statusFilter, page, limit, pathname, router, searchParams])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!formData.lessonId) {
      toast.error("Select a lesson")
      return
    }
    if (!formData.phraseId) {
      toast.error("Select a phrase")
      return
    }

    try {
      if (isFillInGapType) {
        const words = formData.reviewWordsCsv.split(",").map((v) => v.trim()).filter(Boolean)
        const correctOrder = formData.reviewCorrectOrderCsv
          .split(",")
          .map((v) => Number(v.trim()))
          .filter((n) => !Number.isNaN(n))

        await questionService.createQuestion({
          lessonId: formData.lessonId,
          phraseId: formData.phraseId,
          type: formData.type,
          subtype: formData.subtype,
          promptTemplate: formData.promptTemplate,
          reviewData: {
            sentence: formData.reviewSentence,
            words,
            correctOrder,
            meaning: formData.reviewMeaning,
          },
          explanation: formData.explanation,
        })
      } else {
        const options = formData.optionsCsv.split(",").map((v) => v.trim()).filter(Boolean)
        if (options.length < 2) {
          toast.error("Add at least 2 options")
          return
        }

        await questionService.createQuestion({
          lessonId: formData.lessonId,
          phraseId: formData.phraseId,
          type: formData.type,
          subtype: formData.subtype,
          promptTemplate: formData.promptTemplate,
          options,
          correctIndex: Number(formData.correctIndex),
          explanation: formData.explanation,
        })
      }
      toast.success("Question created")
      setFormData({
        lessonId: formData.lessonId,
        phraseId: "",
        type: formData.type,
        subtype: formData.subtype,
        promptTemplate: subtypeTemplates[formData.subtype],
        optionsCsv: "",
        correctIndex: 0,
        explanation: "",
        reviewSentence: "",
        reviewWordsCsv: "",
        reviewCorrectOrderCsv: "",
        reviewMeaning: "",
      })
      fetchQuestions()
    } catch (error: any) {
      toast.error(error.response?.data?.error || "Failed to create question")
    }
  }

  async function handlePublish(id: string) {
    try {
      await questionService.publishQuestion(id)
      toast.success("Question published")
      fetchQuestions()
    } catch {
      toast.error("Failed to publish question")
    }
  }

  async function handleSendBackToTutor(id: string) {
    try {
      await questionService.sendBackToTutorQuestion(id)
      toast.success("Question sent back to tutor")
      fetchQuestions()
    } catch {
      toast.error("Failed to send question back")
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this question?")) return
    try {
      await questionService.deleteQuestion(id)
      toast.success("Question deleted")
      fetchQuestions()
    } catch {
      toast.error("Failed to delete question")
    }
  }

  return (
    <div className="space-y-10 pb-20">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Questions Bank</h1>
        <p className="text-base text-muted-foreground">Create and manage your exercise questions curriculum.</p>
      </div>

      {/* Form Section - Full Width at Top */}
      <Card className="border-4 border-primary/10 shadow-2xl rounded-[2.5rem] overflow-hidden">
        <CardHeader className="bg-primary/5 py-6 px-8 border-b border-primary/10">
          <CardTitle className="text-lg font-bold flex items-center gap-3 text-primary">
            <div className="p-3 bg-primary rounded-2xl text-white shadow-lg shadow-primary/20">
              <BookOpen className="h-6 w-6" />
            </div>
            Create New Question
          </CardTitle>
        </CardHeader>
        <CardContent className="p-10">
          <form className="space-y-8" onSubmit={handleCreate}>
            <div className="grid gap-8 md:grid-cols-3">
              <div className="space-y-3">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground ml-1">Select Lesson</Label>
                <Select value={formData.lessonId} onValueChange={(v) => {
                  setFormData({ ...formData, lessonId: v, phraseId: "" })
                  fetchPhrases(v)
                }}>
                  <SelectTrigger className="h-12 rounded-xl border border-secondary focus:ring-primary text-sm"><SelectValue placeholder="Choose a lesson..." /></SelectTrigger>
                  <SelectContent className="rounded-2xl border-2 shadow-xl">
                    {lessons.map((lesson) => (
                      <SelectItem key={lesson._id} value={lesson._id} className="py-2">{lesson.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground ml-1">Select Phrase</Label>
                <Select value={formData.phraseId} onValueChange={(v) => setFormData({ ...formData, phraseId: v })}>
                  <SelectTrigger className="h-12 rounded-xl border border-secondary focus:ring-primary text-sm"><SelectValue placeholder="Choose a phrase..." /></SelectTrigger>
                  <SelectContent className="rounded-2xl border-2 shadow-xl">
                    {phrases.map((phrase) => (
                      <SelectItem key={phrase._id} value={phrase._id} className="py-2">{phrase.text} ({phrase.translation})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground ml-1">Question Type</Label>
                <Select value={formData.type} onValueChange={(v) => {
                  const newType = v as QuestionType
                  let newSubtype = formData.subtype
                  if (newType === "multiple-choice") newSubtype = "mc-select-translation"
                  if (newType === "fill-in-the-gap") newSubtype = "fg-word-order"
                  if (newType === "listening") newSubtype = "ls-mc-select-translation"
                  setFormData({ ...formData, type: newType, subtype: newSubtype, promptTemplate: subtypeTemplates[newSubtype] })
                }}>
                  <SelectTrigger className="h-12 rounded-xl border border-secondary focus:ring-primary text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-2xl border-2 shadow-xl">
                    <SelectItem value="multiple-choice" className="py-2 text-orange-600">Multiple Choice</SelectItem>
                    <SelectItem value="fill-in-the-gap" className="py-2 text-emerald-600">Fill in the Gap</SelectItem>
                    <SelectItem value="listening" className="py-2 text-blue-600">Listening</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground ml-1">Question Subtype</Label>
                <Select value={formData.subtype} onValueChange={(v) => {
                  const newSubtype = v as QuestionSubtype
                  setFormData({ ...formData, subtype: newSubtype, promptTemplate: subtypeTemplates[newSubtype] })
                }}>
                  <SelectTrigger className="h-12 rounded-xl border border-secondary focus:ring-primary text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-2xl border-2 shadow-xl">
                    {formData.type === "multiple-choice" && (
                      <>
                        <SelectItem value="mc-select-translation" className="py-2">Select Translation</SelectItem>
                        <SelectItem value="mc-select-missing-word" className="py-2">Select Missing Word</SelectItem>
                      </>
                    )}
                    {formData.type === "fill-in-the-gap" && (
                      <>
                        <SelectItem value="fg-word-order" className="py-2">Word Order</SelectItem>
                        <SelectItem value="fg-gap-fill" className="py-2">Gap Fill</SelectItem>
                      </>
                    )}
                    {formData.type === "listening" && (
                      <>
                        <SelectItem value="ls-mc-select-translation" className="py-2">Listen & Pick Translation</SelectItem>
                        <SelectItem value="ls-mc-select-missing-word" className="py-2">Listen & Pick Word</SelectItem>
                        <SelectItem value="ls-fg-word-order" className="py-2">Listen & Order Sentence</SelectItem>
                        <SelectItem value="ls-fg-gap-fill" className="py-2">Listen & Gap Fill</SelectItem>
                        <SelectItem value="ls-dictation" className="py-2">Listen & Dictation</SelectItem>
                        <SelectItem value="ls-tone-recognition" className="py-2">Tone Recognition</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {!isFillInGapType && (
              <div className="space-y-3">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground ml-1">Prompt Template</Label>
                <Input
                  value={formData.promptTemplate}
                  onChange={(e) => setFormData({ ...formData, promptTemplate: e.target.value })}
                  placeholder="e.g. What is {phrase} in English?"
                  required
                  className="h-12 rounded-xl border border-secondary focus-visible:ring-primary text-sm"
                />
              </div>
            )}

            {!isFillInGapType ? (
              <>
                <div className="grid gap-8 md:grid-cols-2">
                  <div className="space-y-3">
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground ml-1">Correct Index (0-based)</Label>
                    <Input 
                      type="number" 
                      min={0} 
                      value={formData.correctIndex} 
                      onChange={(e) => setFormData({ ...formData, correctIndex: Number(e.target.value) })} 
                      required 
                      className="h-12 rounded-xl border border-secondary focus-visible:ring-primary text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground ml-1">Answer Options (comma separated)</Label>
                  <Input 
                    value={formData.optionsCsv} 
                    onChange={(e) => setFormData({ ...formData, optionsCsv: e.target.value })} 
                    placeholder="Correct Answer, Wrong Answer 1, Wrong Answer 2" 
                    required 
                    className="h-12 rounded-xl border border-secondary focus-visible:ring-primary text-sm"
                  />
                </div>
              </>
            ) : (
              <div className="grid gap-8 md:grid-cols-2">
                <div className="space-y-3 md:col-span-2">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground ml-1">Sentence</Label>
                  <Input
                    value={formData.reviewSentence}
                    onChange={(e) => setFormData({ ...formData, reviewSentence: e.target.value })}
                    placeholder="Ẹ káàrọ̀ ní"
                    required
                    className="h-12 rounded-xl border border-secondary focus-visible:ring-primary text-sm"
                  />
                </div>
                <div className="space-y-3">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground ml-1">Words (comma separated)</Label>
                  <Input
                    value={formData.reviewWordsCsv}
                    onChange={(e) => setFormData({ ...formData, reviewWordsCsv: e.target.value })}
                    placeholder="ní, Ẹ, káàrọ̀"
                    required
                    className="h-12 rounded-xl border border-secondary focus-visible:ring-primary text-sm"
                  />
                </div>
                <div className="space-y-3">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground ml-1">Correct Order (indices)</Label>
                  <Input
                    value={formData.reviewCorrectOrderCsv}
                    onChange={(e) => setFormData({ ...formData, reviewCorrectOrderCsv: e.target.value })}
                    placeholder="1,2,0"
                    required
                    className="h-12 rounded-xl border border-secondary focus-visible:ring-primary text-sm"
                  />
                </div>
                <div className="space-y-3 md:col-span-2">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground ml-1">Meaning</Label>
                  <Input
                    value={formData.reviewMeaning}
                    onChange={(e) => setFormData({ ...formData, reviewMeaning: e.target.value })}
                    placeholder="Good morning"
                    className="h-12 rounded-xl border border-secondary focus-visible:ring-primary text-sm"
                  />
                </div>
              </div>
            )}

            <div className="space-y-3">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground ml-1">Explanation</Label>
              <Textarea 
                value={formData.explanation} 
                onChange={(e) => setFormData({ ...formData, explanation: e.target.value })} 
                placeholder="Explain why the answer is correct..." 
                className="min-h-[120px] rounded-xl border border-secondary focus-visible:ring-primary text-sm p-4"
              />
            </div>

            <div className="flex justify-end pt-4">
              <Button type="submit" className="h-11 px-6 rounded-xl font-semibold text-sm shadow-sm">
                Create Question
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* List Section - Full Width Below */}
      <Card className="border-4 border-accent/10 shadow-2xl rounded-[2.5rem] overflow-hidden">
        <CardHeader className="bg-accent/5 py-6 px-8 border-b border-accent/10">
          <CardTitle className="text-lg font-bold flex items-center gap-3 text-accent">
            <div className="p-3 bg-accent rounded-2xl text-white shadow-lg shadow-accent/20">
              <MessageSquare className="h-6 w-6" />
            </div>
            Active Question Bank
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-8 pt-6">
            <DataTableControls
              search={search}
              onSearchChange={setSearch}
              page={page}
              limit={limit}
              onLimitChange={(value) => {
                setLimit(value)
                setPage(1)
              }}
              totalPages={totalPages}
              total={total}
              label="Search questions"
              onPrev={() => setPage((prev) => Math.max(1, prev - 1))}
              onNext={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            />
            <div className="pb-4">
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | Status)}>
                <SelectTrigger className="h-10 w-[220px]">
                  <SelectValue placeholder="Filter by status" />
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
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-primary/5">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="font-bold text-primary h-12 pl-6 uppercase tracking-wide text-xs">Type</TableHead>
                  <TableHead className="font-bold text-primary h-12 uppercase tracking-wide text-xs">Prompt Template</TableHead>
                  <TableHead className="font-bold text-primary h-12 uppercase tracking-wide text-xs">Target Phrase</TableHead>
                  <TableHead className="font-bold text-primary h-12 uppercase tracking-wide text-xs text-center">Status</TableHead>
                  <TableHead className="text-right font-bold text-primary h-12 pr-6 uppercase tracking-wide text-xs">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="h-40 text-center text-muted-foreground text-sm">Loading questions...</TableCell></TableRow>
                ) : questions.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="h-40 text-center text-muted-foreground text-sm">Empty Question Bank</TableCell></TableRow>
                ) : (
                  questions.map((q) => (
                    <TableRow key={q._id} className="hover:bg-secondary/20 transition-colors group">
                      <TableCell className="pl-6 h-16">
                        <Badge className={cn(
                          "capitalize font-semibold px-3 py-1 rounded-md border-none text-[10px] tracking-tight",
                          q.type === 'multiple-choice' && "bg-orange-100 text-orange-700",
                          q.type === 'fill-in-the-gap' && "bg-emerald-100 text-emerald-700",
                          q.type === 'listening' && "bg-blue-100 text-blue-700",
                        )}>
                          {q.type.replaceAll("-", " ")}: {q.subtype.replaceAll("-", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[300px] text-foreground text-sm truncate group-hover:text-primary transition-colors">{q.promptTemplate}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{typeof q.phraseId === "string" ? q.phraseId : q.phraseId.text}</TableCell>
                      <TableCell className="text-center">
                        <Badge className={cn("font-semibold rounded-md border-none px-3 py-1 text-xs", workflowStatusBadgeClass(q.status))}>
                          {q.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        <div className="flex justify-end items-center gap-3">
                          {q.status === "finished" && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleSendBackToTutor(q._id)}
                                className="h-12 w-12 text-amber-600 hover:text-amber-700 hover:bg-amber-100 rounded-2xl transition-all"
                                title="Send back to tutor"
                              >
                                <RotateCcw className="h-6 w-6" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handlePublish(q._id)}
                                className="h-12 w-12 text-accent hover:text-accent hover:bg-accent/10 rounded-2xl transition-all"
                                title="Publish"
                              >
                                <CheckCircle className="h-6 w-6" />
                              </Button>
                            </>
                          )}
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleDelete(q._id)} 
                            className="h-12 w-12 text-destructive hover:text-destructive hover:bg-destructive/10 rounded-2xl transition-all"
                            title="Delete"
                          >
                            <Trash2 className="h-6 w-6" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
