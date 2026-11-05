'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Sparkles } from 'lucide-react'
import { KelaMascot, type KelaMood } from '@lesson-player/components/mascot/KelaMascot'
import { cn } from '@/lib/utils'

import { GREETINGS, greetingLang } from '@/components/landing/greetings'

// Words drifting around Kela on wide screens.
const FLOATING_WORDS = [
  { word: 'ọmọ', meaning: 'child', language: 'Yorùbá', className: 'left-0 top-10', delay: '0s' },
  { word: 'Daalụ', meaning: 'thank you', language: 'Igbo', className: 'right-0 top-24', delay: '1.2s' },
  { word: 'Ruwa', meaning: 'water', language: 'Hausa', className: 'left-4 bottom-24', delay: '0.6s' },
  { word: 'Wetin dey happen?', meaning: "what's going on?", language: 'Pidgin', className: 'right-2 bottom-10', delay: '1.8s' },
]

const CYCLE_MS = 3600

export function KelaHero({
  primaryHref = '/auth/signup',
  primaryLabel = 'Start Learning',
}: {
  primaryHref?: string
  primaryLabel?: string
}) {
  const [index, setIndex] = useState(0)
  // Once a visitor picks a language, stop rotating so their choice stays put.
  const [pinned, setPinned] = useState(false)
  const [mood, setMood] = useState<KelaMood>('idle')

  useEffect(() => {
    if (pinned) return
    const interval = setInterval(() => setIndex((current) => (current + 1) % GREETINGS.length), CYCLE_MS)
    return () => clearInterval(interval)
  }, [pinned])

  // Kela winks each time it switches language.
  useEffect(() => {
    setMood('wink')
    const timeout = setTimeout(() => setMood('idle'), 1300)
    return () => clearTimeout(timeout)
  }, [index])

  const greeting = GREETINGS[index]

  return (
    <section className="relative overflow-hidden px-4 pb-16 pt-10 md:pb-24 md:pt-16">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_75%_35%,rgba(255,213,171,0.55),transparent_45%),radial-gradient(circle_at_10%_90%,rgba(185,238,171,0.35),transparent_40%)]" />

      <div className="relative mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1.05fr_1fr]">
        <div className="kela-enter order-2 space-y-7 text-center lg:order-1 lg:text-left">
          <p className="inline-flex items-center gap-2 rounded-full border border-[#ffdeac] bg-[#fff7ef] px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-[#a94600]">
            <Sparkles className="h-3.5 w-3.5" />
            Yoruba · Igbo · Hausa · Pidgin
          </p>
          <h1 className="font-display text-5xl font-black leading-[1.02] tracking-[-0.04em] text-[#191713] md:text-6xl lg:text-7xl">
            Learn African languages <span className="text-[#a94600]">with Kela</span>
          </h1>
          <p className="mx-auto max-w-xl text-lg leading-relaxed text-[#66655a] md:text-xl lg:mx-0">
            Bite-sized lessons rooted in real culture. Greetings, everyday phrases and proverbs, with a friendly elephant cheering you on.
          </p>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center lg:justify-start">
            <Link
              href={primaryHref}
              className="kela-press inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#a94600] px-8 font-display text-lg font-extrabold uppercase tracking-[0.05em] text-white shadow-[0_5px_0_0_#6e2c00] hover:brightness-110 active:shadow-[0_2px_0_0_#6e2c00] sm:w-auto"
            >
              {primaryLabel}
              <ArrowRight className="h-5 w-5" />
            </Link>
            <a
              href="#try"
              className="kela-press inline-flex h-14 w-full items-center justify-center rounded-2xl border-2 border-[#e6dccf] bg-white px-8 font-display text-base font-extrabold uppercase tracking-[0.05em] text-[#8b3900] shadow-[0_4px_0_0_#e6dccf] hover:bg-[#fff7ef] active:shadow-[0_1px_0_0_#e6dccf] sm:w-auto"
            >
              Try a quick lesson
            </a>
          </div>
        </div>

        <div className="relative order-1 flex flex-col items-center lg:order-2">
          {FLOATING_WORDS.map((item) => (
            <div
              key={item.word}
              className={cn('kela-float absolute z-0 hidden rounded-2xl border border-[#efe4d8] bg-white/90 px-4 py-2.5 shadow-[0_10px_24px_rgba(57,56,47,0.08)] xl:block', item.className)}
              style={{ animationDelay: item.delay }}
            >
              <p className="font-display text-base font-black text-[#191713]">{item.word}</p>
              <p className="text-xs font-medium text-[#8a7d70]">
                {item.language} · {item.meaning}
              </p>
            </div>
          ))}

          {/* Speech bubble: re-keyed so it pops every time the greeting changes. */}
          <div
            key={greeting.id}
            className="kela-pop relative z-10 mb-3 rounded-[1.6rem] border-2 border-[#efe4d8] bg-white px-6 py-4 text-center shadow-[0_14px_30px_rgba(57,56,47,0.1)]"
            aria-live="polite"
          >
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#a94600]">{greeting.language}</p>
            <p lang={greetingLang(greeting.id)} className="font-display text-3xl font-black text-[#191713] md:text-4xl">
              {greeting.text}
            </p>
            <p className="text-sm font-medium text-[#8a7d70]">{greeting.meaning}</p>
            <span className="absolute -bottom-3 left-1/2 h-5 w-5 -translate-x-1/2 rotate-45 border-b-2 border-r-2 border-[#efe4d8] bg-white" aria-hidden="true" />
          </div>

          <div className="relative z-10 drop-shadow-[0_24px_40px_rgba(57,56,47,0.18)]">
            <KelaMascot mood={mood} size={360} interactive title="Kela the elephant. Tap to make Kela hop." className="max-w-[80vw] h-auto" />
          </div>

          <div className="relative z-10 mt-4 flex flex-wrap justify-center gap-2" role="group" aria-label="Hear Kela greet you in">
            {GREETINGS.map((item, itemIndex) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={itemIndex === index}
                onClick={() => {
                  setPinned(true)
                  setIndex(itemIndex)
                }}
                className={cn(
                  'kela-press rounded-full border-2 px-4 py-1.5 text-sm font-bold',
                  itemIndex === index
                    ? 'border-[#a94600] bg-[#a94600] text-white shadow-[0_3px_0_0_#6e2c00]'
                    : 'border-[#e6dccf] bg-white text-[#5f5951] shadow-[0_3px_0_0_#e6dccf] hover:border-[#ffbe9b]',
                )}
              >
                {item.language}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
