'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { LanguageSwitcher, type LearnerLanguageSummary } from '@/components/learner/language-switcher'
import type { Language } from '@/types'
import { cn } from '@/lib/utils'

type LessonSummary = {
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

type UnitSummary = {
  id: string
  chapterId?: string | null
  title: string
  description: string
  level: string
  orderIndex: number
  progressPercent: number
  completedLessons: number
  totalLessons: number
  lessons: LessonSummary[]
}

type ChapterSummary = {
  id: string
  title: string
  description: string
  level: string
  orderIndex: number
  progressPercent: number
  completedUnits: number
  totalUnits: number
  status: 'current' | 'completed' | 'locked' | 'available'
  units: UnitSummary[]
}

type DashboardData = {
  stats: {
    currentLanguage: string
    streakDays: number
    languageStreakDays?: number
    totalXp: number
    dailyGoalMinutes: number
    todayMinutes: number
    dailyProgressPercent?: number
    courseProgressPercent?: number
    completedLessonsCount?: number
    totalLessonsCount?: number
  }
  learnerLanguages?: LearnerLanguageSummary[]
  nextLesson: {
    id: string
    unitId?: string
    unitTitle?: string
    title: string
    description: string
    currentStageIndex?: number
    totalStages?: number
    progressPercent?: number
    orderIndex?: number
  } | null
  chapters?: ChapterSummary[]
}

type Props = {
  data: DashboardData | null
  isLoading?: boolean
  closeHref?: string
  isSwitchingLanguage?: boolean
  onSelectLanguage?: (language: Language) => void
}

const UNIT_OFFSETS = ['translate-x-4', '-translate-x-6', 'translate-x-0', 'translate-x-8', '-translate-x-2', 'translate-x-6']
const WEAVER_OFFSETS = [60, 60, 80, 70, 40, 52]
const WEAVER_TOPS = [0, 92, 184, 296, 408, 520]

function titleCaseLanguage(language?: string) {
  if (!language) return 'Your Language'
  return language.charAt(0).toUpperCase() + language.slice(1)
}

function MaterialIcon({ icon, className, filled = false }: { icon: string; className?: string; filled?: boolean }) {
  return <span className={cn('material-symbols-outlined', filled && 'material-symbols-filled', className)}>{icon}</span>
}

function computeChapterProgress(chapters: ChapterSummary[]) {
  const totals = chapters.reduce(
    (acc, chapter) => {
      acc.completed += chapter.units.reduce((sum, unit) => sum + unit.completedLessons, 0)
      acc.total += chapter.units.reduce((sum, unit) => sum + unit.totalLessons, 0)
      return acc
    },
    { completed: 0, total: 0 },
  )

  if (!totals.total) return 0
  return Math.round((totals.completed / totals.total) * 100)
}

function deriveCurrentChapter(chapters: ChapterSummary[], nextLesson: DashboardData['nextLesson']) {
  if (!chapters.length) return null
  if (nextLesson?.unitId) {
    const match = chapters.find((chapter) => chapter.units.some((unit) => unit.id === nextLesson.unitId))
    if (match) return match
  }
  return chapters.find((chapter) => chapter.status === 'current') || chapters.find((chapter) => chapter.progressPercent < 100) || chapters[0]
}

function deriveCurrentUnit(chapter: ChapterSummary | null, nextLesson: DashboardData['nextLesson']) {
  if (!chapter?.units.length) return null
  if (nextLesson?.unitId) {
    const match = chapter.units.find((unit) => unit.id === nextLesson.unitId)
    if (match) return match
  }
  return chapter.units.find((unit) => unit.progressPercent < 100) || chapter.units[0]
}

function deriveCurrentLesson(unit: UnitSummary | null, nextLesson: DashboardData['nextLesson']) {
  if (!unit?.lessons.length) return null
  if (nextLesson?.id) {
    const match = unit.lessons.find((lesson) => lesson.id === nextLesson.id)
    if (match) return match
  }
  return unit.lessons.find((lesson) => lesson.status !== 'completed') || unit.lessons[0]
}

function getWeaverLessonPosition(index: number) {
  return {
    side: index % 2 === 0 ? 'left' : 'right',
    offset: WEAVER_OFFSETS[index] ?? WEAVER_OFFSETS[index % WEAVER_OFFSETS.length],
    top: WEAVER_TOPS[index] ?? index * 112,
  }
}

export function LanguageOverviewScreen({
  data,
  isLoading = false,
  closeHref = '/dashboard',
  isSwitchingLanguage = false,
  onSelectLanguage,
}: Props) {
  const chapters = data?.chapters || []
  const languageLabel = titleCaseLanguage(data?.stats.currentLanguage)
  const overallProgress = data?.stats.courseProgressPercent ?? computeChapterProgress(chapters)
  const currentChapter = deriveCurrentChapter(chapters, data?.nextLesson || null)
  const globalCurrentUnitId = data?.nextLesson?.unitId || deriveCurrentUnit(currentChapter, null)?.id || ''
  const globalCurrentLessonId = data?.nextLesson?.id || ''
  const completedLessonsCount =
    data?.stats.completedLessonsCount ??
    chapters.reduce((sum, chapter) => sum + chapter.units.reduce((unitSum, unit) => unitSum + unit.completedLessons, 0), 0)
  const totalLessonsCount =
    data?.stats.totalLessonsCount ??
    chapters.reduce((sum, chapter) => sum + chapter.units.reduce((unitSum, unit) => unitSum + unit.totalLessons, 0), 0)
  const languageStreakDays = data?.stats.languageStreakDays ?? data?.stats.streakDays ?? 0
  const [expandedChapterId, setExpandedChapterId] = useState(currentChapter?.id || '')
  const [expandedUnitId, setExpandedUnitId] = useState(deriveCurrentUnit(currentChapter, data?.nextLesson || null)?.id || '')

  useEffect(() => {
    if (!chapters.length) return
    if (expandedChapterId && chapters.some((chapter) => chapter.id === expandedChapterId)) return
    setExpandedChapterId(currentChapter?.id || chapters[0]?.id || '')
  }, [chapters, currentChapter?.id, expandedChapterId])

  const activeChapter = useMemo(
    () => chapters.find((chapter) => chapter.id === expandedChapterId) || currentChapter || chapters[0] || null,
    [chapters, currentChapter, expandedChapterId],
  )

  useEffect(() => {
    const nextUnit = deriveCurrentUnit(activeChapter, data?.nextLesson || null)
    if (!activeChapter?.units.length) {
      setExpandedUnitId('')
      return
    }
    if (expandedUnitId && activeChapter.units.some((unit) => unit.id === expandedUnitId)) return
    setExpandedUnitId(nextUnit?.id || activeChapter.units[0]?.id || '')
  }, [activeChapter, data?.nextLesson, expandedUnitId])

  const nextLessonHref = data?.nextLesson ? `/lesson-overview?lessonId=${data.nextLesson.id}` : '/dashboard'
  const activeUnit = activeChapter?.units.find((unit) => unit.id === expandedUnitId) || deriveCurrentUnit(activeChapter, data?.nextLesson || null)
  const dailyProgress =
    data?.stats.dailyProgressPercent ??
    (data?.stats.dailyGoalMinutes ? Math.min(100, Math.round((data.stats.todayMinutes / data.stats.dailyGoalMinutes) * 100)) : 0)

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[#fffbff] text-[#39382f]">
        <div className="mx-auto flex min-h-screen max-w-[32rem] flex-col px-6 py-8 md:py-10">
          <div className="mb-6 flex items-center justify-between rounded-full bg-[#fffdfa] px-2 py-2 shadow-sm">
            <div className="h-10 w-10 animate-pulse rounded-full bg-[#f4ebe1]" />
            <div className="h-5 w-32 animate-pulse rounded-full bg-[#f4ebe1]" />
            <div className="h-8 w-14 animate-pulse rounded-full bg-[#f4ebe1]" />
          </div>
          <div className="animate-pulse rounded-[28px] bg-[#fdf9f1] p-6 shadow-sm">
            <div className="mx-auto mb-4 h-20 w-20 rounded-2xl bg-[#ffdeac]" />
            <div className="mx-auto h-7 w-40 rounded-full bg-[#ece8db]" />
            <div className="mx-auto mt-3 h-4 w-56 rounded-full bg-[#ece8db]" />
          </div>
          <div className="relative mt-10 flex flex-1 flex-col items-center gap-8">
            <div className="absolute bottom-0 top-0 w-3 rounded-full bg-[#ece8db]" />
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className={cn('relative flex flex-col items-center', UNIT_OFFSETS[index % UNIT_OFFSETS.length])}>
                <div className="h-20 w-20 rounded-full bg-[#ece8db] shadow-[0px_8px_0px_#d6d1c3]" />
                <div className="mt-4 h-4 w-24 rounded-full bg-[#ece8db]" />
              </div>
            ))}
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#fffbff] text-[#39382f]">
      <div className="mx-auto min-h-screen max-w-[34rem] bg-[#fffbff] lg:py-6">
        <div className="lg:rounded-[32px] lg:border lg:border-white/70 lg:bg-[#fffdfa]/90 lg:shadow-[0_24px_80px_rgba(57,56,47,0.08)]">
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between bg-[#fffdfa] px-6 lg:rounded-t-[32px]">
            <Link
              href={closeHref}
              className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-[#f4ebe1]/70"
              aria-label="Close curriculum"
            >
              <MaterialIcon
                icon="close"
                className="text-[24px] text-[#af4b06]"
              />
            </Link>
            <h1 className="font-display text-[20px] font-bold tracking-tight text-[#1a1410]">
              {languageLabel} Path
            </h1>
            <div className="rounded-full bg-[#f4ebe1] px-3 py-1">
              <span className="text-sm font-bold text-[#af4b06]">
                {overallProgress}%
              </span>
            </div>
          </header>

          <div className="relative overflow-hidden px-6 pb-32 pt-4">
            <div className="pointer-events-none absolute right-0 top-1/4 hidden h-1/2 w-1 rounded-l-full bg-[#a94600]/20 md:block" />
            <div className="pointer-events-none absolute left-0 top-1/3 hidden h-1/4 w-1 rounded-r-full bg-[#865d00]/20 md:block" />

            <section className="relative mb-10 overflow-hidden rounded-3xl bg-[#fdf9f1] p-6 text-center">
              <div className="absolute right-0 top-0 -mr-8 -mt-8 h-32 w-32 rounded-full bg-[#a94600]/10 blur-2xl" />
              <div className="relative z-10">
                {/* <div className="mb-4 inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-[#ffdeac] shadow-sm">
                  <MaterialIcon icon="auto_stories" filled className="text-[40px] text-[#6e4b00]" />
                </div> */}
                <LanguageSwitcher
                  languages={data?.learnerLanguages || []}
                  activeLanguage={
                    (data?.stats.currentLanguage as Language | undefined) ||
                    undefined
                  }
                  compact
                  className="mt-5 justify-center"
                  disabled={isSwitchingLanguage}
                  onSelect={onSelectLanguage}
                />
                <div className="mt-5 flex items-center justify-center gap-3 text-xs font-bold uppercase tracking-[0.18em] text-[#66655a]">
                  {/* <span>{chapters.length} Chapters</span> */}
                  <span className="h-1 w-1 rounded-full bg-[#bcb9ad]" />
                  {/* <span>
                    {completedLessonsCount}
                    {totalLessonsCount ? ` of ${totalLessonsCount}` : ''} Lessons Complete
                  </span> */}
                </div>
                <div className="mt-5 overflow-hidden rounded-full bg-[#ece8db] p-1">
                  <div
                    className="h-2 rounded-full bg-[linear-gradient(90deg,#a94600,#ffae86)] transition-[width]"
                    style={{ width: `${Math.max(overallProgress, 6)}%` }}
                  />
                </div>
                <p className="mt-3 text-xs font-semibold text-[#66655a]">
                  Daily goal {dailyProgress}% · Language streak{" "}
                  {languageStreakDays} days · XP {data?.stats.totalXp || 0}
                </p>
              </div>
            </section>

            <div className="space-y-6">
              {chapters.map((chapter, chapterIndex) => {
                const isExpanded = chapter.id === activeChapter?.id;
                return (
                  <section
                    key={chapter.id}
                    className="rounded-[30px] bg-transparent"
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedChapterId(chapter.id)}
                      className={cn(
                        "relative w-full overflow-hidden rounded-3xl bg-[#fdf9f1] p-5 text-left shadow-sm transition-transform active:scale-[0.99]",
                        chapter.status === "locked" && "opacity-75",
                      )}
                    >
                      <div className="absolute right-0 top-0 -mr-10 -mt-10 h-28 w-28 rounded-full bg-[#a94600]/8 blur-2xl" />
                      <div className="relative flex items-start gap-4">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#ffdeac] shadow-sm">
                          <MaterialIcon
                            icon="auto_stories"
                            filled
                            className="text-[28px] text-[#6e4b00]"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#66655a]">
                                Chapter {chapterIndex + 1}
                              </p>
                              <h3 className="mt-1 font-display text-xl font-extrabold text-[#1a1410]">
                                {chapter.title}
                              </h3>
                            </div>
                            <div className="rounded-full bg-[#f4ebe1] px-3 py-1 text-sm font-bold text-[#af4b06]">
                              {chapter.progressPercent}%
                            </div>
                          </div>
                          <div className="mt-3 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[#66655a]">
                            <span>
                              {chapter.completedUnits}/{chapter.totalUnits}{" "}
                              Units
                            </span>
                            <span className="h-1 w-1 rounded-full bg-[#bcb9ad]" />
                            <span>{chapter.level}</span>
                          </div>
                        </div>
                      </div>
                    </button>

                    {isExpanded ? (
                      <div className="relative mt-6 px-1 pb-8 pt-2">
                        <div className="absolute bottom-10 left-1/2 top-0 w-4 -translate-x-1/2 overflow-hidden rounded-full bg-[#ece8db] shadow-inner">
                          <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(169,70,0,0.08)_10px,rgba(169,70,0,0.08)_20px)]" />
                          <div
                            className="absolute left-0 top-0 w-full rounded-full bg-[#a94600] shadow-[0_0_12px_rgba(169,70,0,0.35)]"
                            style={{
                              height: `${Math.max(chapter.progressPercent, 10)}%`,
                            }}
                          />
                        </div>
                        <div className="relative flex w-full flex-col items-center gap-16">
                          {chapter.units.map((unit, unitIndex) => {
                            const chapterCurrentUnitOrder =
                              chapter.id === currentChapter?.id
                                ? (chapter.units.find(
                                    (item) => item.id === globalCurrentUnitId,
                                  )?.orderIndex ?? Number.MAX_SAFE_INTEGER)
                                : Number.MAX_SAFE_INTEGER;
                            const isSelectedUnit = unit.id === activeUnit?.id;
                            const isCurrentUnit =
                              unit.id === globalCurrentUnitId &&
                              chapter.id === currentChapter?.id;
                            const isUnitCompleted = unit.progressPercent >= 100;
                            const isUnitLocked =
                              chapter.status === "locked" ||
                              (!isCurrentUnit &&
                                !isUnitCompleted &&
                                chapter.id === currentChapter?.id &&
                                unit.orderIndex > chapterCurrentUnitOrder);
                            const unitLabel = isUnitCompleted
                              ? "COMPLETED"
                              : isCurrentUnit
                                ? "CURRENT UNIT"
                                : isUnitLocked
                                  ? "LOCKED"
                                  : "OPEN";

                            const currentLessonIndex =
                              isCurrentUnit && globalCurrentLessonId
                                ? unit.lessons.findIndex(
                                    (item) => item.id === globalCurrentLessonId,
                                  )
                                : -1;
                            const unitHeight = Math.max(
                              420,
                              (unit.lessons.length - 1) * 112 + 180,
                            );

                            return (
                              <div
                                key={unit.id}
                                className="relative w-full max-w-[24rem] space-y-12"
                              >
                                <div className="flex justify-center">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setExpandedChapterId(chapter.id);
                                      if (!isUnitLocked)
                                        setExpandedUnitId(unit.id);
                                    }}
                                    className={cn(
                                      "rounded-full px-6 py-2 text-xs font-bold tracking-tight shadow-md transition-transform active:scale-[0.98]",
                                      isCurrentUnit || isSelectedUnit
                                        ? "bg-[#416f39] text-white"
                                        : isUnitLocked
                                          ? "bg-[#ece8db] text-[#66655a]"
                                          : "bg-[#416f39] text-white/95",
                                    )}
                                  >
                                    {unit.title}
                                  </button>
                                </div>

                                <div
                                  className="relative"
                                  style={{ minHeight: `${unitHeight}px` }}
                                >
                                  {unit.lessons.map((lesson, lessonIndex) => {
                                    const lessonIsCompleted =
                                      lesson.status === "completed";
                                    const lessonIsCurrent =
                                      lesson.id === globalCurrentLessonId &&
                                      isCurrentUnit;
                                    const lessonIsLocked =
                                      isUnitLocked ||
                                      (currentLessonIndex >= 0 &&
                                        lessonIndex > currentLessonIndex &&
                                        !lessonIsCompleted) ||
                                      (!isCurrentUnit && !isUnitCompleted);
                                    const lessonHref = `/lesson-overview?lessonId=${lesson.id}`;
                                    const position =
                                      getWeaverLessonPosition(lessonIndex);

                                    return (
                                      <div
                                        key={lesson.id}
                                        className="absolute left-1/2 flex flex-col items-center"
                                        style={{
                                          top: `${position.top}px`,
                                          transform:
                                            position.side === "left"
                                              ? `translateX(calc(-50% - ${position.offset}px))`
                                              : `translateX(calc(-50% + ${position.offset}px))`,
                                        }}
                                      >
                                        <Link
                                          href={
                                            lessonIsLocked ? "#" : lessonHref
                                          }
                                          className={cn(
                                            "group relative flex flex-col items-center",
                                            lessonIsLocked &&
                                              "pointer-events-none opacity-50 grayscale",
                                          )}
                                          aria-disabled={lessonIsLocked}
                                        >
                                          {lessonIsCurrent ? (
                                            <div className="absolute -right-2 -top-2 rounded-full bg-[#a94600] px-2 py-1 text-[8px] font-black uppercase tracking-[0.2em] text-white animate-bounce">
                                              Next
                                            </div>
                                          ) : null}
                                          {lessonIsCurrent ? (
                                            <div className="h-20 w-20 rounded-full border-4 border-[#a94600] bg-white p-1 shadow-xl transition-transform group-hover:scale-105">
                                              <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-[#ffdeac]">
                                                <MaterialIcon
                                                  icon="bolt"
                                                  filled
                                                  className="relative z-10 text-[30px] text-[#a94600]"
                                                />
                                                <div className="absolute inset-0 bg-[linear-gradient(90deg,#a94600_2px,transparent_2px),linear-gradient(#a94600_2px,transparent_2px)] bg-[length:24px_24px] opacity-[0.05]" />
                                              </div>
                                            </div>
                                          ) : (
                                            <div
                                              className={cn(
                                                "flex h-16 w-16 items-center justify-center rounded-full transition-transform group-hover:scale-110",
                                                lessonIsCompleted &&
                                                  "bg-[#a94600] text-white shadow-lg ring-4 ring-[#ffae86]/30",
                                                !lessonIsCompleted &&
                                                  lessonIsLocked &&
                                                  "border-2 border-dashed border-[#bcb9ad] bg-[#ece8db] text-[#838175]",
                                                !lessonIsCompleted &&
                                                  !lessonIsLocked &&
                                                  "bg-[#a94600] text-white shadow-lg ring-4 ring-[#ffae86]/30",
                                              )}
                                            >
                                              <MaterialIcon
                                                icon={
                                                  lessonIsCompleted
                                                    ? "check"
                                                    : lessonIsLocked
                                                      ? "lock"
                                                      : "play_arrow"
                                                }
                                                filled={
                                                  lessonIsCompleted ||
                                                  !lessonIsLocked
                                                }
                                                className={cn(
                                                  "text-[28px]",
                                                  !lessonIsLocked &&
                                                    !lessonIsCompleted &&
                                                    "translate-x-[1px]",
                                                )}
                                              />
                                            </div>
                                          )}
                                          <span
                                            className={cn(
                                              "mt-3 max-w-[6rem] text-center text-[10px] font-bold uppercase leading-tight tracking-[0.14em]",
                                              lessonIsCurrent
                                                ? "text-[#a94600]"
                                                : "text-[#66655a]",
                                            )}
                                          >
                                            {lesson.title}
                                          </span>
                                        </Link>
                                      </div>
                                    );
                                  })}
                                </div>

                                <div className="flex items-center justify-center gap-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[#66655a]">
                                  <span>{unitLabel}</span>
                                  <span className="h-1 w-1 rounded-full bg-[#bcb9ad]" />
                                  <span>
                                    {unit.completedLessons}/{unit.totalLessons}
                                  </span>
                                </div>
                              </div>
                            );
                          })}

                          <div className="mt-4 flex flex-col items-center">
                            <div className="flex h-24 w-24 rotate-3 items-center justify-center rounded-[26px] border-4 border-[#fffbff] bg-[#ffdeac] text-[#765100] shadow-xl">
                              <MaterialIcon
                                icon="military_tech"
                                filled
                                className="text-[44px]"
                              />
                            </div>
                            <span className="mt-5 font-display text-xs font-extrabold uppercase tracking-[0.24em] text-[#66655a]">
                              Chapter Mastery
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>
          </div>

          <div className="fixed bottom-8 left-1/2 z-40 w-full max-w-[34rem] -translate-x-1/2 px-6 lg:bottom-12">
            <Link
              href={nextLessonHref}
              className="flex w-full items-center justify-center gap-3 rounded-[28px] bg-[linear-gradient(45deg,#a94600,#ffae86)] px-6 py-5 font-display text-lg font-extrabold text-white shadow-[0px_8px_24px_rgba(169,70,0,0.25)] transition-transform active:scale-[0.97]"
            >
              {data?.nextLesson ? "CONTINUE LEARNING" : "REVIEW MASTERY"}
              <MaterialIcon icon="arrow_forward" className="text-[24px]" />
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
