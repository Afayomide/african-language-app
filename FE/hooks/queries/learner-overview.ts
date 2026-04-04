'use client'

import {
  keepPreviousData,
  queryOptions,
  useQuery,
  type QueryClient,
} from '@tanstack/react-query'
import type { LearnerLanguageSummary } from '@/components/learner/language-switcher'
import type { LearnerWeeklyOverviewItem } from '@/components/learner/weekly-bars'
import { learnerDashboardService } from '@/services'
import type { Language } from '@/types'

export type LearnerOverviewLesson = {
  id: string
  title: string
  description: string
  level: string
  orderIndex: number
  status: 'not_started' | 'in_progress' | 'completed'
  progressPercent: number
  currentStageIndex?: number
  totalStages?: number
}

export type LearnerOverviewUnit = {
  id: string
  chapterId?: string | null
  title: string
  description: string
  level: string
  orderIndex: number
  progressPercent: number
  completedLessons: number
  totalLessons: number
  lessons: LearnerOverviewLesson[]
}

export type LearnerOverviewChapter = {
  id: string
  title: string
  description: string
  level: string
  orderIndex: number
  progressPercent: number
  completedUnits: number
  totalUnits: number
  status: 'current' | 'completed' | 'locked' | 'available'
  units: LearnerOverviewUnit[]
}

export type LearnerOverviewNextLesson = {
  id: string
  unitId?: string
  unitTitle?: string
  title: string
  description: string
  orderIndex?: number
  currentStageIndex?: number
  totalStages?: number
  progressPercent?: number
}

export type LearnerOverviewCompletedLesson = {
  id: string
  unitId?: string
  unitTitle?: string
  title: string
  description: string
  level: string
  completedAt: string | null
}

export type LearnerOverviewStats = {
  currentLanguage: string
  streakDays: number
  languageStreakDays?: number
  longestStreak?: number
  languageLongestStreak?: number
  totalXp: number
  globalTotalXp?: number
  globalRank?: number
  dailyGoalMinutes: number
  todayMinutes: number
  dailyProgressPercent?: number
  globalTodayMinutes?: number
  completedLessonsCount?: number
  globalCompletedLessonsCount?: number
  totalLessonsCount?: number
  courseProgressPercent?: number
}

export type LearnerOverviewData = {
  stats: LearnerOverviewStats
  learnerLanguages?: LearnerLanguageSummary[]
  nextLesson: LearnerOverviewNextLesson | null
  units?: LearnerOverviewUnit[]
  chapters?: LearnerOverviewChapter[]
  completedLessons: LearnerOverviewCompletedLesson[]
  weeklyOverview: LearnerWeeklyOverviewItem[]
  achievements: string[]
}

export const learnerOverviewQueryKeys = {
  all: ['learner-overview'] as const,
  detail: (language?: Language) => ['learner-overview', language ?? 'active'] as const,
}

export function learnerOverviewQueryOptions(language?: Language) {
  return queryOptions({
    queryKey: learnerOverviewQueryKeys.detail(language),
    queryFn: () => learnerDashboardService.getOverview(language),
    staleTime: language ? 2 * 60 * 1000 : 30 * 1000,
    gcTime: 15 * 60 * 1000,
    placeholderData: keepPreviousData,
  })
}

export function useLearnerOverviewQuery({
  language,
  enabled = true,
}: {
  language?: Language
  enabled?: boolean
} = {}) {
  return useQuery({
    ...learnerOverviewQueryOptions(language),
    enabled,
  })
}

export async function prefetchLearnerOverview(queryClient: QueryClient, language?: Language) {
  await queryClient.prefetchQuery(learnerOverviewQueryOptions(language))
}

export async function fetchLearnerOverview(queryClient: QueryClient, language?: Language) {
  return queryClient.fetchQuery(learnerOverviewQueryOptions(language))
}

export async function invalidateLearnerOverview(queryClient: QueryClient) {
  await queryClient.invalidateQueries({ queryKey: learnerOverviewQueryKeys.all })
}
