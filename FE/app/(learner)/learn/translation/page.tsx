'use client'

import Link from 'next/link'
import { ArrowRight, BookOpen, Languages } from 'lucide-react'
import { LearnerHubLayout } from '@/components/learner/learner-hub-layout'
import { cn } from '@/lib/utils'
import { useLearnerAuth } from '@/components/auth/learner-auth-provider'
import { useLearnerHubOverview } from '@/hooks/use-learner-hub-overview'

export default function TranslationHubPage() {
  const { isLoading: isAuthLoading, isAuthenticated, session } = useLearnerAuth()
  const loadStats = !isAuthLoading && isAuthenticated && !session?.requiresOnboarding
  const { languageLabel, streakDays } = useLearnerHubOverview(loadStats)

  return (
    <LearnerHubLayout
      activeNav="learn"
      languageLabel={languageLabel}
      title="Yoruba Learning"
      streakDays={streakDays}
    >
      <main className="relative min-h-[calc(100vh-6rem)] px-6 pb-28 pt-24 lg:px-12 lg:pt-12">
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.07]">
          <Languages className="h-[min(80vw,28rem)] w-[min(80vw,28rem)] text-[#a94600]" strokeWidth={0.75} />
        </div>

        <div className="relative z-10 mx-auto grid max-w-5xl gap-10 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-7">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#66655a]">Translation lab</p>
            <h1 className="mt-3 font-display text-3xl font-extrabold tracking-[-0.04em] text-[#191713] sm:text-5xl sm:leading-tight">
              From phrase to meaning—<span className="text-[#a94600]">clearly</span>.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-[#66655a]">
              Multiple-choice and listening translations run in the lesson player with the same calm header as your matching
              and speaking drills: close control, lesson progress, no extra tabs.
            </p>

            <div className="mt-10 flex flex-wrap gap-4">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#a94600,#ffae86)] px-8 py-4 text-sm font-bold text-white shadow-[0_14px_26px_rgba(169,70,0,0.22)]"
              >
                <BookOpen className="h-4 w-4" />
                Go to lessons
              </Link>
              <Link
                href="/learn/word-focus"
                className="inline-flex items-center gap-2 rounded-2xl border border-[#efe4d8] bg-white/90 px-6 py-4 text-sm font-bold text-[#7b3400]"
              >
                Word focus
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="rounded-[2rem] bg-[#fdf9f1] p-8 shadow-[0_8px_24px_rgba(57,56,47,0.06)] ring-1 ring-[#efe4d8]">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-[#a94600]">Preview</p>
              <p className="mt-4 font-display text-2xl font-extrabold text-[#191713]">
                What is <span className="italic text-[#a94600]">Káàárọ̀</span> in English?
              </p>
              <div className="mt-6 grid gap-3">
                {['Good evening', 'Good morning', 'Good afternoon'].map((opt, i) => (
                  <div
                    key={opt}
                    className={cn(
                      'rounded-2xl border-2 px-5 py-4 text-sm font-bold',
                      i === 1 ? 'border-[#ffae86] bg-[#ffeddc] text-[#692900]' : 'border-transparent bg-white text-[#39382f]',
                    )}
                  >
                    <span className="mr-3 inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[#ece8db] text-xs">
                      {String.fromCharCode(65 + i)}
                    </span>
                    {opt}
                  </div>
                ))}
              </div>
              <p className="mt-6 text-xs italic text-[#8a7d70]">Actual prompts and audio come from your enrolled lesson flow.</p>
            </div>
          </div>
        </div>
      </main>
    </LearnerHubLayout>
  )
}
