'use client'

import { use, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { lessonService, expressionService, questionService, wordService, sentenceService } from "@/services"
import { ExerciseQuestion, Lesson, Expression, Word, Sentence, QuestionSubtype, QuestionType } from "@/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react"
import { toast } from "sonner"

type SourceOption = {
  _id: string
  text: string
  translations: string[]
  images?: Expression["images"]
  components?: Sentence["components"]
}

type MatchingItemDraft = {
  sourceId: string
  translationIndex: number
}

type MeaningSegmentDraft = {
  text: string
  componentIndexesCsv: string
}

const SUBTYPE_TEMPLATES: Record<QuestionSubtype, string> = {
  "mc-select-translation": "What is {phrase} in English?",
  "mc-select-context-response": "You need the polite form in this real-life situation. Which do you say?",
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
  "ls-tone-recognition": "Which syllable has the rising tone?",
  "sp-pronunciation-compare": "Say {phrase} aloud. Match the tutor's tone and pronunciation."
}

function getSourceId(question: ExerciseQuestion) {
  if (question.sourceId) return question.sourceId
  const source = question.source
  if (source && typeof source !== "string" && source._id) return source._id
  return ""
}

function splitSentenceWords(value: string) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseMeaningSegmentDrafts(
  drafts: MeaningSegmentDraft[],
  components: Sentence["components"]
) {
  const orderedComponents = [...components].sort((left, right) => left.orderIndex - right.orderIndex)
  const wordIndexesByComponent = new Map<number, number[]>()
  let wordCursor = 0
  orderedComponents.forEach((component, index) => {
    const tokenCount = Math.max(1, splitSentenceWords(component.textSnapshot || "").length)
    wordIndexesByComponent.set(index, Array.from({ length: tokenCount }, (_, offset) => wordCursor + offset))
    wordCursor += tokenCount
  })

  const normalized = drafts.map((draft, rowIndex) => {
    const text = draft.text.trim()
    const sourceComponentIndexes = Array.from(
      new Set(
        draft.componentIndexesCsv
          .split(",")
          .map((item) => Number(item.trim()))
          .filter((item) => Number.isInteger(item))
      )
    )
    if (!text) return { error: `Meaning segment ${rowIndex + 1} needs text.` as const }
    if (sourceComponentIndexes.length === 0) return { error: `Meaning segment ${rowIndex + 1} needs component indexes.` as const }
    if (sourceComponentIndexes.some((index) => index < 0 || index >= orderedComponents.length)) {
      return { error: `Meaning segment ${rowIndex + 1} has an invalid component index.` as const }
    }
    return {
      text,
      sourceComponentIndexes,
      sourceWordIndexes: sourceComponentIndexes.flatMap((index) => wordIndexesByComponent.get(index) || [])
    }
  })

  const firstError = normalized.find((item) => "error" in item)
  if (firstError && "error" in firstError) return { error: firstError.error }

  const segments = normalized as Array<{
    text: string
    sourceComponentIndexes: number[]
    sourceWordIndexes: number[]
  }>
  const flattened = segments.flatMap((segment) => segment.sourceComponentIndexes)
  const expected = orderedComponents.map((_, index) => index)
  if (flattened.length !== expected.length || flattened.some((value, index) => value !== expected[index])) {
    return { error: "Meaning segments must cover every sentence component exactly once and in order." as const }
  }

  return { segments }
}

export default function EditQuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [question, setQuestion] = useState<ExerciseQuestion | null>(null)
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [expressions, setExpressions] = useState<SourceOption[]>([])
  const [words, setWords] = useState<SourceOption[]>([])
  const [sentences, setSentences] = useState<SourceOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [optionsCsv, setOptionsCsv] = useState("")
  const [reviewWordsCsv, setReviewWordsCsv] = useState("")
  const [reviewCorrectOrderCsv, setReviewCorrectOrderCsv] = useState("")
  const [reviewSentence, setReviewSentence] = useState("")
  const [reviewMeaning, setReviewMeaning] = useState("")
  const [meaningSegments, setMeaningSegments] = useState<MeaningSegmentDraft[]>([])
  const [matchingItems, setMatchingItems] = useState<MatchingItemDraft[]>([])

  const isMatchingQuestion = question?.type === "matching"
  const isContextScenarioQuestion = question?.subtype === "mc-select-context-response"
  const requiresReviewData = question ? ["mc-select-missing-word", "fg-word-order", "fg-gap-fill", "ls-fg-word-order", "ls-fg-gap-fill"].includes(question.subtype) : false
  const usesChoiceOptions = question ? ["mc-select-translation", "mc-select-context-response", "mc-select-missing-word", "fg-gap-fill", "ls-mc-select-translation", "ls-mc-select-missing-word", "ls-fg-gap-fill"].includes(question.subtype) : false
  const selectedSourceType = question?.sourceType || "expression"
  const sourceOptions = selectedSourceType === "word" ? words : selectedSourceType === "sentence" ? sentences : expressions
  const selectedSentence =
    question && selectedSourceType === "sentence"
      ? sentences.find((source) => source._id === getSourceId(question))
      : undefined
  const selectedSourceText = question
    ? sourceOptions.find((source) => source._id === getSourceId(question))?.text || ""
    : ""
  const supportsMeaningSegments = Boolean(
    question &&
    selectedSourceType === "sentence" &&
    ["fg-word-order", "ls-fg-word-order"].includes(question.subtype)
  )

  const subtypeOptions = useMemo(() => {
    if (!question) return []
    if (question.type === "multiple-choice") {
      return [
        { value: "mc-select-translation", label: "Select Translation" },
        { value: "mc-select-context-response", label: "Select Appropriate Response" },
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
    if (question.type === "speaking") {
      return [{ value: "sp-pronunciation-compare", label: "Pronunciation Compare" }]
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
        setQuestion({ ...loadedQuestion, sourceType: loadedQuestion.sourceType || "expression" })
        setLessons(loadedLessons)
        setOptionsCsv((loadedQuestion.options || []).join(", "))
        setReviewSentence(loadedQuestion.reviewData?.sentence || "")
        setReviewWordsCsv((loadedQuestion.reviewData?.words || []).join(", "))
        setReviewCorrectOrderCsv((loadedQuestion.reviewData?.correctOrder || []).join(", "))
        setReviewMeaning(loadedQuestion.reviewData?.meaning || "")
        setMeaningSegments(
          Array.isArray(loadedQuestion.reviewData?.meaningSegments)
            ? loadedQuestion.reviewData.meaningSegments.map((segment) => ({
                text: segment.text,
                componentIndexesCsv: Array.isArray(segment.sourceComponentIndexes)
                  ? segment.sourceComponentIndexes.join(", ")
                  : ""
              }))
            : []
        )
        setMatchingItems(
          Array.isArray(loadedQuestion.interactionData?.matchingPairs)
            ? loadedQuestion.interactionData.matchingPairs.map((pair) => ({
                sourceId: pair.contentId || "",
                translationIndex: pair.translationIndex
              }))
            : []
        )

        const lessonId = loadedQuestion.lessonId
        if (lessonId) {
          await loadSourceOptionsForLesson(lessonId, loadedLessons)
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

  async function loadSourceOptionsForLesson(lessonId: string, availableLessons: Lesson[] = lessons) {
    try {
      const lessonLanguage = availableLessons.find((lesson) => lesson._id === lessonId)?.language
      const [loadedExpressions, loadedWords, loadedSentences] = await Promise.all([
        expressionService.listExpressions(undefined, undefined, lessonLanguage),
        wordService.listWords(undefined, undefined, lessonLanguage),
        sentenceService.listSentences(undefined, undefined, lessonLanguage)
      ])
      setExpressions(loadedExpressions.map((expression: Expression) => ({
        _id: expression._id,
        text: expression.text,
        translations: expression.translations || [],
        images: expression.images || []
      })))
      setWords(loadedWords.map((word: Word) => ({
        _id: word._id,
        text: word.text,
        translations: word.translations || []
      })))
      setSentences(loadedSentences.map((sentence: Sentence) => ({
        _id: sentence._id,
        text: sentence.text,
        translations: sentence.translations || [],
        components: sentence.components || []
      })))
    } catch {
      toast.error("Failed to load question sources.")
      setExpressions([])
      setWords([])
      setSentences([])
    }
  }

  function toggleMatchingExpression(sourceId: string, checked: boolean) {
    setMatchingItems((current) =>
      checked
        ? [...current, { sourceId, translationIndex: 0 }]
        : current.filter((item) => item.sourceId !== sourceId)
    )
  }

  function updateMatchingTranslationIndex(sourceId: string, translationIndex: number) {
    setMatchingItems((current) =>
      current.map((item) => (item.sourceId === sourceId ? { ...item, translationIndex } : item))
    )
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    if (!question) return

    if (!isMatchingQuestion && !getSourceId(question)) {
      toast.error("Select a source.")
      return
    }

    if (isMatchingQuestion && matchingItems.length < 2) {
      toast.error("Select at least two expressions for a matching question.")
      return
    }

    if (isMatchingQuestion && question.subtype === "mt-match-image") {
      const missingImages = matchingItems.some((item) => {
        const expression = expressions.find((entry) => entry._id === item.sourceId)
        return !expression?.images || expression.images.length === 0
      })
      if (missingImages) {
        toast.error("Each selected expression needs at least one linked image.")
        return
      }
    }

    const payload: {
      lessonId: string
      sourceType: "word" | "expression" | "sentence"
      sourceId: string
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
        meaningSegments?: Array<{
          text: string
          sourceWordIndexes: number[]
          sourceComponentIndexes?: number[]
        }>
      }
      relatedSourceRefs?: Array<{ type: "word" | "expression" | "sentence"; id: string }>
      interactionData?: {
        matchingPairs?: Array<{
          contentId: string
          translationIndex: number
          imageAssetId?: string
        }>
      }
    } = {
      lessonId: question.lessonId,
      sourceType: isMatchingQuestion ? "expression" : (question.sourceType || "expression"),
      sourceId: isMatchingQuestion ? matchingItems[0]?.sourceId || "" : getSourceId(question),
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
      if (supportsMeaningSegments && meaningSegments.length === 0) {
        toast.error("Add meaning segments for sentence word-order questions.")
        return
      }
      const parsedMeaningSegments = supportsMeaningSegments
        ? parseMeaningSegmentDrafts(meaningSegments, selectedSentence?.components || [])
        : null
      if (parsedMeaningSegments && "error" in parsedMeaningSegments) {
        toast.error(parsedMeaningSegments.error)
        return
      }
      payload.reviewData = {
        sentence: reviewSentence.trim(),
        words,
        correctOrder,
        meaning: reviewMeaning.trim(),
        ...(parsedMeaningSegments && "segments" in parsedMeaningSegments && parsedMeaningSegments.segments.length > 0
          ? { meaningSegments: parsedMeaningSegments.segments }
          : {})
      }
      if (usesChoiceOptions) {
        payload.options = optionsCsv.split(",").map((item) => item.trim()).filter(Boolean)
        payload.correctIndex = question.correctIndex
      }
    } else if (usesChoiceOptions) {
      payload.options = optionsCsv.split(",").map((item) => item.trim()).filter(Boolean)
      payload.correctIndex = question.correctIndex
      if (isContextScenarioQuestion) {
        if (payload.options.length < 2 || payload.options.length > 4) {
          toast.error("Context-response questions must have between 2 and 4 options.")
          return
        }
        const correctOption = String(payload.options[payload.correctIndex] || "").trim()
        if (!selectedSourceText || correctOption !== selectedSourceText) {
          toast.error("For context-response questions, the correct option must exactly match the selected source text.")
          return
        }
      }
    } else {
      payload.options = []
      payload.correctIndex = 0
    }

    if (isMatchingQuestion) {
      const matchingPairs = matchingItems.map((item) => {
        const expression = expressions.find((entry) => entry._id === item.sourceId)
        const preferredImage = expression?.images?.find((image) => image.isPrimary) || expression?.images?.[0]
        return {
          contentId: item.sourceId,
          translationIndex: item.translationIndex,
          imageAssetId: question.subtype === "mt-match-image" ? preferredImage?.imageAssetId : undefined
        }
      })
      payload.relatedSourceRefs = matchingPairs.map((item) => ({ type: "expression" as const, id: item.contentId }))
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
          <p className="text-muted-foreground">Update prompt, options, source mapping and explanation.</p>
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
                      sourceId: "",
                      translationIndex: 0
                    } : current)
                    setMatchingItems([])
                    setMeaningSegments([])
                    await loadSourceOptionsForLesson(value)
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
                  <Label>Source Type</Label>
                  <Select
                    value={question.sourceType || "expression"}
                    onValueChange={(value) => {
                      setQuestion({ ...question, sourceType: value as "word" | "expression" | "sentence", sourceId: "", translationIndex: 0 })
                      setMeaningSegments([])
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="expression">Expression</SelectItem>
                      <SelectItem value="word">Word</SelectItem>
                      <SelectItem value="sentence">Sentence</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {!isMatchingQuestion && (
                <div className="space-y-2">
                  <Label>{selectedSourceType.charAt(0).toUpperCase() + selectedSourceType.slice(1)}</Label>
                  <Select
                    value={getSourceId(question)}
                    onValueChange={(value) => {
                      setQuestion({ ...question, sourceId: value, translationIndex: 0 })
                      if (selectedSourceType === "sentence") setMeaningSegments([])
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder={`Select ${selectedSourceType}`} /></SelectTrigger>
                    <SelectContent>
                      {sourceOptions.map((source) => (
                        <SelectItem key={source._id} value={source._id}>
                          {source.text} ({source.translations.join(" | ")})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {isContextScenarioQuestion ? (
                <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-foreground/75">
                  <p className="font-semibold text-foreground">Context-response authoring</p>
                  <p className="mt-1">Keep the prompt in English as a short real-life situation. Keep the options in the target language. The correct option must exactly match the selected source text, and the distractors should be contextually wrong, not spelling variants.</p>
                </div>
              ) : null}

              {!isMatchingQuestion && (
                <div className="space-y-2">
                  <Label>Translation Index</Label>
                  <Select
                    value={String(question.translationIndex ?? 0)}
                    onValueChange={(value) => setQuestion({ ...question, translationIndex: Number(value) })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select translation index" /></SelectTrigger>
                    <SelectContent>
                      {(sourceOptions.find((source) => source._id === getSourceId(question))?.translations || []).map((item, index) => (
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
                            : type === "speaking"
                              ? "sp-pronunciation-compare"
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
                    <SelectItem value="speaking">Speaking</SelectItem>
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
                  <Label>Matching Expressions</Label>
                  <p className="text-sm text-muted-foreground">
                    Select at least two expressions. For image matching, each expression needs a linked image.
                  </p>
                </div>
                <div className="space-y-3">
                  {expressions.map((expression) => {
                    const selected = matchingItems.find((item) => item.sourceId === expression._id)
                    return (
                      <div key={expression._id} className="rounded-xl border bg-background p-3">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <label className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={Boolean(selected)}
                              onChange={(event) => toggleMatchingExpression(expression._id, event.target.checked)}
                            />
                            <div>
                              <p className="font-semibold">{expression.text}</p>
                              <p className="text-sm text-muted-foreground">{expression.translations.join(" | ")}</p>
                            </div>
                          </label>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{expression.images?.length || 0} image(s)</Badge>
                            {selected && (
                              <Select
                                value={String(selected.translationIndex)}
                                onValueChange={(value) => updateMatchingTranslationIndex(expression._id, Number(value))}
                              >
                                <SelectTrigger className="w-[220px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {expression.translations.map((translation: string, index: number) => (
                                    <SelectItem key={`${expression._id}-${index}`} value={String(index)}>
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
                  <Label>{isContextScenarioQuestion ? "Response Options (comma separated)" : "Options (comma separated)"}</Label>
                  <Input value={optionsCsv} onChange={(event) => setOptionsCsv(event.target.value)} />
                  {isContextScenarioQuestion ? (
                    <p className="text-xs text-muted-foreground">
                      Use 2 to 4 target-language responses. The correct option should be exactly: <span className="font-semibold text-foreground">{selectedSourceText || "the selected source"}</span>.
                    </p>
                  ) : null}
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

                {supportsMeaningSegments ? (
                  <div className="space-y-4 rounded-2xl border border-secondary/40 p-4">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-3">
                        <Label>Meaning Segments</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setMeaningSegments((current) => [...current, { text: "", componentIndexesCsv: "" }])}
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Add Segment
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Map each English chunk to the sentence component indexes below. Cover every component exactly once and in order.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {(selectedSentence?.components || [])
                        .slice()
                        .sort((left, right) => left.orderIndex - right.orderIndex)
                        .map((component, index) => (
                          <Badge key={`${component.refId}-${index}`} variant="outline">
                            {index}: {component.textSnapshot || component.refId}
                          </Badge>
                        ))}
                    </div>

                    {meaningSegments.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No meaning segments yet.</p>
                    ) : (
                      <div className="space-y-3">
                        {meaningSegments.map((segment, index) => (
                          <div key={`meaning-segment-${index}`} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-end">
                            <div className="space-y-2">
                              <Label>Segment Text</Label>
                              <Input
                                value={segment.text}
                                onChange={(event) =>
                                  setMeaningSegments((current) =>
                                    current.map((item, rowIndex) =>
                                      rowIndex === index ? { ...item, text: event.target.value } : item
                                    )
                                  )
                                }
                                placeholder="Good morning"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Component Indexes</Label>
                              <Input
                                value={segment.componentIndexesCsv}
                                onChange={(event) =>
                                  setMeaningSegments((current) =>
                                    current.map((item, rowIndex) =>
                                      rowIndex === index ? { ...item, componentIndexesCsv: event.target.value } : item
                                    )
                                  )
                                }
                                placeholder="0, 1"
                              />
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => setMeaningSegments((current) => current.filter((_, rowIndex) => rowIndex !== index))}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
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
