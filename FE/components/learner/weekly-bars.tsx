import { cn } from '@/lib/utils'

export type LearnerWeeklyOverviewItem = {
  day: string
  completed: boolean
  minutes: number
  dateKey?: string
  isToday?: boolean
}

export const DEFAULT_LEARNER_WEEK: LearnerWeeklyOverviewItem[] = [
  { day: 'Mon', completed: false, minutes: 0 },
  { day: 'Tue', completed: false, minutes: 0 },
  { day: 'Wed', completed: false, minutes: 0 },
  { day: 'Thu', completed: false, minutes: 0 },
  { day: 'Fri', completed: false, minutes: 0 },
  { day: 'Sat', completed: false, minutes: 0 },
  { day: 'Sun', completed: false, minutes: 0 },
]

export function WeeklyBars({
  data,
  compact,
}: {
  data: LearnerWeeklyOverviewItem[]
  compact: boolean
}) {
  const normalized = data.length ? data : DEFAULT_LEARNER_WEEK
  const maxMinutes = Math.max(...normalized.map((item) => item.minutes), 1)
  const fallbackTodayKey = new Date().toISOString().slice(0, 10)

  return (
    <div className={cn('flex items-end justify-between gap-3', compact ? 'h-48' : 'h-56 px-4')}>
      {normalized.map((item) => {
        const shortDay = item.day.slice(0, 3)
        const isToday = Boolean(item.isToday ?? (item.dateKey ? item.dateKey === fallbackTodayKey : false))
        const ratio = item.minutes > 0 ? item.minutes / maxMinutes : 0
        const barHeight = compact ? Math.max(32, Math.round(32 + ratio * 88)) : Math.max(40, Math.round(40 + ratio * 132))

        return (
          <div key={`${item.dateKey || item.day}-${shortDay}`} className="flex h-full flex-1 flex-col items-center gap-3">
            <div
              className={cn(
                'relative w-full flex-1 self-stretch overflow-hidden rounded-full bg-[#ece8db]',
                compact ? 'max-h-[132px]' : 'max-h-[180px]',
              )}
            >
              <div
                className={cn(
                  'absolute inset-x-0 bottom-0 rounded-full',
                  isToday
                    ? 'bg-[linear-gradient(180deg,#ffae86,#a94600)]'
                    : item.minutes > 0
                      ? 'bg-[linear-gradient(180deg,#d6b48b,#c89234)]'
                      : 'bg-transparent',
                )}
                style={{ height: `${barHeight}px` }}
              />
            </div>
            <span className={cn('text-[10px] font-bold uppercase', isToday ? 'text-[#a94600]' : 'text-[#8a7d70]')}>{shortDay}</span>
          </div>
        )
      })}
    </div>
  )
}
