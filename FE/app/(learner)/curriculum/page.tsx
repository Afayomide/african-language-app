'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLearnerAuth } from '@/components/auth/learner-auth-provider'
import { LanguageOverviewScreen } from '@/components/learner/language-overview-screen'
import { prefetchLessonFlow, prefetchLessonOverview } from '@/hooks/queries/learner-lessons'
import {
  invalidateLearnerOverview,
  prefetchLearnerOverview,
  type LearnerOverviewData as CurriculumData,
  useLearnerOverviewQuery,
} from '@/hooks/queries/learner-overview'
import { learnerDashboardService } from '@/services'
import type { Language } from '@/types'

export default function CurriculumPage() {
  const router = useRouter()
  const { isAuthenticated, isLoading: isAuthLoading, refreshSession, session } = useLearnerAuth()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const [isSwitchingLanguage, setIsSwitchingLanguage] = useState(false)
  const requestedLanguage = useMemo(() => {
    const value = searchParams.get('language')
    return value === 'yoruba' || value === 'igbo' || value === 'hausa' ? value : undefined
  }, [searchParams])
  const overviewQuery = useLearnerOverviewQuery({
    language: requestedLanguage,
    enabled: !isAuthLoading && isAuthenticated && !session?.requiresOnboarding,
  })
  const data = overviewQuery.data ?? null
  const isLoading = overviewQuery.isLoading || (!data && overviewQuery.isFetching)

  useEffect(() => {
    if (!data) return

    void prefetchLearnerOverview(queryClient)

    const nextLessonId = data.nextLesson?.id
    if (!nextLessonId) return

    void prefetchLessonOverview(queryClient, nextLessonId)
    void prefetchLessonFlow(queryClient, nextLessonId)
  }, [data, queryClient])

  async function handleLanguageChange(language: Language) {
    if (isSwitchingLanguage || language === requestedLanguage) return
    setIsSwitchingLanguage(true)
    try {
      await learnerDashboardService.updateLanguage(language)
      await refreshSession()
      await invalidateLearnerOverview(queryClient)
      await prefetchLearnerOverview(queryClient, language)
      router.replace(`/curriculum?language=${encodeURIComponent(language)}`)
    } catch (error) {
      console.error('Failed to switch learner language', error)
    } finally {
      setIsSwitchingLanguage(false)
    }
  }

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
