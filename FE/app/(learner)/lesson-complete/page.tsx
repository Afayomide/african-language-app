'use client'

import { Suspense, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Flame, Gift, TrendingUp, RotateCcw } from 'lucide-react'
import { KelaMascot } from '@lesson-player/components/mascot/KelaMascot'
import { MotionStyles } from '@lesson-player/motion'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { learnerLessonService } from '@/services'
import { invalidateLearnerOverview } from '@/hooks/queries/learner-overview'
import {
  prefetchLessonFlow,
  prefetchLessonOverview,
  useLearnerNextLessonQuery,
} from '@/hooks/queries/learner-lessons'
import { getCulturalSoundPath } from '@/lib/culturalSounds'


const CONFETTI_COLORS = ['#a94600', '#ffae86', '#2d7c37', '#f59e0b', '#c8693f', '#57a764', '#ffdeac']

/** A fixed, seeded spread of confetti so the server and client render the same pieces. */
function Confetti({ count = 70 }: { count?: number }) {
  const pieces = useMemo(() => {
    let seed = 7
    const next = () => {
      seed = (seed * 9301 + 49297) % 233280
      return seed / 233280
    }
    return Array.from({ length: count }, (_, index) => ({
      left: `${next() * 100}%`,
      color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
      drift: `${(next() - 0.5) * 220}px`,
      spin: `${360 + next() * 720}deg`,
      duration: `${2.2 + next() * 1.8}s`,
      delay: `${next() * 0.9}s`,
      round: next() > 0.6,
    }))
  }, [count])

  return (
    <div className="kela-confetti" aria-hidden="true">
      {pieces.map((piece, index) => (
        <span
          key={index}
          style={
            {
              left: piece.left,
              background: piece.color,
              borderRadius: piece.round ? '999px' : '3px',
              '--kx': piece.drift,
              '--kr': piece.spin,
              '--kd': piece.duration,
              '--kdelay': piece.delay,
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}

/** Counts from 0 to `target` after `delayMs`, easing out. Jumps straight there for reduced motion. */
function useCountUp(target: number, delayMs = 0, durationMs = 900) {
  const [value, setValue] = useState(0)

  useEffect(() => {
    const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduced || target <= 0) {
      setValue(target)
      return
    }
    let frame = 0
    let start = 0
    const timeout = setTimeout(() => {
      const tick = (now: number) => {
        if (!start) start = now
        const t = Math.min(1, (now - start) / durationMs)
        setValue(Math.round(target * (1 - Math.pow(1 - t, 3))))
        if (t < 1) frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    }, delayMs)
    return () => {
      clearTimeout(timeout)
      cancelAnimationFrame(frame)
    }
  }, [delayMs, durationMs, target])

  return value
}

function StatTile({
  label,
  value,
  icon,
  tone,
  index,
}: {
  label: string
  value: string
  icon: React.ReactNode
  tone: { border: string; band: string; text: string }
  index: number
}) {
  return (
    <div
      className="overflow-hidden rounded-2xl border-2 bg-white text-center"
      style={{ borderColor: tone.border, '--i': index } as CSSProperties}
    >
      <p className="px-2 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-white" style={{ background: tone.band }}>
        {label}
      </p>
      <div className="flex items-center justify-center gap-1.5 px-2 py-4">
        <span style={{ color: tone.text }}>{icon}</span>
        <span className="font-display text-2xl font-black tabular-nums sm:text-3xl" style={{ color: tone.text }}>
          {value}
        </span>
      </div>
    </div>
  )
}

type NextLesson = {
  id: string
  title: string
  kind?: 'core' | 'review'
}

function LessonCompleteContent() {
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const lessonId = searchParams.get("lessonId")
  const language = searchParams.get("language")
  const requestedXp = Number(searchParams.get("xpEarned") || 50)
  const initialXp = Number.isFinite(requestedXp) && requestedXp > 0 ? requestedXp : 50
  const [xpEarned, setXpEarned] = useState(initialXp)
  const [currentStreak, setCurrentStreak] = useState(0)
  const [totalXp, setTotalXp] = useState(0)
  const nextLessonQuery = useLearnerNextLessonQuery(Boolean(lessonId))
  const nextLesson = (nextLessonQuery.data?.lesson as NextLesson | undefined) || null

  useEffect(() => {
    const lessonCompleteSound = getCulturalSoundPath(language, 'celebration')
    const preloadAudio = new Audio(lessonCompleteSound)
    preloadAudio.preload = 'auto'
    preloadAudio.load()

    const audio = new Audio(lessonCompleteSound)
    audio.volume = 0.4
    audio.play().catch(() => {})

    if (!lessonId) return
    learnerLessonService
      .completeLesson(lessonId, { xpEarned: initialXp, minutesSpent: 10 })
      .then(async (payload) => {
        setXpEarned(payload.xpEarned || initialXp)
        if (payload.learnerStats) {
          setCurrentStreak(payload.learnerStats.currentStreak || 0)
          setTotalXp(payload.learnerStats.totalXp || 0)
        }
        await invalidateLearnerOverview(queryClient)
      })
      .catch((error) => console.error("Failed to complete lesson", error))
  }, [initialXp, language, lessonId, queryClient])

  useEffect(() => {
    if (!nextLesson?.id) return
    if (nextLesson.kind === 'review') {
      void prefetchLessonOverview(queryClient, nextLesson.id)
      void prefetchLessonFlow(queryClient, nextLesson.id)
    }
  }, [nextLesson?.id, nextLesson?.kind, queryClient])

  const shownXp = useCountUp(xpEarned, 700)
  const shownStreak = useCountUp(currentStreak, 850, 600)
  const shownTotalXp = useCountUp(totalXp, 1000, 1100)

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#fffbff] px-4 py-10">
      <MotionStyles />
      <Confetti />
      <div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-[#ffdeac]/60 blur-3xl" />

      <div className="relative w-full max-w-md space-y-7">
        <div className="kela-pop flex justify-center">
          <KelaMascot mood="celebrate" size={220} title="Kela celebrating" />
        </div>

        <div className="kela-enter space-y-2 text-center" style={{ animationDelay: '150ms' }}>
          <h1 className="font-display text-4xl font-black tracking-[-0.03em] text-[#a94600]">Lesson complete!</h1>
          <p className="text-base font-medium text-[#66655a]">Amazing work! You&apos;re building skills with every lesson.</p>
        </div>

        <div className="kela-stagger grid grid-cols-3 gap-3" style={{ '--kela-stagger-base': '350ms' } as CSSProperties}>
          <StatTile
            index={0}
            label="XP earned"
            value={`+${shownXp}`}
            icon={<Gift className="h-5 w-5" />}
            tone={{ border: '#ffbe9b', band: '#a94600', text: '#a94600' }}
          />
          <StatTile
            index={1}
            label="Streak"
            value={`${shownStreak}`}
            icon={<Flame className="h-5 w-5" />}
            tone={{ border: '#fcd38d', band: '#e8890c', text: '#c96f00' }}
          />
          <StatTile
            index={2}
            label="Total XP"
            value={`${shownTotalXp}`}
            icon={<TrendingUp className="h-5 w-5" />}
            tone={{ border: '#b9e4bf', band: '#2d7c37', text: '#2d7c37' }}
          />
        </div>

        <div className="kela-enter rounded-2xl border-2 border-[#ffdeac] bg-[#fff7ef] p-4 text-center" style={{ animationDelay: '700ms' }}>
          <p className="text-[#39382f]">
            <span className="font-display font-black text-[#a94600]">Next lesson unlocked!</span>
            <br />
            <span className="text-sm text-[#66655a]">Come back tomorrow to learn more.</span>
          </p>
        </div>

        <div className="kela-enter space-y-3" style={{ animationDelay: '850ms' }}>
          <Link
            href="/dashboard"
            className="kela-press flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#a94600] font-display text-lg font-extrabold uppercase tracking-[0.05em] text-white shadow-[0_5px_0_0_#6e2c00] active:shadow-[0_2px_0_0_#6e2c00]"
          >
            Back to Dashboard
            <ArrowRight className="h-5 w-5" />
          </Link>

          {nextLesson?.kind === 'review' ? (
            <Link
              href={`/lesson-overview?lessonId=${nextLesson.id}`}
              className="kela-press flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-[#e6dccf] bg-white font-display text-base font-extrabold uppercase tracking-[0.05em] text-[#8b3900] shadow-[0_4px_0_0_#e6dccf] active:shadow-[0_1px_0_0_#e6dccf]"
            >
              <RotateCcw className="h-4 w-4" />
              Review Mistakes
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-[#efe9df] bg-white font-display text-base font-extrabold uppercase tracking-[0.05em] text-[#b0a498]"
            >
              <RotateCcw className="h-4 w-4" />
              Review Mistakes
            </button>
          )}
        </div>

        <p className="kela-fade text-center text-sm text-[#8a7d70]" style={{ animationDelay: '1100ms' }}>
          &ldquo;Language learning is a marathon, not a sprint. You&apos;re doing great!&rdquo;
        </p>
      </div>
    </main>
  )
}

export default function LessonCompleteScreen() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-background" />}>
      <LessonCompleteContent />
    </Suspense>
  )
}
