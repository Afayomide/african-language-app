import { ArrowRight, Check, Loader2, X } from 'lucide-react'
import { Button, cx } from './StudyUi'

export function StudyFooter({
  isAnswered,
  isCorrect,
  isExerciseBlock,
  isSpeakingQuestion,
  preview,
  answerStatusLabel,
  explanation,
  canCheck,
  canCheckSpeaking,
  isSpeakingBusy,
  isSavingStage,
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
  preview?: boolean
  answerStatusLabel: string
  explanation?: string
  canCheck: boolean
  canCheckSpeaking?: boolean
  isSpeakingBusy?: boolean
  isSavingStage: boolean
  isShortViewport: boolean
  isUltraShortViewport: boolean
  isVeryShortViewport: boolean
  onCheck: () => void
  onCheckSpeaking?: () => void
  onNext: () => void
}) {
  const statusLabel = isSpeakingQuestion ? (isCorrect ? 'Passed.' : 'Not quite. Try again.') : answerStatusLabel
  const showStatus = isAnswered || Boolean(isSpeakingBusy)

  return (
    <footer className="fixed bottom-0 left-0 right-0 z-40 bg-gradient-to-t from-[#fffbff] via-[#fffbff]/94 to-transparent">
      <div
        className={cx(
          'mx-auto max-w-5xl',
          isUltraShortViewport ? 'px-3 pb-4 pt-3' : isShortViewport ? 'px-4 pb-6 pt-4' : 'px-6 pb-8 pt-5',
        )}
      >
        <div className="mx-auto max-w-3xl space-y-4">
          {showStatus ? (
            <div
              className={cx(
                'rounded-[1.6rem] border px-4 py-3 shadow-[0_12px_30px_rgba(57,56,47,0.06)] backdrop-blur-xl',
                isAnswered
                  ? isCorrect
                    ? 'border-[#d7f0dc] bg-[#edf7ea]/92 text-[#2d7c37]'
                    : 'border-[#f6d4ce] bg-[#fff1ee]/92 text-[#b23d21]'
                  : 'border-[#efe4d8] bg-white/90 text-[#8a7d70]',
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cx(
                    'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm',
                    isAnswered ? (isCorrect ? 'text-[#2d7c37]' : 'text-[#b23d21]') : 'text-[#8a7d70]',
                  )}
                >
                  {isSpeakingBusy ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : isAnswered ? (
                    isCorrect ? <Check className="h-5 w-5 stroke-[3px]" /> : <X className="h-5 w-5 stroke-[3px]" />
                  ) : (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className={cx('font-display font-black leading-tight', isUltraShortViewport ? 'text-sm' : isShortViewport ? 'text-base' : 'text-lg')}>
                    {isSpeakingBusy ? 'Checking your answer...' : statusLabel}
                  </p>
                  {isAnswered && !isCorrect && explanation && !isVeryShortViewport ? (
                    <p className={cx('mt-1 font-medium leading-relaxed opacity-90', isUltraShortViewport ? 'text-[11px]' : 'text-sm')}>{explanation}</p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : preview ? (
            <p className="text-center text-xs font-bold uppercase tracking-[0.16em] text-[#8a7d70]">Preview mode</p>
          ) : null}

          <div className="flex justify-center">
            {isExerciseBlock ? (
              isAnswered ? (
                <Button
                  size="lg"
                  className={cx(
                    'h-16 w-full max-w-3xl rounded-2xl font-display text-lg font-extrabold uppercase tracking-[0.05em]',
                    isUltraShortViewport && 'h-14 text-base',
                  )}
                  onClick={onNext}
                  disabled={isSavingStage}
                >
                  Continue
                  <ArrowRight className="h-5 w-5" />
                </Button>
              ) : isSpeakingQuestion ? (
                <Button
                  size="lg"
                  className={cx(
                    'h-16 w-full max-w-3xl rounded-2xl font-display text-lg font-extrabold uppercase tracking-[0.05em]',
                    isUltraShortViewport && 'h-14 text-base',
                    !(canCheckSpeaking && !isSpeakingBusy) && 'opacity-40 grayscale',
                  )}
                  onClick={onCheckSpeaking}
                  disabled={!canCheckSpeaking || Boolean(isSpeakingBusy)}
                >
                  {isSpeakingBusy ? 'Checking...' : 'Check Answer'}
                  {!isSpeakingBusy ? <ArrowRight className="h-5 w-5" /> : null}
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
