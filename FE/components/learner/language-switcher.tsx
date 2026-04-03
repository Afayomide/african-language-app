'use client'

import type { Language } from '@/types'
import { cn } from '@/lib/utils'

export type LearnerLanguageSummary = {
  languageId?: string | null
  languageCode: Language
  isEnrolled: boolean
  isActive: boolean
  totalXp: number
  streakDays: number
  longestStreak: number
  dailyGoalMinutes: number
  todayMinutes: number
  completedLessonsCount: number
  totalLessonsCount?: number
  dailyProgressPercent?: number
  courseProgressPercent?: number
}

type Props = {
  languages: LearnerLanguageSummary[]
  activeLanguage?: Language
  onSelect?: (language: Language) => void
  disabled?: boolean
  className?: string
  compact?: boolean
}

const LANGUAGE_LABELS: Record<Language, { title: string; short: string }> = {
  yoruba: { title: 'Yoruba', short: 'YO' },
  igbo: { title: 'Igbo', short: 'IG' },
  hausa: { title: 'Hausa', short: 'HA' },
}

export function LanguageSwitcher({
  languages,
  activeLanguage,
  onSelect,
  disabled = false,
  className,
  compact = false,
}: Props) {
  if (!languages.length) return null

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {languages.map((language) => {
        const isActive = (activeLanguage || '').toLowerCase() === language.languageCode || language.isActive
        const meta = LANGUAGE_LABELS[language.languageCode]
        return (
          <button
            key={language.languageId || language.languageCode}
            type="button"
            disabled={disabled || isActive || !onSelect}
            onClick={() => onSelect?.(language.languageCode)}
            className={cn(
              'inline-flex items-center gap-3 rounded-full border px-4 py-2 text-left transition-all disabled:cursor-default',
              compact ? 'min-h-10' : 'min-h-12',
              isActive
                ? 'border-[#ffdeac] bg-[#ffeddc] text-[#7b3400] shadow-[0_10px_24px_rgba(169,70,0,0.10)]'
                : 'border-[#ebe4db] bg-white text-[#625f57] hover:border-[#e6c59f] hover:bg-[#fff7ef] hover:text-[#7b3400]',
              disabled && !isActive && 'opacity-70',
            )}
          >
            <span
              className={cn(
                'flex items-center justify-center rounded-full font-black uppercase tracking-[0.18em]',
                compact ? 'h-7 w-7 text-[10px]' : 'h-8 w-8 text-[11px]',
                isActive ? 'bg-[#a94600] text-white' : 'bg-[#f4ebe1] text-[#8a7d70]',
              )}
            >
              {meta.short}
            </span>
            <span className="flex flex-col">
              <span className={cn('font-bold', compact ? 'text-xs' : 'text-sm')}>{meta.title}</span>
              {!compact ? (
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8a7d70]">
                  {language.totalXp} XP · {language.streakDays} day streak
                </span>
              ) : null}
            </span>
          </button>
        )
      })}
    </div>
  )
}
