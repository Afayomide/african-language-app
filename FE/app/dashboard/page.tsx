'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Flame,
  Layers,
  LogOut,
  Settings,
  Sparkles,
  Star,
  Target,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useLearnerAuth } from '@/components/auth/learner-auth-provider'
import { learnerDashboardService } from '@/services'
import { cn } from '@/lib/utils'

type UnitLesson = {
  id: string
  title: string
  description: string
  level: string
  orderIndex: number
  status: 'not_started' | 'in_progress' | 'completed'
  progressPercent: number
  currentStageIndex?: number
  totalStages?: number
}

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
    unitId?: string
    unitTitle?: string
    title: string
    description: string
    currentStageIndex?: number
    totalStages?: number
    progressPercent?: number
  } | null
  units?: Array<{
    id: string
    title: string
    description: string
    level: string
    orderIndex: number
    progressPercent: number
    completedLessons: number
    totalLessons: number
    lessons: UnitLesson[]
  }>
  completedLessons: {
    id: string
    unitId?: string
    unitTitle?: string
    title: string
    description: string
    level: string
    completedAt: string | null
  }[]
  weeklyOverview: { day: string; completed: boolean; minutes: number }[]
  achievements: string[]
}

const LESSON_STATUS_LABELS: Record<UnitLesson['status'], string> = {
  not_started: 'Start',
  in_progress: 'Continue',
  completed: 'Review',
}

export default function DashboardScreen() {
  const { logout, isLoading: isAuthLoading, isAuthenticated, session } = useLearnerAuth()
  const [data, setData] = useState<DashboardData | null>(null)
  const [expandedUnitId, setExpandedUnitId] = useState<string>('')

  useEffect(() => {
    if (isAuthLoading || !isAuthenticated || session?.requiresOnboarding) return
    learnerDashboardService
      .getOverview()
      .then((payload) => setData(payload))
      .catch((error) => console.error('Failed to load dashboard', error))
  }, [isAuthLoading, isAuthenticated, session?.requiresOnboarding])

  useEffect(() => {
    if (!data?.units || data.units.length === 0) return
    if (expandedUnitId && data.units.some((unit) => unit.id === expandedUnitId)) return
    setExpandedUnitId(data.units[0].id)
  }, [data?.units, expandedUnitId])

  const dailyPercent = data
    ? Math.min(100, Math.round((data.stats.todayMinutes / Math.max(1, data.stats.dailyGoalMinutes)) * 100))
    : 0

  const activeUnit = useMemo(() => {
    if (!data?.units?.length) return null
    return data.units.find((unit) => unit.id === expandedUnitId) || data.units[0]
  }, [data?.units, expandedUnitId])

  const nextLessonHref = data?.nextLesson ? `/lesson-overview?lessonId=${data.nextLesson.id}` : '/dashboard'
  const completedLessonCount = data?.completedLessons?.length || 0

  return (
    <main className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-100/20 via-background to-background">
      <header className="sticky top-0 z-40 border-b border-white/50 bg-background/80 px-4 py-6 backdrop-blur-md transition-all duration-300">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="flex flex-col">
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-primary/80 transition-colors hover:text-primary">
              Learner Space
            </p>
            <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">
              Your language journey
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-full text-muted-foreground transition-transform hover:rotate-45 hover:bg-primary/10 hover:text-primary"
            >
              <Settings className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-full text-muted-foreground transition-transform hover:scale-110 hover:bg-destructive/10 hover:text-destructive"
              onClick={() => void logout()}
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <section className="px-4 py-8 sm:py-12">
        <div className="mx-auto max-w-6xl space-y-10">
          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)]">
            <Card className="group relative overflow-hidden border-0 bg-gradient-to-br from-[#8f3f00] via-[#a34a00] to-[#b85d00] p-6 text-white shadow-[0_20px_60px_-15px_rgba(143,63,0,0.3)] transition-all duration-500 hover:shadow-[0_30px_80px_-20px_rgba(143,63,0,0.4)] sm:p-8">
              {/* Background Pattern */}
              <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/5 blur-3xl transition-transform duration-700 group-hover:scale-150" />
              <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-orange-500/10 blur-3xl transition-transform duration-700 group-hover:scale-150" />

              <div className="relative space-y-8">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-4">
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-white/90 shadow-sm backdrop-blur-sm transition-colors hover:bg-white/20">
                      <Sparkles className="h-3.5 w-3.5 animate-pulse text-yellow-300" />
                      Ready to continue
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white/80">Current language</p>
                      <h2 className="text-4xl font-black capitalize tracking-tight text-white sm:text-5xl">
                        {data?.stats.currentLanguage || '-'}
                      </h2>
                    </div>
                  </div>
                  <div className="grid w-full gap-3 sm:grid-cols-2 lg:w-auto lg:min-w-[260px]">
                    <DashboardStatPill
                      icon={Flame}
                      label="Streak"
                      value={`${data?.stats.streakDays || 0} days`}
                      tone="warm"
                    />
                    <DashboardStatPill
                      icon={Star}
                      label="XP"
                      value={`${data?.stats.totalXp || 0} XP`}
                      tone="bright"
                    />
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                  <Link href={nextLessonHref} className="h-full">
                    <div className="group/card relative h-full rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/10 hover:shadow-xl">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-sm font-bold text-white/90">
                          <div className="rounded-lg bg-amber-400/20 p-1.5 text-amber-300">
                            <BookOpen className="h-4 w-4" />
                          </div>
                          Next lesson
                        </div>
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-all duration-300 group-hover/card:scale-110 group-hover/card:bg-white/20">
                          <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover/card:translate-x-0.5" />
                        </div>
                      </div>
                      <h3 className="line-clamp-2 text-2xl font-black leading-tight text-white">
                        {data?.nextLesson?.title || 'No lesson available'}
                      </h3>
                      <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-white/70">
                        {data?.nextLesson?.description || 'You are up to date for now.'}
                      </p>
                      <div className="mt-6 flex flex-wrap items-center gap-3">
                        {data?.nextLesson?.unitTitle ? (
                          <span className="rounded-md bg-white/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white/80">
                            {data.nextLesson.unitTitle}
                          </span>
                        ) : null}
                        {data?.nextLesson?.totalStages ? (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-white/60">
                            {data.nextLesson.progressPercent && data.nextLesson.progressPercent > 0
                              ? `Stage ${(data.nextLesson.currentStageIndex ?? 0) + 1} / ${data.nextLesson.totalStages}`
                              : `${data.nextLesson.totalStages} stages`}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </Link>

                  <div className="flex flex-col justify-between rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-md transition-transform duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/10">
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-sm font-bold text-white/90">
                          <div className="rounded-lg bg-emerald-400/20 p-1.5 text-emerald-300">
                            <Target className="h-4 w-4" />
                          </div>
                          Today's goal
                        </div>
                      </div>
                      <div className="mt-6 flex items-end gap-2">
                        <span className="text-4xl font-black text-white">{data?.stats.todayMinutes || 0}</span>
                        <span className="mb-1.5 text-sm font-medium text-white/60">
                          / {data?.stats.dailyGoalMinutes || 0} min
                        </span>
                      </div>
                    </div>
                    
                    <div className="mt-6 space-y-2">
                      <div className="h-3 w-full overflow-hidden rounded-full bg-black/20 p-0.5">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-amber-300 to-emerald-400 shadow-[0_0_10px_rgba(251,191,36,0.5)] transition-all duration-1000 ease-out"
                          style={{ width: `${dailyPercent}%` }}
                        />
                      </div>
                      <p className="text-center text-[10px] font-medium text-white/50">
                        {dailyPercent < 100 ? 'Keep pushing!' : 'Goal reached! 🎉'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="overflow-hidden border border-border/50 bg-white/60 p-6 shadow-lg backdrop-blur-xl transition-all duration-300 hover:shadow-xl sm:p-8">
              <div className="mb-6 flex items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-primary/60">Momentum</p>
                  <h2 className="text-xl font-black text-foreground">This week</h2>
                </div>
                <div className="rounded-full border border-primary/10 bg-primary/5 px-3 py-1 text-xs font-bold text-primary">
                  {completedLessonCount} lessons
                </div>
              </div>

              <div className="-mx-2 overflow-x-auto px-2 pb-2">
                <div className="grid min-w-[360px] grid-cols-7 gap-3">
                  {(data?.weeklyOverview || []).map((day, i) => (
                    <div
                      key={day.day}
                      className={cn(
                        'group flex flex-col items-center gap-3 rounded-2xl border p-3 transition-all duration-300',
                        day.completed
                          ? 'border-orange-200 bg-orange-50/50 hover:-translate-y-1 hover:shadow-md'
                          : 'border-transparent bg-transparent hover:bg-muted/50'
                      )}
                      style={{ transitionDelay: `${i * 50}ms` }}
                    >
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground group-hover:text-foreground">
                        {day.day}
                      </span>
                      <div
                        className={cn(
                          'flex h-10 w-10 items-center justify-center rounded-xl text-sm font-black shadow-sm transition-all duration-300 group-hover:scale-110',
                          day.completed
                            ? 'bg-gradient-to-br from-orange-400 to-amber-400 text-white shadow-orange-200'
                            : 'bg-muted text-muted-foreground/40'
                        )}
                      >
                        {day.completed ? (
                          <CheckCircle2 className="h-5 w-5" />
                        ) : (
                          <div className="h-1.5 w-1.5 rounded-full bg-current opacity-30" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {data?.achievements?.length ? (
                <div className="mt-8 space-y-4 border-t border-border/40 pt-6">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Recent Achievements</p>
                  <div className="flex flex-wrap gap-2">
                    {data.achievements.slice(0, 5).map((achievement) => (
                      <span
                        key={achievement}
                        className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[11px] font-bold text-primary transition-all hover:bg-primary/10 hover:shadow-sm"
                      >
                        <Star className="h-3 w-3 fill-primary text-primary" />
                        {achievement}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </Card>
          </section>

          <section className="space-y-6">
            <div className="flex items-end justify-between gap-4 border-b border-border/40 pb-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground">Curriculum</p>
                <h2 className="mt-1 flex items-center gap-2 text-2xl font-black text-foreground">
                  <Layers className="h-6 w-6 text-primary" />
                  Chapter Map
                </h2>
              </div>
              {activeUnit ? (
                <div className="hidden rounded-full bg-secondary px-3 py-1 text-xs font-bold text-secondary-foreground sm:block">
                  {activeUnit.completedLessons} / {activeUnit.totalLessons} complete
                </div>
              ) : null}
            </div>

            {data?.units && data.units.length > 0 ? (
              <div className="space-y-8">
                {/* Unit Selector */}
                <div className="scrollbar-hide flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4">
                  {data.units.map((unit) => {
                    const active = activeUnit?.id === unit.id
                    return (
                      <button
                        key={unit.id}
                        type="button"
                        onClick={() => setExpandedUnitId(unit.id)}
                        className={cn(
                          'group relative min-w-[280px] max-w-[280px] snap-start overflow-hidden rounded-[32px] border p-6 text-left transition-all duration-300',
                          active
                            ? 'border-primary/50 bg-white ring-4 ring-primary/10 scale-[1.02] shadow-xl shadow-orange-500/10'
                            : 'border-border bg-white/50 hover:border-primary/30 hover:bg-white hover:-translate-y-1 hover:shadow-lg'
                        )}
                      >
                        <div className={cn(
                          "absolute right-0 top-0 h-32 w-32 -translate-y-1/2 translate-x-1/2 rounded-full blur-3xl transition-opacity",
                          active ? "bg-orange-500/10 opacity-100" : "opacity-0"
                        )} />
                        
                        <div className="relative space-y-4">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className={cn(
                                "text-[10px] font-bold uppercase tracking-[0.2em] transition-colors",
                                active ? "text-primary" : "text-muted-foreground"
                              )}>
                                Unit {unit.orderIndex + 1}
                              </p>
                              <h3 className="mt-1 text-lg font-black leading-tight text-foreground">{unit.title}</h3>
                            </div>
                            <div className={cn(
                              "rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors",
                              active ? "bg-primary text-white" : "bg-muted text-muted-foreground"
                            )}>
                              {unit.level}
                            </div>
                          </div>
                          
                          <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">{unit.description}</p>
                          
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                              <span>Progress</span>
                              <span>{unit.progressPercent}%</span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-secondary">
                              <div 
                                className="h-full rounded-full bg-gradient-to-r from-orange-400 to-amber-400 transition-all duration-1000" 
                                style={{ width: `${unit.progressPercent}%` }} 
                              />
                            </div>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>

                {activeUnit ? (
                  <div className="relative mx-auto max-w-3xl">
                    {/* Visual Connector Line */}
                    <div className="absolute left-[24px] top-8 h-[calc(100%-2rem)] w-0.5 -translate-x-1/2 bg-gradient-to-b from-transparent via-border to-transparent md:left-1/2" />

                    <div className="space-y-8 pb-12">
                      {activeUnit.lessons.map((lesson, index) => {
                        const isCompleted = lesson.status === 'completed'
                        const isCurrent = lesson.status === 'in_progress'
                        const isLocked = lesson.status === 'not_started'
                        
                        const alignment = index % 2 === 0 ? 'left' : 'right'

                        return (
                          <div
                            key={lesson.id}
                            className={cn(
                              "relative flex items-center gap-6 md:gap-12",
                              alignment === 'left' ? "md:flex-row" : "md:flex-row-reverse"
                            )}
                          >
                            {/* Desktop Spacer for Alignment */}
                            <div className="hidden flex-1 md:block" />

                            {/* Center Node */}
                            <div className="absolute left-[24px] z-10 flex h-12 w-12 -translate-x-1/2 items-center justify-center rounded-full border-4 border-background bg-background shadow-lg transition-transform duration-300 hover:scale-110 md:left-1/2">
                              <div className={cn(
                                "flex h-full w-full items-center justify-center rounded-full transition-colors",
                                isCompleted ? "bg-emerald-500 text-white" : 
                                isCurrent ? "bg-primary text-white animate-pulse" : "bg-muted text-muted-foreground/40"
                              )}>
                                {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : <span className="text-sm font-black">{lesson.orderIndex + 1}</span>}
                              </div>
                            </div>

                            {/* Content Card */}
                            <div className={cn("flex-1 pl-16 md:pl-0", alignment === 'right' ? "md:pr-12" : "md:pl-12")}>
                              <Link href={isLocked ? '#' : `/lesson-overview?lessonId=${lesson.id}`} className={cn(isLocked && "pointer-events-none")}>
                                <div
                                  className={cn(
                                    'group relative overflow-hidden rounded-[24px] border p-5 shadow-sm transition-all duration-300',
                                    isCompleted 
                                      ? 'border-emerald-200 bg-emerald-50/40 hover:bg-emerald-50 hover:shadow-md'
                                      : isCurrent 
                                        ? 'border-primary/40 bg-white ring-4 ring-primary/5 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/10'
                                        : 'border-border/60 bg-white/60 opacity-80 grayscale hover:opacity-100 hover:grayscale-0'
                                  )}
                                >
                                  {isCurrent && (
                                    <div className="absolute -right-12 -top-12 h-24 w-24 rounded-full bg-primary/10 blur-2xl" />
                                  )}
                                  
                                  <div className="flex flex-col gap-3">
                                    <div className="flex items-start justify-between gap-4">
                                      <div>
                                        <div className="flex items-center gap-2">
                                          <span className={cn(
                                            "text-[10px] font-bold uppercase tracking-wider",
                                            isCompleted ? "text-emerald-600" : isCurrent ? "text-primary" : "text-muted-foreground"
                                          )}>
                                            Lesson {lesson.orderIndex + 1}
                                          </span>
                                          {isCurrent && (
                                            <span className="relative flex h-2 w-2">
                                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75"></span>
                                              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary"></span>
                                            </span>
                                          )}
                                        </div>
                                        <h4 className="mt-1 text-lg font-black text-foreground">{lesson.title}</h4>
                                      </div>
                                      <LessonStatusBadge status={lesson.status} />
                                    </div>
                                    
                                    <p className="text-sm leading-relaxed text-muted-foreground">{lesson.description || 'Start your lesson'}</p>
                                    
                                    <div className="mt-2 flex items-center justify-between gap-4 border-t border-border/50 pt-3">
                                      <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                        <span className="rounded-md bg-secondary px-1.5 py-0.5">{lesson.level}</span>
                                        {lesson.totalStages && <span>{lesson.totalStages} stages</span>}
                                      </div>
                                      
                                      {!isLocked && (
                                        <span className={cn(
                                          "flex items-center gap-1 text-xs font-bold transition-all group-hover:gap-2",
                                          isCompleted ? "text-emerald-600" : "text-primary"
                                        )}>
                                          {LESSON_STATUS_LABELS[lesson.status]}
                                          <ArrowRight className="h-3.5 w-3.5" />
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </Link>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <Card className="flex min-h-[200px] flex-col items-center justify-center gap-4 rounded-[32px] border-dashed border-border p-8 text-center">
                <div className="rounded-full bg-muted p-4">
                  <Layers className="h-8 w-8 text-muted-foreground/50" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-foreground">No units available</h3>
                  <p className="text-sm text-muted-foreground">Check back later for new content.</p>
                </div>
              </Card>
            )}
          </section>
        </div>
      </section>
    </main>
  )
}

function DashboardStatPill({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Flame
  label: string
  value: string
  tone: 'warm' | 'bright'
}) {
  return (
    <div
      className={cn(
        'rounded-[24px] border px-4 py-3 backdrop-blur-sm transition-transform duration-300 hover:-translate-y-1',
        tone === 'warm' ? 'border-amber-300/25 bg-amber-300/10' : 'border-white/15 bg-white/8'
      )}
    >
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/85">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-2 text-xl font-black text-white">{value}</p>
    </div>
  )
}

function LessonStatusBadge({ status }: { status: UnitLesson['status'] }) {
  if (status === 'completed') {
    return (
      <span className="rounded-full border border-emerald-300 bg-emerald-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
        Done
      </span>
    )
  }

  if (status === 'in_progress') {
    return (
      <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
        Live
      </span>
    )
  }

  return (
    <span className="rounded-full border border-border/40 bg-background px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/55">
      Up Next
    </span>
  )
}
