'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLearnerAuth } from '@/components/auth/learner-auth-provider'
import type { LearnerLanguageSummary } from '@/components/learner/language-switcher'
import { LanguageOverviewScreen } from '@/components/learner/language-overview-screen'
import { learnerDashboardService } from '@/services'
import type { Language } from '@/types'

type LessonSummary = {
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

type UnitSummary = {
  id: string
  chapterId?: string | null
  title: string
  description: string
  level: string
  orderIndex: number
  progressPercent: number
  completedLessons: number
  totalLessons: number
  lessons: LessonSummary[]
}

type ChapterSummary = {
  id: string
  title: string
  description: string
  level: string
  orderIndex: number
  progressPercent: number
  completedUnits: number
  totalUnits: number
  status: 'current' | 'completed' | 'locked' | 'available'
  units: UnitSummary[]
}

type CurriculumData = {
  stats: {
    currentLanguage: string
    streakDays: number
    languageStreakDays?: number
    totalXp: number
    dailyGoalMinutes: number
    todayMinutes: number
    completedLessonsCount?: number
  }
  learnerLanguages?: LearnerLanguageSummary[]
  nextLesson: {
    id: string
    unitId?: string
    unitTitle?: string
    title: string
    description: string
    currentStageIndex?: number
    totalStages?: number
    progressPercent?: number
  } | null
  chapters?: ChapterSummary[]
}

export default function CurriculumPage() {
  const router = useRouter()
  const { isAuthenticated, isLoading: isAuthLoading, refreshSession, session } = useLearnerAuth()
  const searchParams = useSearchParams()
  const [data, setData] = useState<CurriculumData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSwitchingLanguage, setIsSwitchingLanguage] = useState(false)

  const requestedLanguage = (() => {
    const value = searchParams.get('language')
    return value === 'yoruba' || value === 'igbo' || value === 'hausa' ? value : undefined
  })()

  useEffect(() => {
    if (isAuthLoading || !isAuthenticated || session?.requiresOnboarding) return

    let active = true
    setIsLoading(true)

    learnerDashboardService
      .getOverview(requestedLanguage)
      .then((payload) => {
        if (!active) return
        setData(payload)
      })
      .catch((error) => {
        console.error('Failed to load curriculum overview', error)
      })
      .finally(() => {
        if (!active) return
        setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [isAuthLoading, isAuthenticated, requestedLanguage, session?.requiresOnboarding])

  async function handleLanguageChange(language: Language) {
    if (isSwitchingLanguage || language === requestedLanguage) return
    setIsSwitchingLanguage(true)
    try {
      await learnerDashboardService.updateLanguage(language)
      await refreshSession()
      router.replace(`/curriculum?language=${encodeURIComponent(language)}`)
    } catch (error) {
      console.error('Failed to switch learner language', error)
      setIsSwitchingLanguage(false)
    }
  }

  useEffect(() => {
    if (!isSwitchingLanguage || isLoading) return
    setIsSwitchingLanguage(false)
  }, [isLoading, isSwitchingLanguage])

  return (
    <LanguageOverviewScreen
      data={data}
      isLoading={isLoading || isAuthLoading || isSwitchingLanguage}
      closeHref="/dashboard"
      isSwitchingLanguage={isSwitchingLanguage}
      onSelectLanguage={handleLanguageChange}
    />
  )
}
