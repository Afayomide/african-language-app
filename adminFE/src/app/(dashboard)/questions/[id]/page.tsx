'use client'

import { use, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { lessonService, phraseService, questionService } from "@/services"
import { ExerciseQuestion, Lesson, QuestionSubtype, QuestionType } from "@/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ArrowLeft, Save } from "lucide-react"
import { toast } from "sonner"

export default function EditQuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [question, setQuestion] = useState<ExerciseQuestion | null>(null)
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [phrases, setPhrases] = useState<Array<{ _id: string; text: string; translation: string }>>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [optionsCsv, setOptionsCsv] = useState("")
  const [reviewWordsCsv, setReviewWordsCsv] = useState("")
  const [reviewCorrectOrderCsv, setReviewCorrectOrderCsv] = useState("")
  const [reviewSentence, setReviewSentence] = useState("")
  const [reviewMeaning, setReviewMeaning] = useState("")

  const isFill = question?.type === "fill-in-the-gap"

  const subtypeOptions = useMemo(() => {
    if (!question) return []
    if (question.type === "multiple-choice") {
      return [
        { value: "mc-select-translation", label: "Select Translation" },
        { value: "mc-select-missing-word", label: "Select Missing Word" }
      ]
    }
    if (question.type === "fill-in-the-gap") {
      return [
        { value: "fg-word-order", label: "Word Order" },
        { value: "fg-gap-fill", label: "Gap Fill" }
      ]
    }
    return [
      { value: "ls-mc-select-translation", label: "Listen & Pick Translation" },
      { value: "ls-mc-select-missing-word", label: "Listen & Pick Word" },
      { value: "ls-fg-word-order", label: "Listen & Order Sentence" },
      { value: "ls-fg-gap-fill", label: "Listen & Gap Fill" },
      { value: "ls-dictation", label: "Dictation" },
      { value: "ls-tone-recognition", label: "Tone Recognition" }
    ]
  }, [question])

  useEffect(() => {
    const load = async () => {
      try {
        const [loadedQuestion, loadedLessons] = await Promise.all([
          questionService.getQuestion(id),
          lessonService.listLessons()
        ])
        setQuestion(loadedQuestion)
        setLessons(loadedLessons)
        setOptionsCsv((loadedQuestion.options || []).join(", "))
        setReviewSentence(loadedQuestion.reviewData?.sentence || "")
        setReviewWordsCsv((loadedQuestion.reviewData?.words || []).join(", "))
        setReviewCorrectOrderCsv((loadedQuestion.reviewData?.correctOrder || []).join(", "))
        setReviewMeaning(loadedQuestion.reviewData?.meaning || "")

        const lessonId = loadedQuestion.lessonId
        if (lessonId) {
          const lessonPhrases = await phraseService.listPhrases(lessonId)
          setPhrases(lessonPhrases.map((p) => ({ _id: p._id, text: p.text, translation: p.translation })))
        }
      } catch (error) {
        toast.error("Failed to load question.")
        router.push("/questions")
      } finally {
        setIsLoading(false)
      }
    }
    void load()
  }, [id, router])

  async function loadPhrasesForLesson(lessonId: string) {
    try {
      const lessonPhrases = await phraseService.listPhrases(lessonId)
      setPhrases(lessonPhrases.map((p) => ({ _id: p._id, text: p.text, translation: p.translation })))
    } catch (error) {
      toast.error("Failed to load phrases.")
      setPhrases([])
    }
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    if (!question) return

    const payload: Partial<ExerciseQuestion> = {
      lessonId: question.lessonId,
      phraseId: question.phraseId,
      type: question.type,
      subtype: question.subtype,
      promptTemplate: question.promptTemplate,
      explanation: question.explanation
    }

    if (isFill) {
      const words = reviewWordsCsv.split(",").map((item) => item.trim()).filter(Boolean)
      const correctOrder = reviewCorrectOrderCsv
        .split(",")
        .map((item) => Number(item.trim()))
        .filter((item) => !Number.isNaN(item))
      payload.reviewData = {
        sentence: reviewSentence.trim(),
        words,
        correctOrder,
        meaning: reviewMeaning.trim()
      }
    } else {
      payload.options = optionsCsv.split(",").map((item) => item.trim()).filter(Boolean)
      payload.correctIndex = question.correctIndex
    }

    try {
      setIsSaving(true)
      await questionService.updateQuestion(id, payload)
      toast.success("Question updated.")
      router.push("/questions")
    } catch (error: any) {
      toast.error(error.response?.data?.error || "Failed to update question.")
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) return <div className="text-muted-foreground">Loading question...</div>
  if (!question) return <div className="text-muted-foreground">Question not found.</div>

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push("/questions")} className="rounded-full">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Edit Question</h1>
          <p className="text-muted-foreground">Update prompt, options, phrase mapping and explanation.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Question Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-6" onSubmit={handleSave}>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Lesson</Label>
                <Select
                  value={question.lessonId}
                  onValueChange={async (value) => {
                    setQuestion({ ...question, lessonId: value, phraseId: "" })
                    await loadPhrasesForLesson(value)
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Select lesson" /></SelectTrigger>
                  <SelectContent>
                    {lessons.map((lesson) => (
                      <SelectItem key={lesson._id} value={lesson._id}>{lesson.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Phrase</Label>
                <Select value={typeof question.phraseId === "string" ? question.phraseId : question.phraseId._id} onValueChange={(value) => setQuestion({ ...question, phraseId: value })}>
                  <SelectTrigger><SelectValue placeholder="Select phrase" /></SelectTrigger>
                  <SelectContent>
                    {phrases.map((phrase) => (
                      <SelectItem key={phrase._id} value={phrase._id}>{phrase.text} ({phrase.translation})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={question.type} onValueChange={(value) => setQuestion({ ...question, type: value as QuestionType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="multiple-choice">Multiple Choice</SelectItem>
                    <SelectItem value="fill-in-the-gap">Fill in the Gap</SelectItem>
                    <SelectItem value="listening">Listening</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Subtype</Label>
                <Select value={question.subtype} onValueChange={(value) => setQuestion({ ...question, subtype: value as QuestionSubtype })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {subtypeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Prompt Template</Label>
              <Input
                value={question.promptTemplate}
                onChange={(event) => setQuestion({ ...question, promptTemplate: event.target.value })}
              />
            </div>

            {!isFill ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Options (comma separated)</Label>
                  <Input value={optionsCsv} onChange={(event) => setOptionsCsv(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Correct Index</Label>
                  <Input
                    type="number"
                    value={question.correctIndex}
                    onChange={(event) => setQuestion({ ...question, correctIndex: Number(event.target.value) })}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Sentence</Label>
                  <Input value={reviewSentence} onChange={(event) => setReviewSentence(event.target.value)} />
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Words (comma separated)</Label>
                    <Input value={reviewWordsCsv} onChange={(event) => setReviewWordsCsv(event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Correct Order (indices)</Label>
                    <Input value={reviewCorrectOrderCsv} onChange={(event) => setReviewCorrectOrderCsv(event.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Meaning</Label>
                  <Input value={reviewMeaning} onChange={(event) => setReviewMeaning(event.target.value)} />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Explanation</Label>
              <Textarea value={question.explanation} onChange={(event) => setQuestion({ ...question, explanation: event.target.value })} rows={3} />
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={isSaving}>
                <Save className="h-4 w-4 mr-2" />
                {isSaving ? "Saving..." : "Save Question"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

