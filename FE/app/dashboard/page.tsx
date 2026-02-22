'use client'

import { useEffect, useState } from "react"
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ArrowRight, Flame, Target, BookOpen, Settings, LogOut } from 'lucide-react'
import Link from 'next/link'
import { learnerDashboardService, learnerAuthService } from "@/services"

type DashboardData = {
  stats: {
    currentLanguage: string
    streakDays: number
    totalXp: number
    dailyGoalMinutes: number
    todayMinutes: number
  }
  nextLesson: {
    id: string
    title: string
    description: string
  } | null
  completedLessons: {
    id: string
    title: string
    description: string
    level: string
    completedAt: string | null
  }[]
  weeklyOverview: { day: string; completed: boolean; minutes: number }[]
  achievements: string[]
}

export default function DashboardScreen() {
  const [data, setData] = useState<DashboardData | null>(null)

  useEffect(() => {
    learnerDashboardService
      .getOverview()
      .then((payload) => setData(payload))
      .catch((error) => console.error("Failed to load dashboard", error))
  }, [])

  const dailyPercent = data
    ? Math.min(100, Math.round((data.stats.todayMinutes / data.stats.dailyGoalMinutes) * 100))
    : 0

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/20 bg-background/95 px-4 py-6 backdrop-blur-sm sticky top-0 z-40">
        <div className="mx-auto max-w-4xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-foreground/60">Welcome back!</p>
              <h1 className="text-2xl font-bold text-foreground">Learning Dashboard</h1>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="icon">
                <Settings className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => learnerAuthService.logout()}>
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <section className="px-4 py-8">
        <div className="mx-auto max-w-4xl space-y-8">
          {/* Quick Stats */}
          <div className="grid gap-4 md:grid-cols-3">
            {/* Current Language */}
            <Card className="border border-border/50 p-6">
              <div className="space-y-2">
                <p className="text-sm text-foreground/60">Current Language</p>
                <h3 className="text-2xl font-bold text-foreground capitalize">{data?.stats.currentLanguage || "-"}</h3>
              </div>
            </Card>

            {/* Streak */}
            <Card className="border border-border/50 p-6">
              <div className="space-y-2 flex items-center gap-2">
                <Flame className="h-6 w-6 text-accent" />
                <div>
                  <p className="text-sm text-foreground/60">Streak</p>
                  <h3 className="text-2xl font-bold text-foreground">{data?.stats.streakDays || 0} Days</h3>
                </div>
              </div>
            </Card>

            {/* Total XP */}
            <Card className="border border-border/50 p-6">
              <div className="space-y-2">
                <p className="text-sm text-foreground/60">Total XP</p>
                <h3 className="text-2xl font-bold text-primary">{data?.stats.totalXp || 0} XP</h3>
              </div>
            </Card>
          </div>

          {/* Today's Goal Progress */}
          <Card className="border border-border/50 p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-foreground flex items-center gap-2">
                  <Target className="h-5 w-5 text-primary" />
                  Today's Goal
                </h3>
                <span className="text-sm text-foreground/60">{data?.stats.todayMinutes || 0} min / {data?.stats.dailyGoalMinutes || 0} min</span>
              </div>
              <div className="space-y-2">
                <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${dailyPercent}%` }}
                  />
                </div>
                <p className="text-xs text-foreground/60">
                  Keep going. Your progress updates as you complete lessons.
                </p>
              </div>
            </div>
          </Card>

          {/* Continue Learning */}
          <div className="space-y-4">
            <h2 className="font-bold text-foreground">Continue Learning</h2>
            <Link href={data?.nextLesson ? `/lesson-overview?lessonId=${data.nextLesson.id}` : "/lesson-overview"}>
              <Card className="border border-border/50 p-6 cursor-pointer hover:border-primary/50 transition-all hover:shadow-md group">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-5 w-5 text-primary" />
                      <span className="text-sm text-foreground/60">Next Lesson</span>
                    </div>
                    <h3 className="text-lg font-bold text-foreground">{data?.nextLesson?.title || "No lesson available"}</h3>
                    <p className="text-sm text-foreground/70">
                      {data?.nextLesson?.description || "You've completed available lessons. Retake from Completed Lessons below."}
                    </p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                    <ArrowRight className="h-5 w-5 text-primary" />
                  </div>
                </div>
              </Card>
            </Link>
          </div>

          {/* Completed Lessons */}
          <div className="space-y-4">
            <h2 className="font-bold text-foreground">Completed Lessons</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {(data?.completedLessons || []).map((lesson) => (
                <Card key={lesson.id} className="border border-border/50 p-5">
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-foreground/60">{lesson.level}</p>
                      <h3 className="text-base font-bold text-foreground">{lesson.title}</h3>
                      <p className="text-sm text-foreground/70">{lesson.description || "Review lesson phrases and retake exercises."}</p>
                    </div>
                    <Link href={`/lesson-overview?lessonId=${lesson.id}`}>
                      <Button variant="outline" size="sm">Retake Lesson</Button>
                    </Link>
                  </div>
                </Card>
              ))}
            </div>
            {data && (!data.completedLessons || data.completedLessons.length === 0) ? (
              <Card className="border border-border/50 p-5 text-sm text-foreground/70">
                Complete your first lesson to unlock quick retakes here.
              </Card>
            ) : null}
          </div>

          {/* Weekly Overview */}
          <div className="space-y-4">
            <h2 className="font-bold text-foreground">Weekly Overview</h2>
            <Card className="border border-border/50 p-6">
              <div className="space-y-4">
                {(data?.weeklyOverview || []).map((day) => (
                  <div key={day.day} className="flex items-center gap-3">
                    <div className="text-sm font-medium text-foreground w-10">
                      {day.day}
                    </div>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full ${
                          day.completed ? 'bg-primary' : 'bg-muted'
                        } transition-all`}
                        style={{ width: day.completed ? '100%' : '0%' }}
                      />
                    </div>
                    <span className="text-xs text-foreground/60">
                      {day.completed ? `${day.minutes} min` : '-'}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Recent Achievements */}
          <div className="space-y-4">
            <h2 className="font-bold text-foreground">Recent Achievements</h2>
            <div className="grid gap-4 md:grid-cols-3">
              {(data?.achievements || []).map((achievement, index) => (
                <Card
                  key={index}
                  className="border border-border/50 p-6 text-center space-y-2"
                >
                  <div className="text-4xl">🏅</div>
                  <h4 className="font-bold text-foreground">{achievement}</h4>
                  <p className="text-xs text-foreground/60">Unlocked by learner progress</p>
                </Card>
              ))}
            </div>
          </div>

          {/* Switch Language */}
          <Card className="border border-border/50 p-6 bg-secondary/30">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-foreground">Want to learn another language?</h3>
                <p className="text-sm text-foreground/70">
                  Switch or add a new language to your learning path
                </p>
              </div>
              <Link href="/language-selection">
                <Button variant="outline" size="sm">
                  Browse Languages
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </section>
    </main>
  )
}
