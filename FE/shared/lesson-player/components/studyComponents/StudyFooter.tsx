import { ArrowRight, Check, Loader2, X } from 'lucide-react'
import { Button, cx } from './StudyUi'
import { KelaMascot } from '../mascot/KelaMascot'

export function StudyFooter({
  isAnswered,
  isCorrect,
  isExerciseBlock,
  isSpeakingQuestion,
  speakingUnavailable,
  preview,
  answerStatusLabel,
  explanation,
  correctAnswer,
  canCheck,
  canCheckSpeaking,
  isRecordingSpeech,
  isCheckingSpeakingAnswer,
  isShortViewport,
  isUltraShortViewport,
  isVeryShortViewport,
  onCheck,
  onCheckSpeaking,
  onNext,
}: {
  isAnswered: boolean
  isCorrect: boolean
  isExerciseBlock: boolean
  isSpeakingQuestion: boolean
  /** Speaking question with no reference audio: cannot be scored, so it is skippable. */
  speakingUnavailable?: boolean
  preview?: boolean
  answerStatusLabel: string
  explanation?: string
  /** Shown after a wrong answer so the learner sees what was right. */
  correctAnswer?: string
  canCheck: boolean
  canCheckSpeaking?: boolean
  isRecordingSpeech?: boolean
  isCheckingSpeakingAnswer?: boolean
  isShortViewport: boolean
  isUltraShortViewport: boolean
  isVeryShortViewport: boolean
  onCheck: () => void
  onCheckSpeaking?: () => void
  onNext: () => void
}) {
  const statusLabel = speakingUnavailable
    ? 'Audio practice unavailable for this item.'
    : isSpeakingQuestion
      ? (isCorrect ? 'Passed.' : 'Not quite. Try again.')
      : answerStatusLabel
  const showStatus = isAnswered || Boolean(isCheckingSpeakingAnswer)

  return (
    <footer className="fixed bottom-0 left-0 right-0 z-40 bg-gradient-to-t from-[#fffbff] via-[#fffbff]/94 to-transparent">
      <div
        className={cx(
          'mx-auto max-w-5xl',
          isUltraShortViewport ? 'px-3 pb-4 pt-3' : isShortViewport ? 'px-4 pb-6 pt-4' : 'px-6 pb-8 pt-5',
        )}
      >
        <div className="mx-auto max-w-3xl space-y-4" aria-live="polite">
          {showStatus ? (
            <div
              key={`${isAnswered ? (isCorrect ? 'right' : 'wrong') : 'pending'}-${isCheckingSpeakingAnswer ? 'checking' : ''}`}
              className={cx(
                'kela-slide-up rounded-[1.6rem] border px-4 py-3 shadow-[0_12px_30px_rgba(57,56,47,0.06)] backdrop-blur-xl',
                isAnswered
                  ? isCorrect
                    ? 'border-[#d7f0dc] bg-[#edf7ea]/92 text-[#2d7c37]'
                    : 'border-[#f6d4ce] bg-[#fff1ee]/92 text-[#b23d21]'
                  : 'border-[#efe4d8] bg-white/90 text-[#8a7d70]',
              )}
            >
              <div
                className={cx(
                  'flex items-center gap-3',
                  isAnswered && !isCheckingSpeakingAnswer && (isCorrect ? 'kela-pop' : 'kela-shake'),
                )}
              >
                {/* Kela reacts to the answer; the badge keeps a tick or cross so the result never rests on colour. */}
                <div className={cx('relative shrink-0', isUltraShortViewport ? 'w-14' : isShortViewport ? 'w-[4.5rem]' : 'w-24')}>
                  <KelaMascot
                    mood={isCheckingSpeakingAnswer || !isAnswered ? 'thinking' : isCorrect ? 'happy' : 'sad'}
                    size={isUltraShortViewport ? 56 : isShortViewport ? 72 : 96}
                    decorative
                  />
                  <span
                    className={cx(
                      'absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white shadow-sm',
                      isCheckingSpeakingAnswer || !isAnswered
                        ? 'bg-[#efe4d8] text-[#8a7d70]'
                        : isCorrect
                          ? 'bg-[#2d7c37] text-white'
                          : 'bg-[#b23d21] text-white',
                    )}
                    aria-hidden="true"
                  >
                    {isCheckingSpeakingAnswer || !isAnswered ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : isCorrect ? (
                      <Check className="h-3.5 w-3.5 stroke-[3.5px]" />
                    ) : (
                      <X className="h-3.5 w-3.5 stroke-[3.5px]" />
                    )}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className={cx('font-display font-black leading-tight', isUltraShortViewport ? 'text-sm' : isShortViewport ? 'text-base' : 'text-lg')}>
                    {isCheckingSpeakingAnswer ? 'Checking your answer...' : statusLabel}
                  </p>
                  {isAnswered && !isCorrect && correctAnswer ? (
                    <p className={cx('mt-1 break-words font-medium leading-snug text-[#39382f]', isUltraShortViewport ? 'text-xs' : 'text-sm')}>
                      <span className="font-bold text-[#b23d21]">Correct answer: </span>
                      <span className="font-bold">{correctAnswer}</span>
                    </p>
                  ) : null}
                  {isAnswered && !isCorrect && explanation && !isVeryShortViewport ? (
                    <p className={cx('mt-1 font-medium leading-relaxed opacity-90', isUltraShortViewport ? 'text-[11px]' : 'text-sm')}>{explanation}</p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : preview ? (
            <p className="text-center text-xs font-bold uppercase tracking-[0.16em] text-[#8a7d70]">Preview mode</p>
          ) : null}

          <div className="flex flex-col items-center gap-2">
            {isExerciseBlock ? (
              isAnswered ? (
                <Button
                  size="lg"
                  className={cx(
                    'h-16 w-full max-w-3xl rounded-2xl font-display text-lg font-extrabold uppercase tracking-[0.05em]',
                    isUltraShortViewport && 'h-14 text-base',
                  )}
                  onClick={onNext}
                >
                  Continue
                  <ArrowRight className="h-5 w-5" />
                </Button>
              ) : isSpeakingQuestion && !speakingUnavailable ? (
                <Button
                  size="lg"
                  className={cx(
                    'h-16 w-full max-w-3xl rounded-2xl font-display text-lg font-extrabold uppercase tracking-[0.05em]',
                    isUltraShortViewport && 'h-14 text-base',
                    (!(canCheckSpeaking && !isCheckingSpeakingAnswer) || isRecordingSpeech) && 'opacity-40 grayscale',
                  )}
                  onClick={onCheckSpeaking}
                  disabled={!canCheckSpeaking || Boolean(isCheckingSpeakingAnswer) || Boolean(isRecordingSpeech)}
                >
                  {isCheckingSpeakingAnswer ? 'Checking...' : 'Check Answer'}
                  {!isCheckingSpeakingAnswer ? <ArrowRight className="h-5 w-5" /> : null}
                </Button>
              ) : (
                <Button
                  size="lg"
                  className={cx(
                    'h-16 w-full max-w-3xl rounded-2xl font-display text-lg font-extrabold uppercase tracking-[0.05em]',
                    isUltraShortViewport && 'h-14 text-base',
                    !canCheck && 'opacity-40 grayscale',
                  )}
                  onClick={onCheck}
                  disabled={!canCheck}
                >
                  Check Answer
                  <ArrowRight className="h-5 w-5" />
                </Button>
              )
            ) : (
              <Button
                size="lg"
                className={cx(
                  'h-16 w-full max-w-3xl rounded-2xl font-display text-lg font-extrabold uppercase tracking-[0.05em]',
                  isUltraShortViewport && 'h-14 text-base',
                )}
                onClick={onNext}
              >
                Continue
                <ArrowRight className="h-5 w-5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </footer>
  )
}
