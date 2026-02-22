'use client'

import { useEffect, useState } from "react"
import { questionService, lessonService, phraseService } from "@/services"
import { ExerciseQuestion, Lesson, QuestionType, Status } from "@/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { DataTableControls } from "@/components/common/data-table-controls"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

export default function TutorQuestionsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [questions, setQuestions] = useState<ExerciseQuestion[]>([])
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [phrases, setPhrases] = useState<{ _id: string; text: string; translation: string }[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [formData, setFormData] = useState({
    lessonId: "",
    phraseId: "",
    type: "practice" as QuestionType,
    promptTemplate: "What is the missing word in: {phrase}?",
    optionsCsv: "",
    correctIndex: 0,
    explanation: "",
    reviewSentence: "",
    reviewWordsCsv: "",
    reviewCorrectOrderCsv: "",
    reviewMeaning: "",
  })

  const isReviewType = formData.type === "review"
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
      setPhrases(data.map((p) => ({ _id: p._id, text: p.text, translation: p.translation })))
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
    if (!formData.lessonId) return toast.error("Select a lesson")
    if (!formData.phraseId) return toast.error("Select a phrase")

    try {
      if (isReviewType) {
        const words = formData.reviewWordsCsv.split(",").map((v) => v.trim()).filter(Boolean)
        const correctOrder = formData.reviewCorrectOrderCsv
          .split(",")
          .map((v) => Number(v.trim()))
          .filter((n) => !Number.isNaN(n))

        await questionService.createQuestion({
          lessonId: formData.lessonId,
          phraseId: formData.phraseId,
          type: formData.type,
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
        if (options.length < 2) return toast.error("Add at least 2 options")

        await questionService.createQuestion({
          lessonId: formData.lessonId,
          phraseId: formData.phraseId,
          type: formData.type,
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
        promptTemplate: formData.type === "review" ? "Arrange the words to form a sentence:" : "What is the missing word in: {phrase}?",
        optionsCsv: "",
        correctIndex: 0,
        explanation: "",
        reviewSentence: "",
        reviewWordsCsv: "",
        reviewCorrectOrderCsv: "",
        reviewMeaning: "",
      })
      fetchQuestions()
    } catch (error: unknown) {
      console.error(error)
      toast.error("Failed to create question")
    }
  }

  async function handleFinish(id: string) {
    try {
      await questionService.finishQuestion(id)
      toast.success("Question sent to admin for publish")
      fetchQuestions()
    } catch {
      toast.error("Failed to mark question as finished")
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
    <div className="space-y-8 pb-20">
      <h1 className="text-3xl font-black">Questions</h1>

      <Card>
        <CardHeader>
          <CardTitle>Create Question</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleCreate}>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Lesson</Label>
                <Select value={formData.lessonId} onValueChange={(v) => {
                  setFormData({ ...formData, lessonId: v, phraseId: "" })
                  fetchPhrases(v)
                }}>
                  <SelectTrigger><SelectValue placeholder="Choose lesson" /></SelectTrigger>
                  <SelectContent>
                    {lessons.map((lesson) => (
                      <SelectItem key={lesson._id} value={lesson._id}>{lesson.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Phrase</Label>
                <Select value={formData.phraseId} onValueChange={(v) => setFormData({ ...formData, phraseId: v })}>
                  <SelectTrigger><SelectValue placeholder="Choose phrase" /></SelectTrigger>
                  <SelectContent>
                    {phrases.map((phrase) => (
                      <SelectItem key={phrase._id} value={phrase._id}>{phrase.text} ({phrase.translation})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v as QuestionType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vocabulary">Vocabulary</SelectItem>
                    <SelectItem value="practice">Practice (Fill in blank)</SelectItem>
                    <SelectItem value="listening">Listening</SelectItem>
                    <SelectItem value="review">Review (Sentence Builder)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Prompt</Label>
              <Input
                value={formData.promptTemplate}
                onChange={(e) => setFormData({ ...formData, promptTemplate: e.target.value })}
                required
              />
            </div>

            {!isReviewType ? (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Options (comma separated)</Label>
                    <Input
                      value={formData.optionsCsv}
                      onChange={(e) => setFormData({ ...formData, optionsCsv: e.target.value })}
                      placeholder="option1, option2, option3"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Correct Index</Label>
                    <Input
                      type="number"
                      min={0}
                      value={formData.correctIndex}
                      onChange={(e) => setFormData({ ...formData, correctIndex: Number(e.target.value) })}
                      required
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label>Sentence</Label>
                  <Input
                    value={formData.reviewSentence}
                    onChange={(e) => setFormData({ ...formData, reviewSentence: e.target.value })}
                    placeholder="Ẹ káàrọ̀ ní"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Words (comma separated)</Label>
                  <Input
                    value={formData.reviewWordsCsv}
                    onChange={(e) => setFormData({ ...formData, reviewWordsCsv: e.target.value })}
                    placeholder="ní, Ẹ, káàrọ̀"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Correct Order (indices)</Label>
                  <Input
                    value={formData.reviewCorrectOrderCsv}
                    onChange={(e) => setFormData({ ...formData, reviewCorrectOrderCsv: e.target.value })}
                    placeholder="1,2,0"
                    required
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Meaning</Label>
                  <Input
                    value={formData.reviewMeaning}
                    onChange={(e) => setFormData({ ...formData, reviewMeaning: e.target.value })}
                    placeholder="Good morning"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Explanation</Label>
              <Textarea
                value={formData.explanation}
                onChange={(e) => setFormData({ ...formData, explanation: e.target.value })}
              />
            </div>

            <Button type="submit">Create Question</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Questions</CardTitle>
        </CardHeader>
        <CardContent>
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
          <div className="px-6 pb-4">
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Prompt</TableHead>
                <TableHead>Phrase</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5}>Loading...</TableCell></TableRow>
              ) : questions.length === 0 ? (
                <TableRow><TableCell colSpan={5}>No questions yet</TableCell></TableRow>
              ) : (
                questions.map((q) => (
                  <TableRow key={q._id}>
                    <TableCell><Badge>{q.type}</Badge></TableCell>
                    <TableCell>{q.promptTemplate}</TableCell>
                    <TableCell>{typeof q.phraseId === 'string' ? q.phraseId : q.phraseId.text}</TableCell>
                    <TableCell><Badge>{q.status}</Badge></TableCell>
                    <TableCell className="text-right space-x-2">
                      {q.status === 'draft' ? (
                        <Button variant="outline" size="sm" onClick={() => handleFinish(q._id)}>Mark finished</Button>
                      ) : null}
                      <Button variant="destructive" size="sm" onClick={() => handleDelete(q._id)}>Delete</Button>
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
