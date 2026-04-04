'use client'

import {
  queryOptions,
  useQuery,
  type QueryClient,
} from '@tanstack/react-query'
import { learnerLessonService } from '@/services'
import type { LearningContent, Lesson } from '@/types'
import type { LessonFlowData } from '@lesson-player/types'
import type { StageCompletionResult } from '@lesson-player/types'

export type LearnerNextLessonResponse = {
  lesson: {
    id: string
    title: string
    description: string
    language: string
    level: string
    kind?: string
  }
}

export type LearnerLessonOverviewResponse = {
  lesson: Lesson & { id?: string }
  steps: Array<{
    id: number
    key: string
    title: string
    description?: string
    status: 'locked' | 'available' | 'completed'
    route?: string
  }>
  comingNext: Array<{ id: string; title: string }>
}

export type LearnerLessonExpressionsResponse = {
  expressions: LearningContent[]
}

export const learnerLessonQueryKeys = {
  all: ['learner-lesson'] as const,
  next: () => ['learner-lesson', 'next'] as const,
  overview: (lessonId: string) => ['learner-lesson', 'overview', lessonId] as const,
  flow: (lessonId: string) => ['learner-lesson', 'flow', lessonId] as const,
  expressions: (lessonId: string) => ['learner-lesson', 'expressions', lessonId] as const,
}

export function learnerNextLessonQueryOptions() {
  return queryOptions({
    queryKey: learnerLessonQueryKeys.next(),
    queryFn: () => learnerLessonService.getNextLesson() as Promise<LearnerNextLessonResponse>,
    staleTime: 30 * 1000,
    gcTime: 10 * 60 * 1000,
  })
}

export function learnerLessonOverviewQueryOptions(lessonId: string) {
  return queryOptions({
    queryKey: learnerLessonQueryKeys.overview(lessonId),
    queryFn: () => learnerLessonService.getLessonOverview(lessonId) as Promise<LearnerLessonOverviewResponse>,
    staleTime: 60 * 1000,
    gcTime: 15 * 60 * 1000,
  })
}

export function learnerLessonFlowQueryOptions(lessonId: string) {
  return queryOptions({
    queryKey: learnerLessonQueryKeys.flow(lessonId),
    queryFn: () => learnerLessonService.getLessonFlow(lessonId) as Promise<LessonFlowData>,
    staleTime: 60 * 1000,
    gcTime: 15 * 60 * 1000,
  })
}

export function learnerLessonExpressionsQueryOptions(lessonId: string) {
  return queryOptions({
    queryKey: learnerLessonQueryKeys.expressions(lessonId),
    queryFn: () => learnerLessonService.getLessonExpressions(lessonId) as Promise<LearnerLessonExpressionsResponse>,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  })
}

export function useLearnerNextLessonQuery(enabled = true) {
  return useQuery({
    ...learnerNextLessonQueryOptions(),
    enabled,
  })
}

export function useLearnerLessonOverviewQuery(lessonId?: string, enabled = true) {
  return useQuery({
    ...learnerLessonOverviewQueryOptions(lessonId || ''),
    enabled: enabled && Boolean(lessonId),
  })
}

export function useLearnerLessonExpressionsQuery(lessonId?: string, enabled = true) {
  return useQuery({
    ...learnerLessonExpressionsQueryOptions(lessonId || ''),
    enabled: enabled && Boolean(lessonId),
  })
}

export async function prefetchLessonFlow(queryClient: QueryClient, lessonId: string) {
  await queryClient.prefetchQuery(learnerLessonFlowQueryOptions(lessonId))
}

export async function fetchLessonFlow(queryClient: QueryClient, lessonId: string) {
  return queryClient.fetchQuery(learnerLessonFlowQueryOptions(lessonId))
}

export async function prefetchLessonOverview(queryClient: QueryClient, lessonId: string) {
  await queryClient.prefetchQuery(learnerLessonOverviewQueryOptions(lessonId))
}

export async function prefetchLessonExpressions(queryClient: QueryClient, lessonId: string) {
  await queryClient.prefetchQuery(learnerLessonExpressionsQueryOptions(lessonId))
}

export function patchLessonOverviewProgressCache(
  queryClient: QueryClient,
  lessonId: string,
  progress: StageCompletionResult,
) {
  queryClient.setQueryData<LearnerLessonOverviewResponse | undefined>(
    learnerLessonQueryKeys.overview(lessonId),
    (current) => {
      if (!current) return current
      return {
        ...current,
        lesson: {
          ...current.lesson,
          progressPercent: progress.progressPercent,
          currentStageIndex: progress.currentStageIndex,
          stageProgress: progress.stageProgress,
        },
      }
    },
  )
}
