'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react'
import { ArrowRight, Check, Info, Mic, Quote, Turtle, Volume2, X } from 'lucide-react'
import type {
  ExerciseQuestion,
  Language,
  LearningContentComponent,
  Lesson,
  LessonFlowData,
  PopulatedLessonBlock,
  QuestionMatchingDisplayItem,
  StageQuestionResult,
  StageCompletionResult,
} from './types'

type StageSlice = {
  index: number
  title: string
  description?: string
  blockCount: number
  start: number
  end: number
  blocks: PopulatedLessonBlock[]
}

type CueType = 'celebration' | 'proverb'

type PronunciationComparisonResponse = {
  comparison: {
    score: number
    level: 'excellent' | 'good' | 'fair' | 'poor'
    dtwDistance: number
    normalizedDistance: number
    pathLength: number
    durationRatio: number
    pitchRangeRatio: number
    feedback: string[]
  }
}

type SpeakingTarget = {
  type: 'word' | 'expression' | 'sentence'
  id: string
  text: string
  audioUrl?: string
}

type StageTransitionCopy = {
  title: string
  subtitle: string
}

type LessonPlayerProps = {
  lessonId: string
  loadFlow: (lessonId: string) => Promise<LessonFlowData>
  onExit: () => void
  onCompleteStage?: (
    lessonId: string,
    stageIndex: number,
    payload: { xpEarned?: number; minutesSpent?: number; questionResults?: StageQuestionResult[] }
  ) => Promise<StageCompletionResult | void>
  onLessonComplete?: (summary: { lessonId: string; xpEarned: number; language?: Language }) => void
  onLoadError?: (error: unknown) => void
  loadingMessage?: string
  emptyMessage?: string
  preview?: boolean
  enableUiSounds?: boolean
  culturalSoundResolver?: (language: Language, cue: CueType) => string
  onComparePronunciation?: (
    contentType: 'word' | 'expression' | 'sentence',
    contentId: string,
    payload: {
      audioUpload?: {
        base64?: string
        mimeType?: string
      }
    },
  ) => Promise<PronunciationComparisonResponse>
}

const SOUNDS = {
  correct: '/sounds/correct.wav',
  incorrect: '/sounds/incorrect.wav',
  click: '/sounds/click.wav',
  stageStart: '/sounds/stage-start.wav',
  stageComplete: '/sounds/stage-complete.wav',
  continue: '/sounds/continue.wav',
} as const

const XP_PER_BLOCK = 10

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

function Button({
  className,
  variant = 'default',
  size = 'default',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'ghost' | 'outline' | 'secondary'
  size?: 'default' | 'lg' | 'icon'
}) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 disabled:pointer-events-none disabled:opacity-50',
        variant === 'default' && 'bg-primary text-primary-foreground hover:bg-primary/90',
        variant === 'ghost' && 'bg-transparent text-inherit hover:bg-muted/70',
        variant === 'outline' && 'border border-border bg-background hover:bg-muted/60',
        variant === 'secondary' && 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        size === 'default' && 'h-10 rounded-xl px-4 py-2 text-sm',
        size === 'lg' && 'h-12 rounded-2xl px-6 py-3 text-base',
        size === 'icon' && 'h-10 w-10 rounded-full',
        className,
      )}
      {...props}
    />
  )
}

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

function getChoiceSupportText(subtype?: ExerciseQuestion['subtype']) {
  switch (subtype) {
    case 'mc-select-context-response':
      return 'Choose the response that best fits the situation. Focus on respect, timing, and social context, not just literal meaning.'
    default:
      return ''
  }
}

function getListeningPromptDetail(
  subtype: ExerciseQuestion['subtype'] | undefined,
  sentenceText: string,
  meaningText: string,
  renderedPrompt: string,
) {
  switch (subtype) {
    case 'ls-mc-select-missing-word':
    case 'ls-fg-gap-fill':
      return sentenceText
    case 'ls-fg-word-order':
      return meaningText ? `Meaning: ${meaningText}` : renderedPrompt
    default:
      return ''
  }
}

type SentenceRenderPart =
  | { type: 'text'; text: string }
  | { type: 'component'; text: string; component: LearningContentComponent }

function buildSentenceRenderParts(text: string, components: LearningContentComponent[]): SentenceRenderPart[] {
  const sentenceText = String(text || '')
  if (!sentenceText.trim() || components.length === 0) {
    return [{ type: 'text', text: sentenceText }]
  }

  const lowerSentence = sentenceText.toLocaleLowerCase()
  const parts: SentenceRenderPart[] = []
  let cursor = 0

  for (const component of components) {
    const componentText = String(component.text || '')
    if (!componentText) continue

    const matchIndex = lowerSentence.indexOf(componentText.toLocaleLowerCase(), cursor)
    if (matchIndex < 0) {
      return components.flatMap((item, index) => {
        const rows: SentenceRenderPart[] = []
        if (index > 0) rows.push({ type: 'text', text: ' ' })
        rows.push({ type: 'component', text: item.text, component: item })
        return rows
      })
    }

    if (matchIndex > cursor) {
      parts.push({ type: 'text', text: sentenceText.slice(cursor, matchIndex) })
    }

    parts.push({
      type: 'component',
      text: sentenceText.slice(matchIndex, matchIndex + componentText.length),
      component,
    })
    cursor = matchIndex + componentText.length
  }

  if (cursor < sentenceText.length) {
    parts.push({ type: 'text', text: sentenceText.slice(cursor) })
  }

  return parts.filter((part) => part.type === 'component' || part.text.length > 0)
}

function buildMatchingFallbackItems(question: ExerciseQuestion | null) {
  const matchingPairs = Array.isArray(question?.interactionData?.matchingPairs)
    ? question!.interactionData!.matchingPairs!
    : []
  if (matchingPairs.length < 2) {
    return { leftItems: [] as QuestionMatchingDisplayItem[], rightItems: [] as QuestionMatchingDisplayItem[] }
  }

  const leftItems: QuestionMatchingDisplayItem[] = matchingPairs.map((pair) => ({
    id: pair.pairId,
    label: pair.contentText || pair.translation,
    translationIndex: pair.translationIndex,
  }))

  const rightItems: QuestionMatchingDisplayItem[] =
    question?.subtype === 'mt-match-image'
      ? matchingPairs
          .filter((pair) => pair.image?.url)
          .map((pair) => ({
            id: pair.pairId,
            label: pair.image?.altText || pair.translation,
            image: pair.image || null,
          }))
      : matchingPairs.map((pair) => ({
          id: pair.pairId,
          label: pair.translation,
        }))

  return { leftItems, rightItems: shuffleItems(rightItems) }
}

function SentenceGlossPanel({ component }: { component: LearningContentComponent }) {
  const translations = component.translations.filter(Boolean)

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-foreground/45">{component.kind}</p>
        <div className="mt-1 flex items-center gap-2">
          <p className="text-lg font-black text-foreground">{component.text}</p>
          <InlineAudioButton audioUrl={component.audio?.url} label={component.text} />
        </div>
        {component.pronunciation ? (
          <p className="mt-1 text-sm font-semibold italic text-foreground/55">{component.pronunciation}</p>
        ) : null}
      </div>

      {translations.length > 0 ? (
        <div className="space-y-1.5 rounded-2xl border border-border/60 bg-muted/40 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-foreground/45">Translations</p>
          <div className="flex flex-wrap gap-2">
            {translations.map((translation, index) => (
              <span
                key={`${component.id}-${translation}-${index}`}
                className={cx(
                  'rounded-full px-2.5 py-1 text-sm font-bold',
                  index === component.selectedTranslationIndex
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-white text-foreground/75',
                )}
              >
                {translation}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {component.explanation ? (
        <p className="text-sm font-medium leading-relaxed text-foreground/70">{component.explanation}</p>
      ) : null}
    </div>
  )
}

function shuffleItems<T>(items: T[]) {
  return items
    .map((item) => ({ item, sortKey: Math.random() }))
    .sort((left, right) => left.sortKey - right.sortKey)
    .map((entry) => entry.item)
}

function replacePromptToken(prompt: string, token: string, value: string) {
  return prompt.split(token).join(value)
}

function buildStageTransitionCopy(input: {
  mistakesCount: number
  stageNumber: number
  totalStages: number
  isLastStage: boolean
  preview?: boolean
}): StageTransitionCopy {
  const title = input.isLastStage
    ? input.mistakesCount === 0
      ? 'Lesson locked in'
      : input.mistakesCount <= 2
        ? 'Strong finish'
        : 'Lesson complete'
    : input.mistakesCount === 0
      ? 'Clean round'
      : input.mistakesCount <= 2
        ? 'Nice work'
        : 'Good recovery'

  const subtitle = input.isLastStage
    ? input.preview
      ? 'Wrapping up preview...'
      : `Stage ${input.stageNumber} of ${input.totalStages} complete. Finishing lesson...`
    : `Stage ${input.stageNumber} of ${input.totalStages} complete. Next stage starts now.`

  return { title, subtitle }
}

function InlineAudioButton({
  audioUrl,
  label,
  className,
}: {
  audioUrl?: string
  label: string
  className?: string
}) {
  if (!audioUrl) return null

  return (
    <button
      type="button"
      className={cx(
        'inline-flex h-8 w-8 items-center justify-center rounded-full border border-primary/20 bg-white/90 text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
        className,
      )}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        playAudioUrl(audioUrl)
      }}
      aria-label={`Play audio for ${label}`}
    >
      <Volume2 className="h-4 w-4" />
    </button>
  )
}

function SentenceGlossToken({
  component,
  children,
}: {
  component: LearningContentComponent
  children: ReactNode
}) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <span className="relative inline-flex items-center gap-1 align-baseline" onMouseLeave={() => setIsOpen(false)}>
      <button
        type="button"
        className="inline rounded-xl border-b-2 border-primary/35 bg-primary/10 px-1.5 py-0.5 font-black text-primary transition-colors hover:border-primary hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        onMouseEnter={() => setIsOpen(true)}
        onClick={() => setIsOpen((current) => !current)}
      >
        {children}
      </button>
      <InlineAudioButton audioUrl={component.audio?.url} label={component.text} className="h-7 w-7 bg-primary/5" />
      {isOpen ? (
        <div className="absolute left-1/2 top-full z-30 mt-3 w-72 -translate-x-1/2 rounded-3xl border border-border/60 bg-background p-4 shadow-xl">
          <SentenceGlossPanel component={component} />
        </div>
      ) : null}
    </span>
  )
}

function InlineGlossToken({
  label,
  component,
}: {
  label: string
  component: LearningContentComponent
}) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <span className="relative inline-flex items-center gap-1 align-baseline" onMouseLeave={() => setIsOpen(false)}>
      <button
        type="button"
        className="inline rounded-xl border-b-2 border-primary/35 bg-primary/10 px-1.5 py-0.5 font-black text-primary transition-colors hover:border-primary hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        onMouseEnter={() => setIsOpen(true)}
        onClick={() => setIsOpen((current) => !current)}
      >
        {label}
      </button>
      <InlineAudioButton audioUrl={component.audio?.url} label={component.text} className="h-7 w-7 bg-primary/5" />
      {isOpen ? (
        <div className="absolute left-1/2 top-full z-30 mt-3 w-72 -translate-x-1/2 rounded-3xl border border-border/60 bg-background p-4 shadow-xl">
          <SentenceGlossPanel component={component} />
        </div>
      ) : null}
    </span>
  )
}

function SentenceContentDisplay({
  text,
  components,
  audioUrl,
}: {
  text: string
  components: LearningContentComponent[]
  audioUrl?: string
}) {
  const parts = useMemo(() => buildSentenceRenderParts(text, components), [text, components])

  return (
    <div className="space-y-4 text-center">
      <div className="flex items-start justify-center gap-3">
        <div className="text-4xl font-black tracking-tight text-primary leading-[1.28] sm:text-5xl">
          {parts.map((part, index) =>
            part.type === 'text' ? (
              <span key={`text-${index}`} className="whitespace-pre-wrap text-primary">
                {part.text}
              </span>
            ) : (
              <SentenceGlossToken key={`component-${part.component.id}-${index}`} component={part.component}>
                {part.text}
              </SentenceGlossToken>
            ),
          )}
        </div>
        <InlineAudioButton audioUrl={audioUrl} label={text} className="mt-1 h-9 w-9 shrink-0" />
      </div>
      <p className="text-xs font-black uppercase tracking-[0.22em] text-foreground/45">
        Hover or tap the highlighted parts for meanings
      </p>
    </div>
  )
}

function playAudioUrl(url?: string, speed = 1, onEnd?: () => void) {
  if (!url) {
    onEnd?.()
    return
  }
  const audio = new Audio(url)
  audio.playbackRate = speed
  if (onEnd) {
    audio.onended = onEnd
    audio.onerror = onEnd
  }
  audio.play().catch(() => onEnd?.())
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('audio_read_failed'))
    reader.readAsDataURL(blob)
  })
}

export function LessonPlayer({
  lessonId,
  loadFlow,
  onExit,
  onCompleteStage,
  onLessonComplete,
  onLoadError,
  loadingMessage = 'Preparing your lesson...',
  emptyMessage = 'No content available.',
  preview = false,
  enableUiSounds = false,
  culturalSoundResolver,
  onComparePronunciation,
}: LessonPlayerProps) {
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
  const [isStageIntro, setIsStageIntro] = useState(false)
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
  const [stageQuestionResults, setStageQuestionResults] = useState<Record<string, StageQuestionResult>>({})
  const [isRecordingSpeech, setIsRecordingSpeech] = useState(false)
  const [recordedSpeechBlob, setRecordedSpeechBlob] = useState<Blob | null>(null)
  const [recordedSpeechUrl, setRecordedSpeechUrl] = useState<string | null>(null)
  const [isComparingSpeech, setIsComparingSpeech] = useState(false)
  const [speakingFeedback, setSpeakingFeedback] = useState<PronunciationComparisonResponse['comparison'] | null>(null)
  const [speakingError, setSpeakingError] = useState('')
  const [stageTransitionCopy, setStageTransitionCopy] = useState<StageTransitionCopy | null>(null)
  const [viewportHeight, setViewportHeight] = useState<number | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const mediaChunksRef = useRef<BlobPart[]>([])
  const stageAdvanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearStageAdvanceTimeout = useCallback(() => {
    if (stageAdvanceTimeoutRef.current) {
      clearTimeout(stageAdvanceTimeoutRef.current)
      stageAdvanceTimeoutRef.current = null
    }
  }, [])

  const stopSpeechCapture = useCallback(() => {
    mediaRecorderRef.current = null
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      mediaStreamRef.current = null
    }
    setIsRecordingSpeech(false)
  }, [])

  const resetSpeakingState = useCallback(() => {
    stopSpeechCapture()
    setIsComparingSpeech(false)
    setSpeakingFeedback(null)
    setSpeakingError('')
    setRecordedSpeechBlob(null)
    setRecordedSpeechUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return null
    })
    mediaChunksRef.current = []
  }, [stopSpeechCapture])

  const playUiAudio = useCallback(
    (src: string, volume = 0.35) => {
      if (!enableUiSounds) return
      const audio = new Audio(src)
      audio.volume = volume
      audio.play().catch(() => {})
    },
    [enableUiSounds],
  )

  useEffect(() => {
    if (!lessonId) return

    clearStageAdvanceTimeout()
    setIsLoading(true)
    loadFlow(lessonId)
      .then((data) => {
        setLesson({
          ...data.lesson,
          currentStageIndex: data.progress?.currentStageIndex ?? data.lesson?.currentStageIndex ?? 0,
          stageProgress: data.progress?.stageProgress ?? data.lesson?.stageProgress ?? [],
          progressPercent: data.progress?.progressPercent ?? data.lesson?.progressPercent ?? 0,
        })
        setBlocks(data.blocks || [])
        setCurrentStageIndex(
          data.progress?.status === 'completed'
            ? 0
            : (data.progress?.currentStageIndex ?? data.lesson?.currentStageIndex ?? 0),
        )
        setCurrentStageBlockIndex(0)
        setIsRetryMode(false)
        setRetryRound(0)
        setRetryQueue([])
        setNextRetryQueue([])
        setRetryPosition(0)
        setIsStageIntro(false)
        setIsStageComplete(false)
        setStageStartedAt(Date.now())
        setSelectedAnswer(null)
        setSelectedWords([])
        setSelectedMatchingLeftId(null)
        setSelectedMatches({})
        setIsAnswered(false)
        setIsCorrect(false)
        setIsListening(false)
        setIsPlayingPrompt(false)
        setXpEarned(0)
        setMistakesCount(0)
        setStageMistakesCount(0)
        setStageTransitionCopy(null)
        resetSpeakingState()
      })
      .catch((error) => {
        console.error('Failed to load lesson flow', error)
        onLoadError?.(error)
      })
      .finally(() => setIsLoading(false))
  }, [clearStageAdvanceTimeout, lessonId, loadFlow, onLoadError, resetSpeakingState])

  useEffect(() => {
    resetSpeakingState()
    return () => {
      stopSpeechCapture()
    }
  }, [blocks, currentStageIndex, currentStageBlockIndex, isRetryMode, retryPosition, resetSpeakingState, stopSpeechCapture])

  useEffect(() => {
    return () => {
      clearStageAdvanceTimeout()
    }
  }, [clearStageAdvanceTimeout])

  useEffect(() => {
    const updateViewportHeight = () => setViewportHeight(window.innerHeight)
    updateViewportHeight()
    window.addEventListener('resize', updateViewportHeight)
    window.addEventListener('orientationchange', updateViewportHeight)
    return () => {
      window.removeEventListener('resize', updateViewportHeight)
      window.removeEventListener('orientationchange', updateViewportHeight)
    }
  }, [])

  useEffect(() => {
    if (!enableUiSounds) return
    Object.values(SOUNDS).forEach((src) => {
      const audio = new Audio(src)
      audio.preload = 'auto'
      audio.load()
    })
  }, [enableUiSounds])

  useEffect(() => {
    if (!lesson?.language || !culturalSoundResolver) return
    ;(['celebration', 'proverb'] as const).forEach((cue) => {
      const audio = new Audio(culturalSoundResolver(lesson.language, cue))
      audio.preload = 'auto'
      audio.load()
    })
  }, [culturalSoundResolver, lesson?.language])

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
  const progress =
    currentStage && currentStage.blockCount > 0
      ? Math.min(100, Math.round((completedStageBlockCount / currentStage.blockCount) * 100))
      : 0
  const isExerciseBlock = currentBlock?.type === 'question'
  const exerciseData: ExerciseQuestion | null = isExerciseBlock ? currentBlock.data : null
  const isListeningQuestion = Boolean(isExerciseBlock && exerciseData?.type === 'listening')
  const isMatchingQuestion = Boolean(isExerciseBlock && exerciseData?.type === 'matching')
  const isSpeakingQuestion = Boolean(isExerciseBlock && exerciseData?.type === 'speaking')
  const isContextResponseQuestion = Boolean(exerciseData?.subtype === 'mc-select-context-response')
  const isWordOrderQuestion = Boolean(
    exerciseData?.subtype === 'fg-word-order' ||
      exerciseData?.subtype === 'ls-fg-word-order' ||
      exerciseData?.subtype === 'fg-letter-order',
  )
  const isChoiceQuestion = Boolean(
    exerciseData &&
      !isWordOrderQuestion &&
      (exerciseData.type === 'multiple-choice' ||
        exerciseData.type === 'listening' ||
        exerciseData.subtype === 'fg-gap-fill' ||
        exerciseData.subtype === 'ls-fg-gap-fill'),
  )
  const matchingFallback = useMemo(() => buildMatchingFallbackItems(exerciseData), [exerciseData])
  const matchingLeftItems: QuestionMatchingDisplayItem[] =
    exerciseData?.interactionData?.leftItems?.length ? exerciseData.interactionData.leftItems : matchingFallback.leftItems
  const matchingRightItems: QuestionMatchingDisplayItem[] =
    exerciseData?.interactionData?.rightItems?.length ? exerciseData.interactionData.rightItems : matchingFallback.rightItems
  const questionSource = exerciseData?.source || null
  const currentContentKind = currentBlock?.type === 'content' ? currentBlock.data?.kind || 'expression' : null
  const currentContentEyebrow =
    currentContentKind === 'sentence'
      ? 'Sentence Practice'
      : currentContentKind === 'word'
        ? 'Word Focus'
        : 'New Expression'
  const sourceText = questionSource?.text || ''
  const promptText = exerciseData?.promptTemplate || exerciseData?.prompt || 'Choose the right answer'
  const isShortViewport = viewportHeight !== null && viewportHeight <= 860
  const isVeryShortViewport = viewportHeight !== null && viewportHeight <= 740
  const isUltraShortViewport = viewportHeight !== null && viewportHeight <= 680
  const meaningText =
    exerciseData?.reviewData?.meaning ||
    exerciseData?.interactionData?.meaning ||
    questionSource?.selectedTranslation ||
    questionSource?.translations?.[0] ||
    ''
  const sentenceText = exerciseData?.reviewData?.sentence || exerciseData?.interactionData?.sentence || ''
  const renderedPrompt = replacePromptToken(
    replacePromptToken(replacePromptToken(promptText, '{phrase}', sourceText), '{meaning}', meaningText),
    '{sentence}',
    sentenceText,
  )
  const interactionWords: string[] = exerciseData?.interactionData?.words || exerciseData?.reviewData?.words || []
  const correctOrder: number[] =
    exerciseData?.interactionData?.correctOrder || exerciseData?.reviewData?.correctOrder || []
  const listeningAudioUrl = isListeningQuestion ? questionSource?.audio?.url : undefined
  const questionSentenceText =
    questionSource?.kind === 'sentence' ? questionSource.text || sentenceText : sentenceText || ''
  const questionSentenceComponents =
    questionSource?.kind === 'sentence' && Array.isArray(questionSource.components) ? questionSource.components : []
  const questionSentenceAudioUrl = questionSource?.kind === 'sentence' ? questionSource.audio?.url : undefined
  const inlineSourceComponent =
    questionSource && questionSource.kind && questionSource.kind !== 'sentence'
      ? {
          id: questionSource.id || questionSource._id,
          kind: questionSource.kind,
          text: questionSource.text,
          translations: questionSource.translations || [],
          selectedTranslation: questionSource.selectedTranslation || questionSource.translations?.[0] || '',
          selectedTranslationIndex: questionSource.selectedTranslationIndex || 0,
          pronunciation: questionSource.pronunciation,
          explanation: questionSource.explanation,
          audio: questionSource.audio,
        }
      : null
  const speakingTarget: SpeakingTarget | null =
    currentBlock?.type === 'content' &&
    currentBlock.data?.kind &&
    (currentBlock.data.id || currentBlock.data._id)
      ? {
          type: currentBlock.data.kind,
          id: currentBlock.data.id || currentBlock.data._id,
          text: currentBlock.data.text,
          audioUrl: currentBlock.data.audio?.url,
        }
      : questionSource?.kind && (questionSource.id || questionSource._id)
        ? {
            type: questionSource.kind,
            id: questionSource.id || questionSource._id,
            text: questionSource.text,
            audioUrl: questionSource.audio?.url,
          }
        : null
  const hasSpeakingReference = Boolean(speakingTarget?.audioUrl)
  const canPracticeSpeaking = Boolean(onComparePronunciation && speakingTarget?.audioUrl)
  const renderedPromptParts =
    inlineSourceComponent && promptText.includes('{phrase}')
      ? promptText.split('{phrase}').map((part) =>
          replacePromptToken(replacePromptToken(part, '{meaning}', meaningText), '{sentence}', sentenceText),
        )
      : [renderedPrompt]
  const answerStatusLabel = isSpeakingQuestion
    ? isCorrect
      ? 'Nice contour match'
      : 'Try another take in the retry round'
    : isCorrect
      ? 'Correct!'
      : 'Try this one again'
  const stageBlockPositionLabel = currentStage
    ? `${Math.min(activeStageBlockIndex + 1, Math.max(currentStage.blockCount, 1))} / ${Math.max(
        currentStage.blockCount,
        1,
      )}`
    : '0 / 0'
  const listeningHeading = getListeningHeading(exerciseData?.subtype)
  const listeningSupportText = getListeningSupportText(exerciseData?.subtype)
  const choiceSupportText = getChoiceSupportText(exerciseData?.subtype)
  const listeningPromptDetail = getListeningPromptDetail(
    exerciseData?.subtype,
    sentenceText,
    meaningText,
    renderedPrompt,
  )
  const orderPromptPlaceholder =
    exerciseData?.subtype === 'fg-letter-order' ? 'Select letters below' : 'Select words below'
  const stageQuestionCount = currentStageBlocks.filter((block) => block.type === 'question').length
  const stageXpEarned = stageQuestionCount * XP_PER_BLOCK
  const isLastStage = currentStageIndex >= stageMeta.length - 1
  const speakingScoreTone =
    speakingFeedback?.level === 'excellent'
      ? 'text-emerald-700'
      : speakingFeedback?.level === 'good'
        ? 'text-green-700'
        : speakingFeedback?.level === 'fair'
          ? 'text-amber-700'
          : 'text-red-700'

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
    clearStageAdvanceTimeout()
    setCurrentStageBlockIndex(0)
    setIsRetryMode(false)
    setRetryRound(0)
    setRetryQueue([])
    setNextRetryQueue([])
    setRetryPosition(0)
    setStageMistakesCount(0)
    setStageQuestionResults({})
    setIsStageComplete(false)
    setStageTransitionCopy(null)
    setStageStartedAt(null)
    resetAnswerState()
    resetSpeakingState()
  }, [clearStageAdvanceTimeout, resetAnswerState, resetSpeakingState])

  const canCheck = useMemo(() => {
    if (!isExerciseBlock || isAnswered) return false
    if (isSpeakingQuestion) return false
    if (isMatchingQuestion) {
      return matchingLeftItems.length > 1 && matchingLeftItems.every((item) => selectedMatches[item.id])
    }
    return selectedOption !== null || selectedWords.length > 0
  }, [isAnswered, isExerciseBlock, isMatchingQuestion, isSpeakingQuestion, matchingLeftItems, selectedMatches, selectedOption, selectedWords.length])

  const playFeedbackSound = useCallback(
    (type: 'correct' | 'incorrect') => {
      playUiAudio(SOUNDS[type], 0.4)
    },
    [playUiAudio],
  )

  const playClick = useCallback(() => {
    playUiAudio(SOUNDS.click, 0.3)
  }, [playUiAudio])

  const registerExerciseEvaluation = useCallback(
    (correct: boolean) => {
      setIsCorrect(correct)
      setIsAnswered(true)
      playFeedbackSound(correct ? 'correct' : 'incorrect')

      if (exerciseData) {
        const sourceType = exerciseData.sourceType || exerciseData.source?.kind
        const sourceId = exerciseData.sourceId || exerciseData.source?._id
        if (sourceType && sourceId) {
          const resultKey = String(activeStageBlockIndex)
          setStageQuestionResults((prev) => {
            const current = prev[resultKey]
            const nextAttempts = Math.max(1, (current?.attempts || 0) + 1)
            const nextIncorrectAttempts = (current?.incorrectAttempts || 0) + (correct ? 0 : 1)
            return {
              ...prev,
              [resultKey]: {
                questionId: exerciseData._id,
                sourceType,
                sourceId,
                questionType: exerciseData.type,
                questionSubtype: exerciseData.subtype,
                attempts: nextAttempts,
                incorrectAttempts: nextIncorrectAttempts,
                correct,
              },
            }
          })
        }
      }

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
    },
    [activeStageBlockIndex, appendUnique, currentStageBlockIndex, exerciseData, isRetryMode, playFeedbackSound, retryPosition, retryQueue],
  )

  const playUiSound = useCallback(
    (type: 'stageStart' | 'stageComplete' | 'continue') => {
      playUiAudio(SOUNDS[type], 0.35)
    },
    [playUiAudio],
  )

  const getMatchingRightItem = useCallback(
    (rightId: string) => {
      return matchingRightItems.find((item) => item.id === rightId) || null
    },
    [matchingRightItems],
  )

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
        [selectedMatchingLeftId]: rightId,
      }
    })
    setSelectedMatchingLeftId(null)
  }

  const handleAdvanceStage = useCallback(() => {
    clearStageAdvanceTimeout()
    playUiSound('continue')
    if (isLastStage) {
      if (onLessonComplete) {
        onLessonComplete({ lessonId, xpEarned, language: lesson?.language })
      } else {
        onExit()
      }
      return
    }

    setCurrentStageIndex((prev) => prev + 1)
    resetStageState()
    setIsStageIntro(false)
    setStageStartedAt(Date.now())
    playUiSound('stageStart')
  }, [clearStageAdvanceTimeout, isLastStage, lesson?.language, lessonId, onExit, onLessonComplete, playUiSound, resetStageState, xpEarned])

  const completeCurrentStage = useCallback(async () => {
    if (!lessonId || !currentStage) return
    const elapsedMs = stageStartedAt ? Date.now() - stageStartedAt : 0
    const minutesSpent = Math.max(1, Math.round(elapsedMs / 60000))
    playUiSound('stageComplete')
    setIsStageComplete(true)
    setStageTransitionCopy(
      buildStageTransitionCopy({
        mistakesCount: stageMistakesCount,
        stageNumber: currentStageIndex + 1,
        totalStages: Math.max(stageMeta.length, 1),
        isLastStage,
        preview,
      }),
    )
    resetAnswerState()

    if (!onCompleteStage) {
      clearStageAdvanceTimeout()
      stageAdvanceTimeoutRef.current = setTimeout(() => {
        handleAdvanceStage()
      }, isLastStage ? 1600 : 1400)
      return
    }

    setIsSavingStage(true)
    try {
      const result = await onCompleteStage(lessonId, currentStageIndex, {
        xpEarned: stageXpEarned,
        minutesSpent,
        questionResults: Object.values(stageQuestionResults),
      })
      if (result) {
        setLesson((prevLesson) =>
          prevLesson
            ? {
                ...prevLesson,
                currentStageIndex: result.currentStageIndex,
                stageProgress: result.stageProgress,
                progressPercent: result.progressPercent,
                status: result.status === 'completed' ? 'published' : prevLesson.status,
              }
            : prevLesson,
        )
      }
    } catch (error) {
      console.error('Failed to save stage progress', error)
    } finally {
      setIsSavingStage(false)
      clearStageAdvanceTimeout()
      stageAdvanceTimeoutRef.current = setTimeout(() => {
        handleAdvanceStage()
      }, isLastStage ? 1600 : 1400)
    }
  }, [
    clearStageAdvanceTimeout,
    currentStage,
    currentStageIndex,
    handleAdvanceStage,
    isLastStage,
    lessonId,
    onCompleteStage,
    playUiSound,
    preview,
    resetAnswerState,
    stageMeta.length,
    stageMistakesCount,
    stageQuestionResults,
    stageStartedAt,
    stageXpEarned,
  ])

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
    registerExerciseEvaluation(correct)
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

  const startSpeakingRecording = useCallback(async () => {
    if (!canPracticeSpeaking || typeof window === 'undefined') return
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setSpeakingError('Audio recording is not supported in this browser.')
      return
    }

    resetSpeakingState()

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      mediaStreamRef.current = stream
      mediaRecorderRef.current = recorder
      mediaChunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          mediaChunksRef.current.push(event.data)
        }
      }

      recorder.onstop = () => {
        const blob = new Blob(mediaChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        mediaChunksRef.current = []
        if (blob.size > 0) {
          const nextUrl = URL.createObjectURL(blob)
          setRecordedSpeechBlob(blob)
          setRecordedSpeechUrl((current) => {
            if (current) URL.revokeObjectURL(current)
            return nextUrl
          })
        }
        stopSpeechCapture()
      }

      recorder.start()
      setSpeakingError('')
      setIsRecordingSpeech(true)
    } catch (error) {
      console.error('Failed to start speaking recorder', error)
      stopSpeechCapture()
      setSpeakingError('Could not access microphone.')
    }
  }, [canPracticeSpeaking, resetSpeakingState, stopSpeechCapture])

  const stopSpeakingRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
      return
    }
    stopSpeechCapture()
  }, [stopSpeechCapture])

  const submitSpeakingAttempt = useCallback(async () => {
    if (!speakingTarget || !recordedSpeechBlob || !onComparePronunciation) return

    setIsComparingSpeech(true)
    setSpeakingError('')

    try {
      const base64 = await blobToBase64(recordedSpeechBlob)
      const result = await onComparePronunciation(speakingTarget.type, speakingTarget.id, {
        audioUpload: {
          base64,
          mimeType: recordedSpeechBlob.type || 'audio/webm',
        },
      })
      setSpeakingFeedback(result.comparison)
      registerExerciseEvaluation(result.comparison.level !== 'poor')
    } catch (error) {
      console.error('Failed to compare pronunciation', error)
      const message = error instanceof Error && error.message ? error.message : 'Pronunciation check failed.'
      setSpeakingError(message)
      setSpeakingFeedback(null)
    } finally {
      setIsComparingSpeech(false)
    }
  }, [onComparePronunciation, recordedSpeechBlob, registerExerciseEvaluation, speakingTarget])

  useEffect(() => {
    if (isStageComplete || currentBlock?.type !== 'proverb' || !lesson?.language || !culturalSoundResolver) {
      return
    }
    const audio = new Audio(culturalSoundResolver(lesson.language, 'proverb'))
    audio.volume = 0.42
    audio.play().catch(() => {})
  }, [currentBlock, culturalSoundResolver, isStageComplete, lesson?.language])

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
        <div className="mb-4 h-16 w-16 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="animate-pulse text-xl font-bold text-foreground/60">{loadingMessage}</p>
      </div>
    )
  }

  if (!currentStage || (!currentBlock && !isStageComplete)) {
    return <div className="flex min-h-screen items-center justify-center">{emptyMessage}</div>
  }

  return (
    <main className="relative flex h-[100svh] select-none flex-col overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(248,196,113,0.14),transparent_45%),radial-gradient(circle_at_bottom_left,rgba(239,162,129,0.1),transparent_50%)]" />

      <header
        className={cx(
          'sticky top-0 z-50 shrink-0 border-b border-border/40 bg-background/95 px-4 backdrop-blur',
          isShortViewport && 'px-3',
        )}
      >
        <div
          className={cx(
            'mx-auto flex w-full max-w-4xl items-center gap-3',
            isUltraShortViewport ? 'h-14 gap-2' : isShortViewport ? 'h-16 gap-2.5' : 'h-20',
          )}
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={onExit}
            className={cx(
              'rounded-full text-foreground/50 hover:bg-muted/80 hover:text-foreground',
              isUltraShortViewport ? 'h-8 w-8' : isShortViewport && 'h-9 w-9',
            )}
            aria-label={preview ? 'Exit preview' : 'Exit lesson'}
          >
            <X className={cx(isUltraShortViewport ? 'h-5 w-5' : isShortViewport ? 'h-6 w-6' : 'h-7 w-7')} />
          </Button>

          <div className="flex-1 space-y-1.5">
            <div
              className={cx(
                'flex items-center justify-between font-bold uppercase tracking-wide text-foreground/50',
                isUltraShortViewport ? 'text-[9px]' : isShortViewport ? 'text-[10px]' : 'text-xs',
              )}
            >
              <span>
                {lesson?.title || 'Lesson'} • Stage {currentStageIndex + 1} of {Math.max(stageMeta.length, 1)}
              </span>
              {!isVeryShortViewport ? <span>{isStageComplete ? 'Stage complete' : stageBlockPositionLabel}</span> : null}
            </div>
            <div className={cx('relative overflow-hidden rounded-full bg-muted', isUltraShortViewport ? 'h-2' : isShortViewport ? 'h-2.5' : 'h-3')}>
              <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/10 via-transparent to-white/20" />
            </div>
          </div>

          {!isUltraShortViewport ? (
            <div
              className={cx(
                'rounded-full border border-primary/30 bg-primary/10 font-black text-primary',
                isShortViewport ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1 text-xs',
              )}
            >
              {xpEarned} XP
            </div>
          ) : null}
        </div>
      </header>

      <div
        className={cx(
          'relative z-10 flex-1 overflow-y-auto px-4 sm:px-6',
          isUltraShortViewport ? 'pb-24 pt-2' : isShortViewport ? 'pb-26 pt-3' : 'pb-32 pt-6',
        )}
      >
        <div className="mx-auto flex h-full w-full max-w-2xl flex-col">
          {isStageIntro ? (
            <section className="hidden">
              <div className="w-full rounded-[2rem] border border-primary/15 bg-white/95 p-8 text-center shadow-sm sm:p-10">
                <p className="text-xs font-black uppercase tracking-[0.3em] text-primary/60">Stage {currentStageIndex + 1}</p>
                <h2 className="mt-4 text-3xl font-black text-foreground sm:text-4xl">{currentStage.title}</h2>
                {currentStage.description ? (
                  <p className="mx-auto mt-4 max-w-xl text-base font-medium leading-relaxed text-foreground/65">
                    {currentStage.description}
                  </p>
                ) : null}
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
                    {preview ? 'Review the lesson exactly as a learner would see it.' : 'One stage at a time. Finish this stage before moving on.'}
                  </p>
                </div>
              </div>
            </section>
          ) : (
            <>
              {currentBlock.type === 'text' ? (
                <section className={cx('animate-in fade-in zoom-in-95 duration-500', isUltraShortViewport ? 'space-y-3 py-2' : isShortViewport ? 'space-y-4 py-3' : 'space-y-6 py-4')}>
                  <div className={cx('rounded-3xl border border-blue-100 bg-white/90 shadow-sm', isUltraShortViewport ? 'p-3.5' : isShortViewport ? 'p-4' : 'p-6')}>
                    <div className={cx('flex items-center gap-3', isUltraShortViewport ? 'mb-3' : 'mb-5')}>
                      <div className={cx('flex items-center justify-center rounded-2xl bg-blue-500 text-white', isUltraShortViewport ? 'h-10 w-10' : 'h-12 w-12')}>
                        <Info className={cx(isUltraShortViewport ? 'h-5 w-5' : 'h-6 w-6')} />
                      </div>
                      <div>
                        <h2 className={cx('font-black text-foreground', isUltraShortViewport ? 'text-lg' : isShortViewport ? 'text-xl' : 'text-2xl')}>Teacher&apos;s Note</h2>
                        {!isUltraShortViewport ? <p className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground/45">Context</p> : null}
                      </div>
                    </div>
                    <p
                      className={cx(
                        'rounded-2xl bg-blue-50 font-medium leading-relaxed text-foreground/85',
                        isUltraShortViewport ? 'p-3 text-sm' : isShortViewport ? 'p-4 text-base' : 'p-6 text-lg',
                      )}
                    >
                      {currentBlock.content}
                    </p>
                  </div>
                </section>
              ) : null}

              {currentBlock.type === 'content' ? (
                <section
                  className={cx(
                    'animate-in fade-in slide-in-from-bottom-6 duration-500',
                    isUltraShortViewport ? 'space-y-4 py-2' : isShortViewport ? 'space-y-5 py-3' : 'space-y-8 py-4',
                  )}
                >
                  <div className="text-center">
                    <p className={cx('font-black uppercase tracking-[0.3em] text-foreground/45', isUltraShortViewport ? 'text-[9px]' : isShortViewport ? 'text-[10px]' : 'text-xs')}>
                      {currentContentEyebrow}
                    </p>
                  </div>

                  <div
                    className={cx(
                      'rounded-[2rem] border border-primary/10 bg-white/90 shadow-sm',
                      isUltraShortViewport ? 'space-y-4 p-3.5 sm:p-4' : isShortViewport ? 'space-y-5 p-4 sm:p-5' : 'space-y-8 p-6 sm:p-10',
                    )}
                  >
                    <div className="flex justify-center gap-3">
                      <Button
                        size="lg"
                        className={cx(
                          'rounded-2xl p-0 shadow-md shadow-primary/30 transition-transform hover:scale-105',
                          isUltraShortViewport ? 'h-11 w-11' : isShortViewport ? 'h-14 w-14' : 'h-16 w-16',
                        )}
                        onClick={() => {
                          playClick()
                          playAudioUrl(currentBlock.data?.audio?.url)
                        }}
                      >
                        <Volume2 className="h-7 w-7" />
                      </Button>
                      <Button
                        size="lg"
                        variant="outline"
                        className={cx(
                          'rounded-2xl border-2 border-border bg-background p-0 text-foreground/60',
                          isUltraShortViewport ? 'h-11 w-11' : isShortViewport ? 'h-14 w-14' : 'h-16 w-16',
                        )}
                        onClick={() => {
                          playClick()
                          playAudioUrl(currentBlock.data?.audio?.url, 0.6)
                        }}
                      >
                        <Turtle className="h-7 w-7" />
                      </Button>
                    </div>

                    <div className="space-y-3 text-center">
                      {currentBlock.data.kind === 'sentence' && Array.isArray(currentBlock.data.components) && currentBlock.data.components.length > 0 ? (
                        <SentenceContentDisplay
                          text={currentBlock.data.text}
                          components={currentBlock.data.components}
                          audioUrl={currentBlock.data.audio?.url}
                        />
                      ) : (
                        <div className="flex items-start justify-center gap-3">
                          <h3 className={cx('font-black tracking-tight text-primary', isUltraShortViewport ? 'text-[1.7rem] leading-tight sm:text-3xl' : isShortViewport ? 'text-3xl leading-tight sm:text-4xl' : 'text-4xl sm:text-5xl')}>
                            {currentBlock.data.text}
                          </h3>
                          <InlineAudioButton
                            audioUrl={currentBlock.data.audio?.url}
                            label={currentBlock.data.text}
                            className={cx('mt-1 shrink-0', isUltraShortViewport ? 'h-8 w-8' : 'h-9 w-9')}
                          />
                        </div>
                      )}
                      {currentBlock.data.pronunciation ? (
                        <p className={cx('font-semibold italic text-foreground/45', isUltraShortViewport ? 'text-sm' : isShortViewport ? 'text-base' : 'text-lg')}>
                          {currentBlock.data.pronunciation}
                        </p>
                      ) : null}
                    </div>

                    <div className="h-px w-full bg-border" />

                    <p className={cx('text-center font-black text-foreground/80', isUltraShortViewport ? 'text-lg' : isShortViewport ? 'text-xl' : 'text-2xl')}>
                      {currentBlock.data.selectedTranslation || currentBlock.data.translations?.[0] || ''}
                    </p>
                  </div>

                </section>
              ) : null}

              {currentBlock.type === 'proverb' ? (
                <section
                  className={cx(
                    'animate-in fade-in slide-in-from-bottom-6 duration-500',
                    isUltraShortViewport ? 'space-y-4 py-2' : isShortViewport ? 'space-y-5 py-3' : 'space-y-8 py-4',
                  )}
                >
                  <div className="text-center">
                    <p className={cx('font-black uppercase tracking-[0.3em] text-amber-700/60', isUltraShortViewport ? 'text-[9px]' : isShortViewport ? 'text-[10px]' : 'text-xs')}>
                      Cultural Wisdom
                    </p>
                  </div>

                  <div
                    className={cx(
                      'relative overflow-hidden rounded-[2rem] border border-amber-200 bg-amber-50/80 shadow-sm',
                      isUltraShortViewport ? 'p-3.5 sm:p-4' : isShortViewport ? 'p-4 sm:p-5' : 'p-6 sm:p-10',
                    )}
                  >
                    <Quote className="absolute -left-1 -top-1 h-14 w-14 -rotate-12 text-amber-200/70" />
                    <div className="relative space-y-5">
                      <h3 className={cx('font-black leading-snug text-amber-900', isUltraShortViewport ? 'text-lg sm:text-xl' : isShortViewport ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl')}>
                        {currentBlock.data.text}
                      </h3>
                      <div className="h-px w-20 bg-amber-300" />
                      <p className={cx('font-semibold italic text-amber-900/75', isUltraShortViewport ? 'text-sm' : isShortViewport ? 'text-base' : 'text-lg')}>
                        {currentBlock.data.translation || ''}
                      </p>
                    </div>
                  </div>

                  {currentBlock.data.contextNote ? (
                    <div className="flex gap-3 rounded-2xl border border-secondary/30 bg-secondary/20 p-5">
                      <Info className="mt-0.5 h-5 w-5 shrink-0 text-secondary-foreground/70" />
                      <p className="text-sm font-medium leading-relaxed text-foreground/70">{currentBlock.data.contextNote}</p>
                    </div>
                  ) : null}
                </section>
              ) : null}

              {isExerciseBlock ? (
                <section
                  className={cx(
                    'animate-in fade-in duration-500',
                    isUltraShortViewport ? 'space-y-4 py-2' : isShortViewport ? 'space-y-5 py-3' : 'space-y-8 py-4',
                  )}
                >
                  <div
                    className={cx(
                      'rounded-3xl border border-border/70 bg-white/90 shadow-sm',
                      isUltraShortViewport ? 'space-y-2.5 p-3.5 sm:p-4' : isShortViewport ? 'space-y-3 p-4 sm:p-5' : 'space-y-4 p-6 sm:p-8',
                    )}
                  >
                    <h2 className={cx('font-black leading-tight text-foreground', isUltraShortViewport ? 'text-[1.05rem] sm:text-[1.2rem]' : isShortViewport ? 'text-[1.35rem] sm:text-[1.55rem]' : 'text-2xl sm:text-3xl')}>
                      {isListeningQuestion ? (
                        listeningHeading
                      ) : inlineSourceComponent && sourceText && renderedPromptParts.length > 1 ? (
                        renderedPromptParts.map((part, index) => (
                          <span key={`prompt-part-${index}`}>
                            {part}
                            {index < renderedPromptParts.length - 1 ? (
                              <InlineGlossToken label={sourceText} component={inlineSourceComponent} />
                            ) : null}
                          </span>
                        ))
                      ) : (
                        renderedPrompt
                      )}
                    </h2>

                    {isContextResponseQuestion && choiceSupportText ? (
                      <div className={cx('rounded-2xl border border-primary/15 bg-primary/5', isUltraShortViewport ? 'p-2.5' : isShortViewport ? 'p-3' : 'p-4')}>
                        {!isUltraShortViewport ? <p className="text-xs font-black uppercase tracking-[0.2em] text-primary/70">Context Choice</p> : null}
                        <p className={cx('font-semibold text-foreground/70', isUltraShortViewport ? 'text-[11px]' : isShortViewport ? 'mt-1 text-xs' : 'mt-1 text-sm')}>
                          {choiceSupportText}
                        </p>
                      </div>
                    ) : null}

                    {!isListeningQuestion && !isSpeakingQuestion && questionSentenceText ? (
                      <div className={cx('rounded-3xl border border-primary/15 bg-primary/5', isUltraShortViewport ? 'p-3 sm:p-4' : isShortViewport ? 'p-4 sm:p-5' : 'p-5 sm:p-6')}>
                        {questionSentenceComponents.length > 0 ? (
                          <SentenceContentDisplay
                            text={questionSentenceText}
                            components={questionSentenceComponents}
                            audioUrl={questionSentenceAudioUrl}
                          />
                        ) : (
                          <div className="flex items-start justify-center gap-3">
                            <p className={cx('text-center font-black leading-relaxed text-primary', isUltraShortViewport ? 'text-lg sm:text-xl' : isShortViewport ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl')}>
                              {questionSentenceText}
                            </p>
                            <InlineAudioButton
                              audioUrl={questionSentenceAudioUrl}
                              label={questionSentenceText}
                              className={cx('mt-1 shrink-0', isUltraShortViewport ? 'h-8 w-8' : 'h-9 w-9')}
                            />
                          </div>
                        )}
                      </div>
                    ) : null}

                    {isListeningQuestion ? (
                      <div
                        className={cx(
                          'mt-2 rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-white to-secondary/25',
                          isUltraShortViewport ? 'p-3 sm:p-4' : isShortViewport ? 'p-4 sm:p-5' : 'p-5 sm:p-6',
                        )}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div>
                            <p className="text-xs font-black uppercase tracking-[0.2em] text-primary/70">Listening Challenge</p>
                            {!isShortViewport ? <p className="mt-1 text-sm font-semibold text-foreground/65">{listeningSupportText}</p> : null}
                          </div>
                          <div className="flex gap-3">
                            <Button
                              size="lg"
                              className={cx('rounded-2xl p-0 shadow-md shadow-primary/25', isUltraShortViewport ? 'h-11 w-11' : isShortViewport ? 'h-14 w-14' : 'h-16 w-16')}
                              onClick={() => {
                                if (!listeningAudioUrl) return
                                playClick()
                                setIsPlayingPrompt(true)
                                playAudioUrl(listeningAudioUrl, 1, () => setIsPlayingPrompt(false))
                              }}
                              disabled={!listeningAudioUrl}
                              aria-label="Play listening prompt audio"
                            >
                              <Volume2 className={cx('h-7 w-7', isPlayingPrompt && 'animate-pulse')} />
                            </Button>
                            <Button
                              size="lg"
                              variant="outline"
                              className={cx('rounded-2xl border-2 border-border p-0 text-foreground/55', isUltraShortViewport ? 'h-11 w-11' : isShortViewport ? 'h-14 w-14' : 'h-16 w-16')}
                              onClick={() => {
                                playClick()
                                playAudioUrl(listeningAudioUrl, 0.6)
                              }}
                              disabled={!listeningAudioUrl}
                              aria-label="Play listening prompt audio slowly"
                            >
                              <Turtle className="h-7 w-7" />
                            </Button>
                          </div>
                        </div>
                        {!listeningAudioUrl ? (
                          <p className="mt-3 text-sm font-semibold text-red-600">No audio available for this item yet.</p>
                        ) : null}
                        {listeningPromptDetail ? (
                          <div className={cx('mt-4 rounded-2xl border border-border/50 bg-white/85 shadow-sm', isShortViewport ? 'px-3 py-2.5' : 'px-4 py-3')}>
                            <p className="text-xs font-black uppercase tracking-[0.22em] text-foreground/45">Your prompt</p>
                            <p className={cx('mt-2 font-bold leading-relaxed text-foreground', isUltraShortViewport ? 'text-sm' : isShortViewport ? 'text-base' : 'text-lg')}>
                              {listeningPromptDetail}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {isSpeakingQuestion && speakingTarget ? (
                      <div className={cx('rounded-3xl border border-secondary/20 bg-secondary/10', isUltraShortViewport ? 'p-3' : isShortViewport ? 'p-4' : 'p-5')}>
                        <div className="space-y-5">
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                              <p className="text-xs font-black uppercase tracking-[0.2em] text-foreground/45">Speaking Practice</p>
                              <p className={cx('mt-1 font-semibold text-foreground/65', isUltraShortViewport ? 'text-[11px]' : isShortViewport ? 'text-xs' : 'text-sm')}>
                                Listen first, then record your own take for comparison.
                              </p>
                            </div>
                            <div className="flex gap-3">
                              <Button
                                size="lg"
                                className={cx('rounded-2xl p-0 shadow-md shadow-primary/25', isUltraShortViewport ? 'h-10 w-10' : isShortViewport ? 'h-12 w-12' : 'h-14 w-14')}
                                onClick={() => {
                                  if (!speakingTarget.audioUrl) return
                                  playClick()
                                  playAudioUrl(speakingTarget.audioUrl)
                                }}
                                disabled={!speakingTarget.audioUrl}
                                aria-label="Play speaking reference audio"
                              >
                                <Volume2 className="h-6 w-6" />
                              </Button>
                              <Button
                                size="lg"
                                variant="outline"
                                className={cx('rounded-2xl border-2 border-border p-0 text-foreground/55', isUltraShortViewport ? 'h-10 w-10' : isShortViewport ? 'h-12 w-12' : 'h-14 w-14')}
                                onClick={() => {
                                  if (!speakingTarget.audioUrl) return
                                  playClick()
                                  playAudioUrl(speakingTarget.audioUrl, 0.6)
                                }}
                                disabled={!speakingTarget.audioUrl}
                                aria-label="Play speaking reference audio slowly"
                              >
                                <Turtle className="h-6 w-6" />
                              </Button>
                            </div>
                          </div>

                          <div className={cx('rounded-3xl border border-primary/15 bg-white/90', isUltraShortViewport ? 'p-3 sm:p-4' : isShortViewport ? 'p-4 sm:p-5' : 'p-5 sm:p-6')}>
                            {questionSource?.kind === 'sentence' && questionSentenceComponents.length > 0 ? (
                              <SentenceContentDisplay
                                text={questionSentenceText}
                                components={questionSentenceComponents}
                                audioUrl={questionSentenceAudioUrl}
                              />
                            ) : (
                              <div className="flex items-start justify-center gap-3">
                                <p className={cx('text-center font-black leading-relaxed text-primary', isUltraShortViewport ? 'text-lg sm:text-xl' : isShortViewport ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl')}>
                                  {speakingTarget.text}
                                </p>
                                <InlineAudioButton
                                  audioUrl={speakingTarget.audioUrl}
                                  label={speakingTarget.text}
                                  className={cx('mt-1 shrink-0', isUltraShortViewport ? 'h-8 w-8' : 'h-9 w-9')}
                                />
                              </div>
                            )}
                            {meaningText ? (
                              <p className={cx('mt-4 text-center font-semibold text-foreground/55', isUltraShortViewport ? 'text-xs' : isShortViewport ? 'text-sm' : 'text-base')}>
                                {meaningText}
                              </p>
                            ) : null}
                          </div>

                          <div className="flex flex-wrap gap-3">
                            <Button
                              variant={isRecordingSpeech ? 'default' : 'outline'}
                              className={cx(
                                'rounded-2xl border-2 font-bold',
                                isUltraShortViewport ? 'h-10 px-3 text-xs' : 'h-11 px-4 text-sm',
                                isRecordingSpeech ? 'bg-red-600 text-white hover:bg-red-700' : 'border-border bg-white/80 text-foreground/70',
                              )}
                              onClick={() => {
                                playClick()
                                if (isRecordingSpeech) {
                                  stopSpeakingRecording()
                                } else {
                                  void startSpeakingRecording()
                                }
                              }}
                              disabled={!canPracticeSpeaking || isComparingSpeech || isAnswered}
                            >
                              <Mic className={cx('h-5 w-5', isRecordingSpeech && 'fill-current')} />
                              {isRecordingSpeech ? 'Stop' : 'Record'}
                            </Button>
                            <Button
                              variant="outline"
                              className={cx('rounded-2xl border-2 border-border bg-white/80 font-bold text-foreground/70', isUltraShortViewport ? 'h-10 px-3 text-xs' : 'h-11 px-4 text-sm')}
                              onClick={() => {
                                playClick()
                                if (recordedSpeechUrl) playAudioUrl(recordedSpeechUrl)
                              }}
                              disabled={!recordedSpeechUrl || isRecordingSpeech}
                            >
                              <Volume2 className="h-5 w-5" />
                              Replay
                            </Button>
                            <Button
                              className={cx('rounded-2xl font-bold', isUltraShortViewport ? 'h-10 px-3 text-xs' : 'h-11 px-4 text-sm')}
                              onClick={() => {
                                playClick()
                                void submitSpeakingAttempt()
                              }}
                              disabled={!canPracticeSpeaking || !recordedSpeechBlob || isRecordingSpeech || isComparingSpeech || isAnswered}
                            >
                              {isComparingSpeech ? 'Comparing...' : 'Check Tone'}
                            </Button>
                          </div>

                          {!hasSpeakingReference ? (
                            <p className="text-sm font-semibold text-red-600">Reference audio is not available for this speaking question yet.</p>
                          ) : null}

                          {!canPracticeSpeaking && hasSpeakingReference ? (
                            <p className="text-sm font-semibold text-foreground/60">
                              Speaking comparison is available in the learner study flow.
                            </p>
                          ) : null}

                          {speakingError ? (
                            <p className="text-sm font-semibold text-red-600">{speakingError}</p>
                          ) : null}

                          {speakingFeedback ? (
                            <div className={cx('rounded-2xl border border-border/60 bg-white/90', isUltraShortViewport ? 'p-3' : 'p-4')}>
                              <p className={cx('font-black capitalize', speakingScoreTone, isUltraShortViewport ? 'text-base' : 'text-lg')}>
                                {speakingFeedback.score}% · {speakingFeedback.level}
                              </p>
                              <p className={cx('mt-1 font-semibold text-foreground/60', isUltraShortViewport ? 'text-xs' : 'text-sm')}>
                                DTW {speakingFeedback.normalizedDistance.toFixed(2)} · Duration x{speakingFeedback.durationRatio.toFixed(2)}
                              </p>
                              <div className="mt-3 space-y-2">
                                {speakingFeedback.feedback.map((item, index) => (
                                  <p key={`question-speaking-feedback-${index}`} className={cx('font-medium leading-relaxed text-foreground/70', isUltraShortViewport ? 'text-xs' : 'text-sm')}>
                                    {item}
                                  </p>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {isChoiceQuestion ? (
                    <div className={cx('grid gap-3', (exerciseData?.options.length || 0) > 2 && 'sm:grid-cols-2')}>
                      {isContextResponseQuestion ? (
                        <p className="text-xs font-black uppercase tracking-[0.2em] text-foreground/45">Possible responses</p>
                      ) : null}
                      {exerciseData?.options.map((option: string, idx: number) => (
                        <Button
                          key={idx}
                          variant="outline"
                          className={cx(
                            'h-auto justify-start rounded-2xl border-2 bg-white/90 text-left font-semibold transition-all',
                            isUltraShortViewport ? 'p-2.5 text-[13px] sm:text-sm' : isShortViewport ? 'p-3 text-sm sm:text-base' : 'p-4 text-base sm:p-5 sm:text-lg',
                            selectedOption === idx && !isAnswered && 'border-primary bg-primary/5 text-primary',
                            isAnswered && idx === exerciseData.correctIndex && 'border-green-500 bg-green-50 text-green-700',
                            isAnswered && selectedOption === idx && idx !== exerciseData.correctIndex && 'border-red-500 bg-red-50 text-red-700',
                          )}
                          onClick={() => {
                            if (isAnswered) return
                            setSelectedAnswer(idx)
                            playClick()
                          }}
                          disabled={isAnswered}
                        >
                          <span className={cx('mr-4 flex shrink-0 items-center justify-center rounded-lg bg-muted font-black', isUltraShortViewport ? 'h-7 w-7 text-xs' : 'h-8 w-8 text-sm')}>
                            {idx + 1}
                          </span>
                          {option}
                        </Button>
                      ))}
                    </div>
                  ) : null}

                  {isMatchingQuestion ? (
                    <div className={cx('grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]', isUltraShortViewport ? 'gap-2.5 lg:gap-3' : isShortViewport ? 'gap-3 lg:gap-4' : 'gap-4 lg:gap-6')}>
                      <div className="min-w-0 space-y-3">
                        <p className="text-xs font-black uppercase tracking-[0.25em] text-foreground/45">Expressions</p>
                        {matchingLeftItems.map((item) => {
                          const matchedRight = selectedMatches[item.id] ? getMatchingRightItem(selectedMatches[item.id]) : null
                          return (
                            <button
                              key={item.id}
                              type="button"
                              className={cx(
                                'w-full rounded-2xl border-2 bg-white/90 text-left transition-all',
                                isUltraShortViewport ? 'p-2 sm:p-2.5' : isShortViewport ? 'p-2.5 sm:p-3' : 'p-3 sm:p-4',
                                selectedMatchingLeftId === item.id && 'border-primary bg-primary/5 shadow-sm shadow-primary/10',
                                !selectedMatchingLeftId && matchedRight && 'border-emerald-300 bg-emerald-50',
                                isAnswered && selectedMatches[item.id] === item.id && 'border-green-500 bg-green-50',
                                isAnswered && selectedMatches[item.id] !== item.id && 'border-red-500 bg-red-50',
                              )}
                              onClick={() => handleSelectMatchingLeft(item.id)}
                              disabled={isAnswered}
                            >
                              <p className={cx('break-words font-black text-foreground', isUltraShortViewport ? 'text-[13px] sm:text-sm' : isShortViewport ? 'text-sm sm:text-base' : 'text-base sm:text-lg')}>
                                {item.label}
                              </p>
                              {matchedRight ? (
                                <p className={cx('mt-2 font-semibold text-foreground/55', isUltraShortViewport ? 'text-[11px]' : isShortViewport ? 'text-xs' : 'text-sm')}>
                                  Matched to: {matchedRight.label}
                                </p>
                              ) : null}
                            </button>
                          )
                        })}
                      </div>

                      <div className="hidden h-full items-center justify-center lg:flex">
                        <div className="h-px w-10 bg-border" />
                      </div>

                      <div className="min-w-0 space-y-3">
                        <p className="text-xs font-black uppercase tracking-[0.25em] text-foreground/45">
                          {exerciseData?.subtype === 'mt-match-image' ? 'Images' : 'Translations'}
                        </p>
                        {matchingRightItems.map((item) => {
                          const isUsed = Object.values(selectedMatches).includes(item.id)
                          return (
                            <button
                              key={item.id}
                              type="button"
                              className={cx(
                                'w-full rounded-2xl border-2 bg-white/90 text-left transition-all',
                                isUltraShortViewport ? 'p-2 sm:p-2.5' : isShortViewport ? 'p-2.5 sm:p-3' : 'p-3 sm:p-4',
                                selectedMatchingLeftId && 'hover:border-primary/60 hover:bg-primary/5',
                                isUsed && !selectedMatchingLeftId && 'border-emerald-300 bg-emerald-50',
                                isAnswered && isUsed && 'border-green-500 bg-green-50',
                              )}
                              onClick={() => handleSelectMatchingRight(item.id)}
                              disabled={isAnswered}
                            >
                              {item.image?.url ? (
                                <div className="space-y-3">
                                  <div className="overflow-hidden rounded-2xl border border-border/50 bg-muted/40">
                                    <img src={item.image.url} alt={item.image.altText} className={cx('w-full object-cover', isUltraShortViewport ? 'h-20 sm:h-24' : isShortViewport ? 'h-24 sm:h-32' : 'h-28 sm:h-40')} />
                                  </div>
                                  <p className={cx('font-semibold text-foreground/55', isUltraShortViewport ? 'text-[11px]' : isShortViewport ? 'text-xs' : 'text-sm')}>
                                    {item.image.altText}
                                  </p>
                                </div>
                              ) : (
                                <p className={cx('break-words font-black text-foreground', isUltraShortViewport ? 'text-[13px] sm:text-sm' : isShortViewport ? 'text-sm sm:text-base' : 'text-base sm:text-lg')}>
                                  {item.label}
                                </p>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}

                  {isWordOrderQuestion ? (
                    <div className={cx(isUltraShortViewport ? 'space-y-4' : isShortViewport ? 'space-y-5' : 'space-y-8')}>
                      <div className={cx('flex flex-wrap content-center items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-border bg-white/80', isUltraShortViewport ? 'min-h-[88px] p-3' : isShortViewport ? 'min-h-[112px] p-4' : 'min-h-[140px] p-5')}>
                        {selectedWords.length === 0 && !isAnswered ? (
                          <span className={cx('font-semibold uppercase tracking-wider text-foreground/35', isUltraShortViewport ? 'text-xs' : isShortViewport ? 'text-sm' : 'text-base')}>
                            {orderPromptPlaceholder}
                          </span>
                        ) : null}
                        {selectedWords.map((wordIdx, idx) => (
                          <Button
                            key={`${wordIdx}-${idx}`}
                            variant="secondary"
                            className={cx('rounded-xl font-black', isUltraShortViewport ? 'h-9 px-3 text-xs' : isShortViewport ? 'h-10 px-4 text-sm' : 'h-12 px-5 text-base')}
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
                              className={cx(
                                'rounded-xl border-2 font-black transition-all',
                                isUltraShortViewport ? 'h-9 px-3 text-xs' : isShortViewport ? 'h-10 px-4 text-sm' : 'h-12 px-5 text-base',
                                isUsed ? 'pointer-events-none opacity-25' : 'bg-white/90 hover:border-primary/60',
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
                  ) : null}
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>

      {isStageComplete && stageTransitionCopy ? (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-background/50 px-4 backdrop-blur-[3px]">
          <div
            className={cx(
              'relative w-full max-w-md overflow-hidden rounded-[2.2rem] border border-primary/15 bg-[linear-gradient(155deg,rgba(255,255,255,0.98),rgba(255,247,237,0.95))] text-center shadow-[0_24px_80px_rgba(15,23,42,0.18)]',
              isUltraShortViewport ? 'p-4 sm:p-5' : isShortViewport ? 'p-5 sm:p-6' : 'p-6 sm:p-8',
            )}
          >
            <div className="absolute -left-10 top-1/2 h-32 w-32 -translate-y-1/2 rounded-full bg-primary/15 blur-3xl animate-pulse" />
            <div className="absolute -right-6 top-8 h-24 w-24 rounded-full bg-secondary/20 blur-3xl animate-pulse" />
            <div className="absolute inset-x-10 top-6 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
            <div className="pointer-events-none absolute inset-0 rounded-[2.2rem] border border-white/60" />
            <div className={cx('relative mx-auto mb-5 flex items-center justify-center', isUltraShortViewport ? 'h-14 w-14' : isShortViewport ? 'h-16 w-16' : 'h-20 w-20')}>
              <div className="absolute inset-0 rounded-full border-2 border-primary/20 animate-ping" />
              <div className="absolute inset-2 rounded-full bg-primary/15 animate-pulse" />
              <div className={cx('relative rounded-full bg-primary font-black text-primary-foreground shadow-lg shadow-primary/25', isUltraShortViewport ? 'px-2.5 py-1.5 text-base' : isShortViewport ? 'px-3 py-2 text-lg' : 'px-4 py-3 text-xl')}>
                +{stageXpEarned}
              </div>
            </div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-primary/60">Stage Complete</p>
            <h2 className={cx('mt-4 font-black text-foreground', isUltraShortViewport ? 'text-xl sm:text-2xl' : isShortViewport ? 'text-2xl sm:text-3xl' : 'text-3xl sm:text-4xl')}>
              {stageTransitionCopy.title}
            </h2>
            <p className={cx('mt-3 font-semibold uppercase tracking-[0.16em] text-foreground/50', isUltraShortViewport ? 'text-[11px]' : isShortViewport ? 'text-xs' : 'text-sm')}>
              {stageTransitionCopy.subtitle}
            </p>
            <div className={cx('mt-6 grid gap-3 sm:grid-cols-2', isVeryShortViewport && 'mt-4')}>
              <div className="rounded-3xl border border-green-200 bg-green-50 p-4 text-left">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-green-700/70">Stage XP</p>
                <p className="mt-2 text-2xl font-black text-green-700">+{stageXpEarned}</p>
              </div>
              <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-left">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-700/70">Mistakes</p>
                <p className="mt-2 text-2xl font-black text-amber-700">{stageMistakesCount}</p>
              </div>
            </div>
            <div className="relative mt-5 h-2 overflow-hidden rounded-full bg-primary/10">
              <div className="absolute inset-y-0 left-0 w-1/2 rounded-full bg-[linear-gradient(90deg,#fb923c_0%,#f59e0b_40%,#34d399_100%)] animate-[pulse_1.1s_ease-in-out_infinite]" />
            </div>
            <p className={cx('mt-5 font-semibold text-foreground/55', isUltraShortViewport ? 'text-[11px]' : isShortViewport ? 'text-xs' : 'text-sm')}>
              {isSavingStage ? 'Saving progress...' : isLastStage ? 'Wrapping up...' : 'Loading next stage...'}
            </p>
          </div>
        </div>
      ) : null}

      {!isStageComplete ? (
        <footer
          className={cx(
            'fixed bottom-0 left-0 right-0 z-40 border-t backdrop-blur transition-colors duration-300',
            !isAnswered && 'border-border/70 bg-background/95',
            isAnswered && isCorrect && 'border-green-200 bg-green-50/95',
            isAnswered && !isCorrect && 'border-red-200 bg-red-50/95',
          )}
        >
          <div
            className={cx(
              'mx-auto flex max-w-4xl flex-col sm:flex-row sm:items-center sm:justify-between sm:px-6',
              isUltraShortViewport ? 'gap-2.5 px-3 py-2.5' : isShortViewport ? 'gap-3 px-3 py-3' : 'gap-4 px-4 py-4',
            )}
          >
            <div className="hidden flex-1 items-center gap-3 sm:flex">
              {isAnswered ? (
                <>
                  <div
                    className={cx(
                      'flex h-11 w-11 items-center justify-center rounded-xl border',
                      isCorrect ? 'border-green-300 bg-white text-green-700' : 'border-red-300 bg-white text-red-700',
                    )}
                  >
                    {isCorrect ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}
                  </div>
                  <div>
                    <p className={cx(isUltraShortViewport ? 'text-xs font-black' : isShortViewport ? 'text-sm font-black' : 'text-base font-black', isCorrect ? 'text-green-800' : 'text-red-800')}>
                      {answerStatusLabel}
                    </p>
                    {!isCorrect && exerciseData?.explanation && !isVeryShortViewport ? (
                      <p className="text-sm font-medium text-red-800/70">{exerciseData.explanation}</p>
                    ) : null}
                  </div>
                </>
              ) : (
                <p className={cx('font-semibold text-foreground/55', isUltraShortViewport ? 'text-[11px]' : isShortViewport ? 'text-xs' : 'text-sm')}>
                  {isSpeakingQuestion
                    ? preview
                      ? 'Preview the speaking prompt and reference audio.'
                      : 'Record yourself, then check your tone above.'
                    : preview
                      ? 'Work through the lesson as a learner would.'
                      : 'Choose your answer, then check.'}
                </p>
              )}
            </div>

            <div className="w-full sm:w-auto">
              {isExerciseBlock ? (
                isSpeakingQuestion ? (
                  <Button
                    size="lg"
                    className={cx(
                      'w-full font-black sm:w-auto',
                      isUltraShortViewport ? 'h-10 px-4 text-xs' : isShortViewport ? 'h-11 px-5 text-sm' : 'h-14 px-8 text-lg',
                      isAnswered ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-muted text-foreground/55 hover:bg-muted',
                    )}
                    onClick={handleNext}
                    disabled={!isAnswered || isSavingStage}
                  >
                    {isAnswered ? (
                      <>
                        Continue
                        <ArrowRight className="h-5 w-5" />
                      </>
                    ) : (
                      'Check Tone Above'
                    )}
                  </Button>
                ) : !isAnswered ? (
                  <Button
                    size="lg"
                    className={cx('w-full font-black sm:w-auto', isUltraShortViewport ? 'h-10 px-4 text-xs' : isShortViewport ? 'h-11 px-5 text-sm' : 'h-14 px-8 text-lg')}
                    onClick={handleCheck}
                    disabled={!canCheck}
                  >
                    Check Answer
                  </Button>
                ) : (
                  <Button
                    size="lg"
                    className={cx(
                      'w-full font-black text-white sm:w-auto',
                      isUltraShortViewport ? 'h-10 px-4 text-xs' : isShortViewport ? 'h-11 px-5 text-sm' : 'h-14 px-8 text-lg',
                      isCorrect ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700',
                    )}
                    onClick={handleNext}
                    disabled={isSavingStage}
                  >
                    Continue
                    <ArrowRight className="h-5 w-5" />
                  </Button>
                )
              ) : (
                <Button
                  size="lg"
                  className={cx('w-full font-black sm:w-auto', isUltraShortViewport ? 'h-10 px-4 text-xs' : isShortViewport ? 'h-11 px-5 text-sm' : 'h-14 px-8 text-lg')}
                  onClick={handleNext}
                >
                  Continue
                  <ArrowRight className="h-5 w-5" />
                </Button>
              )}
            </div>
          </div>
        </footer>
      ) : null}
    </main>
  )
}
