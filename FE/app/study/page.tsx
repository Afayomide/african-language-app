'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ArrowRight, Check, Info, Mic, Quote, Turtle, Volume2, X } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { learnerLessonService } from '@/services'
import { ExerciseQuestion, Lesson, PopulatedLessonBlock, QuestionMatchingDisplayItem } from '@/types'
import { cn } from '@/lib/utils'
import { getCulturalSoundPath } from '@/lib/culturalSounds'

type StageSlice = {
  index: number
  title: string
  description?: string
  blockCount: number
  start: number
  end: number
  blocks: PopulatedLessonBlock[]
}

const SOUNDS = {
  correct: '/sounds/correct.wav',
  incorrect: '/sounds/incorrect.wav',
  click: '/sounds/click.wav',
  stageStart: '/sounds/stage-start.wav',
  stageComplete: '/sounds/stage-complete.wav',
  continue: '/sounds/continue.wav',
}

const XP_PER_BLOCK = 10

function getListeningHeading(subtype?: ExerciseQuestion['subtype']) {
  switch (subtype) {
    case 'ls-mc-select-missing-word':
      return 'Listen and choose the missing word'
    case 'ls-mc-select-translation':
      return 'Listen and choose the correct meaning'
    case 'ls-fg-gap-fill':
      return 'Listen and fill in the blank'
    case 'ls-fg-word-order':
      return 'Listen and arrange the words'
    case 'ls-dictation':
      return 'Listen and type what you hear'
    case 'ls-tone-recognition':
      return 'Listen and identify the correct tone pattern'
    default:
      return 'Listen carefully and answer'
  }
}

function getListeningSupportText(subtype?: ExerciseQuestion['subtype']) {
  switch (subtype) {
    case 'ls-mc-select-missing-word':
      return 'Play the audio and choose the word missing from the sentence.'
    case 'ls-mc-select-translation':
      return 'Play the audio and pick the correct English meaning.'
    case 'ls-fg-gap-fill':
      return 'Play the audio and choose the best word to complete the blank.'
    case 'ls-fg-word-order':
      return 'Play the audio and arrange the words in the correct order.'
    default:
      return 'Tap play and answer based on what you hear.'
  }
}

function StudyPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const lessonId = searchParams.get('lessonId')

  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [blocks, setBlocks] = useState<PopulatedLessonBlock[]>([])
  const [currentStageIndex, setCurrentStageIndex] = useState(0)
  const [currentStageBlockIndex, setCurrentStageBlockIndex] = useState(0)
  const [isRetryMode, setIsRetryMode] = useState(false)
  const [retryRound, setRetryRound] = useState(0)
  const [retryQueue, setRetryQueue] = useState<number[]>([])
  const [nextRetryQueue, setNextRetryQueue] = useState<number[]>([])
  const [retryPosition, setRetryPosition] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isStageIntro, setIsStageIntro] = useState(true)
  const [isStageComplete, setIsStageComplete] = useState(false)
  const [selectedOption, setSelectedAnswer] = useState<number | null>(null)
  const [selectedWords, setSelectedWords] = useState<number[]>([])
  const [selectedMatchingLeftId, setSelectedMatchingLeftId] = useState<string | null>(null)
  const [selectedMatches, setSelectedMatches] = useState<Record<string, string>>({})
  const [isAnswered, setIsAnswered] = useState(false)
  const [isCorrect, setIsCorrect] = useState(false)
  const [xpEarned, setXpEarned] = useState(0)
  const [mistakesCount, setMistakesCount] = useState(0)
  const [stageMistakesCount, setStageMistakesCount] = useState(0)
  const [isListening, setIsListening] = useState(false)
  const [isPlayingPrompt, setIsPlayingPrompt] = useState(false)
  const [isSavingStage, setIsSavingStage] = useState(false)
  const [stageStartedAt, setStageStartedAt] = useState<number | null>(null)

  useEffect(() => {
    if (!lessonId) {
      router.push('/dashboard')
      return
    }

    setIsLoading(true)
    learnerLessonService
      .getLessonFlow(lessonId)
      .then((data) => {
        setLesson({
          ...data.lesson,
          currentStageIndex: data.progress?.currentStageIndex ?? data.lesson?.currentStageIndex ?? 0,
          stageProgress: data.progress?.stageProgress ?? data.lesson?.stageProgress ?? [],
          progressPercent: data.progress?.progressPercent ?? data.lesson?.progressPercent ?? 0,
        })
        setBlocks(data.blocks || [])
        setCurrentStageIndex(data.progress?.status === 'completed' ? 0 : (data.progress?.currentStageIndex ?? data.lesson?.currentStageIndex ?? 0))
        setCurrentStageBlockIndex(0)
        setIsRetryMode(false)
        setRetryRound(0)
        setRetryQueue([])
        setNextRetryQueue([])
        setRetryPosition(0)
        setIsStageIntro(true)
        setIsStageComplete(false)
        setStageStartedAt(null)
      })
      .catch((err) => {
        console.error('Failed to load lesson flow', err)
        router.push('/dashboard')
      })
      .finally(() => setIsLoading(false))
  }, [lessonId, router])

  useEffect(() => {
    Object.values(SOUNDS).forEach((src) => {
      const audio = new Audio(src)
      audio.preload = 'auto'
      audio.load()
    })
  }, [])

  useEffect(() => {
    if (!lesson?.language) return
    ;(['celebration', 'proverb'] as const).forEach((cue) => {
      const audio = new Audio(getCulturalSoundPath(lesson.language, cue))
      audio.preload = 'auto'
      audio.load()
    })
  }, [lesson?.language])

  const stageMeta = useMemo<StageSlice[]>(() => {
    const stages = Array.isArray(lesson?.stages) ? lesson.stages : []
    let cursor = 0

    return stages.map((stage, index) => {
      const blockCount = Array.isArray(stage.blocks) ? stage.blocks.length : 0
      const start = cursor
      const end = blockCount > 0 ? cursor + blockCount - 1 : cursor - 1
      const slice = blockCount > 0 ? blocks.slice(start, start + blockCount) : []
      cursor += blockCount
      return {
        index,
        title: stage.title || `Stage ${index + 1}`,
        description: stage.description || '',
        blockCount,
        start,
        end,
        blocks: slice,
      }
    })
  }, [blocks, lesson?.stages])

  const currentStage = stageMeta[currentStageIndex] || null
  const currentStageBlocks = currentStage?.blocks || []
  const activeStageBlockIndex = isRetryMode ? retryQueue[retryPosition] ?? 0 : currentStageBlockIndex
  const currentBlock = currentStageBlocks[activeStageBlockIndex]
  const completedStageBlockCount = currentStage
    ? Math.min(currentStage.blockCount, isStageComplete ? currentStage.blockCount : activeStageBlockIndex)
    : 0
  const progress = currentStage && currentStage.blockCount > 0
    ? Math.min(100, Math.round((completedStageBlockCount / currentStage.blockCount) * 100))
    : 0
  const isExerciseBlock = currentBlock?.type === 'question'
  const exerciseData: ExerciseQuestion | null = isExerciseBlock ? currentBlock.data : null
  const isListeningQuestion = Boolean(isExerciseBlock && exerciseData?.type === 'listening')
  const isMatchingQuestion = Boolean(isExerciseBlock && exerciseData?.type === 'matching')
  const isWordOrderQuestion = Boolean(
    exerciseData?.subtype === 'fg-word-order' || exerciseData?.subtype === 'ls-fg-word-order'
  )
  const isChoiceQuestion = Boolean(
    exerciseData &&
      !isWordOrderQuestion &&
      (
        exerciseData.type === 'multiple-choice' ||
        exerciseData.type === 'listening' ||
        exerciseData.subtype === 'fg-gap-fill' ||
        exerciseData.subtype === 'ls-fg-gap-fill'
      )
  )
  const matchingLeftItems: QuestionMatchingDisplayItem[] = exerciseData?.interactionData?.leftItems || []
  const matchingRightItems: QuestionMatchingDisplayItem[] = exerciseData?.interactionData?.rightItems || []
  const matchingPairs = exerciseData?.interactionData?.matchingPairs || []
  const questionPhrase = exerciseData
    ? (typeof exerciseData.phraseId === 'string' ? exerciseData.phrase || null : exerciseData.phraseId)
    : null
  const phraseText = questionPhrase?.text || ''
  const promptText = exerciseData?.promptTemplate || exerciseData?.prompt || 'Choose the right answer'
  const meaningText =
    exerciseData?.reviewData?.meaning ||
    exerciseData?.interactionData?.meaning ||
    questionPhrase?.selectedTranslation ||
    questionPhrase?.translations?.[0] ||
    ''
  const sentenceText = exerciseData?.reviewData?.sentence || exerciseData?.interactionData?.sentence || ''
  const renderedPrompt = promptText
    .replace(/\{phrase\}/g, phraseText)
    .replace(/\{meaning\}/g, meaningText)
    .replace(/\{sentence\}/g, sentenceText)
  const interactionWords: string[] = exerciseData?.interactionData?.words || exerciseData?.reviewData?.words || []
  const correctOrder: number[] =
    exerciseData?.interactionData?.correctOrder || exerciseData?.reviewData?.correctOrder || []
  const listeningAudioUrl = isListeningQuestion ? questionPhrase?.audio?.url : undefined
  const answerStatusLabel = isCorrect ? 'Correct!' : 'Try this one again'
  const stageBlockPositionLabel = currentStage
    ? `${Math.min(activeStageBlockIndex + 1, Math.max(currentStage.blockCount, 1))} / ${Math.max(currentStage.blockCount, 1)}`
    : '0 / 0'
  const listeningHeading = getListeningHeading(exerciseData?.subtype)
  const listeningSupportText = getListeningSupportText(exerciseData?.subtype)
  const stageQuestionCount = currentStageBlocks.filter((block) => block.type === 'question').length
  const stageXpEarned = stageQuestionCount * XP_PER_BLOCK
  const isLastStage = currentStageIndex >= stageMeta.length - 1

  const appendUnique = useCallback((list: number[], value: number) => {
    return list.includes(value) ? list : [...list, value]
  }, [])

  const resetAnswerState = useCallback(() => {
    setSelectedAnswer(null)
    setSelectedWords([])
    setSelectedMatchingLeftId(null)
    setSelectedMatches({})
    setIsAnswered(false)
    setIsCorrect(false)
    setIsListening(false)
    setIsPlayingPrompt(false)
  }, [])

  const resetStageState = useCallback(() => {
    setCurrentStageBlockIndex(0)
    setIsRetryMode(false)
    setRetryRound(0)
    setRetryQueue([])
    setNextRetryQueue([])
    setRetryPosition(0)
    setStageMistakesCount(0)
    setIsStageComplete(false)
    setStageStartedAt(null)
    resetAnswerState()
  }, [resetAnswerState])

  const canCheck = useMemo(() => {
    if (!isExerciseBlock || isAnswered) return false
    if (isMatchingQuestion) {
      return matchingLeftItems.length > 1 && matchingLeftItems.every((item) => selectedMatches[item.id])
    }
    return selectedOption !== null || selectedWords.length > 0
  }, [isExerciseBlock, isAnswered, isMatchingQuestion, matchingLeftItems, selectedMatches, selectedOption, selectedWords.length])

  const playFeedbackSound = useCallback((type: 'correct' | 'incorrect') => {
    const audio = new Audio(SOUNDS[type])
    audio.volume = 0.4
    audio.play().catch(() => {})
  }, [])

  const playAudio = useCallback((url?: string, speed = 1, onEnd?: () => void) => {
    if (!url) return
    const audio = new Audio(url)
    audio.playbackRate = speed
    if (onEnd) {
      audio.onended = onEnd
      audio.onerror = onEnd
    }
    audio.play().catch((error) => console.error('Audio playback failed', error))
  }, [])

  const playClick = useCallback(() => {
    const audio = new Audio(SOUNDS.click)
    audio.volume = 0.3
    audio.play().catch(() => {})
  }, [])

  const playUiSound = useCallback((type: 'stageStart' | 'stageComplete' | 'continue') => {
    const audio = new Audio(SOUNDS[type])
    audio.volume = 0.35
    audio.play().catch(() => {})
  }, [])

  const getMatchingRightItem = useCallback((rightId: string) => {
    return matchingRightItems.find((item) => item.id === rightId) || null
  }, [matchingRightItems])

  const handleSelectMatchingLeft = (leftId: string) => {
    if (isAnswered) return
    playClick()
    setSelectedMatchingLeftId((current) => (current === leftId ? null : leftId))
  }

  const handleSelectMatchingRight = (rightId: string) => {
    if (isAnswered || !selectedMatchingLeftId) return
    playClick()
    setSelectedMatches((current) => {
      const nextEntries = Object.entries(current).filter(([, value]) => value !== rightId)
      return {
        ...Object.fromEntries(nextEntries),
        [selectedMatchingLeftId]: rightId
      }
    })
    setSelectedMatchingLeftId(null)
  }

  const handleStartStage = () => {
    playUiSound('stageStart')
    setStageStartedAt(Date.now())
    setIsStageIntro(false)
  }

  const completeCurrentStage = useCallback(async () => {
    if (!lessonId || !currentStage) return
    const elapsedMs = stageStartedAt ? Date.now() - stageStartedAt : 0
    const minutesSpent = Math.max(1, Math.round(elapsedMs / 60000))
    playUiSound('stageComplete')
    setIsStageComplete(true)
    resetAnswerState()
    setIsSavingStage(true)
    try {
      const result = await learnerLessonService.completeStage(lessonId, currentStageIndex, {
        xpEarned: stageXpEarned,
        minutesSpent,
      })
      setLesson((prevLesson) => prevLesson
        ? {
            ...prevLesson,
            currentStageIndex: result.currentStageIndex,
            stageProgress: result.stageProgress,
            progressPercent: result.progressPercent,
            status: result.status === 'completed' ? 'published' : prevLesson.status,
          }
        : prevLesson)
    } catch (error) {
      console.error('Failed to save stage progress', error)
    } finally {
      setIsSavingStage(false)
    }
  }, [currentStage, currentStageIndex, lessonId, resetAnswerState, stageStartedAt, stageXpEarned])

  const handleCheck = () => {
    if (!exerciseData) return

    let correct = false
    if (isMatchingQuestion) {
      correct =
        matchingLeftItems.length > 1 &&
        matchingLeftItems.every((item) => selectedMatches[item.id] === item.id) &&
        Object.keys(selectedMatches).length === matchingLeftItems.length
    } else if (isWordOrderQuestion) {
      correct = selectedWords.join(',') === correctOrder.join(',')
    } else {
      correct = selectedOption === exerciseData.correctIndex
    }

    setIsCorrect(correct)
    setIsAnswered(true)
    playFeedbackSound(correct ? 'correct' : 'incorrect')

    if (correct) {
      setXpEarned((prev) => prev + XP_PER_BLOCK)
      return
    }

    setMistakesCount((prev) => prev + 1)
    setStageMistakesCount((prev) => prev + 1)
    const failedBlockIndex = isRetryMode ? retryQueue[retryPosition] : currentStageBlockIndex
    if (isRetryMode) {
      setNextRetryQueue((prev) => appendUnique(prev, failedBlockIndex))
    } else {
      setRetryQueue((prev) => appendUnique(prev, failedBlockIndex))
    }
  }

  const handleAdvanceStage = () => {
    playUiSound('continue')
    if (isLastStage) {
      router.push(`/lesson-complete?lessonId=${lessonId}&xpEarned=${xpEarned}&language=${lesson?.language || ''}`)
      return
    }

    setCurrentStageIndex((prev) => prev + 1)
    resetStageState()
    setIsStageIntro(true)
  }

  const handleNext = () => {
    if (!currentStage) return

    if (!isRetryMode && currentStageBlockIndex < currentStageBlocks.length - 1) {
      setCurrentStageBlockIndex((prev) => prev + 1)
      resetAnswerState()
      return
    }

    if (!isRetryMode && retryQueue.length > 0) {
      setIsRetryMode(true)
      setRetryRound(1)
      setRetryPosition(0)
      setNextRetryQueue([])
      resetAnswerState()
      return
    }

    if (isRetryMode && retryPosition < retryQueue.length - 1) {
      setRetryPosition((prev) => prev + 1)
      resetAnswerState()
      return
    }

    if (isRetryMode && nextRetryQueue.length > 0) {
      setRetryQueue(nextRetryQueue)
      setNextRetryQueue([])
      setRetryPosition(0)
      setRetryRound((prev) => prev + 1)
      resetAnswerState()
      return
    }

    void completeCurrentStage()
  }

  const toggleMic = () => {
    setIsListening((prevListening) => !prevListening)
    if (!isListening) {
      setTimeout(() => setIsListening(false), 3000)
    }
  }

  useEffect(() => {
    if (isStageIntro || isStageComplete || currentBlock?.type !== 'proverb') return
    const audio = new Audio(getCulturalSoundPath(lesson?.language, 'proverb'))
    audio.volume = 0.42
    audio.play().catch(() => {})
  }, [currentBlock, isStageComplete, isStageIntro, lesson?.language])

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
        <div className="mb-4 h-16 w-16 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="animate-pulse text-xl font-bold text-foreground/60">Preparing your lesson...</p>
      </div>
    )
  }

  if (!currentStage || (!currentBlock && !isStageComplete)) {
    return <div className="min-h-screen flex items-center justify-center">No content available.</div>
  }

  return (
    <main className="relative flex min-h-screen select-none flex-col overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(248,196,113,0.14),transparent_45%),radial-gradient(circle_at_bottom_left,rgba(239,162,129,0.1),transparent_50%)]" />

      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/95 px-4 backdrop-blur">
        <div className="mx-auto flex h-20 w-full max-w-4xl items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push(`/lesson-overview?lessonId=${lessonId}`)}
            className="rounded-full text-foreground/50 hover:bg-muted/80 hover:text-foreground"
            aria-label="Exit lesson"
          >
            <X className="h-7 w-7" />
          </Button>

          <div className="flex-1 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wide text-foreground/50">
              <span>
                {lesson?.title || 'Lesson'} • Stage {currentStageIndex + 1} of {Math.max(stageMeta.length, 1)}
              </span>
              <span>{isStageComplete ? 'Stage complete' : stageBlockPositionLabel}</span>
            </div>
            <div className="relative h-3 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/10 via-transparent to-white/20" />
            </div>
          </div>

          <div className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-black text-primary">
            {xpEarned} XP
          </div>
        </div>
      </header>

      <div className="relative z-10 flex-1 overflow-y-auto px-4 pb-36 pt-8 sm:px-6">
        <div className="mx-auto flex h-full w-full max-w-2xl flex-col">
          {isStageIntro ? (
            <section className="flex h-full flex-1 items-center justify-center py-6">
              <div className="w-full rounded-[2rem] border border-primary/15 bg-white/95 p-8 text-center shadow-sm sm:p-10">
                <p className="text-xs font-black uppercase tracking-[0.3em] text-primary/60">Stage {currentStageIndex + 1}</p>
                <h2 className="mt-4 text-3xl font-black text-foreground sm:text-4xl">{currentStage.title}</h2>
                {currentStage.description && (
                  <p className="mx-auto mt-4 max-w-xl text-base font-medium leading-relaxed text-foreground/65">
                    {currentStage.description}
                  </p>
                )}
                <div className="mt-8 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-3xl border border-primary/20 bg-primary/5 p-5 text-left">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-primary/70">Activities</p>
                    <p className="mt-2 text-3xl font-black text-primary">{currentStage.blockCount}</p>
                  </div>
                  <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-left">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-700/70">Stage XP</p>
                    <p className="mt-2 text-3xl font-black text-amber-700">+{stageXpEarned}</p>
                  </div>
                </div>
                <div className="mt-8 rounded-3xl border border-border/70 bg-muted/40 p-5 text-left">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-foreground/45">Focus</p>
                  <p className="mt-2 text-lg font-bold text-foreground">
                    One stage at a time. Finish this stage before moving on.
                  </p>
                </div>
                <Button
                  size="lg"
                  className="mt-8 h-14 rounded-2xl px-8 text-lg font-black shadow-lg shadow-primary/20"
                  onClick={handleStartStage}
                >
                  Start Stage
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </div>
            </section>
          ) : isStageComplete ? (
            <section className="flex h-full flex-1 items-center justify-center py-6">
              <div className="w-full rounded-[2rem] border border-primary/15 bg-white/95 p-8 text-center shadow-sm sm:p-10">
                <p className="text-xs font-black uppercase tracking-[0.3em] text-primary/60">Stage Complete</p>
                <h2 className="mt-4 text-3xl font-black text-foreground sm:text-4xl">{currentStage.title}</h2>
                {currentStage.description && (
                  <p className="mx-auto mt-4 max-w-xl text-base font-medium leading-relaxed text-foreground/65">
                    {currentStage.description}
                  </p>
                )}
                <p className="mx-auto mt-4 max-w-lg text-sm font-semibold uppercase tracking-[0.2em] text-foreground/45">
                  Take a breath. Your next stage starts when you are ready.
                </p>
                <div className="mt-8 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-3xl border border-green-200 bg-green-50 p-5 text-left">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-green-700/70">Stage XP</p>
                    <p className="mt-2 text-3xl font-black text-green-700">+{stageXpEarned}</p>
                  </div>
                  <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-left">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-700/70">Mistakes This Stage</p>
                    <p className="mt-2 text-3xl font-black text-amber-700">{stageMistakesCount}</p>
                  </div>
                </div>
                <div className="mt-8 rounded-3xl border border-border/70 bg-muted/40 p-5 text-left">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-foreground/45">Stage Progress</p>
                  <p className="mt-2 text-lg font-bold text-foreground">
                    Stage {currentStageIndex + 1} of {Math.max(stageMeta.length, 1)} complete
                  </p>
                </div>
                <Button size="lg" className="mt-8 h-14 rounded-2xl px-8 text-lg font-black shadow-lg shadow-primary/20" onClick={handleAdvanceStage} disabled={isSavingStage}>
                  {isSavingStage ? 'Saving Stage...' : isLastStage ? 'Finish Lesson' : 'Start Next Stage'}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </div>
            </section>
          ) : (
            <>
              {currentBlock.type === 'text' && (
                <section className="animate-in fade-in zoom-in-95 space-y-6 py-4 duration-500">
                  <div className="rounded-3xl border border-blue-100 bg-white/90 p-6 shadow-sm">
                    <div className="mb-5 flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500 text-white">
                        <Info className="h-6 w-6" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-black text-foreground">Teacher&apos;s Note</h2>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground/45">Context</p>
                      </div>
                    </div>
                    <p className="rounded-2xl bg-blue-50 p-6 text-lg font-medium leading-relaxed text-foreground/85">
                      {currentBlock.content}
                    </p>
                  </div>
                </section>
              )}

              {currentBlock.type === 'phrase' && (
                <section className="animate-in fade-in slide-in-from-bottom-6 space-y-8 py-4 duration-500">
                  <div className="text-center">
                    <p className="text-xs font-black uppercase tracking-[0.3em] text-foreground/45">New Expression</p>
                  </div>

                  <div className="space-y-8 rounded-[2rem] border border-primary/10 bg-white/90 p-6 shadow-sm sm:p-10">
                    <div className="flex justify-center gap-3">
                      <Button
                        size="lg"
                        className="h-16 w-16 rounded-2xl shadow-md shadow-primary/30 transition-transform hover:scale-105"
                        onClick={() => {
                          playClick()
                          playAudio(currentBlock.data?.audio?.url)
                        }}
                      >
                        <Volume2 className="h-7 w-7" />
                      </Button>
                      <Button
                        size="lg"
                        variant="outline"
                        className="h-16 w-16 rounded-2xl border-2 border-border bg-background text-foreground/60"
                        onClick={() => {
                          playClick()
                          playAudio(currentBlock.data?.audio?.url, 0.6)
                        }}
                      >
                        <Turtle className="h-7 w-7" />
                      </Button>
                    </div>

                    <div className="space-y-3 text-center">
                      <h3 className="text-4xl font-black tracking-tight text-primary sm:text-5xl">{currentBlock.data.text}</h3>
                      {currentBlock.data.pronunciation && (
                        <p className="text-lg font-semibold italic text-foreground/45">{currentBlock.data.pronunciation}</p>
                      )}
                    </div>

                    <div className="h-px w-full bg-border" />

                    <p className="text-center text-2xl font-black text-foreground/80">
                      {currentBlock.data.selectedTranslation || currentBlock.data.translations?.[0] || ''}
                    </p>
                  </div>

                  <div className="flex justify-center">
                    <Button
                      variant="outline"
                      className={cn(
                        'h-14 rounded-2xl border-2 px-6 text-base font-bold transition-all',
                        isListening
                          ? 'border-red-400 bg-red-50 text-red-600 animate-pulse'
                          : 'border-border bg-white/80 text-foreground/65'
                      )}
                      onClick={toggleMic}
                    >
                      <Mic className={cn('mr-2 h-5 w-5', isListening && 'fill-current')} />
                      {isListening ? 'Listening...' : 'Practice Speaking'}
                    </Button>
                  </div>
                </section>
              )}

              {currentBlock.type === 'proverb' && (
                <section className="animate-in fade-in slide-in-from-bottom-6 space-y-8 py-4 duration-500">
                  <div className="text-center">
                    <p className="text-xs font-black uppercase tracking-[0.3em] text-amber-700/60">Cultural Wisdom</p>
                  </div>

                  <div className="relative overflow-hidden rounded-[2rem] border border-amber-200 bg-amber-50/80 p-6 shadow-sm sm:p-10">
                    <Quote className="absolute -left-1 -top-1 h-14 w-14 -rotate-12 text-amber-200/70" />
                    <div className="relative space-y-5">
                      <h3 className="text-2xl font-black leading-snug text-amber-900 sm:text-3xl">{currentBlock.data.text}</h3>
                      <div className="h-px w-20 bg-amber-300" />
                      <p className="text-lg font-semibold italic text-amber-900/75">{currentBlock.data.translation || ''}</p>
                    </div>
                  </div>

                  {currentBlock.data.contextNote && (
                    <div className="flex gap-3 rounded-2xl border border-secondary/30 bg-secondary/20 p-5">
                      <Info className="mt-0.5 h-5 w-5 shrink-0 text-secondary-foreground/70" />
                      <p className="text-sm font-medium leading-relaxed text-foreground/70">{currentBlock.data.contextNote}</p>
                    </div>
                  )}
                </section>
              )}

              {isExerciseBlock && (
                <section className="animate-in fade-in space-y-8 py-4 duration-500">
                  <div className="space-y-4 rounded-3xl border border-border/70 bg-white/90 p-6 shadow-sm sm:p-8">
                    <h2 className="text-2xl font-black leading-tight text-foreground sm:text-3xl">
                      {isListeningQuestion ? listeningHeading : renderedPrompt}
                    </h2>

                    {isListeningQuestion && (
                      <div className="mt-2 rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-white to-secondary/25 p-5 sm:p-6">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div>
                            <p className="text-xs font-black uppercase tracking-[0.2em] text-primary/70">Listening Challenge</p>
                            <p className="mt-1 text-sm font-semibold text-foreground/65">{listeningSupportText}</p>
                          </div>
                          <div className="flex gap-3">
                            <Button
                              size="lg"
                              className="h-16 w-16 rounded-2xl shadow-md shadow-primary/25"
                              onClick={() => {
                                if (!listeningAudioUrl) return
                                playClick()
                                setIsPlayingPrompt(true)
                                playAudio(listeningAudioUrl, 1, () => setIsPlayingPrompt(false))
                              }}
                              disabled={!listeningAudioUrl}
                              aria-label="Play listening prompt audio"
                            >
                              <Volume2 className={cn('h-7 w-7', isPlayingPrompt && 'animate-pulse')} />
                            </Button>
                            <Button
                              size="lg"
                              variant="outline"
                              className="h-16 w-16 rounded-2xl border-2 border-border text-foreground/55"
                              onClick={() => {
                                playClick()
                                playAudio(listeningAudioUrl, 0.6)
                              }}
                              disabled={!listeningAudioUrl}
                              aria-label="Play listening prompt audio slowly"
                            >
                              <Turtle className="h-7 w-7" />
                            </Button>
                          </div>
                        </div>
                        {!listeningAudioUrl && (
                          <p className="mt-3 text-sm font-semibold text-red-600">No audio available for this phrase yet.</p>
                        )}
                      </div>
                    )}
                  </div>

                  {isChoiceQuestion && (
                    <div className="grid gap-3">
                      {exerciseData?.options.map((option: string, idx: number) => (
                        <Button
                          key={idx}
                          variant="outline"
                          className={cn(
                            'h-auto justify-start rounded-2xl border-2 bg-white/90 p-4 text-left text-base font-semibold transition-all sm:p-5 sm:text-lg',
                            selectedOption === idx && !isAnswered && 'border-primary bg-primary/5 text-primary',
                            isAnswered && idx === exerciseData.correctIndex && 'border-green-500 bg-green-50 text-green-700',
                            isAnswered && selectedOption === idx && idx !== exerciseData.correctIndex && 'border-red-500 bg-red-50 text-red-700'
                          )}
                          onClick={() => {
                            if (isAnswered) return
                            setSelectedAnswer(idx)
                            playClick()
                          }}
                          disabled={isAnswered}
                        >
                          <span className="mr-4 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-black">
                            {idx + 1}
                          </span>
                          {option}
                        </Button>
                      ))}
                    </div>
                  )}

                  {isMatchingQuestion && (
                    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-start">
                      <div className="space-y-3">
                        <p className="text-xs font-black uppercase tracking-[0.25em] text-foreground/45">Phrases</p>
                        {matchingLeftItems.map((item) => {
                          const matchedRight = selectedMatches[item.id] ? getMatchingRightItem(selectedMatches[item.id]) : null
                          return (
                            <button
                              key={item.id}
                              type="button"
                              className={cn(
                                'w-full rounded-2xl border-2 bg-white/90 p-4 text-left transition-all',
                                selectedMatchingLeftId === item.id && 'border-primary bg-primary/5 shadow-sm shadow-primary/10',
                                !selectedMatchingLeftId && matchedRight && 'border-emerald-300 bg-emerald-50',
                                isAnswered && selectedMatches[item.id] === item.id && 'border-green-500 bg-green-50',
                                isAnswered && selectedMatches[item.id] !== item.id && 'border-red-500 bg-red-50'
                              )}
                              onClick={() => handleSelectMatchingLeft(item.id)}
                              disabled={isAnswered}
                            >
                              <p className="text-lg font-black text-foreground">{item.label}</p>
                              {matchedRight && (
                                <p className="mt-2 text-sm font-semibold text-foreground/55">
                                  Matched to: {matchedRight.label}
                                </p>
                              )}
                            </button>
                          )
                        })}
                      </div>

                      <div className="hidden h-full items-center justify-center lg:flex">
                        <div className="h-px w-10 bg-border" />
                      </div>

                      <div className="space-y-3">
                        <p className="text-xs font-black uppercase tracking-[0.25em] text-foreground/45">
                          {exerciseData?.subtype === 'mt-match-image' ? 'Images' : 'Translations'}
                        </p>
                        {matchingRightItems.map((item) => {
                          const isUsed = Object.values(selectedMatches).includes(item.id)
                          return (
                            <button
                              key={item.id}
                              type="button"
                              className={cn(
                                'w-full rounded-2xl border-2 bg-white/90 p-4 text-left transition-all',
                                selectedMatchingLeftId && 'hover:border-primary/60 hover:bg-primary/5',
                                isUsed && !selectedMatchingLeftId && 'border-emerald-300 bg-emerald-50',
                                isAnswered && isUsed && 'border-green-500 bg-green-50'
                              )}
                              onClick={() => handleSelectMatchingRight(item.id)}
                              disabled={isAnswered}
                            >
                              {item.image?.url ? (
                                <div className="space-y-3">
                                  <div className="overflow-hidden rounded-2xl border border-border/50 bg-muted/40">
                                    <img
                                      src={item.image.url}
                                      alt={item.image.altText}
                                      className="h-40 w-full object-cover"
                                    />
                                  </div>
                                  <p className="text-sm font-semibold text-foreground/55">{item.image.altText}</p>
                                </div>
                              ) : (
                                <p className="text-lg font-black text-foreground">{item.label}</p>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {isWordOrderQuestion && (
                    <div className="space-y-8">
                      <div className="flex min-h-[140px] flex-wrap content-center items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-border bg-white/80 p-5">
                        {selectedWords.length === 0 && !isAnswered && (
                          <span className="text-base font-semibold uppercase tracking-wider text-foreground/35">Select words below</span>
                        )}
                        {selectedWords.map((wordIdx, idx) => (
                          <Button
                            key={`${wordIdx}-${idx}`}
                            variant="secondary"
                            className="h-12 rounded-xl px-5 text-base font-black"
                            onClick={() => {
                              if (isAnswered) return
                              setSelectedWords((prevWords) => prevWords.filter((_, selectedIndex) => selectedIndex !== idx))
                            }}
                            disabled={isAnswered}
                          >
                            {interactionWords[wordIdx]}
                          </Button>
                        ))}
                      </div>

                      <div className="flex flex-wrap justify-center gap-3">
                        {interactionWords.map((word: string, idx: number) => {
                          const isUsed = selectedWords.includes(idx)
                          return (
                            <Button
                              key={idx}
                              variant="outline"
                              className={cn(
                                'h-12 rounded-xl border-2 px-5 text-base font-black transition-all',
                                isUsed ? 'pointer-events-none opacity-25' : 'bg-white/90 hover:border-primary/60'
                              )}
                              onClick={() => {
                                if (isAnswered) return
                                setSelectedWords((prevWords) => [...prevWords, idx])
                                playClick()
                              }}
                              disabled={isAnswered}
                            >
                              {word}
                            </Button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </div>

      {!isStageComplete && !isStageIntro && (
        <footer
          className={cn(
            'fixed bottom-0 left-0 right-0 z-40 border-t backdrop-blur transition-colors duration-300',
            !isAnswered && 'border-border/70 bg-background/95',
            isAnswered && isCorrect && 'border-green-200 bg-green-50/95',
            isAnswered && !isCorrect && 'border-red-200 bg-red-50/95'
          )}
        >
          <div className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="hidden flex-1 items-center gap-3 sm:flex">
              {isAnswered ? (
                <>
                  <div
                    className={cn(
                      'flex h-11 w-11 items-center justify-center rounded-xl border',
                      isCorrect ? 'border-green-300 bg-white text-green-700' : 'border-red-300 bg-white text-red-700'
                    )}
                  >
                    {isCorrect ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}
                  </div>
                  <div>
                    <p className={cn('text-base font-black', isCorrect ? 'text-green-800' : 'text-red-800')}>
                      {answerStatusLabel}
                    </p>
                    {!isCorrect && exerciseData?.explanation && (
                      <p className="text-sm font-medium text-red-800/70">{exerciseData.explanation}</p>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm font-semibold text-foreground/55">Choose your answer, then check.</p>
              )}
            </div>

            <div className="w-full sm:w-auto">
              {isExerciseBlock ? (
                !isAnswered ? (
                  <Button
                    size="lg"
                    className="h-14 w-full rounded-2xl px-8 text-lg font-black sm:w-auto"
                    onClick={handleCheck}
                    disabled={!canCheck}
                  >
                    Check Answer
                  </Button>
                ) : (
                  <Button
                    size="lg"
                    className={cn(
                      'h-14 w-full rounded-2xl px-8 text-lg font-black text-white sm:w-auto',
                      isCorrect ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                    )}
                    onClick={handleNext}
                    disabled={isSavingStage}
                  >
                    Continue
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                )
              ) : (
                <Button size="lg" className="h-14 w-full rounded-2xl px-8 text-lg font-black sm:w-auto" onClick={handleNext}>
                  Continue
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              )}
            </div>
          </div>
        </footer>
      )}
    </main>
  )
}

export default function StudyPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center font-bold text-primary">Studying...</div>}>
      <StudyPageContent />
    </Suspense>
  )
}
