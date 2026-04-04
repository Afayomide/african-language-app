'use client'

import { Suspense, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ChevronLeft, Quote, BookOpen, Volume2, Info, Turtle } from 'lucide-react'
import { useLearnerLessonExpressionsQuery, useLearnerLessonOverviewQuery, useLearnerNextLessonQuery } from '@/hooks/queries/learner-lessons'
import type { LearningContent, Lesson } from '@/types'

function LessonExpressionsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const lessonIdParam = searchParams.get('lessonId') || undefined
  const nextLessonQuery = useLearnerNextLessonQuery(!lessonIdParam)
  const resolvedLessonId = lessonIdParam || nextLessonQuery.data?.lesson?.id || ''
  const overviewQuery = useLearnerLessonOverviewQuery(resolvedLessonId, Boolean(resolvedLessonId))
  const expressionsQuery = useLearnerLessonExpressionsQuery(resolvedLessonId, Boolean(resolvedLessonId))

  useEffect(() => {
    if (lessonIdParam) return
    if (nextLessonQuery.isLoading || nextLessonQuery.isFetching) return
    if (!nextLessonQuery.data?.lesson?.id) {
      router.push('/dashboard')
    }
  }, [lessonIdParam, nextLessonQuery.data?.lesson?.id, nextLessonQuery.isFetching, nextLessonQuery.isLoading, router])

  useEffect(() => {
    if (!resolvedLessonId) return
    if (overviewQuery.isLoading || expressionsQuery.isLoading || overviewQuery.isFetching || expressionsQuery.isFetching) return
    if (overviewQuery.isError || expressionsQuery.isError || !overviewQuery.data?.lesson) {
      console.error('Failed to load lesson materials', overviewQuery.error || expressionsQuery.error)
      router.push('/dashboard')
    }
  }, [
    expressionsQuery.error,
    expressionsQuery.isError,
    expressionsQuery.isFetching,
    expressionsQuery.isLoading,
    overviewQuery.data?.lesson,
    overviewQuery.error,
    overviewQuery.isError,
    overviewQuery.isFetching,
    overviewQuery.isLoading,
    resolvedLessonId,
    router,
  ])

  const lesson = useMemo(() => {
    const source = overviewQuery.data?.lesson as (Lesson & { id?: string }) | undefined
    if (!source) return null
    return {
      ...source,
      _id: source.id ?? source._id,
    }
  }, [overviewQuery.data?.lesson])

  const contentItems = useMemo(() => expressionsQuery.data?.expressions || [], [expressionsQuery.data?.expressions])
  const isLoading = (!lessonIdParam && nextLessonQuery.isLoading) || overviewQuery.isLoading || expressionsQuery.isLoading

  const playAudio = (url?: string, speed: number = 1.0) => {
    if (!url) return
    const audio = new Audio(url)
    audio.playbackRate = speed
    audio.play().catch(() => {})
  }

  if (isLoading) return <div className="min-h-screen flex items-center justify-center">Loading materials...</div>
  if (!lesson) return <div className="min-h-screen flex items-center justify-center">Lesson not found.</div>

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/10 bg-background/95 px-4 py-6 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link href={`/lesson-overview?lessonId=${lesson._id}`}>
            <Button variant="ghost" size="icon" className="rounded-full">
              <ChevronLeft className="h-6 w-6" />
            </Button>
          </Link>
          <div className="flex-1 text-center">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-foreground/40">Resource Library</p>
            <h1 className="text-2xl font-black text-foreground tracking-tight">{lesson.title}</h1>
          </div>
          <div className="w-10" />
        </div>
      </header>

      <section className="px-4 py-10">
        <div className="mx-auto max-w-3xl space-y-12">
          <div className="space-y-6">
            <div className="flex items-center gap-3 px-2">
              <BookOpen className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-black uppercase tracking-widest text-foreground/60">Vocabulary Bank</h2>
            </div>

            <div className="grid gap-4">
              {contentItems.map((item: LearningContent, index: number) => (
                <Card key={item._id || index} className="group rounded-[2rem] border-4 border-muted bg-white p-6 shadow-sm transition-all hover:shadow-md">
                  <div className="flex items-center justify-between gap-6">
                    <div className="flex-1 space-y-2">
                      <h3 className="text-2xl font-black text-primary">{item.text}</h3>
                      <p className="text-lg font-bold text-foreground/70">
                        {item.selectedTranslation || item.translations?.[0] || ''}
                      </p>
                      {item.pronunciation ? (
                        <p className="text-sm font-medium italic text-foreground/30">[{item.pronunciation}]</p>
                      ) : null}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-14 w-14 rounded-2xl bg-primary/5 text-primary transition-transform group-hover:scale-110"
                        onClick={() => playAudio(item.audio?.url)}
                      >
                        <Volume2 className="h-7 w-7" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-14 w-14 rounded-2xl bg-secondary/5 text-secondary transition-transform group-hover:scale-110"
                        onClick={() => playAudio(item.audio?.url, 0.6)}
                      >
                        <Turtle className="h-7 w-7" />
                      </Button>
                    </div>
                  </div>
                  {item.explanation ? (
                    <div className="mt-4 flex gap-3 border-t border-muted pt-4 text-sm font-medium italic text-muted-foreground">
                      <Info className="h-4 w-4 shrink-0" />
                      <p>{item.explanation}</p>
                    </div>
                  ) : null}
                </Card>
              ))}
            </div>
          </div>

          {lesson.proverbs && lesson.proverbs.length > 0 ? (
            <div className="space-y-6">
              <div className="flex items-center gap-3 px-2">
                <Quote className="h-5 w-5 text-amber-600" />
                <h2 className="text-lg font-black uppercase tracking-widest text-foreground/60">Cultural Proverbs</h2>
              </div>

              <div className="grid gap-4">
                {lesson.proverbs.map((proverb, idx) => (
                  <Card key={idx} className="group relative overflow-hidden rounded-[2rem] border-4 border-amber-100 bg-amber-50/50 p-8 shadow-sm">
                    <Quote className="absolute -left-2 -top-2 h-16 w-16 -rotate-12 text-amber-100/50" />
                    <div className="relative z-10 space-y-4">
                      <h3 className="text-xl font-black leading-tight text-amber-900">"{proverb.text}"</h3>
                      <div className="h-0.5 w-12 bg-amber-200" />
                      <p className="font-bold italic text-amber-800/70">{proverb.translation}</p>
                      {proverb.contextNote ? (
                        <div className="mt-4 rounded-xl border border-amber-100 bg-white/50 p-4 text-sm font-medium leading-relaxed text-amber-900/60">
                          {proverb.contextNote}
                        </div>
                      ) : null}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ) : null}

          <div className="pt-8">
            <Link href={`/lesson-overview?lessonId=${lesson._id}`}>
              <Button variant="outline" className="h-14 w-full rounded-2xl border-4 text-lg font-black transition-all hover:bg-muted">
                Back to Unit
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}

export default function LessonExpressionsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center font-bold">Loading Materials...</div>}>
      <LessonExpressionsContent />
    </Suspense>
  )
}
