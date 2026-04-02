import { CheckCircle2, GripVertical, Languages, Lightbulb, Loader2, Mic, Volume2 } from 'lucide-react'
import type { ExerciseQuestion, LearningContentComponent, QuestionMatchingDisplayItem } from '../../types'
import { SentenceContentDisplay, SentenceMeaningDisplay } from './SentenceDisplay'
import { cx } from './StudyUi'

type AudioPlayerFn = (url?: string, speed?: number, onEnd?: () => void) => void

type SpeakingTarget = {
  type: 'word' | 'expression' | 'sentence'
  id: string
  text: string
  audioUrl?: string
}

type SpeakingFeedback = {
  level: 'excellent' | 'good' | 'fair' | 'poor'
}

const SPELLING_CONTEXT_IMAGE =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBSJLUFH1PuZO_HDC5ipmEuAY-Kh5GRfoqWpdKzxi29fwLDMMhANMm0SBtNGrYKJJDU2AiMdwxtBDqE5-W1buTwq8UGKzHkxhFo1ftxYagVq-ij1BAcwKLdljp_nWOSbwO-0-MM8i68YKEAUOowLNOflSINW3Bz4fQ9IACW9I9gtRY0pPvm8uSbCvC9aTLe7DQ6Ldz7nAgYjjI4vB2iy0imeXI3NjkgnjJoBd8DBIY292h9KL6Dno3V2ya2GjAtGcyr_wLt8g_aSSD0'

function splitOptionText(option: string) {
  const trimmed = String(option || '').trim()
  const match = trimmed.match(/^(.*?)(\s*\(([^)]+)\))$/)
  if (!match) return { primary: trimmed, secondary: '' }
  return {
    primary: match[1]?.trim() || trimmed,
    secondary: match[3]?.trim() || '',
  }
}

function renderPromptText({
  renderedPrompt,
  renderedPromptParts,
  sourceText,
}: {
  renderedPrompt: string
  renderedPromptParts: string[]
  sourceText: string
}) {
  if (!sourceText || renderedPromptParts.length <= 1) return renderedPrompt

  return renderedPromptParts.map((part, index) => (
    <span key={`prompt-part-${index}`}>
      {part}
      {index < renderedPromptParts.length - 1 ? (
        <span className="border-b-2 border-dashed border-[#ffbe9b] text-[#a94600] italic">{sourceText}</span>
      ) : null}
    </span>
  ))
}

function renderPromptWithTrailingAccent(prompt: string) {
  const [prefix, ...rest] = String(prompt || '').split(':')
  if (rest.length === 0) return prompt

  return (
    <>
      {prefix}
      {':' + ' '}
      <span className="text-[#a94600] italic">{rest.join(':').trim()}</span>
    </>
  )
}

function getExerciseHint({
  isListeningQuestion,
  isContextResponseQuestion,
  listeningSupportText,
  choiceSupportText,
}: {
  isListeningQuestion: boolean
  isContextResponseQuestion: boolean
  listeningSupportText: string
  choiceSupportText: string
}) {
  if (isContextResponseQuestion && choiceSupportText) return choiceSupportText
  if (isListeningQuestion && listeningSupportText) return listeningSupportText
  return 'Choose the closest meaning and pay attention to tone and context.'
}

function AudioCircleButton({
  onClick,
  disabled,
  isLarge = false,
  isSquare = false,
  pulse = false,
  ariaLabel,
}: {
  onClick: () => void
  disabled?: boolean
  isLarge?: boolean
  isSquare?: boolean
  pulse?: boolean
  ariaLabel: string
}) {
  return (
    <button
      type="button"
      className={cx(
        'flex shrink-0 items-center justify-center text-[#8b3900] transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40',
        isSquare
          ? 'rounded-[1.25rem] bg-[#ffae86]/85 shadow-[0_10px_24px_rgba(169,70,0,0.12)]'
          : 'rounded-full bg-[#f1eee2] shadow-[0_10px_24px_rgba(57,56,47,0.05)] hover:bg-[#ece8db]',
        isLarge ? (isSquare ? 'h-16 w-16' : 'h-20 w-20') : isSquare ? 'h-14 w-14' : 'h-14 w-14',
      )}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      <Volume2 className={cx(isLarge ? 'h-8 w-8' : 'h-7 w-7', pulse && 'animate-pulse')} />
    </button>
  )
}

function TranslationOptionCard({
  option,
  index,
  selected,
  isAnswered,
  isCorrect,
  isDesktopViewport,
  onClick,
}: {
  option: string
  index: number
  selected: boolean
  isAnswered: boolean
  isCorrect: boolean
  isDesktopViewport: boolean
  onClick: () => void
}) {
  const label = isDesktopViewport ? String.fromCharCode(65 + index) : `Option ${index + 1}`
  const parts = splitOptionText(option)
  const isWrongSelection = isAnswered && selected && !isCorrect
  const isRightSelection = isAnswered && isCorrect

  return (
    <button
      type="button"
      className={cx(
        'group relative overflow-hidden text-left transition-all duration-200 active:scale-[0.98] disabled:pointer-events-none',
        isDesktopViewport
          ? 'flex items-center rounded-[1.55rem] border-2 p-6'
          : 'flex flex-col items-start rounded-[1.65rem] border-2 p-5',
        !selected && !isRightSelection && !isWrongSelection && 'border-transparent bg-[#fffdf8] shadow-[0_10px_24px_rgba(57,56,47,0.04)] hover:border-[#ffbe9b] hover:bg-[#fff7ef]',
        selected && !isAnswered && (isDesktopViewport ? 'border-[#a94600] bg-[#ffae86] shadow-[0_8px_24px_rgba(169,70,0,0.1)] scale-[1.01]' : 'border-[#a94600] bg-[#ffdeac] shadow-[0_8px_24px_rgba(169,70,0,0.1)] -translate-y-0.5'),
        isRightSelection && 'border-[#57a764] bg-[#edf7ea] text-[#2d7c37]',
        isWrongSelection && 'border-[#fa7150] bg-[#fff1ee] text-[#b23d21]',
      )}
      onClick={onClick}
    >
      {isDesktopViewport ? (
        <span
          className={cx(
            'mr-5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-black transition-colors',
            selected && !isAnswered
              ? 'bg-[#a94600] text-white'
              : isRightSelection
                ? 'bg-[#57a764] text-white'
                : isWrongSelection
                  ? 'bg-[#fa7150] text-white'
                  : 'bg-[#f1eee2] text-[#7d7467] group-hover:bg-[#a94600] group-hover:text-white',
          )}
        >
          {label}
        </span>
      ) : (
        <span className={cx('mb-1 text-[10px] font-black uppercase tracking-[0.14em]', selected && !isAnswered ? 'text-[#a94600]' : 'text-[#8a7d70]')}>
          {label}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className={cx('font-display font-bold leading-snug text-[#191713]', isDesktopViewport ? 'text-xl' : 'text-lg')}>
          {parts.primary}
        </p>
        {parts.secondary ? (
          <p className={cx('mt-1 font-body italic', selected && !isAnswered ? 'text-[#7a4b22]' : 'text-[#8a7d70]', isDesktopViewport ? 'text-sm' : 'text-[0.95rem]')}>
            ({parts.secondary})
          </p>
        ) : null}
      </div>

      {!isDesktopViewport && selected && !isAnswered ? (
        <CheckCircle2 className="absolute right-4 top-4 h-5 w-5 text-[#a94600]" />
      ) : null}
    </button>
  )
}

function TranslationExerciseSurface(props: {
  exerciseData: ExerciseQuestion
  isDesktopViewport: boolean
  isUltraShortViewport: boolean
  isShortViewport: boolean
  isListeningQuestion: boolean
  isContextResponseQuestion: boolean
  sourceText: string
  renderedPrompt: string
  renderedPromptParts: string[]
  listeningHeading: string
  choiceSupportText: string
  questionChipLabel: string
  questionSentenceText: string
  shouldShowMeaningSentenceCard: boolean
  meaningText: string
  questionSentenceAudioUrl?: string
  questionSentenceComponents: LearningContentComponent[]
  listeningSupportText: string
  listeningAudioUrl?: string
  listeningPromptDetail: string
  isPlayingPrompt: boolean
  selectedOption: number | null
  isAnswered: boolean
  onPlayAudio: AudioPlayerFn
  onPlayClick: () => void
  onToggleListeningPrompt: () => void
  onSelectOption: (index: number) => void
}) {
  const {
    exerciseData,
    isDesktopViewport,
    isListeningQuestion,
    isContextResponseQuestion,
    sourceText,
    renderedPrompt,
    renderedPromptParts,
    listeningHeading,
    choiceSupportText,
    questionChipLabel,
    questionSentenceText,
    shouldShowMeaningSentenceCard,
    meaningText,
    questionSentenceAudioUrl,
    questionSentenceComponents,
    listeningSupportText,
    listeningAudioUrl,
    listeningPromptDetail,
    isPlayingPrompt,
    selectedOption,
    isAnswered,
    onPlayAudio,
    onPlayClick,
    onToggleListeningPrompt,
    onSelectOption,
  } = props

  const promptAudioUrl = isListeningQuestion ? listeningAudioUrl : questionSentenceAudioUrl || exerciseData.source?.audio?.url
  const hintText = getExerciseHint({
    isListeningQuestion,
    isContextResponseQuestion,
    listeningSupportText,
    choiceSupportText,
  })

  if (isDesktopViewport) {
    return (
      <section className="mx-auto w-full max-w-5xl space-y-6 pt-2">
        <div className="rounded-[2rem] border border-[#efe4d8] bg-[#fdf9f1] px-8 py-8 shadow-[0_20px_44px_rgba(57,56,47,0.06)] lg:px-10 lg:py-10">
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl space-y-4">
                <span className="inline-flex rounded-full bg-[#ffdeac] px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-[#6e4b00]">
                  {questionChipLabel}
                </span>
                <h2 className="font-display text-[2.3rem] font-extrabold leading-[1.06] tracking-[-0.04em] text-[#191713] lg:text-[3.35rem]">
                  {isListeningQuestion
                    ? listeningHeading
                    : renderPromptText({ renderedPrompt, renderedPromptParts, sourceText })}
                </h2>
              </div>

              {promptAudioUrl ? (
                <AudioCircleButton
                  onClick={() => {
                    onPlayClick()
                    if (isListeningQuestion) onToggleListeningPrompt()
                    else onPlayAudio(promptAudioUrl)
                  }}
                  pulse={isListeningQuestion && isPlayingPrompt}
                  isLarge
                  ariaLabel={isListeningQuestion ? 'Play listening prompt audio' : 'Play prompt audio'}
                />
              ) : null}
            </div>

            {listeningPromptDetail ? (
              <div className="max-w-xl rounded-[1.4rem] border border-[#efe4d8] bg-white px-5 py-4">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#8a7d70]">Your prompt</p>
                <p className="mt-2 text-base font-bold text-[#39382f]">{listeningPromptDetail}</p>
              </div>
            ) : null}

            {questionSentenceText ? (
              <div className="rounded-[1.7rem] border border-[#efe4d8] bg-white p-5 lg:p-6">
                {shouldShowMeaningSentenceCard ? (
                  <SentenceMeaningDisplay
                    text={meaningText}
                    audioUrl={questionSentenceAudioUrl}
                    meaningSegments={exerciseData.reviewData?.meaningSegments}
                    interactionWords={exerciseData.reviewData?.words || []}
                    sourceComponents={questionSentenceComponents}
                    onPlayAudio={onPlayAudio}
                  />
                ) : questionSentenceComponents.length > 0 ? (
                  <SentenceContentDisplay
                    text={questionSentenceText}
                    components={questionSentenceComponents}
                    audioUrl={questionSentenceAudioUrl}
                    onPlayAudio={onPlayAudio}
                  />
                ) : (
                  <p className="text-center font-display text-3xl font-black tracking-[-0.03em] text-[#191713]">
                    {questionSentenceText}
                  </p>
                )}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {exerciseData.options.map((option, index) => (
                <TranslationOptionCard
                  key={`${option}-${index}`}
                  option={option}
                  index={index}
                  selected={selectedOption === index}
                  isAnswered={isAnswered}
                  isCorrect={exerciseData.correctIndex === index}
                  isDesktopViewport
                  onClick={() => {
                    if (isAnswered) return
                    onSelectOption(index)
                  }}
                />
              ))}
            </div>

            <div className="flex items-start gap-3 pt-2 text-[#7d7467]">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-[#86745c]" />
              <p className="text-sm font-medium italic leading-relaxed">{hintText}</p>
            </div>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="mx-auto w-full max-w-md space-y-6 pt-1">
      <header className="space-y-4">
        <div className="flex items-center gap-4">
          <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[#a94600]">{questionChipLabel}</span>
          <div className="h-px flex-1 bg-[#ddd2c2]" />
        </div>

        <div className="flex items-start gap-4">
          {promptAudioUrl ? (
            <AudioCircleButton
              onClick={() => {
                onPlayClick()
                if (isListeningQuestion) onToggleListeningPrompt()
                else onPlayAudio(promptAudioUrl)
              }}
              disabled={!promptAudioUrl}
              isSquare
              pulse={isListeningQuestion && isPlayingPrompt}
              ariaLabel={isListeningQuestion ? 'Play listening prompt audio' : 'Play prompt audio'}
            />
          ) : null}

          <h2 className="min-w-0 flex-1 font-display text-[2rem] font-bold leading-[1.1] tracking-[-0.04em] text-[#191713]">
            {isListeningQuestion
              ? listeningHeading
              : renderPromptText({ renderedPrompt, renderedPromptParts, sourceText })}
          </h2>
        </div>
      </header>

      {listeningPromptDetail ? (
        <div className="rounded-[1.35rem] bg-[#f1eee2] px-4 py-3 text-sm font-semibold text-[#5f5951]">
          {listeningPromptDetail}
        </div>
      ) : null}

      {questionSentenceText ? (
        <div className="rounded-[1.65rem] border border-[#efe4d8] bg-white p-4 shadow-[0_10px_24px_rgba(57,56,47,0.04)]">
          {shouldShowMeaningSentenceCard ? (
            <SentenceMeaningDisplay
              text={meaningText}
              audioUrl={questionSentenceAudioUrl}
              meaningSegments={exerciseData.reviewData?.meaningSegments}
              interactionWords={exerciseData.reviewData?.words || []}
              sourceComponents={questionSentenceComponents}
              onPlayAudio={onPlayAudio}
            />
          ) : questionSentenceComponents.length > 0 ? (
            <SentenceContentDisplay
              text={questionSentenceText}
              components={questionSentenceComponents}
              audioUrl={questionSentenceAudioUrl}
              onPlayAudio={onPlayAudio}
            />
          ) : (
            <p className="text-center font-display text-2xl font-black tracking-[-0.03em] text-[#191713]">{questionSentenceText}</p>
          )}
        </div>
      ) : null}

      <div className="space-y-4">
        {exerciseData.options.map((option, index) => (
          <TranslationOptionCard
            key={`${option}-${index}`}
            option={option}
            index={index}
            selected={selectedOption === index}
            isAnswered={isAnswered}
            isCorrect={exerciseData.correctIndex === index}
            isDesktopViewport={false}
            onClick={() => {
              if (isAnswered) return
              onSelectOption(index)
            }}
          />
        ))}
      </div>

      <div className="flex items-center gap-3 rounded-[1rem] bg-[#f1eee2] px-4 py-3 text-[#6f6558] shadow-[0_8px_20px_rgba(57,56,47,0.04)]">
        <Lightbulb className="h-4 w-4 shrink-0 text-[#416f39]" />
        <p className="text-xs font-medium leading-tight">{hintText}</p>
      </div>
    </section>
  )
}

function SpeakingExerciseSurface({
  isDesktopViewport,
  speakingTarget,
  meaningText,
  canPracticeSpeaking,
  hasSpeakingReference,
  isRecordingSpeech,
  isComparingSpeech,
  recordedSpeechUrl,
  speakingError,
  isAnswered,
  onPlayAudio,
  onPlayClick,
  onToggleRecording,
  onReplayRecording,
}: {
  isDesktopViewport: boolean
  speakingTarget: SpeakingTarget
  meaningText: string
  canPracticeSpeaking: boolean
  hasSpeakingReference: boolean
  isRecordingSpeech: boolean
  isComparingSpeech: boolean
  recordedSpeechUrl: string | null
  speakingError: string
  isAnswered: boolean
  onPlayAudio: AudioPlayerFn
  onPlayClick: () => void
  onToggleRecording: () => void
  onReplayRecording: () => void
}) {
  const micDisabled = !canPracticeSpeaking || isComparingSpeech || isAnswered

  if (isDesktopViewport) {
    return (
      <section className="mx-auto w-full max-w-5xl space-y-10 pt-4">
        <div className="text-center">
          <span className="text-[10px] font-black uppercase tracking-[0.22em] text-[#8a7d70]">Speaking Practice</span>
          <h2 className="mt-3 font-display text-[2.45rem] font-extrabold italic tracking-[-0.04em] text-[#191713]">
            Listen and repeat
          </h2>
        </div>

        <div className="relative flex flex-col items-center">
          <div className="absolute left-1/2 top-1/2 -z-10 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#ffae86]/10 blur-[90px]" />

          <div className="w-full rounded-[3rem] bg-[#fdf9f1] px-10 py-16 shadow-[0_20px_44px_rgba(57,56,47,0.06)] lg:px-16">
            <div className="flex flex-col items-center gap-8 text-center">
              <div className="flex items-center gap-5">
                <h3 className="font-display text-[4.8rem] font-extrabold tracking-[-0.06em] text-[#191713]">
                  {speakingTarget.text}
                </h3>
                <button
                  type="button"
                  className="flex h-16 w-16 items-center justify-center rounded-[1.2rem] bg-[#f1eee2] text-[#a94600] transition-all hover:bg-[#ece8db] active:scale-95 disabled:opacity-40"
                  onClick={() => {
                    if (!speakingTarget.audioUrl) return
                    onPlayClick()
                    onPlayAudio(speakingTarget.audioUrl)
                  }}
                  disabled={!speakingTarget.audioUrl}
                  aria-label="Play reference audio"
                >
                  <Volume2 className="h-8 w-8" />
                </button>
              </div>

              {meaningText ? <p className="text-xl font-medium text-[#66655a]">“{meaningText}”</p> : null}

              <div className="flex h-8 items-center gap-1">
                {[10, 18, 26, 18, 12].map((height, index) => (
                  <span key={`${height}-${index}`} className="w-1 rounded-full bg-[#ffae86]" style={{ height }} />
                ))}
              </div>
            </div>
          </div>

          <div className="relative z-10 -mt-14 flex flex-col items-center gap-8">
            <button
              type="button"
              className={cx(
                'relative flex h-32 w-32 items-center justify-center rounded-full text-white transition-all active:scale-95',
                isRecordingSpeech
                  ? 'bg-[linear-gradient(135deg,#b23d21,#fa7150)] shadow-[0_18px_36px_rgba(178,61,33,0.28)]'
                  : 'bg-[linear-gradient(135deg,#a94600,#953d00)] shadow-[0_18px_36px_rgba(169,70,0,0.28)] hover:scale-[1.03]',
              )}
              onClick={onToggleRecording}
              disabled={micDisabled}
              aria-label={isRecordingSpeech ? 'Stop recording' : 'Start recording'}
            >
              {isComparingSpeech ? <Loader2 className="h-14 w-14 animate-spin" /> : <Mic className={cx('h-14 w-14', isRecordingSpeech && 'fill-current')} />}
            </button>

            <div className="space-y-3 text-center">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-[#8a7d70]">
                {isRecordingSpeech ? 'Tap to stop' : 'Tap to speak'}
              </p>
              {recordedSpeechUrl && !isComparingSpeech ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full border border-[#e4d6c3] bg-white px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-[#a94600] shadow-[0_10px_20px_rgba(57,56,47,0.04)]"
                  onClick={onReplayRecording}
                >
                  <Volume2 className="h-4 w-4" />
                  Replay recording
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="hidden max-w-xs rounded-[2rem] border border-white/40 bg-white/70 p-5 shadow-[0_16px_32px_rgba(57,56,47,0.06)] backdrop-blur-xl xl:block">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#a94600]">Cultural Context</span>
          <p className="mt-3 text-sm italic leading-relaxed text-[#5f5951]">
            Proper tonal pronunciation is key to greeting respectfully and sounding natural.
          </p>
        </div>

        {!hasSpeakingReference ? (
          <p className="text-center text-sm font-semibold text-red-600">Reference audio is not available for this speaking question yet.</p>
        ) : null}
        {!canPracticeSpeaking && hasSpeakingReference ? (
          <p className="text-center text-sm font-semibold text-[#8a7d70]">Speaking check is not available in this context.</p>
        ) : null}
        {speakingError ? <p className="text-center text-sm font-semibold text-red-600">{speakingError}</p> : null}
      </section>
    )
  }

  return (
    <section className="mx-auto w-full max-w-md space-y-8 pt-8">
      <div className="text-center">
        <span className="text-[10px] font-black uppercase tracking-[0.22em] text-[#8a7d70]">Speak this phrase</span>
      </div>

      <div className="mx-auto w-full max-w-sm rounded-[2rem] bg-[#fdf9f1] px-8 py-10 text-center shadow-[0_18px_38px_rgba(57,56,47,0.06)]">
        <h3 className="font-display text-[3.2rem] font-extrabold tracking-[-0.06em] text-[#191713]">{speakingTarget.text}</h3>
        {meaningText ? <p className="mt-2 text-xl text-[#66655a]">{meaningText}</p> : null}
        <button
          type="button"
          className="mx-auto mt-8 flex h-14 w-14 items-center justify-center rounded-full bg-[#f1eee2] text-[#a94600] transition-all hover:bg-[#ece8db] active:scale-95 disabled:opacity-40"
          onClick={() => {
            if (!speakingTarget.audioUrl) return
            onPlayClick()
            onPlayAudio(speakingTarget.audioUrl)
          }}
          disabled={!speakingTarget.audioUrl}
          aria-label="Play reference audio"
        >
          <Volume2 className="h-7 w-7" />
        </button>
      </div>

      <div className="flex flex-col items-center gap-6">
        <button
          type="button"
          className={cx(
            'relative flex h-28 w-28 items-center justify-center rounded-full text-white transition-all active:scale-95',
            isRecordingSpeech
              ? 'bg-[linear-gradient(135deg,#b23d21,#fa7150)] shadow-[0_16px_34px_rgba(178,61,33,0.28)]'
              : 'bg-[linear-gradient(135deg,#a94600,#953d00)] shadow-[0_16px_34px_rgba(169,70,0,0.28)]',
          )}
          onClick={onToggleRecording}
          disabled={micDisabled}
          aria-label={isRecordingSpeech ? 'Stop recording' : 'Start recording'}
        >
          {isComparingSpeech ? <Loader2 className="h-12 w-12 animate-spin" /> : <Mic className={cx('h-12 w-12', isRecordingSpeech && 'fill-current')} />}
        </button>

        <div className="space-y-3 text-center">
          <p className="text-sm font-medium text-[#5f5951]">{isRecordingSpeech ? 'Tap to stop' : 'Tap to Record'}</p>
          {recordedSpeechUrl && !isComparingSpeech ? (
            <button
              type="button"
              className="text-xs font-black uppercase tracking-[0.18em] text-[#a94600]"
              onClick={onReplayRecording}
            >
              Replay recording
            </button>
          ) : null}
        </div>
      </div>

      {!hasSpeakingReference ? (
        <p className="text-center text-sm font-semibold text-red-600">Reference audio is not available for this speaking question yet.</p>
      ) : null}
      {!canPracticeSpeaking && hasSpeakingReference ? (
        <p className="text-center text-sm font-semibold text-[#8a7d70]">Speaking check is not available in this context.</p>
      ) : null}
      {speakingError ? <p className="text-center text-sm font-semibold text-red-600">{speakingError}</p> : null}
    </section>
  )
}

function MatchingCard({
  label,
  caption,
  selected,
  matched,
  answeredWrong,
  icon,
  image,
  onClick,
  disabled,
  isDesktopViewport,
}: {
  label: string
  caption: string
  selected?: boolean
  matched?: boolean
  answeredWrong?: boolean
  icon: 'left' | 'right'
  image?: QuestionMatchingDisplayItem['image']
  onClick: () => void
  disabled?: boolean
  isDesktopViewport: boolean
}) {
  return (
    <button
      type="button"
      className={cx(
        'w-full text-left transition-all duration-200 active:scale-[0.98] disabled:pointer-events-none',
        isDesktopViewport ? 'rounded-[1.5rem] p-6' : 'relative rounded-[1.2rem] p-4',
        matched
          ? 'border border-[#57a764] bg-[#edf7ea] shadow-none'
          : answeredWrong
            ? 'border border-[#fa7150] bg-[#fff1ee] shadow-none'
            : selected
              ? 'border border-[#a94600] bg-[#ffdeac] shadow-[0_10px_24px_rgba(169,70,0,0.1)]'
              : 'border border-transparent bg-[#fdf9f1] shadow-[0_10px_24px_rgba(57,56,47,0.04)] hover:border-[#ffbe9b] hover:bg-[#fff7ef]',
      )}
      onClick={onClick}
      disabled={disabled}
    >
      {image ? (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-[1rem] bg-[#f1eee2]">
            {image.url ? (
              <img src={image.url} alt={image.altText} className={cx('w-full object-cover', isDesktopViewport ? 'h-32' : 'h-24')} />
            ) : (
              <div className={cx(
                'flex w-full items-center justify-center bg-[linear-gradient(135deg,#f5efe2,#e7ddc9)] text-[#8a7d70]',
                isDesktopViewport ? 'h-32' : 'h-24'
              )}>
                <div className="text-center">
                  <Lightbulb className="mx-auto h-6 w-6" />
                  <p className="mt-2 text-[10px] font-black uppercase tracking-[0.16em]">Image Coming Soon</p>
                </div>
              </div>
            )}
          </div>
          <p className={cx('font-body font-semibold leading-snug text-[#39382f]', isDesktopViewport ? 'text-base' : 'text-sm')}>
            {image.altText || label}
          </p>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8a7d70]">{caption}</p>
            <p className={cx('mt-3 break-words font-display font-bold leading-snug text-[#191713]', isDesktopViewport ? 'text-[1.35rem]' : 'text-[1.05rem]')}>
              {label}
            </p>
          </div>

          {matched ? (
            <CheckCircle2 className="h-5 w-5 shrink-0 text-[#416f39]" />
          ) : icon === 'left' ? (
            <GripVertical className="h-5 w-5 shrink-0 text-[#d5cabc]" />
          ) : (
            <Languages className="h-5 w-5 shrink-0 text-[#d5cabc]" />
          )}
        </div>
      )}
    </button>
  )
}

function MatchingExerciseSurface({
  isDesktopViewport,
  lessonTitle,
  isImageMatching,
  isAnswered,
  selectedMatches,
  selectedMatchingLeftId,
  matchingLeftItems,
  matchingRightItems,
  getMatchingRightItem,
  onSelectMatchingLeft,
  onSelectMatchingRight,
}: {
  isDesktopViewport: boolean
  lessonTitle?: string
  isImageMatching: boolean
  isAnswered: boolean
  selectedMatches: Record<string, string>
  selectedMatchingLeftId: string | null
  matchingLeftItems: QuestionMatchingDisplayItem[]
  matchingRightItems: QuestionMatchingDisplayItem[]
  getMatchingRightItem: (id: string) => QuestionMatchingDisplayItem | null
  onSelectMatchingLeft: (id: string) => void
  onSelectMatchingRight: (id: string) => void
}) {
  if (isDesktopViewport) {
    return (
      <section className="mx-auto w-full max-w-6xl space-y-10 pt-2">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="font-display text-[2.4rem] font-extrabold tracking-[-0.04em] text-[#191713]">Match the Pairs</h2>
            <p className="mt-2 text-base font-medium text-[#66655a]">
              {lessonTitle
                ? `Lesson focus: ${lessonTitle}`
                : isImageMatching
                  ? 'Match each word with the correct image.'
                  : 'Match each Yoruba word with its English meaning.'}
            </p>
          </div>
          <div className="rounded-full bg-[#f7f3ea] px-4 py-2 text-sm font-bold text-[#5f5951] shadow-[0_10px_20px_rgba(57,56,47,0.04)]">
            {matchingLeftItems.length} pair{matchingLeftItems.length === 1 ? '' : 's'}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-10">
          <div className="space-y-4">
            <p className="px-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#b0a498]">Yoruba</p>
            {matchingLeftItems.map((item) => {
              const matchedRight = selectedMatches[item.id] ? getMatchingRightItem(selectedMatches[item.id]) : null
              const matchedCorrectly = Boolean(isAnswered && selectedMatches[item.id] === item.id)
              const matchedWrong = Boolean(isAnswered && selectedMatches[item.id] && selectedMatches[item.id] !== item.id)
              return (
                <MatchingCard
                  key={item.id}
                  label={item.label}
                  caption="Term"
                  selected={selectedMatchingLeftId === item.id}
                  matched={Boolean(matchedRight) && !matchedWrong}
                  answeredWrong={matchedWrong}
                  icon="left"
                  onClick={() => onSelectMatchingLeft(item.id)}
                  disabled={isAnswered}
                  isDesktopViewport
                />
              )
            })}
          </div>

          <div className="space-y-4">
            <p className="px-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#b0a498]">{isImageMatching ? 'Images' : 'English'}</p>
            {matchingRightItems.map((item) => {
              const isUsed = Object.values(selectedMatches).includes(item.id)
              return (
                <MatchingCard
                  key={item.id}
                  label={item.label}
                  caption={isImageMatching ? 'Image' : 'Translation'}
                  matched={Boolean(isUsed && isAnswered)}
                  selected={Boolean(selectedMatchingLeftId && !isUsed)}
                  icon="right"
                  image={item.image}
                  onClick={() => onSelectMatchingRight(item.id)}
                  disabled={isAnswered}
                  isDesktopViewport
                />
              )
            })}
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="mx-auto w-full max-w-md space-y-6 pt-1">
      <div className="space-y-4">
        <h2 className="font-display text-[1.8rem] font-extrabold leading-none tracking-[-0.04em] text-[#8b2f00] uppercase">
          Match the Pairs
        </h2>

        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-[linear-gradient(135deg,#865d00,#c89234)] shadow-[0_10px_24px_rgba(134,93,0,0.15)]" />
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#a94600]">Lesson Focus</p>
            <p className="font-display text-lg font-bold leading-tight text-[#191713]">{lessonTitle || 'Matching Practice'}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {matchingLeftItems.map((item) => {
          const matchedRight = selectedMatches[item.id] ? getMatchingRightItem(selectedMatches[item.id]) : null
          const matchedWrong = Boolean(isAnswered && selectedMatches[item.id] && selectedMatches[item.id] !== item.id)
          return (
            <MatchingCard
              key={item.id}
              label={item.label}
              caption="Term"
              selected={selectedMatchingLeftId === item.id}
              matched={Boolean(matchedRight) && !matchedWrong}
              answeredWrong={matchedWrong}
              icon="left"
              onClick={() => onSelectMatchingLeft(item.id)}
              disabled={isAnswered}
              isDesktopViewport={false}
            />
          )
        })}

        {matchingRightItems.map((item) => {
          const isUsed = Object.values(selectedMatches).includes(item.id)
          return (
            <MatchingCard
              key={item.id}
              label={item.label}
              caption={isImageMatching ? 'Image' : 'Translation'}
              matched={Boolean(isUsed && isAnswered)}
              selected={Boolean(selectedMatchingLeftId && !isUsed)}
              icon="right"
              image={item.image}
              onClick={() => onSelectMatchingRight(item.id)}
              disabled={isAnswered}
              isDesktopViewport={false}
            />
          )
        })}
      </div>
    </section>
  )
}

function WordOrderExerciseSurface({
  exerciseData,
  isDesktopViewport,
  renderedPrompt,
  questionSentenceText,
  shouldShowMeaningSentenceCard,
  meaningText,
  questionSentenceAudioUrl,
  questionSentenceComponents,
  interactionWords,
  selectedWords,
  orderPromptPlaceholder,
  wordOrderDisplayOrder,
  isAnswered,
  onPlayAudio,
  onPlayClick,
  onRemoveSelectedWord,
  onAddSelectedWord,
}: {
  exerciseData: ExerciseQuestion
  isDesktopViewport: boolean
  renderedPrompt: string
  questionSentenceText: string
  shouldShowMeaningSentenceCard: boolean
  meaningText: string
  questionSentenceAudioUrl?: string
  questionSentenceComponents: LearningContentComponent[]
  interactionWords: string[]
  selectedWords: number[]
  orderPromptPlaceholder: string
  wordOrderDisplayOrder: number[]
  isAnswered: boolean
  onPlayAudio: AudioPlayerFn
  onPlayClick: () => void
  onRemoveSelectedWord: (selectedIndex: number) => void
  onAddSelectedWord: (wordIndex: number) => void
}) {
  const isLetterOrderQuestion = exerciseData.subtype === 'fg-letter-order'
  const selectedSequence = selectedWords.map((wordIdx) => interactionWords[wordIdx] || '')
  const remainingWordSlots = Math.max(0, interactionWords.length - selectedWords.length)
  const promptAudioUrl = questionSentenceAudioUrl || exerciseData.source?.audio?.url
  const builtAnswerText = selectedSequence.join(isLetterOrderQuestion ? '' : ' ')

  const buildCard = questionSentenceText ? (
    <div className={cx('rounded-[1.65rem] border border-[#efe4d8] bg-white p-4 shadow-[0_10px_24px_rgba(57,56,47,0.04)]', isDesktopViewport && 'p-5')}>
      {shouldShowMeaningSentenceCard ? (
        <SentenceMeaningDisplay
          text={meaningText}
          audioUrl={questionSentenceAudioUrl}
          meaningSegments={exerciseData.reviewData?.meaningSegments}
          interactionWords={interactionWords}
          sourceComponents={questionSentenceComponents}
          onPlayAudio={onPlayAudio}
        />
      ) : questionSentenceComponents.length > 0 ? (
        <SentenceContentDisplay
          text={questionSentenceText}
          components={questionSentenceComponents}
          audioUrl={questionSentenceAudioUrl}
          onPlayAudio={onPlayAudio}
        />
      ) : (
        <p className="text-center font-display text-2xl font-black tracking-[-0.03em] text-[#191713]">{questionSentenceText}</p>
      )}
    </div>
  ) : null

  if (isDesktopViewport) {
    return (
      <section className="mx-auto w-full max-w-4xl space-y-8 pt-2">
        <div className="space-y-4 text-center">
          <span className="text-[10px] font-black uppercase tracking-[0.22em] text-[#8a7d70]">
            {isLetterOrderQuestion ? 'Spelling Exercise' : 'Word Order'}
          </span>
          <h2 className="font-display text-[2.25rem] font-bold leading-[1.15] tracking-[-0.04em] text-[#191713]">
            {renderPromptWithTrailingAccent(renderedPrompt)}
          </h2>
        </div>

        {buildCard}

        <div className="rounded-[2.25rem] bg-[#fdf9f1] px-8 py-10 shadow-[0_18px_40px_rgba(57,56,47,0.05)]">
          {isLetterOrderQuestion && promptAudioUrl ? (
            <div className="mx-auto mb-8 flex max-w-sm items-center justify-center gap-4 rounded-[1.35rem] bg-white px-4 py-4 shadow-[0_10px_24px_rgba(57,56,47,0.04)]">
              <button
                type="button"
                className="flex h-12 w-12 items-center justify-center rounded-[1rem] bg-[#f1eee2] text-[#a94600] transition-all hover:bg-[#ece8db] active:scale-95"
                onClick={() => {
                  onPlayClick()
                  onPlayAudio(promptAudioUrl)
                }}
              >
                <Volume2 className="h-6 w-6" />
              </button>
              <div className="text-left">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8a7d70]">Pronunciation</p>
                <p className="mt-1 text-sm font-medium italic text-[#5f5951]">“{questionSentenceText || builtAnswerText || meaningText}”</p>
              </div>
            </div>
          ) : null}

          {isLetterOrderQuestion ? (
            <>
              <div className="flex flex-wrap justify-center gap-3">
                {selectedWords.map((wordIdx, idx) => (
                  <button
                    key={`selected-${wordIdx}-${idx}`}
                    type="button"
                    className="flex h-16 w-16 items-center justify-center rounded-[1.1rem] bg-white font-display text-[1.8rem] font-black text-[#a94600] shadow-[0_8px_18px_rgba(57,56,47,0.08)] transition-all active:translate-y-0.5"
                    onClick={() => onRemoveSelectedWord(idx)}
                    disabled={isAnswered}
                  >
                    {interactionWords[wordIdx]}
                  </button>
                ))}
                {Array.from({ length: remainingWordSlots }).map((_, index) => (
                  <div
                    key={`empty-slot-${index}`}
                    className="h-16 w-16 rounded-[1.1rem] border-2 border-dashed border-[#eadfce] bg-transparent"
                  />
                ))}
              </div>

              <div className="mt-8 flex flex-wrap justify-center gap-3">
                {wordOrderDisplayOrder.map((wordIndex) => {
                  const word = interactionWords[wordIndex]
                  const isUsed = selectedWords.includes(wordIndex)
                  return (
                    <button
                      key={wordIndex}
                      type="button"
                      className={cx(
                        'flex h-14 w-14 items-center justify-center rounded-[1rem] bg-white font-display text-2xl font-bold text-[#5f5951] shadow-[0_4px_0_0_#d6ccc0] transition-all duration-75',
                        isUsed ? 'pointer-events-none opacity-30 shadow-none' : 'active:translate-y-1 active:shadow-none',
                      )}
                      onClick={() => onAddSelectedWord(wordIndex)}
                      disabled={isAnswered || isUsed}
                    >
                      {word}
                    </button>
                  )
                })}
              </div>
            </>
          ) : (
            <>
              <div className="flex min-h-[132px] flex-wrap content-center items-center justify-center gap-3 rounded-[1.7rem] border-2 border-dashed border-[#d8cfc1] bg-white p-5">
                {selectedWords.length === 0 && !isAnswered ? (
                  <span className="text-sm font-semibold uppercase tracking-[0.12em] text-[#b0a498]">{orderPromptPlaceholder}</span>
                ) : null}
                {selectedWords.map((wordIdx, idx) => (
                  <button
                    key={`${wordIdx}-${idx}`}
                    type="button"
                    className="rounded-[1rem] bg-[#f1eee2] px-5 py-3 text-base font-black text-[#39382f] transition-all active:translate-y-0.5"
                    onClick={() => onRemoveSelectedWord(idx)}
                    disabled={isAnswered}
                  >
                    {interactionWords[wordIdx]}
                  </button>
                ))}
              </div>

              <div className="mt-8 flex flex-wrap justify-center gap-3">
                {wordOrderDisplayOrder.map((wordIndex) => {
                  const word = interactionWords[wordIndex]
                  const isUsed = selectedWords.includes(wordIndex)
                  return (
                    <button
                      key={wordIndex}
                      type="button"
                      className={cx(
                        'rounded-[1rem] bg-white px-5 py-3 text-base font-black text-[#191713] shadow-[0_8px_18px_rgba(57,56,47,0.05)] transition-all',
                        isUsed ? 'pointer-events-none opacity-30 shadow-none' : 'hover:bg-[#fff7ef] active:translate-y-0.5',
                      )}
                      onClick={() => onAddSelectedWord(wordIndex)}
                      disabled={isAnswered || isUsed}
                    >
                      {word}
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </section>
    )
  }

  return (
    <section className="mx-auto w-full max-w-md space-y-8 pt-1">
      <div className="space-y-3">
        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8a7d70]">
          {isLetterOrderQuestion ? 'Word Focus' : 'Word Order'}
        </span>
        <h2 className="font-display text-[2rem] font-bold leading-[1.12] tracking-[-0.04em] text-[#191713]">
          {renderPromptWithTrailingAccent(renderedPrompt)}
        </h2>
      </div>

      {isLetterOrderQuestion ? (
        <div className="relative flex justify-center">
          <div className="absolute -z-10 h-24 w-24 rotate-6 rounded-[1.6rem] bg-[#b9eeab]/35" />
          <div className="h-24 w-24 -rotate-3 overflow-hidden rounded-[1.35rem] border-4 border-white shadow-[0_14px_32px_rgba(57,56,47,0.12)]">
            <img alt="Spelling context" src={SPELLING_CONTEXT_IMAGE} className="h-full w-full object-cover" />
          </div>
        </div>
      ) : null}

      {buildCard}

      <div className="rounded-[2rem] bg-[#fdf9f1] px-6 py-8 shadow-[0_14px_34px_rgba(57,56,47,0.05)]">
        {isLetterOrderQuestion ? (
          <div className="text-center">
            <p className="font-display text-[2.5rem] font-extrabold tracking-[-0.05em] text-[#a94600]">
              {builtAnswerText || '—'}
            </p>
            <div className="mx-auto mt-4 h-1 w-48 rounded-full bg-[#d8cfc1]/55" />
          </div>
        ) : (
          <div className="flex min-h-[120px] flex-wrap content-center items-center justify-center gap-3">
            {selectedWords.length === 0 && !isAnswered ? (
              <span className="text-sm font-semibold uppercase tracking-[0.12em] text-[#b0a498]">{orderPromptPlaceholder}</span>
            ) : null}
            {selectedWords.map((wordIdx, idx) => (
              <button
                key={`${wordIdx}-${idx}`}
                type="button"
                className="rounded-[1rem] bg-white px-4 py-2.5 text-sm font-black text-[#39382f] shadow-[0_8px_18px_rgba(57,56,47,0.05)]"
                onClick={() => onRemoveSelectedWord(idx)}
                disabled={isAnswered}
              >
                {interactionWords[wordIdx]}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        {wordOrderDisplayOrder.map((wordIndex) => {
          const word = interactionWords[wordIndex]
          const isUsed = selectedWords.includes(wordIndex)
          return (
            <button
              key={wordIndex}
              type="button"
              className={cx(
                'flex items-center justify-center rounded-[1rem] bg-white font-display font-bold text-[#5f5951] shadow-[0_4px_0_0_#d6ccc0] transition-all duration-75',
                isLetterOrderQuestion ? 'h-14 w-14 text-2xl' : 'px-4 py-3 text-sm',
                isUsed ? 'pointer-events-none opacity-30 shadow-none' : 'active:translate-y-1 active:shadow-none',
              )}
              onClick={() => onAddSelectedWord(wordIndex)}
              disabled={isAnswered || isUsed}
            >
              {word}
            </button>
          )
        })}
      </div>
    </section>
  )
}

export function ExerciseBlock({
  exerciseData,
  isUltraShortViewport,
  isShortViewport,
  isDesktopViewport,
  lessonTitle,
  isListeningQuestion,
  isSpeakingQuestion,
  isContextResponseQuestion,
  isChoiceQuestion,
  isMatchingQuestion,
  isWordOrderQuestion,
  sourceText,
  renderedPrompt,
  renderedPromptParts,
  listeningHeading,
  choiceSupportText,
  questionSentenceText,
  shouldShowMeaningSentenceCard,
  meaningText,
  questionSentenceAudioUrl,
  questionSentenceComponents,
  interactionWords,
  listeningSupportText,
  listeningAudioUrl,
  listeningPromptDetail,
  isPlayingPrompt,
  speakingTarget,
  hasSpeakingReference,
  canPracticeSpeaking,
  isRecordingSpeech,
  isComparingSpeech,
  recordedSpeechUrl,
  speakingError,
  speakingFeedback,
  selectedOption,
  selectedWords,
  selectedMatches,
  selectedMatchingLeftId,
  matchingLeftItems,
  matchingRightItems,
  orderPromptPlaceholder,
  wordOrderDisplayOrder,
  isAnswered,
  onPlayAudio,
  onPlayClick,
  onToggleListeningPrompt,
  onPlayListeningSlow,
  onToggleRecording,
  onReplayRecording,
  onSubmitSpeakingAttempt,
  onSelectOption,
  onSelectMatchingLeft,
  onSelectMatchingRight,
  getMatchingRightItem,
  onRemoveSelectedWord,
  onAddSelectedWord,
}: {
  exerciseData: ExerciseQuestion
  isUltraShortViewport: boolean
  isShortViewport: boolean
  isDesktopViewport: boolean
  lessonTitle?: string
  isListeningQuestion: boolean
  isSpeakingQuestion: boolean
  isContextResponseQuestion: boolean
  isChoiceQuestion: boolean
  isMatchingQuestion: boolean
  isWordOrderQuestion: boolean
  inlineSourceComponent: LearningContentComponent | null
  sourceText: string
  renderedPrompt: string
  renderedPromptParts: string[]
  listeningHeading: string
  choiceSupportText: string
  questionSentenceText: string
  shouldShowMeaningSentenceCard: boolean
  meaningText: string
  questionSentenceAudioUrl?: string
  questionSentenceComponents: LearningContentComponent[]
  interactionWords: string[]
  listeningSupportText: string
  listeningAudioUrl?: string
  listeningPromptDetail: string
  isPlayingPrompt: boolean
  speakingTarget: SpeakingTarget | null
  hasSpeakingReference: boolean
  canPracticeSpeaking: boolean
  isRecordingSpeech: boolean
  isComparingSpeech: boolean
  recordedSpeechUrl: string | null
  speakingError: string
  speakingFeedback: SpeakingFeedback | null
  selectedOption: number | null
  selectedWords: number[]
  selectedMatches: Record<string, string>
  selectedMatchingLeftId: string | null
  matchingLeftItems: QuestionMatchingDisplayItem[]
  matchingRightItems: QuestionMatchingDisplayItem[]
  orderPromptPlaceholder: string
  wordOrderDisplayOrder: number[]
  isAnswered: boolean
  onPlayAudio: AudioPlayerFn
  onPlayClick: () => void
  onToggleListeningPrompt: () => void
  onPlayListeningSlow: () => void
  onToggleRecording: () => void
  onReplayRecording: () => void
  onSubmitSpeakingAttempt: () => void
  onSelectOption: (index: number) => void
  onSelectMatchingLeft: (id: string) => void
  onSelectMatchingRight: (id: string) => void
  getMatchingRightItem: (id: string) => QuestionMatchingDisplayItem | null
  onRemoveSelectedWord: (selectedIndex: number) => void
  onAddSelectedWord: (wordIndex: number) => void
}) {
  const sourceKind = exerciseData.source?.kind || exerciseData.sourceType
  const questionChipLabel = isListeningQuestion
    ? 'Translation Task'
    : sourceKind === 'sentence'
      ? 'Sentence Focus'
      : sourceKind === 'expression'
        ? 'Expression Focus'
        : 'Word Focus'

  void isUltraShortViewport
  void isShortViewport
  void speakingFeedback
  void onPlayListeningSlow
  void onSubmitSpeakingAttempt

  return (
    <section className="animate-in fade-in duration-500">
      {isChoiceQuestion ? (
        <TranslationExerciseSurface
          exerciseData={exerciseData}
          isDesktopViewport={isDesktopViewport}
          isUltraShortViewport={isUltraShortViewport}
          isShortViewport={isShortViewport}
          isListeningQuestion={isListeningQuestion}
          isContextResponseQuestion={isContextResponseQuestion}
          sourceText={sourceText}
          renderedPrompt={renderedPrompt}
          renderedPromptParts={renderedPromptParts}
          listeningHeading={listeningHeading}
          choiceSupportText={choiceSupportText}
          questionChipLabel={questionChipLabel}
          questionSentenceText={questionSentenceText}
          shouldShowMeaningSentenceCard={shouldShowMeaningSentenceCard}
          meaningText={meaningText}
          questionSentenceAudioUrl={questionSentenceAudioUrl}
          questionSentenceComponents={questionSentenceComponents}
          listeningSupportText={listeningSupportText}
          listeningAudioUrl={listeningAudioUrl}
          listeningPromptDetail={listeningPromptDetail}
          isPlayingPrompt={isPlayingPrompt}
          selectedOption={selectedOption}
          isAnswered={isAnswered}
          onPlayAudio={onPlayAudio}
          onPlayClick={onPlayClick}
          onToggleListeningPrompt={onToggleListeningPrompt}
          onSelectOption={onSelectOption}
        />
      ) : null}

      {isSpeakingQuestion && speakingTarget ? (
        <SpeakingExerciseSurface
          isDesktopViewport={isDesktopViewport}
          speakingTarget={speakingTarget}
          meaningText={meaningText}
          canPracticeSpeaking={canPracticeSpeaking}
          hasSpeakingReference={hasSpeakingReference}
          isRecordingSpeech={isRecordingSpeech}
          isComparingSpeech={isComparingSpeech}
          recordedSpeechUrl={recordedSpeechUrl}
          speakingError={speakingError}
          isAnswered={isAnswered}
          onPlayAudio={onPlayAudio}
          onPlayClick={onPlayClick}
          onToggleRecording={onToggleRecording}
          onReplayRecording={onReplayRecording}
        />
      ) : null}

      {isMatchingQuestion ? (
        <MatchingExerciseSurface
          isDesktopViewport={isDesktopViewport}
          lessonTitle={lessonTitle}
          isImageMatching={exerciseData.subtype === 'mt-match-image'}
          isAnswered={isAnswered}
          selectedMatches={selectedMatches}
          selectedMatchingLeftId={selectedMatchingLeftId}
          matchingLeftItems={matchingLeftItems}
          matchingRightItems={matchingRightItems}
          getMatchingRightItem={getMatchingRightItem}
          onSelectMatchingLeft={onSelectMatchingLeft}
          onSelectMatchingRight={onSelectMatchingRight}
        />
      ) : null}

      {isWordOrderQuestion ? (
        <WordOrderExerciseSurface
          exerciseData={exerciseData}
          isDesktopViewport={isDesktopViewport}
          renderedPrompt={renderedPrompt}
          questionSentenceText={questionSentenceText}
          shouldShowMeaningSentenceCard={shouldShowMeaningSentenceCard}
          meaningText={meaningText}
          questionSentenceAudioUrl={questionSentenceAudioUrl}
          questionSentenceComponents={questionSentenceComponents}
          interactionWords={interactionWords}
          selectedWords={selectedWords}
          orderPromptPlaceholder={orderPromptPlaceholder}
          wordOrderDisplayOrder={wordOrderDisplayOrder}
          isAnswered={isAnswered}
          onPlayAudio={onPlayAudio}
          onPlayClick={onPlayClick}
          onRemoveSelectedWord={onRemoveSelectedWord}
          onAddSelectedWord={onAddSelectedWord}
        />
      ) : null}
    </section>
  )
}
