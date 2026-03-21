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
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(249,115,22,0.12),_transparent_28%),linear-gradient(180deg,#fffdf8_0%,#fffaf2_42%,#ffffff_100%)]">
      <header className="sticky top-0 z-40 border-b border-border/20 bg-background/90 px-4 py-5 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary/65">Learner Space</p>
            <h1 className="text-2xl font-black text-foreground sm:text-3xl">Your language journey</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="rounded-2xl">
              <Settings className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" className="rounded-2xl" onClick={() => void logout()}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <section className="px-4 py-8 sm:py-10">
        <div className="mx-auto max-w-6xl space-y-8">
          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)]">
            <Card className="overflow-hidden border-0 bg-[#8f3f00] p-5 text-white shadow-[0_26px_70px_rgba(143,63,0,0.28)] animate-in fade-in slide-in-from-bottom-4 duration-500 sm:p-8">
              <div className="relative space-y-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-white/90">
                      <Sparkles className="h-3.5 w-3.5" />
                      Ready to continue
                    </div>
                    <div>
                      <p className="text-sm text-white/85">Current language</p>
                      <h2 className="text-3xl font-black capitalize text-white sm:text-4xl">
                        {data?.stats.currentLanguage || '-'}
                      </h2>
                    </div>
                  </div>
                  <div className="grid w-full gap-3 sm:grid-cols-2 lg:w-auto lg:min-w-[240px]">
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

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
                  <Link href={nextLessonHref}>
                    <div className="group rounded-[28px] border border-white/12 bg-white/8 p-5 shadow-lg backdrop-blur-sm transition-all duration-300 hover:border-white/25 hover:bg-white/12 hover:-translate-y-1">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-sm font-semibold text-white/90">
                          <BookOpen className="h-4 w-4 text-amber-300" />
                          Next lesson
                        </div>
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 transition-colors group-hover:bg-white/15">
                          <ArrowRight className="h-5 w-5" />
                        </div>
                      </div>
                      <h3 className="text-2xl font-black text-white">
                        {data?.nextLesson?.title || 'No lesson available'}
                      </h3>
                      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/85">
                        {data?.nextLesson?.description || 'You are up to date for now.'}
                      </p>
                      <div className="mt-5 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/80">
                        {data?.nextLesson?.unitTitle ? <span>{data.nextLesson.unitTitle}</span> : null}
                        {data?.nextLesson?.totalStages ? (
                          <span>
                            {data.nextLesson.progressPercent && data.nextLesson.progressPercent > 0
                              ? `Stage ${(data.nextLesson.currentStageIndex ?? 0) + 1} / ${data.nextLesson.totalStages}`
                              : `${data.nextLesson.totalStages} stages`}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </Link>

                  <div className="rounded-[28px] border border-white/12 bg-white/8 p-5 shadow-lg backdrop-blur-sm transition-transform duration-300 hover:-translate-y-1">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-sm font-semibold text-white/90">
                        <Target className="h-4 w-4 text-emerald-300" />
                        Today's goal
                      </div>
                      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-white/55">
                        {data?.stats.todayMinutes || 0}/{data?.stats.dailyGoalMinutes || 0} min
                      </span>
                    </div>
                    <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,#facc15_0%,#fb923c_50%,#34d399_100%)] transition-all duration-500"
                        style={{ width: `${dailyPercent}%` }}
                      />
                    </div>
                    <p className="mt-4 text-sm leading-relaxed text-white/85">
                      Keep the streak alive by clearing one more stage or finishing your next lesson.
                    </p>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="overflow-hidden border border-primary/15 bg-white/85 p-5 shadow-[0_16px_40px_rgba(249,115,22,0.10)] backdrop-blur-sm animate-in fade-in slide-in-from-bottom-4 duration-500 sm:p-7">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/60">Momentum</p>
                  <h2 className="text-xl font-black text-foreground">This week</h2>
                </div>
                <div className="rounded-full border border-primary/15 bg-primary/8 px-3 py-1 text-xs font-semibold text-primary">
                  {completedLessonCount} lessons done
                </div>
              </div>

              <div className="-mx-1 overflow-x-auto px-1 pb-1">
                <div className="grid min-w-[460px] grid-cols-7 gap-2">
                  {(data?.weeklyOverview || []).map((day) => (
                    <div
                      key={day.day}
                      className={cn(
                        'rounded-2xl border p-3 text-center transition-all',
                        day.completed
                          ? 'border-primary/20 bg-[linear-gradient(180deg,rgba(249,115,22,0.14),rgba(251,191,36,0.12))] shadow-sm'
                          : 'border-border/40 bg-background/70'
                      )}
                    >
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-foreground/45">{day.day}</p>
                      <div className="mt-3 flex justify-center">
                        <div
                          className={cn(
                            'flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-black',
                            day.completed ? 'bg-primary text-white' : 'bg-muted text-foreground/45'
                          )}
                        >
                          {day.completed ? day.minutes : '-'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {data?.achievements?.length ? (
                <div className="mt-6 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-foreground/45">Highlights</p>
                  <div className="flex flex-wrap gap-2">
                    {data.achievements.slice(0, 5).map((achievement) => (
                      <span
                        key={achievement}
                        className="rounded-full border border-secondary/30 bg-secondary/15 px-3 py-1.5 text-xs font-semibold text-foreground/70 transition-transform duration-300 hover:-translate-y-0.5"
                      >
                        {achievement}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </Card>
          </section>

          <section className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/55">Curriculum</p>
                <h2 className="flex items-center gap-2 text-2xl font-black text-foreground">
                  <Layers className="h-5 w-5 text-primary" />
                  Chapter Map
                </h2>
              </div>
              {activeUnit ? (
                <div className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
                  {activeUnit.completedLessons}/{activeUnit.totalLessons} lessons cleared
                </div>
              ) : null}
            </div>

            {data?.units && data.units.length > 0 ? (
              <div className="space-y-6">
                <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2">
                  {data.units.map((unit) => {
                    const active = activeUnit?.id === unit.id
                    return (
                      <button
                        key={unit.id}
                        type="button"
                        onClick={() => setExpandedUnitId(unit.id)}
                        className={cn(
                          'group min-w-[82vw] max-w-[82vw] snap-start rounded-[28px] border p-5 text-left transition-all duration-300 sm:min-w-[250px] sm:max-w-[250px]',
                          active
                            ? 'border-primary/30 bg-[linear-gradient(160deg,rgba(249,115,22,0.14),rgba(251,191,36,0.08),#fff)] shadow-[0_18px_40px_rgba(249,115,22,0.16)] sm:-translate-y-1'
                            : 'border-border/40 bg-white/85 hover:border-primary/20 hover:shadow-[0_12px_30px_rgba(15,23,42,0.08)] sm:hover:-translate-y-1'
                        )}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-foreground/45">
                              Unit {unit.orderIndex + 1}
                            </p>
                            <h3 className="mt-2 text-lg font-black text-foreground">{unit.title}</h3>
                          </div>
                          <div className="rounded-full bg-background/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary/75">
                            {unit.level}
                          </div>
                        </div>
                        <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-foreground/65">{unit.description}</p>
                        <div className="mt-5 space-y-2">
                          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.16em] text-foreground/45">
                            <span>Progress</span>
                            <span>{unit.progressPercent}%</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-[linear-gradient(90deg,#f97316_0%,#facc15_100%)]" style={{ width: `${unit.progressPercent}%` }} />
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>

                {activeUnit ? (
                  <Card className="overflow-hidden border border-primary/15 bg-white/88 p-5 shadow-[0_22px_60px_rgba(15,23,42,0.08)] backdrop-blur-sm animate-in fade-in slide-in-from-bottom-4 duration-500 sm:p-8">
                    <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                      <div className="max-w-2xl">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/60">Active chapter</p>
                        <h3 className="mt-2 text-2xl font-black text-foreground sm:text-3xl">{activeUnit.title}</h3>
                        <p className="mt-3 text-sm leading-relaxed text-foreground/65">
                          {activeUnit.description || 'Unit curriculum'}
                        </p>
                      </div>
                      <div className="w-full rounded-[24px] border border-primary/15 bg-primary/8 px-5 py-4 text-left sm:w-auto sm:text-right">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/60">Progress</p>
                        <p className="mt-2 text-3xl font-black text-primary">{activeUnit.progressPercent}%</p>
                      </div>
                    </div>

                    <div className="relative">
                      <div className="absolute left-[1.35rem] top-0 h-full w-px bg-[linear-gradient(180deg,rgba(249,115,22,0.15),rgba(251,191,36,0.3),rgba(15,23,42,0.08))] md:left-1/2 md:-translate-x-1/2" />

                      <div className="space-y-5 sm:space-y-6">
                        {activeUnit.lessons.map((lesson, index) => {
                          const stageLabel = lesson.totalStages
                            ? lesson.status === 'completed'
                              ? `${lesson.totalStages}/${lesson.totalStages} stages`
                              : lesson.status === 'in_progress'
                                ? `Stage ${(lesson.currentStageIndex ?? 0) + 1} of ${lesson.totalStages}`
                                : `${lesson.totalStages} stages`
                            : null

                          return (
                            <div
                              key={lesson.id}
                              className="relative grid grid-cols-[3rem_minmax(0,1fr)] gap-3 md:grid-cols-2 md:gap-10 animate-in fade-in slide-in-from-bottom-4 duration-500"
                              style={{ animationDelay: `${index * 70}ms` }}
                            >
                              <div
                                className={cn(
                                  'col-start-2 md:col-span-1',
                                  index % 2 === 0 ? 'md:col-start-1 md:pr-10' : 'md:col-start-2 md:pl-10'
                                )}
                              >
                                <Link href={`/lesson-overview?lessonId=${lesson.id}`}>
                                  <div
                                    className={cn(
                                      'group rounded-[26px] border p-4 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg sm:p-5',
                                      lesson.status === 'completed' && 'border-emerald-200 bg-emerald-50/70',
                                      lesson.status === 'in_progress' && 'border-primary/25 bg-[linear-gradient(160deg,rgba(249,115,22,0.10),rgba(251,191,36,0.08),#fff)]',
                                      lesson.status === 'not_started' && 'border-border/40 bg-white/92'
                                    )}
                                  >
                                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                      <div>
                                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-foreground/45">
                                          Lesson {lesson.orderIndex + 1}
                                        </p>
                                        <h4 className="mt-2 text-lg font-black text-foreground sm:text-xl">{lesson.title}</h4>
                                      </div>
                                      <LessonStatusBadge status={lesson.status} />
                                    </div>
                                    <p className="text-sm leading-relaxed text-foreground/65">{lesson.description || 'Lesson'}</p>
                                    <div className="mt-4 flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.16em] text-foreground/45">
                                      <span>{lesson.level}</span>
                                      {stageLabel ? <span>{stageLabel}</span> : null}
                                      {lesson.status === 'completed' ? <span>Cleared</span> : null}
                                    </div>
                                    <div className="mt-5 flex items-center justify-between gap-3">
                                      <div className="h-2 w-24 overflow-hidden rounded-full bg-muted/80 sm:w-28">
                                        <div
                                          className={cn(
                                            'h-full rounded-full',
                                            lesson.status === 'completed'
                                              ? 'bg-emerald-500'
                                              : lesson.status === 'in_progress'
                                                ? 'bg-[linear-gradient(90deg,#f97316_0%,#facc15_100%)]'
                                                : 'bg-border'
                                          )}
                                          style={{ width: `${lesson.status === 'not_started' ? 24 : Math.max(lesson.progressPercent, 18)}%` }}
                                        />
                                      </div>
                                      <span className="inline-flex items-center gap-1 text-sm font-bold text-primary transition-all group-hover:gap-2">
                                        {LESSON_STATUS_LABELS[lesson.status]}
                                        <ChevronRight className="h-4 w-4" />
                                      </span>
                                    </div>
                                  </div>
                                </Link>
                              </div>

                              <div className="pointer-events-none col-start-1 row-start-1 flex justify-center md:absolute md:left-1/2 md:top-8 md:w-0 md:-translate-x-1/2">
                                <div
                                  className={cn(
                                    'flex h-11 w-11 items-center justify-center rounded-2xl border-4 border-background shadow-sm transition-transform duration-300',
                                    lesson.status === 'completed' && 'bg-emerald-500 text-white',
                                    lesson.status === 'in_progress' && 'scale-110 bg-primary text-white',
                                    lesson.status === 'not_started' && 'bg-muted text-foreground/50'
                                  )}
                                >
                                  {lesson.status === 'completed' ? (
                                    <CheckCircle2 className="h-5 w-5" />
                                  ) : (
                                    <span className="text-sm font-black">{lesson.orderIndex + 1}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </Card>
                ) : null}
              </div>
            ) : (
              <Card className="rounded-[28px] border border-border/50 bg-white/85 p-8 text-sm text-foreground/70 shadow-sm">
                No published units are available yet.
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
