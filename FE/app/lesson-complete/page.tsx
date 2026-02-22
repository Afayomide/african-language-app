'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ArrowRight, Flame, Gift, TrendingUp, RotateCcw } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { learnerLessonService } from '@/services'

export default function LessonCompleteScreen() {
  const searchParams = useSearchParams()
  const lessonId = searchParams.get("lessonId")
  const [xpEarned, setXpEarned] = useState(50)

  useEffect(() => {
    if (!lessonId) return
    learnerLessonService
      .completeLesson(lessonId, { xpEarned: 50, minutesSpent: 10 })
      .then((payload) => setXpEarned(payload.xpEarned || 50))
      .catch((error) => console.error("Failed to complete lesson", error))
  }, [lessonId])

  return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      {/* Celebration Container */}
      <div className="w-full max-w-2xl space-y-8">
        {/* Celebration Icon */}
        <div className="flex justify-center">
          <div className="relative">
            <div className="absolute inset-0 animate-pulse rounded-full bg-primary/20 blur-xl" />
            <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-primary/30 to-accent/30">
              <span className="text-5xl">🎉</span>
            </div>
          </div>
        </div>

        {/* Main Message */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-foreground">Lesson Complete!</h1>
          <p className="text-lg text-foreground/70">
            Amazing work! You're building skills with every lesson.
          </p>
        </div>

        {/* Stats Cards */}
        <div className="space-y-4">
          {/* XP Gained */}
          <Card className="border border-border/50 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <Gift className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-foreground/70">XP Earned</p>
                  <p className="text-2xl font-bold text-foreground">+{xpEarned} XP</p>
                </div>
              </div>
              <div className="text-3xl">⭐</div>
            </div>
          </Card>

          {/* Streak */}
          <Card className="border border-border/50 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10">
                  <Flame className="h-6 w-6 text-accent" />
                </div>
                <div>
                  <p className="text-sm text-foreground/70">Streak</p>
                  <p className="text-2xl font-bold text-foreground">
                    🔥 3 days
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-foreground/50">Keep it up!</p>
              </div>
            </div>
          </Card>

          {/* Progress */}
          <Card className="border border-border/50 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <TrendingUp className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-foreground/70">Course Progress</p>
                  <p className="text-2xl font-bold text-foreground">12%</p>
                </div>
              </div>
              <div className="h-12 w-12 rounded-full border-4 border-primary/20 flex items-center justify-center">
                <span className="text-sm font-bold text-primary">12%</span>
              </div>
            </div>
          </Card>
        </div>

        {/* Unlock Message */}
        <Card className="border-2 border-primary/50 bg-primary/5 p-6 text-center">
          <p className="text-foreground">
            <span className="font-bold text-primary">Next lesson unlocked!</span>
            <br />
            Come back tomorrow to learn more.
          </p>
        </Card>

        {/* Action Buttons */}
        <div className="space-y-3">
          <Link href="/dashboard" className="w-full">
            <Button size="lg" className="w-full gap-2">
              Back to Dashboard
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>

          <Button size="lg" variant="outline" className="w-full gap-2 bg-transparent">
            <RotateCcw className="h-4 w-4" />
            Review Mistakes
          </Button>
        </div>

        {/* Motivational Message */}
        <div className="rounded-lg bg-secondary/30 p-4 text-center">
          <p className="text-sm text-foreground/70">
            "Language learning is a marathon, not a sprint. You're doing great!" 🚀
          </p>
        </div>
      </div>
    </main>
  )
}
