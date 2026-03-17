'use client'

import Image from 'next/image'
import Link from 'next/link'
import { cn } from '@/lib/utils'

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

  const markSizes = {
    sm: 'w-[56px]',
    md: 'w-[72px]',
    lg: 'w-[92px]',
  }

  const markRadii = {
    sm: 'rounded-xl',
    md: 'rounded-2xl',
    lg: 'rounded-[20px]',
  }

  const markImageSizes = {
    sm: { width: 1408, height: 768 },
    md: { width: 1408, height: 768 },
    lg: { width: 1408, height: 768 },
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
      <div
        className={cn(
          'relative',
          markSizes[size]
        )}
      >
        <Image
          src="/logo.png"
          alt="LinguaHub logo"
          width={markImageSizes[size].width}
          height={markImageSizes[size].height}
          className={cn(
            'h-auto w-full object-contain',
            markRadii[size],
            surface === 'showcase'
              ? 'drop-shadow-[0_22px_40px_rgba(15,23,42,0.26)]'
              : 'drop-shadow-[0_10px_20px_rgba(15,23,42,0.14)]'
          )}
          priority={surface === 'showcase' || size === 'lg'}
        />
      </div>
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
          LinguaHub
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
