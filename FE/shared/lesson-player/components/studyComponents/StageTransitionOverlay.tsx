import { cx } from './StudyUi'

export function StageTransitionOverlay({
  title,
  subtitle,
  stageXpEarned,
  stageMistakesCount,
  isSavingStage,
  isLastStage,
  isShortViewport,
  isUltraShortViewport,
  isVeryShortViewport,
}: {
  title: string
  subtitle: string
  stageXpEarned: number
  stageMistakesCount: number
  isSavingStage: boolean
  isLastStage: boolean
  isShortViewport: boolean
  isUltraShortViewport: boolean
  isVeryShortViewport: boolean
}) {
  return (
    <div className="pointer-events-auto fixed inset-0 isolate z-[120]" style={{ backgroundColor: 'hsl(var(--background))', opacity: 1 }}>
      <div className="relative flex min-h-full items-center justify-center px-4">
        <div
          className={cx(
            'relative w-full max-w-md overflow-hidden rounded-[2.2rem] border border-primary/15 bg-[linear-gradient(155deg,rgba(255,255,255,1),rgba(255,247,237,0.98))] text-center shadow-[0_24px_80px_rgba(15,23,42,0.22)]',
            isUltraShortViewport ? 'p-4 sm:p-5' : isShortViewport ? 'p-5 sm:p-6' : 'p-6 sm:p-8',
          )}
        >
          <div className="absolute -left-10 top-1/2 h-32 w-32 -translate-y-1/2 animate-pulse rounded-full bg-primary/15 blur-3xl" />
          <div className="absolute -right-6 top-8 h-24 w-24 animate-pulse rounded-full bg-secondary/20 blur-3xl" />
          <div className="absolute inset-x-10 top-6 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
          <div className="pointer-events-none absolute inset-0 rounded-[2.2rem] border border-white/60" />
          <div className={cx('relative mx-auto mb-5 flex items-center justify-center', isUltraShortViewport ? 'h-14 w-14' : isShortViewport ? 'h-16 w-16' : 'h-20 w-20')}>
            <div className="absolute inset-0 animate-ping rounded-full border-2 border-primary/20" />
            <div className="absolute inset-2 animate-pulse rounded-full bg-primary/15" />
            <div className={cx('relative rounded-full bg-primary font-black text-primary-foreground shadow-lg shadow-primary/25', isUltraShortViewport ? 'px-2.5 py-1.5 text-base' : isShortViewport ? 'px-3 py-2 text-lg' : 'px-4 py-3 text-xl')}>
              +{stageXpEarned}
            </div>
          </div>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-primary/60">Stage Complete</p>
          <h2 className={cx('mt-4 font-black text-foreground', isUltraShortViewport ? 'text-xl sm:text-2xl' : isShortViewport ? 'text-2xl sm:text-3xl' : 'text-3xl sm:text-4xl')}>
            {title}
          </h2>
          <p className={cx('mt-3 font-semibold uppercase tracking-[0.16em] text-foreground/50', isUltraShortViewport ? 'text-[11px]' : isShortViewport ? 'text-xs' : 'text-sm')}>
            {subtitle}
          </p>
          <div className={cx('mt-6 grid gap-3', isVeryShortViewport && 'mt-4')}>
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
            <div className="absolute inset-y-0 left-0 w-1/2 animate-[pulse_1.1s_ease-in-out_infinite] rounded-full bg-[linear-gradient(90deg,#fb923c_0%,#f59e0b_40%,#34d399_100%)]" />
          </div>
          <p className={cx('mt-5 font-semibold text-foreground/55', isUltraShortViewport ? 'text-[11px]' : isShortViewport ? 'text-xs' : 'text-sm')}>
            {isSavingStage ? 'Saving progress...' : isLastStage ? 'Wrapping up...' : 'Loading next stage...'}
          </p>
        </div>
      </div>
    </div>
  )
}
