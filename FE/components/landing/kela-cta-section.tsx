import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { KelaMascot } from '@lesson-player/components/mascot/KelaMascot'
import { Reveal } from '@/components/landing/reveal'

export function KelaCtaSection({
  title,
  description,
  ctaHref = '/auth/signup',
  ctaLabel = 'Start Your Journey',
}: {
  title: string
  description: string
  ctaHref?: string
  ctaLabel?: string
}) {
  return (
    <section className="px-4 py-20">
      <Reveal className="relative mx-auto max-w-5xl overflow-hidden rounded-[2.4rem] bg-[#a94600] px-8 py-12 text-center text-white shadow-[0_10px_0_0_#6e2c00] md:px-14 md:text-left">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-[#ffae86]/40 blur-3xl" aria-hidden="true" />
        <div className="relative grid items-center gap-8 md:grid-cols-[1fr_auto]">
          <div className="space-y-4">
            <h2 className="font-display text-4xl font-black tracking-[-0.03em] md:text-5xl">{title}</h2>
            <p className="max-w-xl text-lg text-white/85">{description}</p>
            <Link
              href={ctaHref}
              className="kela-press mt-2 inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-white px-8 font-display text-lg font-extrabold uppercase tracking-[0.05em] text-[#a94600] shadow-[0_5px_0_0_#ffdeac] hover:bg-[#fff7ef] active:shadow-[0_2px_0_0_#ffdeac]"
            >
              {ctaLabel}
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
          <div className="kela-float mx-auto drop-shadow-[0_20px_30px_rgba(0,0,0,0.3)]">
            <KelaMascot mood="idle" size={260} interactive title="Kela. Tap to make Kela hop." className="h-auto max-w-[70vw]" />
          </div>
        </div>
      </Reveal>
    </section>
  )
}
