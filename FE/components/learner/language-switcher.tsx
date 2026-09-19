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
  // Languages the learner can start but hasn't enrolled in yet (the backend's active languages).
  availableLanguages?: string[]
  activeLanguage?: Language
  onSelect?: (language: Language) => void
  disabled?: boolean
  className?: string
  compact?: boolean
  labelOnly?: boolean
}

const LANGUAGE_LABELS: Record<Language, { title: string; short: string }> = {
  yoruba: { title: 'Yoruba', short: 'YO' },
  igbo: { title: 'Igbo', short: 'IG' },
  hausa: { title: 'Hausa', short: 'HA' },
}

function isKnownLanguage(code: string): code is Language {
  return Object.prototype.hasOwnProperty.call(LANGUAGE_LABELS, code)
}

function notEnrolledSummary(languageCode: Language): LearnerLanguageSummary {
  return {
    languageCode,
    isEnrolled: false,
    isActive: false,
    totalXp: 0,
    streakDays: 0,
    longestStreak: 0,
    dailyGoalMinutes: 0,
    todayMinutes: 0,
    completedLessonsCount: 0,
  }
}

export function LanguageSwitcher({
  languages: enrolledLanguages,
  availableLanguages = [],
  activeLanguage,
  onSelect,
  disabled = false,
  className,
  compact = false,
  labelOnly = false,
}: Props) {
  const enrolledCodes = new Set(enrolledLanguages.map((language) => language.languageCode))
  const languages = [
    ...enrolledLanguages.filter((language) => isKnownLanguage(language.languageCode)),
    ...availableLanguages
      .filter((code): code is Language => isKnownLanguage(code) && !enrolledCodes.has(code))
      .map(notEnrolledSummary),
  ]
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
            {!labelOnly ? (
              <span
                className={cn(
                  'flex items-center justify-center rounded-full font-black uppercase tracking-[0.18em]',
                  compact ? 'h-7 w-7 text-[10px]' : 'h-8 w-8 text-[11px]',
                  isActive ? 'bg-[#a94600] text-white' : 'bg-[#f4ebe1] text-[#8a7d70]',
                )}
              >
                {meta.short}
              </span>
            ) : null}
            <span className="flex flex-col">
              <span className={cn('font-bold', compact ? 'text-xs' : 'text-sm')}>{meta.title}</span>
              {!compact ? (
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8a7d70]">
                  {language.isEnrolled
                    ? `${language.totalXp} XP · ${language.streakDays} day streak`
                    : 'Start learning'}
                </span>
              ) : null}
            </span>
          </button>
        )
      })}
    </div>
  )
}
