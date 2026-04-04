'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type {
  ExerciseQuestion,
  Language,
  Lesson,
  LessonFlowData,
  PopulatedLessonBlock,
  QuestionMatchingDisplayItem,
  StageQuestionResult,
  StageCompletionResult,
} from './types'
import { ExerciseBlock } from './components/studyComponents/ExerciseBlock'
import { ContentStudyBlock, ProverbStudyBlock, TeacherNoteBlock } from './components/studyComponents/StaticStudyBlocks'
import { StudyFooter } from './components/studyComponents/StudyFooter'
import { StudyHeader } from './components/studyComponents/StudyHeader'
import { cx } from './components/studyComponents/StudyUi'
import { blobToBase64, playAudioUrl } from './components/studyComponents/studyMedia'
import {
  SOUNDS,
  XP_PER_BLOCK,
  buildMatchingFallbackItems,
  buildWordOrderDisplayOrder,
  getChoiceSupportText,
  getListeningHeading,
  getListeningPromptDetail,
  getListeningSupportText,
  normalizeWordSequence,
  replacePromptToken,
} from './components/studyComponents/studyHelpers'

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
  const [retryQueue, setRetryQueue] = useState<number[]>([])
  const [nextRetryQueue, setNextRetryQueue] = useState<number[]>([])
  const [retryPosition, setRetryPosition] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
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
  const [viewportHeight, setViewportHeight] = useState<number | null>(null)
  const [viewportWidth, setViewportWidth] = useState<number | null>(null)
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
        setRetryQueue([])
        setNextRetryQueue([])
        setRetryPosition(0)
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
    const updateViewport = () => {
      setViewportHeight(window.innerHeight)
      setViewportWidth(window.innerWidth)
    }
    updateViewport()
    window.addEventListener('resize', updateViewport)
    window.addEventListener('orientationchange', updateViewport)
    return () => {
      window.removeEventListener('resize', updateViewport)
      window.removeEventListener('orientationchange', updateViewport)
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
  const currentGlobalBlockIndex = isRetryMode
    ? retryQueue[retryPosition] ?? 0
    : currentStage
      ? currentStage.start + currentStageBlockIndex
      : 0
  const currentBlock = blocks[currentGlobalBlockIndex]
  const completedLessonBlockCount = isRetryMode
    ? blocks.length
    : Math.min(blocks.length, Math.max(0, currentGlobalBlockIndex))
  const progress =
    blocks.length > 0
      ? Math.min(100, Math.round((completedLessonBlockCount / blocks.length) * 100))
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
  const isReviewLesson = Boolean(lesson?.kind === 'review' || /^review\b/i.test(String(lesson?.title || '')))
  const sourceText = questionSource?.text || ''
  const promptText = exerciseData?.promptTemplate || exerciseData?.prompt || 'Choose the right answer'
  const isShortViewport = viewportHeight !== null && viewportHeight <= 860
  const isVeryShortViewport = viewportHeight !== null && viewportHeight <= 740
  const isUltraShortViewport = viewportHeight !== null && viewportHeight <= 680
  const isNarrowViewport = viewportWidth !== null && viewportWidth <= 640
  const isDesktopViewport = viewportWidth !== null && viewportWidth >= 1024
  const isExtraNarrowViewport = viewportWidth !== null && viewportWidth <= 420
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
  const wordOrderDisplayOrder = useMemo(
    () => buildWordOrderDisplayOrder(interactionWords, `${exerciseData?._id || currentGlobalBlockIndex}:${promptText}:${interactionWords.join("||")}`),
    [currentGlobalBlockIndex, exerciseData?._id, interactionWords, promptText],
  )
  const listeningAudioUrl = isListeningQuestion ? questionSource?.audio?.url : undefined
  const questionSentenceText =
    questionSource?.kind === 'sentence' ? questionSource.text || sentenceText : sentenceText || ''
  const questionSentenceComponents =
    questionSource?.kind === 'sentence' && Array.isArray(questionSource.components) ? questionSource.components : []
  const questionSentenceAudioUrl = questionSource?.kind === 'sentence' ? questionSource.audio?.url : undefined
  const shouldShowMeaningSentenceCard =
    exerciseData?.subtype === 'fg-word-order' &&
    questionSource?.kind === 'sentence' &&
    Boolean(meaningText.trim()) &&
    questionSentenceComponents.length > 0 &&
    /arrange the words to mean/i.test(promptText)
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
    setStageMistakesCount(0)
    setStageQuestionResults({})
    setStageStartedAt(Date.now())
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

  const canCheckSpeaking = useMemo(() => {
    if (!isExerciseBlock || !isSpeakingQuestion || isAnswered) return false
    return Boolean(
      canPracticeSpeaking && recordedSpeechUrl && !isRecordingSpeech && !isComparingSpeech,
    )
  }, [
    canPracticeSpeaking,
    isAnswered,
    isComparingSpeech,
    isExerciseBlock,
    isRecordingSpeech,
    isSpeakingQuestion,
    recordedSpeechUrl,
  ])

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
          const resultKey = String(currentGlobalBlockIndex)
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
      const failedBlockIndex = currentGlobalBlockIndex
      if (isRetryMode) {
        setNextRetryQueue((prev) => appendUnique(prev, failedBlockIndex))
      } else {
        setRetryQueue((prev) => appendUnique(prev, failedBlockIndex))
      }
    },
    [appendUnique, currentGlobalBlockIndex, exerciseData, isRetryMode, playFeedbackSound],
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

  const finishLesson = useCallback(() => {
    clearStageAdvanceTimeout()
    if (onLessonComplete) {
      onLessonComplete({ lessonId, xpEarned, language: lesson?.language })
    } else {
      onExit()
    }
  }, [clearStageAdvanceTimeout, lesson?.language, lessonId, onExit, onLessonComplete, xpEarned])

  const startLessonRetry = useCallback(() => {
    setIsRetryMode(true)
    setRetryPosition(0)
    setNextRetryQueue([])
    resetAnswerState()
    resetSpeakingState()
  }, [resetAnswerState, resetSpeakingState])

  const handleAdvanceStage = useCallback(() => {
    clearStageAdvanceTimeout()
    if (isLastStage) {
      if (retryQueue.length > 0) {
        startLessonRetry()
        return
      }
      finishLesson()
      return
    }

    setCurrentStageIndex((prev) => prev + 1)
    resetStageState()
  }, [clearStageAdvanceTimeout, finishLesson, isLastStage, resetStageState, retryQueue.length, startLessonRetry])

  const completeCurrentStage = useCallback(async () => {
    if (!lessonId || !currentStage) return
    const elapsedMs = stageStartedAt ? Date.now() - stageStartedAt : 0
    const minutesSpent = Math.max(1, Math.round(elapsedMs / 60000))
    resetAnswerState()

    if (!onCompleteStage) {
      handleAdvanceStage()
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
      handleAdvanceStage()
    }
  }, [
    currentStage,
    currentStageIndex,
    handleAdvanceStage,
    lessonId,
    onCompleteStage,
    resetAnswerState,
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
      const selectedSequence = selectedWords.map((index) => interactionWords[index] || '')
      if (exerciseData?.subtype === 'fg-letter-order') {
        correct = selectedSequence.join('') === questionSentenceText
      } else {
        const expectedWordOrderText = /build the english meaning of this sentence/i.test(promptText)
          ? meaningText
          : questionSentenceText
        correct =
          normalizeWordSequence(selectedSequence.join(' ')) === normalizeWordSequence(expectedWordOrderText)
      }
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

    if (isRetryMode && retryPosition < retryQueue.length - 1) {
      setRetryPosition((prev) => prev + 1)
      resetAnswerState()
      return
    }

    if (isRetryMode && nextRetryQueue.length > 0) {
      setRetryQueue(nextRetryQueue)
      setNextRetryQueue([])
      setRetryPosition(0)
      resetAnswerState()
      return
    }

    if (isRetryMode) {
      finishLesson()
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
    if (currentBlock?.type !== 'proverb' || !lesson?.language || !culturalSoundResolver) {
      return
    }
    const audio = new Audio(culturalSoundResolver(lesson.language, 'proverb'))
    audio.volume = 0.42
    audio.play().catch(() => {})
  }, [currentBlock, culturalSoundResolver, lesson?.language])

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
        <div className="mb-4 h-16 w-16 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="animate-pulse text-xl font-bold text-foreground/60">{loadingMessage}</p>
      </div>
    )
  }

  if (!currentStage || !currentBlock) {
    return <div className="flex min-h-screen items-center justify-center">{emptyMessage}</div>
  }

  return (
    <main className="relative flex min-h-[100svh] select-none flex-col overflow-x-hidden bg-[#fffbff]">
      <div
        className={cx(
          'pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,213,171,0.2),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0),rgba(253,249,241,0.78))]',
        )}
      />

      <StudyHeader
        onExit={onExit}
        preview={preview}
        progress={progress}
        xpEarned={xpEarned}
        isStageComplete={false}
        isShortViewport={isShortViewport}
        isUltraShortViewport={isUltraShortViewport}
        immersiveExerciseChrome={Boolean(isExerciseBlock && exerciseData)}
      />

      <div
        className={cx(
          'relative z-10 flex-1 overflow-y-visible px-4 sm:px-6',
          isUltraShortViewport ? 'pb-24 pt-2' : isShortViewport ? 'pb-28 pt-3' : 'pb-32 pt-6',
        )}
      >
        <div className={cx('mx-auto flex w-full flex-col', isMatchingQuestion ? 'max-w-[70rem]' : isSpeakingQuestion ? 'max-w-5xl' : 'max-w-4xl')}>
          <>
            {currentBlock.type === 'text' ? (
              <TeacherNoteBlock
                content={currentBlock.content}
                isShortViewport={isShortViewport}
                isUltraShortViewport={isUltraShortViewport}
              />
            ) : null}

            {currentBlock.type === 'content' ? (
              <ContentStudyBlock
                content={currentBlock.data}
                language={lesson?.language}
                isShortViewport={isShortViewport}
                isUltraShortViewport={isUltraShortViewport}
                isDesktopViewport={isDesktopViewport}
                onPlayAudio={playAudioUrl}
                onPlayClick={playClick}
              />
            ) : null}

            {currentBlock.type === 'proverb' ? (
              <ProverbStudyBlock
                proverb={currentBlock.data}
                isShortViewport={isShortViewport}
                isUltraShortViewport={isUltraShortViewport}
              />
            ) : null}

            {isExerciseBlock && exerciseData ? (
              <ExerciseBlock
                exerciseData={exerciseData}
                isUltraShortViewport={isUltraShortViewport}
                isShortViewport={isShortViewport}
                isDesktopViewport={isDesktopViewport}
                lessonTitle={lesson?.title}
                isListeningQuestion={isListeningQuestion}
                isSpeakingQuestion={isSpeakingQuestion}
                isContextResponseQuestion={isContextResponseQuestion}
                isChoiceQuestion={isChoiceQuestion}
                isMatchingQuestion={isMatchingQuestion}
                isWordOrderQuestion={isWordOrderQuestion}
                isReviewLesson={isReviewLesson}
                inlineSourceComponent={inlineSourceComponent}
                sourceText={sourceText}
                renderedPrompt={renderedPrompt}
                renderedPromptParts={renderedPromptParts}
                listeningHeading={listeningHeading}
                choiceSupportText={choiceSupportText}
                questionSentenceText={questionSentenceText}
                shouldShowMeaningSentenceCard={shouldShowMeaningSentenceCard}
                meaningText={meaningText}
                questionSentenceAudioUrl={questionSentenceAudioUrl}
                questionSentenceComponents={questionSentenceComponents}
                interactionWords={interactionWords}
                listeningSupportText={listeningSupportText}
                listeningAudioUrl={listeningAudioUrl}
                listeningPromptDetail={listeningPromptDetail}
                isPlayingPrompt={isPlayingPrompt}
                speakingTarget={speakingTarget}
                hasSpeakingReference={hasSpeakingReference}
                canPracticeSpeaking={canPracticeSpeaking}
                isRecordingSpeech={isRecordingSpeech}
                isComparingSpeech={isComparingSpeech}
                recordedSpeechUrl={recordedSpeechUrl}
                speakingError={speakingError}
                speakingFeedback={speakingFeedback}
                selectedOption={selectedOption}
                selectedWords={selectedWords}
                selectedMatches={selectedMatches}
                selectedMatchingLeftId={selectedMatchingLeftId}
                matchingLeftItems={matchingLeftItems}
                matchingRightItems={matchingRightItems}
                orderPromptPlaceholder={orderPromptPlaceholder}
                wordOrderDisplayOrder={wordOrderDisplayOrder}
                isAnswered={isAnswered}
                onPlayAudio={playAudioUrl}
                onPlayClick={playClick}
                onToggleListeningPrompt={() => {
                  if (!listeningAudioUrl) return
                  playClick()
                  setIsPlayingPrompt(true)
                  playAudioUrl(listeningAudioUrl, 1, () => setIsPlayingPrompt(false))
                }}
                onPlayListeningSlow={() => {
                  playClick()
                  playAudioUrl(listeningAudioUrl, 0.6)
                }}
                onToggleRecording={() => {
                  playClick()
                  if (isRecordingSpeech) {
                    stopSpeakingRecording()
                  } else {
                    void startSpeakingRecording()
                  }
                }}
                onReplayRecording={() => {
                  playClick()
                  if (recordedSpeechUrl) playAudioUrl(recordedSpeechUrl)
                }}
                onSubmitSpeakingAttempt={() => {
                  playClick()
                  void submitSpeakingAttempt()
                }}
                onSelectOption={(idx) => {
                  if (isAnswered) return
                  setSelectedAnswer(idx)
                  playClick()
                }}
                onSelectMatchingLeft={handleSelectMatchingLeft}
                onSelectMatchingRight={handleSelectMatchingRight}
                getMatchingRightItem={getMatchingRightItem}
                onRemoveSelectedWord={(selectedIndex) => {
                  if (isAnswered) return
                  setSelectedWords((prevWords) =>
                    exerciseData?.subtype === 'fg-letter-order'
                      ? prevWords.slice(0, -1)
                      : prevWords.filter((_, currentSelectedIndex) => currentSelectedIndex !== selectedIndex),
                  )
                }}
                onAddSelectedWord={(wordIndex) => {
                  if (isAnswered) return
                  setSelectedWords((prevWords) => [...prevWords, wordIndex])
                  playClick()
                }}
              />
            ) : null}
          </>
        </div>
      </div>

      <StudyFooter
        isAnswered={isAnswered}
        isCorrect={isCorrect}
        isExerciseBlock={isExerciseBlock}
        isSpeakingQuestion={isSpeakingQuestion}
        preview={preview}
        answerStatusLabel={answerStatusLabel}
        explanation={exerciseData?.explanation}
        canCheck={canCheck}
        canCheckSpeaking={canCheckSpeaking}
        isRecordingSpeech={isRecordingSpeech}
        isCheckingSpeakingAnswer={isComparingSpeech}
        isSavingStage={isSavingStage}
        isShortViewport={isShortViewport}
        isUltraShortViewport={isUltraShortViewport}
        isVeryShortViewport={isVeryShortViewport}
        onCheck={handleCheck}
        onCheckSpeaking={() => {
          playClick()
          void submitSpeakingAttempt()
        }}
        onNext={handleNext}
      />
    </main>
  )
}
