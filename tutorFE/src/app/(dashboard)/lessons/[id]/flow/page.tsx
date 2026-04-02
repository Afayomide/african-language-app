'use client'

import { useState, useEffect, use, useMemo } from "react"
import { useRouter } from "next/navigation"
import { lessonService, expressionService, proverbService, questionService, wordService, sentenceService } from "@/services"
import {
  Lesson,
  LessonBlock,
  LessonStage,
  Expression,
  Proverb,
  ExerciseQuestion,
  Word,
  Sentence,
  ContentType,
  QuestionSubtype,
  QuestionMatchingPair
} from "@/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { ArrowLeft, Save, Trash, Plus, ArrowUp, ArrowDown, LayoutList } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type MatchingEditablePair = {
  pairId: string
  contentType: "word" | "expression"
  contentId: string
  translationIndex: number
  imageAssetId?: string
}

type EditableContent = Word | Expression | Sentence

type SavingState = Record<string, boolean>

const CHOICE_SUBTYPES = new Set<QuestionSubtype>([
  "mc-select-translation",
  "mc-select-context-response",
  "mc-select-missing-word",
  "fg-gap-fill",
  "ls-mc-select-translation",
  "ls-mc-select-missing-word",
  "ls-fg-gap-fill"
])

const MATCHING_SUBTYPES = new Set<QuestionSubtype>([
  "mt-match-image",
  "mt-match-translation"
])

const REVIEW_SUBTYPES = new Set<QuestionSubtype>([
  "mc-select-missing-word",
  "fg-word-order",
  "fg-gap-fill",
  "ls-fg-word-order",
  "ls-fg-gap-fill"
])

const ORDER_SUBTYPES = new Set<QuestionSubtype>([
  "fg-word-order",
  "fg-letter-order",
  "ls-fg-word-order"
])

function getQuestionSourceId(question: ExerciseQuestion) {
  if (question.sourceId) return question.sourceId
  if (question.source && typeof question.source !== "string" && question.source._id) return question.source._id
  return ""
}

function getQuestionSourceType(question: ExerciseQuestion): "word" | "expression" | "sentence" {
  return question.sourceType || "expression"
}

function isChoiceSubtype(subtype: QuestionSubtype) {
  return CHOICE_SUBTYPES.has(subtype)
}

function isMatchingSubtype(subtype: QuestionSubtype) {
  return MATCHING_SUBTYPES.has(subtype)
}

function isReviewSubtype(subtype: QuestionSubtype) {
  return REVIEW_SUBTYPES.has(subtype)
}

function isOrderSubtype(subtype: QuestionSubtype) {
  return ORDER_SUBTYPES.has(subtype)
}

function toCsv(values: string[] | undefined) {
  return Array.isArray(values) ? values.join(", ") : ""
}

function fromCsv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

function matchingPairsFromQuestion(question: ExerciseQuestion): MatchingEditablePair[] {
  return Array.isArray(question.interactionData?.matchingPairs)
    ? question.interactionData!.matchingPairs!.map((pair, index) => ({
        pairId: pair.pairId || `pair-${index + 1}`,
        contentType: pair.contentType === "word" ? "word" : "expression",
        contentId: pair.contentId || "",
        translationIndex: Number.isInteger(pair.translationIndex) ? pair.translationIndex : 0,
        imageAssetId: pair.image?.imageAssetId || undefined
      }))
    : []
}

export default function LessonFlowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [stages, setStages] = useState<LessonStage[]>([])
  const [activeStageIndex, setActiveStageIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isSavingFlow, setIsSavingFlow] = useState(false)
  const [savingRefs, setSavingRefs] = useState<SavingState>({})

  const [allExpressions, setAllExpressions] = useState<Expression[]>([])
  const [allWords, setAllWords] = useState<Word[]>([])
  const [allSentences, setAllSentences] = useState<Sentence[]>([])
  const [allProverbs, setAllProverbs] = useState<Proverb[]>([])
  const [allQuestions, setAllQuestions] = useState<ExerciseQuestion[]>([])

  const expressionMap = useMemo(() => new Map(allExpressions.map((item) => [item._id, item])), [allExpressions])
  const wordMap = useMemo(() => new Map(allWords.map((item) => [item._id, item])), [allWords])
  const sentenceMap = useMemo(() => new Map(allSentences.map((item) => [item._id, item])), [allSentences])
  const proverbMap = useMemo(() => new Map(allProverbs.map((item) => [item._id, item])), [allProverbs])
  const questionMap = useMemo(() => new Map(allQuestions.map((item) => [item._id, item])), [allQuestions])

  useEffect(() => {
    void loadData()
  }, [id])

  async function loadData() {
    try {
      const lessonData = await lessonService.getLesson(id)
      setLesson(lessonData)
      const incomingStages = Array.isArray(lessonData.stages) ? lessonData.stages : []
      setStages(
        incomingStages.length > 0
          ? incomingStages
          : [
              {
                id: "stage-1",
                title: "Stage 1",
                description: "",
                orderIndex: 0,
                blocks: []
              }
            ]
      )

      const [expressions, words, sentences, proverbs, questions] = await Promise.all([
        expressionService.listExpressions(id, undefined),
        wordService.listWords(id, undefined),
        sentenceService.listSentences(id, undefined),
        proverbService.listProverbs(id, undefined),
        questionService.listQuestions({ lessonId: id })
      ])
      setAllExpressions(expressions)
      setAllWords(words)
      setAllSentences(sentences)
      setAllProverbs(proverbs)
      setAllQuestions(questions)
    } catch {
      toast.error("Failed to load lesson flow data")
      router.push(`/lessons/${id}`)
    } finally {
      setIsLoading(false)
    }
  }

  function setSaving(key: string, value: boolean) {
    setSavingRefs((current) => ({ ...current, [key]: value }))
  }

  function getContentOptions(type: ContentType) {
    if (type === "word") return allWords
    if (type === "sentence") return allSentences
    return allExpressions
  }

  function getContentByType(type: ContentType, refId: string): EditableContent | null {
    if (!refId) return null
    if (type === "word") return wordMap.get(refId) || null
    if (type === "sentence") return sentenceMap.get(refId) || null
    return expressionMap.get(refId) || null
  }

  function updateStages(next: LessonStage[]) {
    setStages(next.map((stage, index) => ({ ...stage, orderIndex: index })))
  }

  function updateActiveStage(mutator: (stage: LessonStage) => LessonStage) {
    const active = stages[activeStageIndex]
    if (!active) return
    const next = [...stages]
    next[activeStageIndex] = mutator(active)
    updateStages(next)
  }

  const handleAddBlock = (type: LessonBlock["type"]) => {
    updateActiveStage((active) => {
      const blocks = Array.isArray(active.blocks) ? active.blocks : []
      if (type === "text") {
        return { ...active, blocks: [...blocks, { type: "text", content: "" }] }
      }
      if (type === "content") {
        return {
          ...active,
          blocks: [...blocks, { type: "content", contentType: "expression", refId: "", translationIndex: 0 }]
        }
      }
      return { ...active, blocks: [...blocks, { type, refId: "" }] }
    })
  }

  const handleStageTitleChange = (value: string) => {
    updateActiveStage((active) => ({ ...active, title: value }))
  }

  const handleAddStage = () => {
    const nextStage: LessonStage = {
      id: `stage-${Date.now()}`,
      title: `Stage ${stages.length + 1}`,
      description: "",
      orderIndex: stages.length,
      blocks: []
    }
    const next = [...stages, nextStage]
    updateStages(next)
    setActiveStageIndex(next.length - 1)
  }

  const handleRemoveStage = () => {
    if (stages.length <= 1) return
    const next = stages.filter((_, index) => index !== activeStageIndex)
    updateStages(next)
    setActiveStageIndex(Math.max(0, activeStageIndex - 1))
  }

  const handleRemoveBlock = (index: number) => {
    updateActiveStage((active) => ({
      ...active,
      blocks: (active.blocks || []).filter((_, blockIndex) => blockIndex !== index)
    }))
  }

  const handleMoveBlock = (index: number, direction: "up" | "down") => {
    updateActiveStage((active) => {
      const blocks = [...(active.blocks || [])]
      const newIndex = direction === "up" ? index - 1 : index + 1
      if (newIndex < 0 || newIndex >= blocks.length) return active
      const [moved] = blocks.splice(index, 1)
      blocks.splice(newIndex, 0, moved)
      return { ...active, blocks }
    })
  }

  const handleTextBlockChange = (index: number, value: string) => {
    updateActiveStage((active) => ({
      ...active,
      blocks: active.blocks.map((block, blockIndex) =>
        blockIndex === index && block.type === "text" ? { ...block, content: value } : block
      )
    }))
  }

  const handleBlockRefChange = (index: number, value: string) => {
    updateActiveStage((active) => ({
      ...active,
      blocks: active.blocks.map((block, blockIndex) => {
        if (blockIndex !== index || block.type === "text") return block
        if (block.type === "content") {
          return { ...block, refId: value, translationIndex: 0 }
        }
        return { ...block, refId: value }
      })
    }))
  }

  const handleContentTypeChange = (index: number, value: ContentType) => {
    updateActiveStage((active) => ({
      ...active,
      blocks: active.blocks.map((block, blockIndex) =>
        blockIndex === index && block.type === "content"
          ? { ...block, contentType: value, refId: "", translationIndex: 0 }
          : block
      )
    }))
  }

  const handleBlockTranslationIndexChange = (index: number, value: string) => {
    const translationIndex = Number(value)
    if (!Number.isInteger(translationIndex) || translationIndex < 0) return
    updateActiveStage((active) => ({
      ...active,
      blocks: active.blocks.map((block, blockIndex) =>
        blockIndex === index && block.type === "content"
          ? { ...block, translationIndex }
          : block
      )
    }))
  }

  function updateExpressionState(id: string, patch: Partial<Expression>) {
    setAllExpressions((current) => current.map((item) => (item._id === id ? { ...item, ...patch } : item)))
  }

  function updateWordState(id: string, patch: Partial<Word>) {
    setAllWords((current) => current.map((item) => (item._id === id ? { ...item, ...patch } : item)))
  }

  function updateSentenceState(id: string, patch: Partial<Sentence>) {
    setAllSentences((current) => current.map((item) => (item._id === id ? { ...item, ...patch } : item)))
  }

  function updateProverbState(id: string, patch: Partial<Proverb>) {
    setAllProverbs((current) => current.map((item) => (item._id === id ? { ...item, ...patch } : item)))
  }

  function updateQuestionState(id: string, patch: Partial<ExerciseQuestion>) {
    setAllQuestions((current) =>
      current.map((item) => {
        if (item._id !== id) return item
        const next = { ...item, ...patch }
        if (patch.interactionData?.matchingPairs) {
          next.interactionData = patch.interactionData
        }
        if (patch.reviewData) {
          next.reviewData = patch.reviewData
        }
        return next
      })
    )
  }

  async function saveContentItem(type: ContentType, refId: string) {
    const entity = getContentByType(type, refId)
    if (!entity) {
      toast.error("Select content before saving.")
      return
    }
    const savingKey = `${type}:${refId}`
    setSaving(savingKey, true)
    try {
      if (type === "word") {
        const saved = await wordService.updateWord(refId, {
          text: entity.text,
          translations: entity.translations,
          pronunciation: entity.pronunciation,
          explanation: entity.explanation,
          lemma: (entity as Word).lemma,
          partOfSpeech: (entity as Word).partOfSpeech
        })
        setAllWords((current) => current.map((item) => (item._id === refId ? saved : item)))
      } else if (type === "sentence") {
        const sentence = entity as Sentence
        const saved = await sentenceService.updateSentence(refId, {
          text: sentence.text,
          translations: sentence.translations,
          pronunciation: sentence.pronunciation,
          explanation: sentence.explanation,
          literalTranslation: sentence.literalTranslation,
          usageNotes: sentence.usageNotes,
          components: sentence.components
        })
        setAllSentences((current) => current.map((item) => (item._id === refId ? saved : item)))
      } else {
        const expression = entity as Expression
        const saved = await expressionService.updateExpression(refId, {
          text: expression.text,
          translations: expression.translations,
          pronunciation: expression.pronunciation,
          explanation: expression.explanation
        })
        setAllExpressions((current) => current.map((item) => (item._id === refId ? saved : item)))
      }
      toast.success("Linked content saved")
    } catch {
      toast.error("Failed to save linked content")
    } finally {
      setSaving(savingKey, false)
    }
  }

  async function saveProverb(refId: string) {
    const proverb = proverbMap.get(refId)
    if (!proverb) {
      toast.error("Select a proverb before saving.")
      return
    }
    const savingKey = `proverb:${refId}`
    setSaving(savingKey, true)
    try {
      const saved = await proverbService.updateProverb(refId, {
        text: proverb.text,
        translation: proverb.translation,
        contextNote: proverb.contextNote
      })
      setAllProverbs((current) => current.map((item) => (item._id === refId ? saved : item)))
      toast.success("Proverb saved")
    } catch {
      toast.error("Failed to save proverb")
    } finally {
      setSaving(savingKey, false)
    }
  }

  function updateQuestionOption(questionId: string, optionIndex: number, value: string) {
    setAllQuestions((current) =>
      current.map((question) => {
        if (question._id !== questionId) return question
        const options = [...(question.options || [])]
        options[optionIndex] = value
        return { ...question, options }
      })
    )
  }

  function addQuestionOption(questionId: string) {
    setAllQuestions((current) =>
      current.map((question) =>
        question._id === questionId ? { ...question, options: [...(question.options || []), ""] } : question
      )
    )
  }

  function removeQuestionOption(questionId: string, optionIndex: number) {
    setAllQuestions((current) =>
      current.map((question) => {
        if (question._id !== questionId) return question
        const nextOptions = (question.options || []).filter((_, index) => index !== optionIndex)
        const nextCorrectIndex = Math.min(question.correctIndex || 0, Math.max(0, nextOptions.length - 1))
        return { ...question, options: nextOptions, correctIndex: nextCorrectIndex }
      })
    )
  }

  function updateMatchingPairs(questionId: string, mutator: (pairs: MatchingEditablePair[]) => MatchingEditablePair[]) {
    setAllQuestions((current) =>
      current.map((question) => {
        if (question._id !== questionId) return question
        const pairs = matchingPairsFromQuestion(question)
        return {
          ...question,
          interactionData: {
            matchingPairs: mutator(pairs).map((pair) => ({
              pairId: pair.pairId,
              contentType: pair.contentType,
              contentId: pair.contentId,
              translationIndex: pair.translationIndex,
              translation: "",
              image: pair.imageAssetId ? { imageAssetId: pair.imageAssetId, url: "", altText: "" } : null
            }))
          }
        }
      })
    )
  }

  async function saveQuestion(questionId: string) {
    const question = questionMap.get(questionId)
    if (!question) {
      toast.error("Select a question before saving.")
      return
    }

    const savingKey = `question:${questionId}`
    setSaving(savingKey, true)
    try {
      const payload: Partial<ExerciseQuestion> = {
        promptTemplate: question.promptTemplate,
        explanation: question.explanation
      }

      if (isMatchingSubtype(question.subtype)) {
        const pairs = matchingPairsFromQuestion(question)
        if (pairs.length < 4) {
          toast.error("Matching questions need at least four pairs.")
          return
        }
        payload.interactionData = {
          matchingPairs: pairs.map((pair) => ({
            pairId: pair.pairId,
            contentType: pair.contentType,
            contentId: pair.contentId,
            translationIndex: pair.translationIndex,
            translation:
              getContentByType(pair.contentType, pair.contentId)?.translations?.[pair.translationIndex] || "",
            image:
              question.subtype === "mt-match-image"
                ? {
                    imageAssetId: pair.imageAssetId || "",
                    url: "",
                    altText:
                      getContentByType(pair.contentType, pair.contentId)?.translations?.[pair.translationIndex] || ""
                  }
                : null
          }))
        }
      } else {
        const sourceId = getQuestionSourceId(question)
        if (!sourceId) {
          toast.error("Select a source item for this question.")
          return
        }
        payload.sourceType = getQuestionSourceType(question)
        payload.sourceId = sourceId
        payload.translationIndex = Number.isInteger(question.translationIndex) ? question.translationIndex : 0
      }

      if (isChoiceSubtype(question.subtype)) {
        const options = (question.options || []).map((item) => item.trim()).filter(Boolean)
        if (options.length < 2) {
          toast.error("Choice questions need at least two options.")
          return
        }
        payload.options = options
        payload.correctIndex = Math.min(question.correctIndex || 0, options.length - 1)
      }

      if (isReviewSubtype(question.subtype) && !isOrderSubtype(question.subtype)) {
        const reviewData = question.reviewData || { sentence: "", words: [], correctOrder: [], meaning: "" }
        payload.reviewData = {
          sentence: String(reviewData.sentence || "").trim(),
          words: Array.isArray(reviewData.words) ? reviewData.words.map((item) => item.trim()).filter(Boolean) : [],
          correctOrder: Array.isArray(reviewData.correctOrder)
            ? reviewData.correctOrder.map((item) => Number(item)).filter((item) => !Number.isNaN(item))
            : [],
          meaning: String(reviewData.meaning || "").trim(),
          meaningSegments: reviewData.meaningSegments
        }
      }

      const saved = await questionService.updateQuestion(questionId, payload)
      setAllQuestions((current) => current.map((item) => (item._id === questionId ? saved : item)))
      toast.success("Question saved")
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Failed to save question")
    } finally {
      setSaving(savingKey, false)
    }
  }

  const handleSaveFlow = async () => {
    setIsSavingFlow(true)
    try {
      await lessonService.updateLesson(id, { stages })
      toast.success("Lesson flow saved successfully")
    } catch {
      toast.error("Failed to save lesson flow")
    } finally {
      setIsSavingFlow(false)
    }
  }

  if (isLoading) return <div className="p-8 text-center">Loading flow builder...</div>
  if (!lesson) return <div className="p-8 text-center">Lesson not found</div>

  const activeStage = stages[activeStageIndex]
  const blocks = Array.isArray(activeStage?.blocks) ? activeStage.blocks : []

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push(`/lessons/${id}`)}
            className="rounded-full hover:bg-secondary"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-foreground">Lesson Flow</h1>
            <p className="text-muted-foreground font-medium">Edit lesson blocks directly for {lesson.title}</p>
          </div>
        </div>
        <Button onClick={handleSaveFlow} disabled={isSavingFlow} className="h-11 rounded-xl px-6 font-bold shadow-lg shadow-primary/20">
          <Save className="mr-2 h-5 w-5" />
          {isSavingFlow ? "Saving..." : "Save Flow"}
        </Button>
      </div>

      <div className="grid gap-8 lg:grid-cols-4">
        <div className="lg:col-span-3 space-y-6">
          <Card className="border-2 border-primary/10 shadow-xl rounded-3xl overflow-hidden">
            <CardHeader className="bg-primary/5 pb-6 pt-6 flex flex-row items-center justify-between">
              <CardTitle className="text-xl font-bold text-primary flex items-center gap-2">
                <LayoutList className="h-5 w-5" />
                Flow Timeline
              </CardTitle>
              <div className="flex gap-1 items-center flex-wrap justify-end">
                <Select value={String(activeStageIndex)} onValueChange={(v) => setActiveStageIndex(Number(v))}>
                  <SelectTrigger className="h-9 w-[180px]">
                    <SelectValue placeholder="Choose stage" />
                  </SelectTrigger>
                  <SelectContent>
                    {stages.map((stage, index) => (
                      <SelectItem key={stage.id} value={String(index)}>
                        {stage.title || `Stage ${index + 1}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" className="text-xs font-bold" onClick={handleAddStage}>+ Stage</Button>
                <Button size="sm" variant="outline" className="text-xs font-bold" onClick={handleRemoveStage} disabled={stages.length <= 1}>- Stage</Button>
                <Button size="sm" variant="outline" className="text-xs font-bold" onClick={() => handleAddBlock("text")}>+ Text</Button>
                <Button size="sm" variant="outline" className="text-xs font-bold" onClick={() => handleAddBlock("content")}>+ Content</Button>
                <Button size="sm" variant="outline" className="text-xs font-bold" onClick={() => handleAddBlock("proverb")}>+ Proverb</Button>
                <Button size="sm" variant="outline" className="text-xs font-bold" onClick={() => handleAddBlock("question")}>+ Question</Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <Input
                value={activeStage?.title || ""}
                onChange={(e) => handleStageTitleChange(e.target.value)}
                placeholder="Stage title"
                className="border-2 rounded-xl focus-visible:ring-primary h-12"
              />

              {blocks.map((block, index) => {
                const question = block.type === "question" ? questionMap.get(block.refId) || null : null
                const proverb = block.type === "proverb" ? proverbMap.get(block.refId) || null : null
                const linkedContent = block.type === "content" ? getContentByType(block.contentType, block.refId) : null
                const questionSourceId = question ? getQuestionSourceId(question) : ""
                const questionSourceType = question ? getQuestionSourceType(question) : "expression"
                const questionSource = question && questionSourceId ? getContentByType(questionSourceType, questionSourceId) : null
                const questionMatchingPairs = question ? matchingPairsFromQuestion(question) : []

                return (
                  <div key={`${activeStage.id}-${index}`} className="flex gap-4 items-start p-4 border-2 rounded-2xl bg-muted/5 group relative transition-all hover:border-primary/30">
                    <div className="flex flex-col gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleMoveBlock(index, "up")} disabled={index === 0}>
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <div className="flex items-center justify-center h-7 w-7 font-black text-xs text-muted-foreground">{index + 1}</div>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleMoveBlock(index, "down")} disabled={index === blocks.length - 1}>
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="flex-1 space-y-3">
                      <div className="flex justify-between items-center">
                        <Badge variant="outline" className="uppercase font-bold text-[10px] tracking-widest">{block.type}</Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-red-600 hover:bg-red-50 rounded-full"
                          onClick={() => handleRemoveBlock(index)}
                        >
                          <Trash className="h-4 w-4" />
                        </Button>
                      </div>

                      {block.type === "text" && (
                        <Textarea
                          value={block.content}
                          onChange={(e) => handleTextBlockChange(index, e.target.value)}
                          placeholder="Type explanation, context or transition text here..."
                          className="border-2 rounded-xl focus-visible:ring-primary min-h-[120px]"
                        />
                      )}

                      {block.type === "content" && (
                        <div className="space-y-3">
                          <div className="grid gap-3 md:grid-cols-2">
                            <Select value={block.contentType} onValueChange={(value: ContentType) => handleContentTypeChange(index, value)}>
                              <SelectTrigger className="border-2 rounded-xl h-11">
                                <SelectValue placeholder="Content type" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="word">Word</SelectItem>
                                <SelectItem value="expression">Expression</SelectItem>
                                <SelectItem value="sentence">Sentence</SelectItem>
                              </SelectContent>
                            </Select>
                            <Select value={block.refId} onValueChange={(value) => handleBlockRefChange(index, value)}>
                              <SelectTrigger className="border-2 rounded-xl h-11">
                                <SelectValue placeholder={`Select a ${block.contentType} from this lesson...`} />
                              </SelectTrigger>
                              <SelectContent>
                                {getContentOptions(block.contentType).map((item) => (
                                  <SelectItem key={item._id} value={item._id}>
                                    {item.text} — {item.translations.join(" | ")}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {block.refId && (
                            <Select value={String(block.translationIndex ?? 0)} onValueChange={(value) => handleBlockTranslationIndexChange(index, value)}>
                              <SelectTrigger className="border-2 rounded-xl h-11">
                                <SelectValue placeholder="Select translation index" />
                              </SelectTrigger>
                              <SelectContent>
                                {(linkedContent?.translations || []).map((item, translationIndex) => (
                                  <SelectItem key={`${block.refId}-${translationIndex}`} value={String(translationIndex)}>
                                    Index {translationIndex}: {item}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}

                          {linkedContent && (
                            <div className="rounded-2xl border bg-background p-4 space-y-3">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-semibold">Edit linked {block.contentType}</p>
                                  <p className="text-xs text-muted-foreground">Changes save to the referenced content record.</p>
                                </div>
                                <Button
                                  size="sm"
                                  onClick={() => saveContentItem(block.contentType, linkedContent._id)}
                                  disabled={Boolean(savingRefs[`${block.contentType}:${linkedContent._id}`])}
                                >
                                  <Save className="mr-2 h-4 w-4" />
                                  {savingRefs[`${block.contentType}:${linkedContent._id}`] ? "Saving..." : "Save Linked Content"}
                                </Button>
                              </div>
                              <div className="grid gap-3 md:grid-cols-2">
                                <Input
                                  value={linkedContent.text}
                                  onChange={(e) => {
                                    const patch = { text: e.target.value }
                                    if (block.contentType === "word") updateWordState(linkedContent._id, patch)
                                    else if (block.contentType === "sentence") updateSentenceState(linkedContent._id, patch)
                                    else updateExpressionState(linkedContent._id, patch)
                                  }}
                                  placeholder="Text"
                                />
                                <Input
                                  value={toCsv(linkedContent.translations)}
                                  onChange={(e) => {
                                    const patch = { translations: fromCsv(e.target.value) }
                                    if (block.contentType === "word") updateWordState(linkedContent._id, patch)
                                    else if (block.contentType === "sentence") updateSentenceState(linkedContent._id, patch)
                                    else updateExpressionState(linkedContent._id, patch)
                                  }}
                                  placeholder="Translations, comma separated"
                                />
                              </div>
                              <div className="grid gap-3 md:grid-cols-2">
                                <Input
                                  value={linkedContent.pronunciation || ""}
                                  onChange={(e) => {
                                    const patch = { pronunciation: e.target.value }
                                    if (block.contentType === "word") updateWordState(linkedContent._id, patch)
                                    else if (block.contentType === "sentence") updateSentenceState(linkedContent._id, patch)
                                    else updateExpressionState(linkedContent._id, patch)
                                  }}
                                  placeholder="Pronunciation"
                                />
                                {block.contentType === "word" ? (
                                  <Input
                                    value={(linkedContent as Word).partOfSpeech || ""}
                                    onChange={(e) => updateWordState(linkedContent._id, { partOfSpeech: e.target.value })}
                                    placeholder="Part of speech"
                                  />
                                ) : block.contentType === "sentence" ? (
                                  <Input
                                    value={(linkedContent as Sentence).literalTranslation || ""}
                                    onChange={(e) => updateSentenceState(linkedContent._id, { literalTranslation: e.target.value })}
                                    placeholder="Literal translation"
                                  />
                                ) : (
                                  <div />
                                )}
                              </div>
                              {block.contentType === "word" && (
                                <Input
                                  value={(linkedContent as Word).lemma || ""}
                                  onChange={(e) => updateWordState(linkedContent._id, { lemma: e.target.value })}
                                  placeholder="Lemma"
                                />
                              )}
                              {block.contentType === "sentence" && (
                                <Input
                                  value={(linkedContent as Sentence).usageNotes || ""}
                                  onChange={(e) => updateSentenceState(linkedContent._id, { usageNotes: e.target.value })}
                                  placeholder="Usage notes"
                                />
                              )}
                              <Textarea
                                value={linkedContent.explanation || ""}
                                onChange={(e) => {
                                  const patch = { explanation: e.target.value }
                                  if (block.contentType === "word") updateWordState(linkedContent._id, patch)
                                  else if (block.contentType === "sentence") updateSentenceState(linkedContent._id, patch)
                                  else updateExpressionState(linkedContent._id, patch)
                                }}
                                placeholder="Explanation"
                                className="min-h-[88px]"
                              />
                            </div>
                          )}
                        </div>
                      )}

                      {block.type === "proverb" && (
                        <div className="space-y-3">
                          <Select value={block.refId} onValueChange={(value) => handleBlockRefChange(index, value)}>
                            <SelectTrigger className="border-2 rounded-xl h-11">
                              <SelectValue placeholder="Select a proverb from this lesson..." />
                            </SelectTrigger>
                            <SelectContent>
                              {allProverbs.map((item) => (
                                <SelectItem key={item._id} value={item._id}>
                                  {item.text}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          {proverb && (
                            <div className="rounded-2xl border bg-background p-4 space-y-3">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-semibold">Edit linked proverb</p>
                                  <p className="text-xs text-muted-foreground">Changes save to the proverb record.</p>
                                </div>
                                <Button size="sm" onClick={() => saveProverb(proverb._id)} disabled={Boolean(savingRefs[`proverb:${proverb._id}`])}>
                                  <Save className="mr-2 h-4 w-4" />
                                  {savingRefs[`proverb:${proverb._id}`] ? "Saving..." : "Save Proverb"}
                                </Button>
                              </div>
                              <Input value={proverb.text} onChange={(e) => updateProverbState(proverb._id, { text: e.target.value })} placeholder="Proverb text" />
                              <Input value={proverb.translation} onChange={(e) => updateProverbState(proverb._id, { translation: e.target.value })} placeholder="Translation" />
                              <Textarea value={proverb.contextNote} onChange={(e) => updateProverbState(proverb._id, { contextNote: e.target.value })} placeholder="Context note" className="min-h-[88px]" />
                            </div>
                          )}
                        </div>
                      )}

                      {block.type === "question" && (
                        <div className="space-y-3">
                          <Select value={block.refId} onValueChange={(value) => handleBlockRefChange(index, value)}>
                            <SelectTrigger className="border-2 rounded-xl h-11">
                              <SelectValue placeholder="Select a question from this lesson..." />
                            </SelectTrigger>
                            <SelectContent>
                              {allQuestions.map((item) => (
                                <SelectItem key={item._id} value={item._id}>
                                  {item.promptTemplate} ({item.subtype})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          {question && (
                            <div className="rounded-2xl border bg-background p-4 space-y-3">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold">Edit linked question</p>
                                  <div className="flex gap-2 mt-1 flex-wrap">
                                    <Badge variant="secondary">{question.type}</Badge>
                                    <Badge variant="outline">{question.subtype}</Badge>
                                  </div>
                                </div>
                                <Button size="sm" onClick={() => saveQuestion(question._id)} disabled={Boolean(savingRefs[`question:${question._id}`])}>
                                  <Save className="mr-2 h-4 w-4" />
                                  {savingRefs[`question:${question._id}`] ? "Saving..." : "Save Question"}
                                </Button>
                              </div>

                              <Textarea
                                value={question.promptTemplate}
                                onChange={(e) => updateQuestionState(question._id, { promptTemplate: e.target.value })}
                                placeholder="Prompt template"
                                className="min-h-[88px]"
                              />
                              <Textarea
                                value={question.explanation || ""}
                                onChange={(e) => updateQuestionState(question._id, { explanation: e.target.value })}
                                placeholder="Explanation"
                                className="min-h-[88px]"
                              />

                              {!isMatchingSubtype(question.subtype) && (
                                <>
                                  <div className="grid gap-3 md:grid-cols-3">
                                    <Select value={questionSourceType} onValueChange={(value: ContentType) => updateQuestionState(question._id, { sourceType: value, sourceId: "", translationIndex: 0 })}>
                                      <SelectTrigger className="h-11">
                                        <SelectValue placeholder="Source type" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="word">Word</SelectItem>
                                        <SelectItem value="expression">Expression</SelectItem>
                                        <SelectItem value="sentence">Sentence</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <Select value={questionSourceId} onValueChange={(value) => updateQuestionState(question._id, { sourceId: value, source: undefined, translationIndex: 0 })}>
                                      <SelectTrigger className="h-11 md:col-span-2">
                                        <SelectValue placeholder="Select source content" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {getContentOptions(questionSourceType).map((item) => (
                                          <SelectItem key={item._id} value={item._id}>
                                            {item.text} — {item.translations.join(" | ")}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>

                                  {questionSource && (
                                    <Select value={String(question.translationIndex ?? 0)} onValueChange={(value) => updateQuestionState(question._id, { translationIndex: Number(value) })}>
                                      <SelectTrigger className="h-11">
                                        <SelectValue placeholder="Select translation index" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {questionSource.translations.map((item, translationIndex) => (
                                          <SelectItem key={`${question._id}-translation-${translationIndex}`} value={String(translationIndex)}>
                                            Index {translationIndex}: {item}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  )}
                                </>
                              )}

                              {isChoiceSubtype(question.subtype) && (
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between">
                                    <p className="text-sm font-semibold">Options</p>
                                    <Button size="sm" variant="outline" onClick={() => addQuestionOption(question._id)}>
                                      <Plus className="mr-2 h-4 w-4" />
                                      Add Option
                                    </Button>
                                  </div>
                                  {(question.options || []).map((option, optionIndex) => (
                                    <div key={`${question._id}-option-${optionIndex}`} className="flex gap-2 items-center">
                                      <Input value={option} onChange={(e) => updateQuestionOption(question._id, optionIndex, e.target.value)} placeholder={`Option ${optionIndex + 1}`} />
                                      <Button variant="ghost" size="icon" onClick={() => removeQuestionOption(question._id, optionIndex)} disabled={(question.options || []).length <= 2}>
                                        <Trash className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  ))}
                                  <Select value={String(question.correctIndex || 0)} onValueChange={(value) => updateQuestionState(question._id, { correctIndex: Number(value) })}>
                                    <SelectTrigger className="h-11">
                                      <SelectValue placeholder="Correct option" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {(question.options || []).map((option, optionIndex) => (
                                        <SelectItem key={`${question._id}-correct-${optionIndex}`} value={String(optionIndex)}>
                                          Option {optionIndex + 1}: {option || "(empty)"}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}

                              {isReviewSubtype(question.subtype) && !isOrderSubtype(question.subtype) && (
                                <div className="space-y-3">
                                  <p className="text-sm font-semibold">Review data</p>
                                  <Textarea
                                    value={question.reviewData?.sentence || ""}
                                    onChange={(e) => updateQuestionState(question._id, {
                                      reviewData: {
                                        sentence: e.target.value,
                                        words: question.reviewData?.words || [],
                                        correctOrder: question.reviewData?.correctOrder || [],
                                        meaning: question.reviewData?.meaning || "",
                                        meaningSegments: question.reviewData?.meaningSegments
                                      }
                                    })}
                                    placeholder="Sentence"
                                    className="min-h-[88px]"
                                  />
                                  <Input
                                    value={toCsv(question.reviewData?.words)}
                                    onChange={(e) => updateQuestionState(question._id, {
                                      reviewData: {
                                        sentence: question.reviewData?.sentence || "",
                                        words: fromCsv(e.target.value),
                                        correctOrder: question.reviewData?.correctOrder || [],
                                        meaning: question.reviewData?.meaning || "",
                                        meaningSegments: question.reviewData?.meaningSegments
                                      }
                                    })}
                                    placeholder="Words, comma separated"
                                  />
                                  <Input
                                    value={toCsv((question.reviewData?.correctOrder || []).map(String))}
                                    onChange={(e) => updateQuestionState(question._id, {
                                      reviewData: {
                                        sentence: question.reviewData?.sentence || "",
                                        words: question.reviewData?.words || [],
                                        correctOrder: fromCsv(e.target.value).map((item) => Number(item)).filter((item) => !Number.isNaN(item)),
                                        meaning: question.reviewData?.meaning || "",
                                        meaningSegments: question.reviewData?.meaningSegments
                                      }
                                    })}
                                    placeholder="Correct order indexes, comma separated"
                                  />
                                  <Input
                                    value={question.reviewData?.meaning || ""}
                                    onChange={(e) => updateQuestionState(question._id, {
                                      reviewData: {
                                        sentence: question.reviewData?.sentence || "",
                                        words: question.reviewData?.words || [],
                                        correctOrder: question.reviewData?.correctOrder || [],
                                        meaning: e.target.value,
                                        meaningSegments: question.reviewData?.meaningSegments
                                      }
                                    })}
                                    placeholder="Meaning"
                                  />
                                </div>
                              )}

                              {isMatchingSubtype(question.subtype) && (
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between">
                                    <p className="text-sm font-semibold">Matching pairs</p>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() =>
                                        updateMatchingPairs(question._id, (pairs) => [
                                          ...pairs,
                                          {
                                            pairId: `pair-${Date.now()}`,
                                            contentType: "word",
                                            contentId: "",
                                            translationIndex: 0
                                          }
                                        ])
                                      }
                                    >
                                      <Plus className="mr-2 h-4 w-4" />
                                      Add Pair
                                    </Button>
                                  </div>
                                  {questionMatchingPairs.map((pair, pairIndex) => {
                                    const pairContent = getContentByType(pair.contentType, pair.contentId)
                                    return (
                                      <div key={pair.pairId} className="grid gap-2 md:grid-cols-[140px_1fr_220px_auto] items-center rounded-xl border p-3">
                                        <Select
                                          value={pair.contentType}
                                          onValueChange={(value: "word" | "expression") =>
                                            updateMatchingPairs(question._id, (pairs) =>
                                              pairs.map((item, index) =>
                                                index === pairIndex ? { ...item, contentType: value, contentId: "", translationIndex: 0 } : item
                                              )
                                            )
                                          }
                                        >
                                          <SelectTrigger className="h-10">
                                            <SelectValue placeholder="Type" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="word">Word</SelectItem>
                                            <SelectItem value="expression">Expression</SelectItem>
                                          </SelectContent>
                                        </Select>
                                        <Select
                                          value={pair.contentId}
                                          onValueChange={(value) =>
                                            updateMatchingPairs(question._id, (pairs) =>
                                              pairs.map((item, index) =>
                                                index === pairIndex ? { ...item, contentId: value, translationIndex: 0 } : item
                                              )
                                            )
                                          }
                                        >
                                          <SelectTrigger className="h-10">
                                            <SelectValue placeholder="Select content" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {getContentOptions(pair.contentType).map((item) => (
                                              <SelectItem key={item._id} value={item._id}>
                                                {item.text} — {item.translations.join(" | ")}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                        <Select
                                          value={String(pair.translationIndex)}
                                          onValueChange={(value) =>
                                            updateMatchingPairs(question._id, (pairs) =>
                                              pairs.map((item, index) =>
                                                index === pairIndex ? { ...item, translationIndex: Number(value) } : item
                                              )
                                            )
                                          }
                                        >
                                          <SelectTrigger className="h-10">
                                            <SelectValue placeholder="Translation" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {(pairContent?.translations || []).map((translation, translationIndex) => (
                                              <SelectItem key={`${pair.pairId}-${translationIndex}`} value={String(translationIndex)}>
                                                Index {translationIndex}: {translation}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => updateMatchingPairs(question._id, (pairs) => pairs.filter((_, index) => index !== pairIndex))}
                                          disabled={questionMatchingPairs.length <= 4}
                                        >
                                          <Trash className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    )
                                  })}
                                  {questionMatchingPairs.length === 0 && (
                                    <p className="text-sm text-muted-foreground">No matching pairs configured yet.</p>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}

              {blocks.length === 0 && (
                <div className="text-center py-20 border-2 border-dashed rounded-3xl text-muted-foreground bg-muted/5">
                  <LayoutList className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p className="font-medium text-lg">Your lesson flow is empty.</p>
                  <p className="text-sm">Click the buttons above to start building the learning experience.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-1 space-y-6">
          <Card className="border-2 border-accent/20 shadow-lg rounded-3xl overflow-hidden bg-accent/5">
            <CardHeader>
              <CardTitle className="text-lg font-bold">Editor Notes</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-4 text-muted-foreground leading-relaxed">
              <p><strong className="text-foreground">Flow save:</strong> saves stage titles, block order, block refs, and translation indexes.</p>
              <p><strong className="text-foreground">Inline save:</strong> each linked question/content card saves the referenced record directly.</p>
              <p><strong className="text-foreground">Block order:</strong> hydration is only for editing; learner sequence still comes from the lesson blocks you reorder here.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
