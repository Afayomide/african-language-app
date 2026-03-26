import { X } from 'lucide-react'
import { Button, cx } from './StudyUi'

export function StudyHeader({
  onExit,
  preview,
  progress,
  isStageComplete,
  isShortViewport,
  isUltraShortViewport,
  immersiveExerciseChrome,
}: {
  onExit: () => void
  preview?: boolean
  progress: number
  xpEarned: number
  isStageComplete: boolean
  isShortViewport: boolean
  isUltraShortViewport: boolean
  immersiveExerciseChrome?: boolean
}) {
  const pct = Math.min(100, Math.max(0, Math.round(progress)))

  const closeButton = (
    <Button
      variant="ghost"
      size="icon"
      onClick={onExit}
      aria-label={preview ? 'Exit preview' : 'Exit lesson'}
      className={cx(
        'shrink-0 rounded-full border border-transparent text-[#7b3400] transition-all hover:bg-[#ffeddc] hover:text-[#5b2b03]',
        isUltraShortViewport ? 'h-8 w-8' : isShortViewport ? 'h-9 w-9' : 'h-10 w-10',
      )}
    >
      <X className={cx(isUltraShortViewport ? 'h-4 w-4' : 'h-5 w-5')} />
    </Button>
  )

  const progressTrack = (
    <div className={cx('relative w-full overflow-hidden griot-progress-track', immersiveExerciseChrome ? 'h-2.5 sm:h-3' : 'h-3 sm:h-3.5')}>
      <div className="h-full griot-progress-fill transition-all duration-700 ease-out" style={{ width: `${pct}%` }} />
    </div>
  )

  return (
    <header
      className={cx(
        'sticky top-0 z-50 shrink-0 px-4 bg-transparent',
        isStageComplete && 'pointer-events-none opacity-0',
        isShortViewport && 'px-3',
      )}
    >
      <div
        className={cx(
          'mx-auto flex w-full items-center gap-4',
          immersiveExerciseChrome ? 'max-w-5xl' : 'max-w-4xl',
          isUltraShortViewport ? 'h-14 gap-2' : isShortViewport ? 'h-16 gap-3' : immersiveExerciseChrome ? 'h-[4.5rem]' : 'h-20',
        )}
      >
        {closeButton}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="min-w-0 flex-1">{progressTrack}</div>
          <span
            className={cx(
              'shrink-0 font-body font-black text-foreground/60',
              isUltraShortViewport ? 'text-[11px]' : isShortViewport ? 'text-xs' : immersiveExerciseChrome ? 'text-xs uppercase tracking-wide' : 'text-sm',
            )}
          >
            {immersiveExerciseChrome ? `${pct}%` : `${pct}%`}
          </span>
        </div>
      </div>
    </header>
  )
}
