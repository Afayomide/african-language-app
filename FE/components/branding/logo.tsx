'use client'

import Link from 'next/link'

interface LogoProps {
  href?: string
  variant?: 'default' | 'icon-only' | 'text-only'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function Logo({
  href = '/',
  variant = 'default',
  size = 'md',
  className = '',
}: LogoProps) {
  const sizeClasses = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-3xl',
  }

  const iconSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  }

  const logoContent = (
    <>
      {(variant === 'default' || variant === 'icon-only') && (
        <div className="rounded-lg bg-primary p-2">
          <span className={`font-black text-primary-foreground ${iconSizeClasses[size]}`}>
            LH
          </span>
        </div>
      )}
      {(variant === 'default' || variant === 'text-only') && (
        <span className={`font-bold text-primary ${sizeClasses[size]}`}>
          LinguaHub
        </span>
      )}
    </>
  )

  const innerContent = (
    <div className={`flex items-center gap-2 ${className}`}>
      {logoContent}
    </div>
  )

  if (href) {
    return <Link href={href}>{innerContent}</Link>
  }

  return innerContent
}
