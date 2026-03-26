'use client'

import Link from 'next/link'
import { ArrowRight, BookOpen, GraduationCap, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const TEXTILE_IMAGE =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDVDH70G3jk7MMZ3ZAhtbhTiovfEw8HzvPUFgBHOm-6xXya8P6It2PETQIrZrvVa5VIUcLqUgJhuRW7LYFlbWBs96FeVGu7F0aYX1AugRr6s0gViyd1wifi3i89uHVKvjKG5JXkNawYp53Xs1SrZ5DNxZ0gxhVLm4HSKinSKx7er2hyUmtDMAGQc4KawyEGCyi5GWyDNoTGNXRAP-HN1kR8_n-MtlGPWWFbFr_OhGKgxhKkdhZTLHbEhQVzZBZDAZ-HL52N7cVfcDXO'

type LessonFocusAction = {
  href?: string
  label: string
  variant?: 'primary' | 'secondary'
  onClick?: () => void
  disabled?: boolean
}

type LessonFocusProverb = {
  eyebrow?: string
  text: string
  translation?: string
}

export function LessonFocusScreen({
  mode,
  progress = 75,
  title,
  subtitle,
  closeHref,
  onClose,
  proverb,
  primaryAction,
  secondaryAction,
}: {
  mode: 'loading' | 'overview'
  progress?: number
  title: string
  subtitle: string
  closeHref?: string
  onClose?: () => void
  proverb?: LessonFocusProverb
  primaryAction?: LessonFocusAction
  secondaryAction?: LessonFocusAction
}) {
  const safeProgress = Math.min(100, Math.max(0, Math.round(progress)))
  const radius = 90
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference - (safeProgress / 100) * circumference
  const icon = <GraduationCap className="h-12 w-12" />
  const headerLabel = mode === 'overview' ? 'Overview' : 'Loading'
  const proverbEyebrow = proverb?.eyebrow || 'Proverb'

  const closeButton = (
    <button
      type="button"
      onClick={onClose}
      className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-[#f4ebe1]/70"
      aria-label={mode === 'overview' ? 'Close lesson overview' : 'Close loading screen'}
    >
      <X className="h-5 w-5 text-[#AF4B06]" />
    </button>
  )

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[#fffbff] text-[#39382f]">
      <header className="fixed left-0 right-0 top-0 z-50 flex h-16 items-center justify-between bg-[#fffdfa] px-6">
        <div className="flex items-center gap-4">
          {onClose ? (
            closeButton
          ) : (
            <Link href={closeHref || '/dashboard'} aria-label="Close">
              {closeButton}
            </Link>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#8c7662]">{headerLabel}</span>
          <div className="h-1.5 w-12 overflow-hidden rounded-full bg-[#ece8db]">
            <div
              className="h-full rounded-full bg-[#a94600] transition-all duration-700"
              style={{ width: `${Math.max(12, safeProgress)}%` }}
            />
          </div>
          <span className="ml-2 font-bold text-[#1a1410]">{safeProgress}%</span>
        </div>
      </header>

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.03]">
        <svg className="text-[#a94600]" fill="currentColor" height="400" viewBox="0 0 100 100" width="400">
          <path d="M50 0 L60 40 L100 50 L60 60 L50 100 L40 60 L0 50 L40 40 Z" />
        </svg>
      </div>

      <section className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 pb-12 pt-20">
        <div className="w-full max-w-md text-center">
          <div className="relative mx-auto mb-8 flex h-44 w-44 items-center justify-center">
            <div className="absolute inset-0 rounded-full border-[6px] border-[#f1eee2]" />
            <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 192 192">
              <circle
                cx="96"
                cy="96"
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="6"
                className="text-[#a94600] transition-all duration-700"
                style={{ strokeDasharray: circumference, strokeDashoffset: dashOffset }}
              />
            </svg>
            <div
              className={cn(
                'relative flex h-28 w-28 items-center justify-center rounded-full bg-[#fdf9f1] shadow-sm',
                mode === 'loading' && 'animate-pulse',
              )}
            >
              <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#a94600]/10 to-transparent" />
              <div className="relative text-[#a94600]">{icon}</div>
            </div>
          </div>

          <div className="space-y-3">
            <h1 className="font-display text-[1.8rem] font-bold tracking-tight text-[#191713]">{title}</h1>
            <p className="mx-auto max-w-sm text-base leading-relaxed text-[#66655a]">{subtitle}</p>
          </div>

          {primaryAction || secondaryAction ? (
            <div className="mt-8 space-y-3">
              {primaryAction ? primaryAction.href ? (
                <Link
                  href={primaryAction.href}
                  className="flex h-16 w-full items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#a94600,#ffae86)] px-6 font-display text-lg font-extrabold text-white shadow-[0_10px_24px_rgba(169,70,0,0.2)] transition-transform active:translate-y-0.5"
                >
                  {primaryAction.label}
                  <ArrowRight className="h-5 w-5" />
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={primaryAction.onClick}
                  disabled={primaryAction.disabled}
                  className="flex h-16 w-full items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#a94600,#ffae86)] px-6 font-display text-lg font-extrabold text-white shadow-[0_10px_24px_rgba(169,70,0,0.2)] transition-transform active:translate-y-0.5 disabled:opacity-60"
                >
                  {primaryAction.label}
                  <ArrowRight className="h-5 w-5" />
                </button>
              ) : null}

              {secondaryAction ? secondaryAction.href ? (
                <Link
                  href={secondaryAction.href}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-[#e4d6c3] bg-white/90 px-6 text-sm font-black uppercase tracking-[0.12em] text-[#a94600] shadow-[0_10px_20px_rgba(57,56,47,0.04)] transition-colors hover:bg-[#fff7ef]"
                >
                  <BookOpen className="h-4 w-4" />
                  {secondaryAction.label}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={secondaryAction.onClick}
                  disabled={secondaryAction.disabled}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-[#e4d6c3] bg-white/90 px-6 text-sm font-black uppercase tracking-[0.12em] text-[#a94600] shadow-[0_10px_20px_rgba(57,56,47,0.04)] transition-colors hover:bg-[#fff7ef] disabled:opacity-60"
                >
                  <BookOpen className="h-4 w-4" />
                  {secondaryAction.label}
                </button>
              ) : null}
            </div>
          ) : null}

          {proverb ? (
            <div className="relative mt-8 rounded-[1.75rem] bg-[#fdf9f1] p-5 text-left shadow-[0_12px_30px_rgba(57,56,47,0.05)]">
              <div className="absolute -top-3 left-6 rounded-full bg-[#ffdeac] px-3 py-1 shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#6e4b00]">{proverbEyebrow}</span>
              </div>
              <div className="flex items-start gap-4">
                <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ffae86]/30 text-[#a94600]">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-base italic leading-snug text-[#39382f]">{proverb.text}</p>
                  {proverb.translation ? (
                    <p className="mt-2 text-sm leading-relaxed text-[#66655a]">{proverb.translation}</p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <div className="pointer-events-none absolute bottom-0 left-0 h-32 w-full opacity-20">
        <img
          className="h-full w-full object-cover"
          alt="Decorative woven textile"
          src={TEXTILE_IMAGE}
          style={{ maskImage: 'linear-gradient(to top, black, transparent)' }}
        />
      </div>
    </main>
  )
}
