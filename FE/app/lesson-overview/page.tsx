'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { learnerLessonService } from '@/services'
import type { Lesson } from '@/types'
import { LessonFocusScreen } from '@/components/learner/lesson-focus-screen'

export default function LessonOverviewPage() {
  const router = useRouter()

  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isStartingLesson, setIsStartingLesson] = useState(false)

  useEffect(() => {
    async function loadLesson() {
      setIsLoading(true)
      try {
        const searchParams = new URLSearchParams(window.location.search)
        const lessonIdParam = searchParams.get('lessonId')
        const lessonId = lessonIdParam || (await learnerLessonService.getNextLesson())?.lesson?.id

        if (!lessonId) {
          router.push('/dashboard')
          return
        }

        const overview = await learnerLessonService.getLessonOverview(lessonId)
        setLesson({
          ...overview.lesson,
          _id: overview.lesson.id ?? overview.lesson._id,
          currentStageIndex: overview.lesson.currentStageIndex,
          stageProgress: overview.lesson.stageProgress,
        })
      } catch (error) {
        console.error('Failed to load lesson overview', error)
        router.push('/dashboard')
      } finally {
        setIsLoading(false)
      }
    }

    void loadLesson()
  }, [router])

  const screenProps = useMemo(() => {
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
    const resumeStageNumber = isCompleted ? 1 : (lesson.currentStageIndex ?? 0) + 1
    const primaryLabel = isCompleted
      ? 'Review Lesson'
      : progress > 0
        ? `Continue From Stage ${resumeStageNumber}`
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
        onClick: () => {
          setIsStartingLesson(true)
          window.setTimeout(() => {
            router.push(`/study?lessonId=${lesson._id}`)
          }, 350)
        },
      },
      secondaryAction: {
        href: `/lesson-expressions?lessonId=${lesson._id}`,
        label: 'Open Resources',
      },
    }
  }, [isLoading, isStartingLesson, lesson, router])

  return <LessonFocusScreen {...screenProps} />
}
