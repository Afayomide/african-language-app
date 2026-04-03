'use client'

import {
  Award,
  BookOpen,
  Flame,
  Languages,
  Sparkles,
  Trophy,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Language } from '@/types'
import type { LearnerLanguageSummary } from '@/components/learner/language-switcher'

export const DEFAULT_LEARNER_AVATAR =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuChHsMGj_MWqxZDMDUlyYwVvVcrjDU8deEgWcVtkFJoD-tvNp2dyxs94WERV7pwX_Xzdq62PkBrGD4afYfXJTdfZAbSF9gqcECVjLD23Gp5drdCF-ZcPimXPHdRQuDjlBWRzjIR_JOxQSVC5q-XIbc9dCMPFB9UMuIL_TR8HTQwsqqcVTNwrVVfH4PQsROCSnZDQRTY9nUk-gPBAyasFZdIsnvKZLbABsZUGrVYWQb9P1ypIxJYpcY0yWP-qp_m9f4HKxerXKLzL-OK'

const LANGUAGE_META: Record<Language, { icon: LucideIcon; badge: string; badgeText: string; progress: string; title: string }> = {
  yoruba: {
    icon: Languages,
    badge: 'bg-[#ffdeac] text-[#6e4b00]',
    badgeText: 'text-[#865d00]',
    progress: 'bg-[#a94600]',
    title: 'Yoruba',
  },
  igbo: {
    icon: BookOpen,
    badge: 'bg-[#b9eeab]/55 text-[#2d5a27]',
    badgeText: 'text-[#416f39]',
    progress: 'bg-[#416f39]',
    title: 'Igbo',
  },
  hausa: {
    icon: Sparkles,
    badge: 'bg-[#ffeddc] text-[#8b3900]',
    badgeText: 'text-[#8b3900]',
    progress: 'bg-[#865d00]',
    title: 'Hausa',
  },
}

const ACHIEVEMENT_META: Record<
  string,
  { icon: LucideIcon; accent: 'primary' | 'secondary' | 'tertiary'; description: string }
> = {
  'First Step': {
    icon: Sparkles,
    accent: 'primary',
    description: 'Completed your first lesson in the archive.',
  },
  'On Fire': {
    icon: Flame,
    accent: 'secondary',
    description: 'Kept your learning streak active and visible.',
  },
  'Perfect Score': {
    icon: Trophy,
    accent: 'tertiary',
    description: 'Finished a stage without missing a question.',
  },
}

function accentClasses(accent: 'primary' | 'secondary' | 'tertiary') {
  if (accent === 'secondary') {
    return {
      surface: 'bg-[#ffdeac]/70 text-[#865d00]',
      icon: 'text-[#865d00]',
    }
  }
  if (accent === 'tertiary') {
    return {
      surface: 'bg-[#b9eeab]/55 text-[#2d5a27]',
      icon: 'text-[#2d5a27]',
    }
  }
  return {
    surface: 'bg-[#ffeddc] text-[#8b3900]',
    icon: 'text-[#a94600]',
  }
}

export function buildLearnerTagline(languages: LearnerLanguageSummary[] = [], username?: string | null) {
  const enrolled = languages.filter((item) => item.isEnrolled).length
  if (enrolled >= 2) return 'Polyglot Explorer'
  if (username) return `@${username}`
  return 'Language Explorer'
}

export function formatMemberSince(value?: string | Date | null) {
  if (!value) return 'Member recently'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Member recently'
  return `Member since ${date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`
}

export function resolveAchievementMeta(title: string) {
  const exact = ACHIEVEMENT_META[title]
  if (exact) return exact
  return {
    icon: Award,
    accent: 'secondary' as const,
    description: 'Reached another milestone in your learning path.',
  }
}

export function LearnerAvatar({
  src,
  alt,
  size = 'md',
  editable = false,
  onEdit,
}: {
  src?: string | null
  alt: string
  size?: 'sm' | 'md' | 'lg'
  editable?: boolean
  onEdit?: () => void
}) {
  const dimensions = size === 'lg' ? 'h-32 w-32' : size === 'sm' ? 'h-20 w-20' : 'h-24 w-24'
  const wrapperPad = size === 'lg' ? 'p-1.5' : 'p-1'
  const buttonSize = size === 'lg' ? 'h-10 w-10' : 'h-9 w-9'

  return (
    <div className="relative">
      <div className={cn('rounded-full bg-[linear-gradient(135deg,#a94600,#ffae86)]', dimensions, wrapperPad)}>
        <img
          alt={alt}
          className="h-full w-full rounded-full border-4 border-[#fffbff] object-cover"
          src={src || DEFAULT_LEARNER_AVATAR}
        />
      </div>
      {editable ? (
        <button
          type="button"
          onClick={onEdit}
          className={cn(
            'absolute bottom-0 right-0 inline-flex items-center justify-center rounded-full border-4 border-[#fffbff] bg-[#a94600] text-white shadow-[0_12px_24px_rgba(169,70,0,0.22)] transition-transform active:translate-y-[2px]',
            buttonSize,
          )}
          aria-label="Edit avatar"
        >
          <span className="material-symbols-outlined text-[18px]">edit</span>
        </button>
      ) : null}
    </div>
  )
}

export function ProfileStatCard({
  icon: Icon,
  label,
  value,
  accent,
  compact = false,
}: {
  icon: LucideIcon
  label: string
  value: string
  accent: 'primary' | 'secondary' | 'tertiary'
  compact?: boolean
}) {
  const styles = accentClasses(accent)
  return (
    <div className={cn('flex flex-col justify-between rounded-[2rem]', compact ? 'p-4 text-center' : 'p-6', styles.surface)}>
      <Icon className={cn(compact ? 'mb-3 h-5 w-5 self-center' : 'mb-6 h-7 w-7', styles.icon)} />
      <div>
        <p className={cn('font-display font-extrabold leading-none tracking-[-0.05em] text-[#191713]', compact ? 'text-[1.25rem]' : 'text-[2rem]')}>{value}</p>
        <p className={cn('font-black uppercase text-[#66655a]', compact ? 'mt-1 text-[9px] tracking-[0.14em] leading-tight' : 'mt-2 text-[10px] tracking-[0.18em]')}>{label}</p>
      </div>
    </div>
  )
}

export function AchievementCard({
  title,
  compact = false,
}: {
  title: string
  compact?: boolean
}) {
  const meta = resolveAchievementMeta(title)
  const styles = accentClasses(meta.accent)
  const Icon = meta.icon

  return (
    <div
      className={cn(
        'rounded-[2rem] bg-[#fdf9f1] transition-transform hover:scale-[1.01]',
        compact ? 'w-40 flex-shrink-0 p-4' : 'p-6 text-center',
      )}
    >
      <div className={cn('mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-[0_10px_24px_rgba(57,56,47,0.06)]', styles.icon)}>
        <Icon className="h-6 w-6" />
      </div>
      <h4 className={cn('font-bold text-[#191713]', compact ? 'text-sm' : 'text-base')}>{title}</h4>
      <p className={cn('mt-1 text-[#66655a]', compact ? 'text-[11px] leading-4' : 'text-xs leading-5')}>
        {meta.description}
      </p>
    </div>
  )
}

export function LanguageProgressCard({
  language,
  compact = false,
}: {
  language: LearnerLanguageSummary
  compact?: boolean
}) {
  const meta = LANGUAGE_META[language.languageCode]
  const Icon = meta.icon
  const derivedPercent = language.courseProgressPercent ?? (language.totalLessonsCount
    ? Math.min(100, Math.round((language.completedLessonsCount / Math.max(1, language.totalLessonsCount)) * 100))
    : 0)

  return (
    <div className={cn('flex items-center gap-4 rounded-2xl bg-white', compact ? 'p-4' : 'p-3')}>
      <div className={cn('flex h-10 w-10 items-center justify-center rounded-full', meta.badge)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center justify-between gap-3">
          <span className="truncate font-bold text-[#191713]">{meta.title}</span>
          <span className={cn('text-xs font-bold', meta.badgeText)}>{derivedPercent}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[#ece8db]">
          <div className={cn('h-full rounded-full', meta.progress)} style={{ width: `${derivedPercent}%` }} />
        </div>
        <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8a7d70]">
          {language.completedLessonsCount} lessons · {language.totalXp} XP
        </p>
      </div>
    </div>
  )
}
