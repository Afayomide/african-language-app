'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { KelaMascot, type KelaMood } from '@lesson-player/components/mascot/KelaMascot'
import { MotionStyles } from '@lesson-player/motion'
import { GREETINGS, greetingLang } from '@/components/landing/greetings'

const CYCLE_MS = 3200

/**
 * The first screen of the mobile app: Kela, one line about the app, and two big buttons.
 * Laid out like a native welcome screen rather than a web page: full height, nothing to
 * scroll, buttons anchored at the bottom, and clear of the notch and home bar.
 */
export function AppWelcome() {
  const [index, setIndex] = useState(0)
  const [mood, setMood] = useState<KelaMood>('idle')

  useEffect(() => {
    const interval = setInterval(() => setIndex((current) => (current + 1) % GREETINGS.length), CYCLE_MS)
    return () => clearInterval(interval)
  }, [])

  // Kela winks each time it switches language.
  useEffect(() => {
    setMood('wink')
    const timeout = setTimeout(() => setMood('idle'), 1300)
    return () => clearTimeout(timeout)
  }, [index])

  const greeting = GREETINGS[index]

  return (
    <main
      className="relative flex h-[100dvh] flex-col overflow-hidden bg-[#fffbff] px-6 select-none"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.25rem)',
      }}
    >
      <MotionStyles />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(255,213,171,0.6),transparent_55%),radial-gradient(circle_at_15%_95%,rgba(185,238,171,0.35),transparent_45%)]" />

      <div className="relative flex flex-1 flex-col items-center justify-center text-center">
        <div
          key={greeting.id}
          className="kela-pop relative mb-4 rounded-[1.5rem] border-2 border-[#efe4d8] bg-white px-6 py-3 shadow-[0_12px_28px_rgba(57,56,47,0.1)]"
          aria-live="polite"
        >
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#a94600]">{greeting.language}</p>
          <p lang={greetingLang(greeting.id)} className="font-display text-3xl font-black text-[#191713]">
            {greeting.text}
          </p>
          <p className="text-xs font-medium text-[#8a7d70]">{greeting.meaning}</p>
          <span className="absolute -bottom-2.5 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 border-b-2 border-r-2 border-[#efe4d8] bg-white" aria-hidden="true" />
        </div>

        <div className="kela-pop drop-shadow-[0_22px_36px_rgba(57,56,47,0.2)]" style={{ animationDelay: '120ms' }}>
          <KelaMascot mood={mood} size={300} interactive title="Kela the elephant. Tap to make Kela hop." className="h-auto max-w-[78vw]" />
        </div>

        <h1 className="kela-enter mt-6 font-display text-5xl font-black tracking-[-0.04em] text-[#a94600]" style={{ animationDelay: '220ms' }}>
          Kela
        </h1>
        <p className="kela-enter mt-2 max-w-xs text-lg font-medium leading-snug text-[#5f5951]" style={{ animationDelay: '300ms' }}>
          Learn Yoruba, Igbo and Hausa, one small lesson at a time.
        </p>
      </div>

      <div className="kela-slide-up relative space-y-3" style={{ animationDelay: '380ms' }}>
        <Link
          href="/auth/signup"
          className="kela-press flex h-14 w-full items-center justify-center rounded-2xl bg-[#a94600] font-display text-lg font-extrabold uppercase tracking-[0.05em] text-white shadow-[0_5px_0_0_#6e2c00] active:shadow-[0_2px_0_0_#6e2c00]"
        >
          Get started
        </Link>
        <Link
          href="/auth/login"
          className="kela-press flex h-14 w-full items-center justify-center rounded-2xl border-2 border-[#e6dccf] bg-white font-display text-base font-extrabold uppercase tracking-[0.05em] text-[#8b3900] shadow-[0_4px_0_0_#e6dccf] active:shadow-[0_1px_0_0_#e6dccf]"
        >
          I already have an account
        </Link>
      </div>
    </main>
  )
}
