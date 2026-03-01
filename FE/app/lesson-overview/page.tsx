'use client'

import { useEffect, useState, Suspense } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ChevronLeft, BookOpen, Zap, Headphones, RotateCw, Lock, Play, CheckCircle, Info, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { learnerLessonService } from '@/services'
import { Lesson } from '@/types'

function LessonOverviewContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const lessonIdParam = searchParams.get("lessonId")
  
  const [progress, setProgress] = useState(0)
  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [status, setStatus] = useState<"locked" | "available" | "completed">("available")
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadLesson() {
      setIsLoading(true)
      try {
        const lessonId = lessonIdParam || (await learnerLessonService.getNextLesson())?.lesson?.id;
        if (!lessonId) {
          router.push('/dashboard')
          return
        }
        const overview = await learnerLessonService.getLessonOverview(lessonId);
        setLesson(overview.lesson);
        setProgress(overview.lesson.progressPercent || 0);
        setStatus(overview.lesson.status === "completed" ? "completed" : "available");
      } catch (error) {
        console.error("Failed to load lesson overview", error);
      } finally {
        setIsLoading(false)
      }
    }
    loadLesson();
  }, [lessonIdParam, router])

  if (isLoading) return <div className="min-h-screen flex items-center justify-center">Loading Lesson...</div>
  if (!lesson) return <div className="min-h-screen flex items-center justify-center">Lesson not found.</div>

  const isCompleted = status === "completed"

  return (
    <main className="min-h-screen bg-background">
      {/* Dynamic Header */}
      <header className="border-b border-border/10 bg-background/95 px-4 py-6 backdrop-blur-sm sticky top-0 z-40">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ChevronLeft className="h-6 w-6" />
            </Button>
          </Link>
          <div className="text-center flex-1">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-foreground/40">Unit Overview</p>
            <h1 className="text-2xl font-black text-foreground tracking-tight">{lesson.title}</h1>
          </div>
          <div className="w-10" />
        </div>
      </header>

      {/* Content */}
      <section className="px-4 py-8 md:py-12">
        <div className="mx-auto max-w-2xl space-y-10">
          
          {/* Progress Card */}
          <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <p className="text-sm font-black uppercase tracking-widest text-foreground/60">Lesson Progress</p>
              <p className="text-sm font-black text-primary">{progress}%</p>
            </div>
            <div className="h-4 w-full rounded-full bg-muted overflow-hidden border-2 border-muted relative">
              <div
                className="h-full bg-primary transition-all duration-1000 cubic-bezier(0.65, 0, 0.35, 1)"
                style={{ width: `${progress}%` }}
              />
              <div className="absolute inset-0 bg-white/10 h-1/2" />
            </div>
          </div>

          {/* Main Action Card */}
          <Card className={cn(
            "p-10 rounded-[3rem] border-4 shadow-2xl transition-all relative overflow-hidden",
            isCompleted ? "border-green-100 bg-green-50/30" : "border-primary/10 bg-primary/5 shadow-primary/5"
          )}>
            <div className="relative z-10 space-y-8 text-center">
              <div className="mx-auto h-20 w-20 rounded-3xl bg-white shadow-xl flex items-center justify-center">
                {isCompleted ? (
                  <CheckCircle className="h-10 w-10 text-green-500" />
                ) : (
                  <Play className="h-10 w-10 text-primary fill-primary" />
                )}
              </div>
              
              <div className="space-y-3">
                <h2 className="text-3xl font-black text-foreground leading-tight">
                  {isCompleted ? "Unit Mastered!" : "Ready to Start?"}
                </h2>
                <p className="text-lg text-foreground/60 font-medium leading-relaxed">
                  {lesson.description || "Master essential phrases and cultural context in this bite-sized unit."}
                </p>
              </div>

              <Link href={`/study?lessonId=${lesson.id}`} className="block">
                <Button size="lg" className="w-full h-16 rounded-[1.5rem] text-xl font-black shadow-xl border-b-8 border-primary-foreground/30 active:translate-y-1 active:border-b-4 transition-all">
                  {isCompleted ? "Review Lesson" : "Start Learning"}
                  <ArrowRight className="ml-2 h-6 w-6" />
                </Button>
              </Link>
            </div>
            
            {/* Background Decoration */}
            <div className="absolute top-0 right-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-primary/5 blur-3xl" />
            <div className="absolute bottom-0 left-0 -ml-16 -mb-16 h-64 w-64 rounded-full bg-accent/5 blur-3xl" />
          </Card>

          {/* Resource Library (Always accessible, but highlighted when completed) */}
          <div className="space-y-6">
            <h3 className="text-sm font-black uppercase tracking-[0.2em] text-foreground/40 px-2">Study Materials</h3>
            <div className="grid gap-4">
              <Link href={`/lesson-phrases?lessonId=${lesson.id}`}>
                <Card className="p-6 border-4 border-muted hover:border-primary/30 transition-all rounded-[2rem] flex items-center justify-between group bg-white shadow-sm">
                  <div className="flex items-center gap-5">
                    <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                      <BookOpen className="h-7 w-7" />
                    </div>
                    <div>
                      <p className="text-lg font-black text-foreground">Phrase Audio Library</p>
                      <p className="text-sm text-muted-foreground font-medium">Listen to all pronunciations</p>
                    </div>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-muted/50 flex items-center justify-center text-foreground/20 group-hover:bg-primary/10 group-hover:text-primary transition-all">
                    <ArrowRight className="h-5 w-5" />
                  </div>
                </Card>
              </Link>

              {/* Topics / Tags */}
              {lesson.topics && lesson.topics.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-4 justify-center">
                  {lesson.topics.map(topic => (
                    <span key={topic} className="px-4 py-2 rounded-full bg-secondary/10 border-2 border-secondary/20 text-xs font-black uppercase tracking-widest text-secondary-foreground/60">
                      #{topic}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Motivational Footer */}
          {!isCompleted && (
            <div className="flex gap-4 p-6 bg-amber-50 rounded-[2rem] border-2 border-amber-100 items-center">
              <div className="h-12 w-12 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                <Zap className="h-6 w-6 fill-current" />
              </div>
              <p className="text-sm font-bold text-amber-900/70 leading-relaxed">
                Completing this unit earns you <span className="text-amber-600 font-black">50+ XP</span> and extends your learning streak!
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}

export default function LessonOverviewScreen() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center font-bold text-muted-foreground">Loading unit...</div>}>
      <LessonOverviewContent />
    </Suspense>
  )
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(" ")
}
