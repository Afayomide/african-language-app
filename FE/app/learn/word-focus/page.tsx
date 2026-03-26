'use client'

import Link from 'next/link'
import { ArrowRight, Star, Volume2 } from 'lucide-react'
import { LearnerHubLayout } from '@/components/learner/learner-hub-layout'
import { useLearnerAuth } from '@/components/auth/learner-auth-provider'
import { useLearnerHubOverview } from '@/hooks/use-learner-hub-overview'
import { cn } from '@/lib/utils'

const SUNRISE_IMG =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBqF08U8tBReYC-NbmzpMUdz5Z9vS9fKFr1nVBSGqyWALHyUybj5bLqOqLSjfAI2vWfzkDav83PycWP_DHtHa77U97Wx0G7-xHTmO6ybebxGNW2-mvGTZ-Go5Djoe9gft6kNOePsNxLElQ_Nl6R8dR9gKy6Al3Q7cXtg96021DwaGiz7YKl8BXzoG8D2XLtst5KVl4mfdFNkC4rtj5I5OWjrxaNKCplpExyZICzkxVQrEkCV9IhDgTjcaH77MfGis0-W5dWm3Mb9deK'

const TAGS = ['Greetings', 'Casual', 'Sunrise', 'Core vocab']

export default function WordFocusHubPage() {
  const { isLoading: isAuthLoading, isAuthenticated, session } = useLearnerAuth()
  const loadStats = !isAuthLoading && isAuthenticated && !session?.requiresOnboarding
  const { languageLabel, streakDays } = useLearnerHubOverview(loadStats)

  return (
    <LearnerHubLayout
      activeNav="vocabulary"
      languageLabel={languageLabel}
      title="Yoruba Learning"
      headerProgressPercent={66}
      streakDays={streakDays}
    >
      <main className="px-6 pb-28 pt-24 lg:px-12 lg:pb-16 lg:pt-10">
        <div className="mx-auto grid max-w-4xl gap-10 lg:grid-cols-12 lg:items-center">
          <div className="space-y-8 lg:col-span-7">
            <div>
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#a94600]">Word focus</span>
              <h1 className="mt-2 font-display text-5xl font-extrabold tracking-tight text-[#191713] sm:text-7xl sm:leading-[0.95]">
                Káàárọ̀
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                className="flex h-16 w-16 items-center justify-center rounded-full bg-[linear-gradient(135deg,#a94600,#ffae86)] text-white shadow-lg shadow-[#a94600]/25 transition-transform hover:scale-105 active:scale-95"
                aria-label="Play sample audio"
              >
                <Volume2 className="h-7 w-7" />
              </button>
              <button
                type="button"
                className="hidden h-14 w-14 items-center justify-center rounded-full bg-[#ece8db] text-[#a94600] transition-colors hover:bg-[#e0d8cc] sm:flex"
                aria-label="Slow audio"
              >
                <span className="text-xs font-bold">½</span>
              </button>
              <span className="font-display text-sm font-medium italic text-[#66655a]">Casual morning greeting</span>
            </div>

            <div className="rounded-3xl border-l-4 border-[#a94600] bg-[#fdf9f1] p-8">
              <p className="text-sm font-bold uppercase tracking-widest text-[#66655a]">Translation</p>
              <p className="mt-2 font-display text-2xl font-bold text-[#191713] sm:text-3xl">
                Good morning <span className="text-lg font-medium text-[#a94600]/70">(casual)</span>
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              {TAGS.map((tag, i) => (
                <span
                  key={tag}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold transition-colors',
                    i === 3
                      ? 'bg-[#ffdeac] text-[#6e4b00] shadow-md ring-2 ring-[#ffdeac]'
                      : 'bg-[#ece8db] text-[#39382f] hover:bg-[#ffeddc]',
                  )}
                >
                  {i === 3 ? <Star className="h-4 w-4 fill-current" /> : null}
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="relative lg:col-span-5">
            <div className="absolute -right-2 -top-2 z-10 -rotate-6 rounded-full bg-[#ffdeac] px-5 py-2.5 text-xs font-bold text-[#6e4b00] shadow-md">
              Tones matter — practice in-lesson
            </div>
            <div className="relative aspect-[4/5] overflow-hidden rounded-[2rem] border-8 border-white shadow-xl rotate-2 transition-transform hover:rotate-0">
              <img src={SUNRISE_IMG} alt="Warm sunrise over the coast" className="h-full w-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent p-6 text-white">
                <p className="font-bold text-lg">Morning in Yorubaland</p>
                <p className="text-sm text-white/85">Used with family and friends after sunrise.</p>
              </div>
            </div>
          </div>
        </div>

        <footer className="mx-auto mt-14 flex max-w-4xl flex-col gap-4 border-t border-[#efe4d8] pt-8 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/learn/translation" className="text-sm font-bold uppercase tracking-wide text-[#66655a] hover:text-[#a94600]">
            Translation lab →
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#a94600,#ffae86)] px-10 py-4 text-center text-sm font-bold uppercase tracking-widest text-white shadow-lg"
          >
            Continue path
            <ArrowRight className="h-4 w-4" />
          </Link>
        </footer>
      </main>
    </LearnerHubLayout>
  )
}
