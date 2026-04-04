'use client'

import { Suspense, useCallback, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter, useSearchParams } from 'next/navigation'
import { learnerLessonService } from '@/services'
import { invalidateLearnerOverview } from '@/hooks/queries/learner-overview'
import {
  fetchLessonFlow,
  learnerLessonQueryKeys,
  patchLessonOverviewProgressCache,
  prefetchLessonFlow,
} from '@/hooks/queries/learner-lessons'
import { getCulturalSoundPath } from '@/lib/culturalSounds'
import { LessonPlayer } from '@lesson-player/LessonPlayer'
import type { LessonFlowData, StageCompletionResult } from '@lesson-player/types'

function StudyPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const lessonId = searchParams.get('lessonId')

  useEffect(() => {
    if (!lessonId) return
    void prefetchLessonFlow(queryClient, lessonId)
  }, [lessonId, queryClient])

  const loadFlow = useCallback((id: string) => {
    return fetchLessonFlow(queryClient, id) as Promise<LessonFlowData>
  }, [queryClient])

  const handleCompleteStage = useCallback(
    async (id: string, stageIndex: number, payload: { xpEarned?: number; minutesSpent?: number }) => {
      const result = await (learnerLessonService.completeStage(id, stageIndex, payload) as Promise<StageCompletionResult>)
      patchLessonOverviewProgressCache(queryClient, id, result)
      return result
    },
    [queryClient],
  )

  const handleLoadError = useCallback(() => {
    router.push('/dashboard')
  }, [router])

  const handleComparePronunciation = useCallback(
    (
      contentType: 'word' | 'expression' | 'sentence',
      contentId: string,
      payload: {
        audioUpload?: {
          base64?: string
          mimeType?: string
        }
      },
    ) => {
      return learnerLessonService.comparePronunciation(contentType, contentId, payload)
    },
    [],
  )

  const handleExit = useCallback(() => {
    if (!lessonId) {
      router.push('/dashboard')
      return
    }
    router.push(`/lesson-overview?lessonId=${lessonId}`)
  }, [lessonId, router])

  const handleLessonComplete = useCallback(
    async ({ lessonId: completedLessonId, xpEarned, language }: { lessonId: string; xpEarned: number; language?: 'yoruba' | 'igbo' | 'hausa' }) => {
      await invalidateLearnerOverview(queryClient)
      await queryClient.invalidateQueries({ queryKey: learnerLessonQueryKeys.next() })
      await queryClient.invalidateQueries({ queryKey: learnerLessonQueryKeys.overview(completedLessonId) })
      router.push(`/lesson-complete?lessonId=${completedLessonId}&xpEarned=${xpEarned}&language=${language || ''}`)
    },
    [queryClient, router],
  )

  if (!lessonId) {
    return null
  }

  return (
    <LessonPlayer
      lessonId={lessonId}
      loadFlow={loadFlow}
      onExit={handleExit}
      onCompleteStage={handleCompleteStage}
      onLessonComplete={handleLessonComplete}
      onLoadError={handleLoadError}
      onComparePronunciation={handleComparePronunciation}
      enableUiSounds
      culturalSoundResolver={getCulturalSoundPath}
    />
  )
}

export default function StudyPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center font-bold text-primary">Studying...</div>}>
      <StudyPageContent />
    </Suspense>
  )
}
