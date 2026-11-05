'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import { siteName } from '@/lib/seo'
import { KelaMascot } from '@lesson-player/components/mascot/KelaMascot'

interface LogoProps {
  href?: string | null
  variant?: 'default' | 'icon-only' | 'text-only'
  size?: 'sm' | 'md' | 'lg'
  className?: string
  surface?: 'default' | 'showcase'
}

export function Logo({
  href = '/',
  variant = 'default',
  size = 'md',
  className = '',
  surface = 'default',
}: LogoProps) {
  const wordmarkSizes = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-3xl',
  }

  // Width of the elephant mark in pixels.
  const markSizes = {
    sm: 56,
    md: 72,
    lg: 92,
  }

  const gapSizes = {
    sm: 'gap-2',
    md: 'gap-3',
    lg: 'gap-4',
  }

  const mark = (
    <div className="relative isolate">
      {surface === 'showcase' ? (
        <div className="absolute -inset-3 rounded-[28px] bg-gradient-to-r from-primary/30 via-accent/20 to-primary/25 blur-xl" />
      ) : null}
      {/* Kela blinks and flaps idly, winks on hover and hops when tapped. */}
      <KelaMascot
        mood="idle"
        size={markSizes[size]}
        interactive
        title={`${siteName} logo`}
        className={cn(
          'relative',
          surface === 'showcase'
            ? 'drop-shadow-[0_22px_40px_rgba(15,23,42,0.26)]'
            : 'drop-shadow-[0_10px_20px_rgba(15,23,42,0.14)]'
        )}
      />
    </div>
  )

  const logoContent = (
    <>
      {(variant === 'default' || variant === 'icon-only') && mark}
      {(variant === 'default' || variant === 'text-only') && (
        <span
          className={cn(
            'font-bold tracking-tight text-foreground',
            surface === 'showcase' && 'drop-shadow-sm',
            wordmarkSizes[size]
          )}
        >
          Kela
        </span>
      )}
    </>
  )

  const innerContent = (
    <div className={cn('flex items-center', gapSizes[size], className)}>
      {logoContent}
    </div>
  )

  if (href) {
    return <Link href={href}>{innerContent}</Link>
  }

  return innerContent
}
