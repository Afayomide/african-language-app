'use client'

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import { lessonService, phraseService, proverbService, questionService } from "@/services"
import { Lesson, LessonBlock, LessonStage, Phrase, Proverb, ExerciseQuestion } from "@/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { ArrowLeft, Save, Trash, Plus, ArrowUp, ArrowDown, LayoutList } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export default function LessonFlowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [stages, setStages] = useState<LessonStage[]>([])
  const [activeStageIndex, setActiveStageIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const [allPhrases, setAllPhrases] = useState<Phrase[]>([])
  const [allProverbs, setAllProverbs] = useState<Proverb[]>([])
  const [allQuestions, setAllQuestions] = useState<ExerciseQuestion[]>([])

  useEffect(() => {
    void loadData()
  }, [id])

  async function loadData() {
    try {
      const lessonData = await lessonService.getLesson(id)
      setLesson(lessonData)
      const incomingStages = Array.isArray(lessonData.stages) ? lessonData.stages : []
      setStages(incomingStages.length > 0 ? incomingStages : [{
        id: "stage-1",
        title: "Stage 1",
        description: "",
        orderIndex: 0,
        blocks: []
      }])

      const [p, prv, q] = await Promise.all([
        phraseService.listPhrases(id, undefined),
        proverbService.listProverbs(id, undefined),
        questionService.listQuestions({ lessonId: id })
      ])
      setAllPhrases(p)
      setAllProverbs(prv)
      setAllQuestions(q)
    } catch (error) {
      toast.error("Failed to load lesson flow data")
      router.push(`/lessons/${id}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddBlock = (type: LessonBlock["type"]) => {
    const active = stages[activeStageIndex]
    if (!active) return
    const blocks = Array.isArray(active.blocks) ? active.blocks : []
    if (type === "text") {
      const next = [...stages]
      next[activeStageIndex] = { ...active, blocks: [...blocks, { type: "text", content: "" }] }
      setStages(next)
      return
    }

    const next = [...stages]
    next[activeStageIndex] = { ...active, blocks: [...blocks, { type, refId: "" }] }
    setStages(next)
  }

  const handleBlockChange = (index: number, value: string) => {
    const active = stages[activeStageIndex]
    if (!active) return
    const blocks = Array.isArray(active.blocks) ? [...active.blocks] : []
    const block = blocks[index]
    if (!block) return
    if (block.type === "text") {
      blocks[index] = { ...block, content: value }
    } else {
      blocks[index] = { ...block, refId: value }
    }
    const next = [...stages]
    next[activeStageIndex] = { ...active, blocks }
    setStages(next)
  }

  const handleStageTitleChange = (value: string) => {
    const active = stages[activeStageIndex]
    if (!active) return
    const next = [...stages]
    next[activeStageIndex] = { ...active, title: value }
    setStages(next)
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
    setStages(next)
    setActiveStageIndex(next.length - 1)
  }

  const handleRemoveStage = () => {
    if (stages.length <= 1) return
    const next = stages.filter((_, index) => index !== activeStageIndex).map((stage, index) => ({ ...stage, orderIndex: index }))
    setStages(next)
    setActiveStageIndex(Math.max(0, activeStageIndex - 1))
  }

  const handleBlockTranslationIndexChange = (index: number, value: string) => {
    const active = stages[activeStageIndex]
    if (!active) return
    const nextIndex = Number(value)
    if (!Number.isInteger(nextIndex) || nextIndex < 0) return
    const blocks = Array.isArray(active.blocks) ? [...active.blocks] : []
    const block = blocks[index]
    if (!block || block.type !== "phrase") return
    blocks[index] = {
      ...block,
      translationIndex: nextIndex
    }
    const next = [...stages]
    next[activeStageIndex] = { ...active, blocks }
    setStages(next)
  }

  const handleRemoveBlock = (index: number) => {
    const active = stages[activeStageIndex]
    if (!active) return
    const blocks = (active.blocks || []).filter((_, i) => i !== index)
    const next = [...stages]
    next[activeStageIndex] = { ...active, blocks }
    setStages(next)
  }

  const handleMoveBlock = (index: number, direction: "up" | "down") => {
    const active = stages[activeStageIndex]
    if (!active) return
    const blocks = [...(active.blocks || [])]
    const newIndex = direction === "up" ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= blocks.length) return
    const [moved] = blocks.splice(index, 1)
    blocks.splice(newIndex, 0, moved)
    const next = [...stages]
    next[activeStageIndex] = { ...active, blocks }
    setStages(next)
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await lessonService.updateLesson(id, { stages })
      toast.success("Lesson flow saved successfully")
    } catch (error) {
      toast.error("Failed to save lesson flow")
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) return <div className="p-8 text-center">Loading flow builder...</div>
  if (!lesson) return <div className="p-8 text-center">Lesson not found</div>
  const activeStage = stages[activeStageIndex]
  const blocks = Array.isArray(activeStage?.blocks) ? activeStage.blocks : []

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
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
            <p className="text-muted-foreground font-medium">Arrange the content sequence for {lesson.title}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={handleSave} 
            disabled={isSaving}
            className="h-11 rounded-xl px-6 font-bold shadow-lg shadow-primary/20"
          >
            <Save className="mr-2 h-5 w-5" />
            {isSaving ? "Saving..." : "Save Flow"}
          </Button>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-4">
        <div className="lg:col-span-3 space-y-6">
          <Card className="border-2 border-primary/10 shadow-xl rounded-3xl overflow-hidden">
            <CardHeader className="bg-primary/5 pb-6 pt-6 flex flex-row items-center justify-between">
              <CardTitle className="text-xl font-bold text-primary flex items-center gap-2">
                <LayoutList className="h-5 w-5" />
                Flow Timeline
              </CardTitle>
              <div className="flex gap-1 items-center">
                <Select value={String(activeStageIndex)} onValueChange={(v) => setActiveStageIndex(Number(v))}>
                  <SelectTrigger className="h-9 w-[160px]">
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
                <Button size="sm" variant="outline" className="text-xs font-bold" onClick={() => handleAddBlock("phrase")}>+ Phrase</Button>
                <Button size="sm" variant="outline" className="text-xs font-bold" onClick={() => handleAddBlock("proverb")}>+ Proverb</Button>
                <Button size="sm" variant="outline" className="text-xs font-bold" onClick={() => handleAddBlock("question")}>+ Question</Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <Textarea
                value={activeStage?.title || ""}
                onChange={(e) => handleStageTitleChange(e.target.value)}
                placeholder="Stage title"
                className="border-2 rounded-xl focus-visible:ring-primary min-h-[56px]"
              />
              {blocks.map((block, index) => (
                <div key={index} className="flex gap-4 items-start p-4 border-2 rounded-2xl bg-muted/5 group relative transition-all hover:border-primary/30">
                  <div className="flex flex-col gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleMoveBlock(index, "up")} disabled={index === 0}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <div className="flex items-center justify-center h-7 w-7 font-black text-xs text-muted-foreground">
                      {index + 1}
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleMoveBlock(index, "down")} disabled={index === blocks.length - 1}>
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="flex-1 space-y-2">
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

                    {block.type === "text" ? (
                      <Textarea 
                        value={block.content} 
                        onChange={(e) => handleBlockChange(index, e.target.value)}
                        placeholder="Type explanation, context or transition text here..."
                        className="border-2 rounded-xl focus-visible:ring-primary min-h-[100px]"
                      />
                    ) : (
                      <Select value={block.refId} onValueChange={(v) => handleBlockChange(index, v)}>
                        <SelectTrigger className="border-2 rounded-xl h-12">
                          <SelectValue placeholder={`Select a ${block.type} from this lesson...`} />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          {block.type === "phrase" && allPhrases.map(p => (
                            <SelectItem key={p._id} value={p._id}>
                              {p.text} — {p.translations.join(" | ")}
                            </SelectItem>
                          ))}
                          {block.type === "proverb" && allProverbs.map(p => (
                            <SelectItem key={p._id} value={p._id}>{p.text}</SelectItem>
                          ))}
                          {block.type === "question" && allQuestions.map(q => (
                            <SelectItem key={q._id} value={q._id}>
                              {q.promptTemplate} ({q.type === "listening" ? "listening" : q.type.replaceAll("-", " ")})
                            </SelectItem>
                          ))}
                          {((block.type === "phrase" && allPhrases.length === 0) ||
                            (block.type === "proverb" && allProverbs.length === 0) ||
                            (block.type === "question" && allQuestions.length === 0)) && (
                            <SelectItem value="none" disabled>No {block.type}s found for this lesson</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    )}

                    {block.type === "phrase" && block.refId && (
                      <Select
                        value={String(block.translationIndex ?? 0)}
                        onValueChange={(v) => handleBlockTranslationIndexChange(index, v)}
                      >
                        <SelectTrigger className="border-2 rounded-xl h-11">
                          <SelectValue placeholder="Select translation index" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          {(allPhrases.find((p) => p._id === block.refId)?.translations || []).map((item, translationIndex) => (
                            <SelectItem key={`${block.refId}-${translationIndex}`} value={String(translationIndex)}>
                              Index {translationIndex}: {item}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              ))}
              
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
              <CardTitle className="text-lg font-bold">Quick Tips</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-4 text-muted-foreground leading-relaxed">
              <p>
                <strong className="text-foreground">Interleave Learning:</strong> Show a phrase, then follow it immediately with a question testing that phrase.
              </p>
              <p>
                <strong className="text-foreground">Add Context:</strong> Use Text blocks to explain cultural nuances or grammar rules before introducing new vocabulary.
              </p>
              <p>
                <strong className="text-foreground">Flow:</strong> The learner will experience these blocks one by one in the order you set here.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
