'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ChevronLeft, BookOpen, Zap, Headphones, RotateCw, Lock } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { learnerLessonService } from '@/services'

const iconByKey = {
  vocabulary: BookOpen,
  practice: Zap,
  listening: Headphones,
  review: RotateCw
} as const

export default function LessonOverviewScreen() {
  const searchParams = useSearchParams()
  const lessonIdParam = searchParams.get("lessonId")
  const [progress, setProgress] = useState(0)
  const [lesson, setLesson] = useState<{ id: string; title: string; description: string } | null>(null)
  const [lessonSteps, setLessonSteps] = useState<
    { id: number; key: string; title: string; description: string; status: "locked" | "available" | "completed"; route: string }[]
  >([])
  const [futureLessons, setFutureLessons] = useState<{ id: string; title: string }[]>([])

  useEffect(() => {
    async function loadLesson() {
      try {
        const lessonId = lessonIdParam || (await learnerLessonService.getNextLesson())?.lesson?.id;
        if (!lessonId) return;
        const overview = await learnerLessonService.getLessonOverview(lessonId);
        setLesson(overview.lesson);
        setProgress(overview.lesson.progressPercent || 0);
        setLessonSteps(overview.steps || []);
        setFutureLessons(overview.comingNext || []);
      } catch (error) {
        console.error("Failed to load lesson overview", error);
      }
    }
    loadLesson();
  }, [lessonIdParam])

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/20 bg-background/95 px-4 py-4 backdrop-blur-sm sticky top-0 z-40">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon">
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="text-center flex-1">
            <p className="text-sm text-foreground/60">Lesson Overview</p>
            <h1 className="text-xl font-bold text-foreground">{lesson?.title || "Loading..."}</h1>
          </div>
          <div className="w-10" />
        </div>
      </header>

      {/* Content */}
      <section className="px-4 py-8">
        <div className="mx-auto max-w-4xl space-y-8">
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">Lesson Progress</p>
              <p className="text-sm text-foreground/60">{progress}%</p>
            </div>
            <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Lesson Description */}
          <Card className="border border-border/50 p-6">
            <h2 className="text-lg font-bold text-foreground mb-2">
              {lesson?.title || "Lesson"}
            </h2>
            <p className="text-foreground/70">
              {lesson?.description || "Lesson content and steps load from backend."}
            </p>
          </Card>

          {/* Lesson Steps */}
          <div className="space-y-4">
            <h3 className="font-bold text-foreground">Lesson Steps</h3>
            {lessonSteps.map((step, index) => {
              const Icon = iconByKey[step.key as keyof typeof iconByKey] || BookOpen
              const locked = step.status === "locked"
              const separator = step.route.includes("?") ? "&" : "?"
              return (
                <Link key={step.id} href={locked ? '#' : `${step.route}${separator}step=${step.id}&lessonId=${lesson?.id || ""}`}>
                  <Card
                    className={`border p-4 transition-all cursor-pointer flex items-center justify-between ${
                      locked
                        ? 'border-border/20 opacity-50 cursor-not-allowed'
                        : 'border-border/50 hover:border-primary/50 hover:shadow-md'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        {locked ? (
                          <Lock className="h-5 w-5 text-foreground/40" />
                        ) : (
                          <Icon className="h-5 w-5 text-primary" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{step.title}</p>
                        <p className="text-sm text-foreground/60">{step.description}</p>
                      </div>
                    </div>
                    {!locked && (
                      <div className="h-6 w-6 rounded-full border-2 border-primary bg-primary/20" />
                    )}
                  </Card>
                </Link>
              )
            })}
          </div>

          {/* Future Lessons Preview */}
          <div className="space-y-4">
            <h3 className="font-bold text-foreground">Phrase Audio Library</h3>
            <Link href={lesson?.id ? `/lesson-phrases?lessonId=${lesson.id}` : "/lesson-phrases"}>
              <Card className="border border-border/50 p-4 hover:border-primary/50 transition-all">
                <p className="font-medium text-foreground">Review all lesson phrases with audio and meanings</p>
                <p className="text-sm text-foreground/60 mt-1">Open anytime after listening practice.</p>
              </Card>
            </Link>
          </div>

          {/* Future Lessons Preview */}
          <div className="space-y-4">
            <h3 className="font-bold text-foreground">Coming Next</h3>
            {futureLessons.map((lesson) => (
              <Card
                key={lesson.id}
                className="border border-border/20 p-4 opacity-60"
              >
                <div className="flex items-center gap-3">
                  <Lock className="h-5 w-5 text-foreground/30" />
                  <div>
                    <p className="font-medium text-foreground">{lesson.title}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}
