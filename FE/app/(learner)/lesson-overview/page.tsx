'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter, useSearchParams } from 'next/navigation'
import { LessonFocusScreen } from '@/components/learner/lesson-focus-screen'
import {
  prefetchLessonExpressions,
  prefetchLessonFlow,
  useLearnerLessonOverviewQuery,
  useLearnerNextLessonQuery,
} from '@/hooks/queries/learner-lessons'

export default function LessonOverviewPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const [isStartingLesson, setIsStartingLesson] = useState(false)
  const lessonIdParam = searchParams.get('lessonId') || undefined
  const nextLessonQuery = useLearnerNextLessonQuery(!lessonIdParam)
  const resolvedLessonId = lessonIdParam || nextLessonQuery.data?.lesson?.id || ''
  const overviewQuery = useLearnerLessonOverviewQuery(resolvedLessonId, Boolean(resolvedLessonId))

  useEffect(() => {
    if (resolvedLessonId) {
      void prefetchLessonFlow(queryClient, resolvedLessonId)
      void prefetchLessonExpressions(queryClient, resolvedLessonId)
    }
  }, [queryClient, resolvedLessonId])

  useEffect(() => {
    if (lessonIdParam) return
    if (nextLessonQuery.isLoading || nextLessonQuery.isFetching) return
    if (!nextLessonQuery.data?.lesson?.id) {
      router.push('/dashboard')
    }
  }, [lessonIdParam, nextLessonQuery.data?.lesson?.id, nextLessonQuery.isFetching, nextLessonQuery.isLoading, router])

  useEffect(() => {
    if (!resolvedLessonId) return
    if (overviewQuery.isLoading || overviewQuery.isFetching) return
    // A failed request shows an error with a retry button below. Only a lesson that loaded
    // but does not exist sends the learner home.
    if (overviewQuery.isError) {
      console.error('Failed to load lesson overview', overviewQuery.error)
      return
    }
    if (!overviewQuery.data?.lesson) {
      router.push('/dashboard')
    }
  }, [overviewQuery.data?.lesson, overviewQuery.error, overviewQuery.isError, overviewQuery.isFetching, overviewQuery.isLoading, resolvedLessonId, router])

  const lesson = useMemo(() => {
    const source = overviewQuery.data?.lesson
    if (!source) return null
    return {
      ...source,
      _id: source.id ?? source._id,
      currentStageIndex: source.currentStageIndex,
      stageProgress: source.stageProgress,
    }
  }, [overviewQuery.data?.lesson])

  const isLoading = (!lessonIdParam && nextLessonQuery.isLoading) || overviewQuery.isLoading

  const loadFailed = overviewQuery.isError && !overviewQuery.isFetching && !lesson
  const retryOverview = overviewQuery.refetch

  const screenProps = useMemo(() => {
    if (loadFailed) {
      return {
        mode: 'overview' as const,
        progress: 0,
        closeHref: '/dashboard',
        title: 'We couldn’t load this lesson',
        subtitle: 'Check your connection and try again.',
        primaryAction: {
          label: 'Try again',
          onClick: () => {
            void retryOverview()
          },
        },
        secondaryAction: {
          href: '/dashboard',
          label: 'Back to dashboard',
        },
      }
    }

    if (!lesson) {
      return {
        mode: 'loading' as const,
        progress: 75,
        closeHref: '/dashboard',
        title: 'Preparing your lesson...',
        subtitle: 'Getting your next lesson ready.',
      }
    }

    const progress = lesson.progressPercent || 0
    const isCompleted =
      progress >= 100 ||
      (Array.isArray(lesson.stageProgress) &&
        lesson.stageProgress.length > 0 &&
        lesson.stageProgress.every((stage) => stage.status === 'completed'))
    const primaryLabel = isCompleted
      ? 'Review Lesson'
      : progress > 0
        ? 'Continue Lesson'
        : 'Start Learning'
    const subtitle =
      lesson.description ||
      `Get ready to continue your ${lesson.language} lesson with focused practice and listening.`
    const proverb = lesson.proverbs?.[0]

    if (isLoading || isStartingLesson) {
      return {
        mode: 'loading' as const,
        progress: Math.max(progress || 0, 75),
        closeHref: '/dashboard',
        title: 'Preparing your lesson...',
        subtitle,
        proverb: proverb
          ? {
              eyebrow: 'Proverb',
              text: proverb.text,
              translation: `Translation: ${proverb.translation}`,
            }
          : {
              eyebrow: 'Lesson Note',
              text: `You are about to start a ${lesson.language} lesson.`,
              translation: subtitle,
            },
      }
    }

    return {
      mode: 'overview' as const,
      progress,
      closeHref: '/dashboard',
      title: lesson.title,
      subtitle,
      proverb: proverb
        ? {
            eyebrow: 'Proverb',
            text: proverb.text,
            translation: `Translation: ${proverb.translation}`,
          }
        : {
            eyebrow: 'Lesson Note',
            text: `This ${lesson.language} lesson is ready.`,
            translation: 'Use the resources button for a quick pronunciation refresher before you begin.',
          },
      primaryAction: {
        label: primaryLabel,
        onClick: async () => {
          setIsStartingLesson(true)
          try {
            await prefetchLessonFlow(queryClient, lesson._id)
          } finally {
            window.setTimeout(() => {
              router.push(`/study?lessonId=${lesson._id}`)
            }, 350)
          }
        },
      },
      secondaryAction: {
        href: `/lesson-expressions?lessonId=${lesson._id}`,
        label: 'Open Resources',
      },
    }
  }, [isLoading, isStartingLesson, lesson, loadFailed, queryClient, retryOverview, router])

  return <LessonFocusScreen {...screenProps} />
}
