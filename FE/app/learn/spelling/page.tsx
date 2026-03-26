'use client'

import Link from 'next/link'
import { ArrowRight, Mic, SpellCheck2 } from 'lucide-react'
import { LearnerHubLayout } from '@/components/learner/learner-hub-layout'
import { useLearnerAuth } from '@/components/auth/learner-auth-provider'
import { useLearnerHubOverview } from '@/hooks/use-learner-hub-overview'

const ILLUSTRATION =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBSJLUFH1PuZO_HDC5ipmEuAY-Kh5GRfoqWpdKzxi29fwLDMMhANMm0SBtNGrYKJJDU2AiMdwxtBDqE5-W1buTwq8UGKzHkxhFo1ftxYagVq-ij1BAcwKLdljp_nWOSbwO-0-MM8i68YKEAUOowLNOflSINW3Bz4fQ9IACW9I9gtRY0pPvm8uSbCvC9aTLe7DQ6Ldz7nAgYjjI4vB2iy0imeXI3NjkgnjJoBd8DBIY292h9KL6Dno3V2ya2GjAtGcyr_wLt8g_aSSD0'

export default function SpellingHubPage() {
  const { isLoading: isAuthLoading, isAuthenticated, session } = useLearnerAuth()
  const loadStats = !isAuthLoading && isAuthenticated && !session?.requiresOnboarding
  const { languageLabel, streakDays } = useLearnerHubOverview(loadStats)

  return (
    <LearnerHubLayout
      activeNav="lessons"
      languageLabel={languageLabel}
      title="Yoruba Learning"
      streakDays={streakDays}
    >
      <main className="px-6 pb-12 pt-24 lg:px-12 lg:pt-12">
        <div className="mx-auto flex max-w-4xl flex-col gap-10 lg:min-h-[calc(100vh-8rem)] lg:justify-center">
          <header className="text-center lg:text-left">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#66655a]">Spelling studio</p>
            <h1 className="mt-2 font-display text-3xl font-extrabold tracking-[-0.04em] text-[#191713] sm:text-4xl">
              Build words with confidence
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-[#66655a] lg:mx-0">
              Practice tone marks, letter order, and listening-first spelling in focused sessions—without leaving your lesson
              flow.
            </p>
          </header>

          <div className="relative overflow-hidden rounded-[2rem] border border-[#efe4d8] bg-[#fdf9f1] p-8 shadow-[0_8px_24px_rgba(57,56,47,0.06)] sm:p-12">
            <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#ffdeac]/35 blur-3xl" aria-hidden />
            <div className="relative z-10 grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
              <div className="space-y-6">
                <div className="inline-flex items-center gap-2 rounded-full bg-[#ffeddc] px-4 py-2 text-xs font-bold uppercase tracking-wide text-[#7b3400]">
                  <SpellCheck2 className="h-4 w-4" />
                  Letter & tone focus
                </div>
                <p className="text-lg font-medium leading-relaxed text-[#39382f]">
                  Open your next lesson to work spelling exercises in the immersive player—progress bar only, no dashboard
                  chrome.
                </p>
                <ul className="space-y-3 text-sm text-[#66655a]">
                  <li className="flex items-start gap-2">
                    <Mic className="mt-0.5 h-4 w-4 shrink-0 text-[#a94600]" />
                    Hear the word, then arrange tones and characters in the pool.
                  </li>
                  <li className="flex items-start gap-2">
                    <SpellCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-[#a94600]" />
                    Get instant feedback and keep momentum with gentle visuals from your curriculum.
                  </li>
                </ul>
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#a94600,#ffae86)] px-8 py-4 text-sm font-bold text-white shadow-[0_14px_26px_rgba(169,70,0,0.22)] transition-transform active:scale-[0.99]"
                >
                  Pick a lesson
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="relative mx-auto w-full max-w-sm">
                <div className="aspect-square overflow-hidden rounded-3xl border-4 border-white shadow-xl rotate-3 sm:max-w-none">
                  <img src={ILLUSTRATION} alt="" className="h-full w-full object-cover" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </LearnerHubLayout>
  )
}
