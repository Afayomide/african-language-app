'use client'

import { Suspense, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { learnerLessonService } from '@/services'
import { getCulturalSoundPath } from '@/lib/culturalSounds'
import { LessonPlayer } from '@lesson-player/LessonPlayer'
import type { LessonFlowData, StageCompletionResult } from '@lesson-player/types'

function StudyPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const lessonId = searchParams.get('lessonId')

  const loadFlow = useCallback((id: string) => {
    return learnerLessonService.getLessonFlow(id) as Promise<LessonFlowData>
  }, [])

  const handleCompleteStage = useCallback(
    (id: string, stageIndex: number, payload: { xpEarned?: number; minutesSpent?: number }) => {
      return learnerLessonService.completeStage(id, stageIndex, payload) as Promise<StageCompletionResult>
    },
    [],
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
    ({ lessonId: completedLessonId, xpEarned, language }: { lessonId: string; xpEarned: number; language?: 'yoruba' | 'igbo' | 'hausa' }) => {
      router.push(`/lesson-complete?lessonId=${completedLessonId}&xpEarned=${xpEarned}&language=${language || ''}`)
    },
    [router],
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
