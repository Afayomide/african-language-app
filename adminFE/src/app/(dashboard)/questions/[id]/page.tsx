'use client'

import { use, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { lessonService, phraseService, questionService } from "@/services"
import { ExerciseQuestion, Lesson, Phrase, QuestionSubtype, QuestionType } from "@/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ArrowLeft, Save } from "lucide-react"
import { toast } from "sonner"

type PhraseOption = {
  _id: string
  text: string
  translations: string[]
  images?: Phrase["images"]
}

type MatchingItemDraft = {
  phraseId: string
  translationIndex: number
}

const SUBTYPE_TEMPLATES: Record<QuestionSubtype, string> = {
  "mc-select-translation": "What is {phrase} in English?",
  "mc-select-missing-word": "Select the missing word: {sentence}",
  "fg-word-order": "Arrange the words to mean: {meaning}",
  "fg-letter-order": "Arrange the letters to spell the phrase for: {meaning}",
  "fg-gap-fill": "Fill in the blank: {sentence}",
  "ls-mc-select-translation": "Listen to {phrase} and choose the meaning.",
  "ls-mc-select-missing-word": "Listen and choose the word you heard.",
  "ls-fg-word-order": "Listen and arrange the words to match: {meaning}",
  "ls-fg-gap-fill": "Listen and fill in the blank: {sentence}",
  "mt-match-image": "Match each phrase to the correct image.",
  "mt-match-translation": "Match each phrase to the correct translation.",
  "ls-dictation": "Listen and type what you hear",
  "ls-tone-recognition": "Which syllable has the rising tone?"
}

function getPhraseId(value: ExerciseQuestion["phraseId"]) {
  return typeof value === "string" ? value : value?._id || ""
}

export default function EditQuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [question, setQuestion] = useState<ExerciseQuestion | null>(null)
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [phrases, setPhrases] = useState<PhraseOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [optionsCsv, setOptionsCsv] = useState("")
  const [reviewWordsCsv, setReviewWordsCsv] = useState("")
  const [reviewCorrectOrderCsv, setReviewCorrectOrderCsv] = useState("")
  const [reviewSentence, setReviewSentence] = useState("")
  const [reviewMeaning, setReviewMeaning] = useState("")
  const [matchingItems, setMatchingItems] = useState<MatchingItemDraft[]>([])

  const isMatchingQuestion = question?.type === "matching"
  const requiresReviewData = question ? ["mc-select-missing-word", "fg-word-order", "fg-gap-fill", "ls-fg-word-order", "ls-fg-gap-fill"].includes(question.subtype) : false
  const usesChoiceOptions = question ? ["mc-select-translation", "mc-select-missing-word", "fg-gap-fill", "ls-mc-select-translation", "ls-mc-select-missing-word", "ls-fg-gap-fill"].includes(question.subtype) : false

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
        { value: "fg-letter-order", label: "Letter Order / Spelling" },
        { value: "fg-gap-fill", label: "Gap Fill" }
      ]
    }
    if (question.type === "listening") {
      return [
        { value: "ls-mc-select-translation", label: "Listen & Pick Translation" },
        { value: "ls-mc-select-missing-word", label: "Listen & Pick Word" },
        { value: "ls-fg-word-order", label: "Listen & Order Sentence" },
        { value: "ls-fg-gap-fill", label: "Listen & Gap Fill" }
      ]
    }
    return [
      { value: "mt-match-image", label: "Match Word To Image" },
      { value: "mt-match-translation", label: "Match Word To Translation" }
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
        setMatchingItems(
          Array.isArray(loadedQuestion.interactionData?.matchingPairs)
            ? loadedQuestion.interactionData.matchingPairs.map((pair) => ({
                phraseId: pair.phraseId,
                translationIndex: pair.translationIndex
              }))
            : []
        )

        const lessonId = loadedQuestion.lessonId
        if (lessonId) {
          await loadPhrasesForLesson(lessonId)
        }
      } catch {
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
      setPhrases(
        lessonPhrases.map((phrase) => ({
          _id: phrase._id,
          text: phrase.text,
          translations: phrase.translations || [],
          images: phrase.images || []
        }))
      )
    } catch {
      toast.error("Failed to load phrases.")
      setPhrases([])
    }
  }

  function toggleMatchingPhrase(phraseId: string, checked: boolean) {
    setMatchingItems((current) =>
      checked
        ? [...current, { phraseId, translationIndex: 0 }]
        : current.filter((item) => item.phraseId !== phraseId)
    )
  }

  function updateMatchingTranslationIndex(phraseId: string, translationIndex: number) {
    setMatchingItems((current) =>
      current.map((item) => (item.phraseId === phraseId ? { ...item, translationIndex } : item))
    )
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    if (!question) return

    if (!isMatchingQuestion && !getPhraseId(question.phraseId)) {
      toast.error("Select a phrase.")
      return
    }

    if (isMatchingQuestion && matchingItems.length < 2) {
      toast.error("Select at least two phrases for a matching question.")
      return
    }

    if (isMatchingQuestion && question.subtype === "mt-match-image") {
      const missingImages = matchingItems.some((item) => {
        const phrase = phrases.find((entry) => entry._id === item.phraseId)
        return !phrase?.images || phrase.images.length === 0
      })
      if (missingImages) {
        toast.error("Each selected phrase needs at least one linked image.")
        return
      }
    }

    const payload: {
      lessonId: string
      phraseId: string
      translationIndex: number
      type: QuestionType
      subtype: QuestionSubtype
      promptTemplate: string
      explanation: string
      options?: string[]
      correctIndex?: number
      reviewData?: {
        sentence: string
        words: string[]
        correctOrder: number[]
        meaning: string
      }
      relatedPhraseIds?: string[]
      interactionData?: {
        matchingPairs?: Array<{
          phraseId: string
          translationIndex: number
          imageAssetId?: string
        }>
      }
    } = {
      lessonId: question.lessonId,
      phraseId: isMatchingQuestion ? matchingItems[0]?.phraseId || "" : getPhraseId(question.phraseId),
      translationIndex: isMatchingQuestion ? matchingItems[0]?.translationIndex || 0 : question.translationIndex,
      type: question.type,
      subtype: question.subtype,
      promptTemplate: question.promptTemplate,
      explanation: question.explanation
    }

    if (requiresReviewData) {
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
      if (usesChoiceOptions) {
        payload.options = optionsCsv.split(",").map((item) => item.trim()).filter(Boolean)
        payload.correctIndex = question.correctIndex
      }
    } else if (usesChoiceOptions) {
      payload.options = optionsCsv.split(",").map((item) => item.trim()).filter(Boolean)
      payload.correctIndex = question.correctIndex
    } else {
      payload.options = []
      payload.correctIndex = 0
    }

    if (isMatchingQuestion) {
      const matchingPairs = matchingItems.map((item) => {
        const phrase = phrases.find((entry) => entry._id === item.phraseId)
        const preferredImage = phrase?.images?.find((image) => image.isPrimary) || phrase?.images?.[0]
        return {
          phraseId: item.phraseId,
          translationIndex: item.translationIndex,
          imageAssetId: question.subtype === "mt-match-image" ? preferredImage?.imageAssetId : undefined
        }
      })
      payload.relatedPhraseIds = matchingPairs.map((item) => item.phraseId)
      payload.interactionData = { matchingPairs }
      payload.options = []
      payload.correctIndex = 0
      delete payload.reviewData
    }

    try {
      setIsSaving(true)
      await questionService.updateQuestion(id, payload as Partial<ExerciseQuestion>)
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
                    setQuestion((current) => current ? {
                      ...current,
                      lessonId: value,
                      phraseId: "",
                      translationIndex: 0
                    } : current)
                    setMatchingItems([])
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

              {!isMatchingQuestion && (
                <div className="space-y-2">
                  <Label>Phrase</Label>
                  <Select
                    value={getPhraseId(question.phraseId)}
                    onValueChange={(value) => setQuestion({ ...question, phraseId: value, translationIndex: 0 })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select phrase" /></SelectTrigger>
                    <SelectContent>
                      {phrases.map((phrase) => (
                        <SelectItem key={phrase._id} value={phrase._id}>
                          {phrase.text} ({phrase.translations.join(" | ")})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {!isMatchingQuestion && (
                <div className="space-y-2">
                  <Label>Translation Index</Label>
                  <Select
                    value={String(question.translationIndex ?? 0)}
                    onValueChange={(value) => setQuestion({ ...question, translationIndex: Number(value) })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select translation index" /></SelectTrigger>
                    <SelectContent>
                      {(phrases.find((phrase) => phrase._id === getPhraseId(question.phraseId))?.translations || []).map((item, index) => (
                        <SelectItem key={`edit-translation-${index}`} value={String(index)}>
                          Index {index}: {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={question.type}
                  onValueChange={(value) => {
                    const type = value as QuestionType
                    const subtype =
                      type === "multiple-choice"
                        ? "mc-select-translation"
                        : type === "fill-in-the-gap"
                          ? "fg-word-order"
                          : type === "listening"
                            ? "ls-mc-select-translation"
                            : "mt-match-image"
                    setQuestion({
                      ...question,
                      type,
                      subtype,
                      promptTemplate: SUBTYPE_TEMPLATES[subtype]
                    })
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="multiple-choice">Multiple Choice</SelectItem>
                    <SelectItem value="fill-in-the-gap">Fill in the Gap</SelectItem>
                    <SelectItem value="listening">Listening</SelectItem>
                    <SelectItem value="matching">Matching</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Subtype</Label>
                <Select
                  value={question.subtype}
                  onValueChange={(value) => setQuestion({
                    ...question,
                    subtype: value as QuestionSubtype,
                    promptTemplate: SUBTYPE_TEMPLATES[value as QuestionSubtype]
                  })}
                >
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

            {isMatchingQuestion && (
              <div className="space-y-4 rounded-2xl border border-secondary/40 p-4">
                <div className="space-y-1">
                  <Label>Matching Phrases</Label>
                  <p className="text-sm text-muted-foreground">
                    Select at least two phrases. For image matching, each phrase needs a linked image.
                  </p>
                </div>
                <div className="space-y-3">
                  {phrases.map((phrase) => {
                    const selected = matchingItems.find((item) => item.phraseId === phrase._id)
                    return (
                      <div key={phrase._id} className="rounded-xl border bg-background p-3">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <label className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={Boolean(selected)}
                              onChange={(event) => toggleMatchingPhrase(phrase._id, event.target.checked)}
                            />
                            <div>
                              <p className="font-semibold">{phrase.text}</p>
                              <p className="text-sm text-muted-foreground">{phrase.translations.join(" | ")}</p>
                            </div>
                          </label>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{phrase.images?.length || 0} image(s)</Badge>
                            {selected && (
                              <Select
                                value={String(selected.translationIndex)}
                                onValueChange={(value) => updateMatchingTranslationIndex(phrase._id, Number(value))}
                              >
                                <SelectTrigger className="w-[220px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {phrase.translations.map((translation, index) => (
                                    <SelectItem key={`${phrase._id}-${index}`} value={String(index)}>
                                      {index}: {translation}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {usesChoiceOptions && (
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
            )}

            {requiresReviewData && (
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
